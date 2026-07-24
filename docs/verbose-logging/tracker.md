# Verbose Logging — Tracker Documentation

Pipeline documentation for the verbose logging feature (`npx ai-workflow-setup --verbose`).

---

## Step 1: Researcher — Technical Investigation

**Date:** 2026-07-24
**Status:** ✅ SUCCESS
**Pipeline:** Feature Pipeline — verbose-logging

### Summary

Investigated the `npx ai-workflow-setup` codebase to identify why the command shows "loading" and hangs without output. Discovered that the `--verbose` flag was defined in `constants.js` and parsed by `parseCliArgs()` but was never checked anywhere — dead flag infrastructure. Root cause of silent hangs traced to `sync-phase.js` `spawnScript()` which captures child process stdout/stderr into a string that is never displayed.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/spike-verbose-logging.md` | Full spike document: 7 files identified for changes, ranked P0–P2, with code references and output specification |

### Key Decisions

- Use existing `--verbose` flag infrastructure rather than adding new dependencies (spinner libraries, debug package) — keeps the package zero-dependency for CLI tooling
- Start with P0 (sync-phase output streaming) and P1 (discover/husky-init verbose messages), as these provide the most value for debugging hangs
- `normalize-memory.js` already has good internal logging — when verbose mode streams child stdout, this output becomes visible to the user for free

### Notes / Follow-up

The spike revealed 7 files requiring modification, ranked by severity. Full analysis at `docs/spike-verbose-logging.md`.

---

## Step 2: Implementer — Planning

**Date:** 2026-07-24
**Status:** ✅ SUCCESS
**Pipeline:** Feature Pipeline — verbose-logging

### Summary

Created a detailed implementation plan for activating the dormant `--verbose` flag. 10 tasks across 4 parallel batches (A: foundation, B: core fixes, C: child process, D: tests). Key insight: `index.js` needs ZERO changes because the Context `verbose` field flows automatically from `discover(flags)` through all subsequent phase modules.

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/feature-verbose-logging-v1.md` | Implementation plan: 10 tasks, 4 batches, 15 test scenarios, 5 risks, 5 assumptions |

### Key Decisions

- **4 parallel batches**: A (foundation: ui.js + discover.js Context), B (core fixes: sync-phase, husky-init, discover logging, hooks), C (sync.js child process), D (tests)
- **Zero new npm dependencies**: All changes use Node.js built-ins only — matches the existing package design principle
- **Child process env var pattern**: `sync.js` receives verbose flag via `AI_WORKFLOW_VERBOSE=1` env var set by `sync-phase.js` — no shared state between parent and child
- **`console.error` for child verbose output**: stdout is captured for result parsing; stderr streams to terminal in `stdio: 'inherit'` mode

### Notes / Follow-up

The plan document includes a notable observation: `index.js` requires NO code changes because the existing Context object already passes through all phases. This was verified by reading `index.js` lines 161–332.

---

## Step 3: Coder — Implementation

**Date:** 2026-07-24
**Status:** ✅ SUCCESS
**Pipeline:** Feature Pipeline — verbose-logging

### Summary

Implemented all 10 tasks across 4 parallel batches. Activated the dormant `--verbose` flag by adding a `verbose()` function to `ui.js`, wiring it into the Context object, streaming child process output in real-time (fixing the root cause of silent hangs), and adding step-by-step progress logging across all 5 setup phases. 96 tests passing, 0 failures.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/setup/ui.js` | Added `verbose(enabled, message)` export — dim ANSI output to stderr, no-op when disabled |
| `scripts/setup/discover.js` | Added `verbose: !!flags.verbose` to Context + 9 detection step log calls |
| `scripts/setup/sync-phase.js` | **Root cause fix**: `spawnScript()` streams child output in real-time when verbose (`stdio: 'inherit'`); passes `AI_WORKFLOW_VERBOSE` env var |
| `scripts/setup/husky-init.js` | 8 verbose messages around husky resolution, init, and error paths; replaced raw `console.log` with ui.js functions |
| `scripts/setup/hooks.js` | 18 verbose calls across all 5 merge cases (ensureDir, writeFile, chmod) |
| `scripts/sync.js` | 8 per-file verbose messages gated by `AI_WORKFLOW_VERBOSE=1` env var via `console.error` |
| `scripts/setup/discover.test.js` | +2 tests (verbose=true, verbose=undefined) |
| `scripts/setup/index.test.js` | +1 test (verbose flag passthrough through full pipeline) |
| `scripts/setup/sync-phase.test.js` | **NEW** — 5 tests for stdio modes, env vars, and output capture behavior |

### Key Decisions

- **`stdio: 'inherit'` for verbose, `'pipe'` for normal**: In verbose mode, child process output streams directly to terminal in real-time. In normal mode, existing capture behavior is preserved exactly.
- **`console.error` for sync.js verbose output**: Child process stdout is captured by the parent for result parsing; stderr streams to terminal in `stdio: 'inherit'` mode — the correct channel for diagnostic messages.
- **Env var passthrough**: `sync.js` reads `AI_WORKFLOW_VERBOSE` from `process.env` — the only communication channel between parent and child processes (no shared context object).
- **Parallel batch execution**: 4 batches executed sequentially; tasks within each batch ran independently. Batch A (T1, T2) → Batch B (T3–T6) → Batch C (T7) → Batch D (T8–T10). 0 collisions, clean interface boundaries.

### Notes / Follow-up

- 96 tests pass (91 existing + 5 new) across 5 test files with 0 failures
- The `--verbose` flag was dead code infrastructure that existed from the original setup command implementation — good reminder to check for existing-but-unused infrastructure before building new
- `normalize-memory.js` already has good internal logging — it benefits from verbose output streaming without any code changes
- Manual integration test: `node bin/setup.js --verbose` should show real-time discovery steps, hook operations, husky resolution, and child process output
