---
id: "tracker-index"
title: "Tracker Pipeline Index"
updated: "2026-07-24"
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

## Entry Locations

| Feature | Doc Path |
|---------|----------|
| Infrastructure Bootstrap | `docs/tracker-log.md` |
| Instruction rewrites (opencode) | `docs/tracker-log.md` |
| Vector DB Research Spike | `docs/tracker-log.md`, `docs/spike-vector-db-memory.md` |
| Setup Command | `docs/tracker-log.md`, `docs/setup-command/tracker.md` |
| Verbose Logging | `docs/tracker-log.md`, `docs/spike-verbose-logging.md`, `docs/verbose-logging/tracker.md` |
| Fix Hook Script References | `docs/tracker-log.md`, `docs/spike-post-merge-hook-scripts.md`, `docs/hook-script-references/tracker.md`, `.agents/instructions/learned-knowledge.instructions.md` |

### Learned Knowledge Sessions

| Session | Pipeline | Location |
|---------|----------|----------|
| 2026-06-13 | TDD Infrastructure Bootstrap | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-24 | Setup Command (17 tasks, 6 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-24 | Verbose Logging (10 tasks, 4 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
| 2026-07-24 | Fix Hook Script References (5 tasks, 2 batches) | `.agents/instructions/learned-knowledge.instructions.md` |
