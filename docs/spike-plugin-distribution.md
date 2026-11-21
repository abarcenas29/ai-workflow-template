---
id: "spike-plugin-distribution"
title: "Spike: OpenCode plugin distribution to package consumers"
updated: "2026-11-07"
tags: [scope, spike, plugin-distribution, opencode, plugins, sync, documentation]
doc_type: "spike"
---

# Spike: OpenCode plugin distribution to package consumers

**Date:** 2026-11-07
**Status:** ✅ COMPLETE
**Produced by:** Scope - Feature Scoping

---

## 1. Problem Statement

The request was: "I want my plugins be included when installed in a project directory." The
requester believed `graphify.js` loaded only because their user-level OpenCode config referenced
it, and worried that a consumer on another machine would not have it.

Inspection corrected the premise. The package already publishes `.opencode/plugins/` in the npm
tarball (`package.json:53-68`), and `npx ai-workflow-setup` already copies every file in that
directory to `<consumer>/.opencode/plugins/` (`scripts/sync.js:623-664`). OpenCode V2
auto-discovers those files, so the plugin loads on a fresh consumer machine with no user-level
config and no `plugins` entry. Nothing about the load mechanism needs to change.

What is actually missing is consumer-facing knowledge, plus one scaffold defect:

1. The README names the plugin once, in a directory tree (`README.md:125`), and never says that
   it ships, what it does, what prerequisite it needs, or how to remove it.
2. A fresh consumer's `opencode.json` is copied from `opencode.mcp.example.json`
   (`scripts/sync.js:869-884`), which declares the third-party plugin
   `@tarquinen/opencode-dcp@latest` (`opencode.mcp.example.json:75-77`). It is undocumented and
   unpinned.

**In scope:** the plugin the template ships (`graphify.js`), the third-party plugin the scaffold
declares (`@tarquinen/opencode-dcp`), and the consumer-facing README story for both.

**Out of scope:** writing new plugins, changing the graphify hook's behaviour, vendoring or
forking dcp, a plugin registry/marketplace, a first-class opt-out flag, `.agents-sync-ignore`
glob support, a `postinstall` hook, the local-update detector fix, and any change to setup output.

---

## 2. Investigation Results — Decisions Settled

