---
id: "spike-centralized-knowledgebase-pgvector"
title: "Spike: Centralized Knowledgebase — pgvector MCP Research"
updated: "2026-07-29"
tags: [researcher, research, spike, pgvector, embeddings, mcp, knowledgebase, learned-knowledge]
doc_type: "spike"
---

# Spike: Centralized Knowledgebase — pgvector MCP Research

**Status:** ✅ Complete
**Date:** 2026-07-29
**Researcher:** AI Agent (Researcher — Technical Investigation)

## Research Questions

1. **pgvector + Embedding Strategies** — Compare embedding providers, evaluate pgvector Node.js libraries, dimension tradeoffs, cost/latency analysis, `.env` credential patterns.
2. **MCP Server Patterns** — Study existing `scripts/mcp-memory-server.js` patterns, design knowledgebase query tools, evaluate separate vs. extended MCP server, agent instruction integration.
3. **Chunking Strategy** — Analyze `learned-knowledge.instructions.md` structure, determine split-by-session approach, define metadata extraction per chunk, decide embedding scope.
4. **Git Hook Integration** — Study existing husky hooks, design post-commit hook for learned-knowledge sync, integrate with setup pipeline.
5. **Consumer Bootstrap** — First-use detection, project registration, indexing on setup, integration with existing `npx ai-workflow-setup` flow.

---

## Investigation Results

### 1. pgvector + Embedding Strategies

#### 1.1 Embedding Provider Comparison

Three tiers of embedding providers were evaluated for the centralized knowledgebase use case:

| Model | Dimensions | Cost | Latency (per chunk) | Quality (Recall@5) | Offline | Dependencies |
|---|---|---|---|---|---|---|
| **all-MiniLM-L6-v2** (local, via `@xenova/transformers`) | 384 | $0 | ~12ms (CPU) | 78% | Yes | `@xenova/transformers` (22MB model, optionalDep) |
| **bge-small-en-v1.5** (local, via `@xenova/transformers`) | 384 | $0 | ~14ms (CPU) | 79% | Yes | `@xenova/transformers` (130MB model) |
| **gte-small** (local, via `@xenova/transformers`) | 384 | $0 | ~13ms (CPU) | 80% | Yes | `@xenova/transformers` (70MB model) |
| **text-embedding-3-small** (OpenAI API) | 1536 (config. down to 512) | $0.02/1M tokens | 200–400ms (network) | 83% | No | `openai` npm, API key |
| **text-embedding-3-large** (OpenAI API) | 3072 | $0.13/1M tokens | 200–400ms (network) | 87% | No | `openai` npm, API key |

**Key sources:**

