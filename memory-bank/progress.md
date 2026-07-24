---
id: "progress"
title: "Progress"
updated: "2026-07-24"
tags: [architect, coder, implementer, tester, reviewer, tracker, orchestrator, bootstrap, setup, tdd, feature-pipeline, normalization, implementation, discovery, documentation]
entities: [vitest, playwright, graphify, memory-bank, husky, tdd-orchestrator, mcp-server, opencode, npm]
category: "progress"
---


# Progress

## What Works

- Playwright E2E testing (2 spec files in `tests/`)
- npm package distribution (`@abarcenas/ai-workflow-template` v1.29.0)
- Husky git hooks (pre-commit, post-merge)
- Sync script (`npm run sync`) for template distribution
- Memory bank normalization (`npm run memory:normalize`)
- Memory bank vector search (`npm run memory:search`)
- All agent definitions present and valid (implementer, coder, unit-tester, reviewer, tracker)
- Orchestrator agents defined (tdd-orchestrator, feature-pipeline, orchestrator)
- 20+ skills in `.agents/skills/`
- 15+ instruction files in `.agents/instructions/`
- graphify knowledge graph generated (1328 nodes, 1299 edges)
- Architecture context documented in `docs/.architecture-context.md`
- Memory bank fully populated with project context
- Unit test framework (Vitest + coverage) — functional but minimal test coverage

## What's Left

- **Setup command implementation**: Architecture designed, implementation plan created (see `plan/feature-setup-command-v1.md`) — 17 tasks across 6 parallel batches
  - ✅ `scripts/setup/constants.js` — T1 done
  - ✅ `scripts/setup/utils.js` — T2 done
  - ✅ `scripts/setup/ui.js` — T3 done
  - ✅ `scripts/setup/discover.js` — T4 done
  - ✅ `scripts/setup/hooks.js` — T5 done
  - ✅ `scripts/setup/prepare.js` — T6 done
  - ✅ `scripts/setup/husky-init.js` — T7 done
  - ✅ `scripts/setup/sync-phase.js` — T8 done
  - ✅ `scripts/setup/index.js` — T9 done
  - ✅ `bin/setup.js` entry point — T10 done
  - ✅ `.husky/pre-commit` marker comment — T11 done
  - ✅ `.husky/post-merge` marker comment — T12 done
  - ✅ `package.json` changes: `bin` field, `files` additions, deprecation notice
- ✅ `scripts/setup/discover.test.js` — T14 done (21 tests, all pass)
- ✅ `scripts/setup/hooks.test.js` — T15 done (16 tests, all pass)
- ✅ `scripts/setup/prepare.test.js` — T16 done (27 tests, all pass)
- ✅ `scripts/setup/index.test.js` — T17 done (24 tests, all pass)
- ✅ `scripts/setup/index.test.js` — T17 done (24 tests, all pass)
- **TDD Orchestrator**: Infrastructure ready, needs first real task/feature to run through pipeline
- **Unit tests**: Vitest framework installed, 4/4 test files complete (88 tests total — 21 discover, 16 hooks, 27 prepare, 24 index)
- **Coverage baseline**: index.js 91.5% statements, 91.75% lines; global coverage below threshold due to untested source files
- **Feature pipeline**: Haven't been exercised since bootstrap
- **Remaining instruction files**: Some may still contain Copilot references needing porting to opencode

## Recently Completed

### 2026-07-24: Tracker — Setup Command Fully Documented

Completed all tracker documentation for the setup command feature pipeline:
- Created `docs/setup-command/tracker.md` — full feature documentation covering all 6 pipeline steps (researcher, architect, implementer, coder, unit-tester, tracker) with files produced, key decisions, and known gaps
- Created `docs/TRACKER-INDEX.md` — shared pipeline index tracking all pipelines and entry locations
- Updated `docs/tracker-log.md` — appended comprehensive pipeline summary (17 files produced/modified, 88 tests, key decisions)
- Updated `memory-bank/progress.md` — appended tracker summary

### 2026-07-24: T17 — Created `scripts/setup/index.test.js`