| # | Decision | Rationale | Round |
|---|----------|-----------|-------|
| D-1 | Inclusion is a functional requirement, not a documentation-only one. | The package must actually deliver the plugin to a consumer. It already does: `.opencode/plugins/` is in the tarball (`package.json:53-68`) and is copied by sync (`scripts/sync.js:623-664`). The remaining gap is knowledge and one scaffold defect. | 1 |
| D-2 | `.opencode/plugins/` is the unlisted distribution unit: every file in it ships and syncs. | Sync walks the directory dynamically with `collectFiles()` and excludes only `node_modules`, `package.json`, `package-lock.json`, `bun.lock`, and `.gitignore` (`scripts/sync.js:48-54,625-664`). No per-file allow-list exists, so adding a plugin later needs no packaging change. | 1 |
| D-3 | No first-class opt-out in v1. The plugin is inert without a graph, and a locally edited plugin file is never overwritten. | `graphify.js` returns before mutating anything unless `graphify-out/graph.json` exists (`.opencode/plugins/graphify.js:33`). Sync skips a file whose hash differs from the manifest (`scripts/sync.js:653-662`), so a local edit is durable. A plain deletion is not: the next sync restores the file. | 1 |
| D-4 | The explanation lives in the README only, in plain language. | Confirmed as the only consumer-facing document surface; `AGENTS.md` contains no occurrence of "plugin". Setup output stays unchanged (D-9), so the README carries the whole story. | 1 |
| D-5 | The README states the full contract, not a one-liner: what ships, how it loads, what it does, the graph prerequisite, the opt-out, and the restart requirement. | A tree line is not enough for a plugin that mutates shell commands. The contract must be readable without opening the source. | 1 |
| D-6 | Keep the dcp entry in the consumer scaffold. | `opencode.mcp.example.json:75-77` is copied verbatim to a fresh consumer's project-root `opencode.json` (`scripts/sync.js:869-884`). Removing it would silently change what every new project receives. | 2 |
| D-7 | `graphify.js` loads by V2 auto-discovery only; no `plugins` entry is added for it. | `.opencode/opencode.json:1-3` is schema-only; the V2 docs state that direct `.js`/`.ts` files under `.opencode/plugins/` load with no config entry; `tests/spec-plugin-v2-contract.test.js:555-584` asserts the repo config declares neither `plugin` nor `plugins`. | 2 |
| D-8 | `npx ai-workflow-setup` remains the required install step. No `postinstall`. | Stated in `README.md:12,60`; `package.json:8-26` defines no lifecycle script, and `scripts/sync-unit.test.js:1593` asserts `scripts.postinstall` is undefined. | 2 |
| D-9 | Setup output stays unchanged. No new phase, no per-plugin table row. | `scripts/setup/index.js:1-23` runs eight phases; adding a plugin line would duplicate the README without adding a durable record. | 2 |
| D-10 | The README states the OpenCode V2 requirement. | `graphify.js` is a V2 default-export module with `setup(ctx)` and `ctx.tool.hook` (`.opencode/plugins/graphify.js:1-7,16-45`). OpenCode V1 rejects that shape at load. Setup has no version gate, so the README is the only signal. | 2 |
| D-11 | The `plugins`-key over-match in the update detector is a separate follow-up, not part of this change. | The detector reads `<consumer>/.opencode/opencode.json` (`scripts/setup/local-update.js:126-129,139-152`); the scaffold writes `<consumer>/opencode.json` at the project root (`scripts/sync.js:873-884`). A fresh consumer never has the inspected file, so no notice fires from the scaffold and nothing needs suppressing here. | 2 (corrected in 3) |
| D-12 | Ship and document both plugins, each by its natural load path: graphify by auto-discovery, dcp by declaration in the scaffolded `opencode.json`. dcp is declared, never vendored. | Only this reading satisfies D-6 and D-7 together. dcp is a compiled npm package (not local source), so merging files is infeasible; listing graphify in `plugins` would contradict D-7. OpenCode resolves configured plugins by specifier and caches them; a copy in the tarball would not load. | 3 |
| D-13 | Pin `@tarquinen/opencode-dcp@3.2.0`, the build verified on this machine, and bump it deliberately in a template release. | The resolved package is 3.2.0 (`~/.cache/opencode/npm/@tarquinen/opencode-dcp@latest/1794043268030/node_modules/@tarquinen/opencode-dcp/package.json:4`). The specifier is resolved literally and re-resolved on a new fetch (the cache directory is named `…@latest/…`), so `@latest` gives each consumer whatever is newest that day. The scaffolded `opencode.json` is project-owned and never rewritten, so there is no later correction path. | 3 |
| D-14 | The README documents both plugins in one new section, including dcp's purpose, licence, and removal steps. | D-6 makes dcp part of what the package delivers. Without an explanation, a consumer finds a copy-left third-party plugin in their config with no context and no removal instruction. | 3 |

### Evidence

- `package.json:53-68` — `files` lists `.opencode/plugins/` (line 60). The plugin is in the
  published tarball today.
- `scripts/sync.js:623-664` — the `.opencode/` copy pass collects every file, skips
  project-owned paths and the `openCodeExcluded` set (`:48-54`), and copies the rest. A fresh
  consumer gets `.opencode/plugins/graphify.js`.
- `scripts/sync.js:653-662` — a consumer's locally modified copy is skipped with a warning, not
  overwritten. This is the existing, undocumented opt-out.
- `scripts/sync.js:29-42` — `projectOwnedPaths` includes `opencode.json` and reserves
  `.agents-sync-ignore`; the comment at `:33-35` states its globs are not honoured. There is no
  supported per-file opt-out.
- `scripts/sync.js:869-884` — `opencode.mcp.example.json` is copied to the consumer's
  project-root `opencode.json` only when that file does not exist.
