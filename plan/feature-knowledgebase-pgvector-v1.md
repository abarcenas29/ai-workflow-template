---
goal: "Implement centralized knowledgebase with PostgreSQL + pgvector for cross-project learned knowledge sharing via MCP server"
version: 1
date_created: 2026-07-29
status: In progress — Batch A (T1–T6) completed, Batch B (T7–T8) completed, Batch C (T9–T11) completed, Batch D (T12–T14) completed
tags: [feature, knowledgebase, pgvector, mcp, embeddings, postgresql]
---

# Feature: Centralized Knowledgebase — PostgreSQL + pgvector v1

## Introduction

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

The project currently has a **two-tier knowledge architecture**: (1) git-committed markdown files as the source of truth, and (2) a local SQLite + sqlite-vec vector index for per-project semantic search. This plan adds a **third layer**: a centralized PostgreSQL + pgvector knowledgebase for cross-project learned knowledge sharing, exposed to AI agents through an MCP server.

The architecture is defined in `docs/adr-knowledgebase-pgvector.md` (ADR-001) and informed by the research spike at `docs/spike-centralized-knowledgebase-pgvector.md`. Key design decisions: separate MCP server (not merged with memory-bank), raw SQL with `pg` + `pgvector` npm (no ORM), `all-MiniLM-L6-v2` (384d) as the default embedding model, session-level chunks with "New knowledge" bullets only, post-commit git hook for automated syncing, and graceful degradation when `DATABASE_URL` is not configured.

This plan defines **17 tasks across 5 parallel batches** — producing 7 new files and modifying 19 existing files. Batches A, B, D, and E can execute all tasks concurrently. The plan supports the orchestrator's parallel coder execution pattern.

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T3, T4, T5, T6 | Yes — 6 tasks | — |
| B | T7, T8 | Yes — 2 tasks | T6 |
| C | T9, T10, T11 | Yes — 3 tasks | T5, T6, T7 |
| D | T12, T13, T14 | Yes — 3 tasks | — (independent) |
| E | T15, T16, T17 | Yes — 3 tasks | T6, T7, T9 |

**Total: 17 tasks across 5 batches.** Batches A and D have zero internal dependencies and can run all tasks concurrently. Batch B depends only on T6. Batch C depends on T5, T6, and T7. Batch E depends on T6, T7, and T9.

---

## 1. Requirements & Constraints

### Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| REQ-01 | Core engine (`knowledgebase-index.js`) must export functions for connection management, embedding generation, CRUD ops, semantic search, and stats | ADR §3.2 |
| REQ-02 | CLI (`knowledgebase-cli.js`) must support `sync`, `search`, `list`, `stats` commands with JSON output | ADR §3.3 |
| REQ-03 | MCP server (`mcp-knowledgebase-server.js`) must expose 4 tools via stdio transport: `knowledgebase_search`, `knowledgebase_index`, `knowledgebase_stats`, `knowledgebase_list` | ADR §5 |
| REQ-04 | Setup Phase 6 (`setup/knowledgebase.js`) must register consumer projects via child process spawn of `knowledgebase-cli.js sync` | ADR §3.5, §7 |
| REQ-05 | PostgreSQL schema must include `projects` and `knowledge_chunks` tables with HNSW index, content_hash idempotency, and composite unique constraint | ADR §2 |
| REQ-06 | `knowledgebase-init.sql` must match `ensureSchema()` DDL byte-for-byte (manual fallback for `CREATE EXTENSION` failures) | ADR §2, §3.6 |
| REQ-07 | `.husky/post-commit` hook must detect `learned-knowledge.instructions.md` changes and trigger CLI sync, always exiting 0 | ADR §8 |
| REQ-08 | All operations must gracefully degrade when `DATABASE_URL` is not configured — never throw, never block | ADR §4 |
| REQ-09 | Agent instructions (`knowledgebase.instructions.md`) must tell agents when/how to query the knowledgebase | ADR §9 |
| REQ-10 | All 14 agent files (10 regular + 3 orchestrator sub-agents) must grant `knowledgebase/*` permission | ADR §9.2 |
| REQ-11 | `opencode.json` must register the `knowledgebase` MCP server with `node scripts/mcp-knowledgebase-server.js` command | ADR §3.4 |
| REQ-12 | `package.json` must add `pg` and `pgvector` as optionalDependencies, add kb:* scripts, and add `.husky/post-commit` to `files` | ADR §7.8 |
| REQ-13 | `.env.example` must include `DATABASE_URL` and `OPENAI_API_KEY` templates | ADR §7.9 |

### Constraints

| ID | Constraint |
|----|------------|
| CON-01 | PostgreSQL + pgvector is an **external service** — not embedded. Consumer projects need a running instance. |
| CON-02 | The knowledgebase is **optional** — no consumer project should break or show errors if `DATABASE_URL` is not configured. |
| CON-03 | The project is **ESM only** (`"type": "module"` in package.json). All new scripts use `import`/`export`. |
| CON-04 | `@xenova/transformers` + `all-MiniLM-L6-v2` (384d) is already an optional dependency. Reuse this embedding pipeline. |
| CON-05 | `@modelcontextprotocol/sdk` v1.0.0 is already a runtime dependency. Zero new MCP framework dependencies. |
| CON-06 | `dotenv` is already a devDependency. No new `.env` loading library needed. |
| CON-07 | The `pg` + `pgvector` npm packages must be added as optional dependencies (matching the `@xenova/transformers` pattern). |
| CON-08 | All database queries use parameterized queries (`$1`, `$2`, ...) — no string interpolation for SQL injection prevention. |
| CON-09 | The `knowledgebase-init.sql` must be synced alongside the JavaScript files (add to `scriptsToSync` in `sync.js`). |

### Security Constraints

| ID | Constraint |
|----|------------|
| SEC-01 | `DATABASE_URL` never hardcoded, never committed, never logged in full — redacted in error messages |
| SEC-02 | `OPENAI_API_KEY` never logged, never returned in API responses — logged as `'***'` |

---

## 2. Implementation Steps

### Phase 1 — Foundation (Batch A — Parallel)

