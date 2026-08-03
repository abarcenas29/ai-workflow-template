---
goal: "Fix MCP knowledgebase_index not calling registerProject() before upsertChunks() causing PostgreSQL FK violation for non-bootstrap-registered projects"
version: 1
date_created: 2026-08-02
status: Completed
tags: [bug-fix, knowledgebase, mcp, registerProject, foreign-key, pgvector, upsertChunks]
---

# Fix: MCP knowledgebase_index Missing registerProject() Call v1

## Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-green)

The `knowledgebase_index` MCP tool handler in `scripts/mcp-knowledgebase-server.js` calls `chunkLearnedKnowledge()` → `upsertChunks()` without ever calling `registerProject()`. The `knowledge_chunks` table has a FOREIGN KEY (`project_id`) to `projects(id)`, so inserts for non-bootstrap-registered projects fail with PostgreSQL error `23503` (foreign_key_violation). The error is silently caught by `upsertChunks()`'s generic catch-all at line 451-458 and counted as `skipped`.

**Root cause:** `registerProject()` exists in `scripts/knowledgebase-index.js` (lines 341-360, idempotent INSERT … ON CONFLICT DO UPDATE) and is correctly called by the CLI path (`scripts/knowledgebase-cli.js` line 122), but the MCP server (1) never imported it and (2) never called it before `upsertChunks()`.

**Impact:** Only projects pre-registered during bootstrap (or via the CLI `sync` command) can be successfully indexed via MCP. Any consumer project using `knowledgebase_index` as their first indexing path gets all chunks silently skipped with the misleading result "indexed 0, updated 0, skipped N".

**Previously fixed (not in scope):**
- `import 'dotenv/config'` was added at line 25 (2026-08-02 fix) — `DATABASE_URL` now loads correctly in MCP server.
- `opencode.json` knowledgebase MCP entry (lines 59-66) has `env: { "DATABASE_URL": "$DATABASE_URL" }` — already present.
- Default search threshold fixed (`args.threshold || 0.6` → `args.threshold ?? 0.1`, line 143) — already done.

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T5 | Yes — 3 tasks | — |
| B | T3 | No (single) | T1, T2 |
| C | T4 | No (single) | T3 |

**Total: 5 tasks across 3 batches.** Batch A has 3 fully independent tasks (T1+T2 touch the same file and should be done by a single coder; T5 is memory-bank updates). Batch B (single task) creates tests that depend on the fix. Batch C (single task) validates the full test suite.

---

## 1. Requirements & Constraints

### Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| REQ-01 | `knowledgebase_index` MCP handler MUST call `registerProject(projectId, projectId)` BEFORE `upsertChunks(chunks)` | Bug report — knowledgebase, project cms-apmc, 2026-08-02 |
| REQ-02 | `registerProject` MUST be imported in `scripts/mcp-knowledgebase-server.js` from `./knowledgebase-index.js` | Source code analysis |
| REQ-03 | The `registerProject()` call MUST be placed AFTER the `chunks.length === 0` guard to avoid unnecessary upserts for empty input | Design decision — matches CLI pattern at `knowledgebase-cli.js:122` |
| REQ-04 | Existing behavior for already-registered projects MUST NOT change — `registerProject()` is an idempotent upsert | Existing code invariant |
| REQ-05 | The fix MUST NOT break graceful degradation when `DATABASE_URL` is unset — `registerProject()` already returns `{ id, first_indexed_at: null }` when pool is null | Existing code invariant |
| REQ-06 | MCP server integration tests MUST be created — currently zero tests exist for `scripts/mcp-knowledgebase-server.js` | Test gap |

### Constraints

| ID | Constraint |
|----|------------|
| CON-01 | No changes to `scripts/knowledgebase-index.js` — `registerProject()` function is correct, only the MCP server caller is missing |
| CON-02 | No changes to `scripts/knowledgebase-cli.js` — the CLI path already calls `registerProject()` correctly |
| CON-03 | No changes to `opencode.json`, `package.json`, or `.env` files |
| CON-04 | No changes to `ensureSchema()` — schema provisioning is out of scope |
| CON-05 | `registerProject()` call uses `projectId` for both arguments (project ID == display name), matching CLI pattern |

---

## 2. Implementation Steps

### Phase 1 — Fix MCP Server (Batch A — Parallel) ✅ COMPLETED 2026-08-02

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Add `registerProject` to the named import from `./knowledgebase-index.js` | `scripts/mcp-knowledgebase-server.js` line 28 | A | — | 2026-08-02 |
| T2 | Add `await registerProject(projectId, projectId)` call in the `knowledgebase_index` handler, placed AFTER the `chunks.length === 0` guard (line 226) and BEFORE `const result = await upsertChunks(chunks)` (line 228) | `scripts/mcp-knowledgebase-server.js` lines 226-228 | A | — | 2026-08-02 |
| T5 | Update memory-bank files (`activeContext.md`, `progress.md`, `tasks/_index.md`) to reflect the fix plan and verification steps | `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/tasks/_index.md` | A | — | 2026-08-02 |

