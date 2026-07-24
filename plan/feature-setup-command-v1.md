---
id: "feature-setup-command-v1"
title: "Feature: Setup Command v1 — `npx @abarcenas/ai-workflow-template setup`"
updated: "2026-07-24"
tags: [architect, orchestrator, setup, configuration, refactor, onboarding, normalization, implementation, discovery]
doc_type: "decision"
---



# Feature: Setup Command v1 — `npx @abarcenas/ai-workflow-template setup`

## Introduction

This plan implements the `npx @abarcenas/ai-workflow-template setup` command (aliased as `npx ai-workflow-setup`) based on the architecture design in `plan/design-setup-command-v1.md`. The command replaces the deprecated `postinstall` auto-sync pattern, enabling npm v12-safe distribution by providing an explicit, idempotent onboarding command.

The implementation follows a 7-module pipeline: **discover → hooks → prepare → husky-init → sync → ui → orchestrator**, built with zero new dependencies (Node.js built-ins + existing `husky` only), ES modules throughout.

**Status:** Planned

---

## Requirements & Constraints

| ID | Requirement / Constraint | Source |
|----|--------------------------|--------|
| REQ-01 | Consumer must explicitly run `npx @abarcenas/ai-workflow-template setup` (no automatic execution) | design §2 |
| REQ-02 | Must not rely on lifecycle scripts; must function when npm v12 blocks `postinstall` | design §2 |
| REQ-03 | Running setup multiple times must be idempotent — no duplicate entries, no corrupted hooks | design §2 |
| REQ-04 | Every failure mode must produce a clear, actionable error message; non-fatal phases must not block later phases | design §2 |
| REQ-05 | Consumer's existing hooks must be preserved; template commands are appended, never replaced | design §2 |
| REQ-06 | If consumer has existing `"prepare"` script, preserve by appending `&& husky`; complex scripts get manual instructions | design §2 |
| REQ-07 | In CI environments, skip git hook installation entirely; only perform file sync and memory-bank scaffold | design §2 |
| REQ-08 | Every operation produces visible output with a clear summary at the end | design §2 |
| REQ-09 | Support flags: `--force`, `--dry-run`, `--yes`/`-y`, `--skip-hooks`, `--skip-prepare`, `--skip-sync`, `--help`/`-h`, `--version`/`-v`, `--quiet`/`-q`, `--verbose`/`-V` | design §4.1 |
| CON-01 | All new code is ES modules (`"type": "module"`); no CommonJS | design §2 |
| CON-02 | Zero additional npm dependencies — only Node.js built-ins + existing `husky` dependency | design §2 |
| CON-03 | Must integrate with existing `scripts/sync.js` manifest system (via child process spawn) | design §8.1 |
| CON-04 | Hook template files must include `# Managed by @abarcenas/ai-workflow-template setup` as first line for idempotency detection | design §8.4 |
| SEC-01 | Never evaluate or `require()` consumer code; hook files are plain shell scripts only | design §2 |
| SEC-02 | Validate git repository before modifying hooks; warn and skip if outside a git repo | design §2 |

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T3 | Yes — 3 files | — |
| B | T4, T5, T6, T7, T8 | Yes — 5 files | Batch A |
| C | T9, T10 | Yes — 2 files | Batch B |
| D | T11, T12 | Yes — 2 files | — (independent) |
| E | T13 | No (single) | Batch C, D |
| F | T14, T15, T16, T17 | Yes — 4 files | Batch C (T4, T5, T6, T9) |

**Total: 17 tasks across 6 batches.** Batches A, B, C, D, and F can each execute all their tasks concurrently.

---

## Phase 1 — Foundation Files (Batch A — Parallel)