**GOAL:** Create all standalone files with zero internal code dependencies. All 6 tasks can execute concurrently.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | **Create `scripts/knowledgebase-init.sql` — manual DB provisioning fallback.** Create the file with the exact DDL from ADR §2: `CREATE EXTENSION IF NOT EXISTS vector`, `CREATE TABLE IF NOT EXISTS projects (...)` with columns `id TEXT PK`, `name TEXT NOT NULL`, `first_indexed_at TIMESTAMPTZ DEFAULT NOW()`, `last_indexed_at TIMESTAMPTZ DEFAULT NOW()`. `CREATE TABLE IF NOT EXISTS knowledge_chunks (...)` with columns `id BIGSERIAL PK`, `project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE`, `session_date DATE NOT NULL`, `session_title TEXT`, `pipeline TEXT`, `coverage TEXT`, `tdd_iterations INTEGER NOT NULL DEFAULT 0`, `content TEXT NOT NULL`, `content_hash TEXT NOT NULL`, `embedding VECTOR(384)`, `indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, and `CONSTRAINT uq_knowledge_chunk UNIQUE (project_id, session_date, content_hash)`. Add HNSW index: `CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`. Add B-tree indexes: `idx_knowledge_chunks_project_id`, `idx_knowledge_chunks_session_date`, `idx_knowledge_chunks_pipeline`, `idx_projects_last_indexed`. Add `match_knowledge` function for cosine similarity search with optional project_id filter. Include explanatory header comments about the file's purpose and how to run it (`psql $DATABASE_URL -f scripts/knowledgebase-init.sql`). Include comments about the OpenAI upgrade path (`ALTER TABLE ... ALTER COLUMN embedding TYPE VECTOR(1536)`). | `scripts/knowledgebase-init.sql` (NEW) | A | — | 2026-07-29 |
| T2 | **Create `.husky/post-commit` — git hook template.** Follow the exact `post-merge` hook pattern. Content: line 1 = `# Managed by @abarcenas/ai-workflow-template setup`, line 2 = `#!/bin/sh`, line 3 = `. "$(dirname "$0")/_/husky.sh"`. Then: detect if `learned-knowledge.instructions.md` changed via `git diff HEAD~1 --name-only 2>/dev/null | grep ".agents/instructions/learned-knowledge.instructions.md"`. If changed: echo message, run `node scripts/knowledgebase-cli.js sync 2>/dev/null || echo "[knowledgebase] Sync skipped (DATABASE_URL not configured or service unavailable)"`. Always exit 0. The hook must be made executable (`chmod +x`). Use `2>/dev/null` suppression and `||` fallback matching the `post-merge` pattern. | `.husky/post-commit` (NEW) | A | — | 2026-07-29 |
| T3 | **Create `.agents/instructions/knowledgebase.instructions.md` — agent instruction file.** Follow the format from ADR §9.1 with YAML frontmatter `applyTo: "**"`. Content sections: (1) MCP Tools table listing `knowledgebase_search`, `knowledgebase_index`, `knowledgebase_stats`, `knowledgebase_list`; (2) **When to Query** — 5 scenarios: planning tasks, encountering errors, architectural decisions, tech-specific gotchas, agent tuning; (3) **How to Query** — natural language examples with `knowledgebase_search({ query, topK })` and optional `projectId` filter; (4) **How to Interpret Results** — similarity score thresholds (≥0.85 highly relevant, 0.70–0.84 relevant, <0.70 tangentially related) and result fields (project, date, pipeline, content); (5) **When NOT to Query** — file paths, current task status, code implementation details; (6) **Relationship to Memory Bank** — knowledgebase = cross-project patterns vs memory bank = per-project state. | `.agents/instructions/knowledgebase.instructions.md` (NEW) | A | — | 2026-07-29 |
| T4 | **Update `.env.example` — add knowledgebase environment variables.** Append two new sections to the existing `.env.example` file (after line 21, before end of file): (1) `# PostgreSQL connection string for centralized knowledgebase (pgvector)` with commented-out `# DATABASE_URL=postgresql://user:password@localhost:5432/knowledgebase`; (2) `# OpenAI API key for higher-quality embeddings (optional — falls back to local @xenova/transformers)` with commented-out `# OPENAI_API_KEY=sk-...`. Maintain 2-space blank line separation from existing content. Preserve all existing Playwright configuration vars. | `.env.example` (MODIFY) | A | — | 2026-07-29 |
| T5 | **Update `scripts/setup/constants.js` — add post-commit hook, skip flag, and hook content.** Three changes: **(a)** Add `'post-commit'` entry to `TEMPLATE_HOOKS` object (after the `post-merge` entry, before the closing `}`). The entry includes: `source: '.husky/post-commit'`, `content` matching the exact content from T2 (array joined with `'\n'`), and `description: 'Auto-sync learned knowledge to centralized knowledgebase after commits'`. **(b)** Add `'--skip-knowledgebase': 'skipKnowledgebase'` to `SUPPORTED_FLAGS` object (after `--skip-sync` entry). **(c)** Ensure no other constants are modified — the `CI_ENV_VARS`, `EXIT_CODES`, `REQUIRED_DIRS`, `UNICODE_CHARS`, and `MEMORY_BANK_STUBS` remain unchanged. The `installHooks()` function in `hooks.js` iterates `Object.keys(TEMPLATE_HOOKS)` — adding a new key automatically includes it in hook installation with zero changes to `hooks.js`. | `scripts/setup/constants.js` (MODIFY) | A | — | 2026-07-29 |
| T6 | **Create `scripts/knowledgebase-index.js` — core engine (~350 lines).** [See file for full implementation description] | `scripts/knowledgebase-index.js` (NEW) | A | — | 2026-07-29 |

**Validation:**
- **T1:** `node --check` passes. SQL syntax: `psql $DATABASE_URL -f scripts/knowledgebase-init.sql` creates both tables with all indexes.
- **T2:** `bash -n .husky/post-commit` passes syntax check. File is executable (`-rwxr-xr-x`).
- **T3:** File has valid YAML frontmatter with `applyTo: "**"`. All 6 sections present.
- **T4:** `grep -c DATABASE_URL .env.example` returns 1. `grep -c OPENAI_API_KEY .env.example` returns 1. Existing Playwright vars preserved.
- **T5:** `node --input-type=module -e "import { TEMPLATE_HOOKS, SUPPORTED_FLAGS } from './scripts/setup/constants.js'; console.log(Object.keys(TEMPLATE_HOOKS).includes('post-commit'), SUPPORTED_FLAGS['--skip-knowledgebase'])"` prints `true skipKnowledgebase`.
- **T6:** `node --check scripts/knowledgebase-index.js` passes. Import all public APIs and verify each function loads without error.