#### T1 Details

**Current state (line 27-36):**
```javascript
import {
  search,
  upsertChunks,
  chunkLearnedKnowledge,
  getStats,
  listProjects,
  getPool,
  closePool,
} from './knowledgebase-index.js';
```

**Required change:**
Add `registerProject` to the destructured import list (alphabetically between `listProjects` and `getPool`):

```javascript
import {
  search,
  upsertChunks,
  chunkLearnedKnowledge,
  getStats,
  listProjects,
  registerProject,
  getPool,
  closePool,
} from './knowledgebase-index.js';
```

**Validation:**
- `node --check scripts/mcp-knowledgebase-server.js` passes
- `registerProject` is exported from `./knowledgebase-index.js` (confirmed: line 782)

#### T2 Details

**Current state (lines 216-228):**
```javascript
const chunks = chunkLearnedKnowledge(content, projectId);
if (chunks.length === 0) {
  return {
    content: [{
      type: 'text',
      text: `No valid knowledge chunks found for project "${projectId}". ` +
        'Ensure the content contains "## Session:" headers with ' +
        '"**New knowledge:**" sections.',
    }],
  };
}

const result = await upsertChunks(chunks);
```

**Required change:**
Insert `await registerProject(projectId, projectId);` between the empty-chunks guard closure (`}` on current line 226) and the `const result = await upsertChunks(chunks);` line (current line 228). Follow the file's semicolon-free convention.

**Result (lines 216-230 after fix):**
```javascript
const chunks = chunkLearnedKnowledge(content, projectId);
if (chunks.length === 0) {
  return {
    content: [{
      type: 'text',
      text: `No valid knowledge chunks found for project "${projectId}". ` +
        'Ensure the content contains "## Session:" headers with ' +
        '"**New knowledge:**" sections.',
    }],
  };
}

// Register/update the project in the projects table (idempotent upsert)
await registerProject(projectId, projectId)

const result = await upsertChunks(chunks);
```

**Why this placement:** After the empty-chunks guard avoids an unnecessary DB call for empty input. The CLI (`knowledgebase-cli.js:122`) uses the same ordering. `registerProject()` is idempotent — calling it for an already-registered project is a no-op.

**Validation:**
- `node --check scripts/mcp-knowledgebase-server.js` passes
- MCP handshake test: spawn server, call `tools/call knowledgebase_index` with a new `projectId` — project row is created, chunks are inserted (no FK violation)
- Regression: re-index an existing project — no errors, idempotent

#### T5 Details

**Files to update:**
- `memory-bank/activeContext.md` — update "Current Focus" section with the fix plan status and key findings
- `memory-bank/progress.md` — add entry under "What's Left" or "Recently Completed" (planning phase), update "What Works" if applicable
- `memory-bank/tasks/_index.md` — add task entry for this fix (if a task tracking system is maintained)

---

### Phase 2 — MCP Server Integration Tests (Batch B — depends on T1+T2) ✅ COMPLETED 2026-08-02

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T3 | Create `scripts/mcp-knowledgebase-server.test.js` — integration tests covering the `knowledgebase_index` handler's new `registerProject` call and the existing handler logic | `scripts/mcp-knowledgebase-server.test.js` (NEW) | B | T1, T2 | 2026-08-02 |

#### T3 Details

**File to create:** `scripts/mcp-knowledgebase-server.test.js`

**Test framework:** Vitest (matching `knowledgebase-index.test.js` and `knowledgebase-cli.test.js`)

**Mock strategy:** Mock the core engine (`./knowledgebase-index.js`) and the MCP SDK to test the handler logic without real database/stdio connections.

**Required test scenarios (minimum 8):**

| # | Test | Description |
|---|------|-------------|
| 1 | `knowledgebase_index` calls `registerProject` before `upsertChunks` | Verify the sequence: chunk → registerProject → upsertChunks. Assert `registerProject` called with `(projectId, projectId)`. Assert `upsertChunks` called after `registerProject` resolves. |
| 2 | `knowledgebase_index` skips `registerProject` when chunks are empty | Verify `registerProject` is NOT called when `chunkLearnedKnowledge` returns `[]`. Assert early return happens before any DB calls. |
| 3 | `knowledgebase_index` reads from default file when no content provided | Verify `readFileSync` is called with `.agents/instructions/learned-knowledge.instructions.md`. |
| 4 | `knowledgebase_index` returns error when file not found and no content | Verify error response when `readFileSync` throws ENOENT. |
| 5 | `knowledgebase_index` returns indexed/updated/skipped counts | Verify the formatted result string contains the correct counts from `upsertChunks`. |
| 6 | `knowledgebase_index` handles projectId validation | Verify error response when `projectId` is missing/empty. |
| 7 | `knowledgebase_search` returns formatted results | Verify result formatting with similarity scores (regression guard). |
| 8 | `knowledgebase_stats` returns formatted stats | Verify stats response format (regression guard). |

**Test file pattern:** Follow `scripts/knowledgebase-cli.test.js` conventions — `vi.mock()` for external deps, `vi.resetModules()` between tests, `afterEach` cleanup.

