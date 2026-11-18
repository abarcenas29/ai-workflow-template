> **SUPERSEDED** — replaced by docs/spike-plugin-distribution.md on 2026-11-07.

---
id: "spike-plugin-distribution.draft"
title: "Spike draft: OpenCode plugin distribution to package consumers"
updated: "2026-11-07"
status: "drafting"
doc_type: "spike-draft"
tags: [scope, spike, plugin-distribution, opencode, plugins, sync, documentation]
---

# Spike Draft: OpenCode Plugin Distribution to Package Consumers

## Problem Statement

The request is: "I want my plugins be included when installed in a project
directory." The requester believed the plugin was visible only because their
user-level OpenCode config referenced it, and worried that a consumer on another
machine would not have that.

Round 1 inspection corrects the premise. The package already ships
`.opencode/plugins/graphify.js` in the npm tarball (`package.json:53-68`) and
`npx ai-workflow-setup` already copies it to `<consumer>/.opencode/plugins/`
(`scripts/sync.js:623-664`). OpenCode V2 auto-discovers direct `.js`/`.ts` files
under `.opencode/plugins/` with no config entry, so the plugin loads on a fresh
consumer machine without any user-level config. What is actually missing is
consumer-facing knowledge, plus one real scaffold defect: a fresh consumer's
`opencode.json` is copied from `opencode.mcp.example.json`, which injects the
third-party `@tarquinen/opencode-dcp@latest` plugin and is then flagged as stale
by the package's own update notice.

**In scope:** the plugins this package ships (today, `graphify.js`), the stray
third-party entry in the consumer scaffold, and the consumer-facing README story.
**Out of scope (unless a question reopens it):** writing new plugins, changing
the graphify hook behaviour, redistributing the requester's user-level
third-party plugins, and a general plugin marketplace/registry.

## Evidence

- `package.json:53-68` — the `files` array already lists `.opencode/plugins/`, so
  the plugin is published in the npm tarball today.
- `scripts/sync.js:623-664` — the `.opencode/` copy pass walks the whole source
  tree with `collectFiles()` and copies every file that is not project-owned or
  in `openCodeExcluded` (`scripts/sync.js:48-54`: `node_modules`, `package.json`,
  `package-lock.json`, `bun.lock`, `.gitignore`). `plugins/graphify.js` is in
  neither set, so every `npx ai-workflow-setup` already writes
  `<consumer>/.opencode/plugins/graphify.js`.
- `scripts/sync.js:644-662` — a consumer's locally modified plugin file is
  skipped, not overwritten, so hand-editing the file is an existing (if
  undocumented) way to neutralise it.
- `scripts/sync.js:18-20,29-42` — `.agents-sync-ignore` is protected from
  overwrite/prune but its globs are **not read**; `memory-bank/progress.md`
  records that support is explicitly deferred. There is no supported per-file
  opt-out today.
- `.opencode/plugins/graphify.js:16-45` — the plugin is a V2 default-export
  definition that registers one `execute.before` tool hook, fires at most once
  per setup, matches only the `shell` tool, and returns early unless
  `<project>/graphify-out/graph.json` exists (`:33`). It imports only `fs` and
  `path` — no `@opencode/plugin` runtime import, so it does not need a
  consumer-side SDK install.
- `.opencode/opencode.json:1-3` — the repo's own config is only `$schema`; V2
  auto-discovers `.opencode/plugins/`, so no `plugin`/`plugins` key is required.
- `README.md:122-125` — the post-install structure tree already names
  `.opencode/plugins/ # graphify knowledge-graph plugin`. This is the only
  consumer-facing mention: one line, no behaviour, no prerequisites.
- `README.md:253-267` — the "Knowledge Graph (graphify)" section documents the
  `/graphify` command and its prerequisites, but never says a plugin ships or
  that it injects a reminder into shell calls.
- `AGENTS.md` — contains no occurrence of "plugin" (grep, case-sensitive); the
  file consumers' agents read does not mention it.
- `scripts/setup/index.js:1-19` — setup runs eight phases and renders a summary
  table; there is no plugin-specific output, so a consumer who never reads the
  README sees no signal that a plugin was installed.
- `scripts/setup/local-update.js:49-50,282-287` — the codebase already treats
  `.opencode/plugins/graphify.js` as a shipped file and tells consumers to
  restart OpenCode after plugin changes, confirming the distribution intent.
- `scripts/sync-unit.test.js:737` — the sync suite asserts
  `.opencode/package.json` is **never** copied, so consumers do not receive the
  repo's SDK pin. This is consistent with the plugin's zero SDK imports.