Created comprehensive unit tests for the orchestrator module (Batch F, Phase 6):
- 24 Vitest tests covering all scenarios from the plan plus additional edge cases
- Uses `vi.mock()` for all 7 imported modules (utils, ui, discover, hooks, prepare, husky-init, sync-phase) for complete isolation
- Tests cover: --help (help text + exit 0), -h (short form), --version (console.log called + exit 0), -v (short form), --dry-run (all phases with dryRun flag), --skip-hooks (hooks/husky-init skipped), --skip-sync (sync skipped), --skip-prepare (prepare skipped), unknown flag (graceful defaults), full pipeline (all 5 phases called), discovery failure (fatal exit 2), hooks failure (continues, exit 2), prepare failure (continues), husky-init failure (continues), sync failure (continues), no git (warnings, exit 1), CI mode (banner shown), CI + quiet (banner hidden), quiet mode (no header/summary), multiple skips combined, argv passthrough, context passthrough to phases, flags passthrough to discover, --help priority over --version
- All 24 tests pass in 5ms with index.js at 91.5% statement coverage
- Plan file `plan/feature-setup-command-v1.md` marked T17 as completed

### 2026-07-24: T16 — Created `scripts/setup/prepare.test.js`

Created comprehensive unit tests for the prepare module (Batch F, Phase 6):
- 27 Vitest tests covering all 12 required scenarios from the plan plus 15 additional edge cases
- Uses real temp directories (`mkdtempSync`) with ui module mocked for clean test output
- Tests all 12 scenarios: no package.json (skipped), existing husky (skipped), no prepare (added), simple prepare (merged), complex multi-line/||/; (skipped), complex + force (added), dry-run (3 paths), empty/whitespace prepare (added), husky substring detection (skipped)
- Additional edge cases: preserve all package.json fields across add/merge/replace operations, `npx husky` substring detection, result structure validation across 7 variant paths
- Uses `writePkg()`/`readPkg()` helpers and `createTempDir()` cleanup pattern consistent with hooks.test.js
- All 27 tests pass in 111ms

### 2026-07-24: T15 — Created `scripts/setup/hooks.test.js`

Created comprehensive unit tests for the hooks module (Batch F, Phase 6):
- 16 Vitest tests covering all 6 merge algorithm cases (A-F) plus 10 additional edge cases
- Uses real temp directories (`mkdtempSync`) with zero mocks on filesystem operations
- Tests all merge cases: Case A (no .husky/ dir → created), Case B (no hook file → created), Case C (managed → overwritten), Case D (unmanaged + force → overwritten + .bak), Case E (unmanaged + no force → merged), Case F (dry-run → no writes)
- Edge cases: partial failure (mixed results when one hook fails), .husky as file not directory (graceful skip), executable permission (chmod 755), empty .husky/ dir, flags.force alternative path, partial existingHooks map, result structure validation, dry-run with existing unmanaged hooks, idempotent overwrite without .bak, result message traceability
- Uses `makeContext()` factory with `createTempDir()` and `expectedContent()` helpers following patterns from discover.test.js
- All 16 tests pass in 100ms

### 2026-07-24: T14 — Created `scripts/setup/discover.test.js`

Created comprehensive unit tests for the discover module (Batch F, Phase 6):
- 21 Vitest tests covering all 13 required scenarios plus 8 additional edge cases
- Uses temp directories (`mkdtempSync`) for real filesystem interaction with mocked environment functions
- Tests: fresh project detection, .husky/ presence, managed/unmanaged hooks, package.json parsing, prepare script classification (none/simple/complex/with husky), CI/non-CI, Node version, dryRun flag passthrough
- Additional edge cases: `||` operator complexity, `;` separator complexity, empty prepare string, both hooks detection, no git repo
- Uses `vi.mock()` with `importOriginal()` pattern to mock only environment-dependent utils while keeping filesystem helpers real
- All 21 tests pass in 110ms

### 2026-07-24: T8 — Created `scripts/setup/sync-phase.js`

Implemented the sync phase module for the setup command pipeline:
- Single async export `runSyncPhase(context)` implementing the sync phase per design §4.6
- 4 return paths: `skipped` (when `context.skipSync` is true), `dry-run` (when `context.dryRun` is true), `completed` (all child processes exit 0), `partial` (any child process exits non-zero)
- Spawns `scripts/sync.js` and `scripts/normalize-memory.js` using `child_process.spawn` with `process.execPath` — avoids `process.exit()` in sync.js killing the parent
- Sets `INIT_CWD` env var to `consumerRoot` for proper consumer path resolution
- Forwards `--force` to child processes when `flags.force` is set
- Captures combined stdout+stderr per script into a single output string
- Graceful degradation: non-zero exit codes logged as warnings but pipeline continues (REQ-04)
- Imports `resolvePackageRoot`, `logInfo`, `logWarn`, `logError` from `utils.js`
- Uses only Node.js built-ins (`child_process`, `path`) — zero new dependencies
- Verified: loads without errors, all 3 early-return paths correct, spawn with real scripts (sync.js + normalize-memory.js) returns `action: 'completed'` with captured output

