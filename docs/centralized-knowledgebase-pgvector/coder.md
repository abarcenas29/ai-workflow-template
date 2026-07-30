# Centralized Knowledgebase (pgvector MCP) — Coder

## Step 4a: Batch A — Foundation (6 Parallel Tasks)

**Date:** 2026-07-29
**Status:** ✅ ALL SUCCESS

### Summary

Implemented all 6 foundation files concurrently. Created the SQL schema (T1), post-commit hook (T2), agent instructions (T3), updated `.env.example` (T4), added post-commit hook + skip flag to constants (T5), and built the core engine (T6).

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/knowledgebase-init.sql` | **NEW** — 193 lines. Full DDL: `projects` + `knowledge_chunks` tables, HNSW index (m=16, ef_construction=64), 4 B-tree indexes, `match_knowledge()` function for cosine similarity search. OpenAI upgrade path documented. |
| `.husky/post-commit` | **NEW** — 12 lines. Detects `learned-knowledge.instructions.md` changes via `git diff HEAD~1`, triggers `knowledgebase-cli.js sync`, always exits 0. |
| `.agents/instructions/knowledgebase.instructions.md` | **NEW** — 238 lines. Mandatory query requirements, 5 use-case query patterns, similarity score action table, graceful degradation section. |
| `.env.example` | **MODIFIED** — +8 lines. `DATABASE_URL` + `OPENAI_API_KEY` templates with OPTIONAL notice. |
| `scripts/setup/constants.js` | **MODIFIED** — +22 lines to `TEMPLATE_HOOKS` (post-commit entry), +1 flag (`--skip-knowledgebase`). Zero changes to `hooks.js`. |
| `scripts/knowledgebase-index.js` | **NEW** — 723 lines. 11 exports: pool, embed, upsertChunks, search, getStats, listProjects, chunkLearnedKnowledge. Lazy imports, graceful degradation, parameterized queries. |

### Key Decisions

- **HNSW index defaults**: m=16, ef_construction=64 — good balance for <<10k chunks. Can be tuned for larger corpora.
- **Content hash idempotency**: SHA-256 of content + session_date + pipeline. ON CONFLICT (project_id, session_date, content_hash) DO NOTHING. Returns `{ inserted, updated, skipped }` counts.
- **Embedding contextualization**: Session metadata prepended to content text before embedding: "Session: {date} — Pipeline: {pipeline}".

### Notes / Follow-up

All 103 existing tests pass with zero regressions after constants.js change.

---

## Step 4b: Batch B — CLI + MCP Server (2 Parallel Tasks)

**Date:** 2026-07-29
**Status:** ✅ ALL SUCCESS

### Summary

Built the CLI tool (T7) and MCP server (T8), both importing from the core engine. CLI supports 4 commands (sync, search, list, stats). MCP server exposes 4 tools (knowledgebase_search, knowledgebase_index, knowledgebase_stats, knowledgebase_list) via stdio transport.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/knowledgebase-cli.js` | **NEW** — 220 lines. 4 commands: sync, search, list, stats. Graceful skip when DATABASE_URL unset. Follows memory-cli.js patterns. |
| `scripts/mcp-knowledgebase-server.js` | **NEW** — 330 lines. 4 MCP tools via stdio transport. Follows mcp-memory-server.js exactly. SIGTERM handler for clean shutdown. |

### Key Decisions

- **CLI sync command**: Resolves project ID from `--project` flag or `package.json` `name` field. Uses `chunkLearnedKnowledge()` from core engine (avoids duplicating parsing logic).
- **MCP tool design**: All 4 tools check `getPool()` when results are empty and return helpful "DATABASE_URL not configured" messages. Never throw on missing database.
- **MCP server lifecycle**: `StdioServerTransport`, `console.error` lifecycle logging, try/catch returning `{ content, isError: true }` for errors, SIGTERM → `closePool()` → `process.exit(0)`.

### Notes / Follow-up

Both files verified: `node --check` passes on both. MCP server responds to `tools/list` with all 4 tool schemas. All tools degrade gracefully when DATABASE_URL is unset.

---

## Step 4c: Batch C — Setup Integration (3 Parallel Tasks)

**Date:** 2026-07-29
**Status:** ✅ ALL SUCCESS

### Summary