**Post-Plan Fix (2026-07-30):** Fixed embedding pipeline bug in `embed()` — was returning `Float32Array` which pgvector's `toSql()` rejects (`Array.isArray()` returns `false` on typed arrays). Changed return to `Array.from(result.data)` — a regular `Array` that pgvector accepts. `npm run kb:sync` now correctly stores embedding vectors (previously inserted all chunks with `null` embedding). See `memory-bank/activeContext.md` for full details.

---

### Phase 2 — CLI + MCP Server (Batch B — Parallel, depends on T6) ✅ COMPLETED

**GOAL:** Build the CLI and MCP server, both importing from the core engine. These two tasks are fully parallel since they only depend on T6 (the shared core), not on each other.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T7 | **Create `scripts/knowledgebase-cli.js` — CLI entry point (~200 lines).** Mirror `scripts/memory-cli.js` architecture exactly. **Imports:** `knowledgebase-index.js` (`search`, `indexProject`, `registerProject`, `getStats`, `listProjects`, `closePool`), `node:fs`, `node:path`. **Commands:** `sync [--project <id>]` — resolves project ID from `--project` flag or `package.json` `name` field; calls `registerProject()` then parses `learned-knowledge.instructions.md` via `parseLearnedKnowledge()`; for each session chunk, calls `upsertChunk()` with metadata; prints JSON `{"status":"ok","project_id":"...","chunks":{"indexed":N,"skipped":M}}`. `search "<query>" [--topK N] [--project <id>]` — calls `search()` and prints JSON array of results. `list` — calls `listProjects()` and prints JSON array. `stats` — calls `getStats()` and prints JSON object. **Parser:** `parseLearnedKnowledge(filePath)` splits by regex `/(?=^## Session: )/m`, extracts `session_date` (`/^## Session: (\d{4}-\d{2}-\d{2})/`), `session_title`, `pipeline` (`/\*\*Pipeline:\*\*\s*(.+)/`), `coverage` (`/\*\*Coverage:\*\*\s*(.+)/`), `tdd_iterations` (`/\*\*TDD Iterations:\*\*\s*(\d+)/`), and `content` (all bullet lines after `**New knowledge:**` marker until next `**` heading, joined with newlines). Computes `content_hash` via `SHA-256(content + session_date + pipeline)`. Skip sessions with empty content. **Error handling:** All commands wrapped in try/catch → JSON error to stderr → `process.exit(1)`. `closePool()` in finally block. If `getPool()` returns null → print "DATABASE_URL not configured" → `process.exit(0)`. **Embedding context prep:** When embedding, prepend `Session: {date} — Pipeline: {pipeline}\n` before the content text. | `scripts/knowledgebase-cli.js` (NEW) | B | T6 | 2026-07-29 |
| T8 | **Create `scripts/mcp-knowledgebase-server.js` — MCP server (~220 lines).** Mirror `scripts/mcp-memory-server.js` architecture exactly. **Imports:** `Server` and `StdioServerTransport` from `@modelcontextprotocol/sdk`, `CallToolRequestSchema` and `ListToolsRequestSchema` from `@modelcontextprotocol/sdk/types.js`, and `search`, `indexProject`, `getStats`, `listProjects`, `closePool` from `./knowledgebase-index.js`. **Server init:** `new Server({ name: 'knowledgebase', version: '1.0.0' }, { capabilities: { tools: {} } })`. **Tool registration (ListToolsRequestSchema):** Return 4 tool definitions: `knowledgebase_search` (query: string required, topK: number default 5, projectId: string optional), `knowledgebase_index` (projectId: string optional), `knowledgebase_stats` (no params), `knowledgebase_list` (no params). Tool descriptions match ADR §5 exactly. **Tool handlers (CallToolRequestSchema):** Switch on tool name. `knowledgebase_search`: call `search(args.query, { topK: args.topK, projectId: args.projectId })`; if no results → "No results found. The knowledgebase may be empty or DATABASE_URL may not be configured."; if database unavailable → "Knowledgebase not available: DATABASE_URL is not configured."; format results as markdown with similarity score and metadata per ADR §5.1. `knowledgebase_index`: call `indexProject(args.projectId || autoDetectFromCwd(), filePath)`; format response as "Indexed N chunks, skipped M". `knowledgebase_stats`: call `getStats()`; format response as markdown table. `knowledgebase_list`: call `listProjects()`; format as "**Indexed Projects:**" list. All handlers wrapped in try/catch → return `{ isError: true, content: [...] }`. **Transport:** `StdioServerTransport` → `server.connect(transport)`. **Lifecycle:** `console.error('[knowledgebase-mcp] Server started via stdio transport')` on startup. `process.on('SIGTERM', closePool)`. **Error handling:** If core functions return null/empty (no pool), handlers return descriptive "DATABASE_URL not configured" messages — never throw exceptions. | `scripts/mcp-knowledgebase-server.js` (NEW) | B | T6 | 2026-07-29 |

**Validation:**
- **T7:** `node scripts/knowledgebase-cli.js sync --help` prints usage. `node scripts/knowledgebase-cli.js search "test"` with `DATABASE_URL` unset prints "DATABASE_URL not configured" and exits 0. `node --check scripts/knowledgebase-cli.js` passes.
- **T8:** `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node scripts/mcp-knowledgebase-server.js` returns list of 4 tools. Server starts without errors when `DATABASE_URL` is unset (graceful — logs warning to stderr). `node --check scripts/mcp-knowledgebase-server.js` passes.

---

### Phase 3 — Setup Integration (Batch C — Parallel, depends on T5, T6, T7) ✅ COMPLETED

