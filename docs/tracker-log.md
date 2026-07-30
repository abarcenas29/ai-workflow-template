---
id: "tracker-log"
title: "Tracker Log"
updated: "2026-07-29"
tags: [architect, researcher, coder, implementer, tester, reviewer, tracker, orchestrator, bootstrap, setup, configuration, refactor, tdd, research, spike, implementation, decision, discovery]
doc_type: "tracker-log"
---


# Tracker Log

Chronological record of work completed by the multi-agent pipeline. Each entry is appended by the tracker agent after a pipeline step finishes.

---

## Project Overview

**Repository:** @abarcenas/ai-workflow-template
**Stack:** Node.js (ESM), TypeScript (config), Playwright, Vitest, graphify, OpenCode agents

---

## Entries

## TDD Orchestrator Infrastructure Bootstrap

**Date:** 2026-06-13
**Status:** ✅ SUCCESS

### Summary

Bootstrapped all prerequisites for the TDD orchestrator RED→GREEN→REFACTOR/VERIFY pipeline. Installed Vitest with v8 coverage, generated the graphify knowledge graph (1328 nodes, 1299 edges), populated the architecture context document, initialized all 6 memory bank core files, and validated the unit test framework end-to-end.

### Files Produced / Modified

| File | Description |
|---|---|
| `vitest.config.ts` | Vitest config targeting `scripts/`, 90% coverage thresholds |
| `package.json` | Added `test:unit`, `test:unit:coverage`, `test:unit:watch` scripts |
| `docs/.architecture-context.md` | Full architecture analysis: tech stack, layer structure, patterns |
| `docs/.orchestrator-log.md` | Pipeline orchestration log |
| `.agents/instructions/learned-knowledge.instructions.md` | Cross-session knowledge base |
| `memory-bank/projectbrief.md` | Core requirements, goals, scope |
| `memory-bank/productContext.md` | Problem, solution, UX goals |
| `memory-bank/systemPatterns.md` | Architecture, design patterns, component relationships |
| `memory-bank/techContext.md` | Technologies, dev setup, constraints |
| `memory-bank/activeContext.md` | Current focus, recent changes, next steps |
| `memory-bank/progress.md` | What works, what's left, known issues |
| `memory-bank/tasks/_index.md` | Task tracking index |
| `graphify-out/` | Knowledge graph: 1328 nodes, 1299 edges, 131 communities |
| `plan/` | Implementation plan storage directory |
| `scripts/sync.test.js` | Sample unit test (2 tests passing) |
| `README.md` | Added TDD orchestrator, memory bank, testing sections |

### Key Decisions

- Vitest over Jest — lighter, faster, native ESM support, built-in v8 coverage
- Tests target `scripts/` directory (not `src/`) — matches project's code layout
- Coverage threshold set to 90% (statements, branches, functions, lines) — enforces TDD discipline
- graphify graph generated via AST-only extraction (`graphify update .`) — no API cost

### Notes / Follow-up

TDD orchestrator is fully ready for its first real feature pipeline. To run: describe the feature/task to build and the orchestrator will invoke implementer → unit-tester∥ (RED) → coder∥ (GREEN) → unit-tester (VERIFY) → reviewer → tracker.

## Standalone: Coder - Implementation — Rewrite prompt.instructions.md for opencode

**Date:** 2026-06-25
**Status:** ✅ SUCCESS

### Summary
Rewrote `.agents/instructions/prompt.instructions.md` from GitHub Copilot-specific guidance to opencode equivalents. All references (title, description, audience, tool list, frontmatter fields, directory paths, URLs, variable syntax, and testing procedures) were updated while preserving the overall document structure and generic prompt engineering advice.

### Files Produced / Modified
| File | Description |
|---|---|
| `.agents/instructions/prompt.instructions.md` | Full rewrite: Copilot→opencode references, simplified frontmatter, opencode tool list, removed Copilot-specific syntax |

### Key Decisions
- Removed Copilot-specific frontmatter fields (`agent`, `model`, `argument-hint`) — opencode doesn't support them
- Replaced `${input:variableName}` and `${selection}`/`${file}`/`${workspaceFolder}` with explicit prose-based guidance for specifying inputs and referencing file paths
- Listed opencode's actual tool set (`Bash`, `Read`, `Write`, etc.) instead of Copilot's tool categories
- Changed directory from `.github/prompts/` to `.agents/prompts/` to match project conventions
### Notes / Follow-up

None.

## Standalone: Coder - Implementation — Rewrite agent.instructions.md for opencode

**Date:** 2026-06-25
**Status:** ✅ SUCCESS

### Summary

Rewrote `.agents/instructions/agent.instructions.md` (1068 → 609 lines) to replace all GitHub Copilot references with opencode equivalents. Removed Copilot-specific sections (Handoffs Configuration, MCP Server Configuration, Agent Processing/Behavior, Version Compatibility) totaling ~300 lines. Replaced the tool configuration with opencode's actual tool set (`Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Task`, `TodoWrite`, `Skill`, `WebFetch`, `WebSearch`). Simplified frontmatter to only `description`, `name`, and `tools`. Adapted sub-agent orchestration to use `Task` tool and `.agents/agents/` paths. Removed `${variableName}` syntax in favor of plain-language descriptions.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/instructions/agent.instructions.md` | Full rewrite — 1068→609 lines, all Copilot references replaced with opencode equivalents |