These three files have no runtime dependencies on each other. Their exported interfaces are fully defined in the design document (§3.3, §4.3, §4.7), enabling parallel implementation.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Create `scripts/setup/constants.js` with all static data: hook definitions (`TEMPLATE_HOOKS` with `pre-commit` and `post-merge`), `PACKAGE_NAME` (`@abarcenas/ai-workflow-template`), `BIN_NAME` (`ai-workflow-setup`), `HOOK_MARKER` (`# Managed by @abarcenas/ai-workflow-template setup`), `HOOK_MERGE_SEPARATOR` (`# --- @abarcenas/ai-workflow-template ---`), `CI_ENV_VARS` array (CI, GITHUB_ACTIONS, GITLAB_CI, CIRCLECI, TRAVIS, JENKINS_URL, BITBUCKET_BUILD_NUMBER, APPVEYOR, CODEBUILD_BUILD_ID, AZURE_HTTP_USER_AGENT, NODE_ENV production check), `EXIT_CODES` (0=success, 1=warnings, 2=fatal), `MEMORY_BANK_STUBS` (reuse object from `scripts/sync.js` lines 204-254), `UNICODE_CHARS` for output symbols | `scripts/setup/constants.js` | A | — | 2026-07-24 |
| T2 | Create `scripts/setup/utils.js` with shared helper functions: `resolveConsumerRoot()` (process.env.INIT_CWD → process.cwd() fallback with warning), `resolvePackageRoot()` (via import.meta.url relative to scripts/setup/), `parseCliArgs(argv)` (parse all 10 flags into object, handle `--help`/`-h`/`--version`/`-v` early-exit), `safeReadJson(path)` (try/catch JSON.parse, return undefined on failure), `safeWriteJson(path, obj)` (JSON.stringify with 2-space indent + trailing newline), `isFile(path)` / `isDir(path)` (thin wrappers over existsSync + statSync), `isShellScript(path)` (read first line, check for `#!/` shebang), `chmodX(path)` (chmod 755), `hashContent(content)` (sha256 hex), `getNodeVersion()` (parse process.version major), `isCI()` (check CI_ENV_VARS from constants) | `scripts/setup/utils.js` | A | — (imports from constants.js but interface is known) | 2026-07-24 |
| T3 | Create `scripts/setup/ui.js` with output formatting functions: `banner(version)` (print setup banner per design §6.1), `help()` (print help text per §6.2), `section(name, status)` (print phase result line with unicode symbol), `success(msg)`, `warn(msg)`, `error(msg)` (color-coded via ANSI escape sequences — green/yellow/red), `summary(context)` (print summary table per §4.7), `promotion()` (one-time promo per §6.6), `COLORS` object (reset, green, yellow, red, cyan, bold), `SYMBOLS` ({ check: '✓', warn: '⚠', cross: '✗' }) | `scripts/setup/ui.js` | A | — (imports from constants.js for symbol characters but interface is known) | 2026-07-24 |

**Validation:** Each file parses without syntax errors when loaded with `node --input-type=module -e "import '...'"`. Constants exports match design document values. Utils functions return expected types for trivial inputs. UI functions produce visible output without throwing.

---

## Phase 2 — Core Pipeline Modules (Batch B — Parallel, depends on Batch A)