- `docs/research/v2-plugin-contract-verification.md:365-395` — the V2 contract
  was verified previously; the distributed file deliberately avoids importing
  `@opencode/plugin` so it loads without a consumer dependency.
- `~/.config/opencode/opencode.json:30-32` — the requester's user-level config
  declares exactly one plugin: `"plugins": ["@tarquinen/opencode-dcp@latest"]`.
  It does **not** name `graphify.js`. This is the entry the requester believed
  was making the repo plugin visible.
- `~/.config/opencode/plugins/` — the global plugin directory contains
  `herdr-agent-state.js` and `worktrunk.ts`; neither is `graphify.js`.
  `~/.config/opencode/cli.json:15` declares a TUI-only
  `"plugins": ["./herdr-opencode"]`. None of these load the repo plugin.
- `~/.config/opencode/opencode.jsonc:1-3` — schema only.
  `~/.config/opencode/package.json:1-5` pins the V1 `@opencode-ai/plugin`
  1.14.39, which `graphify.js` neither imports nor needs.
  `~/.config/opencode/service.json` holds runtime service state and declares no
  plugin; its contents are intentionally not reproduced here. `$OPENCODE_CONFIG`
  could not be read without a shell; the standard user-level paths above were
  inspected directly.
- `https://opencode.ai/docs/plugins/` (V2 docs, fetched 2026-11-07), "Discover":
  "OpenCode also loads direct .ts and .js files and immediate plugin package
  directories from every discovered `.opencode/plugins/` directory." Global
  plugins use the same layout under the config directory. The same page says a
  `plugins/` directory beside a project-root `opencode.json(c)` is **not**
  discovered automatically, which is why the file belongs under `.opencode/`.
- `opencode.mcp.example.json:75-77` — the example copied to a fresh consumer's
  `opencode.json` (`scripts/sync.js:869-884`) declares
  `"plugins": ["@tarquinen/opencode-dcp@latest"]`. Every new consumer therefore
  gets an undocumented third-party plugin; existing consumers keep their
  project-owned `opencode.json` and are unaffected.
- `scripts/setup/local-update.js:139-152` — the same `plugins` key the example
  scaffolds is treated as deprecated and triggers the "Local OpenCode V2 update
  required" notice. The V2 docs show `plugins` is the current key for explicitly
  configured plugins; the detector's blanket rule is broader than the actual
  defect (a single-file path, or a duplicate of an auto-discovered directory).
- `tests/spec-plugin-v2-contract.test.js:28-31,555-584` — plugin tests enumerate
  `.opencode/plugins/` dynamically and assert the local config has no
  `plugin`/`plugins` key, but no test asserts what a consumer scaffold receives
  from `opencode.mcp.example.json`.
- `opencode.json:78-80` — this repository's own project-owned root config also
  declares `@tarquinen/opencode-dcp@latest`. It is not in `package.json` `files`
  and is never shipped, so it explains the requester's mental model without
  affecting consumers.
- **Round 3 correction.** `scripts/setup/local-update.js:126-129` inspects
  `<consumer>/.opencode/opencode.json`. `scripts/sync.js:873-884` scaffolds
  `<consumer>/opencode.json` at the project **root**. These are different files,
  so the round 2 statement that a scaffolded consumer config "is then flagged as
  stale" is false. `package.json:53-68` ships only `.opencode/agents/`,
  `.opencode/commands/`, and `.opencode/plugins/` from `.opencode/`; there is no
  `.npmignore` (glob: none). A fresh consumer therefore never has the file the
  detector reads, and the notice cannot fire from the scaffold.
- `scripts/sync-unit.test.js:668,752-758` — the scaffold assertion compares the
  consumer's `opencode.json` against a synthetic `MCP_EXAMPLE` fixture, not the
  real `opencode.mcp.example.json`. No test constrains the real example's
  content today, so the pin edit needs no test fixture change.
- **Round 3 correction (tests).** `scripts/sync-unit.test.js:1558-1580` does read
  the real `opencode.mcp.example.json`, but it asserts only the `instructions`
  entry — both for the shipped example and for the scaffolded `opencode.json`.
  Nothing asserts the `plugins` array, so pinning the dcp entry still needs no
  test edit. `tests/spec-plugin-v2-contract.test.js:555-584` inspects the repo's
  `.opencode/opencode.json`, not the example, so it is unaffected too.
- `~/.cache/opencode/npm/@tarquinen/opencode-dcp@latest/1794043268030/node_modules/@tarquinen/opencode-dcp/package.json:4,58,60`
  — the resolved dcp build is **3.2.0**, licensed **AGPL-3.0-or-later**, with peer
  `@opencode-ai/plugin >=1.18.29`. The cache directory name is the declared
  specifier itself (`…/opencode-dcp@latest/…` followed by a fetch timestamp), so
  OpenCode resolves the literal string and re-resolves `@latest` on a new fetch.
