---
id: "activeContext"
title: "Active Context"
updated: "2026-07-24"
tags: [architect, orchestrator, bootstrap, setup, implementation, discovery]
entities: [vitest, graphify, memory-bank, husky, opencode]
category: "context"
---


# Active Context

## Current Focus

**Verbose Logging Spike — Research Complete** — Completed deep-dive research into `npx ai-workflow-setup` hanging behavior and verbose logging gaps. Spike document at `docs/spike-verbose-logging.md`. Critical finding: `sync-phase.js` `spawnScript()` captures all child process output silently — the most likely cause of "loading... hangs". The `--verbose` flag is defined and parsed but **never used** anywhere in the codebase. 7 files identified for modification to implement verbose/debug output.

## Recent Changes

- **2026-07-24**: Verbose/Debug Logging Spike Research — `docs/spike-verbose-logging.md` created
  - Examined all 13 files in the setup pipeline (bin/setup.js, 9 scripts/setup/ modules, sync.js, normalize-memory.js, package.json)
  - **P0 Finding**: `sync-phase.js` `spawnScript()` captures all child stdout/stderr into a dead `output` string — if sync.js or normalize-memory.js hangs, user sees absolutely nothing
  - **P0 Finding**: `--verbose`/`-V` flag is defined in `constants.js` and parsed by `parseCliArgs()` but NEVER checked in any phase module — flag infrastructure exists but does nothing
  - **P1 Finding**: `husky-init.js` dynamic `import(huskyPath)` at line 73 has no progress indicator — could hang silently if consumer's husky install is broken
  - **P1 Finding**: `discover.js` runs 9 detection steps silently — user can't tell where detection might be stuck
  - **P2 Finding**: `sync.js` file-by-file copy loop (lines 94-125, 133-166) has no per-file logging — hundreds of files copied silently with only a final summary
  - **Inconsistency**: `husky-init.js` uses raw `console.log` instead of ui.js functions; no shared verbose/debug utility exists
  - Recommended approach: Use existing `--verbose` flag via new `verbose()` function in `ui.js`, pass through Context, P0 fix is to stream child process output in real-time when verbose

- **2026-07-24**: Implemented T17 — Created `scripts/setup/index.test.js`
  - 24 unit tests covering all 23 required scenarios from the plan
  - Tests: --help/-h (2), --version/-v (2), --dry-run, --skip-hooks, --skip-sync, --skip-prepare, unknown flag, full pipeline, discovery failure (fatal exit 2), hooks phase failure (graceful degradation), prepare failure, husky-init failure, sync failure, no git (warnings exit 1), CI mode banner, quiet mode (no header/summary), multiple skips combined, argv passthrough, context passthrough, flags passthrough, --help priority over --version
  - Uses `vi.mock()` for all 7 imported modules (utils, ui, discover, hooks, prepare, husky-init, sync-phase) so tests don't touch real filesystem
  - Spies on `console.log` for --version verification
  - Run: `npx vitest run scripts/setup/index.test.js` — 24 passed, 0 failed, 5ms
  - Coverage: index.js 91.5% statements, 91.75% lines

- **2026-07-24**: Implemented T16 — Created `scripts/setup/prepare.test.js`
  - 27 unit tests covering all 12 required scenarios from the plan plus 15 additional edge cases
  - Tests: no package.json (skipped), prepare has husky (skipped), no prepare (added), simple prepare (merged), complex prepare multi-line/||/; (skipped), complex prepare + force (added), dry-run (3 sub-variants), empty string, whitespace-only, husky prefix substring detection
  - Uses real temp directories (`mkdtempSync`) with ui module mocked for clean test output
  - Additional edge cases: preserving all package.json fields across add/merge/replace operations, `npx husky` substring detection, result structure validation across 7 scenarios
  - Run: `npx vitest run scripts/setup/prepare.test.js` — 27 passed, 0 failed, 111ms

- **2026-07-24**: Implemented T1 — Created `scripts/setup/constants.js`
- **2026-07-24**: Implemented T2 — Created `scripts/setup/utils.js`
  - Exports 10 named constant groups: `PACKAGE_NAME`, `BIN_NAME`, `HOOK_MARKER`, `HOOK_MERGE_SEPARATOR`, `TEMPLATE_HOOKS`, `CI_ENV_VARS`, `SUPPORTED_FLAGS`, `EXIT_CODES`, `REQUIRED_DIRS`, `UNICODE_CHARS`, `MEMORY_BANK_STUBS`
  - All template hook content verified to match actual `.husky/pre-commit` and `.husky/post-merge` files byte-for-byte
  - File passes syntax validation with `node --input-type=module -e "import * as c from '...'"`
  - Plan file `plan/feature-setup-command-v1.md` marked T1 as completed