**Testability seam (added by T3):** The MCP server module previously had no exportable handler. Minimal changes were made to `scripts/mcp-knowledgebase-server.js` (in addition to T1/T2): (1) the `CallToolRequestSchema` handler was extracted and exported as `handleToolCall(request)`, and (2) the stdio bootstrap (`main()`, SIGTERM handler) was guarded by an `isDirectRun` check (`process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)`) so importing the module in tests opens no stdio transport and exits cleanly. Direct execution (`node scripts/mcp-knowledgebase-server.js`) is unchanged — verified by an `initialize` JSON-RPC handshake smoke test.

**Validation:**
- `npx vitest run scripts/mcp-knowledgebase-server.test.js` — all tests pass
- Tests cover the `registerProject` call sequence (the new behavior) and existing handler paths (regression)

---

### Phase 3 — Full Test Suite Validation ✅ COMPLETED 2026-08-02

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T4 | Run the full Vitest test suite and verify no regressions | `npx vitest run` (all test files) | — | T3 | 2026-08-02 |

#### T4 Details

**Command:** `npx vitest run`

**Expected results:**
- All existing tests pass (160 baseline + new MCP server tests from T3)
- `scripts/knowledgebase-cli.test.js` — existing tests still pass (CLI path unchanged)
- `scripts/knowledgebase-index.test.js` — existing tests still pass (engine unchanged)
- `scripts/setup/` tests — existing tests still pass (setup pipeline unchanged)
- `scripts/mcp-knowledgebase-server.test.js` — new tests all pass

**Validation criteria:**
- 0 failures
- No test file regressions
- `scripts/mcp-knowledgebase-server.js` syntax valid (`node --check`)

**Actual results (T4, 2026-08-02 — Unit Tester independent validation):**
- `npx vitest run` → **176/176 passed across 10 test files, 0 failures** (171 from T3 + 5 coverage tests added during T4 validation)
- `npx vitest run --coverage` → overall **40.93% stmts / 39.76% branches / 38.94% funcs / 41.54% lines** — the 90% global gate in `vitest.config.ts` is NOT met, but this is **pre-existing** (baseline ~38-41% before this plan) and out of plan scope; flagged, not a blocker
- `scripts/mcp-knowledgebase-server.js` coverage: **79.66% stmts / 88.37% branches / 37.5% funcs / 81.03% lines** (improved from 64.4% / 65.11% / 25% / 65.51% at T3 by the 5 coverage tests added in T4). Remaining gaps are the `ListToolsRequestSchema` tools builder (lines 55-133, not exported) and the direct-run bootstrap (`main()`, `isDirectRun`, SIGTERM — lines 335-359) — both require production changes or a manual live-spawn integration test (TEST-12), out of scope for unit tests
- **Regression guard verified NON-VACUOUS** via mutation test: copied server + test to a temp dir, removed the `await registerProject(projectId, projectId)` call, ran the suite → **1 test FAILED** (`AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` on `expect(kb.registerProject).toHaveBeenCalledTimes(1)`). Reverting the fix WILL fail the suite. Workspace file restored and confirmed intact
- All 8 plan scenarios (TEST-01..08) are represented in `scripts/mcp-knowledgebase-server.test.js` (tests 1-8, one-to-one); tests 9-16 add degradation, import-integrity, empty-kb, no-pool stats, list formatting, unknown-tool, and index error-path coverage
- `node --check scripts/mcp-knowledgebase-server.js` ✅
- **Tests added in T4 (strengthening):** TEST-12 (search "No results found" with pool available), TEST-13 (stats not-available with zero counts + no pool), TEST-14 (list formats projects incl. `name || project_id` and `last_indexed || 'Never'` fallbacks), TEST-15 (unknown tool → caught `Error: Unknown tool:`), TEST-16 (index error path when `upsertChunks` rejects) — all unit tests on the existing `handleToolCall` seam, no production changes

---

## 3. Alternatives

| ID | Alternative | Rationale |
|----|-------------|-----------|
| ALT-01 | Call `registerProject()` unconditionally before `chunkLearnedKnowledge()` | **Rejected.** Would register a project even when content is empty/invalid, creating unnecessary project rows. The CLI pattern (guard first, then register) is the established convention. |
| ALT-02 | Call `ensureSchema()` before `registerProject()` in the MCP handler | **Deferred.** Schema provisioning is handled by bootstrap/CLI `sync`. Adding it to every MCP handler call adds latency (DDL statements) and the CREATE EXTENSION permission requirement may fail in hosted PostgreSQL. Can be addressed in a follow-up if needed. |
| ALT-03 | Merge `registerProject` logic into `upsertChunks()` so callers don't need to remember | **Rejected.** Violates separation of concerns — `upsertChunks()` handles chunk-level idempotent upserts; project registration is a separate domain operation. The CLI also calls `registerProject` before other operations (not just upsert). |

---

## 4. Dependencies

