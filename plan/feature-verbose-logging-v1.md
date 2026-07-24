---
goal: "Implement verbose/debug logging for `npx ai-workflow-setup` using the existing `--verbose` flag infrastructure"
version: 1
date_created: 2026-07-24
last_updated: 2026-07-24
status: Planned
tags: [feature, verbose, logging, setup, debug]
---

# Feature: Verbose Logging v1 — `npx ai-workflow-setup --verbose`

## Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

The `npx ai-workflow-setup` command currently shows coarse phase-level output but goes silent during long-running operations such as child-process sync, detection scans, and dynamic imports. Users see "loading" then nothing — and if a child process hangs, there is zero visibility into what went wrong.

The `--verbose`/`-V` flag is **already defined** in `constants.js` (line 122–123) and **parsed** by `parseCliArgs()` in `utils.js`, but it is **never checked** anywhere in the codebase — dead flag infrastructure. This plan activates that dormant flag and wires it into every phase of the setup pipeline, enabling step-by-step progress output that eliminates the "silent hang" problem.

The spike research at `docs/spike-verbose-logging.md` identified 7 files requiring changes, ranked P0–P2 by severity. The root cause of silent hangs is `sync-phase.js` `spawnScript()`, which captures all child process stdout/stderr into a string that is never displayed (lines 136–171). This is the **P0 critical fix**.

This plan follows 5 implementation phases, 10 tasks, and 4 parallel batches with zero new dependencies (Node.js built-ins only).

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2 | Yes | — |
| B | T3, T4, T5, T6 | Yes | T1, T2 |
| C | T7 | No (single) | T3 (env var must be set first) |
| D | T8, T9, T10 | Yes | T2–T7 (all source changes) |

**Total: 10 tasks across 4 batches.** Batches A, B, and D can execute all their tasks concurrently. Only T7 is sequential.

---

## 1. Requirements & Constraints

| ID | Requirement / Constraint | Source |
|----|--------------------------|--------|
| REQ-01 | When `--verbose` flag is set, every phase must produce step-by-step sub-operation output using the dim ANSI style (`…` prefix) | spike §5 |
| REQ-02 | WITHOUT `--verbose`, output must remain identical to current behavior (no regression in normal mode) | spike §5 |
| REQ-03 | `sync-phase.js` must stream child process stdout/stderr to the parent terminal in real-time when verbose mode is active (fixes root cause of "loading… hangs") | spike §4 (CRITICAL) |
| REQ-04 | `husky-init.js` must log progress before the dynamic `import(huskyPath)` and `husky()` calls to prevent silent hangs during consumer husky resolution | spike §4 (CRITICAL) |
| REQ-05 | `discover.js` must log each of its 9 detection steps when verbose is enabled so users can see what's being detected | spike §4 (HIGH) |
| REQ-06 | `hooks.js` must log per-hook file operations (file writes, chmod, merges) when verbose is enabled | spike §4 (LOW) |
| REQ-07 | `sync.js` (child process) must accept the verbose flag via environment variable (`AI_WORKFLOW_VERBOSE=1`) and log per-file operations during the sync loop | spike §4 (HIGH) |
| REQ-08 | The verbose flag must be accessible to ALL phase modules via the Context object — `context.verbose` must be a boolean set during discovery | spike §5.2 |
| REQ-09 | All verbose output must use the `ui.js` `verbose()` function (single source of truth for verbose formatting), not raw `console.log` | spike §5.1 |
| CON-01 | Zero new npm dependencies — only Node.js built-ins (`child_process`, `fs`, `path`, etc.) + existing `husky` dependency | spike §6 |
| CON-02 | All new code is ES modules (`"type": "module"`); no CommonJS | existing conventions |
| CON-03 | Must integrate with existing `scripts/sync.js` manifest system (via child process spawn — no refactoring of sync.js architecture) | existing architecture |
| CON-04 | Verbose output format: `" … message"` (dim ANSI, two-space indent, with the `…` character used consistently) | spike §5.1 |
| PAT-01 | Follow existing module patterns: each module imports `verbose` from `ui.js` and uses `verbose(context.verbose, message)` | spike §5.1 |

---

