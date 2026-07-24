# Spike: Verbose/Debug Logging for `npx ai-workflow-setup`

**Date:** 2026-07-24  
**Status:** Research Complete  
**Researcher:** Researcher - Technical Investigation

## Research Goal

The user reports that running `npx ai-workflow-setup` shows "loading" and hangs without any output. They want to add verbose/debug notifications so the user can see what the script is doing and identify where it hangs.

## Investigation Results

### 1. Package Structure

| File | Role |
|------|------|
| `bin/setup.js` | CLI entry point (shebang → delegates to orchestrator) |
| `scripts/setup/index.js` | Orchestrator: 5-phase pipeline, arg parsing, error aggregation |
| `scripts/setup/ui.js` | 16 output functions: banner, step output, summary table, help text, ANSI colors |
| `scripts/setup/constants.js` | Static data: flags, exit codes, unicode symbols, hook definitions |
| `scripts/setup/utils.js` | 20 shared helpers: path resolution, fs wrappers, CI detection, CLI parsing |
| `scripts/setup/discover.js` | Phase 1: 9-step consumer project state detection |
| `scripts/setup/hooks.js` | Phase 2: 6-case hook merge algorithm |
| `scripts/setup/prepare.js` | Phase 3: 6-case prepare script handling |
| `scripts/setup/husky-init.js` | Phase 4: programmatic `husky()` initialization |
| `scripts/setup/sync-phase.js` | Phase 5: child process spawn for sync.js + normalize-memory.js |
| `scripts/sync.js` | Spawned by sync-phase; file sync with manifest tracking (290 lines) |
| `scripts/normalize-memory.js` | Spawned by sync-phase; memory-bank normalization (349 lines) |
| `package.json` | `"bin": { "ai-workflow-setup": "./bin/setup.js" }`, `"type": "module"` |

### 2. Current Logging Approach

**Phase-level indicators exist but are coarse:**
- `ui.js` provides `section()` (bold header), `stepSuccess()` (✓ green), `stepError()` (✗ red), `stepWarn()` (⚠ yellow)
- The orchestrator (`index.js`) calls `section('Phase N: Name')` before each phase and shows aggregate results
- Phase modules (hooks, prepare) call `stepSuccess`/`stepWarn`/`stepError` for per-hook/per-operation results

**What's missing:** Sub-step granularity. Within each phase, multiple operations happen silently.

### 3. Critical Finding: `--verbose` Flag Is Defined But Completely Unused

The `--verbose`/`-V` flag is **defined and parsed but never checked anywhere**:

- **`constants.js` line 122–123**: `'--verbose': 'verbose'`, `'-V': 'verbose'` are in `SUPPORTED_FLAGS`
- **`utils.js` `parseCliArgs()`**: Correctly parses it, setting `flags.verbose = true`
- **`index.test.js` line 116**: Test fixtures include `verbose: false` in `defaultFlags`
- **Nowhere in any module**: No code checks `flags.verbose`, `context.verbose`, or any verbose condition

This means the flag infrastructure exists but does nothing.

### 4. Silent/Hanging Spots — Ranked by Severity

#### 🔴 CRITICAL: `sync-phase.js` `spawnScript()` — Silent Output Capture (lines 136–171)

```js
// sync-phase.js, lines 136-171
function spawnScript(name, scriptPath, cwd, extraArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      cwd,
      env: { ...process.env, INIT_CWD: cwd },
      stdio: 'pipe',  // <-- ALL output captured, NEVER displayed
    })

    let output = ''
    child.stdout.on('data', (data) => { output += data.toString() })
    child.stderr.on('data', (data) => { output += data.toString() })

    child.on('close', (exitCode) => {
      resolve({
        script: name,
        success: exitCode === 0,
        exitCode: exitCode ?? -1,
        output: output.trim(),  // <-- stored but NEVER logged
      })
    })
  })
}
```

- **All stdout/stderr from child processes is captured into a string and never printed**
- `runSyncPhase()` only checks `r.success` and `r.exitCode` — the `output` field is **dead data**
- If `sync.js` or `normalize-memory.js` hangs, the user sees absolutely nothing
- **This is the most likely cause of the reported "loading... hangs" behavior**

#### 🔴 CRITICAL: `husky-init.js` — Silent Dynamic Import (lines 69–74)

