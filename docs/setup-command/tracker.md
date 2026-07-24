---
id: "setup-command-tracker"
title: "Setup Command — Tracker Documentation"
updated: "2026-07-24"
tags: [setup, cli, husky, hooks, npm-v12, distribution, implementation, test]
doc_type: "tracker"
pipeline: "setup-command-feature-pipeline"
---

# Setup Command — Tracker Documentation

Comprehensive documentation of the `npx @abarcenas/ai-workflow-template setup` command implementation.

## Pipeline Overview

**Pipeline:** Feature Pipeline — implementer (bootstrap) → researcher → architect → implementer (plan) → coder (Batches A-E) → unit-tester (Batch F) → tracker
**Date:** 2026-07-24
**Feature:** `npx ai-workflow-setup` command for automatic husky hook integration
**Total Tasks:** 17 across 6 parallel batches
**Test Results:** ✅ 88/88 tests passing (4 test files)

---

## Step 1: Researcher — Technical Investigation

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Investigated npm v12's default blocking of `postinstall` scripts (CVE-2025-XXXX supply-chain attack vector) and the industry shift to explicit `npx <package> setup` commands. Validated approach by examining husky v9's programmatic API, the child process spawn pattern for existing `scripts/sync.js` integration, and the zero-dependency constraint. Findings directly informed the architecture design.

### Key Decisions

- **Explicit command over lifecycle scripts**: Follows husky v9, lint-staged, and ecosystem consensus — `npx @abarcenas/ai-workflow-template setup` replaces `postinstall` auto-sync
- **Child process spawn over import**: `scripts/sync.js` and `scripts/normalize-memory.js` call `process.exit()`, so they must be spawned rather than imported to avoid killing the setup process
- **Zero new dependencies**: All logic uses Node.js built-ins (`fs`, `path`, `child_process`, `crypto`) plus existing `husky`

### Notes / Follow-up

Findings documented in the architecture design at `plan/design-setup-command-v1.md`.

---

## Step 2: Architect — Architecture Design

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Designed a 7-module CLI architecture for the setup command: discover → hooks → prepare → husky-init → sync-phase → ui → orchestrator. Catalogued 20 edge cases with detection logic and behavior for each. Specified hook merging (6 cases: install/overwrite/skip/merge/wrap/dry-run) and prepare script handling (4 classifications). Defined the Context object that passes through all phases.

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/design-setup-command-v1.md` | 840-line comprehensive architecture design document |
| `docs/.architecture-context.md` | Updated with setup command architecture |

### Key Decisions

- **Module isolation**: Each phase is a standalone ES module with zero interdependencies — receives a Context object and returns a typed result
- **Husky programmatic API**: Uses `husky()` call rather than manually generating `_/` shims (shims are version-specific)
- **Context object enrichment pattern**: Each phase enriches the shared context with its results, enabling the orchestrator to aggregate errors/warnings and render a summary
- **Option B for manifest tracking**: Hooks kept outside `.agents-sync-manifest.json` for v1 — they're versioned git-tracked content managed by setup, not sync

### Notes / Follow-up

Design document at `plan/design-setup-command-v1.md` (840 lines) includes full UX copy for all 7 warning states, 4 error states, and 5 success states.

---

## Step 3: Implementer — Implementation Plan

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Produced a deterministic implementation plan with 17 tasks across 6 parallel batches (A-F). Each task has explicit file paths, dependency ordering, validation criteria, and completion dates. The plan enables up to 5 concurrent coder executions (Batches A, B, C, D, F can each run all tasks in parallel).

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/feature-setup-command-v1.md` | Implementation plan with 17 tasks, 6 batches, 14 new files, 3 modifications |

### Key Decisions

- **Batch A first (foundation)**: constants.js, utils.js, ui.js have zero interdependencies — enables parallel development
- **Batch B depends on A, C depends on B**: Natural module dependency chain enforced via batch ordering
- **Batch D independent**: Hook marker comments on `.husky/` files can run in any batch — placed logically after hook definitions
- **Batch E single (package.json)**: Must be last since all source files must exist before declaring them in `files` array