**GOAL:** Wire the knowledgebase into the setup pipeline. All 3 tasks can execute in parallel since they modify different files.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T9 | **Create `scripts/setup/knowledgebase.js` — Setup Phase 6 module (~80 lines).** Follow the `sync-phase.js` child process spawn pattern. **Export:** `async function registerKnowledgebase(context)` returning `{ action: 'indexed'|'skipped'|'failed', message, chunks_indexed?, chunks_skipped? }`. **Logic:** (1) Extract `projectId` from `context.consumerPackageJson?.name` — if missing, return `{ action: 'skipped', message: 'No project name in package.json' }`. (2) Resolve CLI path: `join(resolvePackageRoot(), 'scripts', 'knowledgebase-cli.js')`. (3) Spawn `knowledgebase-cli.js sync --project <id>` as child process using the `spawnScript()` pattern from `sync-phase.js` (import or inline the helper). Set `INIT_CWD` env var to `consumerRoot`. (4) If spawn fails (non-zero exit): return `{ action: 'failed', message: 'Knowledgebase sync failed: ...' }`. (5) If spawn succeeds: parse JSON output, return `{ action: 'indexed', message: 'Registered "projectId" — N chunks indexed, M skipped' }`. (6) If `spawnScript` throws (script not found): return `{ action: 'skipped', message: 'knowledgebase-cli.js not available' }`. **Imports:** `spawn` from `child_process`, `join` from `path`, `resolvePackageRoot` from `./utils.js`. | `scripts/setup/knowledgebase.js` (NEW) | C | T7 | 2026-07-29 |
| T10 | **Update `scripts/setup/index.js` — add Phase 6 knowledgebase registration.** Insert Phase 6 between Phase 5 (Sync) and the Summary, following the exact pattern of existing phases. Add `import { registerKnowledgebase } from './knowledgebase.js'` to imports. After the Phase 5 `try/catch` block (after line 332) and before the Summary section (line 334), add: `if (!flags.skipKnowledgebase) { section('Phase 6: Knowledgebase'); try { const kbResult = await registerKnowledgebase(context); context.kbResult = kbResult; phases.push({ phase: 'knowledgebase', status: actionStatus(kbResult.action), message: kbResult.message }); } catch (err) { stepWarn(\`Knowledgebase registration skipped: \${err.message}\`); phases.push({ phase: 'knowledgebase', status: 'warn', message: \`Skipped — \${err.message}\` }); } }`. **Key behavior:** Phase 6 always runs (unless `--skip-knowledgebase`), gracefully skips when `DATABASE_URL` is not configured (via the spawned CLI's built-in graceful degradation), and is non-fatal — failure does not block the pipeline. The `actionStatus()` function is already defined (line 78) — add `'indexed'` to the success case group. | `scripts/setup/index.js` (MODIFY) | C | T5, T9 | 2026-07-29 |
| T11 | **Update `scripts/sync.js` — add knowledgebase scripts to sync.** Add 4 new entries to the `scriptsToSync` array (line 176–183): `'knowledgebase-cli.js'`, `'knowledgebase-index.js'`, `'mcp-knowledgebase-server.js'`, and `'knowledgebase-init.sql'` (the SQL file is synced alongside JS files in the same `scripts/` target). Insert them after the existing `'mcp/playwright-mcp-launcher.js'` entry (line 182) and before the closing `]`. No other changes to `sync.js` — the existing hash-based manifest pattern and per-file verbose logging automatically apply to these new entries. The verbose logging added in T7 of the verbose-logging plan (`isVerbose` check + `console.error` calls) already covers the `__scripts__/` sync loop. | `scripts/sync.js` (MODIFY) | C | T5, T6, T7, T8 | 2026-07-29 |

**Validation:**
- **T9:** `node --check scripts/setup/knowledgebase.js` passes. Import and call with mock context (no DATABASE_URL) returns `{ action: 'skipped' }`. Call with valid DATABASE_URL and project context spawns CLI → returns `{ action: 'indexed' }` or `{ action: 'failed' }`.
- **T10:** `npx vitest run scripts/setup/index.test.js` — existing 24 tests pass. New `--skip-knowledgebase` flag test: mocks `registerKnowledgebase` to return `{ action: 'indexed' }`, runs full pipeline, verifies Phase 6 appears in phases array with correct status. Verifies `actionStatus('indexed')` returns `'success'`. All 24 previously-passing tests remain passing (zero regressions).
- **T11:** `node --check scripts/sync.js` passes. Run `node scripts/sync.js --dry-run` and verify output includes `knowledgebase-cli.js`, `knowledgebase-index.js`, `mcp-knowledgebase-server.js`, and `knowledgebase-init.sql`.

---

### Phase 4 — Config & Agent Files (Batch D — Parallel)

**GOAL:** Update configuration files and agent permissions. All 3 tasks are independent of each other and of the code in earlier phases — they can run concurrently.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T12 | **Update `opencode.json` — register knowledgebase MCP server and add permission.** Two changes: **(a)** Add `"knowledgebase"` entry to the `mcp` object (after `"memory-bank"` entry, before closing `}`). Format: `"knowledgebase": { "type": "local", "command": ["node", "scripts/mcp-knowledgebase-server.js"], "enabled": true }`. **(b)** Add `"knowledgebase_*": "allow"` to the `permission` object (after `"memory-bank_*": "allow"` entry). Maintain exact JSON formatting: 2-space indent, trailing commas consistent with existing style. | `opencode.json` (MODIFY) | D | — | 2026-07-29 |
| T13 | **Update `package.json` — add optional deps, scripts, and files entries.** Three changes: **(a)** Add `"pg": "^8.13.0"` and `"pgvector": "^0.3.0"` to the `optionalDependencies` object (after `"@xenova/transformers"` entry). **(b)** Add 3 new scripts to the `scripts` object (after `"memory:normalize"` entry): `"kb:sync": "node ./scripts/knowledgebase-cli.js sync"`, `"kb:search": "node ./scripts/knowledgebase-cli.js search"`, `"kb:stats": "node ./scripts/knowledgebase-cli.js stats"`. **(c)** Add `".husky/post-commit"` to the `files` array (after `".husky/post-merge"` entry). Maintain 2-space indent and trailing newline. | `package.json` (MODIFY) | D | — | 2026-07-29 |
| T14 | **Update all 13 agent files — add `knowledgebase/*` permission.** For each agent file, add `"knowledgebase/*": allow` to the YAML frontmatter `permission` block. The permission line should be added after the existing `"memory-bank/*": allow` line. **Files to modify (13 total):** (1) `.opencode/agents/architect.agent.md` (after line 7: `"memory-bank/*": allow`), (2) `.opencode/agents/coder.agent.md` (after line 9), (3) `.opencode/agents/deployer.agent.md`, (4) `.opencode/agents/designer.agent.md`, (5) `.opencode/agents/e2e-tester.agent.md`, (6) `.opencode/agents/implementer.agent.md` (after line 9), (7) `.opencode/agents/researcher.agent.md`, (8) `.opencode/agents/reviewer.agent.md`, (9) `.opencode/agents/tracker.agent.md` (after line 10), (10) `.opencode/agents/unit-tester.agent.md` (after line 9), (11) `.opencode/agents/orchestrator/orchestrator.agent.md` (after line 14: `"memory-bank/*": allow`), (12) `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` (after line 9: `"memory-bank/*": allow`), (13) `.opencode/agents/orchestrator/feature-pipeline.agent.md` (after line 9: `"memory-bank/*": allow`). The `plan.agent.md` file is NOT modified (not in scope). Each file uses the exact same indentation as the existing `"memory-bank/*": allow` line (alternates between 2 spaces or tab depending on file — match existing). **Note:** `implementer.agent.md` already has its own permission section that will also receive this addition; this is intentional — the implementer agent should also be able to query the knowledgebase during planning. | 13 agent files (MODIFY) | D | — | 2026-07-29 |

**Validation:**
- **T12:** `node -e "const c = require('./opencode.json'); console.log(c.mcp.knowledgebase.command[1], c.permission.knowledgebase_*)"` prints `scripts/mcp-knowledgebase-server.js allow`. JSON is valid.
- **T13:** `node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.optionalDependencies.pg, p.scripts['kb:sync'], p.files.includes('.husky/post-commit'))"` prints version, script, and `true`. JSON is valid.
- **T14:** For each of the 13 agent files: `grep -c '"knowledgebase/\*": allow' .opencode/agents/<file>` prints `1`. Files remain valid YAML.

---

### Phase 5 — Tests (Batch E — Parallel, depends on T6, T7, T9)

**GOAL:** Add unit test coverage for the core engine, CLI, and setup module. All 3 test files can execute in parallel since they mock their own dependencies.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T15 | **Create `scripts/knowledgebase-index.test.js` — unit tests for core engine.** Use Vitest with `vi.mock()` for `pg` and `@xenova/transformers`. Tests: **(a)** `getPool()` returns null when `DATABASE_URL` is unset — verifies warning logged. **(b)** `getPool()` returns pool when `DATABASE_URL` is set — verifies pool config (max: 5, idleTimeoutMillis: 30000). **(c)** `embed()` returns Float32Array(384) — mock the transformers pipeline to return known tensor data. **(d)** `registerProject()` inserts new project — mock pool.query to return `{ rows: [{ id, first_indexed_at }] }`. **(e)** `upsertChunk()` inserts chunk and returns `{ action: 'inserted' }`. **(f)** `upsertChunk()` skips duplicate (ON CONFLICT DO NOTHING) and returns `{ action: 'skipped' }`. **(g)** `search()` returns ranked results with similarity scores — mock pool.query to return `{ rows: [{ ..., similarity: 0.87 }] }`. **(h)** `search()` returns `[]` when pool is null. **(i)** `getStats()` returns `{ total_projects, total_chunks, db_size }`. **(j)** `listProjects()` returns array of project objects. **(k)** `ensureSchema()` catches `CREATE EXTENSION` failure and logs instructions. **(l)** `closePool()` calls `pool.end()`. Use `vi.mock('pg', ...)` and `vi.mock('pgvector', ...)` to avoid real database connections. Follow existing test patterns from `scripts/setup/*.test.js`. | `scripts/knowledgebase-index.test.js` (NEW) | E | T6 | |
| T16 | **Create `scripts/knowledgebase-cli.test.js` — unit tests for CLI.** Mock `knowledgebase-index.js` module. Tests: **(a)** `sync` command resolves project ID from package.json when `--project` not provided. **(b)** `sync` command registers project and indexes chunks — verifies expected JSON output. **(c)** `sync` exits 0 with "DATABASE_URL not configured" when pool is null. **(d)** `search` command returns JSON array of results. **(e)** `search` command returns empty array when no results. **(f)** `list` command returns JSON array of projects. **(g)** `stats` command returns JSON object with stats. **(h)** `parseLearnedKnowledge()` extracts sessions correctly from sample markdown — verifies session_date, pipeline, content fields. **(i)** `parseLearnedKnowledge()` skips sessions with empty "New knowledge" content. **(j)** `parseLearnedKnowledge()` handles optional session title after date. Use `vi.mock('../knowledgebase-index.js', ...)` with `vi.importActual` if needed. Spawn CLI as child process or test the exported functions directly — prefer direct function testing for unit tests. | `scripts/knowledgebase-cli.test.js` (NEW) | E | T7 | |
| T17 | **Create `scripts/setup/knowledgebase.test.js` — unit tests for Phase 6 module.** Tests: **(a)** Returns `{ action: 'skipped' }` when `consumerPackageJson` has no `name` field. **(b)** Returns `{ action: 'skipped' }` when `DATABASE_URL` is not configured (simulate via child process returning exit 0 with "not configured" message). **(c)** Returns `{ action: 'indexed' }` with chunk counts when child process succeeds and returns valid JSON. **(d)** Returns `{ action: 'failed' }` when child process exits non-zero. **(e)** Returns `{ action: 'skipped' }` when `knowledgebase-cli.js` doesn't exist (spawn throws ENOENT). **(f)** Handles malformed JSON from child process output gracefully (returns `{ action: 'indexed' }` with generic message). Use `vi.mock('child_process', ...)` to mock `spawn` with a fake `EventEmitter` child process that emits `close` with configurable exit code. Follow the `sync-phase.test.js` pattern. | `scripts/setup/knowledgebase.test.js` (NEW) | E | T9 | |

**Validation:**
- **T15:** `npx vitest run scripts/knowledgebase-index.test.js` — all 12 tests pass.
- **T16:** `npx vitest run scripts/knowledgebase-cli.test.js` — all 10 tests pass.
- **T17:** `npx vitest run scripts/setup/knowledgebase.test.js` — all 6 tests pass.
- **Full suite:** `npx vitest run scripts/` — all existing tests (104+) + 28 new tests pass.

---

## 3. Alternatives

| ID | Alternative | Decision |
|----|-------------|----------|
| ALT-01 | **Merge knowledgebase into memory MCP server** | **Rejected.** Different databases (PostgreSQL vs SQLite), different lifecycles (optional vs always-available), different failure modes (network vs filesystem). The existing `opencode.json` already shows 9 separate MCP servers — adding a 10th follows the established architecture. See ADR §Alternatives ALT-01. |
| ALT-02 | **Use an ORM (Drizzle, Prisma, Knex)** | **Rejected.** Only ~4 query types needed (insert, search, stats, list). Raw SQL with `pg` is simpler, matches existing `memory-index.js` patterns, and gives full control over pgvector-specific SQL (`<=>` operator, HNSW index creation). See ADR §Alternatives ALT-02. |
| ALT-03 | **Embed full session blocks** | **Rejected.** Embedding structural metadata (dates, pipeline names, coverage numbers) wastes embedding dimensions on low-semantic-value content. "New knowledge" bullets are what agents actually need to find. Metadata is stored in DB columns for structured filtering. See ADR §Alternatives ALT-03. |
| ALT-04 | **OpenAI embeddings as default** | **Rejected.** `all-MiniLM-L6-v2` (384d) is already an optionalDep, runs locally, costs $0, and achieves 78% recall@5 — sufficient for <<10k chunks. OpenAI (`text-embedding-3-small`) is offered as a configurable upgrade via `OPENAI_API_KEY`. See ADR §Alternatives ALT-04. |
| ALT-05 | **Pre-commit hook instead of post-commit** | **Rejected.** The knowledgebase sync needs the latest committed content. Pre-commit would index uncommitted content. Post-commit matches the existing `post-merge` hook pattern. See ADR §Alternatives ALT-05. |

---

## 4. Dependencies

| ID | Description | Required | Provided By |
|----|-------------|----------|-------------|
| DEP-01 | `knowledgebase-index.js` core engine — all DB operations, embedding, search | Yes | T6 |
| DEP-02 | `knowledgebase-cli.js` — used by post-commit hook and setup Phase 6 | Yes | T7 |
| DEP-03 | `mcp-knowledgebase-server.js` — exposes tools to AI agents | Yes | T8 |
| DEP-04 | `scripts/setup/knowledgebase.js` — Phase 6 registration module | Yes | T9 |
| DEP-05 | `pg` (node-postgres) — PostgreSQL client | Yes (optionalDep) | npm |
| DEP-06 | `pgvector` (npm) — `toSql()`/`fromSql()` vector conversion | Yes (optionalDep) | npm |
| DEP-07 | `@xenova/transformers` — embedding pipeline (all-MiniLM-L6-v2, 384d) | Yes (existing optionalDep) | npm |
| DEP-08 | `@modelcontextprotocol/sdk` v1.0.0 — MCP stdio transport | Yes (existing dep) | npm |
| DEP-09 | `dotenv` — .env file loading for DATABASE_URL | Yes (existing devDep) | npm |
| DEP-10 | `scripts/setup/constants.js` — TEMPLATE_HOOKS + SUPPORTED_FLAGS | Yes | T5 |
| DEP-11 | `scripts/sync.js` — scriptsToSync array for consumer distribution | Yes | T11 |
| DEP-12 | `scripts/setup/index.js` — orchestrator Phase 6 integration | Yes | T10 |

---

## 5. Files

### New Files (7)

| File ID | Path | Description | Lines (est.) |
|---------|------|-------------|--------------|
| FILE-01 | `scripts/knowledgebase-index.js` | Core engine: connection pool, embedding, CRUD, search | ~350 |
| FILE-02 | `scripts/knowledgebase-cli.js` | CLI: sync, search, list, stats commands | ~200 |
| FILE-03 | `scripts/mcp-knowledgebase-server.js` | MCP server: stdio transport, 4 tool handlers | ~220 |
| FILE-04 | `scripts/setup/knowledgebase.js` | Setup Phase 6: project registration | ~80 |
| FILE-05 | `scripts/knowledgebase-init.sql` | Manual DB provisioning fallback | ~60 |
| FILE-06 | `.husky/post-commit` | Git hook: detect knowledge changes, trigger sync | ~15 |
| FILE-07 | `.agents/instructions/knowledgebase.instructions.md` | Agent instructions: when/how to query | ~80 |

### New Test Files (3)

| File ID | Path | Description |
|---------|------|-------------|
| FILE-08 | `scripts/knowledgebase-index.test.js` | Unit tests for core engine (~12 tests) |
| FILE-09 | `scripts/knowledgebase-cli.test.js` | Unit tests for CLI (~10 tests) |
| FILE-10 | `scripts/setup/knowledgebase.test.js` | Unit tests for Phase 6 module (~6 tests) |

### Modified Files (19)

| File ID | Path | Change Summary |
|---------|------|----------------|
| FILE-11 | `scripts/setup/index.js` | Add Phase 6 knowledgebase registration (import + try/catch block after Phase 5, before Summary); add `'indexed'` to `actionStatus()` success cases |
| FILE-12 | `scripts/setup/constants.js` | Add `post-commit` to `TEMPLATE_HOOKS`; add `'--skip-knowledgebase'` to `SUPPORTED_FLAGS` |
| FILE-13 | `scripts/sync.js` | Add 4 entries to `scriptsToSync` array: `knowledgebase-cli.js`, `knowledgebase-index.js`, `mcp-knowledgebase-server.js`, `knowledgebase-init.sql` |
| FILE-14 | `opencode.json` | Add `knowledgebase` MCP server config; add `knowledgebase_*` permission |
| FILE-15 | `package.json` | Add `pg` + `pgvector` to optionalDependencies; add `kb:sync`, `kb:search`, `kb:stats` scripts; add `.husky/post-commit` to files |
| FILE-16 | `.env.example` | Add `DATABASE_URL` and `OPENAI_API_KEY` templates |
| FILE-17 | `.opencode/agents/architect.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-18 | `.opencode/agents/coder.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-19 | `.opencode/agents/deployer.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-20 | `.opencode/agents/designer.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-21 | `.opencode/agents/e2e-tester.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-22 | `.opencode/agents/implementer.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-23 | `.opencode/agents/researcher.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-24 | `.opencode/agents/reviewer.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-25 | `.opencode/agents/tracker.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-26 | `.opencode/agents/unit-tester.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-27 | `.opencode/agents/orchestrator/orchestrator.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-28 | `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` | Add `"knowledgebase/*": allow` to permission block |
| FILE-29 | `.opencode/agents/orchestrator/feature-pipeline.agent.md` | Add `"knowledgebase/*": allow` to permission block |

### Files NOT Modified (Verified)

| File ID | Path | Reason |
|---------|------|--------|
| NONE-01 | `scripts/setup/hooks.js` | `installHooks()` iterates `Object.keys(TEMPLATE_HOOKS)` — adding `post-commit` to the object in `constants.js` automatically includes it in hook installation. Zero code changes needed. |
| NONE-02 | `scripts/setup/husky-init.js` | No knowledgebase-specific changes. Husky initialization is unchanged. |
| NONE-03 | `scripts/setup/discover.js` | No knowledgebase-specific changes. Discovery is unchanged. |
| NONE-04 | `.opencode/agents/plan.agent.md` | Not in scope for this feature. Not listed in the requirement. |

---

## 6. Testing

### Unit Tests (Automated)

| ID | Description | Module Under Test | Type | Task |
|----|-------------|-------------------|------|------|
| TEST-01 | `getPool()` returns null when `DATABASE_URL` unset | `knowledgebase-index.js` | Unit | T15 |
| TEST-02 | `getPool()` returns configured pool when `DATABASE_URL` set | `knowledgebase-index.js` | Unit | T15 |
| TEST-03 | `embed()` returns Float32Array(384) | `knowledgebase-index.js` | Unit | T15 |
| TEST-04 | `registerProject()` inserts new project | `knowledgebase-index.js` | Unit | T15 |
| TEST-05 | `upsertChunk()` inserts new chunk | `knowledgebase-index.js` | Unit | T15 |
| TEST-06 | `upsertChunk()` skips duplicate (idempotency) | `knowledgebase-index.js` | Unit | T15 |
| TEST-07 | `search()` returns ranked results | `knowledgebase-index.js` | Unit | T15 |
| TEST-08 | `search()` returns `[]` when pool is null | `knowledgebase-index.js` | Unit | T15 |
| TEST-09 | `getStats()` returns stats object | `knowledgebase-index.js` | Unit | T15 |
| TEST-10 | `listProjects()` returns project array | `knowledgebase-index.js` | Unit | T15 |
| TEST-11 | `ensureSchema()` handles `CREATE EXTENSION` failure | `knowledgebase-index.js` | Unit | T15 |
| TEST-12 | `closePool()` calls `pool.end()` | `knowledgebase-index.js` | Unit | T15 |
| TEST-13 | CLI `sync` resolves project ID from package.json | `knowledgebase-cli.js` | Unit | T16 |
| TEST-14 | CLI `sync` indexes chunks and prints JSON | `knowledgebase-cli.js` | Unit | T16 |
| TEST-15 | CLI `sync` exits gracefully when DATABASE_URL unset | `knowledgebase-cli.js` | Unit | T16 |
| TEST-16 | CLI `search` returns JSON results | `knowledgebase-cli.js` | Unit | T16 |
| TEST-17 | CLI `list` and `stats` commands | `knowledgebase-cli.js` | Unit | T16 |
| TEST-18 | `parseLearnedKnowledge()` extracts sessions correctly | `knowledgebase-cli.js` | Unit | T16 |
| TEST-19 | `parseLearnedKnowledge()` skips empty sessions | `knowledgebase-cli.js` | Unit | T16 |
| TEST-20 | `registerKnowledgebase()` skips when no project name | `setup/knowledgebase.js` | Unit | T17 |
| TEST-21 | `registerKnowledgebase()` skips when DATABASE_URL unset | `setup/knowledgebase.js` | Unit | T17 |
| TEST-22 | `registerKnowledgebase()` returns indexed count on success | `setup/knowledgebase.js` | Unit | T17 |
| TEST-23 | `registerKnowledgebase()` returns failed on child process error | `setup/knowledgebase.js` | Unit | T17 |
| TEST-24 | `registerKnowledgebase()` handles CLI not found | `setup/knowledgebase.js` | Unit | T17 |
| TEST-25 | `registerKnowledgebase()` handles malformed JSON output | `setup/knowledgebase.js` | Unit | T17 |

### Integration Tests (Manual)

| ID | Description | Steps |
|----|-------------|-------|
| TEST-26 | **Full pipeline end-to-end:** Run `node bin/setup.js` with `DATABASE_URL` configured. Verify Phase 6 appears after Phase 5 and shows indexed chunks. Run again — verify idempotency (no duplicate indexing). | `createdb knowledgebase && psql knowledgebase -c "CREATE EXTENSION IF NOT EXISTS vector" && DATABASE_URL=... node bin/setup.js` |
| TEST-27 | **Graceful degradation:** Run `node bin/setup.js` WITHOUT `DATABASE_URL`. Verify Phase 6 shows "skipped" with descriptive message. Verify no errors, pipeline completes successfully. | `unset DATABASE_URL && node bin/setup.js` |
| TEST-28 | **Post-commit hook:** In a consumer project with `DATABASE_URL` configured, modify `learned-knowledge.instructions.md`, stage, and commit. Verify hook fires and indexes new content. | `git add . && git commit -m "test: add knowledge"` |
| TEST-29 | **MCP server tools:** Start the MCP server via pipe and test each tool with `tools/list` and `tools/call`. Verify all 4 tools are listed and respond correctly. | `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \| node scripts/mcp-knowledgebase-server.js` |
| TEST-30 | **Search quality:** Index 2–3 sessions of learned knowledge, then search for concepts from those sessions. Verify relevant results appear with similarity scores. | `node scripts/knowledgebase-cli.js search "verbose logging pattern"` |
| TEST-31 | **--skip-knowledgebase flag:** Run `node bin/setup.js --skip-knowledgebase`. Verify Phase 6 does not appear in the pipeline summary. | `node bin/setup.js --skip-knowledgebase --dry-run` |

### Regression Tests

| ID | Description |
|----|-------------|
| TEST-32 | Run `npx vitest run scripts/setup/` — all existing 104+ tests pass (discover: 21, hooks: 16, prepare: 27, index: 24, sync-phase: 5). Zero regressions from Phase 6 additions. |
| TEST-33 | Run `npx vitest run scripts/sync.test.js` — all existing 7 tests pass. The new scriptsToSync entries are additive, not breaking. |
| TEST-34 | `node --check scripts/setup/index.js` passes after Phase 6 addition. |
| TEST-35 | `node --check scripts/setup/constants.js` passes after TEMPLATE_HOOKS and SUPPORTED_FLAGS additions. |

---

## 7. Risks & Assumptions

### Risks

| ID | Description | Mitigation |
|----|-------------|------------|
| RISK-01 | Consumer projects without PostgreSQL cannot use the knowledgebase | By design — graceful degradation. All operations silently skip when `DATABASE_URL` is not configured. Post-commit hook uses `2>/dev/null \|\| echo` fallback. Phase 6 uses try/catch with `stepWarn`. MCP tools return descriptive "DATABASE_URL not configured" messages. |
| RISK-02 | `CREATE EXTENSION vector` requires superuser privileges | Auto-provision in `ensureSchema()` catches the error and directs to manual `scripts/knowledgebase-init.sql`. Many managed PostgreSQL services (Supabase, Neon, Aiven) pre-install pgvector. |
| RISK-03 | Connection pool exhaustion in multi-agent scenarios | Pool max set to 5, sufficient for single-user MCP stdio processes. `idleTimeoutMillis: 30000` frees idle connections. Connection timeout: 5000ms. |
| RISK-04 | Embedding model download size (~22MB for MiniLM) may surprise users on first run | Model is cached after first download. The memory bank already uses the same model — no additional download for existing users. |
| RISK-05 | `knowledgebase-cli.js` may not be synced when post-commit hook fires | Phase 5 (Sync) runs before Phase 6 (Knowledgebase) and copies all scripts including `knowledgebase-cli.js`. The hook fires only on subsequent commits, after setup is complete. Hook uses `2>/dev/null \|\| echo` fallback if CLI is missing. |
| RISK-06 | `post-commit` hook fires on every commit — potential performance impact | Only fires when `learned-knowledge.instructions.md` actually changed (filtered by `git diff HEAD~1 --name-only | grep`). Content hash idempotency prevents duplicate indexing. |
| RISK-07 | `setup/index.js` existing test mock may need updating for new import | The `vi.mock()` in `index.test.js` mocks all imported modules. Adding `import { registerKnowledgebase } from './knowledgebase.js'` adds a new import that must be mocked. Use `vi.mock('./knowledgebase.js', () => ({ registerKnowledgebase: vi.fn() }))` in test setup. |

### Assumptions

| ID | Description |
|----|-------------|
| ASSUMPTION-01 | `package.json` `name` field is a suitable project identifier. It is required by npm, stable across sessions, and unique within an organization. |
| ASSUMPTION-02 | `learned-knowledge.instructions.md` follows the defined session format (`## Session: YYYY-MM-DD`, `**Pipeline:**`, `**New knowledge:**` bullets). The format is enforced by the instructions file itself. |
| ASSUMPTION-03 | Single PostgreSQL instance serves multiple consumer projects. Each project connects with its own `DATABASE_URL`. All projects share the same `knowledge_chunks` table for cross-project search. |
| ASSUMPTION-04 | The `all-MiniLM-L6-v2` model is already cached from memory bank usage. The `@xenova/transformers` optional dependency is already installed in development. |
| ASSUMPTION-05 | The existing `spawnScript()` pattern from `sync-phase.js` is reusable for the Phase 6 child process. The `knowledgebase.js` module either imports the helper directly or inlines a simplified version. |
| ASSUMPTION-06 | `installHooks()` in `hooks.js` requires zero changes — adding `post-commit` to `TEMPLATE_HOOKS` in `constants.js` automatically includes it in hook installation. This is validated by the existing architecture. |
| ASSUMPTION-07 | The `actionStatus()` function in `index.js` treats unknown actions as `'warn'` by default — adding `'indexed'` to the success case group is an additive change with no regression risk. |

---

## 8. Related Specifications

- `docs/adr-knowledgebase-pgvector.md` — Architecture Decision Record (ADR-001) — complete design with schema, module APIs, MCP tool definitions, error handling matrix
- `docs/spike-centralized-knowledgebase-pgvector.md` — Research spike: pgvector embedding strategies, MCP server patterns, chunking approach, git hook design, consumer bootstrap
- `docs/spike-vector-db-memory.md` — Prior spike: sqlite-vec local vector index (Layer 2), embedding model decision
- `scripts/mcp-memory-server.js` — Reference MCP server implementation (tool registration, handler, stdio transport patterns)
- `scripts/memory-cli.js` — Reference CLI implementation (command routing, JSON output, graceful exit patterns)
- `scripts/memory-index.js` — Reference core engine (lazy imports, content hash idempotency, embedding pipeline)
- `scripts/setup/sync-phase.js` — Reference child process spawn pattern (`spawnScript()` with `stdio: 'inherit'` for verbose)
- `scripts/setup/index.js` — Reference orchestrator pattern (phase try/catch blocks, action status mapping, summary aggregation)
- `.husky/post-merge` — Reference git hook pattern (conditional file change detection, graceful failure)
- `plan/feature-verbose-logging-v1.md` — Prior plan with parallel batch structure (used as format template)
- `plan/feature-setup-command-v1.md` — Prior plan with setup pipeline integration patterns