### Key Decisions

- Kept Sub-Agent Orchestration, Agent Prompt Structure, Variable Definition, Creation Checklist, Common Patterns, Common Mistakes, and Testing/Validation sections (all contain generic guidance applicable to opencode)
- Removed ~300 lines of Copilot-only content (Handoffs Configuration, MCP Server Configuration, Agent Processing/Behavior, Version Compatibility)
- Replaced `${variableName}` template syntax with plain-language descriptions — opencode doesn't support variable interpolation in agent prompts
- Changed all tool aliases from Copilot format (`execute`, `edit`, `search`, `agent`, `web`, `todo`) to opencode's case-sensitive tool names (`Bash`, `Edit`, `Grep`, `Task`, `WebFetch`, `TodoWrite`)
- Changed directory paths from `.github/agents/` to `.agents/agents/` throughout
- Removed org/enterprise-level agent distinction since opencode only supports repository-level agents

### Notes / Follow-up

This was the largest instruction file (1068 lines). Now three instruction files have been ported from Copilot to opencode: `prompt.instructions.md`, `instructions.instructions.md`, and `agent.instructions.md`. Remaining instruction files that may still reference Copilot should be reviewed.

---

## Standalone: Coder — Rewrite instructions.instructions.md for opencode

**Date:** 2026-06-25
**Status:** ✅ SUCCESS

### Summary

Rewrote `.agents/instructions/instructions.instructions.md` to replace all GitHub Copilot references with opencode equivalents. Changed description, target audience, file location, testing instructions, and additional resources URLs while preserving all other content including frontmatter guidelines, file structure, writing style, best practices, patterns, examples, and maintenance sections.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/instructions/instructions.instructions.md` | Rewritten — 6 key reference changes applied (264 → 263 lines) |

### Key Decisions

- Followed explicit replacement map from user for each bullet point
- Removed "Awesome Copilot Instructions" link entirely per instruction (remove or replace with generic reference)
- Kept all structural, example, and guidance content untouched — only adapted Copilot mentions to opencode equivalents
- Reduced file from 264 to 263 lines by removing one extraneous URL entry

### Notes / Follow-up

None. File is self-consistent and uses opencode terminology throughout.

## Standalone: Coder - Implementation — Rewrite prompt-builder SKILL.md for opencode

**Date:** 2026-06-25
**Status:** ✅ SUCCESS

### Summary

Rewrote `.agents/skills/prompt-builder/SKILL.md` replacing all GitHub Copilot references with opencode equivalents. Updated frontmatter description, expertise statements, persona questions, tool lists, variable syntax, and template frontmatter to use opencode terminology and tool names while preserving the Discovery Process questions, Best Practices Integration, and Template Generation structure.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/skills/prompt-builder/SKILL.md` | Full rewrite — 14 Copilot-specific references replaced with opencode equivalents (159 → 160 lines) |

### Key Decisions

- Preserved the generic prompt engineering Discovery Process questions (sections 1–9) as they are framework-agnostic
- Replaced Copilot-only tool categories with opencode's actual tool set (`Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch`)
- Added `name` and `argument-hint` to the template frontmatter to match opencode's prompt file format (per `prompt.instructions.md`)
- Replaced `${selection}`, `${file}`, `${input:variableName}`, `${workspaceFolder}` with plain-language descriptions
- Removed the "Analysis" tool category entirely (`changes`, `findTestFiles`, `testFailure`, `searchResults`) as those are Copilot-only tools with no opencode equivalent
- Kept `playwright` but annotated as "Playwright MCP" for clarity

### Notes / Follow-up

None.

---

## Standalone: Researcher - Technical Investigation — Vector Database for AI Workflow Memory

**Date:** 2026-07-23
**Status:** ✅ SUCCESS

### Summary
Exhaustive research spike evaluating self-hosted vector database options for scaling AI agent memory without consuming excessive tokens. Analyzed sqlite-vec, LanceDB, ChromaDB, Milvus Lite, and PostgreSQL + pgvector against the constraints of a git-committed, Node.js developer template. Discovered that industry leaders (Claude Code, OpenClaw, Manus) have converged on a "Markdown as source of truth, vector DB as disposable index" architecture that elegantly solves the git merge conflict problem. Recommended sqlite-vec + better-sqlite3 as the embedded vector index layer, with markdown files remaining the canonical, git-versioned source of truth.

### Files Produced / Modified
| File | Description |
|---|---|
| `docs/spike-vector-db-memory.md` | Comprehensive spike document: 6 vector DBs evaluated, git merge analysis, architecture recommendation with code examples |

### Key Decisions
- **Architecture**: Markdown files (`memory-bank/*.md`) remain source of truth (git-committed). Vector index (`memory-bank/.index/memory.db`) is git-ignored and rebuildable — same pattern as Claude Code and OpenClaw (145k+ stars)
- **Vector DB**: `sqlite-vec` (7.9k stars, Mozilla-backed) over LanceDB (heavier), ChromaDB (Python dependency), Milvus Lite (Python-only), pgvector (server overhead)
- **Embedding model**: `@xenova/transformers` with `all-MiniLM-L6-v2` (384-dim) — runs entirely in Node.js with zero external dependencies
- **Rejected**: Committing binary `.db` to git (merge conflicts unresolvable), gitsqlite (author warns about merge risks), cloud vector DBs (violates self-hosted constraint)