- **2026-07-24**: Implemented T2 — Created `scripts/setup/utils.js`
  - 20 exported utility functions: `getConsumerRoot`, `resolvePackageRoot`, `resolveConsumerPath`, `ensureDir`, `safeReadFile`, `safeWriteFile`, `safeAppendFile`, `fileExists`, `dirExists`, `isShellScript`, `chmodX`, `safeReadJson`, `safeWriteJson`, `hashContent`, `isCI`, `getNodeVersion`, `parseCliArgs`, `logError`, `logWarn`, `logInfo`
  - Imports from `constants.js` (`CI_ENV_VARS`, `SUPPORTED_FLAGS`)
  - ES module syntax, zero external dependencies, Node.js built-ins only
  - Verified: all 20 exports load and function correctly
  - Plan file `plan/feature-setup-command-v1.md` marked T2 as completed
- **2026-07-24**: Implemented T3 — Created `scripts/setup/ui.js`
  - 16 exports: `COLORS`, `header`, `step`, `stepSuccess`, `stepWarn`, `stepError`, `info`, `warn`, `error`, `success`, `section`, `summary`, `help`, `divider`, `dryRunBanner`, `ciModeBanner`
  - Header reads package.json version via `resolvePackageRoot` + lazy caching
  - All colour-coded output uses ANSI escapes with `process.stdout.isTTY` guard (clean piped output)
  - Summary table renders an array of `{ phase, status, message }` objects with coloured status symbols
  - Help text auto-generates from `SUPPORTED_FLAGS` in constants.js with descriptions for all 10 canonical flags
  - Zero external dependencies; imports from `constants.js` and `utils.js`
  - Verified: all exports load, all 15 output functions run without errors, non-TTY mode strips ANSI codes
  - Plan file `plan/feature-setup-command-v1.md` marked T3 as completed
- **2026-07-24**: Produced implementation plan at `plan/feature-setup-command-v1.md`
  - 17 tasks across 6 parallel batches (A-F) with clear dependency ordering
  - 14 new files (10 source + 4 test), 3 files to modify
  - Batch A (foundation): constants.js, utils.js, ui.js — parallel
  - Batch B (core modules): discover, hooks, prepare, husky-init, sync-phase — parallel
  - Batch C (orchestrator): index.js, bin/setup.js — parallel
  - Batch D (markers): .husky/pre-commit, .husky/post-merge — parallel, independent
  - Batch E (config): package.json — single, after all sources exist
  - Batch F (tests): discover.test.js, hooks.test.js, prepare.test.js, index.test.js — parallel
  - Testing strategy: 4 test files covering discovery, hooks, prepare, orchestrator
- **2026-07-24**: Produced comprehensive architecture design document at `plan/design-setup-command-v1.md`
  - Designed 7-module CLI architecture: discover, hooks, prepare, husky-init, sync-phase, ui, orchestrator
  - Catalogued 20 edge cases with detection + behavior for each
  - Defined hook merging strategy: 6 cases (install, overwrite, skip, merge, wrap, dry-run)
  - Defined prepare script merging: 4 classifications (none, exact-match, contains, other)
  - Documented `package.json` changes needed: `bin` field, `files` additions, deprecation notice for `postinstall`
  - Integration plan with existing `sync.js` (child process spawn) and sync manifest
  - CI/CD awareness: detect 10+ CI env vars, skip hook installation in CI
  - Zero additional dependencies — uses only Node.js built-ins + existing `husky` dependency

- **2026-07-24**: Implemented T8 — Created `scripts/setup/sync-phase.js`
  - Single async export `runSyncPhase(context)` implementing the sync phase
  - 4 return paths: `skipped` (--skip-sync), `dry-run` (--dry-run), `completed` (all scripts success), `partial` (any script failure)
  - Spawns `scripts/sync.js` and `scripts/normalize-memory.js` as child processes using `child_process.spawn` to avoid `process.exit()` in sync.js killing the parent
  - Both stdout+stderr captured into combined output string per script
  - Forwards `--force` to child scripts when `flags.force` is set
  - Graceful degradation: non-zero exit codes produce `action: 'partial'` with warnings, but don't block
  - Imports from `utils.js` (`resolvePackageRoot`, `logInfo`, `logWarn`, `logError`)
  - Zero new dependencies — Node.js built-ins only (`child_process`, `path`)
  - Verified: all 3 early-return paths pass smoke testing, spawn with real scripts returns correct result
  - Plan file `plan/feature-setup-command-v1.md` marked T8 as completed

