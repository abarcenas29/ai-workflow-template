# Spike: Investigate .husky/post-merge Hook Script References and Packaging

**Date:** 2026-07-24
**Status:** ✅ INVESTIGATED
**Tags:** [hooks, packaging, post-merge, scripts, sync, consumer-projects, npx-setup]

---

## 1. Introduction

The `.husky/post-merge` hook (and `.husky/pre-commit`) reference scripts using **relative paths** like `node scripts/memory-cli.js update`. When this package (`@abarcenas/ai-workflow-template`) is installed as an npm dependency in a consumer project, these scripts live at `node_modules/@abarcenas/ai-workflow-template/scripts/` — **not** at the consumer project root. The hooks run from the consumer project root and fail because `scripts/` does not exist there.

This spike investigates:
- How the hooks currently work and why they break for consumers
- What scripts exist and which ones need to be available in consumer projects
- The current packaging/distribution mechanism
- Any existing file-copying mechanism during install
- MCP-related script dependencies
- Recommendations for the fix approach

---

## 2. Investigation Results

### 2.1 Hook Analysis

#### post-merge hook (`.husky/post-merge`)
**Source:** `/Users/aldrichallenbarcenas/develop/ai-workflow-template/.husky/post-merge`
```sh
# Managed by @abarcenas/ai-workflow-template setup
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# After git pull/merge, check if memory-bank files changed
# and update the vector index incrementally

if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "^memory-bank\|^docs/"; then
  echo "[memory-bank] Memory bank files changed. Updating vector index..."
  node scripts/memory-cli.js update 2>/dev/null || echo "[memory-bank] Index update skipped (service not installed)"
fi
```
**Problem:** `node scripts/memory-cli.js update` resolves relative to the consumer project root (where the hook executes). The consumer does not have `scripts/memory-cli.js` at the root.

#### pre-commit hook (`.husky/pre-commit`)
**Source:** `/Users/aldrichallenbarcenas/develop/ai-workflow-template/.husky/pre-commit`
```sh
# Managed by @abarcenas/ai-workflow-template setup

node scripts/bump-version.js
node scripts/validate-memory-schema.js
```
**Problem:** Same relative-path issue — `scripts/bump-version.js` and `scripts/validate-memory-schema.js` do not exist at the consumer root.

#### Template hook definitions (source of truth)
**Source:** `/Users/aldrichallenbarcenas/develop/ai-workflow-template/scripts/setup/constants.js` (lines 41-68)

The `TEMPLATE_HOOKS` object in `constants.js` defines the **exact content** that gets written to consumer hook files. Both `pre-commit` and `post-merge` templates use `node scripts/...` relative paths.

**This is the root cause**: the hook content hardcodes paths relative to the consumer project root, but the scripts live in `node_modules/@abarcenas/ai-workflow-template/scripts/`.

---

### 2.2 Scripts Directory Inventory

**Path:** `scripts/` (10 entries = 7 JS files + 2 directories)

| File | Purpose | Called By | External Dependencies |
|------|---------|-----------|----------------------|
| `memory-cli.js` | CLI for manual memory index operations | post-merge hook, `package.json` scripts (`memory:search/rebuild/update`), memory-search SKILL.md | **imports** `./memory-index.js` |
| `memory-index.js` | Core vector search engine (sqlite-vec) | `memory-cli.js`, `mcp-memory-server.js` | `better-sqlite3`, `sqlite-vec`, `@xenova/transformers` (optional) |
| `mcp-memory-server.js` | MCP server for memory-bank tools (stdio transport) | opencode.mcp.json, opencode.mcp.example.json | `@modelcontextprotocol/sdk`, `./memory-index.js` |
| `bump-version.js` | Auto-bumps package version on commit | pre-commit hook | None (core Node.js only) |
| `validate-memory-schema.js` | Validates YAML frontmatter on memory-bank files | pre-commit hook | None (core Node.js only) |
| `normalize-memory.js` | Adds frontmatter to markdown files | postinstall, setup sync-phase | None (core Node.js only) |
| `sync.js` | Syncs .agents/, .opencode/, root files to consumer | postinstall, setup sync-phase | None (core Node.js only) |
| `mcp/playwright-mcp-launcher.js` | Launches Playwright MCP server | opencode.mcp.json, opencode.mcp.example.json | None (core Node.js only, spawns npx) |
| `sync.test.js` | Tests for sync.js | Vitest | Vitest |
| `setup/` (dir) | 11 module files + 4 test files | `npx ai-workflow-setup` | core Node.js only |
| `mcp/` (dir) | 1 file (playwright-mcp-launcher.js) | See above | — |