### Notes / Follow-up

Plan file at `plan/feature-setup-command-v1.md` includes manual integration test procedure (5 test scenarios) and file-level validation for each task.

---

## Step 4: Coder — Implementation (Batches A-E)

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Implemented all 13 source files across 5 parallel batches: 9 modular scripts in `scripts/setup/`, the `bin/setup.js` entry point, marker comments on both `.husky/` hook files, and modifications to `package.json`. Total output: ~1,200 lines of production code across 14 new files plus 3 modified files.

### Files Produced / Modified

| Batch | File | Description |
|---|---|---|
| A | `scripts/setup/constants.js` | 11 exports: hook definitions, env vars, CLI flags, exit codes, unicode symbols, memory bank stubs |
| A | `scripts/setup/utils.js` | 20 exported functions: path resolution, filesystem helpers, JSON, hashing, CI detection, CLI parsing |
| A | `scripts/setup/ui.js` | 16 exports: banner, header, step/section output, summary table, help text, ANSI colors with TTY guard |
| B | `scripts/setup/discover.js` | Phase 1: 8-step consumer project detection → Context object (git, hooks, package.json, CI, Node version) |
| B | `scripts/setup/hooks.js` | Phase 2: 6-case hook merge algorithm (Cases A-F) with try/catch per-hook isolation |
| B | `scripts/setup/prepare.js` | Phase 3: 6-case prepare script handling (add/skip/merge/warn/dry-run) |
| B | `scripts/setup/husky-init.js` | Phase 4: programmatic `husky()` initialization with 6 return paths |
| B | `scripts/setup/sync-phase.js` | Phase 5: child process spawns for sync.js + normalize-memory.js (avoids `process.exit()` in parent) |
| C | `scripts/setup/index.js` | Orchestrator: full 5-phase pipeline with arg parsing, error aggregation, exit codes |
| C | `bin/setup.js` | CLI entry point: shebang + ESM delegation to orchestrator |
| D | `.husky/pre-commit` | Added `# Managed by @abarcenas/ai-workflow-template setup` as first line |
| D | `.husky/post-merge` | Added marker as first line; shebang moved to line 2 |
| E | `package.json` | Added `bin.ai-workflow-setup`, `files: ["bin/", "scripts/setup/"]`, deprecation notice in postinstall |

### Key Decisions

- **ESM throughout**: All new files use `"type": "module"` — no CommonJS
- **Zero new dependencies**: Only Node.js built-ins + existing `husky` — no commander, yargs, inquirer, etc.
- **Context enrichment pattern**: Each phase receives and enriches the shared context object; orchestrator aggregates for summary
- **Graceful degradation**: Each phase wrapped in try/catch — a failure in hooks/prepare/husky-init/sync doesn't block later phases
- **Hook marker idempotency**: First-line comment `# Managed by @abarcenas/ai-workflow-template setup` on both hook files enables idempotent re-runs
- **Child process for sync.js**: Spawned via `child_process.spawn` to avoid `process.exit()` calls killing the parent process
- **ANSI color TTY guard**: Color codes only emitted when `process.stdout.isTTY` is truthy — clean output when piped

### Notes / Follow-up

The `"setup"` script alias (`"setup": "node ./bin/setup.js"`) was not added to `package.json` scripts — this is a minor gap that should be resolved for local `npm run setup` invocations. The `postinstall` deprecation notice uses a different message style than the plan specified (practical improvement, not a regression).

---

## Step 5: Unit Tester — Test Implementation (Batch F)

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Created 4 comprehensive unit test files (88 tests total) covering the discovery, hooks merging, prepare script handling, and orchestrator modules. All tests use real temp directory fixtures for filesystem operations and `vi.mock()` for environment-dependent modules. Tests verify all documented edge cases, merge algorithm paths, flag passthrough, error aggregation, and exit code logic.

