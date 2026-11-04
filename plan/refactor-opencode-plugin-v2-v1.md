---
goal: "Port the shipped graphify OpenCode plugin from the V1 hook-map API to the V2 default-definition API, delete the stale single-file plugin config entry, align the local plugin SDK pin, and add the contract plus behavioural test that would have caught the silent load failure"
version: 1
date_created: 2026-11-04
status: Completed
tags: [refactor, opencode, plugin, v2-migration, graphify, testing, contract, configuration]
---

# Plan: Port OpenCode Plugins to the V2 Plugin API (v1)

## Introduction

**Status:** ✅ Completed · **Runtime under repair:** OpenCode 2.2.5 · **Source diagnosis:** `docs/plugin-failure-diagnosis.md` in the original workspace root (untracked, therefore **not present in this worktree**) — PLUG-001, PLUG-002, PLUG-003, PLUG-005, PLUG-007.

OpenCode 2 is a full reimplementation of the V1 plugin API. The workspace still ships a V1 plugin — a named export that returns a `{ "tool.execute.before": fn }` hook map — so the runtime rejects it at load with `PluginModule.LoadError: Plugin must export a default definition with an id and an effect or setup function`. The failure is WARN-level and silent: no exit code, no UI banner, no test. A second, independent defect registers the same file through the deprecated singular `plugin` config key with a single-file path, which the runtime treats as an npm package name and fails to install. A third defect — the V1 hook body matching `"bash"` and `output.args` — is latent: fixing only the module shape converts a loud load failure into a silent no-op, because V2 names the tool `shell` and passes one mutable `event` whose payload is `event.input`.

This plan ports the plugin to the V2 default-definition shape, removes the duplicate config path, aligns the authoring dependency, and adds the two-layer regression gate (module contract + behavioural hook assertion) that the repository currently lacks. Accuracy is the primary constraint: the V2 API surface below was verified against the published `@opencode/plugin@2.2.5` types and the V2 docs, not inferred. Where a fact could not be proven statically, it is marked `ASSUMPTION-001` and has a preceding verification task.

**Scope:** one shipped plugin file (tracked, distributed), one new Vitest spec, one verification note, and three local-only local-environment changes that are git-ignored and therefore absent from the worktree (config entry, SDK pin, manifest hash).

**Out of scope (see §Out of Scope):** the global `herdr` plugin (PLUG-004), the `knowledgebase` MCP `DATABASE_URL` gap (PLUG-006), the global `~/.config/opencode/package.json` pin, and `OBS-001` (legacy `permission` object).

### Distribution reality (read before assigning tasks)

Three facts about this repository change what "fixed" means, and none of them is visible from the diagnosis alone. **Verified with `git check-ignore` and `git ls-files` in the workspace root on 2026-11-04.**

1. `.opencode/plugins/graphify.js` **is shipped and tracked** — it is in `package.json` `files` (`".opencode/plugins/"`), is synced by `scripts/sync.js` through the `__opencode__/` channel, and is present in the worktree. Fixing it fixes every consumer on their next sync, and this is the only functional fix that appears in the PR diff.
2. `.opencode/opencode.json` **is not shipped and not tracked** — root `.gitignore:2` ignores `opencode.json` at every depth, and `scripts/sync.js` also treats it as project-owned (`projectOwnedPaths` contains `opencode.json`; the comment at `scripts/sync.js:29-36` states the channel-agnostic over-match is intentional). It is **absent from the worktree**. The fix removes a local failure only; consumers never received this file and it must not be described as a fleet-wide config fix.
3. `.opencode/package.json`, `.opencode/package-lock.json`, and `.agents-sync-manifest.json` **are git-ignored and never appear in the PR diff** — `.opencode/.gitignore` lists the first two; root `.gitignore:4` lists the third. T2 created the first two inside the worktree, where they remain untracked; `.agents-sync-manifest.json` is absent. `scripts/sync.js` also excludes `.opencode/package.json` and its lock (`openCodeExcluded`). Any change there is a local developer-environment change: it will not appear in `git diff`, will not ship, and cannot be asserted unconditionally in CI.

**Consequence for task execution:** T2 and T3 create/edit these ignored files **inside the worktree** (they do not exist there), which is what makes T6's local verification meaningful. The durable copies at the original workspace root are **not writable by this run** (rule W-5) and remain stale until the operator replays the same local changes (plus one manifest refresh) after the branch is shipped — see §Local Post-Run Actions. Do not claim the PR fixes the local config on its own.

### Verified V2 contract (evidence for every API claim in this plan)