All five modules import from T1-T3 (constants, utils, ui) but have zero interdependencies. Each receives a Context object (or produces one) and can be implemented and tested in isolation.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T4 | Create `scripts/setup/discover.js` — export async function `discover(contextOverride?)` that performs 8 sequential detection steps and returns a `Context` object. Steps: (1) Resolve `consumerRoot` from INIT_CWD or cwd(), (2) Detect git repo via `git rev-parse --git-dir` (silent) + `.git/` directory check → set `context.isGitRepo`, (3) Read + parse `consumerRoot/package.json` → set `context.consumerPackageJson` / `context.hasPackageJson`, (4) For each hook in `TEMPLATE_HOOKS`: check existence in `consumerRoot/.husky/<name>` → set `context.existingHooks[name]` with `{ exists, isShell, size, hasOurMarker }`, (5) Detect prepare script classification ('none' | 'exact-match' | 'starts-with' | 'ends-with' | 'contains' | 'other'), (6) Detect CI via `isCI()` from utils, (7) Detect Node version via `getNodeVersion()`, (8) Detect husky installation via `resolve(consumerRoot, 'node_modules/husky')`. Handle all 20 edge cases from design §5 (EC-01 through EC-20). Return enriched context object with all discovery fields plus `flags`, `errors`, `warnings` arrays. | `scripts/setup/discover.js` | B | T1, T2, T3 | 2026-07-24 |
| T5 | Create `scripts/setup/hooks.js` — export async function `installHooks(context)` implementing the 6-case merge algorithm per design §4.3. For each hook in `TEMPLATE_HOOKS`: **Case A** (no existing hook) → copy template, chmod 755, result `"installed"`. **Case B** (exists + `--force`) → rename existing to `.bak`, copy template, result `"overwritten"`. **Case C** (exists + has our `HOOK_MARKER`) → skip, result `"skipped (already installed)"`. **Case D** (exists + is shell + not ours) → read existing, append separator + our content, write merged, result `"merged"`. **Case E** (exists + non-shell/binary) → rename to `.real`, create wrapper shell script that runs original then our commands, result `"wrapped"`. **Case F** (dry-run) → report what would happen, make no changes. Must handle edge cases: `.husky/` as file not directory (error EC-10), permission denied (EC-11), empty hook file treated as not ours (EC-18). Each operation logs through `ui` module. Returns `HookResult` with `{ installed: string[], merged: string[], overwritten: string[], wrapped: string[], skipped: string[], errors: ErrorObject[] }`. | `scripts/setup/hooks.js` | B | T1, T2, T3 | 2026-07-24 |
| T6 | Create `scripts/setup/prepare.js` — export function `handlePrepare(context)` implementing prepare script merge per design §4.4. Algorithm: (1) Read `context.consumerPackageJson.scripts.prepare` (may be undefined). (2) Classify: `undefined`/'none' → SET to `"husky"`; `"husky"` exactly → SKIP; starts with `"husky &&"` → SKIP; ends with `" && husky"` → SKIP; contains `"husky"` elsewhere → SKIP (already configured per EC-05/EC-19); anything else → MERGE by appending `&& husky`. (3) For 'other' scripts with `&&` chains >3 commands or multi-line: WARN and provide manual instructions, do NOT auto-modify (EC-06). (4) Handle missing `scripts` block: create `"scripts": { "prepare": "husky" }`. (5) Write back to `context.consumerRoot/package.json` preserving 2-space indent + trailing newline. (6) In dry-run: report what WOULD be written. Handle malformed JSON (EC-13) as error. Return `PrepareResult` with `{ action: 'set' | 'skip' | 'merge' | 'warned', originalScript, newScript?, message }`. | `scripts/setup/prepare.js` | B | T1, T2, T3 | 2026-07-24 |
| T7 | Create `scripts/setup/husky-init.js` — export async function `initHusky(context)` per design §4.5. Steps: (1) Verify husky is resolvable from `context.consumerRoot/node_modules/husky`. If not found: in CI → skip (return `{ action: 'skipped (CI)' }`), not CI → error with install instructions (EC-16). (2) Check husky major version from its `package.json`; if v8 → warn (EC-09) but attempt anyway. (3) Dynamic import: `const { default: husky } = await import(resolve(consumerRoot, 'node_modules/husky'))`. (4) Call `husky(consumerRoot)` — this is idempotent per husky v9. (5) Verify post-conditions: `.husky/_/` exists, `.husky/_/.gitignore` exists with `*`, `.husky/_/h` exists. (6) Handle failures: not a git repo → skip (husky init requires git), git config permission denied → warn with manual command (EC-12), husky() throws → catch, log error, continue with warning. In dry-run mode: report "Would initialize husky." Return `HuskyInitResult` with `{ shimsGenerated: boolean, hooksPathSet: boolean, errors: ErrorObject[], warnings: ErrorObject[] }`. | `scripts/setup/husky-init.js` | B | T1, T2, T3 | 2026-07-24 |
| T8 | Create `scripts/setup/sync-phase.js` — export async function `runSyncPhase(context)` per design §4.6. Spawns `scripts/sync.js` and `scripts/normalize-memory.js` as child processes (Option A from design — child process to avoid `process.exit()` in imported modules). Steps: (1) If `skipSync`: return `{ action: 'skipped' }`. (2) If `dryRun`: log intent, return `{ action: 'dry-run' }`. (3) Spawn `node <packageRoot>/scripts/sync.js` with env `INIT_CWD=<consumerRoot>`, pass `--force` if `flags.force`. Capture stdout+stderr, exit code. (4) Spawn `node <packageRoot>/scripts/normalize-memory.js` with same env and flags. (5) If sync.js exit code non-zero: warn but don't block (REQ-04). (6) If normalize-memory.js non-zero: warn. Return `{ action: 'completed'|'partial', message, results: [{ script, success, exitCode, output }] }`. | `scripts/setup/sync-phase.js` | B | T1, T2, T3 | 2026-07-24 |