- `~/.config/opencode/node_modules/` — `@tarquinen/` is absent; dcp reaches the
  machine through the OpenCode plugin cache, not a user-level npm install. Nothing
  on the consumer side needs dcp in `package.json` dependencies.

### Knowledge retrieval

- Memory bank: searched for plugin distribution, sync-copy behaviour, and setup
  provisioning; hits included `v2-plugin-contract-verification.md` and
  `projectbrief.md`. No prior spike covers this request.
- Learned knowledge: skipped — no prior session matches "plugin distribution to
  consumers"; the closest sessions (V2 plugin port, MCP rename) are already
  captured in `docs/research/` and `docs/tracker-log.md`.
- Cross-project knowledgebase: **skipped (PG vector unavailable)** — the tool
  reported `DATABASE_URL is not configured`.
- External source: the OpenCode V2 plugins page was fetched on 2026-11-07 and
  establishes the discovery rule cited above.

### Round 2 — Reconciliation (2026-11-07)

**What makes the plugin load today:** nothing in any config. `.opencode/plugins/graphify.js`
is present in this working directory and OpenCode V2 discovers it from
`<project>/.opencode/plugins/`. The user-level config's only `plugins` entry is
`@tarquinen/opencode-dcp@latest`; the global plugin directory holds `herdr` and
`worktrunk`; neither is graphify. The repo's root `opencode.json` also declares
only dcp. `.opencode/opencode.json` is schema-only. The requester's belief that
the user-level config is the load path is therefore incorrect, and the plugin
already satisfies the "works on someone else's computer after setup" test.

**What a fresh consumer is missing:** (1) knowledge, not mechanism — the README
names the plugin in one tree line and never says it ships, what it does, or how
to opt out; (2) a restart hint after setup or upgrade; (3) the V2 requirement;
and (4) a correct account of the scaffold — `opencode.mcp.example.json` declares
an unrelated third-party plugin in the consumer's `opencode.json`. (Round 2
believed the package's own detector then called that config stale; round 3
disproved it — see `## Round 3 — Reconciliation`.)

## Round 1 — Answers (2026-11-07)

- **Q1** — What "included" must mean: "I want my plugins be included when
  installed in a project directory. For now it is seen because opencode.json in
  my user level see it. but if this is installed in someone else's computer they
  may not have it." → **Settled:** inclusion is a hard requirement, not
  documentation-only. Evidence shows the shipping and sync mechanism already
  satisfies it; the remaining gap is consumer knowledge and one scaffold defect.
- **Q2** — Scope of the distribution rule: "the one in my user level in config
  and what's in this project." → **Not settled:** inspection shows the named
  user-level config declares `@tarquinen/opencode-dcp@latest`, not the repo
  plugin. The ambiguity is reopened as Q6 and Q7 below.
- **Q3** — Opt-out: "yes." → **Settled:** on by default; not building a graph is
  the opt-out; sync preserves a locally modified plugin file. A plain deletion is
  restored by the next sync, so the README must say the local edit is the
  reliable opt-out.
- **Q4** — Where the explanation lives: "readme. Update the readme. simplify your
  language." → **Settled:** README only, plain language.
- **Q5** — How deep: "recommendation." → **Settled:** the full contract, written
  plainly — what ships, how it loads, what it does, the graph prerequisite, the
  opt-out, and the restart requirement.

## Round 2 — Answers (2026-11-07)

- **Q6** — Which plugins are in scope: "Combine the two plugins." → **Pending:**
  the phrase admits at least three readings; round 3's Q13 picks one.
- **Q7** — Stray third-party plugin in the scaffold: "have it in the existing as
  well. it is included in the plugins I want to ship." → **Settled:** keep
  `opencode.mcp.example.json:75-77`; `@tarquinen/opencode-dcp` is part of what the
  package delivers to new consumers.
- **Q8** — Load path for graphify: "yes." → **Settled:** auto-discovery only; no
  `plugins` entry for `graphify.js`.
- **Q9** — What "installed" means: "yes." → **Settled:** `npx ai-workflow-setup`
  stays the required step; no `postinstall`.
- **Q10** — Setup output: "yes." → **Settled:** setup output unchanged; the README
  carries the story.
- **Q11** — Support boundary: "yes." → **Settled:** the README states the OpenCode
  V2 requirement.
- **Q12** — Deprecation-warning scope: "yes." → **Settled:** the detector
  over-match is a separate follow-up. The reason is corrected in round 3: the
  notice does not fire on a freshly scaffolded consumer, so nothing is suppressed
  in this change.