- `.opencode/plugins/graphify.js:1-49` — V2 default-export plugin: one `execute.before` hook,
  shell tool only, at most one reminder per setup, inert without
  `<project>/graphify-out/graph.json` (`:33`). Imports only `fs` and `path`.
- `.opencode/opencode.json:1-3` — schema only; no `plugin` or `plugins` key.
- `README.md:122-125` — the post-install tree names `.opencode/plugins/` in one line (125).
  `README.md:253-267` — the "Knowledge Graph (graphify)" section documents the `/graphify`
  command and its prerequisites but never mentions the plugin.
- `opencode.mcp.example.json:75-77` — `scripts/sync.js:869-884` copies this, so a fresh
  consumer's `opencode.json` declares `@tarquinen/opencode-dcp@latest`.
- `~/.cache/opencode/npm/@tarquinen/opencode-dcp@latest/1794043268030/node_modules/@tarquinen/opencode-dcp/package.json:4,9,58,60`
  — version 3.2.0; description "optimizes token usage by pruning obsolete tool outputs from
  conversation context"; licence `AGPL-3.0-or-later`; peer `@opencode-ai/plugin >=1.18.29`.
- `scripts/setup/local-update.js:126-129,139-152` — the detector inspects
  `.opencode/opencode.json` for a `plugins` key. It cannot fire for a fresh consumer, because
  neither the package nor the scaffold writes that path.
- `scripts/setup/local-update.js:282-287` — the codebase already tells consumers to restart
  OpenCode because "plugins load at startup".
- `scripts/sync-unit.test.js:1558-1580` — reads the real `opencode.mcp.example.json` but asserts
  only the `instructions` entry, for both the shipped example and the scaffolded config.
  `:666-668,752-758` use a synthetic `MCP_EXAMPLE`. Nothing asserts the `plugins` array.
- `tests/spec-plugin-v2-contract.test.js:28-31,555-584` — plugin discovery is dynamic and the
  repo's own `.opencode/opencode.json` must declare neither `plugin` nor `plugins`. It does not
  inspect the consumer example.
- `opencode.json:78-80` and `~/.config/opencode/opencode.json:30-32` — both declare
  `@tarquinen/opencode-dcp@latest`. Neither explains graphify: the repo config is not shipped,
  and the user config is not a load path for any repo file.

**Correction carried into this spike.** Round 2 recorded that a freshly scaffolded consumer
config "is then flagged as stale" by the package's own notice. Round 3 disproved it: the
detector (`scripts/setup/local-update.js:126-129`) and the scaffold (`scripts/sync.js:873-884`)
read and write different paths. The over-match is still real for a consumer who writes
`plugins` into `.opencode/opencode.json`, but it is not caused by this scaffold and this change
does not silence anything.

### 2.1 Change surface — exact files and anchors

| # | File | Anchor | Change |
|---|------|--------|--------|
| C-1 | `opencode.mcp.example.json` | `:75-77`; the value is on `:76` | Replace `"@tarquinen/opencode-dcp@latest"` with `"@tarquinen/opencode-dcp@3.2.0"`. Leave the `plugins` array and every other key untouched. |
| C-2 | `README.md` | `:125` | Update the tree comment from `# graphify knowledge-graph plugin` to `# graphify plugin (loaded automatically)`. The tree still describes `.opencode/plugins/` only — dcp does not live there. |
| C-3 | `README.md` | Insert immediately before `:253` (`## Knowledge Graph (graphify)`) | Add the new `## OpenCode plugins` section outlined below. `:253-267` stays byte-identical; only its line numbers shift. |
| C-4 | Tests | none | No existing test asserts the example's `plugins` array. `scripts/sync-unit.test.js:1558-1580` reads the real example but checks only `instructions`; `:666-668,752-758` use a synthetic fixture; `tests/spec-plugin-v2-contract.test.js:555-584` inspects `.opencode/opencode.json`, not the example. The pin needs no fixture edit. |

Do **not** change: `package.json:53-68` (it already ships the plugin directory), `.opencode/opencode.json`
(must stay free of `plugin`/`plugins`), `scripts/sync.js`, `scripts/setup/local-update.js`, setup
output, or `AGENTS.md`.