**Validation per task:**
- **T4:** Invoke `discover()` in the template repo; verify `context.isGitRepo === true`, `context.consumerPackageJson.name` matches, existing hooks detected.
- **T5:** Unit-test each merge case with temp directory fixtures (Case A-F), verify correct file content for each.
- **T6:** Unit-test each classification path with sample prepare script strings.
- **T7:** Invoke `initHusky()` in template repo; verify it returns `{ shimsGenerated: true }` (already exists → idempotent).
- **T8:** Run `sync-phase.js` with `--dry-run`; verify sync.js and normalize-memory.js are spawned with correct flags and no files modified.

---

## Phase 3 — Orchestrator + Entry Point (Batch C — Parallel, depends on Batch B)

The orchestrator imports all five core modules. The entry point is a trivial shim that delegates to the orchestrator. Both can be written in parallel once the module interfaces are known.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T9 | Create `scripts/setup/index.js` — export async function `main(argv)` implementing the full pipeline. Steps: (1) Call `parseCliArgs(argv)` from utils → handle `--help` (print help, exit 0), `--version` (read from constants, exit 0). Populate `context.flags`. (2) Call `discover()` to build initial context. (3) If `!context.isGitRepo` and hooks not skipped: print warning, skip hooks + husky-init. (4) Phase 2: If `--skip-hooks` not set → call `installHooks(context)`, merge result into context. (5) Phase 3: If `--skip-prepare` not set → call `handlePrepare(context)`, merge result. (6) Phase 4: If `--skip-hooks` not set and isGitRepo → call `initHusky(context)`, merge result. (7) Phase 5: If `--skip-sync` not set → call `runSync(context)`, merge result. (8) Call `summary(context)` from ui. (9) Determine exit code: any phase errors → 2, any warnings → 1, all success → 0. Each phase call is wrapped in try/catch; a phase failure logs the error and continues (graceful degradation — REQ-04). Collect all errors/warnings across phases. Apply `--quiet` (suppress non-error output) and `--verbose` (show debug info) flags. Handle `--yes` (non-interactive, skip prompts — v1 has no prompts but flag is accepted for forward compat). | `scripts/setup/index.js` | C | T4, T5, T6, T7, T8 (interfaces) | 2026-07-24 |
| T10 | Create `bin/setup.js` — minimal entry point with shebang. Content: `#!/usr/bin/env node` followed by `import { main } from '../scripts/setup/index.js';` then `main(process.argv.slice(2)).then(code => process.exit(code)).catch(err => { console.error('Fatal:', err.message); process.exit(2); });`. This file must be executable (`chmod +x`). | `bin/setup.js` | C | T9 (simple delegation — can be written from interface spec) | 2026-07-24 |

**Validation:**
- **T9:** Run `node scripts/setup/index.js --help` — expect help text printed, exit code 0.
- **T10:** Run `node bin/setup.js --help` — same output as T9.

---

## Phase 4 — Marker Comments on Hook Templates (Batch D — Parallel, independent)

These two tasks modify the existing template hook files to include the marker comment used for idempotency detection (Case C in hooks.js). These are independent of all other tasks and can run in any batch. Placed here logically after the hook definitions are implemented.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T11 | Add `# Managed by @abarcenas/ai-workflow-template setup` as the **first line** of `.husky/pre-commit`. The marker goes above the existing `node scripts/bump-version.js` line. The existing content follows after a blank line. | `.husky/pre-commit` | D | — | 2026-07-24 |
| T12 | Add `# Managed by @abarcenas/ai-workflow-template setup` as the **first line** of `.husky/post-merge`. The existing shebang `#!/bin/sh` moves to line 2, followed by the existing `. "$(dirname "$0")/_/husky.sh"` content. | `.husky/post-merge` | D | — | 2026-07-24 |