| Fact | Verified value | Evidence |
|---|---|---|
| SDK package identity | `@opencode/plugin@2.2.5` — **different package name** from V1's `@opencode-ai/plugin`; a version bump cannot fix the drift | `registry.npmjs.org/@opencode/plugin/2.2.5`; description *"Authoring interfaces and runtime loader support for OpenCode V2 plugins"* |
| Plugin definition type | `interface Plugin { readonly id: string; readonly setup: (context: Context) => Promise<Cleanup \| void> \| Cleanup \| void }`; `define(plugin: Plugin): Plugin` is identity | `unpkg.com/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts` |
| Definition accepted by the loader | a **default export** object carrying `id` plus `setup` **or** `effect`; a plain object is structurally valid, `Plugin.define` is not required | loader error text in `docs/plugin-failure-diagnosis.md`; `plugin.d.ts`; docs "Support V1" example |
| Location | `ctx.location.directory` (absolute), plus optional `workspaceID` and `project` | `plugin.d.ts` (`readonly location: Location.Info`); docs "Context" |
| Tool hook registration | `await ctx.tool.hook("execute.before", (event) => …)`; returns `Promise<Registration>` | `dist/promise/tool.d.ts` (`ToolDomain.hook`); docs "Tools" |
| `execute.before` event | `{ tool: string, sessionID, agent, messageID, id, input: unknown }` — one **mutable event**, not separate `input`/`output` | `dist/promise/tool.d.ts`; V2 migration doc quoted in the diagnosis |
| Shell tool name | **`shell`** (V1: `bash`) | V2 Tools doc: *"This task typically uses grep or glob, read, an editing tool, and shell"*; config policy example uses `"resource": "shell:git push *"` |
| Shell input field | `input.command` — **`ASSUMPTION-001`**, verified only indirectly (V2 Tools doc describes `command`, `workdir`, `timeout`, `background`; the known-good `apmc-cms` port mutates `input.command`) | docs "Commands › Shell"; `/Users/aldrichallenbarcenas/develop/apmc-cms/.opencode/plugins/graphify.js:21-24` |
| Known-good reference port | `export default { id: "graphify", async setup(ctx) { await ctx.tool.hook("execute.before", (event) => …) } }` — loads with no WARN in the runtime log | `apmc-cms/.opencode/plugins/graphify.js:10-27`; log evidence in the diagnosis |

**Decision — plain object, not `Plugin.define`.** The shipped file must not import `@opencode/plugin` at runtime: consumer projects do not receive `.opencode/package.json` (git-ignored, sync-excluded), so an import would fail to resolve in exactly the environments the file is distributed to. The reference port already uses a plain object and is proven to load. See ALT-01.

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T3 | **Yes** — three different files/artifacts, no shared write | — |
| B | T4 | No (single task; must observe the V1 module to record the RED run) | A (T1) |
| C | T5 | No (single task; the only edits to the shipped plugin) | A (T1), B (T4) |
| D | T6 | No (single task; final gate) | A (T2, T3), C (T5) |
| E | T7 | No (single task; added during execution, user-requested) | A (T2, T3) |

Only **Batch A** is safe to fan out to parallel coders. Batches B–D are ordered because each one consumes the previous batch's output (RED evidence → port → verification). Do not merge T4 and T5 into one parallel invocation: T4 must run against the unmodified V1 plugin, and T5 rewrites that file.

---

## Requirements & Constraints

| ID | Type | Requirement |
|----|------|-------------|
| REQ-001 | Plugin shape | `.opencode/plugins/graphify.js` MUST export a **default** object with a non-empty string `id` (`"graphify"`) and an async `setup(ctx)` function. It MUST NOT export a V1 hook map and MUST NOT rely on a `server()` fallback. |
| REQ-002 | Hook wiring | The hook MUST be registered with `await ctx.tool.hook("execute.before", callback)`. The graph path MUST resolve from `ctx.location.directory`. The callback MUST match tool name `"shell"` and MUST mutate `event.input.command`. |
| REQ-003 | Config single load path | `.opencode/opencode.json` MUST contain no `plugin` and no `plugins` key. Auto-discovery of `.opencode/plugins/` is the only load path, eliminating the spurious npm-install attempt (PLUG-002) and the duplicate load (PLUG-007). The worktree copy is the execution target; the root copy is replayed after ship (§Local Post-Run Actions). |
| REQ-004 | SDK alignment | `.opencode/package.json` MUST declare `@opencode/plugin` at `2.2.5` (the runtime major.minor.patch) and MUST NOT declare `@opencode-ai/plugin`. `.opencode/package-lock.json` MUST be regenerated consistently. Both files are git-ignored and absent from the worktree (CON-003), so the task creates them there; the root copies are replayed after ship. |
| REQ-005 | Module contract test | A committed Vitest spec MUST discover every file in `.opencode/plugins/*.{js,mjs,ts}`, import it, and assert `default` is an object with a non-empty string `id` and a callable `setup` or `effect`. It MUST fail against the current V1 module. |
| REQ-006 | Behavioural assertion | The same spec MUST assert behaviour, not just shape: with a temp `graphify-out/graph.json`, an `execute.before` event with `tool: "shell"` and `input: { command: "ls" }` MUST have its command prefixed; a non-shell tool MUST NOT be touched. This is the assertion that catches PLUG-005. |
| REQ-007 | No stale reference | No **tracked config file** may reference the removed `plugin` or `plugins` key. The audit uses `git grep` over tracked files, not a working-tree grep, because the ignored config file itself is absent from the worktree; the untracked historical diagnosis in the workspace root and `plan/**` are excluded by design. |
| REQ-008 | Evidence note | A short verification note MUST record each V2 API fact with its source, so the reviewer can check the port against evidence rather than trust the diff. |
| SEC-001 | Security | The plugin MUST NOT read credentials, secrets, or environment variables, and MUST NOT execute the command it rewrites. It only prepends a literal `echo` prefix. No new network, filesystem-write, or process authority is introduced. |
| SEC-002 | Injection safety | The prefix is a fixed literal and the original command is appended verbatim after `&&`; the plugin does not quote, parse, or re-interpret it. The reminder **text** is preserved byte-for-byte (CON-008); the **escaping** was corrected so backticks and double quotes are emitted literal instead of being executed by the shell (see T5). |
| CON-001 | No runtime import | The shipped plugin MUST import only `node:fs` and `node:path` (or `fs`/`path`). It MUST NOT import `@opencode/plugin`, any npm package, or any project script. |
| CON-002 | Worktree writes | All edits land inside the run's worktree. `memory-bank/**` is tracker-owned and is not written by this plan's tasks. |
| CON-003 | Local-only dependency | `.opencode/package.json` and `.opencode/package-lock.json` are git-ignored and sync-excluded; the plan MUST NOT claim they change consumer behaviour, and CI MUST NOT require them. |
| CON-004 | Project-owned config | `.opencode/opencode.json` is project-owned by the channel-agnostic `opencode.json` rule in `scripts/sync.js`; the plan MUST NOT claim the config fix ships to consumers. |
| CON-005 | Coverage gate | Vitest coverage includes only `scripts/**/*.{js,ts}` (`vitest.config.ts`). The new spec lives in `tests/` and MUST NOT be added to the coverage include list; the 90% thresholds stay untouched. |
| CON-006 | Historical docs frozen | `docs/plugin-failure-diagnosis.md` is a dated diagnosis and MUST NOT be edited. It may be cited, never rewritten. |
| CON-007 | Test hermeticity | The new spec MUST use a temporary directory (`mkdtempSync`) and MUST NOT depend on `graphify-out/graph.json` existing in the repository, on a running OpenCode server, or on the network. |
| CON-008 | Preserve public copy | The reminder text a user sees is product copy. T5 MUST preserve it byte-for-byte; only the JS/shell escaping wrapper may change. |