| ID | Dependency | Status |
|----|------------|--------|
| DEP-01 | `registerProject()` function exists in `scripts/knowledgebase-index.js` | ✅ Exported at line 782, implemented at lines 341-360 |
| DEP-02 | `scripts/knowledgebase-index.js` exports are consumable by MCP server | ✅ Same package, same ESM module graph |
| DEP-03 | `import 'dotenv/config'` is present in MCP server | ✅ Line 25 |
| DEP-04 | `opencode.json` knowledgebase entry has `env` block | ✅ Lines 62-64 |
| DEP-05 | All existing tests pass before fix | ✅ Verified: 160/160 pass (baseline before this plan) |

---

## 5. Files

| ID | File | Action | Lines |
|----|------|--------|-------|
| FILE-01 | `scripts/mcp-knowledgebase-server.js` | Modify — add `registerProject` to import | 28 |
| FILE-02 | `scripts/mcp-knowledgebase-server.js` | Modify — add `registerProject()` call in handler | 226-228 |
| FILE-03 | `scripts/mcp-knowledgebase-server.test.js` | Create — new test file | — |
| FILE-04 | `memory-bank/activeContext.md` | Modify — fix plan status | — |
| FILE-05 | `memory-bank/progress.md` | Modify — fix plan status | — |
| FILE-06 | `memory-bank/tasks/_index.md` | Modify — task tracking | — |
| FILE-07 | `plan/fix-kb-registerproject-1.md` | This plan | — |

**Files NOT modified (confirmed correct):**
- `scripts/knowledgebase-index.js` — `registerProject()` (341-360) and export (782) are correct
- `scripts/knowledgebase-cli.js` — already calls `registerProject()` at line 122
- `opencode.json` — env block already present (lines 62-64)
- `package.json` — no changes needed

---

## 6. Testing

| ID | Test | Type | File |
|----|------|------|------|
| TEST-01 | `registerProject` is called before `upsertChunks` with correct args | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-02 | `registerProject` is NOT called when chunks are empty | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-03 | `knowledgebase_index` reads default file when no content provided | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-04 | `knowledgebase_index` returns error when file not found | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-05 | `knowledgebase_index` returns formatted counts from `upsertChunks` | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-06 | `knowledgebase_index` validates projectId is required | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-07 | `knowledgebase_search` returns formatted results (regression) | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-08 | `knowledgebase_stats` returns formatted stats (regression) | Unit (new) | `scripts/mcp-knowledgebase-server.test.js` |
| TEST-09 | Full test suite — no regressions across all existing test files | Integration | `npx vitest run` |
| TEST-10 | CLI `sync` still works — calls `registerProject` before `upsertChunks` (regression) | Unit (existing) | `scripts/knowledgebase-cli.test.js` |
| TEST-11 | Engine `registerProject()` returns idempotent upsert (regression) | Unit (existing) | `scripts/knowledgebase-index.test.js` |
| TEST-12 | MCP handshake — `tools/call knowledgebase_index` with new project succeeds | Integration (manual — **DONE 2026-08-02: PASS**) | Live MCP server spawn |

**Manual integration test (TEST-12) — ✅ PASSED 2026-08-02 (Unit Tester):**
```bash
# Spawn MCP server, call tools/call knowledgebase_index with new projectId
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"knowledgebase_index","arguments":{"projectId":"test-new-project","content":"## Session: 2026-01-01\n\n**New knowledge:**\n- Test chunk"}}}' | node scripts/mcp-knowledgebase-server.js
# Expected: "Indexed 1 chunks, updated 0, skipped 0" (NOT "skipped 1")
```

**Actual TEST-12 result (2026-08-02):** Spawned the real server over stdio via a temp harness, completed the MCP `initialize` handshake (protocolVersion/capabilities/serverInfo returned), then called `tools/call knowledgebase_index` with a fresh `projectId = smoke-test-<timestamp>`. Response text: **`"Indexed 1 chunks, updated 0, skipped 0 for project \"smoke-test-1785682647097\"."`** — proves `registerProject()` ran (no FK 23503 → no silent `skipped`). Test rows cleaned up via direct pool query (`DELETE FROM knowledge_chunks WHERE project_id = $1` then `DELETE FROM projects WHERE id = $1`); post-cleanup verification confirmed **0 remaining smoke-test projects and 0 chunks**. The server's SIGTERM handler also exercised cleanly (pool closed, exit 0). See §10.

---

## 7. Risks & Assumptions

| ID | Risk/Assumption | Mitigation |
|----|----------------|------------|
| RISK-01 | `ensureSchema()` has never been called for a new project, so tables may not exist | Out of scope — schema provisioning happens during bootstrap/CLI sync. If tables don't exist, `upsertChunks` would fail with "relation does not exist" which is a pre-existing issue. |
| RISK-02 | The `registerProject()` call adds ~5ms latency per index operation | Negligible — `registerProject` is a single idempotent INSERT … ON CONFLICT DO UPDATE. |
| ASSUMPTION-01 | `registerProject(projectId, projectId)` with `projectId` as both arguments is correct — matches the CLI pattern at `knowledgebase-cli.js:122` | Verified by code review |
| ASSUMPTION-02 | `DATABASE_URL` is correctly loaded in the MCP server process | Verified — `import 'dotenv/config'` at line 25, `opencode.json` env passthrough at lines 62-64 |
| ASSUMPTION-03 | No other MCP tools (`knowledgebase_search`, `knowledgebase_stats`, `knowledgebase_list`) need `registerProject` | Verified — these tools only READ from the database, they don't insert |