---

### 2.3 Which Scripts MUST Be Available in Consumer Projects

#### Tier 1 — Required for hooks (must be at consumer project root's `scripts/` path):
1. **`scripts/memory-cli.js`** — post-merge hook: `node scripts/memory-cli.js update`
2. **`scripts/memory-index.js`** — imported by memory-cli.js (`import ... from './memory-index.js'`)
3. **`scripts/bump-version.js`** — pre-commit hook: `node scripts/bump-version.js`
4. **`scripts/validate-memory-schema.js`** — pre-commit hook: `node scripts/validate-memory-schema.js`

#### Tier 2 — Required for MCP configuration (must be at consumer project root for opencode):
5. **`scripts/mcp-memory-server.js`** — Referenced in `opencode.mcp.json` as `"command": ["node", "scripts/mcp-memory-server.js"]`
6. **`scripts/mcp/playwright-mcp-launcher.js`** — Referenced in `opencode.mcp.example.json` as `"args": ["scripts/mcp/playwright-mcp-launcher.js"]`

#### Tier 3 — Called by setup/postinstall (available via package root path):
7. **`scripts/sync.js`** — Called by postinstall and sync-phase.js (via `resolvePackageRoot()`)
8. **`scripts/normalize-memory.js`** — Called by postinstall and sync-phase.js (via `resolvePackageRoot()`)

**Key observation:** Tier 3 scripts are already resolved correctly (via `resolvePackageRoot()` in `sync-phase.js`). Tier 1 and Tier 2 scripts are the ones that fail because they use relative paths from the consumer root.

#### Dependency chain for memory-cli.js:
```
memory-cli.js
  └── memory-index.js
        ├── better-sqlite3 (runtime dependency)
        ├── sqlite-vec (runtime dependency)
        └── @xenova/transformers (optional dependency, embedding model)
```

**Note:** If `memory-cli.js` and `memory-index.js` are copied to the consumer project, the consumer must also have `better-sqlite3` and `sqlite-vec` installed. These are already listed as dependencies of `@abarcenas/ai-workflow-template`, so they'll be present in the consumer's `node_modules/`. The `import` statements in `memory-index.js` will resolve correctly because Node.js module resolution walks up to find `node_modules/`.

---

### 2.4 Current Packaging/Distribution Mechanism

#### package.json "files" field (lines 38-52):
```json
"files": [
  "bin/",
  ".agents/",
  ".github/workflows/",
  "scripts/",
  "scripts/setup/",
  ".opencode/agents/",
  ".opencode/commands/",
  ".husky/",
  "memory-bank/.vocabulary.json",
  "AGENTS.md",
  "opencode.mcp.example.json",
  "skills-lock.json",
  ".husky/post-merge"
]
```
The entire `scripts/` directory is published in the npm package, so it lands at:
`node_modules/@abarcenas/ai-workflow-template/scripts/`

#### Distribution Flow:
1. **`npm install`** → triggers `postinstall` → runs `sync.js` + `normalize-memory.js`
2. **`sync.js`** copies `.agents/`, `.opencode/`, and root files to consumer project. Does NOT copy `scripts/`.
3. **`npx ai-workflow-setup`** (or `npx @abarcenas/ai-workflow-template`) → runs 5-phase pipeline
4. **Phase 2 (Hooks):** `hooks.js` installs hook files to consumer's `.husky/` with content from `constants.js`
5. **Phase 5 (Sync):** `sync-phase.js` spawns `sync.js` + `normalize-memory.js` as child processes

**Critical gap:** There is NO mechanism that copies `scripts/` (or specific scripts) from the package to the consumer project root. The `sync.js` script syncs `.agents/`, `.opencode/`, and root files — but explicitly does NOT sync `scripts/`.

---

### 2.5 Existing File-Copying Mechanism