### Notes / Follow-up
Next step: prototype implementation. Create `scripts/memory-index.js` with rebuild and search functions. Add `@xenova/transformers` and `sqlite-vec` as optional dependencies. Update `memory-bank.instructions.md` to document the two-tier architecture. For team-scale (5+ concurrent contributors), evaluate PostgreSQL + pgvector as an upgrade path.

---

## Feature Pipeline: Setup Command — `npx ai-workflow-setup`

**Date:** 2026-07-24
**Status:** ✅ SUCCESS (88/88 tests passing)
**Pipeline:** Feature Pipeline — implementer → researcher → architect → implementer → coder (5 batches) → unit-tester

### Summary

Implemented the complete `npx @abarcenas/ai-workflow-template setup` command (aliased as `npx ai-workflow-setup`) that replaces the deprecated `postinstall` auto-sync pattern. The command performs 5 sequential, idempotent phases: discover consumer project state, install/merge git hooks via husky, configure prepare script, initialize husky programmatically, and sync configuration files. Built with zero new dependencies (Node.js built-ins + existing `husky` only), ES modules throughout, 14 new files, 3 modified files, and 88 passing unit tests.

### Files Produced / Modified

| File | Description |
|---|---|
| `bin/setup.js` | CLI entry point (shebang + delegation to orchestrator) |
| `scripts/setup/constants.js` | Static data: hook definitions, env vars, CLI flags, exit codes, unicode symbols |
| `scripts/setup/utils.js` | 20 shared helpers: path resolution, fs wrappers, JSON, CI detection, CLI parsing |
| `scripts/setup/ui.js` | 16 output functions: banner, step output, summary table, help text, ANSI colors with TTY guard |
| `scripts/setup/discover.js` | Phase 1: 8-step consumer project state detection → Context object |
| `scripts/setup/hooks.js` | Phase 2: 6-case hook merge algorithm (install/overwrite/skip/merge/wrap/dry-run) |
| `scripts/setup/prepare.js` | Phase 3: 6-case prepare script handling (add/skip/merge/warn/dry-run) |
| `scripts/setup/husky-init.js` | Phase 4: programmatic `husky()` initialization with 6 return paths |
| `scripts/setup/sync-phase.js` | Phase 5: child process spawn for sync.js + normalize-memory.js |
| `scripts/setup/index.js` | Orchestrator: 5-phase pipeline, arg parsing, error aggregation, exit codes |
| `scripts/setup/discover.test.js` | 21 tests — consumer project state detection |
| `scripts/setup/hooks.test.js` | 16 tests — hook merge algorithm (all 6 cases + edge cases) |
| `scripts/setup/prepare.test.js` | 27 tests — prepare script classification and merging |
| `scripts/setup/index.test.js` | 24 tests — orchestrator arg parsing, phase ordering, error handling |
| `package.json` | Added `bin.ai-workflow-setup`, `files: ["bin/", "scripts/setup/"]`, deprecation notice |
| `.husky/pre-commit` | Added `# Managed by @abarcenas/ai-workflow-template setup` marker as first line |
| `.husky/post-merge` | Added `# Managed by @abarcenas/ai-workflow-template setup` marker as first line |

### Key Decisions

- **Explicit command over lifecycle scripts**: Follows npm ecosystem consensus (husky v9, lint-staged) — `npx <package> setup` replaces auto-sync
- **Zero new dependencies**: CLI arg parsing, output formatting, and all logic use Node.js built-ins only — no commander, yargs, or inquirer
- **Hook marker idempotency**: First-line comment `# Managed by @abarcenas/ai-workflow-template setup` on both hook files enables safe re-runs and content-based detection
- **Child process for sync.js**: Spawned via `child_process.spawn` to avoid `process.exit()` in sync.js killing the parent setup process
- **Graceful degradation**: Non-fatal phase errors (hooks, prepare, husky-init, sync) produce warnings but don't block later phases
- **Context enrichment pattern**: Each phase receives and enriches the shared Context object — orchestrator aggregates results for summary
- **Husky programmatic API over manual shim generation**: Uses `husky()` call rather than duplicating version-specific shim logic
- **Real temp directories over mocking for tests**: Catches path resolution and permission issues that mocks would miss

### Notes / Follow-up

- **Minor gap**: The `"setup"` script alias (`"setup": "node ./bin/setup.js"`) was not added to `package.json` scripts — command works via `npx ai-workflow-setup` but not via `npm run setup`
- 88/88 tests pass across 4 test files in 183ms
- 5 manual integration test scenarios defined in implementation plan
- Postinstall retained with deprecation notice for backward compatibility (npm v12 blocks it by default)
- Future: add `--uninstall` flag, hook manifest tracking, husky v10 compatibility

---

## Feature Pipeline: Verbose Logging — `npx ai-workflow-setup --verbose`

**Date:** 2026-07-24
**Status:** ✅ SUCCESS (96/96 tests passing)
**Pipeline:** Feature Pipeline — implementer (bootstrap) → researcher → implementer (planning) → coder (4 parallel batches) → tracker

### Summary