---

## 8. Related Specifications

- **Original feature plan:** `plan/feature-knowledgebase-pgvector-v1.md` — Section §5.8 (T8: MCP server), Batch B
- **ADR:** `docs/adr-knowledgebase-pgvector.md` — Architecture Decision Record for centralized knowledgebase
- **Knowledgebase engine:** `scripts/knowledgebase-index.js` — `registerProject()` at lines 341-360
- **CLI reference (correct pattern):** `scripts/knowledgebase-cli.js` — `registerProject()` call at line 122
- **Related bug fix:** `plan/fix-setup-env-loading-v1.md` — previously fixed dotenv/env loading issues (Completed)

---

## 9. Post-Review Nit Fixes (2026-08-02) ✅ COMPLETE

Applied all 4 reviewer nits from the APPROVED WITH NITS verdict. No changes to the registerProject fix itself (import + call placement preserved). `knowledgebase-index.js` and `knowledgebase-cli.js` NOT modified.

| Nit | Change | File(s) |
|-----|--------|---------|
| N-1 | Search schema `threshold` default `0.6` → `0.1` (line 77) to match handler `args.threshold ?? 0.1` | `scripts/mcp-knowledgebase-server.js` |
| N-2 | Outer catch returns `Error: ${redactConnectionString(err.message)}`; added local `redactConnectionString(message)` helper (lines 135-162) that redacts credentials from `postgres://`/`postgresql://` URL tokens in the message and returns non-URL messages unchanged | `scripts/mcp-knowledgebase-server.js` |
| N-3 | projectId guard `if (!projectId)` → `if (!projectId?.trim())`; trimmed `const pid = projectId.trim()` used consistently in `chunkLearnedKnowledge(content, pid)`, `registerProject(pid, pid)`, and response messages | `scripts/mcp-knowledgebase-server.js` |
| N-4 | TEST-05: removed redundant `toContain('Indexed 3 chunks, updated 2, skipped 1')` after the exact `toBe` | `scripts/mcp-knowledgebase-server.test.js` |