### 2026-07-24: T11 — Added marker comment to `.husky/pre-commit`

Implemented the marker comment for the pre-commit hook (Batch D, Phase 4):
- Added `# Managed by @abarcenas/ai-workflow-template setup` as the first line of `.husky/pre-commit` with a blank line separator before the existing content
- Updated `TEMPLATE_HOOKS['pre-commit'].content` in `scripts/setup/constants.js` to include the marker comment at the top, keeping the template consistent with the actual file on disk
- Verified hook remains executable (`-rwxr-xr-x`)
- Verified hook still runs correctly: `bash .husky/pre-commit` exits with code 0, runs bump-version and validate-memory-schema
- Plan file `plan/feature-setup-command-v1.md` marked T11 as completed
- Active context and progress updated

### 2026-07-24: T13 — Modified `package.json` for setup command

Implemented the package.json modifications for the setup command (Batch E, Phase 5):
- Added `"bin"` field with `"ai-workflow-setup": "./bin/setup.js"` to register the CLI entry point
- Added `"bin/"` and `"scripts/setup/"` to the `files` array so both directories are included in npm package distribution
- Updated `"postinstall"` script to append deprecation notice: `echo '⚠️  IMPORTANT: Run npx ai-workflow-setup to configure git hooks'` after the existing sync + normalize-memory commands
- All other fields preserved exactly (2-space indent, trailing newline)
- JSON validated, all assertions from the plan pass
- Plan file `plan/feature-setup-command-v1.md` marked T13 as completed

### 2026-07-24: T12 — Added marker comment to `.husky/post-merge`

Implemented the marker comment for the post-merge hook (Batch D, Phase 4):
- Added `# Managed by @abarcenas/ai-workflow-template setup` as the first line of `.husky/post-merge`
- Shebang (`#!/bin/sh`) moved to line 2 — marker must be on line 1 for `discover.js` `isManaged` detection (checks first line against `HOOK_MARKER`)
- Shebang on line 2 is safe because husky sources hook files rather than executing them directly
- Updated `TEMPLATE_HOOKS['post-merge'].content` in `scripts/setup/constants.js` to include the marker at the top, keeping the template consistent with the actual file on disk
- Verified: `bash -n` syntax check passes, file remains executable (`-rwxr-xr-x`), `head -1` returns the marker
- Verified constants syntax: `node --input-type=module --check` passes
- Plan file `plan/feature-setup-command-v1.md` marked T12 as completed

### 2026-07-24: T10 — Created `bin/setup.js`

Implemented the CLI entry point for the setup command:
- Minimal shebang (`#!/usr/bin/env node`) ESM entry point with top-level `await import()`
- Delegates to `scripts/setup/index.js` `main(process.argv.slice(2))`
- Wraps delegation in try/catch — on fatal/unexpected error prints to stderr and exits with code 2
- Made executable with `chmod 755` (`-rwxr-xr-x`)
- Verified: `node bin/setup.js --help` prints help text and exits with code 0

### 2026-07-24: T9 — Created `scripts/setup/index.js`

Implemented the orchestrator module for the setup command pipeline:
- Single async export `main(argv)` implementing the full 5-phase pipeline
- Parses CLI args via `parseCliArgs(argv)` from utils.js
- Early-exit: `--help` prints help and returns 0; `--version` prints package version and returns 0
- Phase 1 (Discovery): calls `discover(flags)`, failure is fatal (exit 2)
- Phase 2 (Hooks): calls `installHooks(context)` unless `--skip-hooks` or no git repo
- Phase 3 (Prepare): calls `handlePrepare(context)` unless `--skip-prepare`
- Phase 4 (Husky Init): calls `initHusky(context)` unless `--skip-hooks` or no git repo
- Phase 5 (Sync): calls `runSyncPhase(context)` unless `--skip-sync`
- CI banner shown when `context.isCI` is true
- Each phase wrapped in try/catch — non-fatal errors logged and pipeline continues (REQ-04)
- Results aggregated into `{ phase, status, message }` array, rendered via `summary()`
- Exit code: SUCCESS (0) / WARNINGS (1) / FATAL (2) based on aggregated statuses
- Supports `--quiet` (suppress header/summary), `--yes` (forward compat)
- Verified: `--help` (help text + exit 0), `--version` (1.29.0 + exit 0), full dry-run pipeline, `--quiet` suppression, all `--skip-*` flags