```js
// husky-init.js, lines 69-74
try {
  const consumerRequire = createRequire(join(consumerRoot, 'package.json'))
  const huskyPath = consumerRequire.resolve('husky')
  const mod = await import(huskyPath)  // <-- If husky has issues, this hangs silently
  husky = mod.default
} catch {
  return { action: 'skipped', message: 'husky is not installed...' }
}
```

- No progress indication before the dynamic `import()` call
- If the consumer's husky install is broken or incompatible, the import could hang without any message

#### 🟡 HIGH: `sync.js` — File-by-File Copy Loop (lines 94–125, 133–166)

```js
// sync.js, lines 94-125
for (const sourceFile of sourceFiles) {
  // ... hash comparison, file copy ...
  // NO per-file logging. Hundreds of files copied silently.
}
// Only final summary at line 290:
console.log(`[ai-workflow-template] Synced ${copied} files...`)
```

- Zero per-file progress during the sync loop. Only a final summary at the end.
- If syncing a large `.agents/` directory, the user sees nothing until it completes

#### 🟡 HIGH: `discover.js` — Silent Detection Steps (lines 148–236)

```js
// discover.js — all 9 detection steps are individually try/caught but produce NO output
ctx.hasGit = dirExists(resolve(ctx.consumerRoot, '.git'))  // silent
ctx.hasHuskyDir = dirExists(resolve(ctx.consumerRoot, '.husky'))  // silent
// ... 7 more silent detections
```

- All 9 detection steps run silently — user can't tell what's happening or where it might be stuck

#### 🟢 LOW: `hooks.js` — Per-Hook File Operations (lines 193–257)

- File operations (`ensureDir`, `safeWriteFile`, `chmodX`) within each hook processing are not individually logged
- Only the final result per hook is output

### 5. Existing Logging Patterns — Inconsistency

| Module | Logging Pattern | Notes |
|--------|----------------|-------|
| `ui.js` | `section()`, `stepSuccess()`, `stepError()`, `stepWarn()` | Color-coded, TTY-aware, written to stdout |
| `utils.js` | `logInfo()`, `logWarn()`, `logError()` | Simple console.log/warn/error wrappers |
| `index.js` | Uses ui.js functions exclusively | Consistent |
| `hooks.js` | Uses ui.js functions | Consistent |
| `prepare.js` | Uses ui.js functions | Consistent |
| `husky-init.js` | Uses **raw `console.log`** (lines 44, 52) | **Inconsistent** — doesn't use ui.js or utils.js |
| `sync-phase.js` | Uses `logInfo`/`logWarn` from utils.js | Semi-consistent |
| `sync.js` | `console.warn` + final `console.log` | Own pattern, output captured by parent |
| `normalize-memory.js` | `console.log`/`console.warn` throughout | Good internal logging, but captured by parent |

**No shared debug/verbose utility exists.** Each module would need its own verbose logic.

### 6. `npx` Behavior

- Standard `npx ai-workflow-setup` resolves to `bin/setup.js` via `package.json` `bin` field
- `npx` sets `INIT_CWD` environment variable (handled in `getConsumerRoot()`)
- No output suppression from npx itself — the silence comes from the scripts, not the runner

## Recommendations

### Recommended Approach: `--verbose` Flag + Contextual Output

Use the existing (but unused) `--verbose` flag infrastructure. No new dependencies needed — everything can be built with existing `ui.js` patterns.

#### 1. Add `verbose()` function to `ui.js`

```js
export function verbose(enabled, message) {
  if (enabled) {
    write(` ${DIM}… ${message}${RST}`)
  }
}
```

#### 2. Pass verbose through context

- `discover.js` already receives `flags` object — add `verbose: !!flags.verbose` to Context
- `index.js` passes context to all phases — each phase can check `context.verbose`

#### 3. Critical Fixes (in priority order)

| Priority | File | Change |
|----------|------|--------|
| **P0** | `sync-phase.js` `spawnScript()` | When `verbose`, pipe child stdout/stderr to parent in real-time (use `stdio: 'inherit'` for verbose, `'pipe'` for normal). Or add a prefix stream. |
| **P0** | `sync-phase.js` `runSyncPhase()` | Log "Running sync.js..." and "Running normalize-memory.js..." before each spawn in verbose mode |
| **P1** | `husky-init.js` | Log "Resolving husky from consumer's node_modules..." before `createRequire.resolve()` and "Initializing husky..." before `husky()` call in verbose mode |
| **P1** | `discover.js` | Log each detection step: "Checking for .git directory...", "Reading package.json...", "Detecting existing hooks...", "Checking CI environment..." |
| **P2** | `hooks.js` | Log per-hook operations: "Creating .husky/ directory...", "Writing pre-commit hook...", "Setting executable permissions..." |
| **P2** | `sync.js` | Add per-file logging when verbose: "Syncing .agents/skills/git-commit/SKILL.md..." — but this requires passing verbose flag to child process |