**N-2 rationale (deviation from reviewer's suggested import):** `redactConnectionString()` at `knowledgebase-index.js:62` is NOT exported, and CON-01 forbids modifying that file. A local helper mirrors its redaction behavior but operates on a full message: only URL tokens are rewritten, so generic errors ("Unknown tool: …", "DB connection failed") remain readable — the engine helper's `'***'` fallback for non-URLs would have replaced every error message and broken TEST-15/TEST-16.

**Tests added (16 → 18):**
- TEST-06b: whitespace-only `projectId` (`'   '`) → error response, no engine calls.
- TEST-06c: `projectId: '  test-project  '` → trimmed `'test-project'` flows to `chunkLearnedKnowledge`, `registerProject('test-project', 'test-project')`, and the response text.

**Validation (2026-08-02):**
- `node --check scripts/mcp-knowledgebase-server.js` ✅
- `npx vitest run scripts/mcp-knowledgebase-server.test.js` → **18/18** ✅
- `npx vitest run` → **178/178 across 10 files, 0 failures** ✅ (176 + 2 new tests)
- Redaction spot-checked: `postgres://user:secret@host:5432/kb` → `postgres://***@host:5432/kb`; non-URL messages unchanged.

---

## 10. Re-validation + TEST-12 Live-Spawn Smoke Test (2026-08-02) ✅ COMPLETE

Post-nit re-validation by the Unit Tester, including the final remaining untested path (the direct-run stdio bootstrap `main()`/`isDirectRun`/SIGTERM).

### 10.1 Full suite re-validation

| Check | Result |
|-------|--------|
| `node --check scripts/mcp-knowledgebase-server.js` | ✅ Syntax OK |
| `npx vitest run scripts/mcp-knowledgebase-server.test.js` | ✅ **18/18 passed (1 file)** |
| `npx vitest run` (full suite) | ✅ **178/178 passed across 10 test files, 0 failures** |
| `DATABASE_URL` availability | `printenv DATABASE_URL` → ABSENT; `.env` file → PRESENT with non-empty `DATABASE_URL` key (value not printed/committed). Server loads `.env` via `import 'dotenv/config'` at line 25, so the DB was reachable for the smoke test. |

### 10.2 TEST-12 — live-spawn smoke test: ✅ PASS

Spawned the real server via `node scripts/mcp-knowledgebase-server.js` over stdio (temp harness in the pre-approved temp dir — not committed), then:

1. Sent `initialize` JSON-RPC → response contained `protocolVersion`, `capabilities`, `serverInfo` (handshake OK).
2. Sent `notifications/initialized`.
3. Called `tools/call knowledgebase_index` with a fresh `projectId: "smoke-test-<timestamp>"` and valid session content.
4. **Response text:** `"Indexed 1 chunks, updated 0, skipped 0 for project \"smoke-test-1785682647097\"."` → **`skipped 0`, NOT `skipped 1`** → proves `registerProject()` ran before `upsertChunks()` (no FK 23503, no silent skip).
5. Cleanup: `DELETE FROM knowledge_chunks WHERE project_id = $1` + `DELETE FROM projects WHERE id = $1` → **1 chunk + 1 project deleted**; post-cleanup verification `SELECT count(*) ... LIKE 'smoke-test-%'` → **0 projects, 0 chunks** (no residue).
6. Server terminated via SIGTERM (the `isDirectRun` + SIGTERM bootstrap path exercised live).

**Evidence:** This closes the last coverage gap flagged in §2/T4 — the direct-run bootstrap path (`main()`, `isDirectRun`, SIGTERM, lines 365-391) is now proven to work live end-to-end, including the registerProject fix.

### 10.3 Regression guard sanity (post-nit)

Confirmed the whitespace-projectId validation (N-3) did NOT weaken the registerProject regression guard. Re-ran the mutation test (temp copy of `mcp-knowledgebase-server.js` + `.test.js` + `knowledgebase-index.js`, removed the `await registerProject(pid, pid);` call, ran the suite):

- **3 tests FAILED** (15 passed / 18):
  - TEST-01: `expect(kb.registerProject).toHaveBeenCalledTimes(1)` → got 0 (order assertion via `invocationCallOrder` also intact).
  - TEST-16: `expect(kb.registerProject).toHaveBeenCalledTimes(1)` → got 0 (error path).
  - TEST-06c: `expect(kb.registerProject).toHaveBeenCalledWith('test-project', 'test-project')` → got 0 (trim-downstream now also catches a missing call — strictly stronger than before).
- Workspace files verified intact after the temp mutation (`grep` shows `registerProject` import at line 33 and `await registerProject(pid, pid);` at line 270; 18 tests present). Temp dir cleaned up.

**Conclusion:** Reverting the fix FAILS the suite — the guard remains non-vacuous and is now covered by 3 tests.

### 10.4 Status

TEST-12 (the final open item from the reviewer's follow-ups) is **DONE — PASS**. All plan tasks and both follow-up validation items are complete.

---

## 11. Redaction Hardening — Fail-Closed `redactConnectionString` (2026-08-02) ✅ COMPLETE

Post-review hardening addressing the reviewer's 🟡 Major finding from the nit-fix re-review (§9/§10): the local `redactConnectionString(message)` helper in `scripts/mcp-knowledgebase-server.js` FAILED OPEN on unix-socket-style connection-string authorities.

### 11.1 The bug (empirically reproduced before the fix)

For `postgres://user:secret@/var/run/postgresql` and `postgresql://user:secret@/tmp?host=/tmp`, `new URL()` throws `Invalid URL`. The old helper's catch returned the message **UNCHANGED**, leaking `user:secret` into the MCP error response. The engine helper (`knowledgebase-index.js:62-70`) fails CLOSED (`'***'`) for the same input — so the local helper weakened security vs. the engine for this input class.

### 11.2 The fix (server lines 160-163)

Replaced the URL-parse-based logic with a single global regex that fails closed for every input:

```diff
 function redactConnectionString(message) {
   if (typeof message !== 'string' || message.length === 0) return message;
-  try {
-    const match = message.match(/(postgres(?:ql)?:\/\/[^\s]+)/i);
-    if (!match) return message;
-    const u = new URL(match[1]);
-    const auth = u.username ? '***@' : '';
-    const redacted =
-      `${u.protocol}//${auth}${u.hostname}:${u.port}${u.pathname}`;
-    return message.replace(match[1], redacted);
-  } catch {
-    return message;
-  }
+  return message.replace(/(postgres(?:ql)?:\/\/)([^/\s]+)@/gi, '$1***@');
 }
```

**Why regex-only (deviation from the literal "catch fallback" spec, strictly stronger):**
- The regex strips the `userinfo@` prefix from **every** token (global `g` flag) → satisfies the optional "redact ALL URL tokens" item with no loop.
- No URL parsing at all → there is no parse to fail; unparseable tokens (unix-socket authorities, invalid percent-encoding, etc.) are redacted by construction → satisfies the REQUIRED fail-closed item.
- Host/path preserved verbatim → no stray `host:` colon when the port is absent (satisfies the optional port-colon item).
- Non-URL messages (TEST-15 "Unknown tool", TEST-16 "DB connection failed") have no match → returned unchanged.
- `[^/\s]+` (rather than the reviewer-suggested `[^@\s]+`) also fully redacts passwords containing `@` (e.g. `postgres://user:p@ss@host` → `postgres://***@host`), whereas `[^@\s]+` would stop at the first `@` and leak `ss`.
- A catch-fallback-only fix would still leak a second unparseable token when the FIRST token parses (the original replace-then-return structure), and couldn't satisfy "redact all tokens" without a loop — hence the single-regex rewrite.