**Validation:** After modification, running `head -1 .husky/pre-commit` and `head -1 .husky/post-merge` returns the marker comment. Both hooks remain executable and their original behavior is unchanged (test manually: `bash .husky/pre-commit` in template root should run bump-version and validate-memory-schema as before).

---

## Phase 5 — package.json Modifications (Batch E — single, depends on C, D)

A single coordinated change to `package.json` that exposes the CLI via `bin`, adds new directories to the `files` array, and adds a `setup` alias script. Must be done after all source files exist.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T13 | Modify `package.json` with precise changes: **(a) Add `"bin"` field** at top level: `"bin": { "ai-workflow-setup": "./bin/setup.js" }`. **(b) Add `"setup"` script** to `"scripts"` block: `"setup": "node ./bin/setup.js"`. **(c) Modify `"postinstall"` script** to prepend deprecation notice: `"echo '[ai-workflow-template] postinstall is deprecated. Run: npx @abarcenas/ai-workflow-template setup' && node ./scripts/sync.js && node ./scripts/normalize-memory.js"`. The rest of the postinstall line remains unchanged (sync + normalize-memory still runs for backward compat). **(d) Add to `"files"` array**: `"bin/"` and `"scripts/setup/"` entries. All other fields preserved exactly (2-space indent, trailing newline). | `package.json` | E | T9, T10, T11, T12 | 2026-07-24 |

**Validation:** `node -e "const pkg = require('./package.json'); console.assert(pkg.bin['ai-workflow-setup']); console.assert(pkg.files.includes('bin/')); console.assert(pkg.scripts.setup); console.assert(pkg.scripts.postinstall.includes('deprecated'));"` — all assertions pass.

---

## Phase 6 — Unit Tests (Batch F — Parallel, depends on Batch C)

Four test files covering the core modules. Each test file is independent and can be written in parallel. Tests follow the existing Vitest pattern from `scripts/sync.test.js` and the `nodejs-vitest.instructions.md` conventions.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T14 | Create `scripts/setup/discover.test.js` — unit tests for `discover.js`. Mock `fs` and `child_process` modules (or use `vi.mock`). Tests: (1) Resolves consumerRoot from INIT_CWD. (2) Falls back to cwd() when INIT_CWD unset. (3) Detects git repo when `.git/` exists. (4) Sets isGitRepo=false when no `.git/`. (5) Parses package.json correctly. (6) Handles missing package.json gracefully (hasPackageJson=false). (7) Detects existing hooks with correct metadata (exists, isShell, size, hasOurMarker). (8) Classifies prepare script: 'none' when undefined. (9) Classifies 'exact-match' for "husky". (10) Classifies 'contains' for "my-script && husky". (11) Detects CI from env vars. (12) Parses Node version correctly. (13) Detects husky installation. | `scripts/setup/discover.test.js` | F | T4 | 2026-07-24 |
| T15 | Create `scripts/setup/hooks.test.js` — unit tests for `hooks.js`. Use temp directories (`fs.mkdtempSync` via `node:os`). Tests: (1) Case A: no existing hook → template copied, chmod 755. (2) Case B: existing hook + force → overwritten, .bak created. (3) Case C: existing hook with marker → skipped. (4) Case D: existing shell hook, not ours → merged with separator. (5) Case E: existing non-shell file → wrapper created, original renamed to .real. (6) Case F: dry-run → no files modified. (7) `.husky/` is a file not directory → error returned. (8) Permission denied scenario (mock chmod failure). (9) Empty existing hook treated as not ours (Case D). (10) All six hooks result in correct HookResult structure. Clean up temp directories in `afterEach`. | `scripts/setup/hooks.test.js` | F | T5 | |
| T16 | Create `scripts/setup/prepare.test.js` — unit tests for `prepare.js`. Pure function tests on string manipulation + JSON handling. Tests: (1) No prepare script → sets "husky". (2) Exact "husky" → skipped. (3) "husky && lint" → skipped (starts-with). (4) "build && husky" → skipped (ends-with). (5) "build && husky && lint" → skipped (contains). (6) "npm run build" → merged to "npm run build && husky". (7) Multi-line script → warned, not auto-modified. (8) Complex && chain (4+) → warned. (9) No scripts block at all → creates block. (10) package.json read failure → error returned. (11) dry-run → reports action but doesn't write. (12) Q-05: --force re-sets to "husky" entirely. | `scripts/setup/prepare.test.js` | F | T6 | 2026-07-24 |
| T17 | Create `scripts/setup/index.test.js` — integration-style tests for the orchestrator. Tests: (1) `--help` prints help text and exits 0. (2) `--version` prints version and exits 0. (3) `--dry-run` passes flag through to all phases (verify context.flags.dryRun=true). (4) `--skip-hooks` skips hooks and husky-init phases. (5) `--skip-prepare` skips prepare phase. (6) `--skip-sync` skips sync phase. (7) `--force` flag propagated. (8) Error aggregation: when one phase errors, others continue, exit code 2. (9) Warning aggregation: when phases warn, exit code 1. (10) All phases succeed → exit code 0. Use `vi.mock` to mock all imported modules (discover, hooks, prepare, huskyInit, syncPhase, ui) so tests don't touch real filesystem. | `scripts/setup/index.test.js` | F | T9 | |

