---
id: "tracker-index"
title: "Tracker Pipeline Index"
updated: "2026-08-03"
tags: [tracker, index, pipeline, orchestrator]
doc_type: "tracker-index"
---

# Tracker Pipeline Index

Shared index of all tracked pipelines and their latest entry timestamps.

| Pipeline | Feature | Latest Entry | Status |
|----------|---------|-------------|--------|
| TDD Orchestrator Bootstrap | Infrastructure | 2026-06-13 | ✅ Complete |
| Standalone (various) | Instruction rewrites | 2026-06-25 | ✅ Complete |
| Standalone (researcher) | Vector DB spike | 2026-07-23 | ✅ Complete |
| Feature Pipeline | Setup Command — `npx ai-workflow-setup` | 2026-07-24 | ✅ Complete (88/88 tests) |
| Feature Pipeline | Verbose Logging — `npx ai-workflow-setup --verbose` | 2026-07-24 | ✅ Complete (96/96 tests) |
| Feature Pipeline | Fix Hook Script References — Consumer-Project Hook Resolution | 2026-07-24 | ✅ Complete (7/7 tests, 52/52 assertions, 13/13 MCP refs) |
| Feature Pipeline | Centralized Knowledgebase — PostgreSQL + pgvector MCP | 2026-07-29 | ✅ Complete (158 tests, 0 failures) |
| Feature Pipeline | MCP Config Rename — Consumer Provisioning to `opencode.json` | 2026-07-30 | ✅ Complete (109 tests, 0 regressions) |
| Feature Pipeline | Fix npm E404 + Setup `.env` Loading (release v1.40.0) | 2026-08-02 | ✅ Complete (160 tests, 0 failures; commit 1aa4775, tag v1.40.0) |
| Follow-up (housekeeping #2) | Knowledgebase MCP Search Threshold Fix | 2026-08-02 | ✅ Complete (1-line fix; CLI + MCP handshake verified; live search 5 results) |
| Bug-fix Pipeline | Fix PG Knowledgebase Write Bug — registerProject upstream | 2026-08-02 | ✅ Complete (176/176 tests; mutation-tested regression guard; reviewer APPROVED WITH NITS) |
| Bug-fix Pipeline 2 | Follow-up: registerProject nits + TEST-12 smoke test + redaction hardening | 2026-08-02 | ✅ Complete (181/181 tests; TEST-12 live-spawn PASS; fail-closed redaction; reviewer APPROVED) |
| Bug-fix Pipeline 3 | Final minor-hygiene: search projectId trim + `limit ?? 5` + query-string redaction | 2026-08-02 | ✅ Complete (185/185 tests; all 4 new tests non-vacuous; reviewer APPROVED, no follow-ups) |
| Documentation Pipeline 4 | README.md trim + instructions-on-top | 2026-08-03 | ✅ Complete (README 469→289 lines; 4 accuracy fixes verified; 0 markdownlint structural errors; reviewer APPROVED) |

## Entry Locations

| Feature | Doc Path |
|---------|----------|
| Infrastructure Bootstrap | `docs/tracker-log.md` |
| Instruction rewrites (opencode) | `docs/tracker-log.md` |
| Vector DB Research Spike | `docs/tracker-log.md`, `docs/spike-vector-db-memory.md` |
| Setup Command | `docs/tracker-log.md`, `docs/setup-command/tracker.md` |
| Verbose Logging | `docs/tracker-log.md`, `docs/spike-verbose-logging.md`, `docs/verbose-logging/tracker.md` |
| Fix Hook Script References | `docs/tracker-log.md`, `docs/spike-post-merge-hook-scripts.md`, `docs/hook-script-references/tracker.md`, `.agents/instructions/learned-knowledge.instructions.md` |
| Centralized Knowledgebase (pgvector MCP) | `docs/tracker-log.md`, `docs/knowledgebase-pgvector/tracker.md`, `.agents/instructions/learned-knowledge.instructions.md` |
| MCP Config Rename | `docs/tracker-log.md`, `docs/config-opencode-mcp-rename/tracker.md` |
| Fix npm E404 + Setup `.env` Loading | `docs/tracker-log.md`, `docs/spikes/npm-e404-consumption-investigation.md`, `docs/spike-kb-database-url.md`, `docs/spike-kb-mcp-database-url-investigation.md`, `plan/fix-setup-env-loading-v1.md` |
| Knowledgebase MCP Search Threshold Fix | `docs/tracker-log.md`, `docs/spike-knowledgebase-search-empty-results.md`, `scripts/mcp-knowledgebase-server.js` |
| Fix PG Knowledgebase Write Bug (registerProject) | `docs/tracker-log.md`, `plan/fix-kb-registerproject-1.md`, `scripts/mcp-knowledgebase-server.js`, `scripts/mcp-knowledgebase-server.test.js` |
| RegisterProject Follow-up (nits + TEST-12 + redaction) | `docs/tracker-log.md`, `plan/fix-kb-registerproject-1.md` (§9-§11), `scripts/mcp-knowledgebase-server.js`, `scripts/mcp-knowledgebase-server.test.js` |
| RegisterProject Final Minor-Hygiene (search trim + limit `??` + query redaction) | `docs/tracker-log.md`, `plan/fix-kb-registerproject-1.md` (§12), `scripts/mcp-knowledgebase-server.js`, `scripts/mcp-knowledgebase-server.test.js` |
| README Trim + Instructions-on-Top | `docs/tracker-log.md`, `README.md` |

### Learned Knowledge Sessions

| Session | Pipeline | Location |
|---------|----------|----------|
| 2026-06-13 | TDD Infrastructure Bootstrap | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-24 | Setup Command (17 tasks, 6 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-24 | Verbose Logging (10 tasks, 4 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-24 | Fix Hook Script References (5 tasks, 2 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-29 | Centralized Knowledgebase (17 tasks, 5 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-30 | MCP Config Rename (8 files modified, 1 deleted, 109 tests) | `.agents/instructions/learned-knowledge.instructions.md`, `docs/config-opencode-mcp-rename/tracker.md` |
| 2026-08-02 | Fix npm E404 + Setup `.env` Loading (12 tasks, 3 batches, 160 tests, release v1.40.0) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-08-02 | Knowledgebase MCP Search Threshold Fix (threshold 0.6 → 0.1, `\|\|` → `??`, MCP restart gotcha) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-08-02 | PG Knowledgebase Write Bug Fix (FK 23503 root cause, registerProject before upsertChunks, MCP testability seam, mutation-tested guard) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-08-02 | RegisterProject Follow-up (fail-closed regex redaction, `[^/\s]+` vs `[^@\s]+`, live-spawn smoke test, whitespace-trim strengthening) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-08-02 | RegisterProject Final Minor-Hygiene (search-filter vs write-target trim asymmetry, `?? 5` explicit-zero honoring, extended-regex query/fragment redaction, mutation-matrix non-vacuity) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-08-03 | README Trim + Instructions-on-Top (accuracy-audit pattern, first-screen instructions, fluff-cut criterion, global-vs-package skill trap, markdownlint gate) | `.agents/instructions/learned-knowledge.instructions.md` |