Activated the dormant `--verbose` flag for `npx ai-workflow-setup` by adding step-by-step progress output across all 5 setup phases. Fixed the root cause of silent hangs in `sync-phase.js` by streaming child process output in real-time when verbose mode is active. Added a `verbose()` output function to `ui.js`, wired the verbose flag through the Context object, and added targeted logging in all phase modules. 9 files modified, 1 new test file, 5 new tests, 0 regressions.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/setup/ui.js` | Added `verbose(enabled, message)` export — dim ANSI output, no-op when disabled |
| `scripts/setup/discover.js` | Added `verbose` Context field + 9 detection step verbose log calls |
| `scripts/setup/sync-phase.js` | **Critical fix**: `stdio: 'inherit'` when verbose for real-time child output; `AI_WORKFLOW_VERBOSE` env var passthrough |
| `scripts/setup/husky-init.js` | 8 verbose messages around husky resolution, init, and error paths; replaced raw console.log with ui.js |
| `scripts/setup/hooks.js` | 18 verbose calls across all 5 merge cases (ensureDir, writeFile, chmod) |
| `scripts/sync.js` | 8 per-file verbose messages gated by `AI_WORKFLOW_VERBOSE=1` env var |
| `scripts/setup/discover.test.js` | +2 tests — verbose Context field (true/undefined) |
| `scripts/setup/index.test.js` | +1 test — verbose flag passthrough through full pipeline |
| `scripts/setup/sync-phase.test.js` | **NEW** — 5 tests: stdio modes, env vars, output capture, pre-spawn messages |
| `docs/spike-verbose-logging.md` | Research spike: root cause analysis, 7 files identified, output specification |
| `plan/feature-verbose-logging-v1.md` | Implementation plan: 10 tasks, 4 batches, 15 test scenarios |
| `.agents/instructions/learned-knowledge.instructions.md` | Appended session entry with 8 key learnings and agent tuning notes |

### Key Decisions

- **Activate existing infrastructure over new mechanisms**: The `--verbose` flag was already defined and parsed but dead code — activated it rather than adding a debug library or spinner package
- **`stdio: 'inherit'` for verbose child output**: Real-time streaming to terminal fixes the root cause of silent hangs; normal mode preserves existing `pipe` + capture behavior for error reporting
- **Env var for child process communication**: `sync.js` reads `AI_WORKFLOW_VERBOSE=1` from `process.env` — no shared context object between parent and child processes
- **`console.error` for child verbose output**: stdout is captured by parent for result parsing; stderr streams to terminal in inherit mode — diagnostic messages correctly use stderr
- **Zero index.js changes**: Context `verbose` field flows automatically from `discover(flags)` through all phase modules — validates the existing Context enrichment architecture
- **4 parallel batches, 0 collisions**: Batches A→B→C→D with clear dependency edges; 10 tasks implemented without any shared-file race conditions

### Notes / Follow-up

- 96 tests pass (91 existing + 5 new) across 5 test files, 0 failures
- `normalize-memory.js` benefits from verbose output streaming without any code changes — its existing internal logging is now visible in real-time
- Manual integration tests recommended: `node bin/setup.js --verbose` should show real-time discovery steps, hook operations, husky resolution, and child process output
- `--debug` flag enhancement remains deferred — would add even more granular output (file hashes, raw JSON, error stacks) building on the same verbose infrastructure

---

## Feature Pipeline: Fix Hook Script References — Consumer-Project Hook Resolution

**Date:** 2026-07-24
**Status:** ✅ SUCCESS (7/7 tests passing, 52/52 integration assertions, 13/13 MCP references verified)
**Pipeline:** Feature Pipeline — implementer (bootstrap) → researcher → implementer (planning) → coder (T1–T5) → tracker

### Summary

Fixed `.husky/post-merge` and `.husky/pre-commit` hook script resolution in consumer projects. Extended `scripts/sync.js` with a `__scripts__/` sync section (54 lines, lines 174–227) that copies 6 runtime scripts to the consumer's `scripts/` directory using the same hash-based manifest pattern as other sync sections. This enables existing relative paths in hooks (e.g., `node scripts/memory-cli.js update`) to resolve correctly without any changes to `constants.js`, `hooks.js`, or the hook files themselves.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/sync.js` | **Modified** — Added `__scripts__/` sync section (lines 174–227): `scriptsToSync` array, 3-case hash-based loop, manifest tracking |
| `scripts/sync.test.js` | **Modified** — Added 5 unit tests: new-file copy, manifest-less skip, `--force` overwrite, `--dry-run`, manifest hash tracking |
| `docs/spike-post-merge-hook-scripts.md` | Research spike — root cause analysis, 6-tier script inventory, 21 codebase references, recommended approach |
| `plan/fix-hook-script-references-v1.md` | Implementation plan — 5 tasks, 2 batches (Phase 1–3), 6 alternatives considered, 14 test scenarios |
| `memory-bank/activeContext.md` | Updated Current Focus to reflect completion; comprehensive Recent Changes entry |
| `memory-bank/progress.md` | Comprehensive "Fix Hook Script References" section under Recently Completed |
| `docs/hook-script-references/tracker.md` | Feature-specific tracker documentation |

### Scripts Synced to Consumer

| Script | Used By |
|---|---|
| `scripts/memory-cli.js` | `.husky/post-merge` — memory index update |
| `scripts/memory-index.js` | Co-located dependency of `memory-cli.js` and `mcp-memory-server.js` |
| `scripts/bump-version.js` | `.husky/pre-commit` — version bump |
| `scripts/validate-memory-schema.js` | `.husky/pre-commit` — YAML frontmatter validation |
| `scripts/mcp-memory-server.js` | `opencode.mcp.json` — MCP memory server |
| `scripts/mcp/playwright-mcp-launcher.js` | `opencode.mcp.example.json` — Playwright MCP launcher |

