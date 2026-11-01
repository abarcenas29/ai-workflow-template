# Spike: Is `@abarcenas/ai-workflow-template` publishable / consumable as an npm package?

**Status:** Completed
**Date:** 2026-10-31
**Researcher:** AI Research Agent (DeepSeek V4.1 Flash)
**Ticket:** "Deployable as an npm library" — validate current state and define requirements

---

## Goal

Answer seven questions with evidence:

1. Registry status of `@abarcenas/ai-workflow-template`
2. Scoped-package publishing rules (access, 2FA, provenance) as of 2026
3. Whether `postinstall` runs for regular dependency installs, and what npm changed
4. What `require()` / `import` do for a package with `bin` + `postinstall` but no usable entry point
5. Exact tarball contents for 1.49.0
6. How established scaffolds (`create-vite`, `create-next-app`, `degit`, `@angular/cli`) ship
7. Risks of `postinstall`-based scaffolding and the ecosystem-recommended alternative

---

## TL;DR — Decision Summary

| Question | Verdict |
|---|---|
| Is it published? | **Yes.** 29 versions, `latest = 1.49.0`, published **2026-10-30T06:15:16Z**. First publish 2026-05-03. |
| Is it public? | **Yes.** Anonymous registry reads and public search both return it. User-scoped (`@abarcenas`), not an org. No `private: true`. |
| Is it *publishable* today? | **Yes, already done 29 times.** But it publishes with **no `publishConfig`**, so every release depends on remembering `--access public`. |
| Is it *consumable as a library*? | **No.** `main: "index.js"` but **`index.js` is not in the tarball**. `require()` → `MODULE_NOT_FOUND`; `import` → `ERR_MODULE_NOT_FOUND`. |
| Is it consumable as a *scaffold*? | **Yes, with declining reliability.** `npx ai-workflow-setup` works after install; auto-sync via `postinstall` is now blocked by npm 12, pnpm 10, and (default) Yarn. |
| Single biggest defect | Broken `main` pointer + install-time mutation of the consumer repo. |
| Recommended direction | **Keep it a scaffold/CLI** (matches prior art). Drop `main`, drop `postinstall`, add `publishConfig`, add `engines` + `LICENSE`, trim tests from `files`. |

---

## Method & Constraints

No shell was available in this environment (`npm view` / `npm pack` could not be executed). All registry data was obtained from the **npm registry HTTP API**, which is the same source `npm view` reads:

- `GET https://registry.npmjs.org/@abarcenas%2fai-workflow-template` (full packument — equivalent to `npm view <pkg> --json`)
- `GET https://registry.npmjs.org/@abarcenas%2fai-workflow-template/1.49.0` (version manifest)
- `GET https://registry.npmjs.org/-/v1/search?text=abarcenas` (public visibility check, unauthenticated)
- `GET https://data.jsdelivr.com/v1/packages/npm/@abarcenas/ai-workflow-template@1.49.0` (exact tarball file list; cross-checked against `dist.fileCount`)
- `Range: bytes=0-0` on the `.tgz` for the compressed size (`Content-Range: bytes 0-0/433239`)

**Caveat:** `npm pack --dry-run` output below is a *reconstruction* from the published tarball manifest plus the repo's `files` field, not literal command output. Numbers are exact for 1.49.0.

**Note for anyone re-running this on npm 12:** `npm view --json` now always returns an **array** (breaking change in npm 12.0.0), so scripts written against v11 output will break.

---

## 1. Registry Status

### Does it exist?

Yes. No need to confirm name availability — the name is taken by this project.

### `npm view @abarcenas/ai-workflow-template versions` (equivalent)

```
1.1.0   1.2.0   1.13.0  1.14.0  1.15.0  1.16.0  1.18.0  1.19.0  1.20.0
1.21.0  1.23.0  1.25.0  1.26.0  1.28.0  1.29.0  1.32.0  1.33.0  1.34.0
1.38.0  1.39.0  1.40.0  1.41.0  1.43.0  1.44.0  1.45.0  1.46.0  1.47.0
1.48.0  1.49.0
```