#### 4. Verbose Output Specification

```
$ npx ai-workflow-setup --verbose

  @abarcenas/ai-workflow-template v1.32.0 — Setup
  
Phase 1: Discovery
  … Resolving consumer root from INIT_CWD...
  … Checking for .git directory... ✓ found
  … Checking for .husky/ directory... ✓ found  
  … Reading package.json... ✓ found
  … Detecting existing hooks...
  …   pre-commit: not found
  …   post-merge: not found
  … Extracting prepare script... ✓ "husky"
  … Detecting CI environment... not CI
  … Detecting Node.js version... v22
✓ Git repository found at /path/to/project

Phase 2: Hooks
  … Processing pre-commit hook...
  …   Writing /path/to/project/.husky/pre-commit...
  …   Setting executable permissions...
✓ pre-commit hook created (✓ Auto-bump version...)
  … Processing post-merge hook...
  …   Writing /path/to/project/.husky/post-merge...
  …   Setting executable permissions...
✓ post-merge hook created (✓ Auto-update memory bank...)

Phase 3: Prepare
  … Checking package.json scripts.prepare...
✓ Prepare script already includes husky

Phase 4: Husky Init
  … Resolving husky from consumer's node_modules...
  … Found husky at /path/to/project/node_modules/husky
  … Calling husky()...
  … Verifying .husky/_/h exists...
✓ Husky initialized successfully

Phase 5: Sync
  … Spawning sync.js...
[sync.js] Synced 42 files (12 new), scaffolded 0 files, skipped 0 modified files. Mode: safe.
  … sync.js completed (exit 0)
  … Spawning normalize-memory.js...
[normalize-memory] Mode: normal
[normalize-memory] Found 6 memory-bank files
[normalize-memory] Created .normalized marker
[normalize-memory] Done.
  … normalize-memory.js completed (exit 0)
✓ Sync phase completed
```

#### 5. `--debug` Flag (Optional Enhancement)

For even more granular output (file hashes, raw command outputs, stack traces):
- Add `'--debug': 'debug'` to `SUPPORTED_FLAGS` in `constants.js`
- `--debug` implies `--verbose` plus extra detail (file hashes, raw JSON, error stacks)
- This can be a follow-up — not needed for initial fix

#### 6. No New Dependencies

All improvements use Node.js built-ins:
- `process.stdout.write` for streaming
- Existing `ui.js` color/format patterns
- Existing `utils.js` logging wrappers
- `--verbose` flag already parsed by `parseCliArgs()`

## Files Requiring Modification

| File | Changes |
|------|---------|
| `scripts/setup/ui.js` | Add `verbose()` export function |
| `scripts/setup/discover.js` | Add verbose logging for each detection step; pass `verbose` into Context |
| `scripts/setup/index.js` | Pass `verbose` flag through Context to all phases |
| `scripts/setup/hooks.js` | Add verbose logging for per-hook file operations |
| `scripts/setup/husky-init.js` | Add verbose logging around dynamic import; use ui.js instead of raw console.log |
| `scripts/setup/sync-phase.js` | **Critical**: Stream child stdout/stderr when verbose; add pre-spawn messages |
| `scripts/setup/utils.js` | Pass verbose flag to child processes via environment (for sync.js/normalize-memory.js) |

## Test Impact

- `scripts/setup/index.test.js`: Add test for `--verbose` flag passing through context and to all phases
- `scripts/setup/discover.test.js`: Add test verifying `verbose` field on Context
- `scripts/setup/sync-phase.test.js`: Test verbose vs non-verbose spawn behavior

## External Resources

- None — all research was codebase analysis of the existing package

## Decision Trail

1. **Initial finding**: `--verbose` flag is defined in constants and parsed but never checked anywhere
2. **Root cause identification**: `sync-phase.js` `spawnScript()` captures child process output silently — most likely cause of "loading... hangs"
3. **Approach decision**: Use existing `--verbose` flag infrastructure rather than adding new dependencies (spinner libraries, debug package) — keeps the package zero-dependency for CLI tooling
4. **Scope**: Start with P0 (sync-phase output streaming) and P1 (discover/husky-init verbose messages), as these provide the most value for debugging hangs