### Key Decisions

- **Extend existing sync.js mechanism** over alternative approaches (absolute node_modules paths, npx, symlinks, postinstall-only, constants-only) — aligned with existing `.agents/` and `.opencode/` sync patterns
- **Hash-based manifest for idempotent updates**: `__scripts__/<relPath>` keys in `.agents-sync-manifest.json` enable intelligent sync — locally modified scripts preserved, unmodified scripts refreshed on package update
- **No changes to hook content**: The relative paths in `constants.js` TEMPLATE_HOOKS are correct once scripts exist at consumer root — zero modifications to `constants.js`, `hooks.js`, `.husky/post-merge`, or `.husky/pre-commit`
- **Co-location preserved**: `memory-cli.js` and `memory-index.js` are both synced, ensuring `import './memory-index.js'` resolves correctly
- **MCP audit confirms correctness**: All 13 reference points across 7 files resolve correctly after script sync

### Notes / Follow-up

- 7/7 unit tests pass (2 existing + 5 new) in 533ms
- 52/52 integration assertions pass across 10 test groups
- 13/13 MCP references verified correct across 7 files
- Plan `plan/fix-hook-script-references-v1.md` status: ✅ Completed
- The `npx ai-workflow-setup` workflow works end-to-end — scripts are now synced before hooks run
- Optional future enhancement: update `opencode.mcp.example.json` Playwright entry to use `npx @playwright/mcp@latest` (matching root `opencode.json`)

---

## Feature Pipeline: Verbose Logging — `npx ai-workflow-setup --verbose`

**Date:** 2026-07-24
**Status:** ✅ SUCCESS (96/96 tests passing, 0 regressions)
**Pipeline:** Feature Pipeline — implementer (bootstrap) → researcher → implementer (plan) → coder (4 batches A-D) → tracker

### Summary