## 2. Implementation Steps

### Phase 1 — Core Verbose Infrastructure (Batch A — Parallel) ✅ COMPLETE

**GOAL:** Add the `verbose()` output function to `ui.js` and wire the `verbose` flag into the Context object in `discover.js`. These two changes are zero-dependency foundations that unblock all subsequent phases.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | **Add `verbose()` export function to `ui.js`.** Insert a new function after the existing `write` helper (after line 140). Signature: `export function verbose(enabled, message)`. When `enabled` is truthy, calls `write(\` \${DIM}… \${message}\${RST}\`)`. When `enabled` is falsy, does nothing (no-op). The two-space indent and dim ANSI style match the spike spec §5.1 output format. Export `verbose` alongside all other named exports (no default export). No imports required — uses existing `DIM`, `RST`, and `write` from the module scope. | `scripts/setup/ui.js` | A | — | 2026-07-24 |
| T2 | **Add `verbose` field to Context in `discover.js`.** In `createDefaultContext(flags)` (line 36–56), add `verbose: !!flags.verbose` as a new property in the returned context object. This ensures that every phase module receiving the Context can check `context.verbose`. Place the new field after the existing `dryRun: !!flags.dryRun` line (line 54) for logical grouping. No other changes to `discover.js` in this task — the verbose log calls for detection steps are handled in T5. | `scripts/setup/discover.js` | A | — | 2026-07-24 |

**Validation:**
- **T1:** `node --input-type=module -e "import { verbose } from './scripts/setup/ui.js'; verbose(true, 'test message')"` prints `  … test message` in dim style. Same call with `verbose(false, ...)` prints nothing. TTY guard works correctly (no ANSI codes in piped output).
- **T2:** Unit test: `discover({ verbose: true })` returns context with `context.verbose === true`. `discover({})` returns context with `context.verbose === false`.

---

### Phase 2 — Critical Silent Spots (Batch B — Parallel, depends on T1, T2)