## Round 3 — Reconciliation (2026-11-07)

**Correction to the round 2 premise.** Round 2 recorded that the scaffolded
`plugins` key is flagged as stale right after setup. It is not. The detector reads
`<consumer>/.opencode/opencode.json` (`scripts/setup/local-update.js:126-129`);
the scaffold writes `<consumer>/opencode.json` at the project root
(`scripts/sync.js:873-884`). The package also ships no `.opencode/opencode.json`
(`package.json:53-68`), so a fresh consumer never has the file being inspected.
Q12's deferral therefore stands unchanged and no warning needs silencing here. The
over-match is still real for a consumer who writes `plugins` into
`.opencode/opencode.json` — a follow-up, not a blocker.

**Distribution semantics for a third-party plugin.** `@tarquinen/opencode-dcp` is
*declared*, never vendored. The scaffolded entry is a specifier that OpenCode
resolves at startup and caches under `~/.cache/opencode/npm/<specifier>/`; it is
not added to `package.json` dependencies and no copy of it ships in the tarball.
Vendoring is not an option: OpenCode loads configured plugins by specifier, not
from the consumer's `node_modules` by path.

**Reading (a) is the only reading consistent with settled answers.** Q7 keeps the
dcp entry in the scaffold; Q8 forbids a `plugins` entry for `graphify.js`. Merging
both plugins into one file is not feasible — dcp is a compiled AGPL-3.0 npm
package with its own build, not local source. Listing both in the scaffold's
`plugins` array would contradict Q8. Reading (a) — ship both, each by its own load
path — is confirmed as Q13 rather than assumed.

**Placement, derived from settled answers.** Q4/Q5 put the story in the README,
Q11 adds the V2 line, and Q7 makes the story cover two plugins, one third-party.
The round 1 deferral about placement therefore resolves to a new top-level
`## OpenCode plugins` section; `## Knowledge Graph (graphify)` stays
graphify-specific.

## Round 3 — Answers (2026-11-07)

- **Q13** — **Reading of "combine the two plugins"**: "all yes." → **Settled:**
  reading (a). Ship and document both plugins, each by its natural load path —
  `.opencode/plugins/graphify.js` by V2 auto-discovery (Q8), and
  `@tarquinen/opencode-dcp` declared in the scaffolded `opencode.json` (Q7).
  Merging into one file is infeasible (dcp is a compiled npm package) and listing
  graphify in `plugins` would contradict Q8.
- **Q14** — **Pin the dcp version**: "all yes." → **Settled:** pin
  `@tarquinen/opencode-dcp@3.2.0`, the build verified on this machine. Bump the
  pin deliberately in a template release. Existing consumers are unaffected
  because `opencode.json` is project-owned and never rewritten.
- **Q15** — **Does the README cover dcp too**: "all yes." → **Settled:** yes.
  One `## OpenCode plugins` section documents both: graphify as the template's
  own auto-discovered plugin, dcp as a declared third-party plugin — what it does,
  AGPL-3.0-or-later licensing, and how to remove it.

**Frontier closed.** Round 3 answered every branch; the remaining unknowns are
recorded deferrals, not open questions. The spike is written to
`docs/spike-plugin-distribution.md`.

## Frontier (open)

None — empty after round 3. Q13–Q15 settled, every other branch settled in rounds
1–2 or explicitly deferred.

## Deferred

- Detector over-match on the `plugins` key (`scripts/setup/local-update.js:139-152`)
  — Q12 follow-up. Reopens when a consumer is observed writing `plugins` into
  `.opencode/opencode.json`, or when the detector is next edited; it does not fire
  on the scaffold, so it does not block this change.
- Whether `.agents-sync-ignore` glob support becomes the general per-file opt-out —
  already a recorded deferral in `memory-bank/progress.md` and far larger than
  this request (`scripts/sync.js:29-42`, reserved comment at `:33-35`).
- A first-class opt-out flag or command for a shipped plugin — Q3 settled that v1
  has none; the durable opt-out is a local edit, which sync preserves. Reopens
  when consumers report that editing the file is too obscure or when a plugin
  needs selective disabling without losing template updates.
- Whether a regression test should assert the shipped `opencode.mcp.example.json`
  declares the pinned dcp entry and that `graphify.js` reaches a consumer fixture —
  no test constrains the real example today (`scripts/sync-unit.test.js:668` uses
  a synthetic fixture), and the copy mechanism is already covered generically.
  Reopens when the example's content changes again.
- Whether the setup summary lists synced plugins individually — settled as no by
  Q10.

## Prototype Requests

None. Every open question is a decision, not an empirical unknown; the load
mechanism is established by the official V2 docs and the existing source/tests.