If the pin is bumped later, C-1 and the README line that quotes the specifier must move in the
same commit — the README will show `@tarquinen/opencode-dcp@3.2.0` literally.

### 2.2 README section outline — plain language

Target text for C-3. Short sentences, no internal jargon, no claim that is not backed above.

````markdown
## OpenCode plugins

Your project can load two plugins. One comes with this template. The other is a
third-party plugin that setup adds to `opencode.json` if the file is missing.

### graphify — ships with this template

`npx ai-workflow-setup` copies a small plugin file to
`.opencode/plugins/graphify.js`.

OpenCode finds it by itself. It looks in `.opencode/plugins/` when it starts. You
do not need to add anything to `opencode.json`.

**What it does:** before the first shell command in a session, it adds a short
reminder about `graphify-out/`. The reminder tells the agent to run
`graphify query` instead of grepping raw files. It adds the reminder at most once
each time OpenCode starts.

**When it does nothing:** if your project has no `graphify-out/graph.json`, the
plugin stops before it changes anything. Build a graph with `/graphify` — see
[Knowledge Graph](#knowledge-graph-graphify).

**To turn it off:**

- Do nothing. Without a graph, the plugin has no effect.
- To remove it for good, open `.opencode/plugins/graphify.js` and replace it with
  a plugin that does nothing:

  ```js
  export default { id: "graphify", setup() {} };
  ```

  Setup skips files you have changed, so it will not put the plugin back unless
  you pass `--force`. You also stop getting template updates for that file.
- Deleting the file is not permanent. The next `npx ai-workflow-setup` copies it
  again.

### @tarquinen/opencode-dcp — third-party

A new project's `opencode.json` declares this plugin:

```json
"plugins": ["@tarquinen/opencode-dcp@3.2.0"]
```

**What it does:** it removes old tool output from the conversation to save tokens.

**Licence:** AGPL-3.0-or-later, a copyleft licence: share your changes if you
redistribute it. The plugin is not bundled with this template. OpenCode fetches
it from npm and caches it the first time your project starts.

**To remove it:** delete the entry from the `plugins` array in `opencode.json`,
then restart OpenCode. `opencode.json` belongs to your project — setup never
rewrites it.

### Requirements

- **OpenCode V2.** The graphify plugin is written for V2. OpenCode V1 cannot load
  it.
- **Setup is the install step.** Installing the npm package copies nothing. There
  is no `postinstall` script; run `npx ai-workflow-setup`.
- **Restart OpenCode after setup or an upgrade.** Plugins load when OpenCode
  starts.
````

---

## 3. Open / Deferred Questions

| # | Question | Why deferred | Reopens when |
|---|----------|--------------|--------------|
| O-1 | The update detector treats any `plugins` key in `.opencode/opencode.json` as deprecated, although V2 documents it as the key for explicitly configured plugins (`scripts/setup/local-update.js:139-152`). | Q12 settled it as a separate follow-up. It cannot fire on a fresh consumer, so it does not block this change. | A consumer is observed writing `plugins` into `.opencode/opencode.json`, or the detector is next edited. |
| O-2 | `.agents-sync-ignore` globs as a general per-file opt-out. | Reserved but not honoured (`scripts/sync.js:33-35`); already recorded as deferred in `memory-bank/progress.md` and far larger than this request. | A consumer needs a supported per-file opt-out that sync actually reads. |
| O-3 | A first-class flag or command to disable a shipped plugin. | Q3 settled that v1 has none; the durable opt-out is a local edit, which sync preserves. | Consumers report the local-edit route is too obscure, or a plugin needs selective disabling without losing template updates. |
| O-4 | Whether a regression test should assert the shipped example declares the pinned dcp entry. | Nothing constrains the example's `plugins` array today, and the copy mechanism is already covered generically. The pin edit needs no test change. | The example's content changes again, or an unpin/drop reaches `main`. |

**Explicitly out of scope for this spike:** the detector fix (O-1), an opt-out flag (O-3),
`.agents-sync-ignore` support (O-2), a `postinstall` hook, vendoring or forking dcp, new plugins,
changing the graphify hook's behaviour, and converting these decisions into tickets.

---

## 4. Decision / Recommendation

**Recommended next step:** `implementer` — no `researcher` step is required.

The load path is already established from the official V2 plugin docs, the shipped source
(`.opencode/plugins/graphify.js`), the existing contract tests, and the sync and scaffold code.
No open question needs external evidence, and no prototype is needed: every remaining unknown is
a recorded deferral. The work is two files and no production code: one JSON string in
`opencode.mcp.example.json:76`, one tree comment at `README.md:125`, and one new README section
before `README.md:253`. `implementer` should turn §2.1 and §2.2 into a short plan with a doc
verification step; no test fixture change is required.

### Risks carried into implementation

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R-1 | Every fresh consumer's config declares an **AGPL-3.0-or-later** third-party plugin. | A consumer with a copyleft-sensitive policy receives a dependency they did not choose. | The README names the licence and gives removal steps; `opencode.json` is project-owned, so removal is permanent. Accepted by D-6/D-14; revisit if the policy changes. |
| R-2 | Pinning to 3.2.0 removes automatic updates for dcp. | Consumers silently stay on an old build and miss fixes. | Bump deliberately in a template release; README shows the pinned specifier. Existing consumers must edit their own `opencode.json` — the README says how. |
| R-3 | Consumers still on **OpenCode V1**. | `graphify.js` cannot load; the plugin is absent and may log a load error. Setup has no version gate. | D-10's README requirement line is the only mitigation. Do not add a runtime version check in this change. |
| R-4 | No test guards the example's `plugins` array. | A future edit can unpin or drop the entry without a failing test. | Reviewer checks the diff; regression assertion is O-4. |
| R-5 | The local-edit opt-out also freezes template updates for `graphify.js`. | A consumer who edits the file never receives plugin fixes. | The README states this trade-off explicitly. |
| R-6 | dcp must be fetched from npm on first start after setup. | An offline or restricted-network machine sees a failed plugin load until the fetch succeeds. | Low severity; the README says OpenCode fetches and caches it. |

---

## 5. External Resources

| Source | What it established |
|--------|---------------------|
| `https://opencode.ai/docs/plugins/` (V2 docs, fetched 2026-11-07) | "OpenCode also loads direct .ts and .js files and immediate plugin package directories from every discovered `.opencode/plugins/` directory." A `plugins/` directory beside a project-root `opencode.json(c)` is **not** discovered automatically — hence the file lives under `.opencode/`. |
| `docs/research/v2-plugin-contract-verification.md:365-395` | The V2 plugin contract was verified previously. The distributed file deliberately avoids importing `@opencode/plugin`, so a consumer needs no SDK install. |
| `~/.cache/opencode/npm/@tarquinen/opencode-dcp@latest/1794043268030/node_modules/@tarquinen/opencode-dcp/package.json:4,9,58,60` | dcp resolves to 3.2.0; purpose is token pruning of tool output; licence AGPL-3.0-or-later; peer `@opencode-ai/plugin >=1.18.29`. |
| `~/.config/opencode/opencode.json:30-32` | The requester's user-level config declares only dcp. It is not the load path for the repo plugin. |
| Repo files cited in §2 | Shipping, sync, scaffold, detector, and test behaviour. |

No additional external research is needed to proceed.

---

## 6. Decision Trail

| When | Action | Result |
|------|--------|--------|
| Round 1 (2026-11-07) | Asked Q1–Q5 | Q1, Q3, Q4, Q5 settled; the scope question (Q2) was based on a mistaken premise and was reopened as Q6/Q7. |
| Round 2 (2026-11-07) | Asked Q6–Q12 | Q7–Q12 settled; the "combine the two plugins" reading could not be pinned down, so it became Q13. |
| Round 3 (2026-11-07) | Asked Q13–Q15 | All three answered "all yes": both plugins by their natural path, dcp pinned to 3.2.0, README covers both. Frontier empty. |
| Round 3 (2026-11-07) | Wrote this spike | Terminated. |

**Status history:** `drafting` → `complete` on 2026-11-07.