### Pre-Design (June 2025)
- Added Vitest + @vitest/coverage-v8 as devDependencies
- Created `vitest.config.ts` with 90% coverage thresholds targeting `scripts/`
- Updated `package.json` with `test:unit`, `test:unit:coverage`, `test:unit:watch` scripts
- Generated graphify knowledge graph (`graphify-out/`) — 1328 nodes, 1299 edges, 131 communities
- Created `/plan/` directory for implementation plans
- Created `memory-bank/tasks/` directory with `_index.md`
- Populated `docs/.architecture-context.md` with real project architecture
- Created `docs/.orchestrator-log.md` with bootstrap log
- Created `.agents/instructions/learned-knowledge.instructions.md`
- Populated all 6 memory bank core files with real project context
- Rewrote `.agents/instructions/agent.instructions.md` (1068→609 lines) for opencode

- **2026-07-24**: Implemented T5 — Created `scripts/setup/hooks.js`
  - Single async export `installHooks(context)` implementing the 6-case merge algorithm
  - Case A (no .husky dir): create directory + write hook with marker + content
  - Case B (no existing hook file): write hook file with marker + content
  - Case C (existing, isManaged=true): overwrite (idempotent re-run updates template content)
  - Case D (existing, isManaged=false, --force): backup original to .bak, overwrite
  - Case E (existing, isManaged=false, no --force): append with `HOOK_MERGE_SEPARATOR` + marker + content
  - Case F (dry-run): print `dryRunBanner()`, log predicted actions via `step()`, return results with action='dry-run'
  - Uses `TEMPLATE_HOOKS` content, `HOOK_MARKER`, `HOOK_MERGE_SEPARATOR` from constants.js
  - Uses `ensureDir`, `safeWriteFile`, `safeReadFile`, `chmodX` from utils.js
  - Uses `dryRunBanner`, `step`, `stepSuccess`, `stepError`, `stepWarn` from ui.js
  - All operations wrapped in try/catch — per-hook errors produce `action: 'skipped'` without blocking the other hook
  - Returns `Array<{ hook, action, message }>` for each hook in TEMPLATE_HOOKS
  - Verified: all 6 cases pass smoke testing, error handling (ENOTDIR) caught correctly, dry-run creates no files
  - Plan file marked T5 as completed
- **2026-07-24**: Implemented T6 — Created `scripts/setup/prepare.js`
  - Single async export `handlePrepare(context)` implementing the 6-case prepare script algorithm
  - Case 1 (no package.json): returns `{ action: 'skipped' }` with warning
  - Case 2 (already has "husky"): returns `{ action: 'skipped' }` via `includes('husky')` check
  - Case 3 (no prepare script): sets `"prepare": "husky"`, returns `{ action: 'added' }`
  - Case 4 (simple prepare): appends `&& husky`, returns `{ action: 'merged' }`
  - Case 5 (complex prepare): with `--force` replaces value, otherwise warns and returns `{ action: 'skipped' }`
  - Case 6 (dry-run): logs predicted action via `step()`, returns `{ action: 'dry-run' }`
  - Uses `safeWriteJson` from utils.js with `join(consumerRoot, 'package.json')`
  - Imports `step`, `stepSuccess`, `stepWarn` from ui.js for output
  - Verified: all 15 test cases pass (6 main cases + variants), writes verified correct
  - Plan file `plan/feature-setup-command-v1.md` marked T6 as completed
- **2026-07-24**: Implemented T7 — Created `scripts/setup/husky-init.js`
  - Single async export `initHusky(context)` implementing the husky initialization phase
  - 6 return paths: `dry-run`, `skipped` (CI), `skipped` (no git), `skipped` (husky not installed), `failed` (husky() throws or post-condition fails), `initialized` (success)
  - Uses `createRequire` from `node:module` to resolve husky from the CONSUMER's node_modules (not the package's own)
  - Verifies post-condition by checking `.husky/_/h` exists after init
  - All early-return paths verified via smoke testing; imports only `fs`, `path`, `module` (built-ins)