#### sync.js — Current synced paths:
- `.agents/` → `{consumerRoot}/.agents/`
- `.opencode/` → `{consumerRoot}/.opencode/`
- Root files: `AGENTS.md`, `opencode.mcp.example.json`, `skills-lock.json` → `{consumerRoot}/`
- Auto-copy: `opencode.mcp.example.json` → `opencode.mcp.json` (if not exists)
- Memory-bank stubs scaffolded

#### sync.js — NOT currently synced:
- `scripts/` directory (any files)
- `.husky/` directory (handled separately by `hooks.js`/`husky-init.js`)

#### sync.js sync rules (lines 107-128):
- New files: auto-copied
- Existing files with matching hash in manifest: overwritten (idempotent update)
- Existing files with different hash (locally modified): SKIPPED (preserved)
- `--force` flag: overwrites all files regardless

This intelligent hash-based sync mechanism already exists and could be extended to also copy scripts.

---

### 2.6 MCP-Related Script Dependencies

#### opencode.mcp.json (and opencode.mcp.example.json) — MCP server references:
```json
"playwright": {
  "type": "local",
  "command": "node",
  "args": ["scripts/mcp/playwright-mcp-launcher.js"]
}
"memory-bank": {
  "type": "local",
  "command": ["node", "scripts/mcp-memory-server.js"]
}
```

**Both references use `scripts/...` relative paths** — same problem as the hooks. The consumer's `opencode.mcp.json` (copied from `opencode.mcp.example.json` by `sync.js`) contains these paths, but the scripts don't exist at the consumer's project root.

**Note:** The `playwright` MCP in the actual `opencode.json` (source) has been updated to use `npx @playwright/mcp@latest` instead, which avoids the issue for Playwright. But the `opencode.mcp.example.json` still uses the launcher script path. The `memory-bank` MCP still references `scripts/mcp-memory-server.js` in both files.

---

### 2.7 References to `memory-cli.js` Across Codebase (21 total)

| File | Context |
|------|---------|
| `.husky/post-merge` (line 10) | `node scripts/memory-cli.js update` — **broken for consumers** |
| `scripts/setup/constants.js` (line 61) | Hook template definition — **root cause** |
| `package.json` (lines 21-23) | npm scripts (`memory:search/rebuild/update`) — works in package source |
| `.agents/skills/memory-search/SKILL.md` (lines 66-68) | Manual CLI usage examples — documentation |
| `docs/spike-vector-db-memory.md` (line 292) | Architecture doc mentions CLI as secondary interface |
| `scripts/memory-cli.js` (self) | Usage strings, error messages |
| `plan/design-setup-command-v1.md` (line 253) | Design doc template — archived |
| `docs/design-setup-command-v1.md` (line 253) | Design doc template — archived |

The critical references are:
1. **`scripts/setup/constants.js`** — defines hook content (must be fixed)
2. **`.husky/post-merge`** — actual hook file (must be consistent with constants)
3. **`package.json`** — npm scripts (works fine for package development)

---

### 2.8 package.json Postinstall and Setup Flow

```
npm install @abarcenas/ai-workflow-template
  │
  └─ postinstall: sync.js + normalize-memory.js + warning message
       │                                  │
       │  sync.js copies:                 │  normalize-memory.js:
       │  - .agents/ dir                  │  - Adds frontmatter to .md files
       │  - .opencode/ dir                │  - Migrates plan/ → docs/
       │  - AGENTS.md, opencode.mcp.*.json
       │  - skills-lock.json
       │  - memory-bank/ stubs
       │
       └─ Message: "Run npx ai-workflow-setup to configure git hooks"

npx ai-workflow-setup
  │
  ├─ Phase 1: Discover (detect project state)
  ├─ Phase 2: Hooks (install post-merge, pre-commit to .husky/)
  ├─ Phase 3: Prepare (add "husky" to prepare script)
  ├─ Phase 4: Husky Init (generate .husky/_/ shims)
  └─ Phase 5: Sync (spawn sync.js + normalize-memory.js)
```

**Gap:** Between npm install and hooks installation, no scripts are copied to the consumer root. The hooks reference `scripts/...` which doesn't exist yet.

---

### 2.9 Git History Analysis

Recent relevant commits:
- `9a9b691` — feat: add verbose logging to ai-workflow-setup --verbose (latest)
- `5c4d30c` — feat: add npx ai-workflow-setup command with 5-phase pipeline (2026-07-24)
- `0e5e23e` — Add vector based memory bank (when memory-cli.js was introduced)
- `26e401e` — feat: publish ai workflow template package (initial packaging)

