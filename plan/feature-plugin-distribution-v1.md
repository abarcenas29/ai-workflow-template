---
goal: "Deliver the OpenCode plugin story to package consumers: pin @tarquinen/opencode-dcp to 3.2.0 in the scaffold, document both plugins in a new README section, and add one regression assertion that guards the pin"
version: 1
date_created: 2026-11-07
status: Planned
tags: [feature, plugin-distribution, opencode, plugins, graphify, dcp, readme, scaffold, pin, license, tests]
---

# Feature: OpenCode Plugin Distribution to Package Consumers

![Status: Planned](https://img.shields.io/badge/status-Planned-yellow)

## Introduction

**Status:** Planned 2026-11-07 — 5 tasks across 3 batches: T1–T2 (A, parallel), T3–T4 (B, parallel), T5 (C, single gate).

`docs/spike-plugin-distribution.md` settled the question behind this work: the template already delivers
its plugin. `package.json:53-68` publishes `.opencode/plugins/`, `scripts/sync.js:623-664` copies every file
in that directory into the consumer project, and OpenCode V2 discovers `.opencode/plugins/*.js` with no
config entry. What is missing is consumer-facing knowledge, plus one scaffold defect:
`opencode.mcp.example.json:75-77` declares the third-party plugin `@tarquinen/opencode-dcp@latest`, which
`scripts/sync.js:869-884` copies verbatim into every fresh consumer's project-root `opencode.json`.

This plan settles three things and nothing else:

1. **Pin the third-party plugin** — `@latest` becomes `3.2.0` (D-13), on the one line that reaches every
   new consumer.
2. **Document both plugins** — one new plain-language README section covering graphify (auto-discovered,
   ships in the tarball) and `@tarquinen/opencode-dcp` (declared in the scaffold, fetched from npm), with
   the OpenCode V2 requirement, the install step, and removal steps for each (D-14).
3. **Guard the pin** — one assertion in `scripts/sync-unit.test.js` so an unpin, a drop, or a stray
   `graphify` entry fails the suite (brings deferred item O-4 in; see ALT-01).

No production code changes. `scripts/sync.js`, `scripts/setup/local-update.js`, `package.json`,
`.opencode/opencode.json`, `.opencode/plugins/graphify.js`, setup output, and `AGENTS.md` are untouched.

**Authority:** every decision here is D-1…D-14 in `docs/spike-plugin-distribution.md`. This plan does not
reopen them. Where the plan adds detail the spike left open, it is called out as ALT- or RISK- and reasoned.

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2 | Yes — different files | — |
| B | T3, T4 | Yes — `README.md` (T3) and `scripts/sync-unit.test.js` (T4) | A |
| C | T5 | No (single gate) | T1, T2, T3, T4 |

## Requirements & Constraints

### Requirements

| ID | Type | Description |
|----|------|-------------|
| REQ-01 | Functional | `opencode.mcp.example.json` line 76 reads `"@tarquinen/opencode-dcp@3.2.0"`. The `plugins` array stays at lines 75–77 with exactly one entry; no other key in the file changes |
| REQ-02 | Documentation | `README.md:125` reads `└── plugins/        # graphify plugin (loaded automatically)`. The tree still describes `.opencode/plugins/` only — dcp is not added to the tree |
| REQ-03 | Documentation | A new `## OpenCode plugins` H2 is inserted immediately before `## Knowledge Graph (graphify)` (currently `README.md:253`), byte-identical to Appendix A, which transcribes `docs/spike-plugin-distribution.md:134-197` |
| REQ-04 | Documentation | The section covers graphify (ships in the tarball; setup copies it; auto-discovered; what it does; inert without `graphify-out/graph.json`; both removal routes) and dcp (declared in `opencode.json`; purpose; `AGPL-3.0-or-later`; npm fetch on first start; removal) |
| REQ-05 | Documentation | The section states the OpenCode V2 requirement, that `npx ai-workflow-setup` is the install step (no `postinstall`), and that OpenCode must be restarted after setup or an upgrade |
| REQ-06 | Testing | `scripts/sync-unit.test.js` gains one assertion: the shipped example's `plugins` array equals `["@tarquinen/opencode-dcp@3.2.0"]`. No existing assertion or fixture is edited |
| REQ-07 | Traceability | The README quotes the pinned specifier literally (`@tarquinen/opencode-dcp@3.2.0`), so a future bump must move the JSON, the README snippet, and the test in one commit |

### Security & Compliance

| ID | Requirement |
|----|-------------|
| SEC-01 | A copyleft third-party dependency (`AGPL-3.0-or-later`) is declared for every fresh consumer. The README names the licence before the consumer runs it, and `opencode.json` is project-owned so removal is permanent |
| SEC-02 | No credential, network endpoint, or executable code is introduced by this plan. The only runtime fetch is OpenCode's own npm resolution of the declared plugin, which exists before and after this change |
| SEC-03 | Pinning closes the `@latest` window for new consumers: a compromised or breaking upstream release can no longer arrive silently on a consumer's next start |

### Constraints

| ID | Constraint |
|----|------------|
| CON-01 | Do not edit `package.json`. `files` already lists `.opencode/plugins/` (line 60) and there is no `postinstall` |
| CON-02 | Do not add `plugin` or `plugins` to `.opencode/opencode.json`. D-7 makes auto-discovery the only graphify load path, and `tests/spec-plugin-v2-contract.test.js:555-584` asserts both keys are undefined there |
| CON-03 | Do not change `scripts/sync.js`, `scripts/setup/local-update.js`, setup output, or `AGENTS.md` |
| CON-04 | Do not restore `opencode.mcp.example.json` from `HEAD`. The `plugins` block at lines 75–77 is uncommitted working-tree state; `git checkout -- opencode.mcp.example.json` deletes it and leaves REQ-01 nothing to pin (RISK-07) |
| CON-05 | Do not edit `.agents-sync-manifest.json`. Its `__root__/opencode.mcp.example.json` hash is already stale (recorded `9d9eb236…`, current `6cdc131d…`) and no test or gate reads it |
| CON-06 | Only three files change: `opencode.mcp.example.json`, `README.md`, `scripts/sync-unit.test.js`. The README change is additive except one comment on line 125 |
| CON-07 | Every line added to a `.md` file stays at or below 400 characters; the README block keeps the spike's wrapping, longest line 82 characters |
| CON-08 | No test skips, `.todo`s, threshold edits, or new fixtures. The pin needs no fixture change (spike C-4) |
| CON-09 | The `## Knowledge Graph (graphify)` section body (`README.md:253-267` before insertion) stays byte-identical; only its line numbers shift |

### Out of Scope — Do Not Touch

These are the spike's explicit exclusions. The coder must not drift into any of them.

| ID | Excluded | Why | Recorded as |
|----|----------|-----|-------------|
| OUT-01 | Fixing the `plugins`-key over-match in `scripts/setup/local-update.js:139-152` | It cannot fire for a fresh consumer — the detector reads `<consumer>/.opencode/opencode.json` and the scaffold writes `<consumer>/opencode.json` | O-1 / D-11 |
| OUT-02 | A first-class opt-out flag or command | v1 has none; a local edit is the durable opt-out and the README documents it | O-3 / D-3 |
| OUT-03 | `.agents-sync-ignore` glob support | Reserved but not honoured (`scripts/sync.js:33-35`); far larger than this request | O-2 |
| OUT-04 | A `postinstall` hook | `npx ai-workflow-setup` is the install step (`README.md:12,60`); `scripts/sync-unit.test.js:1593` asserts `scripts.postinstall` is undefined | D-8 |
| OUT-05 | Vendoring or forking `@tarquinen/opencode-dcp` into `.opencode/plugins/` | A compiled npm package is resolved by specifier; a copied tree does not load | D-12 |
| OUT-06 | Any change to `.opencode/plugins/graphify.js` behaviour, or adding a new plugin | Not requested; the hook wording is product copy | Spike §1 |
| OUT-07 | New rows or phases in setup output | D-9; the README carries the story | D-9 |
| OUT-08 | Retro-fixing existing consumers' `opencode.json` | It is project-owned and never rewritten; the README explains the manual removal/edit | D-6 / R-2 |
| OUT-09 | Converting these decisions into tracker tickets | The orchestrator owns delivery tracking | Spike §3 |

## Implementation Steps

### Phase 1 — Scaffold Pin and Structure Tree (Batch A — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Replace the dcp specifier `@latest` with `3.2.0` on line 76 | `opencode.mcp.example.json` | A | — | 2026-11-07 |
| T2 | Rewrite the plugins tree comment on line 125 | `README.md` | A | — | 2026-11-07 |

#### T1 — Pin `@tarquinen/opencode-dcp` to `3.2.0`

- **File:** `opencode.mcp.example.json`
- **Anchor:** lines 75–77 (the `plugins` array). The value is line 76.
- **Change:** line 76 becomes exactly `    "@tarquinen/opencode-dcp@3.2.0"` (four-space indent, trailing
  comma absent because it is the only element). The surrounding `"plugins": [` and `],` lines are unchanged.
- **Must not:** change line 7 (`chrome-devtools-mcp@latest` is a different, unrelated specifier), reorder
  keys, reformat the file, or restore the file from `HEAD` (CON-04).
- **Completion criterion:** `JSON.parse` succeeds; `plugins` has length 1; `plugins[0]` is
  `@tarquinen/opencode-dcp@3.2.0`; the second command prints `0` (zero occurrences of the unpinned
  specifier).
- **Proving command:**

  ```bash
  node -e 'const c=require("./opencode.mcp.example.json"); if (c.plugins?.length !== 1 || c.plugins[0] !== "@tarquinen/opencode-dcp@3.2.0") { console.error("FAIL", c.plugins); process.exit(1) } console.log("OK", c.plugins)'
  grep -c 'opencode-dcp@latest' opencode.mcp.example.json || echo "0 occurrences"
  ```

#### T2 — Update the plugins tree comment

- **File:** `README.md`
- **Anchor:** line 125, inside the `## Core Structure` fence (`README.md:117-134`).
- **Change:** the exact line

  ```text
  └── plugins/        # graphify knowledge-graph plugin
  ```

  becomes

  ```text
  └── plugins/        # graphify plugin (loaded automatically)
  ```

  The `└── ` prefix and the eight spaces before `#` are preserved (byte-verified: 60 characters / 66 bytes, 8 spaces).
- **Must not:** add a dcp line to the tree (dcp is not a file in that directory), reflow the tree, or
  change any other tree line.
- **Completion criterion:** line 125 matches the new text exactly; the surrounding tree lines 118–134 are
  otherwise unchanged; the replacement does not alter the file's line count.
- **Proving command:**

  ```bash
  node -e 'const l=require("fs").readFileSync("README.md","utf8").split("\n")[124]; if (l !== "└── plugins/        # graphify plugin (loaded automatically)") { console.error("FAIL", JSON.stringify(l)); process.exit(1) } console.log("OK", l)'
  ```

### Phase 2 — README Contract Section and Regression Guard (Batch B — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T3 | Insert the `## OpenCode plugins` section before `## Knowledge Graph (graphify)` | `README.md` | B | T2 | 2026-11-07 |
| T4 | Add the pinned-specifier assertion to the real-example test | `scripts/sync-unit.test.js` | B | T1 | 2026-11-07 |

#### T3 — Insert the `## OpenCode plugins` section

- **File:** `README.md`
- **Anchor:** immediately before the current line 253 (`## Knowledge Graph (graphify)`), i.e. after the
  blank line that follows the Token Efficiency table at line 251.
- **Change:** insert the block in **Appendix A** verbatim, followed by one blank line before
  `## Knowledge Graph (graphify)`. Appendix A is a transcription of
  `docs/spike-plugin-distribution.md:134-197`; if the two differ, the spike wins.
- **Must not:** touch the `## Knowledge Graph (graphify)` body, add an H1, add H4 headings, or duplicate
  the section (exactly one `## OpenCode plugins` heading must exist). Do not repeat the plugin list in
  `## Core Structure` — the tree keeps describing only `.opencode/plugins/`.
- **Rationale for placement:** the section explains the plugin the Knowledge Graph section depends on, so
  it precedes it; the reader meets "the plugin exists" before "how to build a graph".
- **Completion criterion:** the section appears exactly once, ends before the
  `## Knowledge Graph (graphify)` heading, contains the five required strings (`@tarquinen/opencode-dcp@3.2.0`,
  `AGPL-3.0-or-later`, `npx ai-workflow-setup`, `OpenCode V2`, `graphify-out/`), and the internal link
  `#knowledge-graph-graphify` resolves to the following heading.
- **Proving commands:**

  ```bash
  # order + uniqueness
  node -e 'const t=require("fs").readFileSync("README.md","utf8").split("\n");const p=t.indexOf("## OpenCode plugins"),k=t.indexOf("## Knowledge Graph (graphify)");if(p<0||k<0||k<=p||t.filter(l=>l==="## OpenCode plugins").length!==1){console.error("FAIL",p,k);process.exit(1)}console.log("order OK",p+1,k+1)'
  # required strings, scoped to the new section
  node -e 'const s=require("fs").readFileSync("README.md","utf8").split("## OpenCode plugins")[1].split("## Knowledge Graph (graphify)")[0];const miss=["@tarquinen/opencode-dcp@3.2.0","AGPL-3.0-or-later","npx ai-workflow-setup","OpenCode V2","graphify-out/"].filter(n=>!s.includes(n));if(miss.length){console.error(miss);process.exit(1)}console.log("content OK")'
  # internal anchor target
  grep -n '#knowledge-graph-graphify' README.md
  ```

#### T4 — Assert the pinned dcp entry (brings O-4 in)

- **File:** `scripts/sync-unit.test.js`
- **Anchor:** immediately after the existing test
  `it('ships an opencode example that loads AGENTS.project.md', …)` which ends at line 1564.
- **Change:** add one test that reads the real `opencode.mcp.example.json` (same `readFileSync` +
  `join(repoRoot, …)` pattern already used at lines 1559–1561) and asserts:

  ```js
  expect(example.plugins).toEqual(['@tarquinen/opencode-dcp@3.2.0'])
  ```

  Test title: `pins the third-party dcp plugin in the shipped example`. No fixture, helper, or existing
  assertion changes (CON-08).
- **Why exact-array equality:** it fails on an absent `plugins` key, on a re-unpin to `@latest`, on a
  dropped entry, and on an added `.opencode/plugins/graphify.js` path — which would contradict D-7. One
  assertion therefore encodes D-7 and D-13 together.
- **Dependency:** T1 must land first, so this asserts the post-change state (GREEN), not a RED state.
- **Completion criterion:** the new test passes; the file's other tests are unaffected; the assertion is
  non-vacuous by construction (`undefined` never equals a one-element array).
- **Proving command:**

  ```bash
  npx vitest run scripts/sync-unit.test.js -t 'pins the third-party dcp plugin'
  ```

### Phase 3 — Verification Gate

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T5 | Run the full gate set and confirm the diff is exactly the three intended files | all of the above | — | T1, T2, T3, T4 | 2026-11-08 |

#### T5 — Verification gate

- **Change:** no file edits. Run each command and record the result.
- **Completion criterion:** every command exits 0, and `git status --short` lists exactly
  `README.md`, `opencode.mcp.example.json`, `scripts/sync-unit.test.js` as modified by this work (plus any
  pre-existing unrelated entries, which are named and left alone).
- **Proving commands:**

  ```bash
  # 1. Pin (REQ-01)
  node -e 'const c=require("./opencode.mcp.example.json"); if (c.plugins?.length !== 1 || c.plugins[0] !== "@tarquinen/opencode-dcp@3.2.0") process.exit(1); console.log("pin OK")'

  # 2. Tree comment (REQ-02)
  grep -n '^└── plugins/        # graphify plugin (loaded automatically)$' README.md

  # 3. Section order, uniqueness, content, anchor (REQ-03..05) — as specified in T3
  node -e 'const t=require("fs").readFileSync("README.md","utf8").split("\n");const p=t.indexOf("## OpenCode plugins"),k=t.indexOf("## Knowledge Graph (graphify)");if(p<0||k<0||k<=p||t.filter(l=>l==="## OpenCode plugins").length!==1){console.error("FAIL",p,k);process.exit(1)}console.log("order OK",p+1,k+1)'
  node -e 'const s=require("fs").readFileSync("README.md","utf8").split("## OpenCode plugins")[1].split("## Knowledge Graph (graphify)")[0];const miss=["@tarquinen/opencode-dcp@3.2.0","AGPL-3.0-or-later","npx ai-workflow-setup","OpenCode V2","graphify-out/"].filter(n=>!s.includes(n));if(miss.length){console.error(miss);process.exit(1)}console.log("content OK")'
  grep -n '#knowledge-graph-graphify' README.md

  # 4. Knowledge Graph section untouched (CON-09): only line 125 is removed
  git diff -U0 README.md

  # 5. Regression guard (REQ-06)
  npx vitest run scripts/sync-unit.test.js -t 'pins the third-party dcp plugin'

  # 6. Out-of-scope guard (CON-02): repo config still declares neither key
  npx vitest run tests/spec-plugin-v2-contract.test.js

  # 7. Full unit suite
  npm run test:unit

  # 8. E2E structure suite
  npm test
  ```

## Alternatives

| ID | Alternative | Rationale for rejection |
|----|-------------|-------------------------|
| ALT-01 | Keep O-4 deferred and rely on review to catch an unpin | O-4's own reopen trigger is "the example's content changes again" — this plan changes it. Cost in: one six-line test, no fixture, sub-second. Cost out: the scaffold is copied once and never rewritten, so an unpin has no correction path. Accepted: T4 |
| ALT-02 | Documentation-only change; leave `@latest` in place | D-13 fixed the pin. `@latest` gives each consumer whatever is newest on their first start, while `opencode.json` is project-owned and never corrected later |
| ALT-03 | Vendor `@tarquinen/opencode-dcp` into `.opencode/plugins/` like graphify | D-12. It is a compiled npm package resolved by specifier; a copied tree would not load and would add AGPL source to the tarball |
| ALT-04 | Add `opencode.json` to `scripts/sync.js` `rootFiles` so existing consumers receive the pin | It is project-owned by design (D-6). Sync would then overwrite consumer config, which is the failure mode the current design prevents |
| ALT-05 | Place the section after `## Knowledge Graph (graphify)` | The brief fixes the position before line 253, and the section explains the plugin the graphify workflow depends on. Placing it later buries the prerequisite |
| ALT-06 | Restate the README block inside this plan as the authority | The spike is the authority. The Appendix A transcription exists only so the coder does not have to hold two documents open; any divergence resolves in the spike's favour |

## Dependencies

| ID | Depends on | What this plan needs from it |
|----|-----------|------------------------------|
| DEP-01 | `docs/spike-plugin-distribution.md` D-1…D-14 | The fixed decisions. This plan adds no new decision of scope; ALT-01 is the only judgement call and it reasons explicitly |
| DEP-02 | `package.json:53-68` | `.opencode/plugins/` already ships. No packaging change is in scope |
| DEP-03 | `scripts/sync.js:869-884` | The example is copied to a consumer's project-root `opencode.json` only when that file is absent — the path by which the pin reaches new consumers |
| DEP-04 | `scripts/sync.js:623-664` and the manifest skip rule | graphify is already copied, and a locally edited copy is skipped. The README's opt-out wording depends on this behaviour |
| DEP-05 | Vitest (`npm run test:unit`) and the existing real-example test at `scripts/sync-unit.test.js:1558-1564` | T4 extends that test's pattern; no new harness or fixture is needed |
| DEP-06 | `tests/spec-plugin-v2-contract.test.js:555-584` | Guards the out-of-scope boundary (CON-02). It must stay green and is run in T5 |

## Files

| ID | File | Operation | Task | Notes |
|----|------|-----------|------|-------|
| FILE-01 | `opencode.mcp.example.json` | Edit line 76 | T1 | Working-tree file already carries the uncommitted `plugins` block (CON-04) |
| FILE-02 | `README.md` | Edit line 125; insert before line 253 | T2, T3 | Both edits are additive except the one comment |
| FILE-03 | `scripts/sync-unit.test.js` | Add one `it(...)` after line 1564 | T4 | Same real-file pattern as lines 1558–1564 |
| FILE-04 | `plan/feature-plugin-distribution-v1.md` | Create | — | This plan |
| FILE-05 | *(untouched)* `package.json`, `.opencode/opencode.json`, `.opencode/plugins/graphify.js`, `scripts/sync.js`, `scripts/setup/local-update.js`, `scripts/setup/*`, `AGENTS.md`, `.agents-sync-manifest.json` | None | — | Listed so a reviewer can verify the diff surface |

## Testing

| ID | Test | Type | Task | Pass criterion |
|----|------|------|------|----------------|
| TEST-01 | Parse the example and assert the pinned specifier | Command | T1, T5 | Exit 0; prints `pin OK` |
| TEST-02 | `grep` the exact tree comment | Command | T2, T5 | Exactly one match at line 125 |
| TEST-03 | Section order, uniqueness, five required strings, anchor target | Command | T3, T5 | Prints `order OK <section> <graph>` with `section < graph`, then `content OK` |
| TEST-04 | `npx vitest run scripts/sync-unit.test.js -t 'pins the third-party dcp plugin'` | Unit | T4, T5 | 1 passed, 0 failed, 112 skipped |
| TEST-05 | `npx vitest run tests/spec-plugin-v2-contract.test.js` | Spec | T5 | Suite passes; `.opencode/opencode.json` still declares neither key |
| TEST-06 | `npm run test:unit` | Unit suite | T5 | 31 files / 910 tests, all passing, no new skips |
| TEST-07 | `npm test` (Playwright) | E2E structure | T5 | 7 passed, 1 skipped — identical to baseline |
| TEST-08 | `git diff -U0 README.md` review | Manual | T5 | Only line 125 appears as a removal; everything else is an addition |

**Baselines measured on this worktree before any task runs** (2026-11-07):

| Gate | Command | Baseline | After T4 |
|------|---------|----------|----------|
| Sync unit file | `npx vitest run scripts/sync-unit.test.js` | 112 tests, all passing | 113 |
| Full unit suite | `npm run test:unit` | 31 files / 909 tests, all passing | 910 |
| E2E structure | `npm test` | 7 passed, 1 skipped | 7 passed, 1 skipped |

If a run reports fewer than the baseline, stop: a task removed or skipped coverage. Do not "fix" it by
relaxing the gate (CON-08).

## Risks & Assumptions

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| RISK-01 | Every fresh consumer's config declares an **AGPL-3.0-or-later** plugin (spike R-1) | A copyleft-sensitive consumer receives a dependency they did not choose | README names the licence and the removal steps; `opencode.json` is project-owned, so removal is permanent. Accepted by D-6/D-14 |
| RISK-02 | Pinning removes automatic updates for dcp (spike R-2) | Consumers silently stay on 3.2.0 and miss fixes | Bump deliberately in a template release; after this plan, a bump must move three places (JSON, README snippet, test). Existing consumers edit their own `opencode.json` |
| RISK-03 | Consumers still on OpenCode V1 (spike R-3) | `graphify.js` cannot load; a load error may appear | The README's V2 requirement line is the only mitigation. No runtime version check is added |
| RISK-04 | A future edit unpins or drops the entry (spike R-4) | New consumers silently receive an arbitrary build | T4 converts this from reviewer-only to a failing test |
| RISK-05 | The local-edit opt-out also freezes template updates for `graphify.js` (spike R-5) | A consumer who edits the plugin never receives fixes | The README states this trade-off explicitly |
| RISK-06 | dcp must be fetched from npm on first start after setup (spike R-6) | An offline or restricted-network machine sees a failed plugin load until the fetch succeeds | Low severity; the README says OpenCode fetches and caches it. No pre-bundling in scope |
| RISK-07 | **Added.** The `plugins` block exists only in the working tree, not in `HEAD` | A coder who restores or stashes `opencode.mcp.example.json` deletes the block and T1 has nothing to pin | CON-04. T1's proving command fails loudly if the block is missing; the coder verifies `plugins` exists before editing |
| RISK-08 | **Added.** The pin now lives in three places (JSON line 76, README snippet, unit test) | A future bump that updates only the JSON fails T4 and leaves the README quoting a stale specifier | Intentional friction — it is the same "move together" rule the spike set for JSON + README (spike §2.1), extended by T4. Documented in REQ-07 and RISK-02 |
| RISK-09 | **Added.** The README is not synced into consumer projects (`rootFiles` is `AGENTS.md` + `skills-lock.json`) | An existing consumer who upgrades the package does not see the new section in their repo | Accepted: the README's distribution surface is npm/GitHub. `opencode.json` is project-owned anyway, so the pin cannot reach an existing consumer regardless |

| ID | Assumption | If false |
|----|------------|----------|
| ASSUMPTION-01 | `@tarquinen/opencode-dcp` 3.2.0 is the build verified on this machine (spike evidence) | If the intended build differs, stop and return to `scope`; the README snippet and T4 must match the chosen version |
| ASSUMPTION-02 | `README.md:253` is `## Knowledge Graph (graphify)` at execution time | Re-locate the heading with `grep -n '^## Knowledge Graph (graphify)$' README.md` before inserting |
| ASSUMPTION-03 | No test asserts README structure or the example's `plugins` array today (spike C-4) | If one appears, reconcile it instead of adding a second authority |
| ASSUMPTION-04 | `.agents-sync-manifest.json` is not gated (verified: no test reads the repo copy) | If a gate is added, regenerate the hash rather than hand-editing it |
| ASSUMPTION-05 | The pre-existing dirty `docs/.orchestrator-log.md` and untracked spike files are not this plan's to commit | Leave them staged/unstaged as found; the delivery step owns that decision |

## Related Specifications

| Document | Relationship |
|----------|--------------|
| `docs/spike-plugin-distribution.md` | **Authority.** D-1…D-14, the change surface (§2.1), the README target text (§2.2), deferrals O-1…O-4, risks R-1…R-6 |
| `docs/spike-plugin-distribution.draft.md` | Superseded background; not a source |
| `docs/research/v2-plugin-contract-verification.md` | Establishes the V2 plugin contract and that `graphify.js` needs no SDK install |
| `plan/refactor-opencode-plugin-v2-v1.md` | Prior change that ported the plugin to the V2 module shape |
| `tests/spec-plugin-v2-contract.test.js` | Machine-readable statement of the V2 contract and of the repo config's no-`plugins` rule |
| `.agents/instructions/markdown.instructions.md` | Heading level, list, table, and 400-character line rules for the README edit |

## Appendix A — README block to insert (transcription of spike §2.2)

Insert this block immediately before `## Knowledge Graph (graphify)`, followed by one blank line. The
authority is `docs/spike-plugin-distribution.md:134-197`; if the two differ, copy the spike.

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
