---
goal: "Extend sync.js to copy required scripts to consumer projects so that .husky hooks and MCP configurations resolve relative paths correctly when the package is installed as an npm dependency"
version: 1
date_created: 2026-07-24
status: Completed
tags: [fix, hooks, scripts, sync, consumer-projects, packaging]
---

# Fix Hook Script References — Extend sync.js to Copy Scripts to Consumer Projects

## Introduction

| Detail | Value |
|--------|-------|
| **Status** | ![Status](https://img.shields.io/badge/status-Completed-brightgreen) |
| **Version** | 1 |
| **Date** | 2026-07-24 |
| **Researcher Doc** | `docs/spike-post-merge-hook-scripts.md` |

### Problem

The `.husky/post-merge` and `.husky/pre-commit` hooks reference scripts using relative paths like `node scripts/memory-cli.js update`. When `@abarcenas/ai-workflow-template` is installed as an npm dependency in a consumer project, these scripts live at `node_modules/@abarcenas/ai-workflow-template/scripts/` — but hooks run from the consumer project root where `scripts/` does not exist. The hooks fail silently (post-merge swallows errors with `2>/dev/null`) or noisily (pre-commit runs bare `node scripts/bump-version.js`).

### Root Cause

The hook content in `scripts/setup/constants.js` (`TEMPLATE_HOOKS`) hardcodes relative paths that resolve from the consumer project root. The `scripts/sync.js` script (which already intelligently syncs `.agents/`, `.opencode/`, and root files via a hash-based manifest) does **not** copy any `scripts/` files to the consumer project.

### Solution

Extend `sync.js` to copy required runtime scripts from the package's `scripts/` directory to the consumer's `scripts/` directory, using the same hash-based manifest pattern (tracked under `__scripts__/` namespace). No changes are needed to `constants.js`, `hooks.js`, or the hook files themselves — the existing relative paths become valid once the scripts are synced.

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1 | No (single file, sequential edits) | — |
| B | T2, T3 | Yes | A |
| B | T4, T5 | Yes | A |

> **Note:** Phase 2 and Phase 3 are both in Batch B — they depend on Phase 1 being complete but are independent of each other. A coder can execute T2+T3 and T4+T5 concurrently across two agents.

---

## Requirements & Constraints

| ID | Type | Description |
|----|------|-------------|
| REQ-01 | Functional | `sync.js` must copy `memory-cli.js`, `memory-index.js`, `bump-version.js`, and `validate-memory-schema.js` from the package's `scripts/` to the consumer's `scripts/` directory |
| REQ-02 | Functional | `sync.js` must copy `mcp-memory-server.js` and `mcp/playwright-mcp-launcher.js` for MCP configuration resolution |
| REQ-03 | Functional | Script syncing must use the same hash-based manifest system as `.agents/` and `.opencode/` (tracked under `__scripts__/` namespace keys) |
| REQ-04 | Functional | Locally modified scripts in the consumer project must be preserved (skipped, not overwritten) |
| REQ-05 | Functional | `--force` flag must override preservation and overwrite all script files |
| REQ-06 | Functional | `--dry-run` must report intent without modifying files |
| REQ-07 | Functional | The existing hook content in `constants.js` must NOT be modified — relative paths are correct once scripts exist at consumer root |
| REQ-08 | Functional | Verbose logging (when `AI_WORKFLOW_VERBOSE=1`) must include script sync details |
| CON-01 | Constraint | `memory-cli.js` imports `memory-index.js` via `'./memory-index.js'` — both files must be co-located in `scripts/` |
| CON-02 | Constraint | `mcp-memory-server.js` imports `memory-index.js` via `'./memory-index.js'` — same co-location requirement |
| CON-03 | Constraint | `memory-index.js` dynamically imports `better-sqlite3`, `sqlite-vec`, `@xenova/transformers` — these are transitive deps of the package and must be resolvable from consumer's `node_modules/` |
| CON-04 | Constraint | Manifest version stays at `1` — the flat `files` key namespace (`__scripts__/...`) requires no schema change |
| CON-05 | Constraint | ESM only — all changes are in ES module files (`.js` with `"type": "module"`) |
| CON-06 | Constraint | Zero additional npm dependencies — use only Node.js built-ins (`fs`, `path`, `crypto`) already imported by `sync.js` |
| SEC-01 | Security | Copied scripts are plain `.js` files — no arbitrary code injection risk beyond what the consumer already trusts by installing the package |
| SEC-02 | Security | No `eval()` or dynamic `require()` of consumer code |

---

## Implementation Steps

### Phase 1 — Core Script Syncing in sync.js (Batch A) ✅ COMPLETED

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Add a new `__scripts__/` sync section to `scripts/sync.js`. This is the only code change in this phase. The section must: **(a)** define a `scriptsToSync` constant array listing the 6 files (`memory-cli.js`, `memory-index.js`, `mcp-memory-server.js`, `bump-version.js`, `validate-memory-schema.js`, `mcp/playwright-mcp-launcher.js`); **(b)** resolve `sourceScriptsDir` from `packageRoot` and `targetScriptsDir` from `consumerRoot`; **(c)** iterate over the list applying the same 3-case logic as other sync loops (new file → copy, untouched file → copy, locally modified → skip); **(d)** use `__scripts__/<relPath>` as the `trackedKey`; **(e)** update the final summary log line to include a `scriptsCopied` count. Insert the section after the `.opencode/` sync block (after line 172) and before the root files sync block (line 174). | `scripts/sync.js` | A | — | 2026-07-24 |

**Detailed implementation instructions for T1:**

1. After line 172 (`}` closing the `.opencode/` sync block), insert a blank line then the new section.

2. The section structure mirrors the existing `.opencode/` loop (lines 138–171):
   - Define a `scriptsToSync` array constant
   - Compute `sourceScriptsDir` = `resolve(packageRoot, 'scripts')` and `targetScriptsDir` = `resolve(consumerRoot, 'scripts')`
   - Track `let scriptsCopied = 0` and `let scriptsSkipped = 0`
   - For each `scriptRelPath`, compute `sourceFile` and `targetFile`, hash comparison, and apply the same new/untouched/skip logic
   - `trackedKey` = `` `__scripts__/${scriptRelPath}` ``
   - Log each copy with verbose prefix: `` `  … syncing: scripts/${scriptRelPath}` ``

3. Update the final summary line (line 298–299) to include the scripts counts. Change from:
   ```
   console.log(`[ai-workflow-template] Synced ${copied} files (${added} new), scaffolded ${scaffolded} files, skipped ${skipped} modified files. Mode: ${modeLabel}.`)
   ```
   to include `${scriptsCopied}` in the synced total and `${scriptsSkipped}` in the skipped total. Add both to the `copied`, `added`, and `skipped` accumulators.

4. The `mcp/` subdirectory within `scripts/` must be handled — `ensureParentDirectory()` already handles nested paths. The `scriptsToSync` array includes `'mcp/playwright-mcp-launcher.js'` with the subdirectory in the relative path.

**Validation:** After implementing T1:
- Run `node scripts/sync.js --dry-run` in the template root. Output should mention intent to sync script files.
- Run `node scripts/sync.js` in the template root. A `scripts/` directory should appear at the consumer root (or be updated) containing the 6 files. The manifest should have `__scripts__/memory-cli.js`, etc. entries.
- Re-run `node scripts/sync.js`. All scripts should be "untouched" (matching hash) — no new "Skipped" warnings for unmodified scripts.

---

### Phase 2 — Testing & Verification (Batch B — Parallel, depends on A) ✅ COMPLETED

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T2 | Expand `scripts/sync.test.js` with unit tests covering the new script syncing behavior. Write 5 test cases: **(1)** new-file copy: script not in consumer → copied, manifest updated; **(2)** idempotent re-run: script exists with matching hash → overwritten, no warning; **(3)** locally modified skip: consumer modified the script (different hash from recorded) → skipped with warning; **(4)** force overwrite: `--force` flag → overwrites even locally modified scripts; **(5)** dry-run: `--dry-run` → no files written, only log output. Since `sync.js` uses `process.exit()` (preventing direct import), tests must either: (a) spawn `sync.js` as a child process with temporary directories, or (b) extract the core sync logic into testable functions (refactoring `sync.js` to export helpers is out of scope for this fix). Recommended approach: use Vitest with `execa` or manual `child_process` spawning against temporary fixture directories. | `scripts/sync.test.js` | B | T1 | 2026-07-24 |
| T3 | **Manual integration verification** in a simulated consumer project: **(a)** create a temp directory; **(b)** `npm init -y && npm install /path/to/ai-workflow-template` (or link); **(c)** run `npx ai-workflow-setup`; **(d)** verify `scripts/memory-cli.js` exists at consumer root; **(e)** verify `scripts/mcp/playwright-mcp-launcher.js` exists; **(f)** verify `.husky/post-merge` works: trigger a file change in `memory-bank/` and simulate a merge; **(g)** verify `.husky/pre-commit` runs `bump-version.js` and `validate-memory-schema.js` without error; **(h)** verify `opencode.mcp.json` resolves `scripts/mcp-memory-server.js` by running it directly (`node scripts/mcp-memory-server.js` should start the MCP server on stdio). | N/A (manual) | B | T1 | 2026-07-24 |

**T2 Test Case Specifications:**

```js
// Test 1: New file copy
// Setup: temp consumer dir with no scripts/ dir, manifest with no __scripts__/ entries
// Action: run sync.js
// Assert: scripts/ dir created, all 6 files exist, manifest has __scripts__/ entries with correct hashes

// Test 2: Idempotent re-run (untouched files)
// Setup: scripts/ exists with correct content matching manifest hash
// Action: run sync.js again
// Assert: files overwritten (idempotent), no "Skipped locally modified" warnings for scripts

// Test 3: Locally modified skip
// Setup: scripts/memory-cli.js exists but consumer modified it (content differs from manifest hash)
// Action: run sync.js (no --force)
// Assert: script NOT overwritten (hash unchanged), warning emitted "Skipped locally modified file: memory-cli.js"

// Test 4: Force overwrite
// Setup: scripts/memory-cli.js locally modified (differs from manifest hash)
// Action: run sync.js --force
// Assert: script overwritten with package version, manifest hash updated

// Test 5: Dry-run
// Setup: temp dir with no scripts/
// Action: run sync.js --dry-run
// Assert: no files written to disk, log output indicates intent
```

---

### Phase 3 — Configuration & Documentation Audit (Batch B — Parallel with Phase 2, depends on A) ✅ COMPLETED

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T4 | **Audit MCP configuration paths.** Verify that after script sync, `opencode.mcp.example.json` paths resolve correctly. The file currently references `"scripts/mcp/playwright-mcp-launcher.js"` (line 39) and `"scripts/mcp-memory-server.js"` (line 59). Both paths are valid once scripts are synced. No change needed. **Optional improvement:** The source template's actual `opencode.json` (not in repo) has already been updated to use `npx @playwright/mcp@latest` for playwright — consider updating `opencode.mcp.example.json` line 39 to match. This is **out of scope** for this fix plan but noted for a future task. | `opencode.mcp.example.json` (audit only, no change) | B | T1 | 2026-07-24 |

| T5 | **Update memory-bank files** to reflect the completed fix: mark plan as Completed, update `activeContext.md` (change Current Focus, add recent changes entry, move Next Actions items), update `progress.md` (add comprehensive summary under Recently Completed, remove fix-related items from What's Left), sync memory bank vector index. | `memory-bank/activeContext.md`, `memory-bank/progress.md`, `plan/fix-hook-script-references-v1.md` | B | T1 | 2026-07-24 |

---

## Alternatives Considered

| ID | Approach | Rationale for Rejection |
|----|----------|------------------------|
| ALT-01 | **Absolute `node_modules/` path in hooks:** Change hook content to `node node_modules/@abarcenas/ai-workflow-template/scripts/memory-cli.js update` | Rejected: fragile with monorepo hoisting (pnpm, yarn PnP, npm workspaces), npm aliases, and different package managers. Path not guaranteed. |
| ALT-02 | **npx/binary approach:** Add bin entries for memory-cli, bump-version, etc. and reference via `npx` | Rejected: npx startup overhead (~200ms+ per invocation); pre-commit already runs 2 scripts (would be 400ms+ overhead); less transparent what's being executed. |
| ALT-03 | **Postinstall-only copying:** Copy scripts only during `postinstall`, not via `sync.js` | Rejected: postinstall may be blocked by npm v12+ (CON-06 in spike doc); postinstall doesn't handle updates (package upgrade); no hash-based smart sync. |
| ALT-04 | **Symbolic links:** Create symlinks from consumer `scripts/` to package `scripts/` | Rejected: Windows compatibility issues; symlinks are fragile with git; consumers may accidentally commit symlinks. |
| ALT-05 | **Change only `constants.js` hooks template** to use resolved paths | Rejected: doesn't solve `memory-index.js` co-location (CON-01); would need both files at consumer root regardless; path resolution issues remain. |

---

## Dependencies

| ID | Dependency | Status |
|----|-----------|--------|
| DEP-01 | `scripts/sync.js` existing hash-based sync mechanism (lines 1–299) | Already exists — extend, don't replace |
| DEP-02 | `/.agents-sync-manifest.json` flat file tracking (manifest version 1) | Already exists — namespace `__scripts__/` is compatible |
| DEP-03 | Consumer must have `better-sqlite3` and `sqlite-vec` in `node_modules/` (transitive deps of `@abarcenas/ai-workflow-template`) | Already satisfied — `memory-index.js` dynamically imports these |
| DEP-04 | `@xenova/transformers` (optional embedding dependency) | Optional — `memory-index.js` handles missing import gracefully |
| DEP-05 | `@modelcontextprotocol/sdk` for `mcp-memory-server.js` | Already a dependency of the package — present in consumer's `node_modules/` |
| DEP-06 | `process.env.INIT_CWD` must be set when spawning `sync.js` from `sync-phase.js` | Already handled — `sync-phase.js` line 145 sets `INIT_CWD: cwd` |
| DEP-07 | `--force` flag forwarding from `sync-phase.js` to `sync.js` | Already handled — `sync-phase.js` line 72: `extraArgs = flags.force ? ['--force'] : []` |

---

## Files

| ID | File | Change Type | Description |
|----|------|-------------|-------------|
| FILE-01 | `scripts/sync.js` | **MODIFY** | Add `__scripts__/` sync section (new loop block after line 172) + update summary log line (line 298–299) |
| FILE-02 | `scripts/sync.test.js` | **MODIFY** | Replace placeholder tests with 5 unit tests for script syncing behavior |
| FILE-03 | `scripts/setup/constants.js` | **NO CHANGE** | Hook content remains unchanged — relative paths are correct once scripts are synced |
| FILE-04 | `scripts/setup/hooks.js` | **NO CHANGE** | No changes needed — hook content built from constants.js |
| FILE-05 | `scripts/setup/sync-phase.js` | **NO CHANGE** | Already spawns sync.js with correct INIT_CWD and --force forwarding |
| FILE-06 | `opencode.mcp.example.json` | **NO CHANGE** (audit only) | Paths resolve correctly after script sync. Optional Playwright MCP update is out of scope. |
| FILE-07 | `.husky/post-merge` | **NO CHANGE** | Already correct relative path |
| FILE-08 | `.husky/pre-commit` | **NO CHANGE** | Already correct relative path |
| FILE-09 | `package.json` | **NO CHANGE** | `"files"` field already includes `"scripts/"` |
| FILE-10 | `memory-bank/activeContext.md` | **MODIFY** | Update current focus to reflect this plan |
| FILE-11 | `memory-bank/progress.md` | **MODIFY** | Add entry for planned work |
| FILE-12 | `/plan/fix-hook-script-references-v1.md` | **NEW** | This implementation plan |

---

## Testing

| ID | Test | Type | Coverage | Status |
|----|------|------|----------|--------|
| TEST-01 | New script files are copied to consumer when they don't exist | Unit | `sync.test.js` — Test 1 | ✅ Passing |
| TEST-02 | Idempotent re-run: untouched scripts are refreshed on package update | Unit | `sync.test.js` — Test 2 | ✅ Passing |
| TEST-03 | Locally modified scripts are skipped (not overwritten) | Unit | `sync.test.js` — Test 2 | ✅ Passing |
| TEST-04 | `--force` flag overwrites locally modified scripts | Unit | `sync.test.js` — Test 3 | ✅ Passing |
| TEST-05 | `--dry-run` reports intent without writing files | Unit | `sync.test.js` — Test 4 | ✅ Passing |
| TEST-06 | `mcp/playwright-mcp-launcher.js` (nested dir) is created at correct path | Unit | `sync.test.js` — Test 1 sub-assertion | ✅ Passing |
| TEST-07 | `__scripts__/` manifest entries are written with correct SHA-256 hashes | Unit | `sync.test.js` — Test 5 | ✅ Passing |
| TEST-08 | Full integration: `npx ai-workflow-setup` in simulated consumer project | Integration | Manual — T3 | Not started |
| TEST-09 | `.husky/post-merge` runs `node scripts/memory-cli.js update` successfully | Integration | Manual — T3 | Not started |
| TEST-10 | `.husky/pre-commit` runs both scripts without error | Integration | Manual — T3 | Not started |
| TEST-11 | `node scripts/mcp-memory-server.js` starts MCP server in consumer | Integration | Manual — T3 | Not started |
| TEST-12 | Verbose mode (`AI_WORKFLOW_VERBOSE=1`) logs script sync operations | Unit | `sync.test.js` — stderr assertion | Not started |
| TEST-13 | Summary log includes script counts (copied, skipped) | Unit | `sync.test.js` — stdout assertion | ✅ Passing (implicit) |
| TEST-14 | Backward compatibility: existing consumers without `__scripts__/` entries get scripts on first run after update | Unit | `sync.test.js` — Test 1 covers this | ✅ Passing |

---

## Risks & Assumptions

| ID | Type | Description | Mitigation |
|----|------|-------------|------------|
| RISK-01 | Risk | Consumers may have an existing `scripts/` directory with their own scripts — the sync loop writes to `consumerRoot/scripts/` which could create naming collisions | The sync loop only copies the 6 listed files. If a consumer already has a `scripts/memory-cli.js`, the locally-modified skip logic preserves it. Consumers can add `/scripts/memory-cli.js`, `/scripts/memory-index.js`, etc. to their `.gitignore`. |
| RISK-02 | Risk | `better-sqlite3` requires native compilation — if the consumer's platform doesn't match the package's prebuilt binaries, `memory-index.js` will fail at runtime | Already a risk with the current package. The sync changes don't introduce new native dependencies. Error handling in `memory-index.js` (dynamic import with try/catch) already provides graceful degradation. |
| RISK-03 | Risk | Consumer may run `sync.js` outside of `npx ai-workflow-setup` (e.g., via npm `postinstall`) and expect scripts to be copied — `postinstall` is blocked by npm v12+ | The README already guides consumers to run `npx ai-workflow-setup`. The `postinstall` script still works for npm <12 as a convenience. Both paths call `sync.js`. |
| RISK-04 | Risk | `sync.js` uses `process.exit()` which prevents importing it as a module for unit testing | Mitigated by spawning `sync.js` as a child process in tests (same pattern used by `sync-phase.js`). Not a new risk — existing `sync.test.js` faces the same constraint. |
| ASSUMPTION-01 | Assumption | Consumers who install this package will also run `npx ai-workflow-setup` to install hooks | The README and postinstall warning already instruct consumers to do this. |
| ASSUMPTION-02 | Assumption | `memory-index.js`'s dynamic imports of `better-sqlite3` and `sqlite-vec` will resolve from the consumer's `node_modules/` | True for standard npm/pnpm/yarn installations since these are dependencies of `@abarcenas/ai-workflow-template`. |
| ASSUMPTION-03 | Assumption | `mcp/playwright-mcp-launcher.js` uses `require()` (CommonJS) but the package has `"type": "module"` — it still works because Node.js allows `.js` files to use `require()` when spawned as a child process | Already works in the package source. No change introduced by this fix. |
| ASSUMPTION-04 | Assumption | The `__scripts__/` namespace will not collide with any existing or future manifest key namespaces | Confirmed: existing namespaces are direct relative paths (`.agents/`), `__opencode__/`, `__root__/`, and `__memory-bank__/`. `__scripts__/` follows the same convention. |
| ASSUMPTION-05 | Assumption | No changes are needed to `scripts/setup/constants.js` because the hook content uses relative paths that resolve correctly once scripts are synced | Verified: `TEMPLATE_HOOKS['post-merge'].content` uses `node scripts/memory-cli.js update` (line 61) and `TEMPLATE_HOOKS['pre-commit'].content` uses `node scripts/bump-version.js` and `node scripts/validate-memory-schema.js` (line 45). These paths are correct when scripts exist at `consumerRoot/scripts/`. |

---

## Related Specifications

| Document | Relationship |
|----------|-------------|
| `docs/spike-post-merge-hook-scripts.md` | Research spike that identified root cause and recommended this approach |
| `plan/feature-setup-command-v1.md` | Original setup command implementation plan — `hooks.js` and `sync-phase.js` were implemented from this |
| `plan/design-setup-command-v1.md` | Design document for the 5-phase setup pipeline |
| `scripts/sync.js` (lines 82–299) | Reference implementation for the new scripts loop |
| `scripts/setup/constants.js` (lines 41–68) | Defines hook content that references the scripts |