The hook script references haven't been changed since their introduction. The setup command (commit `5c4d30c`) added the 5-phase pipeline but inherited the existing relative-path hook content without modification.

---

## 3. Technical Constraints

| ID | Constraint |
|----|------------|
| CON-01 | `scripts/memory-cli.js` imports `memory-index.js` via `'./memory-index.js'` — both files must be co-located in the same directory |
| CON-02 | `memory-index.js` dynamically imports `better-sqlite3`, `sqlite-vec`, `@xenova/transformers` — dependencies must be resolvable from the script's location |
| CON-03 | `scripts/mcp-memory-server.js` imports `memory-index.js` via `'./memory-index.js'` — same co-location requirement |
| CON-04 | The `sync.js` manifest system (`/.agents-sync-manifest.json`) tracks file hashes for idempotent updates — this can be extended to scripts |
| CON-05 | Husky hooks run from the git repo root (consumer project root) — any relative path in a hook resolves from there |
| CON-06 | npm v12+ blocks automatic `postinstall` scripts — the explicit `npx ai-workflow-setup` command is the recommended path per README |

---

## 4. Recommendation

### Recommended Approach: **Extend sync.js to copy required scripts + update hook content in constants.js**

This is the most robust and consistent approach, aligned with the existing sync mechanism.

#### What to change:

1. **`scripts/sync.js`** — Add a new sync section that copies required scripts from the package to the consumer:
   ```js
   // ──  Sync scripts/ directory ──────────────────────────────
   const scriptsToCopy = [
     'memory-cli.js',
     'memory-index.js',
     'mcp-memory-server.js',
     'bump-version.js',
     'validate-memory-schema.js',
     'mcp/playwright-mcp-launcher.js',
   ];

   const sourceScriptsDir = resolve(packageRoot, 'scripts');
   const targetScriptsDir = resolve(consumerRoot, 'scripts');

   for (const scriptRelPath of scriptsToCopy) {
     const sourceFile = resolve(sourceScriptsDir, scriptRelPath);
     const targetFile = resolve(targetScriptsDir, scriptRelPath);
     // ... same hash-based logic as other sync loops
     const trackedKey = `__scripts__/${scriptRelPath}`;
     // ... copy if new or unchanged, skip if locally modified
   }
   ```

2. **`scripts/setup/constants.js`** — No change needed! The hook content already uses the correct relative path (`node scripts/memory-cli.js update`), which will work once the scripts are copied to the consumer's `scripts/` directory.

3. **`scripts/setup/sync-phase.js`** — May need to ensure `sync.js` is called with appropriate flags. Current behavior should suffice since sync-phase already spawns sync.js.

4. **`package.json` `"files"`** — No change needed; `scripts/` is already included.

5. **`.gitignore` recommendation for consumer** — The sync manifest already tracks scripts; consumers may want to gitignore the synced scripts directory. However, this is a consumer decision — the package should not enforce this.

#### Why this approach:

- **Consistent with existing pattern** — `.agents/`, `.opencode/`, and root files are already synced this way
- **Intelligent updates** — Hash-based manifest means existing consumer-modified scripts are preserved (skipped), unmodified scripts are refreshed on package update
- **No path changes in hooks** — Hook content stays clean and readable
- **Script co-location** — `memory-cli.js` and `memory-index.js` stay together, resolving the import dependency
- **Dependency resolution** — Since the consumer already has `@abarcenas/ai-workflow-template` installed, `better-sqlite3` and `sqlite-vec` are present in `node_modules/`. The copied scripts' imports will resolve correctly from the consumer's root.

#### Alternative considered: Absolute node_modules path
```sh
node node_modules/@abarcenas/ai-workflow-template/scripts/memory-cli.js update
```
Rejected because: breaks with monorepo hoisting, pnpm, npm aliases. Fragile.

#### Alternative considered: npx-based approach
Rejected because: npx adds startup overhead; would need to add bin entries; less transparent.

#### Alternative considered: Only fix the path in the hook
Rejected because: the `memory-index.js` dependency chain means both files must be co-located. If we reference the node_modules path for `memory-cli.js`, its `import './memory-index.js'` will still look relative to *its own* location (in node_modules), which could work. But the path is fragile and ugly.

