# Hook Script References Fix — Tracker Documentation

Pipeline documentation for the fix that extends `sync.js` to copy runtime scripts to consumer projects, enabling `.husky` hooks and MCP configurations to resolve relative paths correctly when the package is installed as an npm dependency.

---

## Step 0: Bootstrap (implementer)

**Date:** 2026-07-24
**Status:** ✅ SUCCESS
**Pipeline:** Fix Hook Script References — implementer → researcher → implementer (planning) → coder (5 tasks T1–T5) → tracker

### Summary

Verified that `docs/.architecture-context.md` exists with real content (85 lines documenting the agent-based workflow distribution system) and all 6 `memory-bank/` core files exist with substantial project context. No bootstrapping needed — project is fully initialized.

### Files Produced / Modified

None — verification only.

### Key Decisions

- No bootstrapping required; all infrastructure layers present and documented.

### Notes / Follow-up

None.

---

## Step 1: Researcher — Investigation

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Investigated why `.husky/post-merge` and `.husky/pre-commit` hooks fail in consumer projects. The hooks reference scripts using relative paths (e.g., `node scripts/memory-cli.js update`) which resolve from the consumer project root, but the scripts live in `node_modules/@abarcenas/ai-workflow-template/scripts/`. Root cause: `sync.js` copies `.agents/`, `.opencode/`, and root files but NOT `scripts/`. Recommended approach: extend `sync.js` with a `__scripts__/` sync section.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/spike-post-merge-hook-scripts.md` | Comprehensive spike: 6 scripts inventoried (Tier 1–3), 21 codebase references analyzed, 3 alternatives evaluated, implementation checklist |

### Key Decisions

- **Extend sync.js** over absolute node_modules paths (fragile with monorepo hoisting), npx approach (startup overhead), or symlinks (Windows issues)
- **Hook content unchanged** — relative paths become valid once scripts exist at consumer root
- **6 scripts must be synced**: `memory-cli.js`, `memory-index.js`, `bump-version.js`, `validate-memory-schema.js` (Tier 1 — hooks), `mcp-memory-server.js`, `mcp/playwright-mcp-launcher.js` (Tier 2 — MCP)
- **Co-location constraint**: `memory-cli.js` imports `'./memory-index.js'` — both must be at same path in consumer's `scripts/`

### Notes / Follow-up

Not all recommendations in the spike were followed — specifically, `normalize-memory.js` is already handled by `sync-phase.js` (via `resolvePackageRoot()`) and does not need to be in the sync list.

---

## Step 2: Implementer — Planning

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Created detailed implementation plan at `plan/fix-hook-script-references-v1.md` with 5 tasks across 2 batches. Phase 1 (Batch A): core `sync.js` implementation (T1). Phase 2 (Batch B): unit tests (T2) + integration verification (T3). Phase 3 (Batch B): MCP audit (T4) + memory-bank updates (T5).

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/fix-hook-script-references-v1.md` | Implementation plan: 5 tasks, 2 batches, 6 scripts to sync, 14 test scenarios, 6 alternatives considered |

### Key Decisions

- **`__scripts__/` manifest namespace** — tracks script files under keys like `__scripts__/memory-cli.js`; no manifest version schema change needed
- **Same 3-case hash sync logic** as `.agents/` and `.opencode/` sections: new → copy, untouched → overwrite (idempotent), modified → skip
- **ESM only** — all changes in `.js` files with `"type": "module"`
- **Zero additional npm dependencies** — Node.js built-ins only (`fs`, `path`, `crypto`)
- **No changes to `constants.js`, `hooks.js`, or hook files** — paths become valid once scripts are synced

### Notes / Follow-up

Plan status updated to Completed by coder in T5.

---

