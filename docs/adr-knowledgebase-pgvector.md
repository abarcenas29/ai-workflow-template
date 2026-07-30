# ADR-001: Centralized Knowledgebase Architecture — PostgreSQL + pgvector

**Status:** Accepted  
**Date:** 2026-07-29  
**Author:** Architect — System Design  
**Supersedes:** `docs/spike-vector-db-memory.md` (prior spike, sqlite-vec local index)  
**Informed by:** `docs/spike-centralized-knowledgebase-pgvector.md` (comprehensive research)

---

## Table of Contents

1. [Context](#context)
2. [Architecture Overview](#1-architecture-overview)
3. [Database Schema](#2-database-schema)
4. [Module Design](#3-module-design)
5. [Connection Strategy](#4-connection-strategy)
6. [MCP Interface Design](#5-mcp-interface-design)
7. [Chunking & Embedding Pipeline](#6-chunking--embedding-pipeline)
8. [Setup Integration](#7-setup-integration)
9. [Git Hook Design](#8-git-hook-design)
10. [Agent Instruction Design](#9-agent-instruction-design)
11. [Security Considerations](#10-security-considerations)

---

## Context

The project currently has a **two-tier knowledge architecture**: (1) git-committed markdown files as the source of truth, and (2) a local SQLite + sqlite-vec vector index (`memory-bank/.index/memory.db`) for semantic search within a single project. The prior spike (`spike-vector-db-memory.md`, 2026-07-23) flagged PostgreSQL + pgvector as the "upgrade when 5+ concurrent contributors" path for cross-project knowledge sharing.

The `learned-knowledge.instructions.md` file accumulates agent-discovered patterns, conventions, gotchas, and tuning notes across pipeline sessions. Currently, this knowledge is trapped inside a single project's filesystem. The goal is to make it **queryable across projects** via a centralized PostgreSQL + pgvector database, exposed to AI agents through an MCP server.

### Key Constraints (from research spike)

| ID | Constraint |
|----|------------|
| CON-01 | PostgreSQL + pgvector is an **external service** — not embedded (unlike SQLite). Consumer projects need a running instance. |
| CON-02 | The knowledgebase is **optional** — no consumer project should break or show errors if `DATABASE_URL` is not configured. |
| CON-03 | The project is **ESM only** (`"type": "module"` in package.json). All new scripts use `import`/`export`. |
| CON-04 | `@xenova/transformers` + `all-MiniLM-L6-v2` (384d) is already an optional dependency. Reuse this embedding pipeline. |
| CON-05 | `@modelcontextprotocol/sdk` v1.0.0 is already a runtime dependency. Zero new MCP framework dependencies. |
| CON-06 | `dotenv` is already a devDependency. No new `.env` loading library needed. |
| CON-07 | The `pg` + `pgvector` npm packages must be added as optional dependencies (matching the `@xenova/transformers` pattern). |

---

## 1. Architecture Overview

### System Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           DATA WRITE FLOW                                     │
│                                                                               │
│  Consumer Project                     Template Package                        │
│  ┌────────────────────┐              ┌──────────────────────────┐             │
│  │ Agent completes    │              │                          │             │
│  │ task → appends to  │              │                          │             │
│  │ learned-knowledge  │              │                          │             │
│  │ .instructions.md   │              │                          │             │
│  └─────────┬──────────┘              │                          │             │
│            │ git commit              │                          │             │
│            ▼                         │                          │             │
│  ┌────────────────────┐              │                          │             │
│  │ .husky/post-commit │──────────────┤  detects file change     │             │
│  │ (git hook)         │              │                          │             │
│  └─────────┬──────────┘              │                          │             │
│            │ spawns                  │                          │             │
│            ▼                         │                          │             │
│  ┌────────────────────┐     ┌────────┴───────────────┐          │             │
│  │ knowledgebase-     │────▶│ knowledgebase-index.js │          │             │
│  │ cli.js sync        │     │ (core engine)          │          │             │
│  └────────────────────┘     └───────────┬────────────┘          │             │
│                                         │                       │             │
│  ┌────────────────────┐                 │                       │             │
│  │ npx ai-workflow-   │                 │                       │             │
│  │ setup (Phase 6)    │────────────────┤                       │             │
│  └────────────────────┘                 │                       │             │
│                                         │                       │             │
│                              ┌──────────▼───────────┐           │             │
│                              │  @xenova/transformers │           │             │
│                              │  all-MiniLM-L6-v2     │           │             │
│                              │  (384d embeddings)    │           │             │
│                              └──────────┬───────────┘           │             │
│                                         │                       │             │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                            ┌─────────────▼──────────────┐
                            │   PostgreSQL + pgvector     │
                            │   ┌──────────────────────┐ │
                            │   │ projects             │ │
                            │   │ knowledge_chunks     │ │
                            │   │ (HNSW index on       │ │
                            │   │  embedding col)      │ │
                            │   └──────────────────────┘ │
                            └─────────────┬──────────────┘
                                          │
┌─────────────────────────────────────────┼─────────────────────────────────────┐
│                          DATA READ FLOW                                       │
│                                                                               │
│  OpenCode Session                                                            │
│  ┌────────────────────┐                                                       │
│  │ AI Agent           │                                                       │
│  │ (implementer,      │                                                       │
│  │  coder, etc.)      │                                                       │
│  └─────────┬──────────┘                                                       │
│            │ calls MCP tools                                                  │
│            ▼                                                                  │
│  ┌─────────────────────────────┐                                              │
│  │ mcp-knowledgebase-server.js │     ┌─────────────────────┐                  │
│  │ (stdio transport)           │────▶│ knowledgebase-index │                  │
│  │                             │     │ .js (search fn)     │                  │
│  │ Tools: search, index,       │     └──────────┬──────────┘                  │
│  │        stats, list          │                │                             │
│  └─────────────────────────────┘     ┌──────────▼──────────┐                  │
│                                      │  pg.Pool             │                  │
│                                      │  (max: 5 conns)      │                  │
│                                      └──────────┬──────────┘                  │
│                                                 │                             │
│                                                 ▼                             │
│                                      ┌─────────────────────┐                  │
│                                      │  PostgreSQL          │                  │
│                                      │  (same instance as   │                  │
│                                      │   write path)        │                  │
│                                      └─────────────────────┘                  │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Three-Layer Knowledge System

This ADR adds a **third layer** to the existing two-layer architecture:

```
┌───────────────────────────────────────────────────────────────────┐
│ LAYER 3: Centralized Knowledgebase (PostgreSQL + pgvector)  ← NEW │
│ • Cross-project learned knowledge                                  │
│ • Optional — requires DATABASE_URL                                 │
│ • Accessed via knowledgebase MCP server tools                      │
│ • Populated by post-commit git hook + setup Phase 6                │
├───────────────────────────────────────────────────────────────────┤
│ LAYER 2: Local Memory Bank (SQLite + sqlite-vec) — EXISTING        │
│ • Per-project memory (memory-bank/*.md)                            │
│ • Always available (embedded)                                      │
│ • Accessed via memory-bank MCP server tools                        │
├───────────────────────────────────────────────────────────────────┤
│ LAYER 1: Markdown Source of Truth (git-committed) — EXISTING       │
│ • git-versioned, human-readable                                    │
│ • .agents/instructions/learned-knowledge.instructions.md            │
│ • The canonical record — databases are disposable indexes          │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

| Path | Trigger | Producer | → | Consumer | Transport |
|------|---------|----------|---|----------|-----------|
| **Write** | `git commit` | `.husky/post-commit` | → `knowledgebase-cli.js sync` | → core engine → PostgreSQL | Child process (`spawn`) |
| **Write** | `npx ai-workflow-setup` | Phase 6 (`scripts/setup/knowledgebase.js`) | → `knowledgebase-cli.js sync` | → core engine → PostgreSQL | Child process (`spawn`) |
| **Read** | Agent query | MCP server (`mcp-knowledgebase-server.js`) | → `knowledgebase-index.js` search | ← PostgreSQL ← pgvector | Direct import |
| **Read** | CLI query | `knowledgebase-cli.js search` | → `knowledgebase-index.js` search | ← PostgreSQL ← pgvector | Direct import |

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Separate MCP server** (not merged with `memory-bank`) | Different database (PostgreSQL vs SQLite), different lifecycle (optional vs always-available), different failure modes (network errors vs filesystem errors). Follows existing multi-server architecture in `opencode.json`. |
| **`pg` + `pgvector` npm with raw SQL** (no ORM) | Only ~4 query types needed (insert, search, stats, list). Raw SQL matches existing pattern in `memory-index.js`. `pgvector` npm provides only `toSql()`/`fromSql()` type conversion utilities. |
| **`all-MiniLM-L6-v2` (384d) as default** | Already an optionalDep. Zero cost. Sufficient for << 10k chunks. SynaBun benchmark validates this choice for developer memory use cases. OpenAI upgrade path: configure `OPENAI_API_KEY` to switch to `text-embedding-3-small` (1536d). |
| **Session-level chunks with "New knowledge" bullets only** | Natural semantic unit. Metadata (date, pipeline, coverage) stored as columns for structured filtering, not in embedding vector. Keeps vectors focused on semantic content. |
| **Post-commit hook (not pre-commit)** | Knowledgebase sync needs the latest committed content. Pre-commit would index uncommitted content. Matches existing `post-merge` hook pattern. |
| **Graceful degradation** | Knowledgebase is an enhancement, not a requirement. When `DATABASE_URL` is not configured: Phase 6 skips with warning, post-commit hook skips silently, MCP tools return helpful error messages (not exceptions). |

---

## 2. Database Schema

### Full DDL

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- knowledgebase schema — PostgreSQL + pgvector
-- ═══════════════════════════════════════════════════════════════════════
--
-- Install manually if auto-provision fails:
--   psql $DATABASE_URL -f scripts/knowledgebase-init.sql

-- ══ Extension ══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS vector;

-- ══ Projects table ═════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS projects (
    id                  TEXT PRIMARY KEY,          -- package.json "name" field
    name                TEXT NOT NULL,             -- display name (may differ from id)
    first_indexed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_indexed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══ Knowledge chunks table ═════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id              BIGSERIAL PRIMARY KEY,
    project_id      TEXT            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_date    DATE            NOT NULL,
    session_title   TEXT,                           -- full heading text (e.g. "Session: 2026-06-13")
    pipeline        TEXT,                           -- from **Pipeline:** field
    coverage        TEXT,                           -- from **Coverage:** field
    tdd_iterations  INTEGER         NOT NULL DEFAULT 0,
    content         TEXT            NOT NULL,       -- the "New knowledge" bullets, plain text
    content_hash    TEXT            NOT NULL,       -- SHA-256 of (content + session_date + pipeline)
    embedding       VECTOR(384),                    -- from all-MiniLM-L6-v2
    indexed_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Idempotency constraint: same project + session date + content hash → no duplicate
    CONSTRAINT uq_knowledge_chunk UNIQUE (project_id, session_date, content_hash)
);

-- ══ Indexes ════════════════════════════════════════════════════════════

-- HNSW index for cosine similarity search (~1ms for 10k vectors)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- B-tree indexes for structured queries and filters
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project_id
    ON knowledge_chunks (project_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_session_date
    ON knowledge_chunks (session_date DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_pipeline
    ON knowledge_chunks (pipeline);

CREATE INDEX IF NOT EXISTS idx_projects_last_indexed
    ON projects (last_indexed_at DESC);

-- ══ Embedding dimension flexibility ════════════════════════════════════
--
-- Default: VECTOR(384) for all-MiniLM-L6-v2
-- OpenAI upgrade path:
--   1. Set OPENAI_API_KEY in .env
--   2. ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE VECTOR(1536);
--   3. DROP INDEX idx_knowledge_chunks_embedding;
--   4. Rebuild HNSW index:
--      CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks
--        USING hnsw (embedding vector_cosine_ops)
--        WITH (m = 16, ef_construction = 64);

-- ══ Manual init script (scripts/knowledgebase-init.sql) ════════════════
-- This file is the exact content that should be saved as
-- scripts/knowledgebase-init.sql for manual database provisioning.
-- The auto-provision path (knowledgebase-index.js) runs the same DDL
-- via pg.Pool.query() but may fail on CREATE EXTENSION due to
-- insufficient privileges. When that happens, the error message
-- directs the user to run this script manually.
```

### Column Rationale

| Column | Type | Purpose |
|--------|------|---------|
| `projects.id` | `TEXT PK` | From `package.json` → `name` field. Stable cross-project identifier. |
| `knowledge_chunks.project_id` | `TEXT FK` | Links chunks to their source project. Indexed for filtered queries. |
| `knowledge_chunks.session_date` | `DATE` | Parsed from `## Session: YYYY-MM-DD` heading. Enables temporal filtering ("show me all knowledge from June 2026"). |
| `knowledge_chunks.session_title` | `TEXT` | Full heading text. Preserves the optional title after date (e.g. `"Session: 2026-07-24 — Verbose Logging..."`). |
| `knowledge_chunks.pipeline` | `TEXT` | Parsed from `**Pipeline:**`. Enables filtering by pipeline type (TDD, feature, etc.). |
| `knowledge_chunks.coverage` | `TEXT` | Parsed from `**Coverage:**`. Captures test coverage context. |
| `knowledge_chunks.tdd_iterations` | `INTEGER` | Parsed from `**TDD Iterations:**`. Tracks iteration count. |
| `knowledge_chunks.content` | `TEXT` | The "New knowledge" bullet text. The semantic content that gets embedded. |
| `knowledge_chunks.content_hash` | `TEXT` | `SHA-256(content + session_date + pipeline)`. Enables **idempotent re-indexing** — matches the existing `memory_chunks.content_hash` pattern in `memory-index.js`. |
| `knowledge_chunks.embedding` | `VECTOR(384)` | The vector embedding for cosine similarity search. |
| `uq_knowledge_chunk` | `UNIQUE` | Composite constraint on `(project_id, session_date, content_hash)` prevents duplicate indexing of the same session content across re-runs. |

### Index Strategy

| Index | Type | Purpose |
|-------|------|---------|
| `idx_knowledge_chunks_embedding` | HNSW | Cosine similarity ANN search. `m=16` (connection count), `ef_construction=64` (build quality). Balances build time vs. query accuracy for << 10k vectors. |
| `idx_knowledge_chunks_project_id` | B-tree | Filtered queries: "search knowledge from project X only". |
| `idx_knowledge_chunks_session_date` | B-tree | Temporal queries: "show recent knowledge". |
| `idx_knowledge_chunks_pipeline` | B-tree | Pipeline-type filtering. |
| `idx_projects_last_indexed` | B-tree | `knowledgebase_list` tool: show recently indexed projects. |

---

## 3. Module Design

### 3.1 File Inventory

| File | Type | Lines (estimated) | Description |
|------|------|--------------------|-------------|
| `scripts/knowledgebase-index.js` | **NEW** | ~350 | Core engine: connection management, embedding, CRUD, search |
| `scripts/knowledgebase-cli.js` | **NEW** | ~200 | CLI entry point: `sync`, `search`, `list`, `stats` commands |
| `scripts/mcp-knowledgebase-server.js` | **NEW** | ~220 | MCP server: stdio transport, 4 tools |
| `scripts/setup/knowledgebase.js` | **NEW** | ~80 | Setup Phase 6: consumer project registration |
| `scripts/knowledgebase-init.sql` | **NEW** | ~60 | Manual DB init script (fallback for `CREATE EXTENSION` failures) |
| `.husky/post-commit` | **NEW** | ~15 | Git hook template |

### 3.2 `scripts/knowledgebase-index.js` — Core Engine

**Role:** The single source of truth for all PostgreSQL + pgvector operations. The CLI and MCP server both import from this module — no database logic is duplicated.

**Public API:**

```js
// Connection management
export async function getPool()           // → pg.Pool (lazy, cached)
export async function ensureSchema()      // → void (CREATE EXTENSION + CREATE TABLE IF NOT EXISTS)
export function closePool()              // → void

// Embedding
export async function embed(text)        // → Float32Array (384 floats)
export function setEmbeddingProvider(provider) // 'local' | 'openai'

// CRUD
export async function registerProject(projectId, name) // → { id, first_indexed_at }
export async function indexProject(projectId, filePath) // → { chunks_indexed, chunks_skipped }
export async function upsertChunk(projectId, metadata, content) // → { action: 'inserted'|'skipped' }

// Search
export async function search(query, opts) // → Array<{ project_id, session_date, pipeline, content, similarity }>
//   opts: { topK?: number (default 5), projectId?: string, pipeline?: string }

// Stats
export async function getStats()          // → { total_projects, total_chunks, db_size }
export async function listProjects()      // → Array<{ project_id, chunk_count, last_indexed }>
```

**Dependencies:**
- `pg` (optionalDep — lazy import, graceful unavailability)
- `pgvector` (optionalDep — `toSql()`/`fromSql()` helpers)
- `@xenova/transformers` (existing optionalDep — `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')` — reuses exact same embedding pipeline as `memory-index.js`)
- `dotenv` (existing devDep — loaded at module init for `DATABASE_URL`)
- `node:crypto` (built-in — SHA-256 for content_hash)
- `node:fs`, `node:path` (built-in — file reading)

**Error Handling Strategy:**

| Scenario | Behavior |
|----------|----------|
| `DATABASE_URL` not configured | `getPool()` logs warning, returns `null`. All exported functions check pool before DB operations and return graceful fallback values (`search` returns `[]`, `indexProject` returns `{ skipped: 0, indexed: 0 }`, etc.). Never throws. |
| PostgreSQL connection failure | Pool emits `error` event (logged to stderr). Individual queries may throw — callers (CLI/MCP) catch and format the error. Pool retries via `pg.Pool` built-in retry (configured: `max: 5, idleTimeoutMillis: 30000`). |
| Embedding model not installed | `embed()` throws descriptive error — `"Embedding model not available. Install @xenova/transformers."` — matching `memory-index.js` pattern. |
| `CREATE EXTENSION vector` fails | `ensureSchema()` catches the error, logs instructions to run `scripts/knowledgebase-init.sql` manually, marks schema as incomplete. Subsequent operations that need the `knowledge_chunks` table will fail with descriptive errors. |
| Content unchanged (idempotency) | `content_hash` comparison — if the hash matches an existing chunk, skip silently. Returns `{ action: 'skipped' }`. |

**Connection Pool Configuration:**

```js
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,                    // conservative for single-user MCP stdio
    idleTimeoutMillis: 30000,  // 30s idle timeout
    connectionTimeoutMillis: 5000, // fail fast if unreachable
});
```

### 3.3 `scripts/knowledgebase-cli.js` — CLI

**Role:** Command-line interface for manual operations and git hook scripting. Mirrors `scripts/memory-cli.js` architecture exactly.

**Commands:**

```bash
node scripts/knowledgebase-cli.js sync [--project <id>]
# Reads learned-knowledge.instructions.md, chunks by session, embeds, upserts.
# Resolves project ID: --project flag → cwd package.json name → error.
# Output: {"status":"ok","project_id":"my-app","chunks":{"indexed":3,"skipped":1}}

node scripts/knowledgebase-cli.js search "<query>" [--topK 5] [--project <id>]
# Semantic search. Output: JSON array of results.

node scripts/knowledgebase-cli.js list
# List all registered projects. Output: JSON array.

node scripts/knowledgebase-cli.js stats
# Database statistics. Output: JSON object.
```

**Dependencies:**
- `knowledgebase-index.js` (direct import — `search`, `indexProject`, `registerProject`, `getStats`, `listProjects`, `closePool`)
- `node:fs`, `node:path` (built-in — reading `package.json`, `learned-knowledge.instructions.md`)

**Error Handling:**
- All commands wrapped in `try/catch` → JSON error output on stderr → `process.exit(1)`
- `closePool()` called in `finally` block (matching `memory-cli.js` pattern)
- Graceful: if `DATABASE_URL` not configured → print descriptive message → `process.exit(0)` (not an error)

**Chunk Parsing Logic (inline in CLI, not in core engine):**

The CLI is responsible for parsing `learned-knowledge.instructions.md` into structured chunks. The core engine (`knowledgebase-index.js`) receives already-parsed metadata + content — it doesn't know about markdown structure. This separation of concerns allows the core engine to accept content from any source.

```
parseLearnedKnowledge(filePath) → Array<{
    session_date:  "2026-06-13",
    session_title: "Session: 2026-06-13",
    pipeline:      "TDD Infrastructure Bootstrap",
    coverage:      "N/A (infrastructure setup)",
    tdd_iterations: 0,
    content:       "- Project is a template distribution package\n- Source code is in scripts/\n- ..."
}>
```

### 3.4 `scripts/mcp-knowledgebase-server.js` — MCP Server

**Role:** Exposes knowledgebase operations to AI agents via MCP stdio transport. Follows `scripts/mcp-memory-server.js` pattern exactly.

**Architecture:**
```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { search, indexProject, getStats, listProjects } from './knowledgebase-index.js';

const server = new Server(
    { name: 'knowledgebase', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

// ... tool registration + handler (see §5 for full interface)
```

**Dependencies:**
- `@modelcontextprotocol/sdk` (existing dep)
- `knowledgebase-index.js` (direct import — all 4 exported functions)

**Error Handling:**
- `CallToolRequestSchema` handler wraps everything in `try/catch`
- Errors returned as `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`
- Graceful degradation: if `knowledgebase-index.js` reports no pool → tools return helpful "DATABASE_URL not configured" messages (not exceptions)
- `console.error('[knowledgebase-mcp] ...')` for server lifecycle logging (stderr, doesn't interfere with stdio protocol)

**Registration in `opencode.json`:**
```json
"knowledgebase": {
    "type": "local",
    "command": ["node", "scripts/mcp-knowledgebase-server.js"],
    "enabled": true
}
```

**Agent permission in `.opencode/agents/*.agent.md`:**
```yaml
permission:
    "knowledgebase/*": allow
```

### 3.5 `scripts/setup/knowledgebase.js` — Setup Phase 6

**Role:** Registers a consumer project in the centralized knowledgebase during `npx ai-workflow-setup`. Follows the same architecture as other phase modules (`prepare.js`, `husky-init.js`).

**Public API:**
```js
export async function registerKnowledgebase(context) → {
    action: 'indexed' | 'skipped' | 'failed',
    message: string,
    chunks_indexed?: number,
    chunks_skipped?: number
}
```

**Behavior:**
1. Extract `projectId` from `context.consumerPackageJson?.name`
2. If no `package.json` or no `name` field → `{ action: 'skipped', message: 'No project name in package.json' }`
3. Spawn `knowledgebase-cli.js sync --project <id>` as child process (using the exact `spawnScript()` pattern from `sync-phase.js`)
4. If spawn succeeds (exit 0) → parse JSON output → `{ action: 'indexed', message: 'Indexed N chunks from M sessions' }`
5. If spawn fails (non-zero exit) → `{ action: 'failed', message: '...' }` — but this is **non-fatal** to the overall setup pipeline
6. If `spawnScript` throws (script not found) → `{ action: 'skipped', message: 'knowledgebase-cli.js not available' }`

**Why spawn as child process?** Same reason as `sync-phase.js`: the CLI may call `process.exit()`, which would kill the parent setup process if imported directly. The `spawnScript()` utility isolates this.

### 3.6 `scripts/knowledgebase-init.sql` — Manual Init Script

**Role:** Fallback for environments where `CREATE EXTENSION vector` fails due to insufficient PostgreSQL user privileges. Contains the full DDL from §2.

**Format:** Plain SQL file, executable via:
```bash
psql $DATABASE_URL -f scripts/knowledgebase-init.sql
```

**Content:** Exact mirror of the DDL in §2. The auto-provision code in `knowledgebase-index.js` attempts the same DDL programmatically; if it fails, it prints a message directing the user to this file.

---

## 4. Connection Strategy

### Auto-Provision Flow

```
knowledgebase-index.js loaded
    │
    ├─ check DATABASE_URL
    │   ├─ NOT SET → log warning, return pool=null
    │   │            (all exported functions become no-ops)
    │   │
    │   └─ SET → create pg.Pool
    │           │
    │           ├─ attempt ensureSchema()
    │           │   │
    │           │   ├─ CREATE EXTENSION IF NOT EXISTS vector
    │           │   │   ├─ SUCCESS → continue
    │           │   │   └─ FAIL (permission) → catch error
    │           │   │       ├─ log: "pgvector extension not available."
    │           │   │       ├─ log: "Run: psql $DATABASE_URL -f scripts/knowledgebase-init.sql"
    │           │   │       └─ set schemaReady = false
    │           │   │
    │           │   ├─ CREATE TABLE IF NOT EXISTS projects (...)
    │           │   └─ CREATE TABLE IF NOT EXISTS knowledge_chunks (...)
    │           │       ├─ SUCCESS → schemaReady = true
    │           │       └─ FAIL → schemaReady = false
    │           │
    │           └─ return pool
```

### Manual Init SQL

The file `scripts/knowledgebase-init.sql` contains the complete DDL from §2. It is the exact content the auto-provision error message points to.

### Graceful Degradation Matrix

| Scenario | `DATABASE_URL` | Pool Status | Schema Status | `search()` | `indexProject()` | `getStats()` |
|----------|---------------|-------------|---------------|------------|-----------------|--------------|
| Prod, fully configured | Set | Active | Ready | Returns results | Indexes | Returns stats |
| Prod, pgvector not installed | Set | Active | Not ready | Error: "schema incomplete" | Error: "schema incomplete" | Returns `{ total_projects: 0 }` |
| Prod, connection failed | Set | Null (after retry exhaustion) | Unknown | Returns `[]` | Returns `{ skipped: 0 }` | Returns `{ total_projects: 0 }` |
| Dev, no database | Unset | Null | N/A | Returns `[]` | Returns `{ skipped: 0 }` | Returns `{ total_projects: 0 }` |
| Consumer, no database | Unset | Null | N/A | Returns `[]` (MCP tool shows message) | No-op (Phase 6 skips) | No-op (MCP tool shows message) |

**Key principle:** No scenario throws an uncaught exception. No consumer project sees an error or warning about PostgreSQL at startup. The knowledgebase is silent until explicitly queried, and even then, it returns empty/zero results rather than errors.

---

## 5. MCP Interface Design

### 5.1 `knowledgebase_search`

```json
{
    "name": "knowledgebase_search",
    "description": "Semantic search across learned knowledge from all indexed projects. Use this when planning tasks, encountering errors, or seeking patterns from past pipeline sessions.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query about patterns, conventions, gotchas, or agent behavior (e.g. 'how to handle verbose logging in child processes' or 'what verbose flag infrastructure exists?')"
            },
            "topK": {
                "type": "number",
                "default": 5,
                "description": "Number of results to return (1-20)"
            },
            "projectId": {
                "type": "string",
                "description": "Optional: filter to a specific project by its package.json name"
            }
        },
        "required": ["query"]
    }
}
```

**Response shape (success):**
```json
{
    "content": [{
        "type": "text",
        "text": "### Result 1 (similarity: 0.87)\n**Project:** my-app\n**Date:** 2026-07-24\n**Pipeline:** Feature Pipeline\n\n- Dead code infrastructure is a valuable find\n- The verbose flag existed but was never checked\n..."
    }]
}
```

**Response shape (no results):**
```json
{
    "content": [{
        "type": "text",
        "text": "No results found. The knowledgebase may be empty or DATABASE_URL may not be configured."
    }]
}
```

**Response shape (database unavailable):**
```json
{
    "content": [{
        "type": "text",
        "text": "Knowledgebase not available: DATABASE_URL is not configured. Set DATABASE_URL in your .env file to enable cross-project knowledge search."
    }]
}
```

### 5.2 `knowledgebase_index`

```json
{
    "name": "knowledgebase_index",
    "description": "Index or re-index a project's learned knowledge file. Use after adding new sessions to learned-knowledge.instructions.md. Idempotent — unchanged sessions are skipped.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "projectId": {
                "type": "string",
                "description": "Optional: project identifier (defaults to current package.json name)"
            }
        }
    }
}
```

**Response shape (success):**
```json
{
    "content": [{
        "type": "text",
        "text": "Indexed 3 chunks, skipped 2 (already up-to-date) for project my-app."
    }]
}
```

### 5.3 `knowledgebase_stats`

```json
{
    "name": "knowledgebase_stats",
    "description": "Get statistics about the centralized knowledgebase.",
    "inputSchema": {
        "type": "object",
        "properties": {}
    }
}
```

**Response shape:**
```json
{
    "content": [{
        "type": "text",
        "text": "**Knowledgebase Stats**\n- Total projects: 3\n- Total chunks: 47\n- Database size: 2.3 MB"
    }]
}
```

### 5.4 `knowledgebase_list`

```json
{
    "name": "knowledgebase_list",
    "description": "List all projects currently indexed in the knowledgebase. Useful for discovering which projects have shared knowledge.",
    "inputSchema": {
        "type": "object",
        "properties": {}
    }
}
```

**Response shape:**
```json
{
    "content": [{
        "type": "text",
        "text": "**Indexed Projects:**\n- my-app (12 chunks, last indexed: 2026-07-29)\n- other-project (8 chunks, last indexed: 2026-07-28)"
    }]
}
```

---

## 6. Chunking & Embedding Pipeline

### 6.1 Source File Structure

`learned-knowledge.instructions.md` follows this structure:

```markdown
# Learned Knowledge

> Accumulated patterns, conventions, gotchas...

## Session: YYYY-MM-DD

**Pipeline:** ...
**Coverage:** ...
**TDD Iterations:** N

**New knowledge:**
- bullet point 1
- bullet point 2

**Agent tuning notes:**
- agent-name: note
```

Optional variant: `## Session: YYYY-MM-DD — Title` with descriptive title.

### 6.2 Parsing Algorithm

```
1. Read file as UTF-8 text
2. Split by regex /(?=^## Session: )/m   → array of session blocks
3. For each session block:
   a. Extract session_date:     regex /^## Session: (\d{4}-\d{2}-\d{2})/
   b. Extract session_title:    full heading line (minus "## ")
   c. Extract pipeline:        regex /\*\*Pipeline:\*\*\s*(.+)/
   d. Extract coverage:        regex /\*\*Coverage:\*\*\s*(.+)/
   e. Extract tdd_iterations:  regex /\*\*TDD Iterations:\*\*\s*(\d+)/
   f. Extract new_knowledge:
      - Find "**New knowledge:**" marker
      - Collect all bullet lines that follow until next "**" heading or end of block
      - Strip leading "- " or "* " from each bullet
      - Join with newlines
4. Skip sessions with empty new_knowledge content
5. Compute content_hash = SHA-256(content + session_date + pipeline)
```

### 6.3 What Gets Embedded

**Only the "New knowledge" bullets**, prepended with session context:

```
Session: 2026-07-24 — Pipeline: Feature Pipeline
- Dead code infrastructure is a valuable find — the verbose flag already existed but was never checked
- spawnScript() in sync-phase.js was the root cause of silent hangs
- Child process communication requires env vars
```

**Rationale:**
- The "New knowledge" bullets contain the actual learned insights — the semantic content worth searching for
- Pipeline and Coverage metadata are structured fields for filtering, not semantic content — they're stored in DB columns
- Agent tuning notes are meta-knowledge useful for agent configuration but secondary for semantic search
- Prepending session date + pipeline as context gives the embedding meaningful temporal/contextual framing
- This keeps embedding vectors focused on the retrievable content, maximizing cosine similarity accuracy

**What is NOT embedded:**
- Session date (stored as `session_date` column — filterable via SQL WHERE)
- Pipeline name (stored as `pipeline` column)
- Coverage numbers (stored as `coverage` column)
- TDD iteration counts (stored as `tdd_iterations` column)
- Agent tuning notes (stored in the source file but not in the knowledgebase — they're agent-configuration metadata, not learned-knowledge content)

### 6.4 Embedding Generation

```
content (text) → embed() function → Float32Array (384 floats)
```

The `embed()` function in `knowledgebase-index.js` reuses the **exact same** `@xenova/transformers` pipeline as `memory-index.js`:

```js
import { pipeline } from '@xenova/transformers';
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const result = await embedder(text, { pooling: 'mean', normalize: true });
return new Float32Array(result.data); // 384 floats
```

### 6.5 Metadata Flow to DB Columns

```
Parsed session block  →  knowledge_chunks row
    │
    ├─ session_date    →  session_date    (DATE)
    ├─ session_title   →  session_title   (TEXT)
    ├─ pipeline        →  pipeline        (TEXT)
    ├─ coverage        →  coverage        (TEXT)
    ├─ tdd_iterations  →  tdd_iterations  (INTEGER)
    ├─ new_knowledge   →  content         (TEXT)
    ├─ embedding(content) → embedding     (VECTOR(384))
    ├─ SHA-256(content + session_date + pipeline) → content_hash (TEXT)
    ├─ project_id      →  project_id      (TEXT FK)
    └─ now()           →  indexed_at      (TIMESTAMPTZ)
```

---

## 7. Setup Integration

### 7.1 Phase 6 — Position in Pipeline

Phase 6 runs **after Phase 5 (Sync)** and **before the Summary**:

```
Phase 1: Discovery
Phase 2: Hooks (install .husky/post-commit)
Phase 3: Prepare (package.json scripts)
Phase 4: Husky Init
Phase 5: Sync (copy scripts including knowledgebase-cli.js)
Phase 6: Knowledgebase  ← NEW
Summary
```

This ordering ensures:
1. `knowledgebase-cli.js` has already been synced to the consumer project (Phase 5)
2. The `.husky/post-commit` hook is already installed (Phase 2) — it won't fire during initial setup, but it's ready for subsequent commits

### 7.2 Orchestrator Integration (`scripts/setup/index.js`)

```js
// Phase 6 — Knowledgebase (always runs, gracefully skips if not configured)
if (!flags.skipKnowledgebase) {
    section('Phase 6: Knowledgebase')

    try {
        const kbResult = await registerKnowledgebase(context)
        context.kbResult = kbResult
        phases.push({
            phase: 'knowledgebase',
            status: actionStatus(kbResult.action),
            message: kbResult.message,
        })
    } catch (err) {
        stepWarn(`Knowledgebase registration skipped: ${err.message}`)
        phases.push({
            phase: 'knowledgebase',
            status: 'warn',
            message: `Skipped — ${err.message}`,
        })
    }
}
```

### 7.3 New CLI Flag

Add `'--skip-knowledgebase'` to `SUPPORTED_FLAGS` in `constants.js`:

```js
export const SUPPORTED_FLAGS = {
    // ... existing flags ...
    '--skip-knowledgebase': 'skipKnowledgebase',
}
```

### 7.4 Child Process Spawn Pattern

The `registerKnowledgebase()` function in `scripts/setup/knowledgebase.js` spawns `knowledgebase-cli.js` using the exact `spawnScript()` pattern from `sync-phase.js`:

```js
import { spawn } from 'child_process';
import { join } from 'path';
import { resolvePackageRoot } from './utils.js';

export async function registerKnowledgebase(context) {
    const { consumerRoot, consumerPackageJson } = context;

    // Skip if no project ID available
    const projectId = consumerPackageJson?.name;
    if (!projectId) {
        return {
            action: 'skipped',
            message: 'No project name in package.json — cannot register knowledgebase',
        };
    }

    const packageRoot = resolvePackageRoot();
    const cliPath = join(packageRoot, 'scripts', 'knowledgebase-cli.js');

    // Use the same spawnScript pattern as sync-phase.js
    const result = await spawnScript(
        'knowledgebase-cli.js',
        cliPath,
        consumerRoot,
        ['sync', '--project', projectId],
        context.verbose,
    );

    if (!result.success) {
        return {
            action: 'failed',
            message: `Knowledgebase sync failed: ${result.output || `exit code ${result.exitCode}`}`,
        };
    }

    // Parse JSON output from CLI
    try {
        const parsed = JSON.parse(result.output);
        return {
            action: 'indexed',
            message: `Registered "${projectId}" — ${parsed.chunks.indexed} chunks indexed, ${parsed.chunks.skipped} skipped`,
            chunks_indexed: parsed.chunks.indexed,
            chunks_skipped: parsed.chunks.skipped,
        };
    } catch {
        return { action: 'indexed', message: `Registered "${projectId}"` };
    }
}

// Reuse the spawnScript helper from sync-phase.js
// (or import it directly if extracted to a shared utility)
```

### 7.5 Changes to `scripts/sync.js`

Add `knowledgebase-cli.js`, `knowledgebase-index.js`, and `mcp-knowledgebase-server.js` to the `scriptsToSync` array:

```js
const scriptsToSync = [
    'memory-cli.js',
    'memory-index.js',
    'bump-version.js',
    'validate-memory-schema.js',
    'mcp-memory-server.js',
    'mcp/playwright-mcp-launcher.js',
    // NEW — knowledgebase scripts
    'knowledgebase-cli.js',
    'knowledgebase-index.js',
    'mcp-knowledgebase-server.js',
    'knowledgebase-init.sql',  // also sync the init SQL
]
```

### 7.6 Changes to `scripts/setup/constants.js`

Add `post-commit` to `TEMPLATE_HOOKS`:

```js
export const TEMPLATE_HOOKS = {
    'pre-commit': { /* ... unchanged ... */ },
    'post-merge':  { /* ... unchanged ... */ },
    'post-commit': {
        source: '.husky/post-commit',
        content: [
            '# Managed by @abarcenas/ai-workflow-template setup',
            '#!/bin/sh',
            '. "$(dirname "$0")/_/husky.sh"',
            '',
            '# After commit, check if learned knowledge file changed',
            '# and sync to the centralized knowledgebase',
            '',
            'CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | grep ".agents/instructions/learned-knowledge.instructions.md")',
            '',
            'if [ -n "$CHANGED" ]; then',
            '  echo "[knowledgebase] Learned knowledge file changed. Syncing to knowledgebase..."',
            '  node scripts/knowledgebase-cli.js sync 2>/dev/null || echo "[knowledgebase] Sync skipped (DATABASE_URL not configured or service unavailable)"',
            'fi',
            '',
        ].join('\n'),
        description: 'Auto-sync learned knowledge to centralized knowledgebase after commits',
    },
}
```

**Note:** The `installHooks()` function in `hooks.js` iterates `Object.keys(TEMPLATE_HOOKS)` — adding a new key automatically includes it in hook installation. **Zero changes needed to `hooks.js`.** This validates the existing architecture's extensibility.

### 7.7 Changes to `opencode.json`

Add the knowledgebase MCP server:

```json
"knowledgebase": {
    "type": "local",
    "command": ["node", "scripts/mcp-knowledgebase-server.js"],
    "enabled": true
}
```

Add permission:

```json
"knowledgebase_*": "allow"
```

### 7.8 Changes to `package.json`

Add new optional dependencies:

```json
"optionalDependencies": {
    "@xenova/transformers": "^2.17.0",
    "pg": "^8.13.0",
    "pgvector": "^0.3.0"
}
```

Add new scripts:

```json
"scripts": {
    "kb:sync": "node ./scripts/knowledgebase-cli.js sync",
    "kb:search": "node ./scripts/knowledgebase-cli.js search",
    "kb:stats": "node ./scripts/knowledgebase-cli.js stats"
}
```

Add new files to npm distribution:

```json
"files": [
    ".husky/post-commit"
]
```

### 7.9 Changes to `.env.example`

```bash
# PostgreSQL connection string for centralized knowledgebase (pgvector)
# Required for cross-project learned knowledge sharing
# DATABASE_URL=postgresql://user:password@localhost:5432/knowledgebase

# OpenAI API key for higher-quality embeddings (optional — falls back to local @xenova/transformers)
# OPENAI_API_KEY=sk-...
```

---

## 8. Git Hook Design

### 8.1 Post-Commit Hook Flow

```
1. Developer makes a commit
2. .husky/post-commit fires
3. Check: git diff HEAD~1 --name-only 2>/dev/null | grep "learned-knowledge.instructions.md"
   │
   ├─ NO MATCH → exit silently (exit 0)
   │
   └─ MATCH →
       ├─ echo "[knowledgebase] Learned knowledge file changed. Syncing..."
       ├─ node scripts/knowledgebase-cli.js sync
       │   ├─ SUCCESS → exit 0 (after and regardless of success/failure)
       │   └─ FAILURE → echo "[knowledgebase] Sync skipped (...)" → exit 0
       └─ exit 0 (ALWAYS — never block the developer)
```

### 8.2 Hook Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Post-commit, not pre-commit** | Knowledgebase sync needs the latest committed content. Pre-commit would index content that hasn't been committed yet. |
| **`2>/dev/null` on git diff** | Suppresses errors on first commit (HEAD~1 doesn't exist). Matches `post-merge` hook pattern. |
| **`2>/dev/null` on CLI call** | Suppresses any stderr noise from the sync process in the hook output. Matches `post-merge` hook pattern. |
| **`\|\| echo` fallback** | Never exits non-zero. Failure to sync is not a commit failure. Matches `post-merge` pattern. |
| **Marker on line 1** | `# Managed by @abarcenas/ai-workflow-template setup` — enables `discover.js` `isManaged` detection for idempotent re-runs. Matches `pre-commit` and `post-merge` pattern. |
| **Shebang on line 2** | Husky v9 sources hook files, so shebang position doesn't affect execution. Matches `post-merge` pattern. |

### 8.3 Consumer Behavior

| Consumer Scenario | Behavior |
|-------------------|----------|
| Has `DATABASE_URL` configured | Hook syncs on every commit that changes `learned-knowledge.instructions.md` |
| No `DATABASE_URL` configured | `knowledgebase-cli.js sync` logs "DATABASE_URL not configured" to stderr (captured by `2>/dev/null`), hook continues silently |
| `knowledgebase-cli.js` not installed | `node scripts/knowledgebase-cli.js` fails with "module not found" → `\|\| echo` fallback fires → hook continues silently |
| First commit ever (no HEAD~1) | `git diff HEAD~1` fails → stderr suppressed by `2>/dev/null` → `grep` gets empty input → no match → silent exit |

---

## 9. Agent Instruction Design

### 9.1 New File: `.agents/instructions/knowledgebase.instructions.md`

This file tells AI agents **when** and **how** to query the centralized knowledgebase. It follows the exact format of existing instruction files.

```markdown
---
applyTo: "**"
---

# Knowledgebase

You have access to a centralized knowledgebase containing learned knowledge from past
pipeline sessions across all projects that have been indexed. The knowledgebase is
powered by PostgreSQL + pgvector with semantic (cosine similarity) search.

## MCP Tools

The knowledgebase is accessed via the `knowledgebase` MCP server configured in
`opencode.json`. The following tools are available:

| Tool | Purpose |
|------|---------|
| `knowledgebase_search` | Semantic search across learned knowledge from all indexed projects |
| `knowledgebase_index` | Index or re-index a project's learned-knowledge.instructions.md |
| `knowledgebase_stats` | Get knowledgebase statistics |
| `knowledgebase_list` | List all indexed projects |

## When to Query the Knowledgebase

**Always query BEFORE starting implementation work**, especially for:

1. **Planning tasks** — Search for past patterns and conventions relevant to the current task
   (e.g., "what verbose flag infrastructure exists?")

2. **Encountering errors** — Search for similar errors and their resolutions
   (e.g., "how was the spawnScript hanging issue solved?")

3. **Making architectural decisions** — Search for prior decisions and their rationale
   (e.g., "why was a separate MCP server chosen over merging?")

4. **Working with specific technologies** — Search for tech-specific gotchas
   (e.g., "what are the gotchas with child_process.spawn in this project?")

5. **Agent tuning** — Search for agent-specific tuning notes if you're unsure about
   conventions (e.g., "what should the coder agent know about this project?")

## How to Query

Use natural language queries that describe what you're trying to accomplish:

```
knowledgebase_search({
    query: "how to handle verbose logging in child processes",
    topK: 5
})
```

Filter by project if you want knowledge from a specific project only:

```
knowledgebase_search({
    query: "TDD pipeline patterns",
    projectId: "my-app",
    topK: 5
})
```

## How to Interpret Results

Results are ranked by cosine similarity score (0.0–1.0, higher = more relevant):

- **≥ 0.85**: Highly relevant — this knowledge is directly applicable
- **0.70–0.84**: Relevant — related context that may inform your approach
- **< 0.70**: Tangentially related — use with discretion

Each result includes:
- **Project**: Which project the knowledge came from
- **Date**: When the session occurred (more recent = more applicable)
- **Pipeline**: What pipeline type generated the knowledge
- **Content**: The actual learned knowledge bullets

## When NOT to Query

Do NOT query the knowledgebase for:
- Project-specific file paths or configuration (use the memory bank instead)
- Current task status (use `memory-bank/activeContext.md`)
- Code implementation details (read the actual source files)

## Relationship to Memory Bank

- **Knowledgebase**: Cross-project, learned patterns and conventions from pipeline sessions
- **Memory Bank**: Per-project, current state, tasks, architecture, and decisions

Think of the knowledgebase as "what we've learned across all projects" and the
memory bank as "what's happening right now in this project."
```

### 9.2 Agent Permission Changes

Each `.opencode/agents/*.agent.md` file needs:

```yaml
permission:
    "knowledgebase/*": allow
```

This follows the exact pattern established by `memory-bank/*: allow`.

### 9.3 Closed-Loop Workflow

The knowledgebase creates a closed loop for agent learning:

```
Agent completes task
    → Appends to learned-knowledge.instructions.md
    → Developer commits (triggers post-commit hook)
    → knowledgebase-cli.js sync → PostgreSQL + pgvector
    → Next agent reads knowledgebase.instructions.md
    → Agent queries knowledgebase_search before planning
    → Learns from past sessions → produces better output
    → Appends new knowledge → cycle repeats
```

---

## 10. Security Considerations

### 10.1 SQL Injection Prevention

**All database queries use parameterized queries with `$1`, `$2`, ... placeholders.** The `pg` client library handles escaping automatically. No string interpolation is used for user-supplied values.

```js
// ✅ SAFE — parameterized query
await pool.query(
    `INSERT INTO knowledge_chunks (project_id, content, embedding) VALUES ($1, $2, $3)`,
    [projectId, content, toSql(embedding)]
);

// ✅ SAFE — parameterized search
await pool.query(
    `SELECT * FROM knowledge_chunks ORDER BY embedding <=> $1 LIMIT $2`,
    [toSql(queryEmbedding), topK]
);

// ❌ NEVER — string interpolation
// await pool.query(`SELECT * FROM knowledge_chunks WHERE project_id = '${projectId}'`);
```

**The `pgvector` npm `toSql()` function produces a safe string representation** of the vector, not raw SQL — it's designed for use as a parameterized query value.

**Content hash is computed server-side** via `node:crypto` `createHash('sha256')` — not passed from client input.

### 10.2 Embedding API Key Handling

| Provider | Key | Handling |
|----------|-----|----------|
| `@xenova/transformers` (local) | None | No API key needed. Model runs locally. |
| OpenAI (optional upgrade) | `OPENAI_API_KEY` | Read from `process.env.OPENAI_API_KEY`. Never logged, never returned in API responses. Passed as `Authorization: Bearer ${key}` header to OpenAI API. |

**Key loading pattern:**
```js
function getOpenAIKey() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        throw new Error('OPENAI_API_KEY not configured. Set it in .env to use OpenAI embeddings.');
    }
    return key;
}
```

The key is:
- **Not committed** — `.env` is in `.gitignore`
- **Not logged** — `console.log` calls use `'***'` redaction for API key values
- **Templated** — `.env.example` shows the format without real values
- **Optional** — the system falls back to local embeddings when absent

### 10.3 Connection Pool Security

| Concern | Mitigation |
|---------|------------|
| **Connection string exposure** | `DATABASE_URL` stored in `.env` (git-ignored). Template in `.env.example`. Never hardcoded in source. Never logged (redacted in error messages). |
| **Connection exhaustion** | Pool max: 5 connections. Single-user MCP stdio process — 5 is more than sufficient. `idleTimeoutMillis: 30000` frees idle connections. |
| **Unencrypted connections** | Use `sslmode=require` or `?sslmode=require` in `DATABASE_URL` for production deployments. Not enforced by the code (infrastructure concern). |
| **Privilege escalation** | `CREATE EXTENSION` requires superuser. Auto-provision catches permission errors and directs to manual init script. The application user needs only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `projects` and `knowledge_chunks` tables. |
| **Cross-project data leakage** | `knowledgebase_search` returns results from ALL projects by default. This is by design (cross-project knowledge sharing), but the `projectId` filter allows agents to scope queries. No project can access another project's `DATABASE_URL` or modify another project's data (each project connects with its own credentials). |

### 10.4 Connection String Redaction

When logging connection errors, the connection string is redacted:

```js
function redactConnectionString(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.username ? '***' : ''}${u.username ? '@' : ''}${u.hostname}:${u.port}${u.pathname}`;
    } catch {
        return '***';
    }
}
```

### 10.5 Dependency Supply Chain

| Dependency | Purpose | Risk |
|------------|---------|------|
| `pg` (node-postgres) | PostgreSQL client | Well-established (14M+ weekly downloads). No known vulnerabilities. |
| `pgvector` (npm) | Type conversion helpers (`toSql`/`fromSql`) | Lightweight (< 1KB). Only formatting utilities — no SQL generation, no network access. |
| `@xenova/transformers` | Local embedding model | Already in project as optionalDep. Model weights downloaded from Hugging Face on first use. Pinned to v2.17.0. |
| `@modelcontextprotocol/sdk` | MCP stdio transport | Already in project. v1.0.0. |

No new runtime dependencies beyond `pg` and `pgvector` (both optional dependencies).

---

## Alternatives Considered

### ALT-01: Merge into Memory MCP Server

**Rejected.** The knowledgebase server uses PostgreSQL (external, network-dependent, optional), while the memory server uses SQLite (embedded, filesystem, always available). Merging would force the memory server to have PostgreSQL as a dependency and complicate error handling. The existing `opencode.json` already shows 9 separate MCP servers — adding a 10th follows the established architecture.

### ALT-02: Use an ORM (Drizzle, Prisma, Knex)

**Rejected.** Only ~4 query types needed (insert, search, stats, list). Raw SQL with `pg` is simpler, matches existing `memory-index.js` patterns, and gives full control over pgvector-specific SQL (`<=>` operator, HNSW index creation). An ORM adds abstraction overhead without benefit for this use case.

### ALT-03: Embed Full Session Blocks

**Rejected.** Embedding structural metadata (dates, pipeline names, coverage numbers, agent tuning notes) wastes embedding dimensions on low-semantic-value content. "New knowledge" bullets are what agents actually need to find. Metadata is stored in DB columns for structured filtering — not in the embedding vector.

### ALT-04: OpenAI Embeddings as Default

**Rejected.** `all-MiniLM-L6-v2` (384d) is already an optionalDep, runs locally, costs $0, and achieves 78% recall@5 — sufficient for << 10k chunks. The SynaBun benchmark validates this choice for developer memory use cases. OpenAI (`text-embedding-3-small`) is offered as a configurable upgrade for teams that need higher recall quality.

### ALT-05: Pre-Commit Hook Instead of Post-Commit

**Rejected.** The knowledgebase sync needs the latest committed content (the commit SHA is part of the data lineage). A pre-commit hook would index content that hasn't been committed yet, creating a mismatch between what's in git and what's in the database. Post-commit matches the existing `post-merge` hook pattern.

---

## Risks and Assumptions

| ID | Risk/Assumption | Mitigation |
|----|-----------------|------------|
| RISK-01 | Consumer projects without PostgreSQL cannot use the knowledgebase | By design — graceful degradation. All operations silently skip when `DATABASE_URL` is not configured. |
| RISK-02 | `CREATE EXTENSION vector` requires superuser privileges | Auto-provision catches and directs to manual `scripts/knowledgebase-init.sql`. Many managed PostgreSQL services (Supabase, Neon, Aiven) pre-install pgvector. |
| RISK-03 | Connection pool exhaustion in multi-agent scenarios | Pool max set to 5, which is sufficient for single-user MCP stdio processes. If multiple agents share one process, 5 connections handle concurrent queries. |
| RISK-04 | Embedding model download size (~22MB for MiniLM) may surprise users on first run | Model is cached after first download. The memory bank already uses the same model — no additional download for existing users. |
| RISK-05 | `knowledgebase-cli.js` may not be synced when hook fires | Phase 5 (Sync) runs before Phase 6 (Knowledgebase) and copies all scripts. The hook fires only on subsequent commits, after setup is complete. |
| ASSUMPTION-01 | `package.json` `name` field is a suitable project identifier | `name` is required by npm and is the de facto project identifier. It is stable across sessions and unique within an organization. |
| ASSUMPTION-02 | `learned-knowledge.instructions.md` follows the defined session format | The format is enforced by the instructions file itself. Agents follow the documented structure. Future format changes may require parser updates. |
| ASSUMPTION-03 | Single PostgreSQL instance serves multiple consumer projects | Each project connects with its own `DATABASE_URL`. All projects share the same `knowledge_chunks` table for cross-project search. |

---

## Files Affected

### New Files

| File | Description |
|------|-------------|
| `scripts/knowledgebase-index.js` | Core engine: embedding, CRUD, search (~350 lines) |
| `scripts/knowledgebase-cli.js` | CLI: sync, search, list, stats (~200 lines) |
| `scripts/mcp-knowledgebase-server.js` | MCP server: stdio transport, 4 tools (~220 lines) |
| `scripts/setup/knowledgebase.js` | Setup Phase 6: project registration (~80 lines) |
| `scripts/knowledgebase-init.sql` | Manual DB init script (~60 lines) |
| `.husky/post-commit` | Git hook template (~15 lines) |
| `.agents/instructions/knowledgebase.instructions.md` | Agent instructions for knowledgebase usage (~80 lines) |

### Modified Files

| File | Change |
|------|--------|
| `scripts/setup/index.js` | Add Phase 6 knowledgebase registration (after Phase 5, before Summary) |
| `scripts/setup/constants.js` | Add `post-commit` to `TEMPLATE_HOOKS`, add `--skip-knowledgebase` flag, add knowledgebase scripts to `scriptsToSync` |
| `scripts/sync.js` | Add `knowledgebase-cli.js`, `knowledgebase-index.js`, `mcp-knowledgebase-server.js`, `knowledgebase-init.sql` to `scriptsToSync` array |
| `opencode.json` | Add `knowledgebase` MCP server config + `knowledgebase_*` permission |
| `package.json` | Add `pg`, `pgvector` as optionalDependencies; add `kb:sync`, `kb:search`, `kb:stats` scripts; add `.husky/post-commit` to `files` |
| `.env.example` | Add `DATABASE_URL` and `OPENAI_API_KEY` templates |
| `.opencode/agents/*.agent.md` | Add `"knowledgebase/*": allow` to permission blocks (all 12 agent files) |

---

## Implementation Notes for Coder

1. **All scripts are ESM** (`import`/`export` syntax), matching `"type": "module"` in `package.json`.
2. **Follow existing patterns exactly:**
   - MCP server → copy `scripts/mcp-memory-server.js` structure
   - CLI → copy `scripts/memory-cli.js` structure
   - Core engine → copy `scripts/memory-index.js` database patterns (but with `pg` instead of `better-sqlite3`)
   - Setup phase → copy `scripts/setup/sync-phase.js` child process spawn pattern
   - Git hook → copy `.husky/post-merge` conditional + graceful failure pattern
3. **Lazy imports for optional dependencies** (`pg`, `pgvector`, `@xenova/transformers`) — use dynamic `import()` inside try/catch with helpful error messages.
4. **All exported functions gracefully handle missing database** — check if pool is null, return empty/zero results, never throw.
5. **Content hash idempotency** uses `SHA-256(content + session_date + pipeline)` — persistent across re-indexing.
6. **Unit tests** (following `scripts/setup/*.test.js` Vitest patterns):
   - `knowledgebase-index.test.js` — mock `pg.Pool`, test chunk insertion, search, stats with mock data
   - `knowledgebase-cli.test.js` — mock index module, test CLI arg parsing, JSON output format
   - `setup/knowledgebase.test.js` — test Phase 6 with/without DATABASE_URL, with/without package.json name
7. **`knowledgebase-init.sql` must match `ensureSchema()` DDL byte-for-byte** — same source of truth, two delivery paths (auto-provision and manual).
