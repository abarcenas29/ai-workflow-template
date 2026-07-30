---
goal: "Rename opencode MCP configuration from opencode.mcp.example.json / opencode.mcp.json to opencode.mcp"
version: 1
date_created: 2026-07-30
status: Planned
tags: [config, mcp, opencode, rename, sync, gitignore]
---

# Plan: Rename opencode MCP Config to `opencode.mcp`

> **⚠️ Corrected Plan Note (2026-07-30):** The original plan proposed `git mv opencode.mcp.example.json → opencode.mcp`. This was rejected. Instead: keep `opencode.mcp.example.json` as-is in the repo, delete `opencode.mcp.json`, and update sync script to copy `opencode.mcp.example.json` → `opencode.json` (consumer target). Documentation references updated to `opencode.mcp`. See coder implementation output.

## Introduction

> **Status:** Completed (deviated from original plan — see Corrected Plan note above)

This plan covers renaming the MCP configuration file from the current dual-file pattern (`opencode.mcp.example.json` template + `opencode.mcp.json` live) to a single `opencode.mcp` file (no extension, no `.example` distinction). The template and live files are currently byte-for-byte identical, so there is no loss of fidelity — one file serves both purposes.

**Motivation:** The `.example.json` naming is unnecessarily verbose. OpenCode natively recognizes `opencode.mcp` as the MCP config file. A single tracked file simplifies the sync pipeline and eliminates the auto-copy step that creates an untracked clone.

**Scope:**
- Rename the template file in the repo
- Delete the untracked live file
- Update the sync script (remove now-redundant auto-copy block, update root file array)
- Update npm packaging and gitignore
- Update documentation references

---

## Requirements & Constraints

### Requirements

| ID | Requirement |
|----|-------------|
| REQ-01 | The MCP config file shall be named `opencode.mcp` at the repo root |
| REQ-02 | `opencode.mcp.example.json` shall no longer exist on disk |
| REQ-03 | `opencode.mcp.json` shall be deleted from disk (untracked, gitignored) |
| REQ-04 | `scripts/sync.js` shall sync `opencode.mcp` as a root file to consumers |
| REQ-05 | The auto-copy block in `scripts/sync.js` shall be removed (no longer needed) |
| REQ-06 | `.gitignore` shall no longer reference `opencode.mcp.json` |
| REQ-07 | `package.json` `files` array shall include `"opencode.mcp"` instead of `"opencode.mcp.example.json"` |
| REQ-08 | `npm pack --dry-run` shall list `opencode.mcp` in the tarball |
| REQ-09 | `README.md` MCP Tooling section shall reference `opencode.mcp` |
| REQ-10 | `docs/playwright-mcp-configuration.md` shall reference `opencode.mcp` |
| REQ-11 | `memory-bank/activeContext.md` and `memory-bank/progress.md` shall be updated |
| REQ-12 | The `.agents-sync-manifest.json` entries shall auto-correct on next sync run |
| REQ-13 | All existing sync tests (`scripts/sync.test.js`) shall continue passing |

### Constraints

| ID | Constraint |
|----|------------|
| CON-01 | The new `opencode.mcp` file shall have identical content to the current `opencode.mcp.example.json` |
| CON-02 | `opencode.mcp` shall be git-tracked (not gitignored) |
| CON-03 | No new npm dependencies shall be introduced |
| CON-04 | No changes to `scripts/setup/` modules are needed — the setup pipeline delegates to sync.js |
| CON-05 | Consumers who have already run setup will have `opencode.mcp.json` — this file becomes orphaned. The next sync will place `opencode.mcp` without touching the old file |

### Edge Cases

| ID | Edge Case | Behavior |
|----|-----------|----------|
| EDGE-01 | Consumer already has `opencode.mcp.json` from a previous setup | Old file is ignored by the new sync; consumer gets `opencode.mcp` alongside it. No auto-cleanup. |
| EDGE-02 | Consumer manually created `opencode.mcp` before sync | Sync respects local modifications (standard hash-based manifest logic) |
| EDGE-03 | Dry-run mode | No files written; verbose output shows intent with new filename |
| EDGE-04 | Force overwrite mode | Works identically with new filename (`opencode.mcp` replaces whatever exists) |

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T3, T4 | Yes | — |
| B | T5 | Yes | T1 (for validation) |
| C | T6, T7, T8 | Yes | B |
| D | T9 | No (single) | C |

## Phase 1 — File Operations (Batch A — Parallel)