Activated the dormant `--verbose`/`-V` flag infrastructure in `npx ai-workflow-setup` to eliminate the "silent hang" problem. The root cause was `sync-phase.js` `spawnScript()` capturing child process stdout/stderr into a string that was never displayed. Added a `verbose()` output function to `ui.js`, wired the verbose flag through the Context object, and added 45+ granular progress messages across all 5 pipeline phases. The critical P0 fix streams child process output in real-time when `--verbose` is active via `stdio: 'inherit'`. All changes use zero new npm dependencies.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/setup/ui.js` | **Modified** — Added `verbose(enabled, message)` export function (dim ANSI `…` prefix, no-op when disabled) |
| `scripts/setup/discover.js` | **Modified** — Added `verbose: !!flags.verbose` to Context object; added 9 verbose log calls for all detection steps |
| `scripts/setup/sync-phase.js` | **Modified** — **P0 critical fix**: `spawnScript()` uses `stdio: 'inherit'` when verbose, streams child output in real-time; passes `AI_WORKFLOW_VERBOSE` env var to child processes; pre-spawn verbose messages |
| `scripts/setup/husky-init.js` | **Modified** — 6 verbose log calls around husky resolution, import, and error paths; replaced raw `console.log` with `info()`/`warn()` from ui.js |
| `scripts/setup/hooks.js` | **Modified** — 18 verbose log calls across all 5 merge cases (A–E) for per-operation file tracking |
| `scripts/sync.js` | **Modified** — 8 per-file copy/scaffold verbose messages via `AI_WORKFLOW_VERBOSE` env var, output to stderr |
| `scripts/setup/discover.test.js` | **Modified** — Added 2 tests (verbose=true on Context, verbose=false on Context) |
| `scripts/setup/index.test.js` | **Modified** — Added 1 test (verbose flag passthrough through full pipeline) |
| `scripts/setup/sync-phase.test.js` | **NEW** — 5 tests covering stdio mode switching, env var passthrough, exit code results, and pre-spawn verbose messages |
| `plan/feature-verbose-logging-v1.md` | Implementation plan — 10 tasks across 4 batches, all completed |
| `docs/spike-verbose-logging.md` | Research spike — root cause analysis, 7 files identified, output format specification |

### Key Decisions

- **stdio switching for child processes**: When `--verbose` is active, use `stdio: 'inherit'` (real-time streaming to terminal); when not verbose, keep existing `stdio: 'pipe'` (capture for error reporting). This was preferred over a prefix-stream or tee approach because it's simpler and the child process stderr is still visible.
- **Env var for child process communication**: `AI_WORKFLOW_VERBOSE=1`/`0` environment variable passes the verbose flag to spawned `sync.js` and `normalize-memory.js` processes — avoids refactoring sync.js's architecture or switching to direct function calls.
- **Zero new npm dependencies**: All changes use Node.js built-ins (`child_process`, `process.env`, existing ui.js formatting) — no debug library, no spinner, no CLI framework additions.
- **`index.js` needs NO changes**: The verbose flag flows from `discover(flags)` → Context object → all phase modules automatically, because the orchestrator already passes the full Context to every phase.
- **`console.error` for child process verbose output**: `sync.js` uses stderr for verbose messages instead of stdout, since stdout is captured for result parsing; stderr streams through in `stdio: 'inherit'` mode.
- **Test isolation via `vi.mock`**: The new `sync-phase.test.js` mocks `child_process` spawn to test stdio mode switching without actually running child processes — follows established patterns from `hooks.test.js`.

### Notes / Follow-up

- 96/96 tests pass (91 existing + 5 new) across 5 test files — 0 regressions
- Manual integration test: `node bin/setup.js --verbose` produces 45+ dim `…` messages across all phases
- Manual integration test: `node bin/setup.js` (without `--verbose`) produces identical output to pre-change behavior
- Future enhancement: Add `--debug` flag (implies `--verbose` plus file hashes, raw JSON, error stacks) — infrastructure supports it via new `debug()` function in `ui.js` and `debug: !!flags.debug` in Context

---

## Feature Pipeline: Centralized Knowledgebase — PostgreSQL + pgvector (10th MCP Server)

**Date:** 2026-07-29
**Status:** ✅ SUCCESS — 158 tests passing (103 existing + 28 new + 27 mock-index), 9 test files, 0 failures
**Pipeline:** researcher → architect → implementer → coder (5 parallel batches, 17 tasks) → unit-tester → reviewer → tracker

### Summary

Implemented the third layer of the project's knowledge architecture: a centralized PostgreSQL + pgvector knowledgebase for cross-project learned knowledge sharing, exposed to AI agents through an MCP server. The feature encompasses 7 new files, 3 new test files, and modifications to 19 existing files across 5 parallel batches with 17 total tasks. The architecture uses a separate MCP server (10th total in opencode.json), raw SQL with `pg` + `pgvector` (no ORM), `all-MiniLM-L6-v2` (384d) as the default embedding model, session-level chunks with "New knowledge" bullets only, post-commit git hook for automated syncing, and graceful degradation when `DATABASE_URL` is not configured.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/knowledgebase-init.sql` | **NEW** — PostgreSQL/pgvector schema DDL (193 lines): projects/knowledge_chunks tables, HNSW index, B-tree indexes, match_knowledge function with cosine similarity search |
| `.husky/post-commit` | **NEW** — Git hook template (12 lines): detects learned-knowledge.instructions.md changes via git diff HEAD~1, triggers CLI sync, always exits 0 |
| `.agents/instructions/knowledgebase.instructions.md` | **NEW** — Agent instructions (238 lines): mandatory query requirements, 5 use-case patterns, similarity score thresholds, graceful degradation |
| `.env.example` | **MODIFIED** — +8 lines: DATABASE_URL and OPENAI_API_KEY templates with OPTIONAL notice |
| `scripts/setup/constants.js` | **MODIFIED** — +22 lines: post-commit added to TEMPLATE_HOOKS, --skip-knowledgebase flag added |
| `scripts/knowledgebase-index.js` | **NEW** — Core engine (723 lines): 11 exports — pool, embed, upsertChunks, search, getStats, listProjects, chunkLearnedKnowledge. All gracefully degrade when DATABASE_URL unset. |
| `scripts/knowledgebase-cli.js` | **NEW** — CLI tool (220 lines): 4 commands — sync, search, list, stats. Follows memory-cli.js patterns. Graceful skip when DATABASE_URL unset. |
| `scripts/mcp-knowledgebase-server.js` | **NEW** — MCP server (330 lines): 4 tools — knowledgebase_search, knowledgebase_index, knowledgebase_stats, knowledgebase_list. Stdio transport, follows mcp-memory-server.js exactly. |
| `scripts/setup/knowledgebase.js` | **NEW** — Setup Phase 6 module (204 lines): spawns CLI as child process, 3 early-exit paths (skip flag, no DATABASE_URL, no project name) |
| `scripts/setup/index.js` | **MODIFIED** — +27 lines: Phase 6 added after Phase 5 with non-fatal error handling. actionStatus('indexed') added. |
| `scripts/sync.js` | **MODIFIED** — +4 entries to scriptsToSync: knowledgebase-cli.js, knowledgebase-index.js, mcp-knowledgebase-server.js, knowledgebase-init.sql |
| `opencode.json` | **MODIFIED** — knowledgebase MCP server added (10th server), knowledgebase_*: allow permission added |
| `package.json` | **MODIFIED** — pg ^8.22.0 + pgvector ^0.3.0 optionalDeps added; kb:sync, kb:search, kb:stats scripts added |
| 13 agent files | **MODIFIED** — Added `knowledgebase/*: allow` permission to all agent .agent.md files |
| `scripts/knowledgebase-index.test.js` | **NEW** — 748 lines, 36 tests: chunking, graceful degradation, embed, CRUD, edge cases |
| `scripts/knowledgebase-cli.test.js` | **NEW** — 576 lines, 13 tests: all 4 commands, error handling, flag parsing, graceful skip |
| `scripts/setup/knowledgebase.test.js` | **NEW** — 248 lines, 6 tests: skip flag, no DATABASE_URL, missing project name, success, failure, spawn error |
| `docs/spike-centralized-knowledgebase-pgvector.md` | Research spike (828 lines, 9 sections): embedding strategies, MCP server patterns |
| `docs/adr-knowledgebase-pgvector.md` | Architecture decision record (~800 lines, 10 sections): full design with schema, APIs, MCP interface |
| `plan/feature-knowledgebase-pgvector-v1.md` | Implementation plan (354 lines): 17 tasks across 5 parallel batches |
| `.agents/instructions/learned-knowledge.instructions.md` | **MODIFIED** — Appended session entry with 15 key learnings and agent tuning notes |

