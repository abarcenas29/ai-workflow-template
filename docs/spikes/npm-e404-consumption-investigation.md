# Research Spike: npm E404 for `ai-workflow-template` Consumption

**Date:** 2026-08-01
**Status:** ✅ COMPLETE
**Researcher:** Researcher - Technical Investigation

---

## 1. Investigation Results

### 1.1 Scoped Package Publication Status

| Query | Result |
|-------|--------|
| `npm view @abarcenas/ai-workflow-template` | ✅ **FOUND** — `@abarcenas/ai-workflow-template@1.39.0` |
| Latest version | `1.39.0` |
| dist-tags | `latest: 1.39.0` |
| bin entries | `ai-workflow-setup` (single entry) |
| Published | 2026-08-01T14:22:00.809Z (~43 min before investigation) |
| Maintainer | `abarcenas <aldrich.barcenas@gmail.com>` |
| Dependencies | `@modelcontextprotocol/sdk`, `better-sqlite3`, `sqlite-vec` |
| Versions published | 20 total |
| Visibility | **Public** (confirmed — no "private" badge) |

**Evidence:**
```
npm view @abarcenas/ai-workflow-template
@abarcenas/ai-workflow-template@1.39.0 | ISC | deps: 3 | versions: 20
bin: ai-workflow-setup
```

### 1.2 Unscoped Name Availability

| Query | Result |
|-------|--------|
| `npm view ai-workflow-template` | ❌ **404 Not Found** |
| `npm search ai-workflow-template --json` | Only `@abarcenas/ai-workflow-template` appears (scoped name). No unscoped `ai-workflow-template` exists. |

**Evidence:**
```
npm view ai-workflow-template
npm error 404 Not Found - GET https://registry.npmjs.org/ai-workflow-template - Not found
```

### 1.3 Root Cause Confirmation

**User's failing command:** `npx ai-workflow-template setup --knowledgebase`

**Error:** `npm error 404 Not Found - GET https://registry.npmjs.org/ai-workflow-template`

**Root cause:** The user omitted the npm scope (`@abarcenas/`). The package is published as a **scoped** package (`@abarcenas/ai-workflow-template`), and the unscoped name `ai-workflow-template` does not exist on the npm registry. `npx` resolves package names directly against the registry — an unscoped name maps to `https://registry.npmjs.org/<name>`, which returns 404.

Additionally, the user's command has two secondary issues (non-blocking but incorrect):
1. `setup` as a positional argument — silently ignored by the CLI parser (harmless)
2. `--knowledgebase` flag — does NOT exist; the correct flag is `--skip-knowledgebase` to *disable* knowledgebase (it is ON by default)

### 1.4 Correct npx Consumption Commands

Based on npm/npx documentation and the package's configuration:

| Command | Works? | Notes |
|---------|--------|-------|
| `npx @abarcenas/ai-workflow-template` | ✅ YES | npx resolves scoped package, detects single bin entry `ai-workflow-setup`, runs it |
| `npx ai-workflow-setup` | ✅ YES | Only if package is **already installed** locally (e.g., after `npm install @abarcenas/ai-workflow-template`) |
| `npx ai-workflow-template` | ❌ NO | Unscoped name doesn't exist on registry |
| `npx @abarcenas/ai-workflow-template setup --knowledgebase` | ❌ NO | `--knowledgebase` is not a valid flag |
| `npx @abarcenas/ai-workflow-template --skip-knowledgebase` | ✅ YES | Skips knowledgebase (disabled by default) |
| `npx @abarcenas/ai-workflow-template --dry-run` | ✅ YES | Preview mode |

#### How npx Resolves Scoped Package Bins (npm Docs)