---

## 5. Scripts That Should Be Synced to Consumer

| Script | Reason | Priority |
|--------|--------|----------|
| `memory-cli.js` | Called by post-merge hook, manual CLI | P0 — Required |
| `memory-index.js` | Imported by memory-cli.js and mcp-memory-server.js | P0 — Required |
| `bump-version.js` | Called by pre-commit hook | P0 — Required |
| `validate-memory-schema.js` | Called by pre-commit hook | P0 — Required |
| `mcp-memory-server.js` | Referenced in opencode.mcp.json (MCP config) | P1 — MCP Integration |
| `mcp/playwright-mcp-launcher.js` | Referenced in opencode.mcp.example.json | P1 — MCP Integration |
| `normalize-memory.js` | Already handled by sync-phase.js (spawned with full path) | P2 — Already works |

**NOT needed in consumer:**
- `sync.js` — Already called via `resolvePackageRoot()` in setup
- `sync.test.js` — Test file, not needed by consumers
- `setup/` directory — Called via `bin/setup.js` → `import(...)` from package

---

## 6. Implementation Checklist for Coder Agent

1. [ ] **Update `scripts/sync.js`** — Add sync loop for required scripts from `{packageRoot}/scripts/` to `{consumerRoot}/scripts/`, using the same hash-based manifest system (tracked as `__scripts__/<relpath>`)
2. [ ] **Add `__scripts__/` entries to manifest format** — No manifest version change needed; the flat key namespace already supports this
3. [ ] **Add unit test for scripts syncing** — Extend `sync.test.js` or create new test case
4. [ ] **Verify post-merge hook behavior** — After setup, the consumer's `.husky/post-merge` should correctly run `node scripts/memory-cli.js update`
5. [ ] **Verify pre-commit hook behavior** — After setup, the consumer's `.husky/pre-commit` should correctly run `node scripts/bump-version.js` and `node scripts/validate-memory-schema.js`
6. [ ] **Verify MCP server path** — Consumer's `opencode.mcp.json` should correctly resolve `scripts/mcp-memory-server.js` and `scripts/mcp/playwright-mcp-launcher.js`
7. [ ] **Update memory-search SKILL.md** — The manual CLI examples already reference `node scripts/memory-cli.js` correctly (they'll work once scripts are synced)
8. [ ] **(Optional) Update opencode.mcp.example.json** — Consider updating the playwright MCP launcher path to match the actual `opencode.json` if the `npx @playwright/mcp@latest` approach is preferred

---

## 7. External Resources

| Resource | Relevance |
|----------|-----------|
| `scripts/sync.js` (lines 82-299) | Existing sync mechanism — reference implementation for new scripts loop |
| `scripts/setup/constants.js` (lines 41-68) | `TEMPLATE_HOOKS` — defines hook content (root cause of relative paths) |
| `scripts/setup/hooks.js` (lines 51-57) | `buildHookContent()` — constructs hook file content from template |
| `scripts/memory-index.js` (full file) | The dependency that forces co-location of memory-cli.js and memory-index.js |
| `opencode.mcp.example.json` (lines 39, 59) | MCP references that also use relative `scripts/` paths |
| `package.json` (lines 38-52) | `"files"` field — shows scripts/ is already published |
| `scripts/setup/sync-phase.js` (lines 52-116) | How sync.js is called from setup — confirms package root resolution |

---

## 8. Decision Trail

1. **Problem identified:** Post-merge hook uses `node scripts/memory-cli.js update` which resolves from consumer root, not from package location.
2. **Root cause:** `constants.js` `TEMPLATE_HOOKS.post-merge.content` hardcodes relative path.
3. **Impact scope:** 2 hooks (post-merge, pre-commit) × 4 scripts (memory-cli.js, memory-index.js, bump-version.js, validate-memory-schema.js) + 2 MCP server scripts.
4. **Pattern precedent:** `sync.js` already intelligently copies files to consumer root via hash-based manifest.
5. **Selected approach:** Extend sync.js to copy required scripts to consumer's `scripts/` directory. Hook content remains unchanged because scripts will be at the expected relative path.
6. **Key risk:** Consumer must have `better-sqlite3`, `sqlite-vec` installed (already transitive deps of the package, so they'll be in node_modules/).