All tasks in this phase touch different files and have zero interdependencies.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | **Git rename**: `opencode.mcp.example.json` → `opencode.mcp`. Use `git mv opencode.mcp.example.json opencode.mcp`. This preserves git history tracking. The file content is unchanged. | `opencode.mcp.example.json` (remove), `opencode.mcp` (add) | A | — | |
| T2 | **Update `.gitignore`**: Remove line 3 (`opencode.mcp.json`). The file that was gitignored is being deleted (T4). The new `opencode.mcp` is tracked and should NOT be gitignored. No new entries needed. | `.gitignore` line 3 | A | — | |
| T3 | **Update `package.json` `files` array**: Change line 52 from `"opencode.mcp.example.json"` → `"opencode.mcp"`. This ensures the renamed file is included in npm tarball. | `package.json` line 52 | A | — | |
| T4 | **Delete `opencode.mcp.json`**: Run `rm opencode.mcp.json`. This file is untracked (gitignored) and byte-for-byte identical to the renamed file. It serves no purpose after the rename. | `opencode.mcp.json` (delete) | A | — | |

## Phase 2 — Sync Script Update (Batch B — depends on T1)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T5 | **Update `scripts/sync.js`** — two changes in one file:<br><br>**Change A (line 82):** In the `rootFiles` array, change `'opencode.mcp.example.json'` → `'opencode.mcp'`:<br>```js<br>// OLD (line 82):<br>const rootFiles = ['AGENTS.md', 'opencode.mcp.example.json', 'skills-lock.json']<br><br>// NEW:<br>const rootFiles = ['AGENTS.md', 'opencode.mcp', 'skills-lock.json']<br>```<br><br>**Change B (lines 370-381):** Remove the entire auto-copy block. Since `opencode.mcp` is now a tracked root file that gets synced directly (via rootFiles loop, lines 236-269), there's no separate "example → live" step needed. Remove lines 370-381 inclusively:<br>```js<br>// REMOVE this entire block (lines 370-381):<br>/* ──  Auto-copy opencode.mcp.json from example ────────────────── */<br><br>const exampleMcpFile = resolve(packageRoot, 'opencode.mcp.example.json')<br>const targetMcpFile = resolve(consumerRoot, 'opencode.mcp.json')<br>const mcpTrackedKey = '__root__/opencode.mcp.json'<br><br>if (existsSync(exampleMcpFile) && !existsSync(targetMcpFile)) {<br>  if (isVerbose) console.error('  … scaffolding: opencode.mcp.json from example')<br>  copyFileSync(exampleMcpFile, targetMcpFile)<br>  manifest.files[mcpTrackedKey] = hashFile(targetMcpFile)<br>  scaffolded += 1<br>}<br>```<br><br>The manifest write (lines 383-385) and summary log (line 388) remain unchanged. | `scripts/sync.js` lines 82, 370-381 | B | T1 | |

**Validation for T5:**
- `node --check scripts/sync.js` passes
- `node scripts/sync.js --dry-run` shows `opencode.mcp` in root file output (not `opencode.mcp.example.json`)
- `npx vitest run scripts/sync.test.js` — all 7 existing tests pass (no MCP-specific assertions exist)
- Check: no remaining references to `opencode.mcp.example.json` or `opencode.mcp.json` in `scripts/sync.js`

## Phase 3 — Documentation Updates (Batch C — Parallel)

All doc tasks are independent text changes and can run concurrently.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T6 | **Update `README.md` MCP Tooling section** (line 192):<br><br>**Change:** Replace the parenthetical explanation:<br>```md<br>// OLD (line 192):<br>Some agents require MCP servers configured in `opencode.mcp.json` (copy from `opencode.mcp.example.json`):<br><br>// NEW:<br>Some agents require MCP servers configured in `opencode.mcp`:<br>```<br><br>Check for any other `opencode.mcp` references in README.md and update them. | `README.md` line 192 | C | T5 | |
| T7 | **Update `docs/playwright-mcp-configuration.md`** — two line changes:<br><br>**Change A (line 39):** Update the descriptive text:<br>```md<br>// OLD (line 39):<br>The MCP configuration is located in `opencode.mcp.json`:<br><br>// NEW:<br>The MCP configuration is located in `opencode.mcp`:<br>```<br><br>**Change B (line 162):** Update Files Summary table:<br>```md<br>// OLD (line 162):<br>- **opencode.mcp.json** - MCP server configuration<br><br>// NEW:<br>- **opencode.mcp** - MCP server configuration<br>``` | `docs/playwright-mcp-configuration.md` lines 39, 162 | C | T5 | |
| T8 | **Update `memory-bank/activeContext.md` and `memory-bank/progress.md`** — replace all references to `opencode.mcp.example.json` and `opencode.mcp.json` with `opencode.mcp` in current-context descriptions (not historical tracker entries).<br><br>Key references to update in `activeContext.md`:<br>- Line 32: `opencode.mcp* files — 2 found: opencode.mcp.json …, opencode.mcp.example.json` → update to reference single `opencode.mcp`<br>- Lines 127, 136-137: MCP audit results referencing old filenames<br>- Line 393: Verbose logging log point description<br><br>Key references to update in `progress.md`:<br>- Line 92: Bootstrap verification table — references `opencode.mcp* files — 2 found`<br>- Lines 472-473, 482, 516: Hook script fix references<br>- Lines 885, 907-910, 921-922, 924: Various progress entries<br><br>Historical entries and tracker logs should be left as-is — they document past state.<br><br>After updating, run `memory_bank_memory_update` to re-index. | `memory-bank/activeContext.md`, `memory-bank/progress.md` | C | T5 | |