### 2026-07-24: T7 — Created `scripts/setup/husky-init.js`

Implemented the husky initialization module for the setup command pipeline:
- Single async export `initHusky(context)` implementing Phase 4 (husky init per design §4.5)
- 6 return paths covering all states: dry-run, CI-skipped, no-git-skipped, husky-not-installed, failed, initialized
- Resolves husky from the consumer's node_modules using `createRequire` from `node:module` + dynamic `import()` — never from the package's own node_modules
- Verifies post-condition: checks `.husky/_/h` exists after calling `husky()`
- Catches errors from `husky()` and returns `{ action: 'failed', message: err.message }` for graceful degradation (REQ-04)
- All 4 early-return paths verified via smoke testing with Node.js ESM
- Zero new dependencies — uses only Node.js built-ins (`fs`, `path`, `module`)

### 2026-07-24: T6 — Created `scripts/setup/prepare.js`

Implemented the prepare script handling module for the setup command pipeline:
- Single async export `handlePrepare(context)` implementing the 6-case algorithm
- Case 1 (no package.json): skips with warning, returns `{ action: 'skipped', message: 'No package.json found' }`
- Case 2 (already has husky): skips via `includes('husky')` check on existing prepare script
- Case 3 (no prepare script): adds `"prepare": "husky"` to package.json scripts block
- Case 4 (simple prepare, e.g. "npm run build"): appends `&& husky` for clean merging
- Case 5 (complex prepare, multi-line or `||`/`;`): with `--force` replaces the script value with `"husky"`, otherwise warns and skips
- Case 6 (dry-run): logs predicted action via `step()` from ui.js, never writes to disk
- Uses `safeWriteJson` from utils.js to write back to `package.json` with 2-space indent + newline
- Imports `step`, `stepSuccess`, `stepWarn` from ui.js for console output
- Return format: `{ action: 'added'|'merged'|'skipped'|'dry-run', message: string }`
- Verified: all 15 test cases pass across 6 case groups, written JSON content verified correct

### 2026-07-24: T5 — Created `scripts/setup/hooks.js`

Implemented the hook installation module for the setup command pipeline:
- Single async export `installHooks(context)` implementing the 6-case merge algorithm
- Case A (no .husky dir): creates directory + writes hook with HOOK_MARKER + template content
- Case B (no existing hook file): writes hook file with HOOK_MARKER + template content
- Case C (existing, isManaged=true): overwrites with template content (idempotent re-run updates on template changes)
- Case D (existing, not ours, --force): backs up original to `.bak`, writes template content
- Case E (existing, not ours, no --force): appends with `HOOK_MERGE_SEPARATOR` + HOOK_MARKER + template content
- Case F (dry-run): prints `dryRunBanner()`, logs predicted actions via `step()`, returns results with action='dry-run'
- Imports from constants.js (TEMPLATE_HOOKS, HOOK_MARKER, HOOK_MERGE_SEPARATOR), utils.js (chmodX, ensureDir, safeReadFile, safeWriteFile), and ui.js (dryRunBanner, step, stepSuccess, stepError, stepWarn)
- All operations wrapped in try/catch — per-hook errors produce `action: 'skipped'` without blocking other hooks
- Returns `Array<{ hook, action, message }>` for each hook in TEMPLATE_HOOKS
- Verified: all 6 cases tested with temp directory fixtures, error handling (ENOTDIR, EACCES) caught correctly, dry-run creates no files, backup files created correctly for force overwrites

### 2026-07-24: T4 — Created `scripts/setup/discover.js`