### Key Decisions

- **Separate MCP server** — Different database lifecycle (PostgreSQL vs SQLite), different failure modes (network vs filesystem), different setup requirements (optional external service). Follows the established multi-server pattern (9→10 servers).
- **`pg` + raw SQL** — Only ~4 query types needed. Simpler than ORM (Drizzle, Prisma, Knex). Matches existing `memory-index.js` patterns. Gives full control over pgvector-specific SQL (`<=>` operator, HNSW index creation).
- **`all-MiniLM-L6-v2` (384d)** — Already an optional dependency, zero cost, runs locally, sufficient for <10k chunks. OpenAI `text-embedding-3-small` (1536d) as documented upgrade path.
- **Session-level chunks, "New knowledge" bullets only** — Metadata stored as DB columns for structured filtering. Embedding only the semantic content avoids wasting dimensions on structural data.
- **Post-commit hook (not pre-commit)** — Needs committed content for reliable git diff detection. Matches existing `post-merge` hook pattern. Pre-commit would index uncommitted content.
- **Graceful degradation everywhere** — Knowledgebase is optional. Never blocks setup, operation, or commits. `getPool()` returns null when DATABASE_URL unset → all operations become no-ops.
- **5 parallel batches with explicit dependencies** — 17 tasks across A→E with foundation-first ordering prevented all race conditions. Batch A (6 standalone files) → Batch B (CLI + MCP, depend on T6) → Batch C (setup, depend on T5/T6/T7) → Batch D (config, independent) → Batch E (tests, depend on T6/T7/T9).
- **Lazy imports for all optional deps** — `pg`, `pgvector`, `@xenova/transformers` loaded via dynamic `import()` inside try/catch. Graceful fallback with descriptive warnings when deps missing.
- **Reviewer findings accepted** — 4 major issues (env var passthrough, --topK validation, limit clamping, test typo) and 6 minor issues acknowledged for follow-up.

### Notes / Follow-up

- **Reviewer findings to resolve**: 4 major issues — (1) Pass `AI_WORKFLOW_VERBOSE` to spawned CLI in `knowledgebase.js`, (2) Add lower-bound validation to `--topK` (≥1), (3) Clamp `limit` parameter in search, (4) Fix CLI test comment typo. 6 minor issues: remove dead code, fix no-op `setEmbeddingProvider`, unhook stderr suppression, fix marker ordering, update display name, fix fragile mock.
- 158 tests pass across 9 test files (103 existing + 28 new + 27 mock-index setup) — 0 failures
- Coverage: 90–100% for knowledgebase feature modules
- Manual integration: `DATABASE_URL=postgresql://... node bin/setup.js` should show Phase 6 with indexed chunks
- Manual integration: `node scripts/knowledgebase-cli.js search "parallel batch"` should find relevant knowledge
- Post-commit hook fires only when `learned-knowledge.instructions.md` changes — content hash prevents duplicate indexing

---

## Feature Pipeline: Centralized Knowledgebase — PostgreSQL + pgvector MCP

**Date:** 2026-07-29
**Status:** ✅ SUCCESS (158 tests, 0 failures)
**Pipeline:** Feature Pipeline — implementer (bootstrap) → researcher → architect → implementer (plan) → coder (5 batches A–E, 14 parallel instances) → unit-tester → reviewer → tracker

### Summary

Implemented a centralized knowledgebase layer using PostgreSQL + pgvector for cross-project learned knowledge sharing, exposed to AI agents through an MCP server. The architecture adds a third layer to the project's knowledge system (Markdown source of truth → SQLite local memory bank → PostgreSQL centralized). Built 7 new files, modified 19 existing files, added 3 new test files, and achieved 158 tests with 0 failures. The feature includes a core engine with lazy imports and graceful degradation, a CLI with 4 commands, an MCP server with 4 tools, setup Phase 6 integration, a post-commit git hook, and comprehensive agent instructions.