## Phase 4 — Final Verification (sequential, single task)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T9 | **End-to-end verification**:<br><br>1. **File state check**:<br>   - `git status` shows `opencode.mcp.example.json` → `opencode.mcp` as a rename (tracked)<br>   - `opencode.mcp.json` does not exist on disk<br>   - `opencode.mcp` exists and has correct content<br><br>2. **Git tracking check**:<br>   - `git ls-files -- opencode.mcp` → lists the file (tracked)<br>   - `git ls-files -- opencode.mcp.json` → no output (not tracked, deleted)<br>   - `git ls-files -- opencode.mcp.example.json` → no output (renamed)<br><br>3. **NPM packaging check**:<br>   - `npm pack --dry-run 2>&1 | grep opencode.mcp` → shows `opencode.mcp` (NOT `.example.json`)<br><br>4. **Sync dry-run check**:<br>   - `node scripts/sync.js --dry-run` → output references `opencode.mcp`<br>   - No mention of `opencode.mcp.example.json` or `opencode.mcp.json` in output<br><br>5. **Test suite check**:<br>   - `npx vitest run scripts/sync.test.js` → all 7 tests pass<br>   - `npx vitest run scripts/setup/` → all 88+ tests pass<br><br>6. **Syntax validation**:<br>   - `node --check scripts/sync.js` passes<br>   - `node -e "JSON.parse(require('fs').readFileSync('package.json'))"` passes | All affected files | — | T6, T7, T8 | |

---

## Files

| ID | File | Action | Details |
|----|------|--------|---------|
| FILE-01 | `opencode.mcp.example.json` | **RENAME →** `opencode.mcp` | Git rename preserving history |
| FILE-02 | `opencode.mcp` | **CREATE** (via rename) | New canonical MCP config file |
| FILE-03 | `opencode.mcp.json` | **DELETE** | Untracked, gitignored, identical content |
| FILE-04 | `.gitignore` | **MODIFY** line 3 | Remove `opencode.mcp.json` entry |
| FILE-05 | `package.json` | **MODIFY** line 52 | Change `files` array entry |
| FILE-06 | `scripts/sync.js` | **MODIFY** lines 82, 370-381 | Update rootFiles array + remove auto-copy block |
| FILE-07 | `README.md` | **MODIFY** line 192 | Update MCP Tooling section |
| FILE-08 | `docs/playwright-mcp-configuration.md` | **MODIFY** lines 39, 162 | Update filename references |
| FILE-09 | `memory-bank/activeContext.md` | **MODIFY** multiple lines | Update current references |
| FILE-10 | `memory-bank/progress.md` | **MODIFY** multiple lines | Update current references |
| FILE-11 | `.agents-sync-manifest.json` | **AUTO-UPDATE** | Regenerated on next sync; no manual change needed |

**Files confirmed NOT needing changes:**
- `scripts/setup/index.js` — delegates to sync.js, no direct MCP references
- `scripts/setup/sync-phase.js` — spawns sync.js as child, no direct MCP references
- `scripts/setup/constants.js` — no MCP references
- `scripts/sync.test.js` — no MCP-specific assertions exist
- `.opencode/opencode.json` — plugin config only (graphify), no MCP reference
- `opencode.json` (root) — this project's own MCP config, separate from the template file

---

## Testing