29 versions. Dist-tags: `{ "latest": "1.49.0" }` only — no `next`/`beta` channels.

### Latest publish timeline (most recent 5)

| Version | Published |
|---|---|
| 1.45.0 | 2026-09-14T11:37:00Z |
| 1.46.0 | 2026-10-25T10:20:26Z |
| 1.47.0 | 2026-10-25T13:05:07Z |
| 1.48.0 | 2026-10-30T03:45:37Z |
| **1.49.0** | **2026-10-30T06:15:16Z** |

### `npm view --json` (key fields, 1.49.0)

```json
{
  "name": "@abarcenas/ai-workflow-template",
  "version": "1.49.0",
  "main": "index.js",
  "bin": { "ai-workflow-setup": "bin/setup.js" },
  "type": "module",
  "license": "ISC",
  "dist": { "fileCount": 167, "unpackedSize": 1672110 },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^12.11.0",
    "sqlite-vec": "^0.1.9",
    "dotenv": "^17.4.2"
  },
  "optionalDependencies": {
    "@xenova/transformers": "^2.17.0",
    "pg": "^8.22.0",
    "pgvector": "^0.3.0"
  },
  "publishConfig": (absent),
  "engines": (absent),
  "exports": (absent),
  "types": (absent),
  "private": (absent)
}
```

### Is the scope public / is the package public?

- **Package: public.** Retrieved anonymously; also returned by the unauthenticated public search API with `"publisher": {"username": "abarcenas"}` and ~849 monthly downloads.
- **Scope: a user scope, not an organization.** Created implicitly by publishing `@abarcenas/*`; also hosts `@abarcenas/atomic-styles` and `@abarcenas/ai-writer`.
- **No `private: true`** in the manifest, so npm does not refuse publication.
- **No `publishConfig`**, so public visibility is maintained only by passing `--access public` on each publish (see §2).

### Registry observations worth flagging

- **Zero provenance attestations.** `dist.attestations` is absent on 1.49.0, while `create-vite`, `create-next-app`, and `degit` all ship them today.
- **No `engines`** — despite a hard dependency on `better-sqlite3` (native build) and an ESM `bin` using top-level `await`.
- **The internal package.json comment key ships to consumers.** `"//": "Never add AGENTS.project.md or opencode.json to files..."` appears in the published manifest — consumers will see your maintainer note in their lockfile-era tooling.

---

## 2. Scoped-Package Publishing Rules (2026)

**Source:** [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages) (last edited 2026-09-29)

Direct quotes:

> "By default, scoped packages are published with private visibility. To publish a scoped package with public visibility, use `npm publish --access public`."

> "To publish directly with `npm publish --access public`, you need either: Two-factor authentication (2FA) enabled on your account, or A granular access token (GAT) with bypass 2FA enabled."

> "Staging the package does not require 2FA, which allows CI workflows to submit a package to the staging area. Before the package becomes publicly available, a maintainer must review and approve it with 2FA."

### What this means concretely

| Rule | Detail |
|---|---|
| Default visibility for `@scope/name` | **restricted** unless `--access public` or `publishConfig.access: "public"` |
| First publish | Visibility is effectively decided here — the provenance docs add: "If you are publishing a package for the first time you will also need to explicitly set access to public" |
| Subsequent publishes | The package is already public, so `npm publish` keeps it public; there is no automatic flip back to private. Passing `--access restricted` later is not the supported way to change visibility (use the *Changing package visibility* flow). |
| **Recommended durable form** | `"publishConfig": { "access": "public", "provenance": true }` — removes the human-memory dependency from all 29 future releases |
| 2FA (as of 2026) | Mandatory for direct publishing (account 2FA **or** GAT with 2FA bypass) |
| Staged publishing | `npm stage publish` needs no 2FA; `npm stage approve <id>` always requires 2FA — **a GAT with bypass-2FA does not bypass approval 2FA** |
| Provenance | **Optional, not required.** `npm publish --provenance` requires a cloud CI runner (GitHub Actions / GitLab CI) with `id-token: write`; must be produced from CI, cannot be forged locally. Trusted publishing (OIDC) generates it automatically and removes the need for `NODE_AUTH_TOKEN` entirely. |
| Granular tokens | npm 12.1.0 added "read-write-stage-only" GATs, aligning tokens with staged publishing |