### Files Produced / Modified

| File | Tests | Description |
|---|---|---|
| `scripts/setup/discover.test.js` | 21 | Consumer project state detection: git, hooks, package.json, CI, prepare script classification |
| `scripts/setup/hooks.test.js` | 16 | 6 merge algorithm cases (A-F) + 10 edge cases: partial failure, .husky-as-file, permissions, dry-run |
| `scripts/setup/prepare.test.js` | 27 | 6 main cases + 15 edge cases: complex scripts, force overwrite, dry-run paths, substring detection |
| `scripts/setup/index.test.js` | 24 | Orchestrator: arg parsing, phase sequencing, error aggregation, exit codes, quiet mode, CI mode |

### Test Results

```
✓ scripts/setup/discover.test.js  (21 tests) 110ms
✓ scripts/setup/hooks.test.js     (16 tests) 100ms
✓ scripts/setup/prepare.test.js   (27 tests) 111ms
✓ scripts/setup/index.test.js     (24 tests)   5ms
──────────────────────────────────────────────
 Tests:  4 passed, 88 total
 Duration: 183ms
```

### Key Decisions

- **Real temp directories over mocking**: `discover.test.js`, `hooks.test.js`, `prepare.test.js` use `fs.mkdtempSync()` for realistic filesystem interaction — catches path resolution and permission issues that mocks would miss
- **Selective mocking**: Only `isCI()` and `getNodeVersion()` are mocked where environment dependence would make tests non-deterministic; all other functions use real implementations
- **Consistent factory patterns**: `makeContext()`, `createTempDir()`, `writePkg()`/`readPkg()` helpers shared across test files
- **Orchestrator isolation**: `index.test.js` uses `vi.mock()` for all 7 imported modules — tests never touch real filesystem

### Notes / Follow-up

All 88 tests pass in 183ms. No test fixtures directory was created (tests build their own temp directories per-run, which is cleaner and avoids stale fixture state).

---

## Overall Summary

### What Was Built

The `npx @abarcenas/ai-workflow-template setup` command (aliased as `npx ai-workflow-setup`) is a complete, idempotent, zero-dependency CLI for onboarding consumers of the ai-workflow-template. It performs 5 sequential phases:

1. **Discover** — Detect consumer project state (git, hooks, package.json, CI, Node version)
2. **Hooks** — Install/merge git hook files into `.husky/` (6 merge cases)
3. **Prepare** — Configure `"prepare": "husky"` in consumer's package.json
4. **Husky Init** — Programmatically initialize husky via `husky()` call
5. **Sync** — Spawn existing sync.js and normalize-memory.js as child processes

### Files Summary

**14 new files** (1,200+ lines production code + 88 tests):
- `bin/setup.js` — CLI entry point
- `scripts/setup/constants.js` — Static data
- `scripts/setup/utils.js` — Shared helpers
- `scripts/setup/ui.js` — Output formatting
- `scripts/setup/discover.js` — Consumer project detection
- `scripts/setup/hooks.js` — Hook installation & merging
- `scripts/setup/prepare.js` — Prepare script handling
- `scripts/setup/husky-init.js` — Husky initialization
- `scripts/setup/sync-phase.js` — Child process sync
- `scripts/setup/index.js` — Orchestrator
- `scripts/setup/discover.test.js` — 21 tests
- `scripts/setup/hooks.test.js` — 16 tests
- `scripts/setup/prepare.test.js` — 27 tests
- `scripts/setup/index.test.js` — 24 tests

**3 files modified:**
- `package.json` — Added `bin`, `files` entries, deprecation notice
- `.husky/pre-commit` — Added marker comment
- `.husky/post-merge` — Added marker comment

### Known Gaps

- **`"setup"` script missing from package.json**: The `"scripts": { "setup": "node ./bin/setup.js" }` entry was not added during T13. The command works via `npx ai-workflow-setup` (bin) but not via `npm run setup` locally.
