---
id: "_index"
title: "Tasks Index"
updated: "2026-08-03"
tags: [fix-kb-registerproject, knowledgebase, mcp, implementation-planning, readme]
entities: []
category: "context"
---


# Tasks Index

## Pending

## Completed

- [fix-kb-registerproject] Fix MCP `knowledgebase_index` missing `registerProject()` call — ALL 3 BATCHES COMPLETE (T1 code ✅, T2 code ✅, T3 tests ✅, T4 validation ✅, T5 memory-bank ✅) 2026-08-02 — `scripts/mcp-knowledgebase-server.test.js` now has 21 tests (all passing; full suite **181/181 across 10 files**); regression guard verified non-vacuous via mutation test (removing the `registerProject` call fails 3 tests: TEST-01, TEST-16, TEST-06c); `mcp-knowledgebase-server.js` coverage 79.66% stmts / 81.03% lines. Plan status: **Completed** — **Reviewer: ✅ APPROVED WITH NITS 2026-08-02** — **Nits: ✅ ALL RESOLVED 2026-08-02** (schema default 0.6→0.1; error messages redact connection-string credentials; whitespace-only projectId rejected + trimmed pid downstream; TEST-05 redundant assertion removed; +2 tests) — **TEST-12 live-spawn smoke test: ✅ PASSED 2026-08-02** (spawned real server over stdio; `knowledgebase_index` with fresh projectId → "Indexed 1 chunks, updated 0, skipped 0"; test rows cleaned up) — **Nit-fix re-review 2026-08-02: ⚠️ CHANGES REQUESTED (narrowly scoped)** — 178/178 re-verified; 🟡 `redactConnectionString` fails OPEN on unix-socket authority URLs (`postgres://user:secret@/var/run/postgresql` → credentials leak; engine fails closed `'***'`) — add regex fallback in the catch; 🔵 only first URL token redacted / stray `host:` colon / search projectId untrimmed (pre-existing). — **🟡 Major RESOLVED 2026-08-02 (Coder): redaction hardening done** — `redactConnectionString` rewritten to a single global regex `/(postgres(?:ql)?:\/\/)([^/\s]+)@/gi` → `'$1***@'` (fail-closed by construction; all tokens redacted; host/path preserved; `[^/\s]+` also handles `@`-in-password); 🔵 minors also addressed (all-tokens redaction, no stray port colon); +3 tests (TEST-17/18/19, 18 → 21) through the real outer-catch path. — **Final sign-off review 2026-08-02: ✅ APPROVED (Reviewer)** — blocker resolved (unix-socket + `?host=` forms redact to `***@`, verified empirically); `[^/\s]+` sound (no over-matching; TEST-15/16 readable); all 3 new tests non-vacuous (replayed OLD helper → all 3 fail/leak); full suite independently re-run **181/181 across 10 files, 0 failures**. 🔵 minors out of scope (search projectId untrimmed; `limit ||` vs `??`; query-string params). registerProject fix itself approved — Completed on 2026-08-02 — **Minor-hygiene fixes 2026-08-02 (Coder): ✅ DONE** — search `projectId` now trimmed/validated (`?.trim() || undefined`, whitespace-only → match-all), `limit: args.limit ?? 5` (explicit 0 honored), `redactConnectionString` regex extended to redact query/fragment (`?***`/`#***`; `?password=hunter2` no longer survives). Tests 21 → **25** (TEST-20 whitespace-only search projectId, TEST-20b trimmed search projectId, TEST-21 `limit: 0`, TEST-22 query-string redaction; TEST-18 expectation updated to `?***`). Full suite **185/185 across 10 files, 0 failures**; `node --check` ✅ — **Independent validation 2026-08-02 (Unit Tester): ✅ PASS, NO ISSUES** — 185/185 full suite + 25/25 MCP file re-confirmed; all 4 new tests non-vacuous via actual temp mutation (revert `?? 5` → fails TEST-21; revert `?.trim()` → fails TEST-20+20b; revert query redaction → fails TEST-18+22; remove registerProject call → fails TEST-01+06c+16); TEST-01/16/06c order+args guards + TEST-17/19 fail-closed redaction intact. — **Final sign-off review 2026-08-02 (Reviewer): ✅ APPROVED — NO NEW ISSUES** — independently re-ran full suite **185/185 across 10 files, 0 failures**; 3 hygiene fixes verified correct (search projectId trim→match-all sound & consistent with graceful-degradation pattern vs index handler's required-write-target error; `limit ?? 5` honors explicit 0; query/fragment redaction still fail-closed by construction — pure regex, no URL parse, host/path preserved); 12-case redaction probe all PASS; TEST-20/20b/21/22 + updated TEST-18 meaningful & non-vacuous; registerProject guard + TEST-17/19 intact; only 🔵 informational nits (schema `limit` doc "(1–50)" vs honored 0; engine limit clamping pre-existing; header comment omits 20b). Plan §12 accurate. — Completed on 2026-08-02
- [release-v1.40.0] Release v1.40.0: commit (1aa4775), annotated tag v1.40.0, pushed to origin — Completed on 2026-08-02
- [readme-rewrite] Rewrite README.md — trim marketing/emoji fluff, move Install + Git Hook Setup to the very top, condense to compact reference (469 → 289 lines, all structural markdownlint rules pass) — Completed on 2026-08-03 — **Reviewer: ✅ APPROVED 2026-08-03** (instructions at top within first ~30 lines; all required commands/tables/options preserved; all 4 accuracy claims confirmed: 29 skills, orchestrator path exists, `--knowledgebase` real flag, `.agents/compress/`+`.agents/agents/` absent; 0 structural markdownlint errors; 🔵 minor informational only — `graphify` listed as featured skill is a global skill not shipped in `.agents/skills/`, pre-existing wording) — **🔵 Nit FIXED 2026-08-03 (Coder)**: Featured Skills now lists `` `graphify` (global skill), `graphify-framework-aware` `` (line 225) — verified global `~/.config/opencode/skills/graphify` vs shipped `.agents/skills/graphify-framework-aware`; markdownlint re-check 0 structural errors
- [kb-mcp-dotenv-fix] Fix knowledgebase MCP server to load `.env` (DATABASE_URL) — library-level dotenv import + local `opencode.json` env block — Completed on 2026-08-02
- [kb-mcp-threshold-fix] Fix knowledgebase MCP search default threshold (0.6 → 0.1 via `??`) so results are not filtered out — Completed on 2026-08-02
- [fix-setup-env-loading T1] Move `dotenv` from devDependencies → dependencies — Completed on 2026-08-01
- [fix-setup-env-loading T2] Add `import 'dotenv/config'` at top of `bin/setup.js` — Completed on 2026-08-01
- [fix-setup-env-loading T5] Bump package version 1.39.0 → 1.39.1 — Completed on 2026-08-01
- [fix-setup-env-loading T6] Add `--knowledgebase` flag handling in `scripts/setup/index.js` — Completed on 2026-08-01
- [fix-setup-env-loading T10] Update `scripts/setup/knowledgebase.test.js` warning-message assertion — Completed on 2026-08-01
- [fix-setup-env-loading T7] Add `skipKnowledgebase` description to help text — Completed on 2026-08-01
- [fix-setup-env-loading T8] Add `knowledgebase` (standalone flag) description to help text — Completed on 2026-08-01
- [fix-setup-env-loading T9] Fix unscoped package name / bogus `setup` positional in help text — Completed on 2026-08-01
- [fix-setup-env-loading T11] Run full Vitest test suite + add `--knowledgebase` orchestrator tests — Completed on 2026-08-01
- [fix-setup-env-loading T12] Consumer-level smoke test with temp `.env` (DATABASE_URL detection) — Completed on 2026-08-01
- [T1-KB] Create `scripts/knowledgebase-init.sql` — Completed on 2026-07-29
- [T1] Create `scripts/setup/constants.js` — Completed on 2026-07-24
- [T2] Create `scripts/setup/utils.js` — Completed on 2026-07-24
- [T3] Create `scripts/setup/ui.js` — Completed on 2026-07-24
- [T4] Create `scripts/setup/discover.js` — Completed on 2026-07-24
- [T5] Create `scripts/setup/hooks.js` — Completed on 2026-07-24
- [T6] Create `scripts/setup/prepare.js` — Completed on 2026-07-24
- [T7] Create `scripts/setup/husky-init.js` — Completed on 2026-07-24
- [T8] Create `scripts/setup/sync-phase.js` — Completed on 2026-07-24
- [T9] Create `scripts/setup/index.js` — Completed on 2026-07-24
- [T10] Create `bin/setup.js` — Completed on 2026-07-24
- [T11] Add marker comment to `.husky/pre-commit` — Completed on 2026-07-24
- [T12] Add marker comment to `.husky/post-merge` — Completed on 2026-07-24
- [T13] Modify `package.json` for setup command — Completed on 2026-07-24
- [T14] Create `scripts/setup/discover.test.js` — Completed on 2026-07-24
- [T15] Create `scripts/setup/hooks.test.js` — Completed on 2026-07-24
- [T16] Create `scripts/setup/prepare.test.js` — Completed on 2026-07-24
- [T17] Create `scripts/setup/index.test.js` — Completed on 2026-07-24