**Verdict for this repo:** publishability is already proven empirically (29 releases). The gap is *reproducibility*, not capability — nothing in `package.json` enforces public access or attestation.

---

## 3. Do Lifecycle Scripts Run for Regular Dependencies?

### npm ≤ 11: **Yes.**

[Scripts — npm CLI v11](https://docs.npmjs.com/cli/v11/using-npm/scripts), under *npm install*:

> "These also run when you run `npm install -g <pkg-name>`: `preinstall`, `install`, `postinstall`, `prepublish`, `preprepare`, `prepare`, `postprepare`"

The list is the *installed package's* lifecycle, and the note only clarifies that global installs are also covered. A regular dependency install runs `postinstall`.

Also relevant — the same page's *Working Directory for Scripts*:

> "Scripts are always run from the root of the package folder… If you want your script to behave differently based on the directory you were in when you ran `npm`, you can use the `INIT_CWD` environment variable"

This is exactly what `scripts/sync.js` does (`scripts/sync.js:354-358` resolves `consumerRoot` from `INIT_CWD`, falling back to `process.cwd()`), so it writes into the **consumer's project root**, not `node_modules`.

### npm 12: **No — blocked by default.** (The important change.)

npm CLI **v12.0.0**, released **2026-07-08**, breaking changes list:

> "Dependency lifecycle scripts are now blocked by default unless allowed by the root package's `allowScripts` policy. After installing, run `npm install-scripts approve` to record approvals and `npm rebuild` to execute newly approved scripts."

[`npm approve-scripts`](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts) (v12.2.1) confirms the mechanics:

> "Dependency install scripts are blocked by default. Install commands silently skip lifecycle scripts for any dependency that does not have a matching entry in `allowScripts`, and end with a list of the packages whose scripts were skipped so you can review them with this command."

Escape hatches introduced:

- `allowScripts` field in the **root** `package.json`, written by `npm install-scripts approve` (v12 pins `pkg@1.2.3` by default; `--no-allow-scripts-pin` allows any version)
- `--allow-scripts=canvas,sharp` at install time
- `npm config set allow-scripts=... --location=user` for global/npx contexts
- `npm deny-scripts` for explicit denials (name-only entries, and existing `false` entries always win)

**Why now:** the 2025 Shai-Hulud npm worm propagated through install scripts and compromised hundreds of packages ([Unit 42](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/), [Microsoft Security — Shai-Hulud 2.0](https://www.microsoft.com/en-us/security/blog/2025/12/09/shai-hulud-2-0-guidance-for-detecting-investigating-and-defending-against-the-supply-chain-attack/)). npm 12's default-deny is the ecosystem's response.

### Cross-package-manager reality

| Tool | Dependency `postinstall` default |
|---|---|
| npm ≤ 11 | **Runs** |
| **npm 12+** (latest 12.2.1) | **Blocked** unless in root `allowScripts` |
| **pnpm 10+** | **Blocked** since v10.0.0 — requires `pnpm.onlyBuiltDependencies` ([pnpm discussion #8945](https://github.com/orgs/pnpm/discussions/8945)) |
| **Yarn (Berry / v4)** | **Blocked** — `enableScripts` default is `false`: "If false (the default), Yarn will not execute the postinstall scripts from third-party packages" ([yarnrc reference](https://yarnpkg.com/configuration/yarnrc)) |
| Bun | Runs, though it has its own trusted-dependency list |

**Conclusion:** the package's own README warning (`.postinstall` echoes "npm postinstall scripts will be blocked by npm v12+") is **factually correct**, and the situation is now *worse* than that line implies — the two most common alternatives (pnpm, Yarn) already block it too.

---

## 4. "Library" vs "CLI/Scaffold": What Happens on `require` / `import`?

### Current package shape

| Field | Value | Shipped in tarball? |
|---|---|---|
| `main` | `"index.js"` | **No — file does not exist in repo or tarball** |
| `exports` | absent | — |
| `bin` | `ai-workflow-setup` → `bin/setup.js` | Yes |
| `type` | `module` | — |
| `postinstall` | `node ./scripts/sync.js && node ./scripts/normalize-memory.js && …` | Scripts present |

`index.js` exists **only** at `scripts/setup/index.js` (the setup orchestrator), not at the package root. `npm`'s `files` docs state that "The file in the `main` field" is *always included* regardless of `files` — so if `index.js` existed, it would ship. It does not exist, so nothing is included.

### `require('@abarcenas/ai-workflow-template')`

Node CommonJS resolution (`modules.html`, *All Together* pseudo-code) for a directory:

```
LOAD_AS_DIRECTORY(X)
1. If X/package.json is a file,
   a. Parse X/package.json, and look for "main" field.
   c. let M = X + (json main field)
   d. LOAD_AS_FILE(M)          <- node_modules/@abarcenas/ai-workflow-template/index.js : MISSING
   e. LOAD_INDEX(M)            <- .../index.js/index.js : MISSING
   f. LOAD_INDEX(X) DEPRECATED <- .../index.js : MISSING
   g. THROW "not found"
```

**Result: `MODULE_NOT_FOUND` (a thrown error, not a warning, not a no-op).** Node documents: "If the given path does not exist, `require()` will throw a `MODULE_NOT_FOUND` error."

### `import '@abarcenas/ai-workflow-template'`

ESM `PACKAGE_RESOLVE` resolves the bare specifier to the package's `main` target URL; `ESM_RESOLVE` then has:

> "If the file at *resolved* does not exist, then Throw a *Module Not Found* error."

**Result: `ERR_MODULE_NOT_FOUND`.**

### So what *is* it?

It is a **side-effectful scaffold shipped as a dependency**: install succeeds, `postinstall` rewrites the consumer's repo (on the package managers that still allow it), and `node_modules/.bin/ai-workflow-setup` appears. Importing it fails. This is not a "library" by any definition — there is no programmatic API surface.

### Practical consequence of the missing entry point

A consumer who writes `import x from '@abarcenas/ai-workflow-template'` gets a resolution error at build time. A consumer who swaps in `"type": "module"` and a bundler may instead see a bundler-specific "entry not found" error. Either way it is a **hard failure**, which is preferable to a silent no-op but is still a defect: `main` advertises a contract the package cannot honour.

---

## 5. Tarball Contents (1.49.0)

Numbers below are from the published tarball (jsDelivr file manifest, cross-validated against `dist.fileCount = 167`).

### `npm pack --dry-run` reconstruction

```
npm notice package: @abarcenas/ai-workflow-template@1.49.0
npm notice === Tarball Contents ===
npm notice total files:  167
npm notice package size: 423.1 kB   (433,239 bytes compressed)
npm notice unpacked size: 1.67 MB   (1,672,110 bytes)
```

### Composition by top-level path

| Path | Files | Bytes | Share of unpacked |
|---|---|---|---|
| `scripts/` | 47 | 830,060 | 49.6% |
| `.agents/` | 87 | 648,729 | 38.8% |
| `.opencode/` | 20 | 141,932 | 8.5% |
| `AGENTS.md` | 1 | 16,524 | 1.0% |
| `README.md` | 1 | 16,510 | 1.0% |
| `skills-lock.json` | 1 | 5,300 | 0.3% |
| `memory-bank/.vocabulary.json` | 1 | 3,206 | 0.2% |
| `package.json` | 1 | 2,771 | 0.2% |
| `.github/workflows/` | 2 | 1,942 | 0.1% |
| `opencode.mcp.example.json` | 1 | 1,864 | 0.1% |
| `bin/` | 1 | 1,449 | 0.1% |
| `.husky/` | 3 | 1,104 | 0.1% |
| `.prettierignore` | 1 | 719 | 0.04% |

### Requested inclusion checks

| Item | Included? | Note |
|---|---|---|
| `bin/` | ✅ | Only `bin/setup.js` (1,449 B) — the CLI shim |
| `scripts/` | ✅ | 47 files, **including 23 `*.test.js` files = 552,955 B (33.1% of unpacked size)** |
| `.agents/` | ✅ | 87 files — the actual payload (instructions + 34 skills) |
| `opencode.mcp.example.json` | ✅ | Present at root |
| `LICENSE` | ❌ | **Missing.** `license: "ISC"` with no licence text shipped |
| `index.js` | ❌ | **Missing, yet `main` points at it** |
| `coverage/`, `playwright-report/` | ✅ excluded | Correctly absent |
| `.opencode/agents/` | ✅ | 15 files (the agent definitions) |
| `.husky/pre-commit` | ✅ | Ships despite `files` listing only `post-merge` and `post-commit` — the `.husky/` directory entry pulls in all three |

### Flags

1. **`main` → nonexistent file.** Hard defect (§4).
2. **Tests in production tarball.** 23 files / 553 KB / 33% of unpacked size. Consumers pay download + disk + IDE-index cost for `sync-unit.test.js` (63 KB alone).
3. **No `LICENSE` file** while claiming `ISC`. Any downstream compliance scan flags this.
4. **`.agents/instructions/learned-knowledge.instructions.md` ships (153 KB)** even though `scripts/sync.js:18-20` explicitly excludes it from sync. It is the single largest file in the tarball — intentional as reference material, but worth a conscious decision.
5. **`bin` name ≠ package name** (`ai-workflow-setup` vs `@abarcenas/ai-workflow-template`). `npx ai-workflow-setup` only resolves from `node_modules/.bin` after installation; from a clean directory there is no registry package by that name, so the from-scratch form is `npx --package @abarcenas/ai-workflow-template ai-workflow-setup`. (Not executed here — inferred from bin-resolution rules.)
6. **`devDependencies` ship in the manifest** (husky, vitest, playwright). Harmless — npm does not install them for consumers — but they advertise a test stack to every consumer.

---

## 6. Comparable Prior Art

Registry manifests fetched live (`/latest`), repo `package.json` for the `files` field (npm strips `files` from the published manifest — verified against `vite`, `vitest`, `degit`, `@angular/cli`, all of which lack it too).

| Package | Version | `main` | `bin` | `postinstall` | `files` (repo) | Files / unpacked | Provenance |
|---|---|---|---|---|---|---|---|
| `create-vite` | 9.3.3 | **none** | `index.js` (×2 names) | **none** | `index.js`, `template-*/**`, `dist` | 242 / 850 KB | ✅ |
| `create-next-app` | 16.4.3 | **none** | `dist/index.js` | **none** | `dist` | 238 / 876 KB | ✅ |
| `degit` | 3.10.1 | `dist/index.js` | `degit` | **none** | — | 15 / 508 KB | ✅ |
| `@angular/cli` | 22.2.5 | `lib/cli/index.js` | `bin/ng.js` | **none** | — | 348 / 1.5 MB | ❌ |
| **this package** | 1.49.0 | `index.js` **(dangling)** | `bin/setup.js` | **`sync` + `normalize-memory`** | see §5 | 167 / 1.67 MB | ❌ |

### The convention, stated plainly

**`create-vite` (`packages/create-vite/package.json`):**

```json
{
  "files": ["index.js", "template-*/**", "dist"],
  "bin": { "create-vite": "index.js", "cva": "index.js" },
  "scripts": {
    "dev": "tsdown --watch",
    "build": "tsdown",
    "typecheck": "tsc",
    "prepublishOnly": "npm run build",
    "execute": "node index.js"
  },
  "engines": { "node": "^20.19.0 || >=22.12.0" }
}
```

- **Template payload ships via `files`** (`template-*/**`) — the tarball *is* the template.
- **No `main`, no `exports`** — strictly a `bin` package.
- **No install-time lifecycle hooks at all.** Only `prepublishOnly` (build).
- `engines` pins Node; provenance attestation present.

**`create-next-app` (`packages/create-next-app/package.json`):**

```json
{
  "files": ["dist"],
  "bin": { "create-next-app": "./dist/index.js" },
  "scripts": { "dev": "...", "build": "...", "prebuild": "..." },
  "engines": { "node": ">=20.9.0" }
}
```

- Compiled to `dist`, **`bin` only**, **no `main`**, **no `postinstall`**.
- Templates are bundled into `dist` at build time rather than shipped as loose files.

**`degit`** is the exception with a real `main` (`dist/index.js`) *and* a `bin` — but it also has **no `postinstall`**, because it only copies templates when explicitly invoked.

### The pattern

> Scaffolds ship the payload inside the package (`files`), expose exactly one `bin`, declare `engines`, and **do all work when the user runs the command** — never at install time.

Zero of the four comparables have a `postinstall`. All three that scaffold projects (`create-vite`, `create-next-app`, `degit`) are `bin`-first. Two of them deliberately omit `main` entirely rather than point it at a file that isn't a library API.

---

## 7. Risks of `postinstall`-Based Scaffolding

### Failure modes, ranked by likelihood for this package

| # | Failure mode | Effect on this package |
|---|---|---|
| 1 | **npm 12 default-deny** | `postinstall` silently skipped; consumer gets `.agents/` **never synced**, plus an "unreviewed scripts" notice they must act on. Silent because npm runs no script and the README's "the package runs postinstall" promise becomes false. |
| 2 | **pnpm 10+ / Yarn default-deny** | Same silent skip. `pnpm.onlyBuiltDependencies` / `enableScripts: true` required. |
| 3 | **`--ignore-scripts` in CI** | Ubiquitous in hardened pipelines (and is the pre-npm-12 workaround). Sync never happens; build succeeds with a hollow `.agents/`. |
| 4 | **Transitive dependency** | If anything ever depends on this package, **every** install of that parent mutates the parent's repo root (via `INIT_CWD`) with `.agents/`, `.opencode/`, `scripts/`, `.husky/`. This is the most dangerous mode: unreviewed writes triggered by a third party's dependency graph. |
| 5 | **Corporate registries / Artifactory / Nexus** | Mirrors often run `--ignore-scripts` or block packages with install scripts outright; also caches the tarball so the *first* install's script outcome defines nothing for later consumers. |
| 6 | **Monorepo / workspace roots** | `INIT_CWD` is the workspace root where the command ran, not necessarily the intended package — sync can land one level off. |
| 7 | **Docker `npm ci --omit=dev` + cache layers** | Script output lands in a layer that is often discarded; a rebuilt image silently lacks the scaffold. |
| 8 | **Failure aborts install** | `sync.js`/`normalize-memory.js` are chained with `&&`, so a non-zero exit fails the whole install. Any fs permission issue (read-only checkout, CI cache) breaks `npm i` for an unrelated-looking reason. |

### Why the ecosystem moved away

Install scripts are the primary RCE vector in npm supply-chain attacks — the 2025 Shai-Hulud worm self-propagated through `postinstall` hooks, stealing credentials and republishing trojanized versions. npm 12, pnpm 10, and Yarn's default `enableScripts: false` are all the same policy: **code from a dependency must not execute merely because it was resolved.**

### The recommended replacement

**Explicit, user-invoked setup:**

```bash
npm i -D @abarcenas/ai-workflow-template
npx ai-workflow-setup            # or: npx --package @abarcenas/ai-workflow-template ai-workflow-setup
```

This is exactly what `create-vite`, `create-next-app`, `@angular/cli`, and `degit` do: one command, one moment of consent, deterministic and idempotent, works identically under npm/pnpm/yarn/bun, and survives `--ignore-scripts`.

The repo already has this path (`bin/setup.js` → `scripts/setup/index.js`, with `--dry-run`, `--force`, `--skip-hooks`, `--skip-sync`, `--knowledgebase`, `--help`). **`postinstall` is now redundant with a better mechanism that already exists.**

---

## What Is Already True vs What Must Change

### Already true (no work needed)

- ✅ Package name is claimed and public on npm; 29 versions published; `latest` tag healthy.
- ✅ Versioning discipline exists (`bump-version.js`, semver-ish cadence).
- ✅ A proper CLI entry point exists: `bin/setup.js` with documented flags and exit codes.
- ✅ The payload (`.agents/`, `.opencode/`, `scripts/`, `AGENTS.md`) ships correctly via `files`.
- ✅ `repository`, `homepage`, `bugs` all point at the real GitHub repo.
- ✅ Build artifacts (`coverage/`, `playwright-report/`) are correctly excluded.
- ✅ The README already documents `npx ai-workflow-setup` as the future-proof path.

### Must change (to be a clean npm artifact)

| Priority | Change | Rationale |
|---|---|---|
| **P0** | Remove `"main": "index.js"` (or add a real `index.js`) | Dangling entry point → `MODULE_NOT_FOUND` on every import attempt |
| **P0** | Remove `postinstall` | Blocked by npm 12 / pnpm 10 / Yarn; mutates consumer repos, including transitively |
| **P1** | Add `"publishConfig": { "access": "public", "provenance": true }` | Removes reliance on remembering `--access public`; adds attested builds |
| **P1** | Add `"engines": { "node": ">=22.22.2" }` (match npm 12's own floor) | `better-sqlite3` native build + ESM TLA have real minimums |
| **P1** | Add `LICENSE` (ISC) | Compliance; npm always ships `LICENSE` if present |
| **P2** | Exclude `**/*.test.js` from `files` | −23 files, −553 KB (−33% unpacked) |
| **P2** | Remove the `"//"` comment key | It ships verbatim into every consumer's manifest view |
| **P2** | Add `"exports": { "./package.json": "./package.json" }` | Turns a silent missing-entry into an explicit `ERR_PACKAGE_PATH_NOT_EXPORTED`, and documents "this is not an importable library" |
| **P3** | Decide whether 153 KB `learned-knowledge.instructions.md` should ship | Largest single file; excluded from sync anyway |

### What "deployable as an npm library" would additionally require

If the intent is genuinely a **library**, not a scaffold:

1. A real root module (`index.js` or `src/index.js`) with a coherent public API — e.g. `export { sync, normalizeMemory }`.
2. An `exports` map with `"."`, conditions for `import`/`require` (or ESM-only), and `"./package.json"`.
3. `types` / `.d.ts` (there are none today).
4. **Zero install-time side effects** — the API must be callable, not automatically applied.
5. A documented semver contract for that API (the current cadence bumps minor versions 1.46→1.49 in six days; a library API would make those breaking changes).
6. `engines`, `LICENSE`, `publishConfig.provenance` as above.

This is a substantially larger change than the scaffold fix and contradicts the product shape (a config payload, not a runtime dependency).

---

## Recommendation

**Keep the scaffold model — it already matches the ecosystem convention — and repair the three defects.**

Concretely:

```jsonc
{
  "name": "@abarcenas/ai-workflow-template",
  "version": "1.50.0",
  "type": "module",
  // "main" removed — this package is not importable by design
  "exports": { "./package.json": "./package.json" },
  "bin": { "ai-workflow-setup": "./bin/setup.js" },
  "engines": { "node": ">=22.22.2" },
  "publishConfig": { "access": "public", "provenance": true },
  "files": [
    "bin/",
    ".agents/",
    "scripts/",
    "!scripts/**/*.test.js",
    ".opencode/agents/",
    ".opencode/commands/",
    ".github/workflows/",
    ".husky/post-merge",
    ".husky/post-commit",
    "memory-bank/.vocabulary.json",
    "AGENTS.md",
    "opencode.mcp.example.json",
    "skills-lock.json",
    "LICENSE"
  ],
  "scripts": {
    // "postinstall" removed
    "sync": "node ./scripts/sync.js"
  }
}
```

Then update `README.md` §Install: the `postinstall` paragraph ("The package runs `postinstall` to sync files") becomes false and must be replaced with the explicit `npx ai-workflow-setup` step. Add a "Why no postinstall?" note citing npm 12 / pnpm 10 / Yarn defaults — it is a trust signal, not a limitation.

**Migration note for existing consumers:** a minor version that removes `postinstall` changes behaviour for anyone relying on auto-sync. Either (a) ship it as `2.0.0`, or (b) keep `postinstall` for one more minor with a deprecation banner, then remove it. Given npm 12 already blocks it for a large share of installs, option (a) with a clear changelog entry is cleaner.

---

## External Resources

| Source | URL | Used for |
|---|---|---|
| npm registry packument | `https://registry.npmjs.org/@abarcenas%2fai-workflow-template` | Versions, dist-tags, publish times |
| npm registry version manifest | `https://registry.npmjs.org/@abarcenas%2fai-workflow-template/1.49.0` | `main`, `bin`, deps, `dist` |
| npm public search API | `https://registry.npmjs.org/-/v1/search?text=abarcenas` | Public visibility, publisher, downloads |
| jsDelivr package file API | `https://data.jsdelivr.com/v1/packages/npm/@abarcenas/ai-workflow-template@1.49.0` | Exact 167-file tarball manifest |
| npm Docs — scoped public packages | https://docs.npmjs.com/creating-and-publishing-scoped-public-packages | `--access public`, 2FA, staged publishing |
| npm Docs — provenance | https://docs.npmjs.com/generating-provenance-statements | `--provenance`, first-publish access, trusted publishing |
| npm Docs — scripts (v11) | https://docs.npmjs.com/cli/v11/using-npm/scripts | Lifecycle order, `INIT_CWD`, working directory |
| npm Docs — `approve-scripts` (v12) | https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts | Default-deny install scripts, `allowScripts` |
| npm CLI v12.0.0 release notes | https://github.com/npm/cli/releases/tag/v12.0.0 | Dated breaking change (2026-07-08) |
| npm Docs — package.json | https://raw.githubusercontent.com/npm/cli/latest/docs/lib/content/configuring-npm/package-json.md | `files` always-includes `main`/`bin`; `private`; `publishConfig` |
| Node.js — Packages | https://nodejs.org/api/packages.html | `main` semantics, exports precedence |
| Node.js — CommonJS | https://nodejs.org/api/modules.html | `LOAD_AS_DIRECTORY` → `THROW "not found"` |
| Node.js — ESM | https://nodejs.org/api/esm.html | "If the file at resolved does not exist… Throw a Module Not Found error" |
| pnpm 10 discussion | https://github.com/orgs/pnpm/discussions/8945 | Dependency lifecycle scripts blocked by default |
| Yarn yarnrc reference | https://yarnpkg.com/configuration/yarnrc | `enableScripts` default `false` |
| Unit 42 — Shai-Hulud | https://unit42.paloaltonetworks.com/npm-supply-chain-attack/ | Motivation for install-script hardening |
| Microsoft Security — Shai-Hulud 2.0 | https://www.microsoft.com/en-us/security/blog/2025/12/09/shai-hulud-2-0-guidance-for-detecting-investigating-and-defending-against-the-supply-chain-attack/ | Same |
| create-vite package.json | https://raw.githubusercontent.com/vitejs/vite/main/packages/create-vite/package.json | Prior-art `files`/`bin`, no `postinstall` |
| create-next-app package.json | https://raw.githubusercontent.com/vercel/next.js/canary/packages/create-next-app/package.json | Prior-art `files`/`bin`, no `postinstall` |

---

## Limitations

- **No shell.** `npm view` / `npm pack --dry-run` / `npx` were not executed. Registry numbers are authoritative for 1.49.0; `npm pack` figures are reconstructed and would not include any uncommitted local changes.
- **No install experiment.** Behaviours of `require()`/`import` are derived from Node's documented resolution algorithms, not observed at runtime.
- **`npx ai-workflow-setup` from a clean directory** is inferred from bin-resolution rules, not verified.
- **Yarn and pnpm findings** are from their documentation/release announcements, not from installs in this repo.