---

## Implementation Steps

### Phase 1 — Contract verification and independent config/dependency work (Batch A — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T1 | Verification gate. Confirm every V2 API fact used by T5 against primary sources: `@opencode/plugin@2.2.5` package identity and `Plugin`/`Context` types (`dist/promise/plugin.d.ts`), `ctx.tool.hook("execute.before")` and the event shape `{ tool, input }` (`dist/promise/tool.d.ts`), `ctx.location.directory`, and the tool name `shell`. Then attempt the runtime probe for `ASSUMPTION-001` **without spending a model session**: create a temporary V2-shaped probe file at `.opencode/plugins/zz-contract-probe.js` whose `setup(ctx)` calls `await ctx.tool.list()`, finds the entry whose `id` is `"shell"`, and writes that entry's `input` schema (and the list of tool ids) to a log file under the worktree's `.tmp/`. Restart OpenCode once, read the logged schema to confirm the command field name, then **delete the probe file** and its log. The probe is intentionally temporary and MUST NOT be present when T4 runs. If no restart is possible, record `ASSUMPTION-001` as **unresolved**, state the blocker, and stop trying. Write the table of facts + sources + probe outcome to the verification note. **Deviation:** no runtime probe was run — the published `@opencode/core@2.2.5/dist/types/tool/plugin/shell.d.ts` declares the `shell` tool's input as `{ command, workdir?, timeout?, background? }`, which settles `ASSUMPTION-001` statically, so no OpenCode restart was needed and no probe file was created. | `docs/research/v2-plugin-contract-verification.md` | A | — | ✅ | 2026-11-04 |
| T2 | Align the local authoring SDK. The target file is git-ignored and **absent from the worktree**, so create `.opencode/package.json` with `{ "dependencies": { "@opencode/plugin": "2.2.5" } }` (replace the V1 entry if a copy exists; never keep both). Run `npm install` inside `.opencode/` so `package-lock.json` and `node_modules` are materialised consistently, then confirm `@opencode/plugin` resolves 2.2.5 and `@opencode-ai/plugin` does not. Do not add an import of the SDK to the plugin (CON-001). Note that neither file is tracked. **Executed:** created the file; `npm ls @opencode/plugin` → `2.2.5`, `@opencode-ai/plugin` absent (V1 SDK not installed). A local `.opencode/.gitignore` now ignores `package.json`/`package-lock.json`/`node_modules/` (`git check-ignore` confirms), so neither appears in `git status`. | `.opencode/package.json`, `.opencode/package-lock.json` | A | — | ✅ | 2026-11-04 |
| T3 | Remove the stale config entry. The target file is git-ignored and **absent from the worktree**: if absent, create `.opencode/opencode.json` containing only `{"$schema": "https://opencode.ai/config.json"}`; if present, delete the `plugin` key block, leaving the `$schema` key and valid JSON. Do not add a `plugins` key: auto-discovery already loads `.opencode/plugins/` and adding a configured path recreates PLUG-007's duplicate-load surface. **Executed:** created the file with `$schema` only; `JSON.parse` succeeds and neither `plugin` nor `plugins` is present. `git grep` over tracked `*.json|*.jsonc|*.js|*.md|*.sh|*.yml|*.yaml` finds no `"plugin"` or `"plugins"` config key. | `.opencode/opencode.json` | A | — | ✅ | 2026-11-04 |

**Validation criteria**

- **T1:** the note contains one row per API fact, each with a URL or a file path plus a line reference; the shell tool name is supported by at least two independent sources (V2 Tools doc + config policy example), or directly by the probe's tool list; the `input.command` row is either marked **verified** with the observed schema/keys or explicitly marked `ASSUMPTION-001 — unresolved` with the blocker stated. No claim is sourced from the diagnosis alone. `.opencode/plugins/` contains only `graphify.js` when the task completes (`ls .opencode/plugins`), and no probe file or log is staged in `git status`.
- **T2:** `node -e "console.log(require('./.opencode/node_modules/@opencode/plugin/package.json').version)"` prints `2.2.5` (run from the repository root with a path that resolves) or `npm ls @opencode/plugin` inside `.opencode/` shows `2.2.5`; `npm ls @opencode-ai/plugin` reports nothing; `git status --porcelain` shows no change for either file (proves CON-003).
- **T3:** `node -e "JSON.parse(require('node:fs').readFileSync('.opencode/opencode.json','utf8'))"` exits 0; the parsed object has `$schema` and **no** `plugin` and **no** `plugins` property.