**Validation:** Run `npx vitest run scripts/setup/` — all tests pass. Coverage meets the 90% threshold defined in `vitest.config.ts`. Run `npx vitest run --coverage` — verify `scripts/setup/` files are above threshold.

---

## Testing Strategy

### Unit Tests (Vitest — automated)

| Test File | Coverage Target | Module Under Test |
|-----------|----------------|-------------------|
| `scripts/setup/discover.test.js` | Covers 8 detection steps + 12 edge cases (EC-01, EC-02, EC-14, EC-20) | `discover.js` |
| `scripts/setup/hooks.test.js` | Covers all 6 merge cases + EC-10, EC-11, EC-18 | `hooks.js` |
| `scripts/setup/prepare.test.js` | Covers all 4 classifications + EC-06, EC-13, EC-19, Q-05 force behavior | `prepare.js` |
| `scripts/setup/index.test.js` | Covers arg parsing, phase ordering, exit codes, error aggregation | `index.js` |

### Manual Integration Test

```
# Test 1: Fresh setup
mkdir /tmp/test-consumer && cd /tmp/test-consumer
git init && npm init -y && npm install husky --save-dev
node /path/to/ai-workflow-template/bin/setup.js --dry-run
node /path/to/ai-workflow-template/bin/setup.js
# Verify: .husky/pre-commit exists, package.json has prepare: "husky"

# Test 2: Idempotency
node /path/to/ai-workflow-template/bin/setup.js
# Verify: "skipped (already installed)" for hooks

# Test 3: Force overwrite
node /path/to/ai-workflow-template/bin/setup.js --force
# Verify: hooks overwritten, .bak exists

# Test 4: npx invocation
cd /tmp/test-consumer
npx /path/to/ai-workflow-template setup --help
# Verify: help text prints from the full package path

# Test 5: CI mode
CI=true node /path/to/ai-workflow-template/bin/setup.js
# Verify: hooks skipped, sync still runs
```

---

## Files Summary

### New Files (14)