**GOAL:** Fix the two highest-severity silent spots that cause "loading… hangs": `sync-phase.js` child process output capture and `husky-init.js` dynamic import. Also add verbose logging to `discover.js` detection steps. All four tasks can execute in parallel since they modify different files.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T3 | **Stream child process output in real-time in `sync-phase.js` when verbose mode is active.** Three changes to `spawnScript()` (lines 136–171): **(a)** Add a new parameter `verbose` to the function signature: `function spawnScript(name, scriptPath, cwd, extraArgs, verbose)`. **(b)** When `verbose` is truthy, use `stdio: 'inherit'` instead of `stdio: 'pipe'` — this streams child stdout/stderr directly to the parent terminal in real-time. When `verbose` is falsy, keep the existing `stdio: 'pipe'` behavior (capture into `output` string as before). **(c)** When `verbose` is truthy, the `output` string will be empty (since data isn't piped) — adjust the `resolve()` call to use `output: verbose ? '(streamed to terminal)' : output.trim()`. In `runSyncPhase()` (lines 51–111): **(a)** Add `import { verbose } from './ui.js'` at the top of the file (alongside existing imports). **(b)** Before each `spawnScript()` call, add a verbose log: `verbose(context.verbose, \`Spawning ${name}…\`)` (replacing the placeholder `name`). **(c)** Pass `context.verbose` as the 5th argument to both `spawnScript()` calls (lines 75–80 and 83–89). **(d)** Add `AI_WORKFLOW_VERBOSE` to the child process environment inside `spawnScript()`: modify the `env` object (line 141) to include `AI_WORKFLOW_VERBOSE: verbose ? '1' : '0'`. This env var is consumed by `sync.js` in T7. | `scripts/setup/sync-phase.js` | B | T1, T2 | 2026-07-24 |
| T4 | **Add verbose logging to `husky-init.js` around the dynamic import and `husky()` call.** Change the following: **(a)** Add `import { verbose } from './ui.js'` at the top of the file. **(b)** Before `createRequire.resolve('husky')` (line 72), add: `verbose(context.verbose, 'Resolving husky from consumer node_modules…')`. **(c)** After `huskyPath` is resolved (line 72), add: `verbose(context.verbose, \`Found husky at \${huskyPath}\`)`. **(d)** Before `husky(consumerRoot)` (line 85), add: `verbose(context.verbose, 'Calling husky()…')`. **(e)** After successful husky init (before the `hPath` check at line 91), add: `verbose(context.verbose, 'Verifying .husky/_/h exists…')`. **(f)** Replace raw `console.log` calls (lines 44, 52) with `info()` and `warn()` from ui.js. Import `info` and `warn` from `'./ui.js'`. **Note:** `context.verbose` reaches `husky-init.js` because the orchestrator in `index.js` passes the full `context` object (line 292). | `scripts/setup/husky-init.js` | B | T1, T2 | 2026-07-24 |
| T5 | **Add verbose logging for all 9 detection steps in `discover.js`.** Add `import { verbose } from './ui.js'` at the top of the file (alongside existing imports from `./constants.js` and `./utils.js`). After the `flags` parameter is destructured, extract `const verboseEnabled = !!flags.verbose` (line 145 area). For each of the 9 detection steps (lines 148–235), add a `verbose(verboseEnabled, …)` call BEFORE each try/catch block: **(1)** "Resolving consumer root from INIT_CWD…" (before line 150). **(2)** "Checking for .git directory…" + result: "… found" or "… not found" (around line 167). **(3)** "Checking for .husky/ directory…" + result (around line 174). **(4)** "Reading package.json…" + result (around line 181). **(5)** "Detecting existing hooks…" + "… <hookName>: found/managed" or "… <hookName>: not found" inside the loop (around lines 194–196). Use a nested verbose call inside the `for…of` loop for per-hook granularity. **(6)** "Extracting prepare script…" + result (around line 202). **(7)** "Detecting CI environment…" + result "… CI detected" / "… not CI" (around line 221). **(8)** "Detecting Node.js version…" + result "\`… v{version}\`" (around line 227). **(9)** "Discovery complete" (after the return on line 235). Each verbose message follows the format: `verbose(verboseEnabled, '<message>')`. Result messages (e.g., "… found") should be separate verbose calls after the detection completes successfully. **Note:** `discover()` receives `flags` directly (line 145), so it uses `verboseEnabled` as a local variable rather than `context.verbose`. | `scripts/setup/discover.js` | B | T1 | 2026-07-24 |
| T6 | **Add verbose logging for per-hook file operations in `hooks.js`.** Add `import { verbose } from './ui.js'` at the top of the file (alongside existing imports from `ui.js`). Within the main `installHooks` function loop (lines 181–258), add verbose calls for each filesystem operation: **(a)** Case A (line 194): Before `ensureDir`, add `verbose(context.verbose, \`Creating .husky/ directory…\`)`. Before `safeWriteFile`, add `verbose(context.verbose, \`Writing \${hookName} hook…\`)`. After `chmodX`, add `verbose(context.verbose, 'Setting executable permissions…')`. **(b)** Case B (line 205): Same pattern as Case A (write → chmod). **(c)** Case C (line 215): Before `safeWriteFile`, add `verbose(context.verbose, \`Overwriting \${hookName} (idempotent update)…\`)`. **(d)** Case D (line 225): Before backup, add `verbose(context.verbose, \`Backing up existing \${hookName}…\`)`. Before overwrite, add `verbose(context.verbose, \`Writing \${hookName} hook (force)…\`)`. **(e)** Case E (line 240): Before read, add `verbose(context.verbose, \`Reading existing \${hookName} for merge…\`)`. Before write, add `verbose(context.verbose, \`Writing merged \${hookName}…\`)`. The `context.verbose` field is available because the orchestrator passes the full `context` object to `installHooks(context)`. | `scripts/setup/hooks.js` | B | T1, T2 | 2026-07-24 |

**Validation:**
- **T3:** Run `node bin/setup.js --verbose` in a project with `.husky/` and syncable files. Verify `sync.js` and `normalize-memory.js` output appears in real-time with `[ai-workflow-template]` prefixes. Without `--verbose`, output is identical to current behavior (only final summary).
- **T4:** Run `node bin/setup.js --verbose` and verify husky resolution messages appear before the import completes.
- **T5:** Run `node bin/setup.js --verbose` and verify 9+ discovery progress messages appear with the dim `…` prefix.
- **T6:** Run `node bin/setup.js --verbose --force` and verify per-hook file operation messages appear (create dir, write, chmod).

---

### Phase 3 — Child Process Verbose Pass-through (Batch C — depends on T3) ✅ COMPLETE

**GOAL:** Enable `sync.js` (a spawned child process) to produce per-file copy logging when the verbose flag is set. This depends on T3 because `sync-phase.js` must set the `AI_WORKFLOW_VERBOSE` environment variable before `sync.js` can read it.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T7 | **Add per-file copy logging to `sync.js` when `AI_WORKFLOW_VERBOSE=1`.** Two changes: **(a)** At the top of the file (after the existing argument parsing on line 13), add: `const verboseMode = process.env.AI_WORKFLOW_VERBOSE === '1'`. **(b)** Inside each of the three sync loops, add per-file verbose logging. **Loop 1 — .agents/ sync** (lines 94–125): After `syncFile(sourceFile, targetFile)` (line 107) and line 118 (force/untouched), add: `if (verboseMode) console.log(\`[ai-workflow-template] Syncing \${relativePath}…\`)`. Place the log after the syncFile call so it only logs files that were actually copied (not skipped). **Loop 2 — .opencode/ sync** (lines 135–166): Same pattern — after each `syncFile()` call (lines 149 and 158), add equivalent verbose log. **Loop 3 — root files** (lines 169–200): Same pattern after `syncFile()` calls (lines 183 and 193). **Loop 4 — memory-bank scaffold** (lines 259–271): After `writeFileSync` (line 268), add: `if (verboseMode) console.log(\`[ai-workflow-template] Scaffolding memory-bank/\${fileName}…\`)`. **opencode.mcp.json auto-copy** (line 281): After `copyFileSync`, add: `if (verboseMode) console.log('[ai-workflow-template] Scaffolding opencode.mcp.json from example…')`. All verbose logs use the existing `[ai-workflow-template]` prefix convention for consistency with the existing final summary at line 290. | `scripts/sync.js` | C | T3 | 2026-07-24 |

**Validation:**
- **T7:** Run `node bin/setup.js --verbose --force` and verify per-file sync messages appear in real-time: `[ai-workflow-template] Syncing .agents/skills/git-commit/SKILL.md…` etc. Without `--verbose`, sync output is identical to current behavior (only `skipped` warnings and final summary).

---

### Phase 4 — Tests (Batch D — Parallel, depends on T2–T7)

**GOAL:** Add unit test coverage for the verbose flag passthrough and behavior. All test files are independent and can execute in parallel.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T8 | **Update `discover.test.js` to verify `verbose` field on Context.** Add 2 tests: **(a)** "sets verbose=true on Context when flags.verbose is true" — calls `discover({ verbose: true })` and asserts `result.verbose === true`. **(b)** "sets verbose=false on Context when flags.verbose is false/absent" — calls `discover({})` and asserts `result.verbose === false`. These tests follow the existing pattern in `discover.test.js` where `isCI` and `getNodeVersion` are mocked via `vi.mock`. No new mocks needed — the `verbose` field is set in `createDefaultContext(flags)` and does not depend on filesystem or env vars. | `scripts/setup/discover.test.js` | D | T2 | |
| T9 | **Update `index.test.js` to verify verbose flag passthrough.** Add test: "passes verbose flag through to Context" — mocks `discover` to return a context with `verbose: true`, then asserts that the discovery phase preserves `context.verbose === true`. Optionally add a test verifying `--verbose`/`-V` flag is correctly parsed by `parseCliArgs` (but this is already covered by the existing arg-parsing tests — verify by checking `parseCliArgs(['--verbose'])` returns `{ verbose: true }`). Follow the existing mock pattern (`vi.mock('./utils.js', ...)`) and add any needed mock adjustments. | `scripts/setup/index.test.js` | D | T2 | |
| T10 | **Create `scripts/setup/sync-phase.test.js` — unit tests for verbose vs non-verbose spawn behavior.** Use `vi.mock('child_process', ...)` to mock `spawn` with a fake child process that emits stdout/stderr data events and a close event. Tests: **(a)** "pipes child output when verbose is false" — verifies `stdio: 'pipe'` is used and `AI_WORKFLOW_VERBOSE` is `'0'` in the child env. **(b)** "inherits child stdio when verbose is true" — verifies `stdio: 'inherit'` is used and `AI_WORKFLOW_VERBOSE` is `'1'`. **(c)** "returns 'completed' when both scripts succeed in verbose mode" — mocks both spawn calls with exit code 0 and verifies the result. **(d)** "returns 'partial' when one script fails in verbose mode". **(e)** "emits verbose pre-spawn messages when context.verbose is true" — verifies the ui `verbose()` function is called (mock via `vi.mock('./ui.js', ...)`). Use `vi.mock` for `./ui.js` and `./utils.js`. Follow the Vitest conventions in `hooks.test.js` (real temp dirs but mocked child_process). | `scripts/setup/sync-phase.test.js` *(new file)* | D | T3 | |

**Validation:**
- **T8:** `npx vitest run scripts/setup/discover.test.js` — new tests pass alongside existing 21 tests.
- **T9:** `npx vitest run scripts/setup/index.test.js` — new tests pass alongside existing 24 tests.
- **T10:** `npx vitest run scripts/setup/sync-phase.test.js` — all 5 tests pass. `npx vitest run scripts/setup/` runs all test files and all pass.

---

## 3. Alternatives

| ID | Alternative | Decision |
|----|-------------|----------|
| ALT-01 | **Use a `debug` library** (like `debug` npm package) for namespaced logging. | **Rejected.** Would add a new npm dependency (violates CON-01). The existing `--verbose` flag infrastructure is already in place and sufficient. |
| ALT-02 | **Refactor `sync.js` to export functions** so it can be called directly instead of spawned as a child process. | **Rejected for this plan.** Would be a large refactor (sync.js uses `process.exit()` and `process.argv` at the module level). The child-process approach is working and the verbose flag can be passed via env var. Deferred to a potential future refactor. |
| ALT-03 | **Add `--debug` flag** for even more granular output (file hashes, raw JSON, error stacks). | **Deferred to follow-up.** `--debug` would imply `--verbose` plus extra detail. Not needed for the initial fix, but the infrastructure (T1, T2) supports it easily by adding a `debug()` function to `ui.js` and `debug: !!flags.debug` to Context. |
| ALT-04 | **Always stream child output** instead of conditionally streaming only in verbose mode. | **Rejected.** The current `pipe` + capture behavior is intentional — child process output is captured for the summary/error reporting in `runSyncPhase()`. Verbose mode adds real-time streaming *in addition* to capture. Using `stdio: 'inherit'` for verbose gives real-time output; `pipe` for non-verbose maintains the existing error-reporting contract. |

---

## 4. Dependencies

| ID | Description | Required |
|----|-------------|----------|
| DEP-01 | `ui.js` `verbose()` function (T1) — all phase modules import this for verbose output | Yes |
| DEP-02 | `discover.js` `verbose` Context field (T2) — all downstream phase modules read `context.verbose` | Yes |
| DEP-03 | `sync-phase.js` env var passthrough (T3) — `sync.js` reads `AI_WORKFLOW_VERBOSE` from `process.env` | Yes (for T7) |
| DEP-04 | `child_process.spawn` (Node.js built-in) — used by `sync-phase.js` | Yes (already used) |
| DEP-05 | `vitest@^4.1.8` — existing devDependency for unit tests | Yes (for T8–T10) |

---

## 5. Files

### Modified Files (7 + test files)

| File ID | Path | Change Summary |
|---------|------|----------------|
| FILE-01 | `scripts/setup/ui.js` | Add `verbose()` export function (dim ANSI, conditional on `enabled` parameter) |
| FILE-02 | `scripts/setup/discover.js` | Add `verbose` to Context + 9 verbose log calls for detection steps |
| FILE-03 | `scripts/setup/index.js` | **No changes needed** — `discover(flags)` builds Context with `verbose` field, and orchestrator passes full context to all phases automatically. Verified: context flows from discovery through all 4 subsequent phases without any index.js modifications. |
| FILE-04 | `scripts/setup/sync-phase.js` | Stream child output when verbose (`stdio: 'inherit'`), add verbose pre-spawn messages, pass `AI_WORKFLOW_VERBOSE` env var to child processes |
| FILE-05 | `scripts/setup/husky-init.js` | Verbose logging around `createRequire.resolve()`, `import()`, and `husky()` calls; replace raw `console.log` with ui.js functions |
| FILE-06 | `scripts/setup/hooks.js` | Verbose logging for per-hook file operations (ensureDir, safeWriteFile, chmodX) |
| FILE-07 | `scripts/sync.js` | Read `AI_WORKFLOW_VERBOSE` env var; add per-file copy/scaffold logging in all 4 sync loops |

### Files NOT Modified (Verified)

| File ID | Path | Reason |
|---------|------|--------|
| NONE-01 | `scripts/setup/constants.js` | `--verbose`/`-V` already in `SUPPORTED_FLAGS` (line 122–123); no changes needed |
| NONE-02 | `scripts/setup/utils.js` | `parseCliArgs()` already parses `--verbose`/`-V` (line 332–335); no changes needed |
| NONE-03 | `scripts/setup/prepare.js` | Prepare script handling does not have silent/hanging operations; verbose logging not required for this phase |
| NONE-04 | `scripts/normalize-memory.js` | Already has internal `console.log` output — when verbose mode streams child stdout (T3), this output becomes visible to the user. No code changes needed. |

### New Test Files

| File ID | Path | Change Summary |
|---------|------|----------------|
| FILE-08 | `scripts/setup/discover.test.js` | Add 2 tests for `verbose` field on Context (modified) |
| FILE-09 | `scripts/setup/index.test.js` | Add 1 test for verbose flag passthrough (modified) |
| FILE-10 | `scripts/setup/sync-phase.test.js` | New file — 5 tests for verbose vs non-verbose spawn behavior |

---

## 6. Testing

| ID | Description | Module Under Test | Type |
|----|-------------|-------------------|------|
| TEST-01 | Verify `verbose()` function prints dim `…` message when `enabled=true` and is silent when `enabled=false` | `ui.js` | Manual smoke test |
| TEST-02 | Verify `discover({ verbose: true })` returns context with `verbose: true` | `discover.js` | Unit test (T8) |
| TEST-03 | Verify `discover({})` returns context with `verbose: false` | `discover.js` | Unit test (T8) |
| TEST-04 | Verify `index.test.js` covers verbose flag passthrough through Context | `index.js` | Unit test (T9) |
| TEST-05 | Verify `spawnScript()` uses `stdio: 'pipe'` when verbose is `false` | `sync-phase.js` | Unit test (T10a) |
| TEST-06 | Verify `spawnScript()` uses `stdio: 'inherit'` when verbose is `true` | `sync-phase.js` | Unit test (T10b) |
| TEST-07 | Verify `AI_WORKFLOW_VERBOSE` env var is set to `'1'`/`'0'` in child process env | `sync-phase.js` | Unit test (T10a/T10b) |
| TEST-08 | Verify sync phase returns `'completed'` when both scripts succeed in verbose mode | `sync-phase.js` | Unit test (T10c) |
| TEST-09 | Verify sync phase returns `'partial'` when one script fails in verbose mode | `sync-phase.js` | Unit test (T10d) |
| TEST-10 | Verify verbose pre-spawn messages are emitted when `context.verbose` is true | `sync-phase.js` | Unit test (T10e) |
| TEST-11 | **End-to-end manual test:** Run `node bin/setup.js --verbose` in a consumer project with git + husky. Verify: discovery steps (9+ messages), hook operations, husky resolution messages, and child process output from sync.js/normalize-memory.js all appear with the dim `…` prefix. | Full pipeline | Manual integration |
| TEST-12 | **End-to-end manual test:** Run `node bin/setup.js` (without `--verbose`). Verify output is identical to pre-change behavior — no dim `…` messages appear. | Full pipeline | Manual regression |
| TEST-13 | **End-to-end manual test:** Run `node bin/setup.js --verbose --dry-run`. Verify all phases emit verbose messages but no files are modified. | Full pipeline | Manual smoke test |
| TEST-14 | **CI mode test:** Run `CI=true node bin/setup.js --verbose`. Verify husky init is skipped with verbose message, but sync phase still runs with verbose output. | Full pipeline | Manual smoke test |
| TEST-15 | Run `npx vitest run scripts/setup/` — all existing tests pass (discover: 21+2, hooks: 16, prepare: 27, index: 24+1, sync-phase: 5). Total: 96+ tests, zero failures. | All modules | Automated CI |

---

## 7. Risks & Assumptions

| ID | Description |
|----|-------------|
| RISK-01 | **`stdio: 'inherit'` may interfere with error capture.** When verbose mode uses `stdio: 'inherit'`, the child process output streams directly to the parent terminal — the `output` string collected from data events in `pipe` mode is empty. This means error reporting in `runSyncPhase()` (lines 101–108) won't have the child process output to display. **Mitigation:** The child process exit code is still captured, and the child's own stderr is still visible (it streams to the terminal). The `output` field stores `'(streamed to terminal)'` in verbose mode. Error messages are still accurate via exit codes and terminal-visible stderr. |
| RISK-02 | **sync.js `process.exit(0)` on line 83 will still exit if `.agents/` directory doesn't exist.** The early-exit path (`!existsSync(sourceAgentsDir)`) at line 81–84 causes `sync.js` to exit before any sync or verbose logging. **Mitigation:** This is existing behavior and not affected by the verbose changes. The early exit is intentional (nothing to sync). |
| RISK-03 | **`husky-init.js` already uses `createRequire` — the dynamic import may still hang if husky is broken.** Verbose logging shows "Resolving husky…" before the operation, but cannot prevent the hang itself. **Mitigation:** The log message gives the user visibility so they know *where* the hang occurs, which is a significant improvement over the current silent behavior. |
| RISK-04 | **Normal test output is cluttered by verbose messages.** The verbose messages use dim ANSI styling (`DIM = ansi('2m')`) and are indented, visually distinguishing them from normal output. In non-TTY mode, ANSI codes are stripped entirely (existing `useColor` guard). |
| RISK-05 | **sync.js per-file logging adds overhead for large directories.** Each synced file produces a console.log in verbose mode. **Mitigation:** Verbose mode is opt-in (`--verbose` flag). Normal mode has zero additional overhead. Users who sync hundreds of files with `--verbose` accept the output volume trade-off. |

| ID | Description |
|----|-------------|
| ASSUMPTION-01 | The `--verbose` flag continues to be correctly parsed by `parseCliArgs()` in `utils.js` (already tested in existing test suite). No changes to `constants.js` or `utils.js` are needed. |
| ASSUMPTION-02 | The `Context` object flows from `discover()` through all phase modules without being stripped or rebuilt. Currently, `index.js` passes the full context object to each phase. This is verified by existing tests. |
| ASSUMPTION-03 | `sync.js` and `normalize-memory.js` child processes can read environment variables set by the parent. This is standard Node.js behavior and tested by the existing child-process spawn pattern. |
| ASSUMPTION-04 | ANSI escape sequences (dim, reset) are supported by the user's terminal when TTY mode is on. The `useColor` guard in `ui.js` already handles non-TTY fallback. |
| ASSUMPTION-05 | `index.js` does not need code changes. The `discover(flags)` call builds the Context with `verbose` field, and all subsequent phase calls pass the full context. Verified by reading `index.js` lines 161–332. |

---

## 8. Related Specifications

- `docs/spike-verbose-logging.md` — Research spike with root cause analysis, code references, and output specification (284 lines)
- `plan/feature-setup-command-v1.md` — Original setup command implementation plan (251 lines)
- `plan/design-setup-command-v1.md` — Architecture design document for the setup command
- `scripts/setup/constants.js` — `SUPPORTED_FLAGS` includes `--verbose`/`-V` (lines 122–123)
- `scripts/setup/utils.js` — `parseCliArgs()` handles `--verbose`/`-V` (lines 332–335)