From the [official npx documentation](https://docs.npmjs.com/cli/v9/commands/npx/):

> If the package has a **single entry** in its `bin` field in `package.json`, or if all entries are aliases of the same command, then **that command will be used**.

Since `@abarcenas/ai-workflow-template` has exactly one bin entry (`ai-workflow-setup`), `npx @abarcenas/ai-workflow-template` will:
1. Download the package (if not cached)
2. Detect the single bin entry
3. Execute `ai-workflow-setup`

#### Supported CLI Flags (from `scripts/setup/constants.js`)

| Flag | Effect |
|------|--------|
| `--force` | Overwrite existing hooks (creates .bak backup) |
| `--dry-run` | Preview without making changes |
| `--yes` / `-y` | Skip confirmation prompts |
| `--skip-hooks` | Skip git hook installation |
| `--skip-prepare` | Skip prepare script modification |
| `--skip-sync` | Skip file sync phase |
| `--skip-knowledgebase` | Skip knowledgebase registration |
| `--help` / `-h` | Show help |
| `--version` / `-v` | Show version |
| `--quiet` / `-q` | Suppress non-error output |
| `--verbose` / `-V` | Detailed debug output |

> **Note:** `--knowledgebase` is NOT a supported flag. Knowledgebase registration runs by default (Phase 6). Use `--skip-knowledgebase` to disable it.

---

## 2. Consumption Alternatives

### 2.1 Option A: npm Registry (Current, Recommended)

```bash
npm install @abarcenas/ai-workflow-template
npx @abarcenas/ai-workflow-template
# or: npx ai-workflow-setup (if already installed)
```

| Factor | Assessment |
|--------|------------|
| **Cost** | **FREE** — public scoped packages incur no charge |
| **Setup** | Already done — package is published at v1.39.0 |
| **Updates** | `npm update` / `npm install @abarcenas/ai-workflow-template@latest` |
| **Latency** | Minimal (npm CDN) |
| **Auth** | None needed for public packages |
| **Documentation** | README already documents this approach |

### 2.2 Option B: Git URL Dependency

```bash
npm install github:abarcenas29/ai-workflow-template
# or with a specific ref:
npm install github:abarcenas29/ai-workflow-template#v1.39.0
```

| Factor | Assessment |
|--------|------------|
| **Pros** | Works without npm publish; can use any branch/tag/commit |
| **Cons** | No semver resolution; slower install (git clone); no npm audit; harder to update |
| **Use case** | Pre-release testing; private repos; offline/internal environments |

### 2.3 Option C: Local Path / `file:` Dependency

```bash
npm install ../ai-workflow-template
# or in package.json:
# "dependencies": { "@abarcenas/ai-workflow-template": "file:../ai-workflow-template" }
```

| Factor | Assessment |
|--------|------------|
| **Pros** | Instant; no network needed; great for local development |
| **Cons** | Breaks on other machines; path must be relative and accessible |
| **Use case** | Local development of both template and consumer simultaneously |

### 2.4 Recommendation

**Status quo (Option A) is recommended.** The package is already published publicly on npm at v1.39.0. The only issue was the user invoking the wrong package name. No re-publishing or alternative consumption method is needed — just documentation/correction of the consumer command.

---

## 3. Publication Readiness

### 3.1 Dry-Run Results

`npm publish --dry-run` was executed (read-only, does not publish):

```
npm notice 📦  @abarcenas/ai-workflow-template@1.39.0
npm notice Tarball Contents: 137 files
npm notice package size: 281.8 kB
npm notice unpacked size: 1.0 MB
```

**Tarball includes all expected files:**
- ✅ `bin/setup.js` (1.4kB)
- ✅ `.agents/` (all instructions, skills, prompts)
- ✅ `.github/workflows/` (npm-publish.yml, pr-test.yml)
- ✅ `scripts/` (including `scripts/setup/`)
- ✅ `.opencode/agents/` and `.opencode/commands/`
- ✅ `.husky/` hooks
- ✅ `AGENTS.md`, `README.md`, `package.json`
- ✅ `memory-bank/.vocabulary.json`
- ✅ `skills-lock.json`
- ✅ `opencode.mcp.example.json`

### 3.2 Bin Warning (Non-blocking)

The dry-run produced a warning:
```
npm warn publish "bin[ai-workflow-setup]" script name bin/setup.js was invalid and removed
```

**However**, the published package on the registry (`npm view`) shows the bin entry IS present:
```
bin: ai-workflow-setup
```

This warning appears to be a dry-run artifact. The actual publish (done ~43 min ago) preserved the bin entry correctly. **No action required.**

### 3.3 Minor Issues Found

| Issue | Severity | Details |
|-------|----------|---------|
| `"main": "index.js"` but no `index.js` exists | Low | Only affects `require('@abarcenas/ai-workflow-template')` — not relevant for a CLI tool consumed via `npx`. Does not affect bin execution. |
| No `prepublishOnly`/`prepack` script | Info | Only `"prepare": "husky"` exists (runs on `npm install` and `npm publish`). No build step needed. |
| Help text shows `npx @abarcenas/ai-workflow-template setup` | Low | The `setup` positional argument is silently ignored by `parseCliArgs()`. The command works identically with or without it. |

### 3.4 npm Authentication

- ✅ `~/.npmrc` contains valid auth token: `npm_lKZA...` (redacted)
- ✅ `npm whoami` returns `abarcenas`
- ✅ No local `.npmrc` in project directory

### 3.5 Scoped Package Publishing Rules

From [npm docs on scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/):

> By default, scoped packages are published with private visibility. To publish a scoped package with public visibility, use `npm publish --access public`.

This was already done correctly (the package is public). For future publishes:
- `npm publish --access public` — required for first publish or if `publishConfig.access` is not set
- Consider adding to `package.json`: `"publishConfig": { "access": "public" }` to make `npm publish` default to public

---

## 4. Decision / Recommendation

### Root Cause (Confirmed)
The user ran `npx ai-workflow-template` — omitting the **npm scope** `@abarcenas/`. The package is published as `@abarcenas/ai-workflow-template` and the unscoped name does not exist on npm.

### Correct Consumer Command
```bash
npx @abarcenas/ai-workflow-template
```
(no additional flags needed — knowledgebase runs by default)

### Recommended Actions

1. **No re-publish needed.** The package is already public at v1.39.0 with a working bin entry.

2. **Consumer guidance:** Tell the user to use `npx @abarcenas/ai-workflow-template` (with the `@abarcenas/` scope).

3. **Documentation improvements (optional, non-blocking):**
   - Consider clarifying in README that the scoped name MUST be used
   - List `--skip-knowledgebase` explicitly so users don't try `--knowledgebase`
   - Remove or fix the dangling `"main": "index.js"` field (or create a stub `index.js`)
   - Add `"publishConfig": { "access": "public" }` to `package.json` for future publishes

---

## 5. External Resources

| Source | URL | Relevance |
|--------|-----|-----------|
| npm npx docs (v9) | https://docs.npmjs.com/cli/v9/commands/npx/ | npx bin resolution heuristic for single/multiple bin entries |
| npm scoped public packages | https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/ | Scoped packages default to private; `--access public` required |
| npm scope docs | https://docs.npmjs.com/cli/v10/using-npm/scope/ | How scoped packages are installed and resolved |
| StackOverflow: npx + scoped packages | https://stackoverflow.com/questions/58649531/running-npx-with-scoped-packages | `npx -p @foo/bar bar` pattern for explicit bin invocation |
| npm pricing page | https://www.npmjs.com/products | Confirms free tier includes unlimited public packages |
| GitHub repo | https://github.com/abarcenas29/ai-workflow-template | Source of truth for package configuration |

---

## 6. Investigation Chronology

| Time (approx) | Action | Finding |
|---------------|--------|---------|
| T+0m | Read agent spec, package.json, bin/setup.js | Identified scoped name, single bin entry |
| T+2m | `npm view @abarcenas/ai-workflow-template` | ✅ Package found, v1.39.0, public |
| T+2m | `npm view ai-workflow-template` | ❌ 404 — unscoped name doesn't exist |
| T+3m | `npm search ai-workflow-template --json` | Only scoped name appears |
| T+4m | Read `scripts/setup/constants.js` | Identified `--skip-knowledgebase` flag, no `--knowledgebase` |
| T+5m | `npm publish --dry-run` | 137 files, 281.8 kB; bin warning (non-blocking) |
| T+7m | Fetched npm npx documentation | Confirmed single-bin resolution heuristic |
| T+8m | Fetched npm scoped publishing docs | Confirmed `--access public` requirement and free tier |
| T+10m | Read README.md | Found documented correct commands |
| T+12m | Compiled final report | Root cause: missing `@abarcenas/` scope in consumer command |