## Step 3 (T1): Coder — Core sync.js Implementation

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Added a `__scripts__/` sync section (lines 174–227) to `scripts/sync.js` that copies 6 runtime scripts from the package's `scripts/` directory to the consumer's `scripts/` directory using the existing hash-based manifest system. The section mirrors the `.opencode/` sync block structure and integrates with the existing summary logging via `scriptsCopied` and `scriptsSkipped` accumulators.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/sync.js` | **Modified** — Added 54 lines (lines 174–227): `scriptsToSync` array, source/target dir resolution, 3-case hash-based sync loop with `__scripts__/<relPath>` tracked keys |

### Key Decisions

- **6 scripts synced**: `memory-cli.js`, `memory-index.js`, `bump-version.js`, `validate-memory-schema.js`, `mcp-memory-server.js`, `mcp/playwright-mcp-launcher.js`
- **`ensureParentDirectory()` already handles nested paths** — `mcp/playwright-mcp-launcher.js` subdirectory created automatically
- **Summary integration**: `scriptsCopied`/`scriptsSkipped` added to global `copied`/`added`/`skipped` totals; summary line updated automatically
- **Verbose logging**: gated by `AI_WORKFLOW_VERBOSE=1` env var, outputs to stderr with `scripts/` prefix

### Notes / Follow-up

Verified: syntax check passes, `--dry-run` shows intent for all 6 scripts, `--force` populates manifest, idempotent re-run shows 0 skipped.

---

## Step 3 (T2): Coder — Unit Tests

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Added 5 new unit tests to `scripts/sync.test.js` covering the `__scripts__/` sync behavior. Uses `child_process.spawnSync` with `INIT_CWD` pointing to temporary directories (same pattern as `sync-phase.js`), with temp dirs cleaned up in `afterAll` hook.

### Files Produced / Modified

| File | Description |
|---|---|
| `scripts/sync.test.js` | **Modified** — Added 5 new tests under `describe('__scripts__ sync behavior')` |

### Test Cases

| Test | Scenario | Assertions |
|---|---|---|
| 1 | New-file copy — scripts absent in consumer → copied | All 6 files exist in consumer's `scripts/` |
| 2 | Skip when untracked — files exist but no manifest entry | mtimes unchanged |
| 3 | `--force` overwrite — locally modified → overwritten with source | Content matches source for all 6 |
| 4 | `--dry-run` — no files written, mode in stdout | `scripts/` dir absent, stdout contains `dry-run` |
| 5 | Manifest tracking — entries written with valid hashes | All 6 `__scripts__/` keys have `^[a-f0-9]{64}$` SHA-256 |

### Key Decisions

- **`spawnSync` over direct import** — `sync.js` uses `process.exit()` preventing module import
- **Temp directory isolation** — each test gets a fresh `mkdtempSync` with `INIT_CWD`
- **7/7 tests pass** (2 existing + 5 new) in 533ms

### Notes / Follow-up

None.

---

## Step 3 (T3): Coder — Integration Verification

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Performed manual integration verification in a simulated consumer project with a Bash-based test harness (52 assertions across 10 test groups). Every major usage scenario was validated: first-run sync, idempotent re-run, locally modified preservation, `--force` overwrite, `--dry-run`, hook path resolution, syntax validation, and script execution from consumer root.

### Files Produced / Modified

None — integration verification only.

### Verification Results

| Test Group | Assertions | Outcome |
|---|---|---|
| First-run sync | 26 | ✅ All 6 scripts copied with content integrity (SHA-256 match) |
| Idempotent re-run | 7 | ✅ No warnings, manifest unchanged |
| Locally modified preservation | 3 | ✅ Consumer edits respected with clear warning |
| `--force` overwrite | 1 | ✅ Modified file restored to source |
| `--dry-run` | 4 | ✅ No files written, mode in output |
| Hook path resolution | 2 | ✅ `node scripts/memory-cli.js --help` works from consumer root |
| Post-merge hook path | 2 | ✅ `node scripts/memory-cli.js update` finds and executes |
| Syntax validation (all 6 scripts) | 6 | ✅ All pass `node -c` |
| Script execution (dependency errors) | 1 | ✅ Graceful error reporting |

### Key Decisions

- **Temp consumer project simulation** with `INIT_CWD` set to a `mkdtempSync` directory
- **SHA-256 content integrity** verified for all copied files against source
- **52/52 assertions pass** — no regressions

### Notes / Follow-up

All test groups pass. The fix is verified to work end-to-end.

---

## Step 3 (T4): Coder — MCP Configuration Audit

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Audited all 13 MCP script reference points across 7 files in the codebase. Confirmed every reference to `mcp-memory-server.js` and `playwright-mcp-launcher.js` resolves correctly after script sync. Zero path adjustments needed.

### Files Produced / Modified

None — audit only.

### Files Audited

| File | References | Status |
|---|---|---|
| `opencode.mcp.example.json` (lines 39, 59) | Playwright launcher, Memory server | ✅ Correct |
| `opencode.mcp.json` (lines 39, 59) | Playwright launcher, Memory server | ✅ Correct |
| `opencode.json` (line 56) | Memory server | ✅ Correct |
| `scripts/mcp-memory-server.js` (lines 12, 23) | Config doc comment, internal import | ✅ Correct |
| `scripts/sync.js` (lines 181–182) | Sync array references | ✅ Correct |
| `scripts/sync.test.js` (lines 56–57) | Test assertion references | ✅ Correct |
| `.agents-sync-manifest.json` | Tracked hash entries | ✅ Correct |
| `docs/playwright-mcp-configuration.md` (lines 47, 139, 163) | Documentation references | ✅ Correct |

### Key Decisions

- **All 13 references correct** — every path resolves to `{consumerRoot}/scripts/...` after `sync.js` copies the scripts
- **Two Playwright patterns by design**: The template's own `opencode.json` uses `npx @playwright/mcp@latest`, while `opencode.mcp.example.json` uses the launcher script wrapper with env var configuration (`HEADLESS`, `SLOW_MO`, `VIEWPORT`)
- **Co-location verified**: `mcp-memory-server.js` imports `'./memory-index.js'` — both in `scriptsToSync` array

### Notes / Follow-up

Optional improvement noted (out of scope): `opencode.mcp.example.json` Playwright entry could be updated to `npx @playwright/mcp@latest` to eliminate the launcher script dependency.

---

## Step 3 (T5): Coder — Memory-Bank Documentation Update

**Date:** 2026-07-24
**Status:** ✅ SUCCESS

### Summary

Updated `memory-bank/activeContext.md` and `memory-bank/progress.md` with comprehensive records of the completed fix. Marked the implementation plan as Completed. Synced memory-bank vector index.

### Files Produced / Modified

| File | Description |
|---|---|
| `memory-bank/activeContext.md` | Current Focus updated to reflect completion; Recent Changes entry added |
| `memory-bank/progress.md` | Comprehensive "Fix Hook Script References" section under Recently Completed |
| `plan/fix-hook-script-references-v1.md` | Status updated to Completed |

### Key Decisions

- All T1–T5 tasks marked complete across all 3 phases
- Memory bank vector index synced via `memory_bank_memory_update`

### Notes / Follow-up

All 5 tasks across all 3 phases are complete. The fix is fully documented.

---

## Summary

### Pipeline Overview

| Step | Agent | Status | Key Artifact |
|------|-------|--------|-------------|
| 0 | implementer | ✅ | Bootstrap verification |
| 1 | researcher | ✅ | `docs/spike-post-merge-hook-scripts.md` |
| 2 | implementer | ✅ | `plan/fix-hook-script-references-v1.md` |
| 3 (T1) | coder | ✅ | `scripts/sync.js` — `__scripts__/` sync section |
| 3 (T2) | coder | ✅ | `scripts/sync.test.js` — 5 new tests, 7/7 pass |
| 3 (T3) | coder | ✅ | Integration verification — 52/52 assertions pass |
| 3 (T4) | coder | ✅ | MCP audit — 13 references verified |
| 3 (T5) | coder | ✅ | Memory-bank documentation updates |

### Total Results

- **7/7 unit tests pass** (2 existing + 5 new)
- **52/52 integration assertions pass**
- **13/13 MCP references verified correct**
- **6 scripts now synced** to consumer projects
- **0 regressions** in existing functionality