- **2026-07-24**: Implemented T9 — Created `scripts/setup/index.js`
  - Single async export `main(argv)` implementing the full 5-phase orchestration pipeline
  - Phase 1 (Discovery): calls `discover(flags)`, failure is fatal (exit 2)
  - Phase 2 (Hooks): calls `installHooks(context)` unless `--skip-hooks` or no git repo
  - Phase 3 (Prepare): calls `handlePrepare(context)` unless `--skip-prepare`
  - Phase 4 (Husky Init): calls `initHusky(context)` unless `--skip-hooks` or no git repo
  - Phase 5 (Sync): calls `runSyncPhase(context)` unless `--skip-sync`
  - Early-exit handling: `--help` (help text, exit 0), `--version` (package version, exit 0)
  - Summary table via `ui.summary(phases)` with `{ phase, status, message }` entries
  - Exit code: SUCCESS (0) / WARNINGS (1) / FATAL (2) based on aggregated statuses
  - Non-fatal phase errors caught individually — pipeline continues (REQ-04)
  - `--quiet` suppresses header and summary; `--yes` accepted for forward compat
  - Verified: `--help`, `--version`, full pipeline, `--quiet`, `--skip-*` flags all work
  - Plan file `plan/feature-setup-command-v1.md` marked T9 as completed

- **2026-07-24**: Implemented T4 — Created `scripts/setup/discover.js`
  - Single async export `discover(flags)` returning a Context object with 11 fields
  - Detects: consumerRoot, git repo, .husky/ directory, package.json, existing hooks (pre-commit + post-merge), prepare script, CI env, Node.js version
  - Hook detection reads `.husky/<name>` via `safeReadFile()` and checks first line against `HOOK_MARKER` for `isManaged` classification
  - `prepareIsSimple` classifier: flags multi-line scripts, `||` operators, and `;` separators as complex (not auto-mergeable)
  - All 9 detection steps wrapped in individual try/catch blocks — Context always returned even if detections fail
  - Imports from `./constants.js` (HOOK_MARKER, TEMPLATE_HOOKS) and `./utils.js` (dirExists, getConsumerRoot, getNodeVersion, isCI, safeReadFile, safeReadJson)
  - Verified: loads without errors, produces correct Context for the template project, CI detection works, dryRun flag passthrough works

- **2026-07-24**: Implemented T10 — Created `bin/setup.js`
- **2026-07-24**: Implemented T11 — Added `# Managed by @abarcenas/ai-workflow-template setup` marker comment as first line of `.husky/pre-commit`; also updated `TEMPLATE_HOOKS['pre-commit'].content` in `scripts/setup/constants.js` to include the marker for template consistency
  - Minimal shebang entry point (`#!/usr/bin/env node`) with ESM top-level await
  - Delegates to `scripts/setup/index.js` `main()` via `await import()`
  - Wraps delegation in try/catch — on fatal error prints to stderr and exits with code 2
  - Made executable with `chmod +x`
  - Verified: `node bin/setup.js --help` prints help text and exits with code 0
  - Plan file `plan/feature-setup-command-v1.md` marked T10 as completed