**Behavior matrix (verified with node probes on the actual file code):**

| Input | Output |
|---|---|
| `postgres://user:secret@/var/run/postgresql` | `postgres://***@/var/run/postgresql` |
| `postgresql://user:secret@/tmp?host=/tmp` | `postgresql://***@/tmp?host=/tmp` |
| `postgres://user:secret@host:5432/kb` | `postgres://***@host:5432/kb` |
| `postgres://user:secret@host/kb` (no port) | `postgres://***@host/kb` (no stray `:`) |
| `postgres://u1:p1@h1/d1 ... postgres://u2:p2@h2/d2` | both tokens redacted |
| `postgres://user:p@ss@/var/run/postgresql` | `postgres://***@/var/run/postgresql` |
| `Unknown tool: foo` / `DB connection failed` | unchanged |

### 11.3 Tests added (18 → 21)

`scripts/mcp-knowledgebase-server.test.js` — the helper is intentionally NOT exported (no production surface change); new tests exercise the real outer-catch path by rejecting `upsertChunks` with an error whose message contains the URL:

- **TEST-17**: `postgres://user:secret@/var/run/postgresql` in an error → response contains `postgres://***@/var/run/postgresql`, does NOT contain `user:secret` (fail-closed).
- **TEST-18**: `postgresql://user:secret@/tmp?host=/tmp` variant → `postgresql://***@/tmp?host=/tmp`, no `user:secret`.
- **TEST-19**: message with two `postgres://` tokens → BOTH redacted (`***@host1/db1` and `***@host2/db2`), neither credential pair present (replace-all).
- TEST-15/TEST-16 (non-URL messages stay readable) unchanged and still pass.

### 11.4 Validation

| Check | Result |
|---|---|
| `node --check scripts/mcp-knowledgebase-server.js` | ✅ Syntax OK |
| `npx vitest run scripts/mcp-knowledgebase-server.test.js` | ✅ **21/21 passed (1 file)** |
| `npx vitest run` (full suite) | ✅ **181/181 passed across 10 files, 0 failures** |
| `node -e` spot checks (unix-socket, `?host=`, multi-token, no-port, non-URL) on the actual file code | ✅ all redacted / unchanged as expected |

`knowledgebase-index.js` (engine) and `knowledgebase-cli.js` NOT modified; the engine helper stays as-is (not exported). RegisterProject fix untouched.

---

## 12. Final Minor-Hygiene Fixes — Search projectId/limit + Query-String Redaction (2026-08-02) ✅ COMPLETE

Post-approval follow-up addressing the three 🔵 minor items flagged in §11's final sign-off review (§10.4 / reviewer verdict). All changes confined to `scripts/mcp-knowledgebase-server.js` and its test file.

### 12.1 Fix 1 — `knowledgebase_search` projectId trim/validate (parity)

**File:** `scripts/mcp-knowledgebase-server.js` — `knowledgebase_search` handler, options-building lines 186-194.

**Before:**
```javascript
project_id: args.projectId || undefined,
```
**After:**
```javascript
project_id: args.projectId?.trim() || undefined,
```

**Chosen behavior (design decision):** For a SEARCH filter, an invalid/whitespace-only `projectId` is **silently dropped to match-all** (`undefined`) rather than rejected with an error. Rationale: `projectId` is an optional, read-only filter — graceful degradation is the established pattern for search (the handler already degrades to "No results found"/"not configured" messages instead of throwing). This contrasts intentionally with the INDEX handler, where `projectId` is a required write-target and a whitespace-only value returns an error (`TEST-06b`). Trimmed values are passed to the engine (`'  test-project  '` → `'test-project'`), which only applies the `AND project_id = $n` clause when the filter is truthy (`knowledgebase-index.js:513`).

### 12.2 Fix 2 — `args.limit || 5` → `args.limit ?? 5`

**File:** `scripts/mcp-knowledgebase-server.js` — same handler block, line 193.

**Before:** `limit: args.limit || 5,`
**After:** `limit: args.limit ?? 5,`

**Rationale:** Nullish coalescing honors an explicit `limit: 0` (`LIMIT 0`) instead of silently coercing it to the default 5 — identical to the previously-fixed `threshold` behavior (`args.threshold ?? 0.1`). The engine passes `limit` straight to SQL (`knowledgebase-index.js:518-519`), so `limit: 0` is a legitimate caller intent.

### 12.3 Fix 3 — Redact query-string params in URL tokens (belt-and-braces)

**File:** `scripts/mcp-knowledgebase-server.js` — `redactConnectionString()` helper, lines 161-168 (+ JSDoc 137-160).

**Before:**
```javascript
return message.replace(/(postgres(?:ql)?:\/\/)([^/\s]+)@/gi, '$1***@');
```
**After:**
```javascript
return message.replace(
  /(postgres(?:ql)?:\/\/)([^/\s]+)@([^?#\s]*)([?#][^\s]*)?/gi,
  (match, scheme, userinfo, hostAndPath, queryOrFragment) =>
    `${scheme}***@${hostAndPath}${queryOrFragment ? queryOrFragment[0] + '***' : ''}`
);
```