---

### Phase 2 — Regression gate (sequential)

Depends on T1 (Batch A).

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T4 | **Carries `ASSUMPTION-001`** — the fake `execute.before` event mirrors the assumed `{ tool, input: { command } }` payload; T1 is the preceding verification task. Write the committed spec `tests/spec-plugin-v2-contract.test.js` following the `tests/spec-*.test.js` style (Vitest, `node:fs`, repo-root-relative paths, no external dependencies). It has four groups: (a) **discovery + module contract** — list `.opencode/plugins/*.{js,mjs,ts}`, assert the list is non-empty, dynamically `import()` each via `pathToFileURL`, assert `default` is a non-null object, `typeof default.id === 'string'` and trimmed length > 0, and `typeof setup === 'function' \|\| typeof effect === 'function'`. For the module whose `id` is `graphify`, additionally assert `typeof default.setup === 'function'` (not merely `effect`), matching REQ-001; (b) **graphify registration** — call `await plugin.default.setup(fakeCtx)` where `fakeCtx = { location: { directory: tmpDir }, tool: { hook: async (name, cb) => { registrations.push({ name, cb }); return { dispose: async () => {} } } } }`, assert exactly one registration and `name === "execute.before"`; (c) **behaviour** — create `tmpDir/graphify-out/graph.json`; invoke the callback with `{ tool: "shell", input: { command: "ls" } }` and assert the command starts with `echo "[graphify]` and still ends with `&& ls`; assert a second invocation does not double-prefix; assert `{ tool: "read", input: { path: "x" } }` is untouched; assert a missing/non-string `input.command` neither throws nor mutates; repeat with a temp directory that has no graph file and assert no mutation; (d) **config regression** — if `.opencode/opencode.json` exists, parse it and assert `plugin` and `plugins` are both `undefined`; skip the group when the ignored file is absent (always true in CI). Conditionally, if `.opencode/package.json` exists, assert no `@opencode-ai/plugin` dependency (skip when absent so CI stays green on a clean checkout). **RED checkpoint:** run the spec against the unmodified V1 plugin first and record the failing output (expected: `default` is undefined). Do not edit the plugin in this task. **Executed:** `npx vitest run tests/spec-plugin-v2-contract.test.js` → 8 failed / 3 passed (11 tests), every failure an assertion (not a load/syntax error) with the message `.opencode/plugins/graphify.js must default-export a V2 plugin definition object. Found: no default export at all.`; the second failure names the V1 named export explicitly (`Named export(s) found: GraphifyPlugin`). Full `npm run test:unit` → 1 failed file (this spec) / 28 passed, 8 failed / 845 passed. Behavioural assertions were dry-run against the T1 §8 reference port in a throwaway module (14/14 pass), so the positive path is satisfiable by T5. Note: the spec asserts `tool: "bash"` is ignored, so T5 MUST match only `"shell"` — see the deviation report. | `tests/spec-plugin-v2-contract.test.js` | B | T1 | ✅ | 2026-11-04 |

**Validation criteria**

- **T4:** `npx vitest run tests/spec-plugin-v2-contract.test.js` fails on the V1 module with a message naming the missing `default` export; the failing run is pasted into the task's completion note (or the tracker log) as RED evidence; the spec file contains no network call, no absolute path from the author's machine, and no import of the plugin by a hard-coded absolute path.
- The temp-directory cleanup runs even on assertion failure (`afterEach` with `rmSync(..., { recursive: true, force: true })`).

---

### Phase 3 — Port the plugin (sequential)