Implemented the discovery module for the setup command pipeline:
- Single async export `discover(flags)` returning a Context object with 11 fields
- Detection steps (all individually wrapped in try/catch): consumer root resolution via `getConsumerRoot()`, git repo check via `.git/` directory, husky directory detection, package.json read/parse, existing hook detection (pre-commit + post-merge) with `isManaged` flag via `HOOK_MARKER` first-line check, prepare script extraction, `prepareIsSimple` classification (flags multi-line, `||`, and `;` as complex), CI detection via `isCI()`, Node.js version via `getNodeVersion()`
- Default context initialisation ensures all fields have safe fallbacks even when detection fails entirely
- Imports from `./constants.js` (`HOOK_MARKER`, `TEMPLATE_HOOKS`) and `./utils.js` (`dirExists`, `getConsumerRoot`, `getNodeVersion`, `isCI`, `safeReadFile`, `safeReadJson`)
- Verified: loads without errors, produces correct Context for template project (hasGit=true, hasHuskyDir=true, hasPackageJson=true, existingPrepare="husky", prepareIsSimple=true, nodeVersion=25, isCI=false), dryRun flag passthrough works

### 2026-07-24: T3 — Created `scripts/setup/ui.js`

Implemented the user interface module for the setup command pipeline:
- 16 exports: `COLORS`, `header`, `step`, `stepSuccess`, `stepWarn`, `stepError`, `info`, `warn`, `error`, `success`, `section`, `summary`, `help`, `divider`, `dryRunBanner`, `ciModeBanner`
- `header()` reads package.json version lazily, prints a banner with package name + version
- All coloured output uses ANSI escape codes with `process.stdout.isTTY` guard (codes stripped when piped)
- `summary()` renders a formatted table from `{ phase, status, message }` result objects with colour-coded status symbols and final result line
- `help()` auto-generates option listing from `SUPPORTED_FLAGS` in constants.js, displaying all 10 canonical flags with descriptions and examples
- `divider()`, `dryRunBanner()`, `ciModeBanner()` provide visual separators and mode indicators
- Zero external dependencies; imports from `constants.js` (UNICODE_CHARS, PACKAGE_NAME, BIN_NAME, SUPPORTED_FLAGS) and `utils.js` (resolvePackageRoot)
- Verified: all exports load correctly, smoke-tested each function produces output without errors, non-TTY mode verified

### 2026-07-24: T2 — Created `scripts/setup/utils.js`

Implemented the shared utilities module for the setup command pipeline:
- 20 exported functions: path resolution (`getConsumerRoot`, `resolvePackageRoot`, `resolveConsumerPath`), filesystem helpers (`ensureDir`, `safeReadFile`, `safeWriteFile`, `safeAppendFile`, `fileExists`, `dirExists`), file inspection (`isShellScript`, `chmodX`), JSON helpers (`safeReadJson`, `safeWriteJson`), hashing (`hashContent`), environment detection (`isCI`, `getNodeVersion`), CLI parsing (`parseCliArgs`), and logging wrappers (`logError`, `logWarn`, `logInfo`)
- All functions verified: parse args, path resolution, file ops, CI detection, hashing
- Imports from `constants.js`; uses only Node.js built-ins (`fs`, `path`, `crypto`, `url`)
- ES module syntax throughout

### 2026-07-24: T1 — Created `scripts/setup/constants.js`

Implemented the constants module for the setup command pipeline:
- 11 exports covering all shared static data: package identity, hook definitions, CI detection flags, CLI flag mapping, exit codes, required dirs, unicode symbols, and memory bank stubs
- Template hook content (`TEMPLATE_HOOKS`) matches `.husky/pre-commit` and `.husky/post-merge` byte-for-byte
- `MEMORY_BANK_STUBS` mirrors the same object from `scripts/sync.js` lines 204–254
- 15 CLI flags mapped (long + short forms) to 10 canonical keys
- 11 CI/CD environment variables supported (10 truthiness + NODE_ENV production check)

### 2026-07-24: Setup Command Implementation Plan

Produced `plan/feature-setup-command-v1.md` — detailed implementation plan with parallel batch structure:
- 17 tasks across 6 batches (A-F) for the 7-module pipeline
- 14 new files: bin/setup.js, 9 scripts/setup/ modules, 4 test files
- 3 files to modify: package.json, .husky/pre-commit, .husky/post-merge
- Batch A: constants.js, utils.js, ui.js (parallel)
- Batch B: discover.js, hooks.js, prepare.js, husky-init.js, sync-phase.js (parallel)
- Batch C: index.js, bin/setup.js (parallel)
- Batch D: marker comments on .husky/ hooks (parallel, independent)
- Batch E: package.json modifications (single, after sources)
- Batch F: unit tests for discover, hooks, prepare, index (parallel)