| FILE-01 | `bin/setup.js` | CLI entry point (shebang + delegation) |
| FILE-02 | `scripts/setup/constants.js` | Static data: hooks, env vars, marker strings |
| FILE-03 | `scripts/setup/utils.js` | Shared helpers: arg parsing, fs wrappers, path resolution |
| FILE-04 | `scripts/setup/ui.js` | Output: colors, symbols, banner, help, summary |
| FILE-05 | `scripts/setup/discover.js` | Phase 1: detect consumer project state → Context |
| FILE-06 | `scripts/setup/hooks.js` | Phase 2: install/merge hook files (6 cases) |
| FILE-07 | `scripts/setup/prepare.js` | Phase 3: modify consumer package.json prepare script |
| FILE-08 | `scripts/setup/husky-init.js` | Phase 4: programmatic husky() initialization |
| FILE-09 | `scripts/setup/sync-phase.js` | Phase 5: spawn sync.js + normalize-memory.js child processes |
| FILE-10 | `scripts/setup/index.js` | Orchestrator: arg parsing, phase sequencing, summary |
| FILE-11 | `scripts/setup/discover.test.js` | Unit tests for discovery |
| FILE-12 | `scripts/setup/hooks.test.js` | Unit tests for hook merging |
| FILE-13 | `scripts/setup/prepare.test.js` | Unit tests for prepare script handling |
| FILE-14 | `scripts/setup/index.test.js` | Unit tests for orchestrator |

### Modified Files (3)

| FILE-15 | `package.json` | Add `bin`, `setup` script, `files` entries, deprecation notice in postinstall |
| FILE-16 | `.husky/pre-commit` | Add marker comment as first line |
| FILE-17 | `.husky/post-merge` | Add marker comment as first line |

---

## Dependencies

| DEP-01 | `husky@^9.0.0` | Existing devDependency — used programmatically in `husky-init.js` | Required |
| DEP-02 | `scripts/sync.js` | Existing file — spawned as child process by `sync-phase.js` | Required |
| DEP-03 | `scripts/normalize-memory.js` | Existing file — spawned as child process by `sync-phase.js` | Required |
| DEP-04 | `vitest@^4.1.8` | Existing devDependency — used for unit tests | Required |
| DEP-05 | `playwright` (test infrastructure) | Existing — not used by new code | None |

---

## Risks & Assumptions

| RISK-01 | **Husky v10 breaks `husky()` API.** Mitigation: `husky-init.js` detects husky major version and warns if not v9. Consumer installs their own husky version. Template's devDependency is pinned to `^9.0.0`. |
| RISK-02 | **sync.js `process.exit()` kills setup process if imported directly.** Mitigation: `sync-phase.js` uses child process spawn (Option A from design §4.6). ALT-02 (refactoring sync.js to export functions) is deferred. |
| RISK-03 | **`INIT_CWD` behavior changes in future npm versions.** Mitigation: `utils.js` falls back to `process.cwd()` with a visible warning. |
| RISK-04 | **Prepare script merge breaks consumer's build pipeline.** Mitigation: Conservative merge — only auto-append to simple scripts. Complex scripts get manual instructions. |
| RISK-05 | **Existing `.husky/` with incompatible structure (non-husky, e.g., lefthook).** Mitigation: `discover.js` detects other hook managers. Phase 2 warns and skips if incompatible. Documented as edge case EC-02 in design §5 but handled as detection, not merge. |

| ASSUMPTION-01 | Consumer project uses npm (not yarn/pnpm/bun). `npx` works with npm. Prepare script field is universal. Husky works across all package managers. |
| ASSUMPTION-02 | Consumer has Node.js >= 18. Older versions are EOL and unsupported. |
| ASSUMPTION-03 | Consumer's hooks are either shell scripts or binaries (not Python/Ruby/Node scripts). Non-shell hooks trigger wrapper creation (Case E). |
| ASSUMPTION-04 | Default output goes to stdout with ANSI color codes. No TUI/interactive interface. |
| ASSUMPTION-05 | Running via `npx @abarcenas/ai-workflow-template setup` (full package name) invokes the `bin.setup` script that npm's `bin` field maps — npm resolves `bin` entries even for npx-invoked packages. |

---

## Related Specifications

- `plan/design-setup-command-v1.md` — Architecture design document (840 lines, complete)
- `scripts/sync.js` — Existing file sync logic (reused via child process)
- `scripts/normalize-memory.js` — Existing memory normalization logic (reused via child process)
- `.husky/pre-commit`, `.husky/post-merge` — Template hook definitions
- `package.json` — Bin entry, files array, scripts
- `vitest.config.ts` — Vitest configuration (include pattern covers `scripts/**/*.test.js`)