**Behavior:** group 3 captures host+path (stop at `?`/`#`/whitespace); the optional group 4 captures the query or fragment, which is replaced with `?***` / `#***`. `postgres://user:secret@host:5432/kb?password=hunter2` → `postgres://***@host:5432/kb?***` (no `hunter2`, no `password=`). The no-URL-parse / fail-closed-by-construction property is preserved (still a pure regex, no `new URL()`), host/path preserved, non-URL messages unchanged (TEST-15/16 intact), every token redacted (global flag), `@`-in-password still fully redacted.

### 12.4 Tests added/updated (`scripts/mcp-knowledgebase-server.test.js`)

| Test | Description |
|------|-------------|
| TEST-20 | `knowledgebase_search` with `projectId: '   '` → engine called with `project_id: undefined` (match-all) |
| TEST-20b | `knowledgebase_search` with `projectId: '  test-project  '` → engine called with `project_id: 'test-project'` (trimmed) |
| TEST-21 | `knowledgebase_search` with `limit: 0` → engine called with `limit: 0` (not 5) |
| TEST-22 | error message `postgres://user:secret@host:5432/kb?password=hunter2` → output contains `***@` and `?***`, does NOT contain `hunter2` or `password=` |
| TEST-18 (updated) | `postgresql://user:secret@/tmp?host=/tmp` now expects `postgresql://***@/tmp?***` (query redacted) + `not.toContain('host=/tmp')` |

### 12.5 Validation

| Check | Result |
|---|---|
| `node --check scripts/mcp-knowledgebase-server.js` | ✅ Syntax OK |
| `npx vitest run scripts/mcp-knowledgebase-server.test.js` | ✅ **25/25 passed (1 file)** |
| `npx vitest run` (full suite) | ✅ **185/185 passed across 10 files, 0 failures** |
| `node -e` spot checks (query-string, unix-socket, `?host=`, plain URL, multi-token, non-URL) | ✅ all redacted / unchanged as expected |

**Constraints respected:** registerProject fix (import + call placement) untouched; INDEX handler whitespace trim untouched; core userinfo redaction unchanged; `knowledgebase-index.js` and `knowledgebase-cli.js` NOT modified.

### 12.6 Independent validation (Unit Tester, 2026-08-02) ✅ PASS — all counts confirmed, all 4 new tests non-vacuous

Independent re-verification of §12.1–12.5 by the Unit Tester, performed from a clean workspace read (no production edits):

| Check | Result |
|---|---|
| `npx vitest run` (full suite) | ✅ **185/185 passed across 10 files, 0 failures** — matches coder's report exactly |
| `npx vitest run scripts/mcp-knowledgebase-server.test.js` | ✅ **25/25 passed (1 file)** — matches coder's report exactly |
| `node --check scripts/mcp-knowledgebase-server.js` (read-only source inspection) | ✅ Syntax OK; all 3 fixes present at lines 191/193/163-167 |

**Non-vacuity verified by actual temp mutation (not just reasoning):** created `scripts/.tmp-mutation/` (deleted after), copied server + test + real `knowledgebase-index.js` (for TEST-11's `vi.importActual`), and ran the suite against each reverted fix one at a time:

| Reverted mutation (temp copy only) | Tests that FAILED (25 total) |
|---|---|
| `args.limit ?? 5` → `args.limit \|\| 5` | **TEST-21** (1 failed) — `limit: 0` coerced to `5` |
| `args.projectId?.trim() \|\| undefined` → `args.projectId \|\| undefined` | **TEST-20 + TEST-20b** (2 failed) — `'   '` passed through untrimmed, `'  test-project  '` not trimmed |
| Query-string redaction regex → pre-fix `([^/\s]+)@` only | **TEST-18 + TEST-22** (2 failed) — `?host=/tmp` and `?password=hunter2` survive (query leakage) |
| Remove `await registerProject(pid, pid)` | **TEST-01 + TEST-06c + TEST-16** (3 failed) — guard intact (matches §10.3) |

**Regression guards re-confirmed present and meaningful:**
- TEST-01 order assertions (`mock.invocationCallOrder` at test lines 181-183) + `toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith('test-project','test-project')` — intact.
- TEST-16 (`toHaveBeenCalledTimes(1)` on the error path) and TEST-06c (`toHaveBeenCalledWith('test-project','test-project')` on the trim path) — intact.
- Earlier fail-closed guarantees still hold: TEST-17 (`postgres://***@/var/run/postgresql`, no `user:secret`), TEST-19 (both tokens redacted) passed in every mutation run — the userinfo redaction core is untouched by the §12 changes.

**Conclusion:** All 4 new/updated tests (TEST-20, TEST-20b, TEST-21, TEST-22, updated TEST-18) assert the right behavior and genuinely fail when their corresponding fix is reverted. No issues found. Workspace files confirmed intact after temp mutation cleanup (`git status` shows only the expected coder changes; `scripts/.tmp-mutation/` removed).