### 2026-07-24: Setup Command Architecture Design

Produced `plan/design-setup-command-v1.md` — comprehensive architecture for `npx @abarcenas/ai-workflow-template setup`:
- 7 modular components: discover, hooks, prepare, husky-init, sync-phase, ui, orchestrator
- 20 edge cases catalogued with detection logic and behavior for each
- Hook merging strategy: 6 cases (install/overwrite/skip/merge/wrap/dry-run)
- Prepare script merging: 4 classifications (none/exact-match/contains/other)
- CI/CD detection across 10+ environment variables
- Zero new dependencies — Node.js built-ins + existing husky
- `package.json` changes specified: `bin` field, `files` additions, deprecation note
- Integration plan for existing `sync.js` (child process spawn) and `.agents-sync-manifest.json`
- UX copy for all warning, error, and success states

### 2026-06-25: Rewrote agent.instructions.md for opencode

Rewrote `.agents/instructions/agent.instructions.md` (1068→609 lines):
- Simplified frontmatter — removed `model`, `target`, `infer`, `metadata`, `mcp-servers`, `handoffs`
- Removed ~300 lines of Copilot-only content
- Replaced tool aliases with opencode's case-sensitive tool names
- Updated all paths from `.github/agents/` to `.agents/agents/`

### 2026-07-24: README.md — Setup Command Documentation

Updated `README.md` with comprehensive documentation for the new `npx ai-workflow-setup` command:
- Added `🪝 Git Hook Setup` section after `🚀 Install` with: one-step setup commands, phases table (Discover/Hooks/Prepare/Husky Init/Sync), CLI options reference, hook merging explanation with idempotency and CI-awareness, npm v12 compatibility note
- Updated `🚀 Install` section: changed "sync configurations" to "sync files" + cross-reference to the setup command
- Updated `🔔 Important Notes`: appended bullet about `npx ai-workflow-setup` with npm v12+ compatibility

## Current Status

**Phase:** Setup Command — ✅ ALL TASKS COMPLETE (T1-T17), ✅ README DOCUMENTED

The implementation plan covers:
- ✅ 17 tasks across 6 parallel batches with clear dependency ordering
- ✅ 14 new files specified (9 source modules + bin entry + 4 test files)
- ✅ 3 files to modify (package.json, .husky/pre-commit, .husky/post-merge)
- ✅ Testing strategy: 4 unit test files covering discovery, hooks merging, prepare script, orchestrator
- ✅ 5 requirements, 4 constraints, 2 security constraints tracked
- ✅ 5 risks with mitigations, 5 assumptions documented
- ✅ Manual integration test procedure defined

Progress: ✅ T1-T17 complete. All 88 tests pass across 4 test files. Feature fully documented in `docs/setup-command/tracker.md` and `docs/tracker-log.md`.

## Known Issues

- No unit test files beyond placeholder — Vitest validation pending
- The project has no `src/` directory — unit tests target `scripts/` instead
- Memory bank was manually populated (not through normal pipeline flow)
- `postinstall` script will break under npm v12 default config — setup command is the fix
- `.husky/_/` shims are generated by husky, not versioned in git (by design)

### 2026-07-24: Tracker — Pipeline Knowledge Persisted to learned-knowledge.instructions.md

Recorded comprehensive session entry capturing all discoveries from the setup command feature pipeline:
- **7 key learnings documented**: npm v12 postinstall blocking, npx setup command pattern, husky v9 programmatic API, child_process.spawn for exit-isolation, marker comment idempotency, 6-batch parallel execution, duplicate-marker trap
- **Agent tuning notes added**: Specific prompting guidance for researcher (investigate npm ecosystem changes), architect (modular design with interface contracts), implementer (parallel batch plan with dependency edges), coder (batch ordering discipline), unit-tester (real temp dirs over mocks), tracker (capture ecosystem discoveries)
- **Pipeline structure captured**: researcher → architect → implementer → coder (6 parallel batches) → unit-tester → tracker
- Appended to `.agents/instructions/learned-knowledge.instructions.md`