- **2026-07-24**: Implemented T12 — Added `# Managed by @abarcenas/ai-workflow-template setup` marker comment as first line of `.husky/post-merge`; shebang (`#!/bin/sh`) moved to line 2. Updated `TEMPLATE_HOOKS['post-merge'].content` in `scripts/setup/constants.js` to include the marker for template consistency.
  - Marker placed on line 1 to satisfy `discover.js` `isManaged` detection (checks first line against `HOOK_MARKER`)
  - Existing shebang preserved on line 2 (husky sources hook files, so shebang position doesn't affect execution)
  - File validated: `bash -n` syntax check passes, file remains executable (`-rwxr-xr-x`)
  - Constants syntax validated: `node --input-type=module --check` passes
  - Plan file `plan/feature-setup-command-v1.md` marked T12 as completed

- **2026-07-24**: Implemented T13 — Modified `package.json`
  - Added `"bin"` field with `"ai-workflow-setup": "./bin/setup.js"` mapping to the entry point
  - Added `"bin/"` and `"scripts/setup/"` to the `files` array for npm distribution
  - Updated `"postinstall"` script to append deprecation notice about the new setup command
  - Verified: JSON valid, all assertions pass, file maintains 2-space indent and trailing newline

- **2026-07-24**: Implemented T14 — Created `scripts/setup/discover.test.js`
  - 21 unit tests covering all 13 required scenarios from the plan plus 8 additional edge cases
  - Tests use temp directories for real filesystem interaction with mocked environment detection (`isCI`, `getNodeVersion`)
  - All scenarios tested: fresh project (no .husky/), .husky/ with/without hooks, managed/unmanaged hooks, missing/malformed package.json, prepare script classification (none/simple/complex/husky), CI/non-CI, Node version, dryRun flag passthrough
  - Additional edge cases: `||` operator, `;` separator, empty prepare string, both hooks detection, no git repo
  - Run: `npx vitest run scripts/setup/discover.test.js` — 21 passed, 0 failed, 110ms

- **2026-07-24**: Implemented T15 — Created `scripts/setup/hooks.test.js`
  - 16 unit tests covering all 6 merge cases (A-F) plus 10 additional edge cases
  - Tests use real temp directories (`mkdtempSync`) with zero mocks on filesystem operations
  - All 6 merge algorithm cases tested: Case A (no .husky/ dir → created), Case B (no hook file → created), Case C (managed → overwritten), Case D (unmanaged + force → overwritten + .bak), Case E (unmanaged + no force → merged), Case F (dry-run → no writes)
  - Edge cases: partial failure (one hook succeeds, other fails), .husky as file (not dir), executable permission check, empty .husky/ dir, flags.force alternative path, partial existingHooks map, result structure validation, dry-run with existing unmanaged hooks, idempotent overwrite no .bak, result message traceability
  - Run: `npx vitest run scripts/setup/hooks.test.js` — 16 passed, 0 failed, 100ms

- **2026-07-24**: Implemented T1 — Added `verbose()` export function to `scripts/setup/ui.js`
  - New `export function verbose(enabled, message)` added after the `write` helper (line 141)
  - No-op when `enabled` is falsy; prints `  … message` with dim ANSI styling when enabled
  - Uses existing `DIM`, `RST`, and `write()` from module scope — no new imports
  - Verified: `verbose(true, 'test message')` prints `  … test message` (dim style); `verbose(false, ...)` prints nothing
  - Plan file `plan/feature-verbose-logging-v1.md` marked T1 as completed

- **2026-07-24**: Updated `README.md` to document the new `npx ai-workflow-setup` command
  - Added `🪝 Git Hook Setup` section after `🚀 Install` covering: one-step setup, phases table, CLI options, hook merging behavior, npm v12 compatibility note
  - Updated `🚀 Install` section: changed "sync configurations" to "sync files" + cross-reference to setup command
  - Updated `🔔 Important Notes`: appended bullet about `npx ai-workflow-setup` with npm v12+ compatibility note

- **2026-07-24**: Implemented T3 — Modified `scripts/setup/sync-phase.js` to stream child process output in real-time when verbose mode is active
  - Added `import { verbose } from './ui.js'` at the top of the file
  - Modified `spawnScript()` signature to accept 5th parameter: `verbose = false`
  - When `verbose` is truthy: uses `stdio: 'inherit'` (real-time terminal output) and sets `AI_WORKFLOW_VERBOSE=1` in child env; returns `output: '(streamed to terminal)'`
  - When `verbose` is falsy: keeps existing `stdio: 'pipe'` + captured output behavior unchanged; sets `AI_WORKFLOW_VERBOSE=0` in child env
  - Added pre-spawn verbose log messages (`'Spawning sync.js…'`, `'Spawning normalize-memory.js…'`)
  - Passes `context.verbose` as the 5th argument to both `spawnScript()` calls
  - P0 fix: root cause of "loading... hangs" — users now see real-time progress from child processes in verbose mode

- **2026-07-24**: Implemented T6 — Added verbose logging for per-hook file operations in `scripts/setup/hooks.js`

- **2026-07-24**: Implemented T4 — Added verbose logging to `scripts/setup/husky-init.js`
  - Added `import { info, warn, verbose } from './ui.js'` at the top of the file
  - Destructured `verbose: verboseFlag` from `context` to gate verbose output
  - Added 6 verbose log points: before husky resolution, after husky path found, in error catch (not found), before `husky()` call, in error catch (failed), and before post-condition verification
  - Replaced raw `console.log` on line 44 (dry-run) with `info()` from ui.js
  - Replaced raw `console.log` on line 52 (CI) with `warn()` from ui.js
  - Added `@param {boolean} context.verbose` JSDoc to the function signature
  - All 88 existing tests pass — zero regressions
  - Added `verbose` to the existing `import { … } from './ui.js'` block
  - **Case A** (no .husky/ dir): logs "Creating .husky/ directory…", "Writing {hookName} hook…", "Setting executable permissions…", "  ✓ done"
  - **Case B** (no existing hook file): logs "Writing {hookName} hook…", "Setting executable permissions…", "  ✓ done"
  - **Case C** (managed overwrite): logs "Overwriting {hookName} (idempotent update)…", "Setting executable permissions…", "  ✓ done"
  - **Case D** (force backup+overwrite): logs "Backing up existing {hookName}…", "Writing {hookName} hook (force)…", "Setting executable permissions…", "  ✓ done"
  - **Case E** (merge): logs "Reading existing {hookName} for merge…", "Writing merged {hookName}…", "Setting executable permissions…", "  ✓ done"
  - All calls gated by `context.verbose` — no output when verbose is falsy (REQ-02 regression guarantee)
  - All 16 existing tests pass unchanged; syntax valid; plan file updated
- **2026-07-24**: Implemented T7 — Added per-file copy logging to `scripts/sync.js` for verbose mode
  - Added `const isVerbose = process.env.AI_WORKFLOW_VERBOSE === '1'` at the top of the module (line 16)
  - Added `if (isVerbose) console.error(...)` calls before each `syncFile()` / `copyFileSync()` / `writeFileSync()` call across all 5 file operation sections:
    - `.agents/` loop (lines 108, 119): `'  … syncing: .agents/{relativePath}'`
    - `.opencode/` loop (lines 151, 162): `'  … syncing: .opencode/{relativePath}'`
    - Root files loop (lines 187, 198): `'  … syncing: {rootFile}'`
    - Memory-bank scaffold (line 275): `'  … scaffolding: memory-bank/{fileName}'`
    - opencode.mcp.json auto-copy (line 288): `'  … scaffolding: opencode.mcp.json from example'`
  - Uses `console.error` for verbose output (stderr, not captured stdout) — consistent with child process architecture
  - Uses simple `'  …'` prefix format without ANSI codes (no ui.js import needed in child process)
  - Plan file `plan/feature-verbose-logging-v1.md` marked T7 as completed; Phase 3 status updated to ✅ COMPLETE

- **2026-07-24**: Implemented T5 — Added 9 verbose log steps to `scripts/setup/discover.js`
  - Added `import { verbose } from './ui.js'` alongside existing imports
  - Added `const verboseEnabled = !!flags.verbose` inside `discover()` for local verbose gating
  - 9 detection steps now emit dim `…` progress messages when `--verbose` is active: consumer root resolution, git repo, .husky/ dir, package.json, hook detection (per-hook granularity), prepare script, CI env, Node.js version, and "Discovery complete" summary
  - All result messages use context-aware formatting (e.g., `'Git repository found'` / `'No git repository'`)
  - Per-hook detection shows `'<hookName>: managed'`, `'<hookName>: found (unmanaged)'`, or `'<hookName>: not found'`
  - Zero new dependencies, all existing 88 tests pass (21 discover tests, 16 hooks, 27 prepare, 24 index)
  - Part of Batch B (Phase 2) — parallel with T3 (sync-phase), T4 (husky-init), T6 (hooks)

## Next Actions

- **Verbose logging implementation plan** — See `plan/feature-verbose-logging-v1.md`
  - 10 tasks across 4 parallel batches (A: foundation, B: core fixes, C: child process, D: tests)
  - Phase 1 (T1–T2): Core infrastructure — ✅ `verbose()` in ui.js + ✅ Context `verbose` field in discover.js
  - Phase 2 (T3–T6): Critical silent spots + detail logging — ✅ sync-phase.js, ✅ husky-init.js, ✅ discover.js, ✅ hooks.js
  - Phase 3 (T7): Child process pass-through — ✅ `sync.js` per-file logging via `AI_WORKFLOW_VERBOSE` env var
  - Phase 4 (T8–T10): Tests — discover.test.js, index.test.js, sync-phase.test.js (new)
  - No new dependencies, uses existing `--verbose` flag infrastructure, zero code changes needed in index.js