Depends on T4 (Batch B) and T1 (Batch A).

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T5 | **Carries `ASSUMPTION-001`** if T1 leaves it unresolved. Rewrite `.opencode/plugins/graphify.js` to the V2 shape, modelled on the `apmc-cms` reference port (read it; do not blindly copy). **Shape:** `export default { id: "graphify", async setup(ctx) { … } }`, plain object, no import of `@opencode/plugin` (ALT-01 / CON-001). **Hook:** `await ctx.tool.hook("execute.before", (event) => { … })`; keep a per-setup `let reminded = false`; early-return when `reminded`; early-return unless `existsSync(join(ctx.location.directory, "graphify-out", "graph.json"))`; early-return when `event.tool` is neither `"shell"` nor `"bash"` (accepting `"bash"` is harmless and documents the V1 rename); read `const input = event.input`, early-return unless it is a non-null object with `typeof input.command === "string"`; set `input.command = \`${REMINDER} && ${input.command}\`` and `reminded = true`. **Text:** define `REMINDER` as a single literal, preserving the exact user-facing reminder from the current file (CON-008) and adopting the reference port's shell escaping (backtick and double-quote escapes) so the emitted command is identical. **No cleanup return** — the hook lives for the plugin's process lifetime (documented `Registration.dispose` is runtime-owned; see ALT-02). Do **not** touch `.agents-sync-manifest.json`: it is git-ignored and absent from the worktree, and the local copy is refreshed after ship (§Local Post-Run Actions). **Executed:** ported to `export default { id: "graphify", async setup(ctx) { … } }` with exactly one `ctx.tool.hook("execute.before", …)` registration and a per-setup `reminded` latch. **Deviation from this row's wording:** the tool match is `event.tool !== "shell"` only — there is no `"bash"` branch. T4's spec asserts that a `bash` event causes NO mutation, so the earlier "shell or bash" instruction in this row is superseded by the test (see T4's completion note). The reminder copy is byte-identical to the V1 text (258 characters) after removing the shell-escape layer. `npx vitest run tests/spec-plugin-v2-contract.test.js` → 11/11 pass (RED baseline: 8 failed / 3 passed); `npm run test:unit` → 853/853 across 29 files. | `.opencode/plugins/graphify.js` | C | T1, T4 | ✅ | 2026-11-04 |

**Validation criteria**

- `npx vitest run tests/spec-plugin-v2-contract.test.js` now passes all four groups (shape, registration, behaviour, config).
- The reminder text in the new file is byte-identical to the old text after removing the JS/shell escaping layer; diff the human-readable string, not the raw source.
- The file has no `import` other than `node:fs` and `node:path`; `grep -n "from \"" .opencode/plugins/graphify.js` shows no package import.
- `git status --porcelain` shows only `plan/`, `tests/`, `docs/research/`, and the modified plugin — no ignored file was force-added (`git status --ignored --porcelain .opencode` is acceptable evidence).
- If T1 left `ASSUMPTION-001` unresolved, the `input.command` guard in the port is the mitigation (a wrong field name produces a no-op, never a crash) and the task completion note repeats the assumption verbatim.

---

### Phase 4 — Verification (sequential)

Depends on T2 and T3 (Batch A) and T5 (Batch C).

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T6 | Prove the plugin loads and nothing else regressed. Run, in order: (1) `npx vitest run tests/spec-plugin-v2-contract.test.js`; (2) `npm run test:unit` (full Vitest suite — no regressions); (3) a real import smoke test: `node --input-type=module -e "const m = await import('./.opencode/plugins/graphify.js'); console.log(m.default.id, typeof m.default.setup)"` from the worktree root, expecting `graphify function`; (4) a reference audit for the removed config key over **tracked** files: `git grep -n '"plugin"' -- '*.json' '*.jsonc'` and `git grep -n '"plugins"' -- '*.json' '*.jsonc'`, expecting zero config hits; then the positive distribution check `git grep -n '".opencode/plugins/"' -- package.json` (the fixed file must still ship; `memory-bank/.vocabulary.json` legitimately contains the word "graphify", so do not grep the bare word). Historical `docs/plugin-failure-diagnosis.md` is untracked and absent from the worktree, and `plan/**` is excluded by design — CON-006; (5) if an OpenCode server can be restarted by the operator, the **manual** runtime check: note the current time, restart OpenCode, then `grep 'graphify.js' ~/.local/share/opencode/log/opencode.log \| tail -20` and confirm a `msg="loading plugin"` line for the worktree path with **no** `failed to load plugin` line after it. Mark step (5) as executed or skipped-with-reason; it is not a CI gate. Record every command and its output in the completion note. | None (read-only verification) | D | T2, T3, T5 | ✅ | 2026-11-04 |

**Validation criteria**

- Steps (1)–(4) all pass and their output is recorded. Step (3) prints `graphify function`.
- No file outside the worktree is modified by verification.
- If step (5) is skipped, the reason is explicit (`requires an OpenCode restart; not runnable from this agent`) and the limitation is carried into the PR body, not dropped.

---

### Phase 5 — Consumer migration notice (added during execution, user-requested)

T2 and T3 edit files that are git-ignored, so no package upgrade can deliver them. This phase adds an advisory notice to the existing setup path telling the consumer what to replay locally. It was requested by the user during execution and is not part of the original scope.

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T7 | Add the consumer-facing local-update notice. Implement `scripts/setup/local-update.js`: read `.opencode/opencode.json` and `.opencode/package.json`, mark the state stale when the config has a `plugin`/`plugins` key or the package declares `@opencode-ai/plugin` or does not pin `@opencode/plugin` at `2.2.5`, and print copy-pasteable migration steps (remove the key; pin the SDK and reinstall; restart OpenCode; port `herdr-agent-state.js`; set `DATABASE_URL`). Call it from `scripts/setup/index.js` after discovery, honouring `--quiet`, and expose a standalone CLI. Non-fatal, silent when up to date, ANSI only on a TTY. **No `postinstall` hook:** npm 12+ blocks lifecycle scripts, the README states the package ships none, and `scripts/sync-unit.test.js:1505` asserts it. | `scripts/setup/local-update.js`, `scripts/setup/index.js` | E (post-A) | T2, T3 | ✅ | 2026-11-04 |

**Validation criteria**

- `node scripts/setup/local-update.js <staleFixture>` exits 0 and prints the notice with no ANSI codes when stdout is piped; the same command against the worktree prints nothing.
- `INIT_CWD=<staleFixture> node bin/setup.js --dry-run --skip-hooks --skip-prepare --skip-sync --skip-knowledgebase --skip-tracker` exits 0 and includes the notice, proving the real setup path invokes it.
- `npm run test:unit` stays green and `npm run test:unit:coverage` stays above the 90% thresholds.

---

## Alternatives

| ID | Alternative | Decision | Rationale |
|----|-------------|----------|-----------|
| ALT-01 | Use `export default Plugin.define({ id, setup })` with `import { Plugin } from "@opencode/plugin"` | **Rejected** | `define()` is identity; the plain object is structurally identical. The import would need `@opencode/plugin` resolvable from `.opencode/plugins/` at runtime, but consumer projects do not receive `.opencode/package.json` (git-ignored + sync-excluded), so the import would fail in exactly the distributed environment. The reference port proves the plain-object shape loads. |
| ALT-02 | Keep a V1 `server()` alongside the V2 `setup()` for dual compatibility | **Rejected for this change** | The docs support the dual shape, but the template's runtime target is OpenCode 2 and no consumer contract in this repository claims V1 support. The dual path doubles the surface no test can exercise. Revisit only if a V1 consumer is identified; the V1 implementation is recoverable from git history. |
| ALT-03 | Keep an explicit `"plugins": [".opencode/plugins"]` entry (plural, directory) | **Rejected** | Auto-discovery already loads the directory. A second configured path recreates PLUG-007's duplicate-load surface and is the exact class of drift this change removes. |
| ALT-04 | Add a `Registration` cleanup return from `setup` | **Rejected** | The hook lives for the process lifetime; the reference port omits cleanup and loads cleanly. Adding `dispose()` creates an untested double-dispose question. Documented as a deliberate non-goal, not an oversight. |
| ALT-05 | Put the contract test in `scripts/plugin-contract.test.js` | **Rejected** | Coverage include is `scripts/**/*.{js,ts}` with 90% thresholds; adding a test-only file there would pull the plugin (which is not covered by policy) into coverage accounting. `tests/**/*.test.js` is the established home for repository-shape specs (`tests/spec-*.test.js`). |
| ALT-06 | Boot OpenCode headless in CI and fail on `failed to load plugin` | **Deferred** | The strongest gate, but it needs a runtime install, a model/provider, and a fixture project in CI. Out of scope here; recorded as RISK-004 / QE recommendation 6. |

---

## Dependencies

| ID | Dependency | Owner / location | Notes |
|----|------------|------------------|-------|
| DEP-001 | OpenCode 2.2.5 runtime | Local machine | Required only for the optional runtime check in T6; the unit gate does not need it. |
| DEP-002 | Published `@opencode/plugin@2.2.5` types | `unpkg.com/@opencode/plugin@2.2.5/dist/promise/{plugin,tool}.d.ts` | Primary source for T1's API table. |
| DEP-003 | OpenCode V2 documentation | `opencode.ai/v2/docs/build/plugins`, `.../build/plugins/server`, `.../docs/tools`, `.../docs/config` | Secondary source; used to cross-check the shell tool name and hook semantics. |
| DEP-004 | `apmc-cms` reference port | `/Users/aldrichallenbarcenas/develop/apmc-cms/.opencode/plugins/graphify.js` | Comparison only. Read it; do not copy it blindly. Its provenance is unknown (diagnosis open question 7). |
| DEP-005 | Vitest 4.x | Root `devDependencies` | Already in CI (`npm run test:unit`). No new dependency for the test. |
| DEP-006 | `mkdtempSync` + `rmSync` | Node.js ≥ 22 (`engines`) | Temp fixture for the behavioural test. |
| DEP-007 | Worktrunk `wt` 0.81.0 | Local machine | Used by the implementer to create the run's worktree; not needed by the coder. |

---

## Files

| ID | File | Change | Tracked? |
|----|------|--------|----------|
| FILE-001 | `.opencode/plugins/graphify.js` | Rewrite to V2 default definition; rename tool/`input`; preserve reminder text | Yes |
| FILE-002 | `.opencode/opencode.json` | Create with `$schema` only (absent in worktree); delete the `plugin` key if a copy is present | **No** — ignored by root `.gitignore:2`; absent from worktree |
| FILE-003 | `.opencode/package.json` | Create with `@opencode/plugin@2.2.5`; no V1 pin | **No** — `.opencode/.gitignore`; absent from worktree |
| FILE-004 | `.opencode/package-lock.json` | Regenerate consistently with FILE-003 | **No** — `.opencode/.gitignore`; absent from worktree |
| FILE-005 | `.agents-sync-manifest.json` | **Not edited in this branch.** Ignored by root `.gitignore:4` and absent from the worktree; refreshed as a local post-run action (§Local Post-Run Actions) | **No** — git-ignored |
| FILE-006 | `tests/spec-plugin-v2-contract.test.js` | New contract + behavioural spec | Yes (new) |
| FILE-007 | `docs/research/v2-plugin-contract-verification.md` | New verification note with API facts and sources | Yes (new) |
| FILE-008 | `docs/plugin-failure-diagnosis.md` | **Read-only reference** — must not be edited (CON-006) | Untracked at run start; absent from worktree |
| FILE-009 | `plan/refactor-opencode-plugin-v2-v1.md` | This plan | Yes (new) |
| FILE-010 | `scripts/setup/local-update.js` | New advisory detector + notice + standalone CLI for the git-ignored local migration (T7) | Yes (new) |
| FILE-011 | `scripts/setup/index.js` | Imports and calls the notice after discovery; `--quiet` suppresses it (T7) | Yes |
| FILE-012 | `.opencode/.gitignore` | Ignores the local SDK pin, lockfile, and `node_modules/` so T2 artifacts never reach the PR diff | Yes (new) |

---

## Testing

| ID | Test | Covers | Layer |
|----|------|--------|-------|
| TEST-01 | Every `.opencode/plugins/*.{js,mjs,ts}` default export is an object with a non-empty string `id` and a callable `setup` or `effect`; `graphify` specifically has a callable `setup`; the discovered file list is non-empty | REQ-005, PLUG-001 | Contract (Vitest) |
| TEST-02 | `graphify` `setup()` registers exactly one hook named `"execute.before"` | REQ-002 | Contract (Vitest) |
| TEST-03 | With a temp `graphify-out/graph.json`, `{ tool: "shell", input: { command: "ls" } }` becomes a command that starts with `echo "[graphify]` and ends with `&& ls` | REQ-006, PLUG-005 | Behaviour (Vitest) |
| TEST-04 | A non-shell tool (`read`) is not mutated | REQ-006 | Behaviour (Vitest) |
| TEST-05 | A second shell event is not double-prefixed (`reminded` latch) | REQ-002 | Behaviour (Vitest) |
| TEST-06 | Without `graphify-out/graph.json`, no mutation occurs | REQ-002 | Behaviour (Vitest) |
| TEST-07 | A missing or non-string `event.input.command` does not throw and does not mutate | REQ-002 | Behaviour (Vitest) |
| TEST-08 | If `.opencode/opencode.json` exists, it parses and has neither `plugin` nor `plugins`; skipped when the ignored file is absent (always true in CI) | REQ-003, PLUG-002 | Config (Vitest, conditional) |
| TEST-09 | If `.opencode/package.json` exists, it has no `@opencode-ai/plugin` dependency; test skips when the file is absent | REQ-004, PLUG-003 (local only) | Config (Vitest, conditional) |
| TEST-10 | Real ESM import of the ported plugin prints `graphify function` | REQ-001 | Smoke (node, T6) |
| TEST-11 | Full `npm run test:unit` stays green | Regression | Suite (T6) |
| TEST-12 | **Manual:** after an OpenCode restart, the log shows `loading plugin` for the worktree's `graphify.js` and no `failed to load plugin` after that timestamp | REQ-001 end-to-end | Runtime (operator, not CI) |
| TEST-13 | `git grep` over tracked `*.json`/`*.jsonc` finds no `"plugin"`/`"plugins"` config key; `package.json` still lists `.opencode/plugins/` in `files` | REQ-007 | Reference audit (T6) |

**Non-vacuity requirement:** the RED run in T4 is the proof that TEST-01 is not vacuous. Do not delete the RED evidence after the port; it is the regression gate's justification. If T4 is re-run after T5 for any reason and passes, verify non-vacuity by temporarily importing a copy of the old V1 module from git history (`git show HEAD:.opencode/plugins/graphify.js`) into a temp file and asserting the same shape checks fail against it.

---

## Risks & Assumptions

| ID | Type | Statement | Mitigation |
|----|------|-----------|------------|
| RISK-001 | Risk | `event.input.command` may not be the shell tool's real payload field; a shape-only fix would then ship a silent no-op — the exact failure mode the diagnosis warns about | T1 runtime probe; if unresolvable, `ASSUMPTION-001` is explicit, the port keeps a defensive `typeof input.command === "string"` guard, and TEST-03 is built on the reference port's proven shape. Do not claim end-to-end success until TEST-12 runs. |
| RISK-002 | Risk | Dropping the V1 named export breaks a consumer still on OpenCode 1.x | The template targets V2 (runtime 2.2.5; config schema is the V2 schema). V1 code remains in git history; ALT-02 records the dual-compat path if a V1 consumer is ever confirmed. |
| RISK-003 | Risk | The config-entry fix, SDK pin, and manifest hash are all git-ignored, so the PR diff cannot fix them at the workspace root; a reviewer may believe the local runtime is fixed when only the worktree copy is | Stated in §Distribution reality, CON-003/CON-004, and §Local Post-Run Actions. TEST-09/TEST-08 are conditional so CI stays green. The PR body must carry the three operator steps verbatim. |
| RISK-004 | Risk | CI still never boots OpenCode, so a future loader-contract change can pass CI silently | This plan adds the shape + behaviour gate, which covers PLUG-001 and PLUG-005. The log-based smoke test (ALT-06) remains the missing control and is carried as a follow-up. |
| RISK-005 | Risk | `@opencode/plugin` pulls a large dependency graph (`effect`, several `@opencode/*` packages) into `.opencode/node_modules` | All peer dependencies are optional (`peerDependenciesMeta` marks vite/electron/solid-js/@opentui/*/theme/vite-plugin-solid optional), so install is self-contained. The files are git-ignored; no repository or tarball impact. |
| RISK-006 | Risk | Refreshing the local manifest post-run with `npm run sync --force` could churn unrelated hashes | §Local Post-Run Actions prefers replacing the single `__opencode__/plugins/graphify.js` value with `shasum -a 256`; if `--force` is used, compare every other hash before accepting it. The manifest is git-ignored, so a mistake is invisible in review but harmless to distribution. |
| RISK-007 | Risk | The project-owned config rule means the `.opencode/opencode.json` fix is local-only, so a reviewer may over-claim consumer impact | Stated in §Distribution reality and CON-004; the PR body must repeat it. |
| RISK-008 | Risk | Test asserts on a private internal shape (`fakeCtx.tool.hook`) that could change between SDK minors | The shape is documented in `dist/promise/tool.d.ts` at 2.2.5 and the test pins intent with clear failure messages; a future contract change should require a deliberate test update, which is the point of the gate. |
| ASSUMPTION-001 | Assumption | The V2 `shell` tool's `execute.before` payload is `{ command: string, … }` at `event.input.command`. Tool name `shell` is verified; the field name is inferred from the V2 Tools doc and the reference port. | Preceding verification task T1 (runtime probe). If unresolved, T5 carries this assumption verbatim; TEST-03 passes only if the field matches, so a wrong guess fails the gate rather than shipping silently — but only if the fake event mirrors reality. TEST-12 is the only end-to-end proof. |
| ASSUMPTION-002 | Assumption | `setup(ctx)` runs on load and the hook registration persists for the process lifetime; no cleanup return is required. | Documented lifecycle in the V2 Server plugin docs ("setup runs when the plugin loads"); reference port omits cleanup. Not a correctness risk for a process-lifetime hook. |

---

## Out of Scope

These items are recorded here so the reviewer does not treat them as missed. They belong in the PR body as explicit non-goals.

| ID | Item | Why out of scope |
|----|------|------------------|
| OOS-001 | **PLUG-004** — `~/.config/opencode/plugins/herdr-agent-state.js` loads but registers nothing under V2 (empty `setup()`, real logic in V1 `server()`) | Outside this repository, vendor-managed by `herdr` (`// managed by herdr; reinstalling or updating the integration overwrites this file`). Fixing it locally would be overwritten; report upstream. |
| OOS-002 | **PLUG-006** — `knowledgebase` MCP server returns `DATABASE_URL is not configured` | Operational environment configuration (`.env` + PostgreSQL/pgvector), not a repository code defect. The server degrades gracefully by design; no code change in this plan. |
| OOS-003 | Global `~/.config/opencode/package.json` pinned to `@opencode-ai/plugin@1.14.39` | Outside the repository and not owned by the template. Only the workspace `.opencode/package.json` is in REQ-004. |
| OOS-004 | **OBS-001** — legacy `permission` object in root `opencode.json` using V1-style MCP prefix keys | Suspected, not confirmed, and unrelated to the plugin load failure. Separating it keeps this diff reviewable. |
| OOS-005 | CI log-based smoke test (ALT-06) and a startup plugin-health assertion | Requires booting OpenCode in CI with a fixture project; a separate infrastructure change. |
| OOS-006 | Rewriting the plugin in TypeScript | `.opencode/plugins/` is loaded directly with no build step; JS keeps distribution simple. |

---

## Local Post-Run Actions (workspace root, operator-owned)

These files are git-ignored, so the branch cannot carry them, and rule W-5 forbids this run from writing the original workspace root. **After the branch is shipped or merged**, the operator replays the same three edits at `/Users/aldrichallenbarcenas/develop/ai-workflow-template` and restarts OpenCode:

1. **Config entry** — replace `.opencode/opencode.json` with `{"$schema": "https://opencode.ai/config.json"}` (no `plugin`, no `plugins`). This is the change that stops the per-activation `NpmInstallFailedError`.
2. **SDK pin** — replace the `@opencode-ai/plugin` dependency in `.opencode/package.json` with `@opencode/plugin: "2.2.5"`, then run `npm install` inside `.opencode/`.
3. **Manifest baseline** — the local `.agents-sync-manifest.json` still records the old plugin hash, so the next self-sync reports the ported file as locally modified. Either run `node scripts/sync.js --force` (in a self-sync, source and target are the same path, so this is a metadata refresh) or replace only the `__opencode__/plugins/graphify.js` value with `shasum -a 256 .opencode/plugins/graphify.js`. Do **not** refresh `__opencode__/opencode.json`: that file is project-owned and never synced.

Do these before the next `npm run sync`, otherwise the stale hash produces a "Skipped locally modified file" warning that looks like a regression but is only bookkeeping.

---

## Related Specifications

| ID | Source | Relevance |
|----|--------|-----------|
| SPEC-001 | `docs/plugin-failure-diagnosis.md` (workspace root, untracked at run start — **not present in this worktree**) | Source diagnosis: PLUG-001/002/003/005/007, evidence, and QE recommendations 1–3. Its verified facts are reproduced in §Verified V2 contract so this plan is self-contained. Do not edit it (CON-006). |
| SPEC-002 | `.agents/instructions/worktree-lifecycle.instructions.md` (untracked at run start — **not present in this worktree**) | Governs the worktree for this run (W-1 to W-10). |
| SPEC-003 | `docs/.architecture-context.md` | Tech stack and layer rules; places `scripts/` and `.opencode/plugins/` in context. |
| SPEC-004 | `/Users/aldrichallenbarcenas/develop/apmc-cms/.opencode/plugins/graphify.js` | Known-good V2 reference port (loads with no WARN). Compare, do not blindly copy. |
| SPEC-005 | `opencode.ai/v2/docs/build/plugins` and `.../build/plugins/server` | Authoritative V2 plugin shape, `setup(ctx)`, `ctx.tool.hook`, `ctx.location`, dual V1/V2 export rules. |
| SPEC-006 | `opencode.ai/v2/docs/build/plugins/migrate-v1` | "V1 plugin implementations do not run in V2"; `plugin` → `plugins`; configured paths must be directories; V1 `server()` vs V2 `setup()`. |
| SPEC-007 | `opencode.ai/v2/docs/tools` | Confirms the tool name `shell`; documents its command/workdir/timeout/background arguments (the exact `command` field name remains `ASSUMPTION-001` until T1's probe). |
| SPEC-008 | `unpkg.com/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts` and `.../tool.d.ts` | Exact `Plugin`, `Context`, `ToolDomain.hook`, and `ToolHooks["execute.before"]` types. |
| SPEC-009 | `vitest.config.ts` and `.github/workflows/pr-test.yml` | Test discovery includes `tests/**/*.test.{js,ts}`; CI runs `npm run test:unit` on PRs. |
| SPEC-010 | `scripts/sync.js` (`projectOwnedPaths`, `openCodeExcluded`, `__opencode__/` channel) | Explains why FILE-002/003/004/005 are local-only and why FILE-001 is the only distributed fix in this branch. |

---

## Task Dependency Graph

```
T1 (Batch A) ──┬──► T4 (Batch B) ──► T5 (Batch C) ──┐
               └────────────────────────────────────┴──► T6 (Batch D)
T2 (Batch A) ────────────────────────────────────────────┤
T3 (Batch A) ────────────────────────────────────────────┘
```

T4 requires T1's API verification. T5 requires T4 (so the RED gate exists first) and T1. T6 requires T2 and T3 (the local config/dependency work) and T5. Batch A is the only parallel group.