- SynaBun benchmark (2026-04-29): 12,000 developer memories, 200 recall queries. Source: [synabun.ai/blog/all-minilm-l6-v2-mcp-vector-memory](https://synabun.ai/blog/all-minilm-l6-v2-mcp-vector-memory)
- Local AI Master benchmark (2026-04-23): 10,000 documents across legal/technical/clinical domains. Source: [localaimaster.com/blog/local-vs-openai-embeddings](https://localaimaster.com/blog/local-vs-openai-embeddings)
- OpenAI Embeddings Pricing: [developers.openai.com/api/docs/models/text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)

**Critical finding — The SynaBun article is directly relevant** because it uses the EXACT same tech stack already in this project:
- `@xenova/transformers` + `all-MiniLM-L6-v2` (already an optionalDep)
- `sqlite-vec` (already a dependency)
- `better-sqlite3` (already a dependency)
- Same MCP server pattern for AI agent memory

The SynaBun benchmark shows OpenAI's v3-small offers a 5-point recall@5 advantage over MiniLM (83% vs 78%), but every recall operation costs 200–400ms of network latency. For developer knowledgebase queries (<< 1,000 sessions of learned knowledge), the corpus is small enough that the recall quality gap is negligible.

#### 1.2 pgvector Node.js Libraries

| Library | Approach | ORM Support | Recommended For |
|---|---|---|---|
| **`pgvector` npm** (v0.3.0) | Adapter pattern wrapping multiple DB clients | node-postgres, Knex, Kysely, Sequelize, Prisma, Drizzle, TypeORM, MikroORM, Postgres.js, Slonik, pg-promise, Objection.js | All use cases |
| **`pg` (node-postgres) + raw SQL** | Direct SQL queries with `toSql()`/`fromSql()` helpers from `pgvector` | N/A (raw SQL) | Simplest, most control |
| **Drizzle ORM** | Built-in pgvector support in drizzle-orm | Drizzle | TypeScript-first projects |

**Sources:**
- Official pgvector-node GitHub: [github.com/pgvector/pgvector-node](https://github.com/pgvector/pgvector-node)
- pgvector npm: [npmjs.com/package/pgvector](https://www.npmjs.com/package/pgvector) (v0.3.0, 101 dependents)
- RiveStack pgvector + Node.js tutorial: [rivestack.io/blog/pgvector-nodejs-semantic-search](https://rivestack.io/blog/pgvector-nodejs-semantic-search)

**Code pattern (raw SQL with `pg` + `pgvector`):**

```js
import pg from 'pg';
import { toSql, fromSql } from 'pgvector';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Insert embedding
const embedding = await generateEmbedding(text);
await pool.query(
  `INSERT INTO knowledge_chunks (project_id, content, embedding) VALUES ($1, $2, $3)`,
  [projectId, content, toSql(embedding)]
);

// Semantic search
const result = await pool.query(
  `SELECT id, content, project_id, 1 - (embedding <=> $1) AS similarity
   FROM knowledge_chunks
   ORDER BY embedding <=> $1
   LIMIT $2`,
  [toSql(queryEmbedding), topK]
);
```

**Recommendation:** Use `pg` + `pgvector` npm with raw SQL. Reasons:
1. Simplest approach — no ORM abstraction layer needed for ~3 query types (insert, search, stats)
2. Full control over SQL (index creation, parameterized queries)
3. Matches the project's existing pattern of raw SQL (memory-index.js uses `better-sqlite3` with raw SQL)
4. `pgvector` npm provides only the `toSql()`/`fromSql()` type conversion utilities needed

#### 1.3 Dimension Tradeoffs

| Dimension | Storage per 100k chunks | Recall quality | Index build time | Search latency |
|---|---|---|---|---|
| 384 (local) | ~150 MB | Baseline (78%) | Fast | ~5ms |
| 768 | ~300 MB | +1–2% recall | Medium | ~8ms |
| 1536 (OpenAI small) | ~600 MB | +5% recall | Slower | ~10ms |
| 3072 (OpenAI large) | ~1.2 GB | +9% recall | Slowest | ~15ms |

**Key insight from SynaBun article:** "For corpora under 1M items, 384 dims with cosine on a B-tree index is faster end-to-end than 1536 dims on HNSW." The knowledgebase will have << 10,000 chunks initially — 384 dimensions is more than sufficient.

#### 1.4 Cost Analysis (per 1,000 search queries)

| Provider | Embedding cost | Storage cost | Total (monthly) |
|---|---|---|---|
| all-MiniLM-L6-v2 (local) | $0.00 | $0.00 (local CPU) | $0.00 |
| text-embedding-3-small | $0.04 | $0.00 (queries only) | ~$0.04–0.40 |
| text-embedding-3-large | $0.26 | $0.00 (queries only) | ~$0.26–2.60 |

For a developer doing 100 knowledgebase queries/day across 20 working days: $0.08/month with v3-small vs. $0.00 with local. The cost argument for local is compelling but the quality argument for OpenAI (higher recall) may matter for cross-project search with large corpora.

#### 1.5 `.env` Credential Pattern

**Current project state:**
- `dotenv` is already a `devDependency` (v17.4.2) — listed in `package.json` line 56
- `.env.example` exists with Playwright configuration vars (HEADLESS, SLOW_MO, VIEWPORT)
- No `DATABASE_URL` usage exists anywhere in the codebase
- No `process.env.DATABASE_URL` references found

**Pattern to follow (consistent with existing `.env.example`):**

```
# .env.example addition:
# PostgreSQL connection string for centralized knowledgebase (pgvector)
# Required for cross-project learned knowledge sharing
# DATABASE_URL=postgresql://user:password@localhost:5432/knowledgebase

# OpenAI API key for higher-quality embeddings (optional — falls back to local)
# OPENAI_API_KEY=sk-...
```

**Existing `.env` loading pattern:** The `@xenova/transformers` optional dependency shows the "graceful degradation" pattern — try to use it, warn if missing, fall back gracefully. The same pattern should apply to `DATABASE_URL`: if not configured, the knowledgebase MCP server logs a warning and the tools become no-ops. This is **critical** for the consumer bootstrap scenario — consumer projects without a database should not break.

### 2. MCP Server Patterns

#### 2.1 Existing `scripts/mcp-memory-server.js` Architecture

Analysis of the existing server reveals these patterns:

**Server initialization:**
```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'memory-bank', version: '1.0.0' }, { capabilities: { tools: {} } });
```

**Tool registration pattern:**
```js
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'memory_search', description: '...', inputSchema: { type: 'object', properties: {...}, required: [...] } },
    { name: 'memory_rebuild', description: '...', inputSchema: { type: 'object', properties: {} } },
    // ...
  ],
}));
```

**Tool handler pattern:**
```js
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'memory_search': { /* ... */ return { content: [{ type: 'text', text: formatted }] }; }
      // ...
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});
```

**Transport start:**
```js
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[memory-bank-mcp] Server started via stdio transport');
```

**opencode.json registration:**
```json
"memory-bank": {
  "type": "local",
  "command": ["node", "scripts/mcp-memory-server.js"],
  "enabled": true
}
```

**Agent permission patterns (from `.opencode/agents/*.agent.md`):**
```yaml
permission:
  "memory-bank/*": allow
```

The existing codebase shows a consistent pattern: local MCP server with `node scripts/<name>.js` command, stdio transport, enabled in opencode.json, and agent permissions via `"<server-name>/*": allow`.

#### 2.2 Knowledgebase MCP Tool Design

Following the exact patterns established by `mcp-memory-server.js`:

**Server name:** `knowledgebase`  
**Script path:** `scripts/mcp-knowledgebase-server.js`  
**Registration in opencode.json:**
```json
"knowledgebase": {
  "type": "local",
  "command": ["node", "scripts/mcp-knowledgebase-server.js"],
  "enabled": true
}
```

**Tools to expose:**

| Tool Name | Description | Input Schema | Response |
|---|---|---|---|
| `knowledgebase_search` | Semantic search across learned knowledge from all projects | `query` (string, required), `topK` (number, default 5), `projectId` (string, optional) | Ranked results: `[{project_id, date, pipeline, content, similarity}]` |
| `knowledgebase_index` | Index/update a project's learned knowledge in the knowledgebase | `projectId` (string, optional — auto-detects from cwd `package.json`) | `{status, chunks_indexed, project_id}` |
| `knowledgebase_stats` | Get knowledgebase statistics | none | `{total_projects, total_chunks, db_size}` |
| `knowledgebase_list` | List all indexed projects | none | `[{project_id, chunk_count, last_indexed}]` |

**Design rationale:**
- `knowledgebase_search` is the primary tool — mirrors `memory_search` pattern exactly
- `knowledgebase_index` enables manual re-indexing (mirrors `memory_rebuild`)
- `knowledgebase_stats` for diagnostics (mirrors `memory_stats`)
- `knowledgebase_list` for discoverability — agents can see which projects are available

**Connection pool management:**
```js
import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,  // conservative pool size for MCP server (single-user)
  idleTimeoutMillis: 30000,
});
```

Pool pattern is necessary because MCP stdio transport is long-lived (one process per OpenCode session). Without pooling, a connection leak would exhaust PostgreSQL connections.

#### 2.3 Separate vs. Extended MCP Server

**Decision: SEPARATE MCP server.** Rationale:

| Factor | Memory Server (`mcp-memory-server.js`) | Knowledgebase Server (`mcp-knowledgebase-server.js`) |
|---|---|---|
| Database | SQLite (embedded, local file) | PostgreSQL (external service) |
| Embedding | `@xenova/transformers` (local only) | Dual: local (default) + OpenAI (optional) |
| Scope | Per-project (local memory-bank) | Cross-project (centralized knowledgebase) |
| Availability | Always (no external deps required) | Conditional (requires DATABASE_URL) |
| Error modes | Filesystem errors | Network errors, auth failures |
| Lifecycle | Always started | Started only when DATABASE_URL configured |

Merging these into one server would:
- Force the memory server to have PostgreSQL as a dependency
- Complicate the consumer bootstrap scenario (memory server must always work)
- Mix filesystem and network error handling
- Violate separation of concerns

The existing `opencode.json` already shows multiple MCP servers (`memory-bank`, `playwright`, `chrome-devtools`, `angular-cli`, `context7`, `github`, `ddg-search`) — adding `knowledgebase` follows the established architecture.

#### 2.4 Agent Instructions Integration

Following the `researcher.agent.md` permission pattern:
```yaml
permission:
  "knowledgebase/*": allow
```

The `learned-knowledge.instructions.md` file itself documents what agents should learn. When an agent finishes a task, it appends to that file. The post-commit hook then syncs to the centralized knowledgebase. This creates a closed loop:

```
Agent completes task → writes to learned-knowledge.instructions.md
    → git commit triggers post-commit hook
    → knowledgebase-cli.js sync → indexes into PostgreSQL + pgvector
    → Other agents can query via knowledgebase_search MCP tool
```

### 3. Chunking Strategy for `learned-knowledge.instructions.md`

#### 3.1 File Structure Analysis

The file follows this structure:
```markdown
# Learned Knowledge

> Accumulated patterns, conventions, gotchas, and agent tuning notes...

## Session: YYYY-MM-DD

**Pipeline:** TDD Infrastructure Bootstrap
**Coverage:** N/A (infrastructure setup)
**TDD Iterations:** 0

**New knowledge:**
- Project is a template distribution package (npm)...
- Source code is in `scripts/`...

**Agent tuning notes:**
- unit-tester: Must be told to look in `scripts/`...
```

Optional variant: `## Session: YYYY-MM-DD — Title` with a descriptive title after the date.

#### 3.2 Chunking Approach

**Split by `## Session:` blocks** — each session becomes one chunk. This is the natural unit because:
- Sessions represent coherent learning events (typically one pipeline run)
- Sessions are temporally independent — learning from June doesn't override July
- The existing `chunkMarkdown()` function in `memory-index.js` already splits by `## ` headings
- Cross-session queries ("what were all the agent tuning notes for coder?") work across independently chunked sessions

**Metadata extraction per chunk:**

| Metadata Field | Source | Example |
|---|---|---|
| `project_id` | `package.json` → `name` | `"@abarcenas/ai-workflow-template"` |
| `session_date` | Heading regex `## Session: (\d{4}-\d{2}-\d{2})` | `"2026-06-13"` |
| `session_title` | Full heading text (minus `## `) | `"Session: 2026-06-13"` or `"Session: 2026-07-24 — Verbose Logging..."` |
| `pipeline` | Regex from `**Pipeline:** (.*)` | `"TDD Infrastructure Bootstrap"` |
| `coverage` | Regex from `**Coverage:** (.*)` | `"88/88 tests passing..."` |
| `tdd_iterations` | Regex from `**TDD Iterations:** (\d+)` | `0` |
| `content_type` | `"full"` or `"new-knowledge-only"` | `"new-knowledge-only"` |

#### 3.3 What to Embed

**Recommendation: Embed the "New knowledge" bullet section only.** 

The embedding input should be:
```
Session: 2026-06-13 — Pipeline: TDD Infrastructure Bootstrap
- Project is a template distribution package (npm), not a deployable application
- Source code is in `scripts/` (ES modules), not a traditional `src/` directory
- E2E tests use Playwright with `tests/` directory, `.spec.ts` extension
- Unit tests use Vitest with `scripts/` directory, `.test.{js,ts}` extension
- Playwright config uses `chromium` as default, `fullyParallel: true`
- Coverage threshold is 90% across all metrics
```

**Rationale:**
- The "New knowledge" bullets contain the actual learned insights — the semantic content worth searching for
- Pipeline and Coverage metadata are structured fields for filtering, not semantic content
- Agent tuning notes are meta-knowledge about agents, useful but secondary
- Prepending the session date + pipeline as context gives the embedding meaningful temporal/contextual framing
- The metadata fields (`project_id`, `session_date`, `pipeline`, `coverage`) are stored in database columns for structured filtering — they don't need to be in the embedding vector

#### 3.4 Alternative Approaches (Rejected)

| Approach | Why Rejected |
|---|---|
| Embed entire session block | Wastes embedding dimensions on structural metadata (dates, pipeline names, coverage numbers) rather than semantic content |
| Embed agent tuning notes separately | Doubles chunk count with marginal retrieval benefit; tuning notes are rarely the primary search target |
| Overlapping sliding window | Session boundaries are natural semantic boundaries; overlapping windows would create artificial fragmentation |
| Per-bullet embedding | Too granular — individual bullets lose session context needed for meaningful retrieval |

#### 3.5 Database Schema Design

Extracted from chunk metadata, the PostgreSQL schema should be:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,        -- package.json "name" field
  name TEXT NOT NULL,
  first_indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  session_date DATE NOT NULL,
  session_title TEXT,
  pipeline TEXT,
  coverage TEXT,
  tdd_iterations INTEGER DEFAULT 0,
  content TEXT NOT NULL,        -- the "New knowledge" bullets
  embedding VECTOR(384),       -- or 1536 for OpenAI embeddings
  content_hash TEXT NOT NULL,  -- SHA-256 for change detection
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, session_date, content_hash)
);

CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The `content_hash` column enables idempotent re-indexing — matches the existing `memory_chunks.content_hash` pattern in `memory-index.js`. The composite unique constraint on `(project_id, session_date, content_hash)` prevents duplicate indexing of the same session content.

### 4. Git Hook Integration

#### 4.1 Existing Husky Hook Architecture

The project uses husky v9 with a well-defined pattern:

**Hook files in `.husky/`** (two existing):
- `.husky/pre-commit` — runs `bump-version.js` + `validate-memory-schema.js` before commits
- `.husky/post-merge` — updates memory vector index after pull/merge if memory-bank files changed

**Hook management pipeline** (`scripts/setup/hooks.js`):
- 6-case merge algorithm: create dir, write new, overwrite managed, backup+overwrite forced, merge unmanaged, dry-run
- Marker comment: `# Managed by @abarcenas/ai-workflow-template setup` (line 1 for detection)
- Per-hook error isolation: one hook failure doesn't block others

**Template hook definitions** (`scripts/setup/constants.js`):
```js
export const TEMPLATE_HOOKS = {
  'pre-commit': { source: '.husky/pre-commit', content: '...', description: '...' },
  'post-merge': { source: '.husky/post-merge', content: '...', description: '...' },
};
```

**Programmatic husky init** (`scripts/setup/husky-init.js`):
- Uses `createRequire` to resolve husky from consumer's `node_modules`
- Dynamically imports husky and calls `husky(consumerRoot)`
- Clears stale `core.hooksPath` before init for idempotency

#### 4.2 Post-Commit Hook Design

Following the **exact pattern** of the existing `post-merge` hook:

```sh
# .husky/post-commit
# Managed by @abarcenas/ai-workflow-template setup
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# After commit, check if learned knowledge file changed
# and sync to the centralized knowledgebase

CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | grep ".agents/instructions/learned-knowledge.instructions.md")

if [ -n "$CHANGED" ]; then
  echo "[knowledgebase] Learned knowledge file changed. Syncing to knowledgebase..."
  node scripts/knowledgebase-cli.js sync 2>/dev/null || echo "[knowledgebase] Sync skipped (service not configured)"
fi
```

**Key design points (following existing patterns):**

1. **Marker on line 1** — matches `HOOK_MARKER` for isManaged/idempotency detection
2. **Shebang on line 2** — husky v9 sources hooks, so shebang position doesn't affect execution (same as post-merge)
3. **`git diff HEAD~1 --name-only`** — detects the specific file change (same pattern as post-merge which uses `git diff HEAD@{1}`)
4. **Conditional grep** — only runs sync if `learned-knowledge.instructions.md` actually changed
5. **Graceful failure** — `2>/dev/null` + `|| echo` fallback if `knowledgebase-cli.js` doesn't exist or fails
6. **No `exit 1` on failure** — post-commit hooks run AFTER the commit, so failure should never block the developer

**Why post-commit (not pre-commit):**
- The knowledgebase sync requires the latest committed content
- Pre-commit would index content that hasn't been committed yet
- Post-commit ensures the indexed content matches what's in git
- Matching the existing post-merge pattern (which also runs after, not before)

#### 4.3 Integration with Setup Pipeline

**Changes needed:**

1. **`scripts/setup/constants.js`** — add `post-commit` to `TEMPLATE_HOOKS`:
```js
'post-commit': {
  source: '.husky/post-commit',
  content: '...',  // the hook content from 4.2
  description: 'Auto-sync learned knowledge to centralized knowledgebase after commits',
},
```

2. **`.husky/post-commit`** — create the template hook file at package root

3. **`scripts/setup/hooks.js`** — **ZERO changes needed.** The `installHooks()` function iterates `Object.keys(TEMPLATE_HOOKS)`, so adding a new key automatically includes it in hook installation. This validates the existing architecture's extensibility.

4. **`scripts/sync.js`** — add `knowledgebase-cli.js` to `scriptsToSync` array so it's copied to consumer projects.

5. **`scripts/setup/index.js`** — **Consider adding a new Phase 6 for knowledgebase registration** (see Section 5).

### 5. Consumer Bootstrap Scenario

#### 5.1 Detection Strategy

Consumer project identity is derived from `package.json` → `name` field (e.g., `"my-app"`). The `discover.js` module already reads `consumerPackageJson` during discovery (line 192 of discover.js), making this field available in the Context object.

**Detection flow:**
```
npx ai-workflow-setup runs
    → discover.js detects consumerPackageJson.name → "my-app"
    → knowledgebase-cli.js register --project "my-app"
    → Checks projects table: SELECT id FROM projects WHERE id = 'my-app'
    → Not found → INSERT project record
    → Read consumer's .agents/instructions/learned-knowledge.instructions.md
    → Chunk by ## Session: blocks
    → Embed "New knowledge" sections → INSERT into knowledge_chunks
    → Success
```

#### 5.2 Registration CLI Design

Following the existing `memory-cli.js` pattern:

```bash
# Register/update a project in the knowledgebase
node scripts/knowledgebase-cli.js sync [--project <id>]

# Search across all knowledge
node scripts/knowledgebase-cli.js search "<query>" [--topK 5] [--project <id>]

# List indexed projects
node scripts/knowledgebase-cli.js list

# Stats
node scripts/knowledgebase-cli.js stats
```

**`sync` command behavior:**
1. Read `process.env.DATABASE_URL` → if missing, exit with message "DATABASE_URL not configured"
2. Resolve project ID: `--project` flag → `package.json` name → exit with error if neither
3. Connect to PostgreSQL via `pg.Pool`
4. Check/create `projects` table row (upsert)
5. Read `learned-knowledge.instructions.md` from cwd
6. Parse sessions, extract metadata, chunk "New knowledge" sections
7. For each chunk: generate embedding, check content_hash for idempotency, insert/update
8. Print summary: `{status: "ok", project_id, chunks: {indexed: 4, skipped: 2}}`

#### 5.3 Integration with `npx ai-workflow-setup`

The setup pipeline (`scripts/setup/index.js`) currently has 5 phases. The knowledgebase bootstrap can be added as:

**Option A: New Phase 6 — "Knowledgebase" (Recommended)**

Added after Phase 5 (Sync), before the summary:

```js
// Phase 6 — Knowledgebase (always runs, gracefully skips if not configured)
if (!flags.skipKnowledgebase) {
  section('Phase 6: Knowledgebase')
  try {
    const kbResult = await registerKnowledgebase(context)
    context.kbResult = kbResult
    phases.push({ phase: 'knowledgebase', status: actionStatus(kbResult.action), message: kbResult.message })
  } catch (err) {
    stepWarn(`Knowledgebase registration skipped: ${err.message}`)
    phases.push({ phase: 'knowledgebase', status: 'warn', message: `Skipped — ${err.message}` })
  }
}
```

The `registerKnowledgebase()` function (in a new `scripts/setup/knowledgebase.js`):
- Returns `{ action: 'skipped', message: 'DATABASE_URL not configured' }` if no env var — **not an error**
- Spawns `knowledgebase-cli.js sync` as child process (following `sync-phase.js` pattern to isolate potential `process.exit()`)
- If `knowledgebase-cli.js` doesn't exist (consumer hasn't installed it), skips gracefully
- On success: `{ action: 'indexed', message: 'Indexed N chunks from M sessions' }`

**Why a new phase rather than extending Phase 5:**
1. Knowledgebase is conceptually distinct from file sync
2. Enables independent skip flag (`--skip-knowledgebase`)
3. Clear error isolation — knowledgebase failure shouldn't affect sync success
4. Matches the single-responsibility principle of existing phases

**Why it's not fatal if unavailable:**
The centralized knowledgebase is an **optional enhancement**, not a core requirement. Consumer projects without a PostgreSQL database or without `DATABASE_URL` configured should still work fully. The post-commit hook gracefully skips, and the MCP server tools become no-ops. This matches the existing philosophy: `@xenova/transformers` is an optional dependency — if it's not installed, memory search degrades gracefully with a helpful error message.

#### 5.4 Consumer Project Registration Flow (End-to-End)

```
1. Consumer runs: npx ai-workflow-setup
2. Discovery: detects project ID "my-app" from package.json
3. Hooks: installs .husky/post-commit (new hook)
4. Prepare: adds/merges "husky" in prepare script
5. Husky Init: generates .husky/_/ shims
6. Sync: copies scripts including knowledgebase-cli.js
7. Knowledgebase (NEW):
   a. Check DATABASE_URL → configured? 
      YES → spawn knowledgebase-cli.js sync → index learned-knowledge.instructions.md
      NO  → skip with "DATABASE_URL not configured" warning
8. Summary: shows all phase results
9. Exit: success (even if knowledgebase skipped)

10. Later: Developer makes commit that changes learned-knowledge.instructions.md
11. Post-commit hook: detects change → runs knowledgebase-cli.js sync
12. Knowledgebase DB updated with new session content
13. Other agents can now query: knowledgebase_search("what pattern for verbose logging?")
```

#### 5.5 Edge Cases

| Scenario | Behavior |
|---|---|
| First use, no DATABASE_URL | Phase 6 skips with warning. Post-commit hook skips silently. |
| First use, DATABASE_URL configured | Project registered, all existing sessions indexed. |
| DATABASE_URL configured but pgvector extension missing | CLI script runs `CREATE EXTENSION IF NOT EXISTS vector` automatically (idempotent). If it fails (permission), error logged, Phase 6 shows warning. |
| Re-running setup (idempotent) | `knowledgebase-cli.js sync` checks content_hash per chunk — only indexes new sessions. Existing chunks skipped. |
| learned-knowledge.instructions.md doesn't exist yet | Registration skips (nothing to index). Post-commit hook will catch it when first created. |
| Consumer project has no package.json name | Phase 6 skips with "no project ID found in package.json" warning. |
| Multiple commits with knowledge changes | Post-commit hook runs each time — content_hash idempotency prevents duplicate indexing. |
| PostgreSQL connection fails (network, auth) | CLI script fails gracefully with exit code 1. Phase 6 shows warning. Post-commit hook logs error to stderr but doesn't block developer. |

---

## Technical Constraints

1. **PostgreSQL + pgvector is an external service** — not embedded like SQLite. Consumer projects need a running PostgreSQL instance with the pgvector extension. This is fundamentally different from the memory bank's embedded sqlite-vec architecture.

2. **`@xenova/transformers` already used** — The project already has the local embedding infrastructure (`memory-index.js` uses `all-MiniLM-L6-v2`). The knowledgebase CLI can reuse this exact same embedding pipeline, or optionally upgrade to OpenAI embeddings if `OPENAI_API_KEY` is configured.

3. **Graceful degradation is required** — The knowledgebase is optional. No consumer project should break or show errors if DATABASE_URL isn't configured. All tool implementations must handle the "no database" case.

4. **ESM only** — The project uses `"type": "module"`. All new scripts must use ES module syntax (import/export).

5. **Dotenv is already a devDependency** — No new dependency needed for `.env` loading. However, the MCP server should load dotenv at startup if `.env` exists.

6. **`@modelcontextprotocol/sdk` is already a dependency** (v1.0.0) — The new MCP server has zero new framework dependencies.

7. **PostgreSQL pool management** — The `pg` npm package needs to be added as an optional dependency (like `@xenova/transformers`). Connection pooling is required for MCP stdio long-lived process.

---

## Decision / Recommendation

### Architecture: Three-Layer Knowledge System

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 3: Centralized Knowledgebase (PostgreSQL + pgvector)          │
│ • Cross-project learned knowledge                                   │
│ • Optional — requires DATABASE_URL                                  │
│ • Accessed via knowledgebase MCP server tools                       │
│ • Populated by post-commit git hook + setup command                 │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 2: Local Memory Bank (SQLite + sqlite-vec) — EXISTING         │
│ • Per-project memory (memory-bank/*.md)                             │
│ • Always available (embedded)                                       │
│ • Accessed via memory-bank MCP server tools                         │
│ • Populated by agent task execution                                 │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 1: Markdown Source of Truth (git-committed) — EXISTING        │
│ • Human-readable, git-versioned                                     │
│ • memory-bank/*.md + .agents/instructions/learned-knowledge.*.md    │
│ • Written by AI agents during tasks                                 │
│ • The canonical record — databases are disposable indexes           │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Stack

| Component | Choice | Rationale |
|---|---|---|
| **Database** | PostgreSQL + pgvector | ACID, full SQL, concurrent access, already evaluated in prior spike. Required for cross-project knowledge sharing. |
| **Node.js DB client** | `pg` (node-postgres) + `pgvector` npm | Raw SQL, simplest approach, matches existing project patterns. `pgvector` provides only `toSql()`/`fromSql()` helpers. |
| **Embedding (default)** | `@xenova/transformers` + `all-MiniLM-L6-v2` (384d) | Already an optionalDep. Runs locally. Zero cost. Sufficient for << 10k chunks. |
| **Embedding (upgrade)** | OpenAI `text-embedding-3-small` (1536d) | Optional. Higher recall quality. Requires API key. Configurable via `OPENAI_API_KEY` env var. |
| **Embedding dimensions** | 384 (local) or 1536 (OpenAI) | Configurable at table creation. Dimension stored in VECTOR(N) column type. |
| **MCP server** | Separate `scripts/mcp-knowledgebase-server.js` | Different database, lifecycle, error modes than memory server. Follows existing multi-server pattern. |
| **MCP transport** | Stdio (child process) | Matches existing `mcp-memory-server.js` + all other MCP servers in opencode.json. |
| **CLI** | `scripts/knowledgebase-cli.js` | Mirrors `memory-cli.js` pattern. Used by post-commit hook and manual operations. |
| **Git hook** | `.husky/post-commit` (new) | Detects `learned-knowledge.instructions.md` changes, triggers sync. |
| **Setup integration** | New Phase 6 in `scripts/setup/index.js` | Graceful degradation when DATABASE_URL not configured. |
| **Chunking** | `## Session:` blocks → "New knowledge" bullets only | Natural semantic unit. Metadata stored as columns, not in embedding. |

### What to Implement

**Phase 1 — Foundation (new files):**
1. `scripts/knowledgebase-cli.js` — CLI (sync, search, list, stats commands)
2. `scripts/knowledgebase-index.js` — Core engine (embed, insert, search, index management)
3. `scripts/mcp-knowledgebase-server.js` — MCP server (stdio transport, 4 tools)
4. `scripts/setup/knowledgebase.js` — Setup phase module (project registration)
5. `.husky/post-commit` — Git hook template

**Phase 2 — Integration (modify existing files):**
1. `scripts/setup/constants.js` — Add `post-commit` to `TEMPLATE_HOOKS`, add `knowledgebase-cli.js` to `scriptsToSync`
2. `scripts/sync.js` — Add `knowledgebase-cli.js` and `knowledgebase-index.js` to `scriptsToSync` array
3. `scripts/setup/index.js` — Add Phase 6 knowledgebase registration
4. `opencode.json` — Add `knowledgebase` MCP server config
5. `package.json` — Add `pg` and `pgvector` as optionalDependencies
6. `.env.example` — Add `DATABASE_URL` and `OPENAI_API_KEY` templates

**Phase 3 — Documentation:**
1. `.agents/instructions/learned-knowledge.instructions.md` — Document the knowledgebase workflow
2. `.agents/instructions/memory-bank.instructions.md` — Add knowledgebase search guidance

### What NOT to Do

- ❌ **Don't merge knowledgebase into memory MCP server** — different databases, different lifecycles, different failure modes
- ❌ **Don't require DATABASE_URL for setup to succeed** — knowledgebase is optional, graceful degradation required
- ❌ **Don't embed full session blocks** — wastes dimensions on metadata, embed only "New knowledge" bullets
- ❌ **Don't use an ORM** — raw SQL with `pg` matches existing patterns, only ~4 query types needed
- ❌ **Don't commit PostgreSQL connection strings** — use `.env` (git-ignored) with `.env.example` template
- ❌ **Don't make post-commit hook fail on knowledgebase errors** — hooks run after commit, failure shouldn't block developer
- ❌ **Don't use Python-based embedding** — Node.js `@xenova/transformers` is already in the project, matches existing architecture

### Dimension Decision

**Default: 384 dimensions (all-MiniLM-L6-v2)**

Reasoning:
- Already the project standard (memory-index.js uses EMBEDDING_DIM = 384)
- Sufficient for cross-project knowledge retrieval (<< 10k chunks initially, corpus will grow slowly)
- Zero cost, zero latency tax, works offline
- The SynaBun article confirms 384d is sufficient for developer memory use cases
- OpenAI upgrade path: if teams want higher quality, they configure `OPENAI_API_KEY` and the dimension becomes 1536

**Schema for dimension flexibility:**
```sql
CREATE TABLE knowledge_chunks (
  -- ...
  embedding VECTOR(384),  -- default: 384 for MiniLM
  -- NOTE: if switching to OpenAI, run ALTER TABLE ALTER COLUMN embedding TYPE VECTOR(1536)
  -- and rebuild the index
);
```

Alternatively, use `VECTOR` (no dimension constraint) which pgvector supports as of recent versions, but specifying the dimension enables better query planning and storage optimization.

---

## Prototype/Testing Notes

No experimental code was created during this spike (permission not requested). The following should be implemented for validation:

### Validation Steps for Coder Agent

1. **Database setup:**
   ```bash
   createdb knowledgebase
   psql knowledgebase -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

2. **Install new dependencies:**
   ```bash
   npm install --save-optional pg pgvector
   ```

3. **Create `.env`:**
   ```
   DATABASE_URL=postgresql://localhost:5432/knowledgebase
   ```

4. **Test knowledgebase-cli.js sync:**
   ```bash
   node scripts/knowledgebase-cli.js sync
   # Expected: "Indexed 4 chunks across 4 sessions for project @abarcenas/ai-workflow-template"
   ```

5. **Test knowledgebase-cli.js search:**
   ```bash
   node scripts/knowledgebase-cli.js search "verbose logging pattern"
   # Expected: returns relevant session chunks about verbose logging
   ```

6. **Test MCP server:**
   ```bash
   # Start server (stdio — test via pipe)
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node scripts/mcp-knowledgebase-server.js
   ```

7. **Test post-commit hook:**
   ```bash
   # Simulate in temp repo
   mkdir /tmp/test-kb && cd /tmp/test-kb && git init
   # Copy learned-knowledge.instructions.md to .agents/instructions/
   # Stage, commit
   git add . && git commit -m "test"
   # Check if knowledgebase received the indexed content
   ```

8. **Unit tests** (following Vitest patterns in `scripts/setup/*.test.js`):
   - `knowledgebase-index.test.js` — mock `pg.Pool`, test chunk extraction, embedding, search
   - `knowledgebase-cli.test.js` — mock index module, test CLI arg parsing
   - `setup/knowledgebase.test.js` — test Phase 6 registration with/without DATABASE_URL

---

## External Resources

| Resource | URL | Relevance |
|---|---|---|
| SynaBun: all-MiniLM-L6-v2 for MCP Memory | https://synabun.ai/blog/all-minilm-l6-v2-mcp-vector-memory | **Directly relevant** — same tech stack, benchmark, architecture. |
| Local vs OpenAI Embeddings Benchmark | https://localaimaster.com/blog/local-vs-openai-embeddings | 10k doc benchmark across 5 local models vs OpenAI. |
| pgvector-node GitHub | https://github.com/pgvector/pgvector-node | Official Node.js library. v0.3.0. 13+ DB client adapters. |
| pgvector npm | https://www.npmjs.com/package/pgvector | v0.3.0, 101 dependents. |
| pgvector + Node.js Tutorial (RiveStack) | https://rivestack.io/blog/pgvector-nodejs-semantic-search | Complete code examples: schema, insert, search, HNSW index, RAG pipeline. |
| pgvector-node DeepWiki | https://deepwiki.com/pgvector/pgvector-node | Architecture overview, adapter pattern, supported clients. |
| OpenAI Embeddings Pricing | https://developers.openai.com/api/docs/models/text-embedding-3-small | text-embedding-3-small: $0.02/1M tokens, 3-large: $0.13/1M tokens. |
| MCP Memory Server (sdimitrov) | https://github.com/sdimitrov/mcp-memory | Reference MCP server with pgvector + BERT embeddings. |
| Husky v9 Get Started | https://typicode.github.io/husky/get-started.html | Official setup guide. |
| Husky Custom Hook Scripts (DeepWiki) | https://deepwiki.com/typicode/husky/3.3-custom-hook-scripts | Available hook types, execution environment, best practices. |
| node-postgres Pool API | https://node-postgres.com/apis/pool | Connection pooling reference. |
| Project `docs/spike-vector-db-memory.md` | (local) | Prior spike — sqlite-vec architecture, embedding model decision, two-tier pattern. |
| Project `scripts/mcp-memory-server.js` | (local) | Reference MCP server — tool registration, handler patterns, stdio transport. |
| Project `scripts/setup/*` | (local) | Setup pipeline — hook management, discovery, sync, CLI patterns. |
| Project `.husky/post-merge` | (local) | Reference hook pattern — conditional execution, graceful failure. |
| `@xenova/transformers` models | https://huggingface.co/Xenova | Available local embedding models. |

---

## Decision Trail

1. **Prior spike** (2026-07-23): Established sqlite-vec as local vector index, markdown as source of truth, two-tier architecture. Flagged pgvector as "upgrade when 5+ concurrent contributors."

2. **This spike: embedded → centralized transition.** The question isn't "should we use pgvector" (that was settled in the prior spike) — it's "how to integrate pgvector into the existing architecture for cross-project knowledge sharing."

3. **Embedding model:** Stay with `all-MiniLM-L6-v2` (384d) as default — it's already in the project, zero cost, sufficient for the corpus size. Offer OpenAI as configurable upgrade. The SynaBun article validates this choice at length.

4. **MCP server:** Separate `knowledgebase` server — different database, lifecycle, and error handling from `memory-bank`. Follows existing multi-server architecture.

5. **Chunking:** Session-level chunks with "New knowledge" bullets only. Metadata in columns, not embeddings. This keeps vectors focused on semantic content.

6. **Git hook:** `post-commit` (not pre-commit) — knowledgebase sync needs committed content. Follows exact post-merge pattern: conditional detection, graceful failure.

7. **Setup integration:** New Phase 6. Graceful skip when DATABASE_URL missing. Not fatal — knowledgebase is an enhancement, not a requirement.

8. **Consumer bootstrap:** Project ID from `package.json` name. Idempotent via content_hash. Works on first setup and subsequent commits.

---

## Status History

| Date | Status | Notes |
|---|---|---|
| 2026-07-29 | ✅ Complete | Comprehensive spike across all 5 research areas. All questions answered with evidence. Clear recommendations formulated. |
