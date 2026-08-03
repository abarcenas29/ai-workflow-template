---
goal: "Consolidate duplicate KB projects (unscoped `ai-workflow-template` → scoped `@abarcenas/ai-workflow-template`) and standardize projectId derivation to always use package.json `name`"
version: 1
date_created: 2026-08-03
status: Completed
tags: [process, database, knowledgebase, consolidation, standardization, projectid]
---

# Plan: Consolidate Duplicate KB Projects + Standardize projectId Convention

## Introduction

**Status:** Completed

The PostgreSQL knowledgebase currently has a duplicate project split: `@abarcenas/ai-workflow-template` (15 chunks, indexed by Pipelines 2–5) and `ai-workflow-template` (16 chunks, indexed by Pipeline 7's tracker). The canonical `package.json` `name` is the SCOPED `@abarcenas/ai-workflow-template`, yet Pipeline 7's tracker passed the UNscoped short name `ai-workflow-template` to `knowledgebase_index`, creating a second project row with 16 chunks that overlap 15 existing sessions plus 1 new session.

This plan addresses:
1. **Data consolidation**: merge both into the single canonical scoped project, zero data loss.
2. **Standardization**: ensure ALL future `knowledgebase_index` call sites derive `projectId` from `package.json` `name` (the scoped value), preventing recurrence.
3. **MCP restart note**: document that the threshold fix (`?? 0.1` at `mcp-knowledgebase-server.js:192`) is already in code but requires an MCP server restart to take effect operationally.

## Requirements & Constraints

| ID | Type | Requirement |
|----|------|-------------|
| REQ-01 | Data | Consolidate `ai-workflow-template` chunks into `@abarcenas/ai-workflow-template` without data loss. The `learned-knowledge.instructions.md` file is the authoritative source of truth — all 16 sessions MUST be present in the canonical project post-consolidation. |
| REQ-02 | Data | Remove the duplicate `ai-workflow-template` project row and its orphan chunks after consolidation is verified. |
| REQ-03 | Code | Every future `knowledgebase_index` invocation MUST derive `projectId` from `require('./package.json').name` (the scoped name). |
| REQ-04 | Docs | The canonical projectId derivation rule MUST be documented in at least two instruction files referenced by the knowledge-retrieval protocol. |
| REQ-05 | Docs | The MCP server restart requirement for the threshold fix MUST be noted in the knowledgebase instructions. |
| REQ-06 | Tests | Full test suite (currently 273/273 + setup 104/104) MUST continue to pass. |
| REQ-07 | Tests | A new spec-wiring test MUST verify that all `knowledgebase_index` call sites reference `package.json` name as the canonical projectId source. |
| SEC-01 | Safety | All DB writes during consolidation MUST be idempotent or preceded by a read-only verification step. No destructive operations until the canonical project has been verified to contain all 16 chunks. |
| CON-01 | Scope | Do NOT modify `scripts/knowledgebase-cli.js` (its `resolveProjectId()` already reads `package.json` name — correctly scoped). Do NOT modify `scripts/mcp-knowledgebase-server.js` (it is an agnostic handler — projectId comes from caller). Do NOT modify `scripts/knowledgebase-index.js` (engine is projectId-agnostic by design). |

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T3, T4, T5, T6, T7 | Yes | — |
| — | T2 | No (single) | T1 |
| B | T8, T9 | Yes | T2, T3, T4, T5, T6, T7 |
| — | T10 | No (single) | T8, T9 |

## Phase 1 — Data Consolidation + Standardization (Batch A — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | **Re-index canonical project from source.** Invoke `knowledgebase_knowledgebase_index` MCP tool with `projectId: "@abarcenas/ai-workflow-template"` (no explicit `content` — reads `.agents/instructions/learned-knowledge.instructions.md` by default). This upserts all 16 sessions into the scoped project (15 existing sessions → updated; 1 new pipeline-7 session → inserted). Verify the result reports `inserted >= 0`. Then run `knowledgebase_knowledgebase_stats` + `knowledgebase_knowledgebase_list` to confirm `@abarcenas/ai-workflow-template` now has ≥ 16 chunks. | DB (no file changes) | A | — | 2026-08-03 |
| T3 | **Update `tracker.agent.md` "Check Knowledge" step** to specify projectId derivation. Add after line 29: an explicit note that when calling `knowledgebase_index`, the `projectId` parameter SHALL be read from `package.json` `name` field (`require('./package.json').name`), NOT from the orchestrator's `projectName` parameter (which may be a short/unscoped display name). This is the KEY remediation point — Pipeline 7's tracker used `ai-workflow-template` instead of the scoped name. | `.opencode/agents/tracker.agent.md` | A | — | 2026-08-03 |
| T4 | **Add canonical projectId derivation rule to knowledge-retrieval protocol.** Insert a new subsection after line 5 (after the "Layer 3" section) in `.agents/instructions/knowledge-retrieval.instructions.md` titled `### Canonical projectId`. Content: "When calling `knowledgebase_knowledgebase_index`, the `projectId` parameter MUST equal `require('./package.json').name` — the scoped package name if one exists (e.g., `@abarcenas/ai-workflow-template`). Never derive projectId from directory names, orchestrator context, or display strings. The `package.json` `name` field is the single source of truth." | `.agents/instructions/knowledge-retrieval.instructions.md` | A | — | 2026-08-03 |
| T5 | **Strengthen `knowledgebase.instructions.md` tool table.** At line 27, the `knowledgebase_index` row currently says `projectId` is "optional". Change to: "`projectId` (required — from `package.json` `name` field)". Also add a sentence at line 37: "The `projectId` MUST be the scoped package name (e.g., `@abarcenas/ai-workflow-template`), read from `package.json` `name`. This ensures a single canonical project per repository." | `.agents/instructions/knowledgebase.instructions.md` | A | — | 2026-08-03 |
| T6 | **Update orchestrator `projectName` parameter documentation** in all 3 orchestrator specs to guide reading `package.json` for the scoped name. In each file (`orchestrator.agent.md:25`, `feature-pipeline.agent.md:20`, `tdd-orchestrator.agent.md:20`), change the `projectName` description from `"extracted from user request"` to: `"extracted from user request (prefer package.json \"name\" for the canonical scoped projectId)"`. This is a doc-only change — the orchestrator doesn't inject projectId, but setting the expectation reduces the "project name from user" vs "canonical package name" gap. | `.opencode/agents/orchestrator/orchestrator.agent.md`, `.opencode/agents/orchestrator/feature-pipeline.agent.md`, `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` | A | — | 2026-08-03 |
| T7 | **Document MCP server restart note.** Add a subsection to `.agents/instructions/knowledgebase.instructions.md` after the graceful degradation section (after line 187) titled `### MCP Server Restart After Configuration Changes`. Content: "When `mcp-knowledgebase-server.js` is updated (e.g., a threshold fix or handler change), the MCP server process spawned by OpenCode may hold a stale copy. **After any code change to the knowledgebase server or scripts, restart OpenCode** (or reload MCP servers) to pick up the latest version. Common gotcha: `knowledgebase_search` returns 0 results despite chunks in the DB because the MCP process is using an old threshold default. Restart resolves this." Also add a one-line cross-reference in the existing search tool description (line 26-28) noting "Restart OpenCode after code changes to pick up updates." | `.agents/instructions/knowledgebase.instructions.md` | A | — | 2026-08-03 |

> **Note (2026-08-03):** The orchestrator re-batched T6's file set across two parallel coder instances. T6 handled `.opencode/agents/orchestrator/orchestrator.agent.md` (line 25); the "T7"-labeled coder instance handled `.opencode/agents/orchestrator/feature-pipeline.agent.md` (line 20) and `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` (line 20). All three now carry the identical `projectName` description: `extracted from user request (prefer package.json "name" for the canonical scoped projectId)`. The plan's T7 row (MCP restart note in `knowledgebase.instructions.md`) was completed separately by the knowledgebase-instructions agent (T5-adjacent).

## Phase 2 — DB Cleanup (depends on T1) — ✅ COMPLETE 2026-08-03

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T2 | **Delete the unscoped duplicate project.** After verifying T1 completed successfully (scoped project has ≥ 16 chunks), delete the `ai-workflow-template` project row. The `ON DELETE CASCADE` FK on `knowledge_chunks.project_id REFERENCES projects(id)` means deleting the `projects` row will cascade-delete all 16 duplicate chunks. Execute: `DELETE FROM projects WHERE id = 'ai-workflow-template'`. Verify: `knowledgebase_knowledgebase_stats` should show 4 projects (down from 5) and ≥ 48 chunks (52 − 16 + any new inserts from T1). `knowledgebase_knowledgebase_list` should NOT include `ai-workflow-template`. | DB (no file changes) | — | T1 | 2026-08-03 |

## Phase 3 — Verification (Batch B — Parallel) — ✅ COMPLETE 2026-08-03

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T8 | **Run full test suite.** Execute `npm test` (Vitest) — verify 273/273 (or current count) across all 14 test files pass, plus the setup suite at 104/104. If any test fails, investigate — no production code changes in this plan should affect tests; failures indicate a merge/rebase issue. | `vitest.config.ts` (no change — just runs) | B | T3, T4, T5, T6, T7 | 2026-08-03 |
| T9 | **Create consolidation spec-wiring test.** Create `tests/spec-kb-consolidation.test.js` with these tests: (1) `tracker.agent.md` references `package.json` `name` as projectId source for `knowledgebase_index`; (2) `knowledge-retrieval.instructions.md` contains "Canonical projectId" subsection with "package.json" mention; (3) `knowledgebase.instructions.md` no longer says `projectId` is "optional" for `knowledgebase_index` (must say "required"); (4) All 3 orchestrator `projectName` descriptions mention "package.json"; (5) MCP restart note exists in `knowledgebase.instructions.md`. Follow the pattern established by `tests/spec-knowledge-retrieval.test.js` and `tests/spec-orchestrator-parity.test.js` (grep-based assertions, no Vitest mocks, descriptive `it()` names). Run: `npx vitest run tests/spec-kb-consolidation.test.js` — all 5 tests must pass. | `tests/spec-kb-consolidation.test.js` (new) | B | T2, T3, T4, T5, T6, T7 | 2026-08-03 |

## Phase 4 — Documentation (sequential) — ✅ COMPLETE 2026-08-03

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T10 | **Update memory bank + mark plan complete.** Update `memory-bank/activeContext.md` — append a note about the KB consolidation and standardization completion. Update `memory-bank/progress.md` — document the consolidation result (projects reduced, chunks merged). Update `memory-bank/tasks/_index.md` if a task file was created. Mark this plan's frontmatter `status` to `Completed`. Run `memory_bank_memory_update`. | `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/tasks/_index.md`, `plan/process-kb-consolidation-1.md` | — | T8, T9 | 2026-08-03 |

## Alternatives Considered

| ID | Alternative | Rationale for Rejection |
|----|-------------|------------------------|
| ALT-01 | **UPDATE project_id in-place** — `UPDATE knowledge_chunks SET project_id = '@abarcenas/ai-workflow-template' WHERE project_id = 'ai-workflow-template'` then delete the project row. | Would fail on unique constraint `uq_knowledge_chunk (project_id, session_date, content_hash)` — 15 of the 16 chunks in `ai-workflow-template` share the same `(session_date, content_hash)` with existing chunks in `@abarcenas/ai-workflow-template`. Postgres would reject the UPDATE with a duplicate-key violation. |
| ALT-02 | **Content-level merge** — manually identify which chunks exist in one project but not the other, then selectively UPDATE or INSERT. | High complexity for zero benefit. The `learned-knowledge.instructions.md` file IS the source of truth. Re-indexing from source is guaranteed correct, idempotent, and requires zero SQL expertise. |
| ALT-03 | **DELETE unscoped project first, then re-index** — destroy duplicate data before ensuring canonical project is complete. | Unsafe ordering. If learned-knowledge file is somehow corrupted or unreadable after deletion, data could be lost. The T1 → T2 ordering (populate first, delete second) is fail-safe — if T1 fails, T2 is never reached. |
| ALT-04 | **Modify `knowledgebase-cli.js` `resolveProjectId()` to normalize scoped names** (strip scope prefix for non-scoped comparison). | The issue is not in the CLI (it already reads `package.json` `name` correctly). The issue is that Pipeline 7's tracker passed a hardcoded short name. Fixing the CLI would not prevent recurrence. |

## Dependencies

| ID | Description |
|----|-------------|
| DEP-01 | T1 (re-index) MUST complete successfully before T2 (delete). Deleting before re-indexing risks data loss. |
| DEP-02 | T2 MUST complete before T9 (spec test). The spec test verifies the consolidation result via `knowledgebase_list`. |
| DEP-03 | T3, T4, T5, T6, T7 MUST complete before T8 (test suite). Doc-only changes could theoretically break existing spec-wiring tests that grep for exact strings. |
| DEP-04 | T8 + T9 MUST pass before T10 (plan marked complete). The memory bank should only reflect a verified-successful outcome. |
| DEP-05 | DATABASE_URL MUST be configured in `.env` for T1 and T2. If absent, T1 fails gracefully and the pipeline stops before T2. |

## Files

| ID | Path | Change | 
|-----|------|--------|
| FILE-01 | `.opencode/agents/tracker.agent.md` | ADD projectId derivation guidance after line 29 |
| FILE-02 | `.agents/instructions/knowledge-retrieval.instructions.md` | ADD "Canonical projectId" subsection after line 5 |
| FILE-03 | `.agents/instructions/knowledgebase.instructions.md` | MODIFY line 27 (`projectId` optional → required) + ADD restart-note section after line 187 + MODIFY line 37 (`projectId` guidance) |
| FILE-04 | `.opencode/agents/orchestrator/orchestrator.agent.md` | MODIFY line 25 (`projectName` description) |
| FILE-05 | `.opencode/agents/orchestrator/feature-pipeline.agent.md` | MODIFY line 20 (`projectName` description) |
| FILE-06 | `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` | MODIFY line 20 (`projectName` description) |
| FILE-07 | `tests/spec-kb-consolidation.test.js` | CREATE (new spec-wiring test, 5 scenarios) |
| FILE-08 | `plan/process-kb-consolidation-1.md` | MODIFY frontmatter `status` → Completed |
| FILE-09 | `memory-bank/activeContext.md` | UPDATE (append consolidation note) |
| FILE-10 | `memory-bank/progress.md` | UPDATE (append consolidation result) |

## Testing

| ID | Description | Phase | Automated? |
|----|-------------|-------|------------|
| TEST-01 | `knowledgebase_knowledgebase_list` shows 4 projects (was 5), `ai-workflow-template` absent | Phase 2 | No (read-only DB check) |
| TEST-02 | `knowledgebase_knowledgebase_stats` shows ≥ 16 chunks for `@abarcenas/ai-workflow-template` | Phase 1 | No (read-only DB check) |
| TEST-03 | Full Vitest suite passes 273/273 (or current) + setup 104/104 | Phase 3 | Yes (`npm test`) |
| TEST-04 | `tests/spec-kb-consolidation.test.js` — all 5 spec-wiring tests pass | Phase 3 | Yes (`npx vitest run tests/spec-kb-consolidation.test.js`) |
| TEST-05 | `tracker.agent.md` contains "package.json" and "name" near "knowledgebase_index" | Phase 3 | Yes (spec test, T9 test #1) |
| TEST-06 | `knowledge-retrieval.instructions.md` contains "Canonical projectId" heading | Phase 3 | Yes (spec test, T9 test #2) |
| TEST-07 | `knowledgebase.instructions.md` `knowledgebase_index` row no longer says `projectId` is "optional" | Phase 3 | Yes (spec test, T9 test #3) |
| TEST-08 | All 3 orchestrator files mention "package.json" in `projectName` description | Phase 3 | Yes (spec test, T9 test #4) |
| TEST-09 | `knowledgebase.instructions.md` contains "MCP Server Restart After Configuration Changes" | Phase 3 | Yes (spec test, T9 test #5) |

## Risks & Assumptions

| ID | Type | Description | Mitigation |
|----|------|-------------|------------|
| RISK-01 | Data | The `learned-knowledge.instructions.md` file could be in a different state than when Pipeline 7 ran — sessions may have been added/removed since indexing. | Re-indexing from source correctly reflects CURRENT state. The 15→16 overlap is expected (pipeline 7 added 1 session). The idempotent upsert handles any content drift. |
| RISK-02 | Data | Other projects' chunks share the `ai-workflow-template` project_id (unlikely — it's our project name). | Verify `SELECT COUNT(*) FROM knowledge_chunks WHERE project_id = 'ai-workflow-template'` returns exactly 16 before deleting. |
| RISK-03 | Test | Spec-wiring tests that grep for exact strings could fail if doc changes shift line positions. | Use robust grep patterns (not line numbers) — follow the pattern in `tests/spec-knowledge-retrieval.test.js`. |
| ASSUMPTION-01 | Content | The 16 chunks in `ai-workflow-template` are subsets/supersets of the 15 in `@abarcenas/ai-workflow-template` — same learned-knowledge file, different indexing runs. | Verified by the researcher in Pipeline 8: "Content is identical between the two (same sessions/chunks, just different projectId)." |
| ASSUMPTION-02 | DB | `DATABASE_URL` in `.env` is configured and the PostgreSQL instance is running. | Graceful failure: `knowledgebase_index` reports availability errors; pipeline stops at T1 if DB unreachable. |
| ASSUMPTION-03 | Content | No other pipeline or process is concurrently writing to the knowledgebase during consolidation. | Single-user MCP stdio transport; sequential pipeline execution by design. |
| ASSUMPTION-04 | Scope | `scripts/knowledgebase-cli.js` is already correct (reads `package.json` `name`). | Verified at `knowledgebase-cli.js:71-79` — `resolveProjectId()` returns `pkg.name` which is `@abarcenas/ai-workflow-template`. |

## Related Specifications

- `docs/adr-knowledgebase-pgvector.md` — Schema definition, column rationale, index strategy
- `.agents/instructions/knowledgebase.instructions.md` — Tool documentation, graceful degradation protocol
- `.agents/instructions/knowledge-retrieval.instructions.md` — 3-layer knowledge retrieval protocol
- `docs/.orchestrator-log.md` (Pipeline 8: researcher diagnosis, Pipeline 9: this plan's pipeline)
- `plan/feature-knowledge-vector-gaps-1.md` — Pipeline 7 plan that introduced the duplicate (tracker passed unscoped projectId)
- `plan/fix-kb-registerproject-1.md` — `registerProject` fix (related: proved the FK constraint that makes cascade-delete work)