Wired the knowledgebase into the setup pipeline. Created Phase 6 module (T9), updated the orchestrator to include Phase 6 (T10), and added 4 knowledgebase scripts to sync.js (T11).

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/setup/knowledgebase.js` | **NEW** — 139 lines. Setup Phase 6 module: spawns CLI as child process. 3 early-exit paths (skip flag, no DATABASE_URL, no project name). |
| `scripts/setup/index.js` | **MODIFIED** — +27 lines. Phase 6 added after Phase 5 with non-fatal error handling. Em dash skip messages match existing patterns. |
| `scripts/sync.js` | **MODIFIED** — +4 entries to `scriptsToSync` (knowledgebase-cli, index, mcp-server, init.sql). Co-located dependency imports resolve correctly. |

### Key Decisions

- **Phase 6 is non-fatal**: Failure to sync knowledgebase never blocks setup pipeline. Graceful degradation via try/catch with `stepWarn()`.
- **Child process spawn**: `setup/knowledgebase.js` spawns `knowledgebase-cli.js sync --project <id>` using `process.execPath` — avoids `process.exit()` from CLI killing the parent setup process.
- **SQL file synced**: `knowledgebase-init.sql` is synced alongside JS files because consumers need it as a manual fallback for DB provisioning.

### Notes / Follow-up

Post-commit hook is already in `TEMPLATE_HOOKS` (from T5), so `installHooks()` will auto-install it in consumer projects. No changes needed to `hooks.js`.

---

## Step 4d: Batch D — Config & Agent Files (3 Parallel Tasks)

**Date:** 2026-07-29
**Status:** ✅ ALL SUCCESS

### Summary

Updated configuration files and agent permissions. Added knowledgebase MCP server to `opencode.json` (T12), added optional deps and scripts to `package.json` (T13), and added `knowledgebase/*` permission to all 13 agent files (T14).

### Files Produced / Modified

| File | Description |
|---|---|
| `opencode.json` | **MODIFIED** — Added `knowledgebase` MCP server (10th server). Added `knowledgebase_*: allow` permission. |
| `package.json` | **MODIFIED** — Added `pg ^8.22.0` + `pgvector ^0.3.0` as optionalDependencies. Added 3 kb:* scripts. Added `.husky/post-commit` to files. |
| 13 agent .agent.md files | **MODIFIED** — Added `"knowledgebase/*": allow` to all agent permission blocks. Consistent placement after `memory-bank/*` permission. |

### Key Decisions

- **MCP server count**: 10 servers total in `opencode.json` — following the established pattern of separate servers for separate concerns.
- **Script prefix**: Used `kb:` prefix (not `knowledgebase:`) matching ADR §7.8 and plan spec. Three scripts: `kb:sync`, `kb:search`, `kb:stats`.
- **Agent permissions**: All 13 agent files updated — every agent that can access `memory-bank/*` also gets `knowledgebase/*` access, ensuring consistent reading capabilities.

### Notes / Follow-up

All JSON files valid. All 13 agent files correctly show `knowledgebase/*: allow` with matching indentation.

---

## Step 4e: Batch E — Tests (3 Parallel Tasks)

**Date:** 2026-07-29
**Status:** ✅ ALL SUCCESS

### Summary

Created comprehensive unit tests for the core engine (T15), CLI (T16), and setup Phase 6 module (T17). 55 tests across 3 new test files covering chunking, graceful degradation, embedding, CRUD, edge cases, CLI commands, and setup integration.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/knowledgebase-index.test.js` | **NEW** — 748 lines, 36 tests. Covers chunking, graceful degradation, embed, CRUD, edge cases. |
| `scripts/knowledgebase-cli.test.js` | **NEW** — 576 lines, 13 tests. Covers all 4 commands, error handling, flag parsing, graceful skip. |
| `scripts/setup/knowledgebase.test.js` | **NEW** — 248 lines, 6 tests. Covers skip flag, no DATABASE_URL, missing project name, success, failure, spawn error. |

### Key Decisions

- **Mock patterns**: `pg` and `@xenova/transformers` mocked via `vi.mock()` to avoid real database connections and model loading. Follows existing test patterns from `scripts/setup/*.test.js`.
- **Test isolation**: CLI tests use `vi.mock('../knowledgebase-index.js')` to isolate from the real core engine. Phase 6 tests mock `child_process` spawn.

### Notes / Follow-up

All 28 new tests pass. Combined with the fix to index.test.js in Step 5, the full suite reaches 158 tests with 0 failures.