**Architecture:** Three-layer knowledge system with separate MCP server (not merged with memory-bank). Core engine (`knowledgebase-index.js`) handles connection pooling, embedding generation via `@xenova/transformers` + `all-MiniLM-L6-v2` (384d), CRUD operations, cosine similarity search, and session-aware chunking. All operations gracefully degrade when `DATABASE_URL` is not configured.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/knowledgebase-index.js` | **NEW** — Core engine (723 lines). 11 exports: pool, embed, upsertChunks, search, getStats, listProjects, chunkLearnedKnowledge. Lazy imports for all optional deps. |
| `scripts/knowledgebase-cli.js` | **NEW** — CLI tool (220 lines). 4 commands: sync, search, list, stats. Graceful skip when DATABASE_URL unset. |
| `scripts/mcp-knowledgebase-server.js` | **NEW** — MCP server (330 lines). 4 tools via stdio transport: knowledgebase_search, knowledgebase_index, knowledgebase_stats, knowledgebase_list. |
| `scripts/setup/knowledgebase.js` | **NEW** — Setup Phase 6 module (139 lines). Spawns CLI as child process. 3 early-exit paths. |
| `scripts/knowledgebase-init.sql` | **NEW** — Manual DB provisioning (193 lines). Full DDL, HNSW index, match_knowledge() function. |
| `.husky/post-commit` | **NEW** — Git hook (12 lines). Detects learned-knowledge changes, triggers sync, always exits 0. |
| `.agents/instructions/knowledgebase.instructions.md` | **NEW** — Agent instructions (238 lines). Query patterns, similarity thresholds, graceful degradation. |
| `scripts/knowledgebase-index.test.js` | **NEW** — Core engine tests (748 lines, 36 tests). |
| `scripts/knowledgebase-cli.test.js` | **NEW** — CLI tests (576 lines, 13 tests). |
| `scripts/setup/knowledgebase.test.js` | **NEW** — Phase 6 tests (248 lines, 6 tests). |
| `scripts/setup/constants.js` | **MODIFIED** — +post-commit hook to TEMPLATE_HOOKS, +--skip-knowledgebase flag. |
| `scripts/setup/index.js` | **MODIFIED** — Phase 6 added after Sync with non-fatal error handling. |
| `scripts/sync.js` | **MODIFIED** — +4 entries to scriptsToSync (knowledgebase-cli, index, mcp-server, init.sql). |
| `scripts/setup/index.test.js` | **MODIFIED** — Fixed mock list + Phase 6 assertions. |
| `opencode.json` | **MODIFIED** — +knowledgebase MCP server (10th), +knowledgebase_* permission. |
| `package.json` | **MODIFIED** — +pg ^8.22.0 + pgvector ^0.3.0 optionalDeps, +3 kb:* scripts, +.husky/post-commit in files. |
| `.env.example` | **MODIFIED** — +DATABASE_URL + OPENAI_API_KEY templates. |
| 13 agent .agent.md files | **MODIFIED** — +"knowledgebase/*": allow to all agent permission blocks. |
| `docs/spike-centralized-knowledgebase-pgvector.md` | Research spike (828 lines) |
| `docs/adr-knowledgebase-pgvector.md` | Architecture Decision Record (1344 lines) |
| `plan/feature-knowledgebase-pgvector-v1.md` | Implementation plan (354 lines) |

### Files Verified Unchanged (Intentionally Not Modified)

| File | Reason |
|---|---|
| `scripts/setup/hooks.js` | `installHooks()` iterates `Object.keys(TEMPLATE_HOOKS)` — adding `post-commit` to constants auto-includes it |
| `scripts/setup/husky-init.js` | No knowledgebase-specific changes needed |
| `scripts/setup/discover.js` | No knowledgebase-specific changes needed |

### Key Decisions

- **Separate MCP server** over merging with memory-bank — different database (PostgreSQL vs SQLite), lifecycle, and failure modes. Follows existing multi-server pattern (10 servers).
- **`pg` + raw SQL** over ORM (Drizzle, Prisma, Knex) — only ~4 query types needed. Raw SQL gives full control over pgvector-specific operators (`<=>`, HNSW creation).
- **`all-MiniLM-L6-v2` (384d)** as default embedding model — already an optionalDep, zero cost, ~12ms latency. OpenAI `text-embedding-3-small` (1536d) documented as configurable upgrade path via `OPENAI_API_KEY`.
- **Session-level chunking with "New knowledge" bullets only** — structural metadata stored in DB columns. Embedding contextualised with session date and pipeline prefix.
- **Post-commit hook** over pre-commit — needs committed content for indexing. Matches existing `post-merge` pattern. Always exits 0.
- **Graceful degradation everywhere** — knowledgebase is optional. All 11 core exports return empty/zero results when `DATABASE_URL` unset. Never blocks setup or normal operation.
- **Content hash idempotency** — SHA-256 of (content + date + pipeline). ON CONFLICT DO NOTHING enables risk-free re-indexing.
- **Phase 6 is non-fatal** — failure to sync knowledgebase never blocks the setup pipeline.
- **Zero changes to `hooks.js`** — `installHooks()` auto-discovers hooks via `Object.keys(TEMPLATE_HOOKS)`.
- **13 agent files granted access** — every agent that can read `memory-bank/*` also gets `knowledgebase/*` access.

### Test Results

- **158 tests total across 9 test files, 0 failures**
- **3 new test files:** knowledgebase-index.test.js (36 tests), knowledgebase-cli.test.js (13 tests), setup/knowledgebase.test.js (6 tests)
- **1 modified test file:** index.test.js — fixed mock list + Phase 6 assertions
- **Knowledgebase coverage:** 90–100% across all modules
- **Review outcome:** APPROVE WITH CHANGES — no critical issues, 4 major + 6 minor findings

### Notes / Follow-up

- **4 reviewer-identified fixes needed (non-blocking):** Missing `AI_WORKFLOW_VERBOSE` in spawn env, `--topK` validation gap, `search()` limit not clamped, CLI test comment typo
- **6 minor suggestions:** Dead code in chunking parser, no-op `setEmbeddingProvider()`, hook stderr suppression, marker ordering, display name, fragile mock
- **Manual integration steps:** Set up PostgreSQL with pgvector, configure `DATABASE_URL`, run `node scripts/knowledgebase-cli.js sync` to index existing learned knowledge, verify MCP server responds to `tools/list`
- **OpenAI upgrade path:** Set `OPENAI_API_KEY` in `.env` to use higher-quality embeddings. Migration steps documented in `knowledgebase-init.sql`
- **Future enhancement:** Implement `setEmbeddingProvider()` for runtime embedding model switching