| ID | Test | How to Execute | Expected Result |
|----|------|---------------|-----------------|
| TEST-01 | File rename is tracked by git | `git status` | Shows rename: `opencode.mcp.example.json → opencode.mcp` |
| TEST-02 | Old live file deleted | `test -f opencode.mcp.json && echo "EXISTS" \|\| echo "DELETED"` | `DELETED` |
| TEST-03 | New file is tracked | `git ls-files -- opencode.mcp` | Outputs `opencode.mcp` |
| TEST-04 | `.gitignore` no longer references old name | `grep -c 'opencode.mcp.json' .gitignore` | `0` |
| TEST-05 | `package.json` has correct `files` entry | `node -e "console.log(require('./package.json').files.includes('opencode.mcp'))"` | `true` |
| TEST-06 | `npm pack` includes new filename | `npm pack --dry-run 2>&1 \| grep opencode.mcp` | Shows `opencode.mcp` (not `.example.json`) |
| TEST-07 | `sync.js` rootFiles has new name | `node -e "import('./scripts/sync.js').then(m => console.log('done'))"` | Loads without crash |
| TEST-08 | Sync dry-run shows new name | `node scripts/sync.js --dry-run 2>&1 \| grep -i opencode.mcp` | References `opencode.mcp` |
| TEST-09 | No stale references in sync.js | `grep -n 'opencode.mcp.example.json\|opencode.mcp.json' scripts/sync.js` | No output |
| TEST-10 | Existing unit tests pass | `npx vitest run scripts/sync.test.js` | 7 passed, 0 failed |
| TEST-11 | Setup unit tests pass | `npx vitest run scripts/setup/` | 88+ passed, 0 failed |
| TEST-12 | Syntax validation | `node --check scripts/sync.js` | No errors |
| TEST-13 | README references updated | `grep -c 'opencode.mcp.json\|opencode.mcp.example.json' README.md` | `0` (or only historical) |
| TEST-14 | Playwright doc references updated | `grep -c 'opencode.mcp.json' docs/playwright-mcp-configuration.md` | `0` |
| TEST-15 | `memory_bank_memory_update` succeeds | Run the tool after doc updates | Index updated, no errors |

---

## Risks & Assumptions

### Risks

| ID | Risk | Probability | Impact | Mitigation |
|----|------|------------|--------|------------|
| RISK-01 | Consumers who previously ran setup have `opencode.mcp.json` alongside the new `opencode.mcp` | High | Low | Old file becomes orphaned. No auto-cleanup. Document in release notes that the old file is safe to delete manually. The next setup run places `opencode.mcp` without touching `opencode.mcp.json` |
| RISK-02 | OpenCode may not recognize `opencode.mcp` without `.json` extension | Low | High | Verified: OpenCode's documented filename for MCP config is `opencode.mcp` (no extension). The `.json` extension was never a requirement |
| RISK-03 | Breaking change for consumers who parse `opencode.mcp.example.json` directly | Low | Low | The file was a template, not an API. Consumers who vendored or symlinked it will need to update |
| RISK-04 | `.agents-sync-manifest.json` has stale entries for the old filenames | Low | Low | Manifest is auto-generated. The next sync run will remove stale entries and add the new one. Stale entries don't cause errors — they're just unused keys |

### Assumptions

| ID | Assumption |
|----|------------|
| ASSUMPTION-01 | `opencode.mcp` (no extension) is the canonical MCP config filename recognized by OpenCode |
| ASSUMPTION-02 | The template file content is identical to the live config — no content changes needed |
| ASSUMPTION-03 | No external consumers have built tooling that depends on the `.example.json` naming convention |
| ASSUMPTION-04 | The sync.js unit tests do not inspect filenames in the `rootFiles` array — zero test code changes needed |

---

## Alternatives Considered

| ID | Alternative | Rationale for Rejection |
|----|-------------|------------------------|
| ALT-01 | Keep the auto-copy block but change source/target to both be `opencode.mcp` | Redundant — the root file sync (lines 236-269) already copies `opencode.mcp` to the consumer. A self-copy step adds no value |
| ALT-02 | Rename to `opencode.mcp.json` (keep .json extension) | OpenCode's native filename is `opencode.mcp` (no extension). Keeping `.json` adds unnecessary verbosity and doesn't match the tool's convention |
| ALT-03 | Keep `opencode.mcp.example.json` as the template and only delete `opencode.mcp.json` | Perpetuates the unnecessary example/live distinction. The two files are identical — one file serves both purposes |
| ALT-04 | Add `opencode.mcp` to `.gitignore` (make it untracked) | The file should be tracked in the repo — it's the canonical MCP config template for consumers. Making it untracked would break the sync/packaging pipeline |

---

## Dependencies

| ID | Description | Affected Tasks |
|----|-------------|----------------|
| DEP-01 | Git rename must complete before sync.js validation (T5) references the new filename | T1 → T5 |
| DEP-02 | Sync.js changes (T5) must complete before documentation updates (T6-T8) to ensure docs reflect actual behavior | T5 → T6,T7,T8 |
| DEP-03 | All implementation tasks (T1-T8) must complete before final verification (T9) | T1-T8 → T9 |
| DEP-04 | `memory_bank_memory_update` must run after memory-bank doc updates (T8) | T8 → (memory_update step in T8) |

---

## Related Specifications

- **Research Spike**: `docs/spike-opencode-mcp-rename.md` — Full reference map (59 hits across 14 files)
- **Architecture Context**: `docs/.architecture-context.md` — Agent-based workflow distribution system
