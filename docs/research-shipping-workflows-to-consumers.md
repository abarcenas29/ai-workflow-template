---
id: "research-shipping-workflows-to-consumers"
title: "How to ship GitHub workflows to consumer repos through the npm package"
updated: "2026-11-12"
tags:
  [
    github-actions,
    npm,
    distribution,
    sync,
    setup,
    reusable-workflows,
    composite-actions,
    project-owned,
    research,
  ]
entities: [github-actions, npm, opencode, vitest, node]
doc_type: "research"
status: "complete"
---

# How to ship GitHub workflows to consumer repos through the npm package

**Question (verbatim):** "How do I have this be installed in my repositiores? included in this npm module?"

**Interpretation.** Two separable asks, and the answer to each is different:

1. *"included in this npm module"* — **already true, and verified below.** `.github/workflows/` is in `package.json` `files` (`package.json:56`), so `pr-test.yml` and `npm-publish.yml` already travel in the tarball to `node_modules/@abarcenas/ai-workflow-template/.github/workflows/`.
2. *"installed in my repositories"* — **false today by design, and the real question.** Nothing in `scripts/sync.js` or the eight setup phases ever writes to a consumer's `.github/workflows/`, and `README.md:91` plus `README.md:368` state that exclusion as a feature. This report answers what it would take to change that, and whether it should be changed.

**Relationship to prior reports.** [`research-github-actions-agent-offload.md`](./research-github-actions-agent-offload.md) (2026-11-12) established the *plumbing*: `opencode run --standalone`, the `anomalyco/opencode/github@latest` action, runner limits, free standard runners on public repos, and risks R1–R8. [`research-ai-doc-maintenance-workflows.md`](./research-ai-doc-maintenance-workflows.md) (2026-11-12) established the *value ranking* and the `docs-health.yml` specification at 0 tokens (its §2f) plus a build order (its §4). **Neither is re-derived here.** This report adds only the distribution mechanism, and cites those two for every claim about what a workflow does.

**Research date:** 2026-11-12 · **Repo state:** `@abarcenas/ai-workflow-template` v2.10.0 (`package.json:3`)

**Confidence labels**

- **VERIFIED** — the page, file, or tool output was read in this session; cited inline with a line number or URL.
- **RECALLED** — model knowledge, not re-fetched this session. A lead, not evidence.
- **UNVERIFIED** — could not be established; said so rather than guessed.

---

## 1. Bottom line

Four findings, in order of how much they change the answer.

1. **The files already ship; nothing copies them.** `package.json:56` lists `.github/workflows/`, and the repo's own log records the consequence: "`.github/workflows/pr-test.yml` **ships inside the tarball**, which is why the publish workflow now carries a `github.repository` guard" (`docs/tracker-log.md:2389`). The guard is at `npm-publish.yml:35`. So a consumer who runs `npm install` already has both YAML files on disk at `node_modules/@abarcenas/ai-workflow-template/.github/workflows/` — inert, because nothing reads them there. **"Included" is done. "Installed" is the whole problem.**

2. **The obvious fix — a new sync channel — is the one that must not be built as a channel.** The sync engine's single copy rule is *copy when absent, overwrite when unmodified or `--force`, prune when the source vanished* (`sync.js:602-621` for `.agents/`, `sync.js:895-953` for prune). Applied to `.github/workflows/` that rule means: (a) `pr-test.yml` and `npm-publish.yml` get copied into **every** consumer repo, because the channel `packageDir` is walked recursively via `collectFiles` (`sync.js:419-436`, `sync.js:581`); (b) any consumer workflow whose filename matches an unmodified one is overwritten; (c) `--prune` would delete a consumer's edited-but-then-restored file. Each is a distinct failure mode, tabulated in §2.1.

3. **The repository already contains the correct mechanism, and it is three lines of code away from being usable.** `projectOwnedAgentStubs` (`sync.js:289`) plus its create-if-absent loop (`sync.js:801-818`) is exactly "copy from the package once, then never touch again". That is what a workflow file needs. The recommendation (§7) is to reuse that *pattern*, not the channel machinery, and to gate it behind an explicit flag because **every useful workflow either spends model tokens or requests repository write.**

4. **A reusable workflow is the one option that would keep the template authoritative, and it is disqualified for a different reason than expected.** It is *not* disqualified by secrets leaking: a called workflow never receives the caller's secrets unless you pass them, and `secrets: inherit` is a caller-side choice (VERIFIED §2.4). It is disqualified by reachability and inertia — the caller must still author a file in its own `.github/workflows/` (so you have not removed the consumer-authored file, only shortened it), and every future template change re-authors code inside the consumer's CI the consumer never reviewed. That is the exact `refactor-agent-portability` defect already recorded in this repo: "the rewrite hardcoded **one consumer project's CI** into files that ship to every project" (`plan/refactor-agent-portability-v1.md:20`).

**Recommended design:** ship **templates** under a path that is already in the tarball but is *not* `.github/workflows/`, and add one setup phase that copies a named template into `.github/workflows/` **create-if-absent only, behind `--with-workflows=<name>`**. §7 has the exact constants, module, tests, and consumer command sequence. The shipped set is one file.

**Most important negative finding:** there is **no** safe default to enable. The only zero-token, zero-secret candidate (`docs-health.yml`) is still a *new gate on the consumer's PRs* that the consumer did not ask for, and it fails their PRs when a link rots. Even that one must be opt-in.

---

## 2. Evidence: what actually ships, and what a channel would do

### 2.1 Verified repo facts

| # | Fact | Evidence | Confidence |
|---|---|---|---|
| F1 | `.github/workflows/` is in the tarball allowlist | `package.json:53-68`, entry at `:56` | VERIFIED |
| F2 | Exactly two workflows exist: `pr-test.yml`, `npm-publish.yml` | `.github/workflows/` listing this session | VERIFIED |
| F3 | `npm-publish.yml` is deliberately inert outside the upstream repo | `npm-publish.yml:33-35`: `# This file is distributed to consumers, who may adapt it… Keep it inert anywhere but the upstream repo.` + `if: github.repository == 'abarcenas29/ai-workflow-template'` | VERIFIED |
| F4 | The tarball has been measured; the repo treats shipping workflows as a known, guarded condition | `docs/tracker-log.md:2389`; `docs/tracker-log.md:2320` ("a consumer who copies it must not be able to publish their own package with it") | VERIFIED |
| F5 | Sync has four channels and no `.github` channel | `sync.js:389-410` — keys `agents` (prefix `''`), `opencode` (`__opencode__/`), `scripts` (`__scripts__/`), `root` (`__root__/`); nothing else | VERIFIED |
| F6 | Sync never writes `.github/`; the README states the exclusion twice | `README.md:91` "GitHub Actions workflows are excluded from consumer sync (`.github/workflows/`)"; `README.md:133`; `README.md:368` | VERIFIED |
| F7 | `scriptsToSync` is an explicit allowlist, so `scripts/` is not a wildcard | `sync.js:61-74` (11 entries) | VERIFIED |
| F8 | `collectFiles` recurses the whole directory tree | `sync.js:419-436`; used at `sync.js:581` (`collectFiles(sourceAgentsDir)`) and `sync.js:626` (`collectFiles(sourceOpenCodeDir)`) | VERIFIED |
| F9 | Create-if-absent scaffold precedent exists and is one loop | `projectOwnedAgentStubs` at `sync.js:289`; loop at `sync.js:801-818` | VERIFIED |
| F10 | `--force` cannot override project ownership; the skip happens *before* the force branch | `sync.js:588-594` (`.agents/` pass), `sync.js:529-533` (prune) | VERIFIED |
| F11 | Prune deletes a consumer file only when the package no longer ships it **and** the consumer copy still matches the recorded hash | `sync.js:902-935`; the summary line is `sync.js:956-958` | VERIFIED |
| F12 | `--prune` is opt-in and off by default | `sync.js:334-348` (`prune: args.has('--prune')`); comment at `:342-344` | VERIFIED |
| F13 | Setups run eight phases; only discovery is fatal | `scripts/setup/index.js:178-446`; `EXIT_CODES` in `constants.js:164-168` | VERIFIED |
| F14 | Phase results map to four summary statuses via `actionStatus()` | `index.js:86-115`: `success` / `neutral` (`not-applicable`) / `warn` (`skipped`, `partial`) / `error` (`failed`) | VERIFIED |
| F15 | The setup command is **not** an install hook — there is no `postinstall` | `package.json` has no `postinstall` (only `prepare: husky` at `:17`); removal recorded at `docs/tracker-log.md:2020`, `:2363` | VERIFIED |
| F16 | CLI flags are a closed map; unknown flags are silently ignored | `constants.js:134-153`; `utils.js:305-339` | VERIFIED |
| F17 | `prettier` coverage is required for *hash-managed* paths only, and `.github/` is not in it | `requiredPrettierIgnorePatterns` at `sync.js:80-86`; shipped `.prettierignore` lines 1-26 contain no `.github` entry | VERIFIED |
| F18 | A `.github/workflows` prune entry would **not** currently be blocked, because the namespace prefix is unknown → `resolvePruneEntry` returns `null` | `sync.js:517-519` (`else if (manifestKey.startsWith('__'))` → `return null`); test matrix at `sync-unit.test.js:621-642`, row `['unknown internal namespace', '__future__/thing.md']` | VERIFIED |
| F19 | `tests/` asserts the repo structure but never asserts anything about `.github/workflows` shipping | `tests/ai-workflow.spec.ts:25-26` only notes `.github/` holds workflow YAML | VERIFIED |
| F20 | No unit test anywhere in `scripts/**` references `pr-test.yml` or `npm-publish.yml` | `grep` over `scripts/**/*.test.js` → no matches, this session | VERIFIED |

**F18 is the load-bearing line of this section.** It means `--prune` will *ignore* any `__github-workflows__/` key until `resolvePruneEntry` is taught otherwise — a safe-by-default position that a channel implementation would immediately spend.

### 2.2 What each of the two shipped workflows does to a consumer

Neither is a template, and neither is written to survive being copied:

| File | Trigger | Would it fire in a consumer repo? | What it would do | Why that is wrong |
|---|---|---|---|---|
| `npm-publish.yml` | `push: main`, `workflow_dispatch` | **No** — guarded by `if: github.repository == 'abarcenas29/ai-workflow-template'` (`:35`) | Nothing. The job is skipped. | Safe, but useless: it occupies the name `Publish to npm` in their Actions list and does not publish their package. A consumer who "adapts" it by deleting the guard now has a workflow that runs `npm ci`, `npx playwright install`, and `npm publish --provenance` with **their** `NPM_TOKEN` (`:103-106`). |
| `pr-test.yml` | `pull_request` → `main`, push | **Yes** — no repository guard | `npm ci`, `npm run test:unit`, and a Playwright job with `npx playwright install --with-deps chromium` (`pr-test.yml:1-54`, per the prior report §2) | It hardcodes `npm run test:unit` and `npm test`. A consumer without those scripts gets a red check on their first PR. It is this repo's CI, not a reusable gate. |

**Conclusion for §2.2:** the two files in the tarball are **not** shippable to consumers as-is. Any distribution design must ship *new* files, and leave the existing two where they are.

---

## 3. Distribution options, compared

Six options. For each: what lands in the consumer repo, how it updates, whether the consumer can opt out, whether it survives `npx ai-workflow-setup --force`, and whether the consumer's formatter touches it.

### 3.1 Ranking (summary)

| Rank | Option | Lands in consumer repo | Template stays authoritative | Survives `--force` | Survives `--prune` | Consumer effort | Verdict |
|---|---|---|---|---|---|---|---|
| **1** | **c. Consumer-owned dir + create-if-absent copy** | `.github/workflows/<one>.yml`, once | No (template copy also on disk) | **Yes** (absent from every copy pass) | **Yes** (unknown namespace → `null`, `sync.js:517-519`) | `npx … --with-workflows=docs-health` | **Recommended** §7 |
| 2 | b. Templates in `node_modules`, printed copy command | Nothing unless they copy | Yes (always fetchable) | **Yes** (no write at all) | **Yes** | Manual `cp` per workflow | Fallback if c is rejected |
| 3 | f. `anomalyco/opencode/github@latest` — ship nothing | Their own 15 lines | No (they own it) | Yes | Yes | They author it | Best for the *agent* workflows only |
| 4 | e. Composite action (`action.yml`) | 1 `uses:` line + a job | Yes | Yes | Yes | 1 step | Good companion to c, §3.5 |
| 5 | a. Sync channel to `.github/workflows/` | **Everything** in the dir | Partly | **No** — `--force` overwrites | **Risky** — see F11 | `npx …` | **Reject** §3.2 |
| 6 | d. Reusable workflow (`workflow_call`) | 1 `uses:` job | **Yes** | Yes | Yes | 1 job | **Reject for v1** §3.4 |

### 3.2 (a) A new sync channel writing `.github/workflows/` — rejected

**What lands:** everything `collectFiles` finds under the package's `.github/workflows/` — today both `pr-test.yml` and `npm-publish.yml`, because the channel's `packageDir` is a directory and `collectFiles` recurses (F8). Prune resolves `packagePaths = [resolve(channel.packageDir, relativePath)]` (`sync.js:535`), i.e. per-file against the *same* directory.

**How it updates:** like `.agents/`. Copy when absent (`sync.js:602-609`), overwrite when `--force` **or** the consumer hash still matches the manifest (`sync.js:611-617`), skip with a warning otherwise (`sync.js:619-620`).

**Can the consumer opt out?** Only by adding each filename to `projectOwnedPaths` — which is a source-code change in the template, not a consumer decision. There is no per-consumer opt-out. `.agents-sync-ignore` exists but the code comment is explicit: "sync protects this file from overwrite and prune, but it does **NOT** read or honour its globs yet. Do not present it as functional." (`sync.js:33-35`).

**Concrete risk table.**

| # | Failure mode | Mechanism, quoted | Severity |
|---|---|---|---|
| A1 | **Name collision overwrite.** Consumer already has `.github/workflows/pr-test.yml` for their own CI. | Sync treats it as a new tracked file; on the second run its hash is in the manifest, so `forceOverwrite \|\| isUntouched(recordedHash, existingHash)` (`sync.js:611`) is **true** and it is replaced. | 🔴 Loses an unknown amount of consumer CI |
| A2 | **Consumer edits clobbered.** They adapt `pr-test.yml` to their scripts. | `--force` is the documented escape hatch for exactly this (`utils.js:419`: "Overwrite existing hooks"), and it overwrites the workflow too. | 🔴 `--force` changes meaning |
| A3 | **Silent overwrite on first run.** They have never seen the file. | `if (!existsSync(targetFile))` (`sync.js:602`) — no confirmation, no backup. Note the hook installer *does* take a `.bak`; sync does not. | 🟠 |
| A4 | **Missing secrets → red CI.** An agent workflow needs `ANTHROPIC_API_KEY`. | The workflow is present and triggered; the step fails. Nothing in sync knows what secrets exist. | 🟠 Consumer's first experience is a failing check |
| A5 | **Scheduled spend.** A `schedule:` workflow runs weekly and burns their model budget. | `schedule` fires from the default branch once the file is committed (prior report §5.1 quoting the events page). Sync's only defence is that it wrote the file. | 🔴 Unbounded third-party spend |
| A6 | **Unagreed `contents: write`.** A workflow requesting write lands in a repo whose owners never agreed. | `permissions:` in the file is the grant; the repo-level default is only a floor. Prior report §5.3 is explicit that listing any scope sets the rest to `none` — but `contents: write` where listed is still write. | 🔴 Privilege granted by a dependency update |
| A7 | **`--prune` deletes a consumer workflow.** Package drops `agent-review.yml`; the consumer *copied* it verbatim and never edited it. | `existsSync(packagePath)` false → not still shipped (`sync.js:902-905`); hash matches → `rmSync` (`sync.js:937-944`). | 🔴 Deleted CI they still rely on |
| A8 | **`npm-publish.yml` lands everywhere.** It is inert only because of its guard. | F3. | 🟡 Name pollution; a guard one edit from being removed |
| A9 | **Manifest churn.** Every consumer's `.agents-sync-manifest.json` gains workflow keys that must be maintained forever. | `sync.js:459-461`. | 🟡 |
| A10 | **Formatter freeze.** If prettier formats the copied YAML, every later sync skips it. | The mechanism the whole `.prettierignore` machinery exists to prevent (`sync.js:76-79`, `README.md:109`). | 🟡 Unless F17 is extended |

**Does it survive `--force`?** No — that is A2 and the single most important line in the table.
**Does prettier touch it?** Not by default (F17), so it *would* freeze unless `.github/workflows/` joined `requiredPrettierIgnorePatterns` — which then warns every existing consumer.

**Verdict: reject.** A1/A2/A5/A6/A7 are each individually disqualifying, and four of the seven are 🔴.

### 3.3 (b) Templates in `node_modules`, printed copy command — viable fallback

**What lands:** nothing, unless the consumer acts. The template file is *already there* at `node_modules/@abarcenas/ai-workflow-template/.github/workflows/` — this is F1 and F4, and needs no code change at all. npm's `files` field governs the **tarball** ("describes the entries to be included when your package is installed as a dependency… will make it so that file is included in the tarball when it's packed", VERIFIED, <https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files>, fetched 2026-11-12), and `.github` is not on the always-ignored list (`.git`, `.npmrc`, `node_modules`, the lockfiles — same page), so a dotted directory listed in `files` does pack. Confirmed by `context7` against the npm CLI docs in this session.

**How it updates:** never, in place. The *template* updates with each `npm install`; the consumer's copy does not.

**Can the consumer opt out?** Trivially — they never copy.

**Survives `--force`?** Yes, in the strongest sense: sync does not write there, so there is nothing to force. **Prettier?** Unaffected — `node_modules/` is conventionally ignored, and even if formatted it is replaced on the next install.

**Strength:** zero new code, zero new failure modes, and it is honest about ownership — the file in the consumer repo is theirs from the moment it exists.
**Weakness:** it pushes all the brittle parts onto the consumer. They must copy at the right moment, edit the `--model` pin, add the secret, and set `permissions:`. Option (c) automates exactly the "copy at the right moment" step and nothing else, which is why it ranks above this one.

**Verdict: keep as the documented fallback.** It should exist regardless, because §3.6's recommended UX prints a copy command anyway.

### 3.4 (c) Consumer-owned template directory + create-if-absent copy — **the recommended design**

The proposal: keep the workflow sources in the tarball at a path the *template* owns and the consumer is free to read, and have one setup phase copy a named file into `.github/workflows/` only when that filename is absent — modelled on `projectOwnedAgentStubs`.

**Argument for, from the existing code:**

1. The pattern is already written and already tested. `projectOwnedAgentStubs` (`sync.js:289`) → loop (`sync.js:801-818`) does: resolve source, resolve target, `if (!existsSync(sourceFile) || existsSync(targetFile)) continue`, else `copyFileSync`. That is the entire "create once, hand over" contract, in six lines, with a comment that states its intent: *"Create-if-absent from the package copy… once present they are never overwritten, not even with --force."* (`sync.js:796-800`).
2. It is structurally immune to every 🔴 in §3.2: A1 (no write when present), A2 (`--force` never reaches it — the loop has no force branch at all), A7 (nothing to prune — see §5.3), and A10 (the consumer's formatting is irrelevant, because nothing is ever re-read or compared).
3. `--prune` is already safe against it *today*: `__github-workflows__/` is an unknown `__` namespace, so `resolvePruneEntry` returns `null` (`sync.js:517-519`) and the test matrix already asserts that behaviour for `__future__/thing.md` (`sync-unit.test.js:622`). Prune safety is free and needs a *regression test*, not new logic.
4. The phase vocabulary already exists: a phase returns `completed | dry-run | skipped | partial | not-applicable` and `actionStatus()` maps it (`index.js:86-115`). A workflow-install phase slots in without inventing a status.
5. There is precedent for "repo-level, GitHub-side, gracefully not applicable": `tracker-phase.js` does exactly this shape for labels, including `not-applicable` when there is no GitHub `origin` (`tracker-phase.js:88-111`).

**Argument against, stated honestly:**

1. **It does not solve updating.** Once copied, the consumer's file is frozen. §6 is entirely about that and it is the design's real cost.
2. **It adds a fifth write surface.** The repo currently has `.agents/`, `.opencode/`, `scripts/` (allowlisted), root files, and scaffolds; a new directory is one more thing to reason about, and one more place a future contributor could accidentally add force/prune semantics.
3. **A `.github/workflows/` file is executable privilege**, not configuration. The moment it exists it is live on the next push. The loop's create-if-absent guarantee is about *not clobbering*, not about *consent* — which is why the flag in §4 is mandatory, not optional.
4. **"Project-owned" is the wrong guarantee here** (see §5.2). Project-owned means "sync must never touch it", which is a stronger and *different* promise than "created once, then handed over". A workflow that the consumer has never opened is not project-owned in any meaningful sense; it is a template instance. Conflating them would make the code lie.

**Does it survive `--force`?** Yes — the loop has no force branch, and the path is absent from every copy pass.
**Prettier?** It does not matter by design: nothing re-reads the file, so hash drift cannot freeze anything. Recommend *not* adding it to `requiredPrettierIgnorePatterns` (§5.4), and note the consequence: if their formatter rewrites the YAML, the next template version simply will not auto-apply — which is already true.

**Verdict: accept, with the flag, with the anti-channel guardrails in §5, and with §6's drift report as the update story.**

### 3.5 (d) A reusable workflow published from this repo — rejected for v1

Mechanics, all VERIFIED from <https://docs.github.com/en/actions/how-tos/sharing-automations/reusing-workflows> and <https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations>, both fetched 2026-11-12:

- A reusable workflow is a workflow whose `on:` includes `workflow_call:`. It lives at `.github/workflows/` and, per the docs, "Subdirectories of the `workflows` directory are not supported."
- The caller invokes it at **job** level, not step level: `jobs.<id>.uses: {owner}/{repo}/.github/workflows/{filename}@{ref}`.
- **Reachability:** "The called workflow is stored in a **public** repository, and your organization allows you to use public reusable workflows." And the accessibility table is unambiguous:

  | Caller repository | Accessible workflows repositories |
  |---|---|
  | `private` | `private` and `public` |
  | `public` | `public` |

  So a **public** consumer can only call a **public** reusable workflow. `abarcenas29/ai-workflow-template` is public (it publishes an unscoped-scope public npm package with `publishConfig.access: public`, `package.json:40,45-48`), so the public direction is satisfied. **The constraint the question anticipated is real but already met for this repo** — it bites only if the template repo were ever made private.
- **Secrets:** a called workflow "is automatically granted access to `github.token` and `secrets.GITHUB_TOKEN`". Beyond that, **secrets are not passed unless the caller passes them** — either named (`MY_SECRET: ${{ secrets.MY_SECRET }}`) or wholesale via `secrets: inherit`. **`secrets: inherit` is a caller-side declaration; the called workflow cannot pull secrets it was not given.** So the answer to "can a public reusable workflow leak a consumer's secrets?" is **no**: the consumer's secrets stay in the consumer's repository, and only what the caller passes crosses the boundary, at job scope, for that run. The genuine risk is not leakage but *over-granting*: `secrets: inherit` hands the whole set to third-party code, which is why the docs' own secure-use page pairs it with "audit the source code".
- One important asymmetry: **`GITHUB_TOKEN` permissions can only be downgraded, never elevated, by the called workflow**, and "If `jobs.<job_id>.permissions` is not specified in the calling job, the called workflow will have the default permissions for the `GITHUB_TOKEN`". So the caller must *grant* write if a write is needed; the called workflow cannot self-grant.
- Runners and billing are **the caller's**: "The assignment of GitHub-hosted runners is always evaluated using only the caller's context. Billing for GitHub-hosted runners is always associated with the caller."
- **Pinning:** `{ref}` "can be a SHA, a release tag, or a branch name… Using the commit SHA is the safest option for stability and security." If a tag and a branch share a name, **the tag wins**. Re-run semantics differ by ref kind: "Re-running all jobs… will use the reusable workflow from the specified reference", but "Re-running failed jobs or a specific job… will use the reusable workflow from the same commit SHA of the first attempt."

| Question you asked | Answer | Evidence |
|---|---|---|
| Can a public reusable workflow be called by a consumer without secrets leaking? | **Yes.** Only caller-passed secrets cross. | VERIFIED, reuse-workflows page |
| `secrets: inherit` semantics | Caller-side; passes all the caller's secrets to the directly called workflow only; nested chains need re-passing. | VERIFIED, "Passing secrets to nested workflows" |
| `@v2` vs `@<sha>` | Both valid. SHA is "the safest"; a tag can be moved. Tag beats branch on a name collision. | VERIFIED, secure-use + reuse pages |
| Hard constraint | Called repo must be **public** for a **public** caller. | VERIFIED, accessibility table |

**Why reject for v1 anyway:** the consumer still writes a file in `.github/workflows/` — a ~10-line job with `uses:`, `with:`, `secrets:`. So the design removes the *body* of the workflow from the consumer's review surface while leaving a file they must own and version. Worse, it makes **every template change execute inside their CI with no change to their repository** — the consumer's code review never sees it. That is precisely the failure this repo already named and fixed once: a hardcoded foreign CI in files that ship everywhere (`plan/refactor-agent-portability-v1.md:20`). Also, `@v2` implies a tag the release flow does not currently produce: `npm-publish.yml:3-8` says "Tags play no part in publishing" and `README.md:360` says "Pushing a `v*` tag does not publish anything", so a `v2` tag would be a new, separately-maintained obligation.

**Where it *is* right:** if the template ever wants to ship a *behaviour* it must be able to fix for everyone at once (e.g. a security advisory in the agent prompt handling), a reusable workflow pinned to a **full SHA** with an explicit `permissions:` and named secrets is the correct instrument. **Defer to a v2 of this design**; do not build it first.

### 3.6 (e) A composite action — good companion, not the primary mechanism

VERIFIED from <https://docs.github.com/en/actions/sharing-automations/creating-actions/about-custom-actions> and <https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action>, fetched 2026-11-12:

- An action is defined by `action.yml` (or `.yaml`) with `runs: using: "composite"`, a list of `steps`, each with a `shell:`. It is invoked at **step** level: `uses: OWNER/repo/path@ref`.
- For actions in the same repository the docs recommend `.github/actions/<name>/`; for a separate repository "your repository must be public" to share it.
- Composite actions are supported on Linux, macOS, and Windows (the compatibility table).
- A composite action **cannot** define `permissions:`, `on:`, or `secrets:` — permissions are the calling job's, and secrets arrive as `env:`. So a composite action can package the *steps* but not the *trigger* or the *grant*.

**Comparison:** the consumer writes ~6 lines (job + `uses:` + `with:` + `env:`) instead of ~15. It updates in place and survives `--force` (no write). **But it has the same "executes in their CI without their review" property as (d)**, and it cannot carry the `permissions:` block, which is the part that most needs to be explicit and reviewable — a workflow that needs `contents: write` should show that word in the consumer's repository, not hide it behind a step-level `uses:`.

**Verdict:** a good *later* addition for the deterministic job (a `docs-health` action with no model and no writes is a clean candidate), not the mechanism for shipping workflows.

### 3.7 (f) `anomalyco/opencode/github@latest` — ship nothing

VERIFIED from <https://opencode.ai/docs/github/>, fetched 2026-11-12. The documented manual setup is one workflow file with `on: issue_comment / pull_request_review_comment`, and one step:

```yaml
- name: Run OpenCode
  uses: anomalyco/opencode/github@latest
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  with:
    model: anthropic/claude-sonnet-5-5
```

Documented properties relevant to this decision:

- `model` is **required**. `agent`, `prompt`, `mentions` (default `/opencode,/oc`), `variant`, `oidc_base_url`, `use_github_token` are optional.
- Default mode exchanges an OIDC token for a GitHub App token and **requires the OpenCode GitHub App installed**; `use_github_token: true` avoids the App but then the consumer grants permissions themselves.
- Supported events include `issue_comment`, `pull_request_review_comment`, `issues`, `pull_request`, `schedule`, `workflow_dispatch`.
- Fork caveat: "This example is intended for PRs from branches in the same repository; PRs from forks normally get a read-only `GITHUB_TOKEN` and no secrets." (Also in the prior report §3c/§4.4.)
- `opencode github install` is a **documented CLI command** that "will walk you through installing the GitHub app, creating the workflow, and setting up secrets."

**Rank:** third. It is the best answer for *agent* workflows on a comment trigger, because it is maintained upstream and the consumer owns the 15 lines. It is **not** a substitute for the package shipping anything: it cannot know this template's `reviewer` agent, its prompt files, or `docs-health.yml`'s deterministic checks, and it requires a third-party App for the default mode — which the prior report already ranked lowest for a repo with no issue backlog (prior report §7.5; value report §1.2 row 7).

### 3.8 Per-option answers to your two closing questions

| Option | Survives `npx ai-workflow-setup --force`? | Does the consumer's prettier/lint touch it? |
|---|---|---|
| a. sync channel | **No** — `--force` overwrites (`sync.js:611`) | Yes if not added to `.prettierignore`; must be added, which warns every existing consumer (F17) |
| b. `node_modules` template | **Yes** — nothing is written | N/A — under `node_modules/`, replaced on install |
| c. owned dir + create-if-absent | **Yes** — the loop has no force branch (`sync.js:801-818`) | Irrelevant by design; nothing re-reads it (§5.4) |
| d. reusable workflow | **Yes** — the consumer's 10-line caller is theirs | Only if they format their own YAML |
| e. composite action | **Yes** — `uses:` step, no file land | Only if they format their own YAML |
| f. `opencode/github` action | **Yes** — their file | Only if they format their own YAML |

---

## 4. Which workflows should ship at all

Cross-referenced against the value report's §4 build order: §4.1 `docs-health.yml` (0 tokens), §4.2 fix the mtime bug then widen schema validation to `docs/**` (0 tokens), §4.3 `docs-compaction.yml` (`workflow_dispatch` only, report only).

### 4.1 The rule

**Nothing that spends tokens, and nothing that writes, is enabled without an explicit flag.** Argued from the two reports' own risks:

- **R4 (prior report §8):** "Model cost is unbounded and the only real spend." The prior report's mitigation list starts with `workflow_dispatch` first, `timeout-minutes`, and an environment gate — all of which the *consumer* must configure. A template that pre-wires a `pull_request` trigger hands them a schedule of spend they did not choose.
- **R1 (prior report §8):** "`unit-tester` in CI can rewrite failing assertions (`edit: *.test.*` + `shell: allow *`)." A shipped workflow that grants `contents: write` to an agent makes R1 reachable in a repository whose maintainers never read `unit-tester.md`.
- **Value report §2d:** "Agent proposes → PR containing the deletions → human reviews the diff → merge. **Never auto-delete on a schedule.**" A shipped `schedule:` workflow is, by construction, an automatic trigger.
- **Prior report §5.7(1):** "`pull_request`, never `pull_request_target`, for anything that executes PR content." A consumer who edits a shipped template could reintroduce it; the template should therefore be minimal enough to read in one sitting.

### 4.2 Recommendation: ship one file, opt-in

| File | Ships | Secrets | Safe to enable by default? | Opt-in flag | Basis |
|---|---|---|---|---|---|
| `docs-health.yml` | **Yes** — the only shipped workflow | **None** | **No.** It is safe *to run* (0 tokens, `contents: read`) but it is a **new gate on their PRs** that fails on rotted links. | `--with-workflows=docs-health` | Value report §2f, §4.1 |
| `agent-review.yml` | **No** — document the copy command instead | `ANTHROPIC_API_KEY` (or provider) | No | — | Prior report §7.2; value report §1.2 row 2 |
| `docs-compaction.yml` | **No** | provider key | No | — | Value report §4.3 (report-only, manual) |
| `verify-local-hooks.yml` | **No** | none | No — it hardcodes `scripts/validate-memory-schema.js` and `scripts/vocab-sync.js`, which only exist if the consumer synced `scripts/` | — | Prior report §7.1 |

**Why only one ships, and why even it is opt-in:**

1. `docs-health.yml` is the only workflow whose *content* is 0 tokens and 0 secrets (value report §2f), so it is the only one where shipping a template is a pure convenience.
2. It is still a gate. The value report explicitly deferred this: "O-1 — Should the doc gate **fail** a PR or only annotate? … a first adoption week should annotate only." Shipping a *failing* gate as a package default contradicts the report's own deferred question. So the shipped template should be the **annotate-only** variant (`fail: false`), with a commented line showing how to make it blocking.
3. `verify-local-hooks.yml` looks like the safest candidate ("agent-free", prior report §7.1) but it is the *least* portable: it invokes two `scripts/` files that only arrive via `scriptsToSync` (`sync.js:61-74`), and its `npm run test:unit:coverage` step presumes a vitest setup. Copying it into a repo that has neither yields two failing steps. **It is a template for this repo, not for consumers.**
4. Every agent workflow is a *dependency update that grants CI write or spends their money*. The prior report's own first step is `workflow_dispatch`-only precisely so a human chooses each run; a copied file with a `pull_request` trigger removes that choice.

**Divergence from the value report, stated plainly.** Its §4 order is 4.1 `docs-health` → 4.2 mtime/schema fix → 4.3 compaction. That order is about *building* the workflows in this repo. For *shipping* them to consumers, 4.2 is a **blocker, not a step**, because a shipped `docs-health.yml` that calls `node scripts/validate-memory-schema.js` inherits two defects the consumer cannot see: `normalize-memory.js` stamps filesystem mtime (`scripts/normalize-memory.js:115-124`, verified in the value report) and `validate-memory-schema.js` only inspects `memory-bank/**` (value report §2e, defect 2). **The shipped template must therefore not call `validate-memory-schema.js` at all** — it should call only tools the consumer's repo actually has (lychee, markdownlint, git), and leave the repo-specific scripts to the repo.

---

## 5. The create-if-absent pattern, concretely

### 5.1 The precedent, quoted

```js
// sync.js:285-289
// Project-owned files that live under .agents/ rather than the consumer root.
// Paths are relative to .agents/. Scaffolded create-if-absent from the package
// copy — there is no duplicated stub text to drift — and then skipped by every
// copy pass via projectOwnedPaths, so --force cannot replace a consumer's edit.
export const projectOwnedAgentStubs = ['config/quality-gates.md']
```

```js
// sync.js:796-818
// Create-if-absent from the package copy. The .agents copy pass skips these
// paths (projectOwnedPaths), so this loop is the only way a fresh consumer
// receives them; once present they are never overwritten, not even with
// --force. Recorded under the bare .agents key, the same channel a copy would
// have used — resolvePruneEntry short-circuits on project-owned paths.
for (const relativePath of projectOwnedAgentStubs) {
  const sourceFile = resolve(sourceAgentsDir, relativePath)
  const targetFile = resolve(targetAgentsDir, relativePath)

  if (!existsSync(sourceFile) || existsSync(targetFile)) {
    continue
  }

  if (isVerbose) console.error(`  … scaffolding: .agents/${relativePath}`)
  if (!dryRun) {
    ensureParentDirectory(targetFile)
    copyFileSync(sourceFile, targetFile)
    if (isRegularFile(targetFile)) {
      manifest.files[relativePath] = hashFile(targetFile)
    }
  }
  scaffolded += 1
}
```

Four properties to preserve: **the guard is `existsSync(targetFile) → continue`** (not a hash comparison), **there is no `forceOverwrite` branch**, **the manifest key is the bare channel key** so a future copy pass would still find it, and **the source is the package copy, not duplicated stub text** ("there is no duplicated stub text to drift").

### 5.2 The two guarantees, kept distinct

| Guarantee | Meaning | Precedent | Right for a workflow? |
|---|---|---|---|
| **Project-owned** | `projectOwnedPaths` (`sync.js:29-42`): "Sync never copies, overwrites, or prunes them — not even with `--force`". Enforced in **four** places (`sync.js:592`, `:631`, `:672`, `:717`) plus prune (`:531`). | `AGENTS.project.md`, `opencode.json`, `.prettierignore`, `.agents-sync-ignore`, `config/quality-gates.md` | **No.** It means "an existing consumer file is sacred", which says nothing about creating a *new* one, and it hides the file from every future pass — including a future drift report. |
| **Create once, hand over** | Copy if absent; afterwards "sync must never touch it" *and* "sync may still read it to report drift" (§6). | `projectOwnedAgentStubs` alone | **Yes.** |

**Do not add `.github/workflows/*.yml` to `projectOwnedPaths`.** The set is channel-agnostic and matched on the *relative path* (`sync.js:24-27`: "a root entry such as `opencode.json` also protects `.opencode/opencode.json` and `.agents/opencode.json`"), so a `github-workflows/...` entry would not collide — but the semantic is wrong, and §6's drift report needs to *read* the consumer's file, which is a thing "project-owned" argues against.

### 5.3 If route (a) were chosen anyway — the exact implementation

Recorded for completeness, because the mechanism is real even though the design is rejected.

| Item | Value | Evidence |
|---|---|---|
| Constant | `const githubWorkflowStubs = ['docs-health.yml']` — an **allowlist array**, never a directory walk | Mirrors `scriptsToSync` (`sync.js:61-74`) and `projectOwnedAgentStubs` (`:289`) |
| Loop | A new create-if-absent loop after line `sync.js:818`, shape identical to `:801-818` | — |
| Source dir | `resolve(packageRoot, '__templates__/github-workflows')` — **not** `.github/workflows/`, because `collectFiles` would otherwise pick up `pr-test.yml`/`npm-publish.yml` (F8, A8) | `sync.js:419-436`, `:581` |
| Target | `resolve(consumerRoot, '.github', 'workflows', name)` | — |
| Manifest namespace | `__github-workflows__/<filename>` | Matches `__project__/`, `__memory-bank__/`, `__agents-instructions__/` (`sync.js:760`, `:779`, `:833`) |
| Joins `requiredPrettierIgnorePatterns`? | **No.** The list exists for *hash-managed* paths that sync re-reads (`sync.js:76-79`); a create-once file is never compared, so a formatter cannot freeze anything. Adding `.github/workflows/` would also emit the warning at `sync.js:88-89` for every existing consumer (F17). | `sync.js:80-86`, `:855-867` |
| What `--prune` must NOT do | Delete anything under `__github-workflows__/`. Today it already cannot (F18/`sync.js:517-519`), but that is incidental. Add an explicit guard beside the `__project__/` one, and an explicit test row. | `sync.js:495-499`, `sync-unit.test.js:622` |
| What `--prune` must also NOT do | Treat a **consumer** file at the same path as prunable. Only the manifest key `__github-workflows__/<name>` may ever be considered, and it must never be considered. | `sync.js:895-953` |

### 5.4 The **safer variant** — what §7 actually specifies

```
1. Location: scripts/setup/workflows-phase.js  (a setup phase, not a sync channel)
2. Input:    flag --with-workflows=<name>[,<name>]  (closed allowlist of names)
3. Source:   <packageRoot>/templates/github-workflows/<name>.yml
4. Target:   <consumerRoot>/.github/workflows/<name>.yml
5. Rule:     if existsSync(target) -> SKIP LOUDLY, print:
               "Skipped .github/workflows/<name>.yml - a file already exists there.
                Template: node_modules/@abarcenas/ai-workflow-template/templates/github-workflows/<name>.yml
                Compare with: diff node_modules/.../<name>.yml .github/workflows/<name>.yml"
             else if !hasGit or no .github  -> create both dirs and copy
             else copy
6. Never:    write on --dry-run; overwrite; delete; touch a file not named on the command line
7. Never:    join projectOwnedPaths, join requiredPrettierIgnorePatterns, join the manifest
```

**Why a phase, not a sync pass.** Sync runs on every `npx ai-workflow-setup` and inside `prepare`-adjacent flows; a phase runs once per explicit invocation with a flag. `.github/workflows/` is executable privilege, so its creation should be tied to a command the user actually typed, not to a routine sync. The `tracker-phase.js` precedent is exactly this shape: repo-level side effect, `not-applicable` when the environment cannot support it, never throws (`tracker-phase.js:14-23`).

**Why the loud skip prints a `diff` path.** It converts the "we could not update your file" silence into an actionable instruction, using a path the consumer already has (`node_modules/…` — F1).

**Why no manifest entry.** The manifest is a *drift* ledger for files sync owns (`sync.js:459-461`). A file sync creates once and never manages has no drift to track in that ledger, and adding a key creates the A9 churn for no benefit. Drift reporting for workflows belongs in its own command (§6.3), not in a file whose documented meaning is "what sync may overwrite".

---

## 6. The versioning and upgrade story

### 6.1 The honest answer

**With create-if-absent, an existing consumer's already-copied workflow never updates.** That is not a bug in the implementation; it is the definition of the guarantee. A shipped workflow pins `@opencode/cli@X`, action versions (`actions/checkout@v4`, `lycheeverse/lychee-action@v2`), and possibly a model (`anthropic/...`). When the template publishes 2.11.0 with a bumped pin, the consumer's file still has the old one, and `npx ai-workflow-setup` will not say so unless we tell it to.

This is materially different from how `.agents/` drifts, and the difference is worth stating precisely.

### 6.2 How the existing hash manifest handles `.agents/` drift

| Property | `.agents/` (hash-managed) | A copied workflow (create-if-absent) |
|---|---|---|
| Sync re-reads the consumer file | Yes — `hashFile(targetFile)` (`sync.js:598`) | No |
| Unmodified → refreshed | Yes — `isUntouched(recordedHash, existingHash)` → overwrite (`sync.js:611-617`) | No |
| Modified → skipped with warning | Yes — `sync.js:619-620` | No |
| Drift is detected | **Yes, automatically, every sync** | **No** |
| Prune can remove it | Yes when the source vanished and the content is unmodified (`sync.js:902-944`) | No |

**The reason a workflow must not use this mechanism** is the first row: re-reading and overwriting is what "managed" means, and a managed workflow is A1/A2. **The reason it still needs drift visibility** is the last row of the left column: the manifest is what makes drift *knowable*. Remove it, and the update story becomes "the consumer reads the changelog", which nobody does.

### 6.3 Three mechanisms, compared

| Mechanism | What it does | Cost | Verdict |
|---|---|---|---|
| **Documentation only** | README/CHANGELOG says "re-copy `templates/github-workflows/docs-health.yml` to update". | Free; ineffective. | Needed, insufficient alone |
| **`.tmpl` suffix + diffed report** | Ship `docs-health.yml.tmpl` and have the phase compare the *rendered* template against the consumer's file, printing a unified diff and a template-version stamp when they differ. | One new read path; no writes. | **Recommended** — but the suffix buys nothing the path does not already give, so simplify: compare the plain `.yml`. |
| **`sync --report-workflow-drift`** | A dedicated read-only mode of the sync CLI. | A new flag on a script whose flag set is `--force / --dry-run / --prune` (`sync.js:334-348`) and whose phase wrapper forwards only `--force` (`sync-phase.js:72`). | Rejected for now — the flag would only reach the consumer through `npx ai-workflow-setup`, which does not forward it |

**Recommended:** a **template-version stamp plus a read-only compare inside the setup phase**, modelled on `processOwnedStubs`'s byte-identity assertion ("The `.prettierignore` text here must stay byte-identical to the repository's shipped `.prettierignore` … so the tarball copy and the scaffold cannot drift", `sync.js:291-295`).

Concretely:

1. The template carries a first-line marker with its own version, e.g. `# ai-workflow-template:docs-health@2.10.0`. This is the same idiom already used for hooks — `HOOK_MARKER` at `constants.js:21`, "Used to detect whether an existing consumer hook was installed by us (idempotency check in `hooks.js`, CASE C)". Reuse the pattern; do not invent a second identity scheme.
2. On every run where `--with-workflows` is **not** passed, the phase does nothing — no reads, no output. Silence by default.
3. When `--with-workflows=<name>` is passed and the target exists, the phase compares the two files. If they differ it prints the diff location and both versions and returns **`partial`** (a real difference worth noting, not a failure — `actionStatus()` maps `partial` to `warn`, `index.js:105-106`). If they are identical it returns `completed` and prints nothing extra.
4. A future `--check-workflows` flag may run the same compare **without** the `--with-workflows` name, purely as a report. That is a clean extension of the same phase and does not touch `sync.js` at all.

**Why this is better than making workflows hash-managed:** it preserves the create-once guarantee *and* makes drift visible. The consumer is told "your file differs from the 2.11.0 template, here is the diff", and is never told "we changed it for you".

### 6.4 What this means for pins

The template should pin the **same** things the consumer's repo needs to be reproducible, and no more:

- `@opencode/cli` — pinned to an exact version, never `@latest`. The prior report already flags unpinned `npx -y …@latest` MCPs as "the single largest supply-chain exposure in this design" (§5.7(7), R3).
- Actions — `actions/checkout@v4` is what this repo already runs and has verified working (`pr-test.yml`, `npm-publish.yml:39`); do not mix with the `@v6` the docs now show (prior report §5.7(5)). `lycheeverse/lychee-action@v2` is verified in the value report §2c.
- No model default. A consumer who wants an agent workflow adds a provider key and a `--model`; the template should not ship a guessed model name, because prior report §5.6 records that "no provider/model choice is committed in a way CI can rely on".

---

## 7. Recommended design + implementation sketch (a spec, not code)

### 7.1 The design in one paragraph

Ship the one deterministic, zero-token, zero-secret workflow as a **template file** under `templates/github-workflows/` in the tarball. Add **Phase 9 — Workflows**, a setup phase modelled on `tracker-phase.js` (repo-side effect, graceful `not-applicable`, injectable filesystem/exec, never throws), which copies a template into `.github/workflows/` **only** when the consumer passes `--with-workflows=<name>` **and** the target filename is absent. It never overwrites, never prunes, never joins the manifest, never joins `projectOwnedPaths`, and never joins `requiredPrettierIgnorePatterns`. The existing `.github/workflows/pr-test.yml` and `npm-publish.yml` stay exactly where they are — repo-only, shipping in the tarball as they do today, with `npm-publish.yml`'s `github.repository` guard intact (`npm-publish.yml:35`).

### 7.2 Files to add

| File | Purpose |
|---|---|
| `templates/github-workflows/docs-health.yml` | The single shipped template. Annotate-only (`fail: false`), `contents: read`, no secrets, `ubuntu-slim`, `workflow_dispatch` + `schedule` + `pull_request` on `paths: ['**/*.md']` per value report §2f — **minus** the `validate-memory-schema.js` and `vocab-sync.js` steps, which are repo-specific (§4.2 point 2). First line carries the `# ai-workflow-template:docs-health@<version>` stamp |
| `scripts/setup/workflows-phase.js` | `runWorkflowsPhase(context, options)` → `{ action, message, installed: string[], skipped: string[] }` |
| `scripts/setup/workflows-phase.test.js` | Vitest, matching the `*.test.js` convention beside each module (see `tracker-phase.test.js`, `sync-phase.test.js`, `skills-phase.test.js`) |

### 7.3 Files to change

| File | Change | Exact location |
|---|---|---|
| `package.json` | Add `templates/` to `files` | after `package.json:56` |
| `scripts/setup/constants.js` | Add `'--with-workflows': 'withWorkflows'` to `SUPPORTED_FLAGS` | within `constants.js:134-153` |
| `scripts/setup/utils.js` | No change — `--flag=value` already parses into a string (`utils.js:320-329`), and `defaultFlags()` will pick the key up from `SUPPORTED_FLAGS` (`utils.js:281-284`) | — |
| `scripts/setup/ui.js` | Add `withWorkflows` to `descriptions` and `order` in `help()` | `ui.js:418-448` |
| `scripts/setup/index.js` | Add **Phase 9 — Workflows** after the tracker block, wrapped in the same try/catch and `actionStatus()` mapping | after `index.js:446`, before the summary at `:451` |
| `scripts/sync.js` | **No change.** Optionally one comment near `sync.js:18-20` recording why `.github/` is not a channel | — |
| `README.md` | Replace the flat exclusion claim at `:91`, `:133`, `:368` with: excluded from **sync**, available as **opt-in templates** | three places |
| `scripts/sync-unit.test.js` | One regression test: a `__github-workflows__/x.yml` manifest key resolves to `null` in `resolvePruneEntry` (extends the existing matrix at `:621-642`) | — |

**Deliberately not changed:** `projectOwnedPaths` (`sync.js:29-42`), `requiredPrettierIgnorePatterns` (`sync.js:80-86`), `pruneChannels` (`sync.js:389-410`), `scriptsToSync` (`sync.js:61-74`), `projectOwnedStubs` (`sync.js:296-332`), and `.prettierignore`.

### 7.4 The phase contract

```
runWorkflowsPhase(context, options) -> {
  action: 'completed' | 'dry-run' | 'skipped' | 'partial' | 'not-applicable',
  message: string,
  installed: string[],
  skipped: string[],
}
```

| Situation | action | Message shape |
|---|---|---|
| No `--with-workflows` | `not-applicable` | `Workflows: not requested (pass --with-workflows=<name>)` → **neutral**, no warning |
| `--with-workflows` names an unknown template | `skipped` | `Workflows: unknown template "<x>" — available: docs-health` |
| Target absent, copied | `completed` | `Workflows: installed .github/workflows/docs-health.yml` |
| Target present, identical | `completed` | `Workflows: .github/workflows/docs-health.yml already up to date` |
| Target present, differs | `partial` | `Workflows: .github/workflows/docs-health.yml exists and differs from the template — compare node_modules/@abarcenas/ai-workflow-template/templates/github-workflows/docs-health.yml` |
| `--dry-run` | `dry-run` | `Workflows: would install .github/workflows/docs-health.yml` |
| Not a git repo | `not-applicable` | `Workflows: not applicable — not a git repository` (mirrors `tracker-phase.js:88-90`) |

`actionStatus()` already handles all seven (`index.js:86-115`); no change to the mapping is needed. `not-applicable` → neutral means a normal `npx ai-workflow-setup` with no flag exits `SUCCESS`, not `WARNINGS` — which matters because `WARNINGS` is exit code 1 (`constants.js:164-168`) and would make every unflagged run "fail" in a consumer's CI.

### 7.5 Test plan (`scripts/setup/workflows-phase.test.js`)

Every case below uses a temp `consumerRoot` and an injected filesystem/exec, exactly as `tracker-phase.test.js` does ("zero network and zero real `gh` invocations", `tracker-phase.test.js:16-17`).

| # | Case | Assertion |
|---|---|---|
| T1 | No flag | `action: 'not-applicable'`; **no file created**; no warning printed |
| T2 | Flag + absent target | `action: 'completed'`; file byte-identical to the template |
| T3 | Flag + existing target with consumer content | `action: 'partial'`; **file byte-identical to the consumer's original** |
| T4 | `--dry-run` + absent target | `action: 'dry-run'`; **no file created, no directory created** |
| T5 | Unknown template name | `action: 'skipped'`; message lists the available names |
| T6 | Not a git repo | `action: 'not-applicable'` |
| T7 | `.github/workflows/` absent but `.github` present | both levels created; `action: 'completed'` |
| T8 | Unreadable template (injected read error) | `action: 'skipped'`; **never throws** |
| T9 | Template contains no secret reference and no `write` scope | pure string assertions on `templates/github-workflows/docs-health.yml`: no `secrets.`, no `contents: write`, no `pull_request_target`, and `permissions:` is exactly `contents: read` |
| T10 | Idempotence | run twice → second run `completed` + "already up to date"; file mtime unchanged |

And in `scripts/sync-unit.test.js`:

| # | Case | Assertion |
|---|---|---|
| T11 | `resolvePruneEntry('__github-workflows__/docs-health.yml')` | `null` — extends the matrix at `:621-642` |
| T12 | `runSync({ argv: ['--prune', '--force'] })` on a consumer holding `.github/workflows/docs-health.yml` | `pruned === 0`; file unchanged |

### 7.6 Consumer command sequence

```bash
# 1. Install (nothing is written to .github/) — already works today
npm install -D @abarcenas/ai-workflow-template

# 2. Normal setup — writes hooks, .agents/, .opencode/, scripts/, memory-bank/
npx ai-workflow-setup

# 3a. Preview what the optional workflow install would do
npx ai-workflow-setup --with-workflows=docs-health --dry-run

# 3b. Install it (create-if-absent; refuses to touch an existing file)
npx ai-workflow-setup --with-workflows=docs-health

# 4. Commit it — it is now the consumer's file
git add .github/workflows/docs-health.yml

# 5. Later, to compare against a newer template
npx ai-workflow-setup --with-workflows=docs-health   # prints the diff location if it differs
```

**Agent workflows are documented, not shipped** (§4.2):

```bash
# Read the template, then own your copy
cat node_modules/@abarcenas/ai-workflow-template/templates/github-workflows/agent-review.yml
cp node_modules/@abarcenas/ai-workflow-template/templates/github-workflows/agent-review.yml \
   .github/workflows/agent-review.yml
# Then: add ANTHROPIC_API_KEY as an environment secret with required reviewers,
# pin @opencode/cli to the version in the template, and keep `workflow_dispatch`.
```

### 7.7 Consumer-facing UX

Modelled directly on the contracts that exist.

**Setup summary row (from `ui.summary()`, `ui.js:303-388`).** Four possible rows:

```text
  Phase        Status         Message
  ───────────  ─────────────  ─────────────────────────────────────────────────────
  workflows    ✓ success      Installed .github/workflows/docs-health.yml
```

```text
  workflows    ⚠ warn         .github/workflows/docs-health.yml exists and differs from
                              the 2.10.0 template — see node_modules/…/docs-health.yml
```

A present-and-different file must be **`warn`**, not `error`: it is a normal consequence of ownership (§6.1), and `error` returns `FATAL` (`index.js:465`), which would make an update check fail the consumer's setup.

**When the flag is absent**, the phase prints nothing and the row is `neutral`:

```text
  workflows    not-applicable  Not requested (pass --with-workflows=docs-health)
```

**When a file already exists**, the loud skip (never silent, per A3's lesson):

```text
  ⚠ Workflows: .github/workflows/docs-health.yml already exists — left untouched.
    Template: node_modules/@abarcenas/ai-workflow-template/templates/github-workflows/docs-health.yml
    Compare:  diff .github/workflows/docs-health.yml \
                   node_modules/@abarcenas/ai-workflow-template/templates/github-workflows/docs-health.yml
```

**`--dry-run`** prints `Would install .github/workflows/docs-health.yml` and creates **neither the file nor the directory**. Note the existing caveat the README already makes explicit: `npx ai-workflow-setup --dry-run` skips the sync phase entirely (`README.md:93`), so the workflows phase must not depend on sync having run.

**`--force`** changes **nothing** in this phase. This is deliberate and should be documented next to the existing `--force` description ("Overwrite existing hooks (a `.bak` backup is created)", `ui.js:419`) — `--force` means "overwrite managed files", and a create-once workflow is not a managed file. If the docs do not say this, a consumer will run `--force` expecting an update and get a `partial` row instead — which is the correct outcome, but only if it is stated.

**`--knowledgebase`** precedent: that flag sets every other skip flag (`index.js:155-162`). `--with-workflows` must **not** do that; it is additive, not exclusive.

---

## 8. Risks of the recommended design

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| D1 | Consumer installs `docs-health`, a link rots elsewhere, and their PRs go red | 🟠 | Ship the **annotate-only** variant (`fail: false`); document the one-line change to make it blocking |
| D2 | Consumer's file is frozen at 2.10.0 forever | 🟠 | The `partial` row + diff path (§6.3); stamped template version |
| D3 | Template names collide with a consumer's own workflow | 🟡 | Create-if-absent + loud skip; never overwrite (T3) |
| D4 | Someone later "improves" the phase into a force-overwrite | 🔴 | T3 asserts the consumer's bytes survive **with `--force` in the argument list**; T12 asserts prune safety |
| D5 | Someone later adds `.github/workflows/` to `projectOwnedPaths`, silently disabling drift reporting | 🟡 | A test asserting `projectOwnedPaths` does not contain a `github-workflows` entry, matching the existing exact-equality test style at `sync-unit.test.js:1657` |
| D6 | The template itself drifts from what the repo runs (the `pr-test.yml`/`npm-publish.yml` problem) | 🟡 | The version stamp is asserted by a unit test against `package.json`'s version — the same byte-identity discipline as `sync.js:291-295` |
| D7 | A template accidentally gains a secret reference or `contents: write` | 🔴 | T9 is a string scan over every file in `templates/github-workflows/` |
| D8 | Consumers read "included in npm module" as "installed" and get nothing in `.github/` | 🟠 | README must say **excluded from sync; opt-in templates** — and the setup summary must show the `not-applicable` row naming the flag |

---

## 9. Open questions / deferred

| # | Question | Why deferred |
|---|---|---|
| Q1 | Should `docs-health.yml` ship as annotate-only or blocking? | The value report's O-1 defers exactly this pending one week of real data. Annotate-only is the safe default; the flag exists for the rest. |
| Q2 | Is a reusable workflow (`workflow_call`) worth building once the release flow produces immutable tags? | Rejected for v1 for the reasons in §3.5, not for a technical impossibility. Revisit if the template needs to fix a security issue across all consumers at once. |
| Q3 | Should the deterministic `docs-health` checks ship as a **composite action** instead of a workflow? | §3.6: clean fit, no writes, no secrets. It would need the consumer to still write a trigger, so it removes half the file, not all of it. |
| Q4 | Should `templates/` also hold the agent prompt files (prior report §7.6)? | Out of scope here; it is a packaging question, and `docs/` is deliberately excluded from the tarball (value report §2e note; `docs/tracker-log.md` records `npm pack` → "no `docs/` entries"). |

---

## 10. External resources

All fetched **2026-11-12** unless noted. **VERIFIED** = read this session.

**GitHub Actions — distribution mechanics**

- <https://docs.github.com/en/actions/how-tos/sharing-automations/reusing-workflows> — `workflow_call`; caller syntax `{owner}/{repo}/.github/workflows/{file}@{ref}`; `{ref}` "can be a SHA, a release tag, or a branch name", "Using the commit SHA is the safest option"; tag beats branch on a name collision; `secrets: inherit` is caller-side; secrets pass "only to directly called workflow"; "Subdirectories of the `workflows` directory are not supported". **VERIFIED**
- <https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations> — accessibility table (`public` caller → `public` workflows only); `GITHUB_TOKEN` permissions "can be only downgraded (not elevated)"; "The assignment of GitHub-hosted runners is always evaluated using only the caller's context. Billing… associated with the caller"; re-run semantics by ref kind; the `github` context is the caller's. **VERIFIED**
- <https://docs.github.com/en/actions/sharing-automations/creating-actions/about-custom-actions> — `action.yml`/`action.yaml`; types Docker / JavaScript / Composite; "To share actions you've built with everyone, your repository must be public"; composite supported on Linux, macOS, Windows. **VERIFIED**
- <https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action> — `runs: using: "composite"`, per-step `shell:`, `github.action_path`; `.github/actions/` recommended for same-repo; step-level `uses:`. **VERIFIED**
- <https://docs.github.com/en/actions/reference/security/secure-use> — "Any user with write access to your repository has read access to all secrets"; least-privilege `GITHUB_TOKEN`; "automatic redaction is not guaranteed"; "Never use structured data as a secret"; environment required reviewers; third-party action risk and SHA pinning; Dependabot ignores locally-referenced actions (`./.github/actions/foo.yml`). **VERIFIED**

**npm packaging**

- <https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files> — `files` "describes the entries to be included when your package is installed as a dependency… included in the tarball when it's packed"; the always-ignored list (`.git`, `.npmrc`, `node_modules`, the lockfiles); always-included (`package.json`, `README`, `LICENSE`, `main`, `bin`). **VERIFIED**
- `context7` → `/npm/cli` docs, queried this session for "does `files` affect node_modules or only the tarball" — the returned text is the same `files` section plus "Directories… will be walked recursively and their contents included", and "Symbolic links are never included in npm packages". **VERIFIED via context7** (third-party mirror; the npmjs.com page is the authority and agrees).

**OpenCode**

- <https://opencode.ai/docs/github/> — `anomalyco/opencode/github@latest`; `model` required; optional `agent`, `prompt`, `mentions`, `variant`, `oidc_base_url`, `use_github_token`; supported events; the fork-PR caveat; `opencode github install` as a documented CLI command; the `id-token: write` OIDC exchange. **VERIFIED**
- Prior report [`research-github-actions-agent-offload.md`](./research-github-actions-agent-offload.md) — `opencode run --standalone`, runner limits, billing, R1–R8, §7 workflow specs. **Not re-derived.** **VERIFIED (read this session)**
- Value report [`research-ai-doc-maintenance-workflows.md`](./research-ai-doc-maintenance-workflows.md) — §1.2 ranking, §2f `docs-health.yml` spec, §2d pruning safety, §3 cost, §4 build order, O-1…O-4. **Not re-derived.** **VERIFIED (read this session)**

**Repo files read this session**

`package.json`, `.github/workflows/npm-publish.yml`, `.github/workflows/pr-test.yml` (via prior report + repo state), `scripts/sync.js`, `scripts/sync-unit.test.js` (lines 590-643, 1440-1597), `scripts/setup/index.js`, `scripts/setup/sync-phase.js`, `scripts/setup/tracker-phase.js`, `scripts/setup/tracker-phase.test.js`, `scripts/setup/constants.js`, `scripts/setup/utils.js`, `scripts/setup/ui.js`, `scripts/setup/discover.js`, `scripts/setup/prepare.js`, `bin/setup.js`, `.prettierignore`, `README.md` (lines 70-134, 340-389), `docs/tracker-log.md` (searched), `memory-bank/architecture-context.md`, `plan/refactor-agent-portability-v1.md` (grep).

**MCP decisions.** Documentation MCPs used: `context7` (`/npm/cli`, for the `files`-vs-tarball question) and the `memory-bank` MCP (`memory_get` for `architecture-context` — note the file is **not** at `memory-bank/architecture-context.md`; it is reachable through the MCP's own store, so a plain `read` fails). GitHub docs were fetched directly from `docs.github.com`, which outranks any doc mirror. Knowledge retrieval: **skipped** — `knowledgebase_knowledgebase_search` returned "Knowledgebase not available: DATABASE_URL is not configured. Set `DATABASE_URL` in your .env file to enable cross-project knowledge search."

**Research limitations.**

- I did **not** run `npm pack --dry-run --json` (read-only research agent). The claim that `.github/workflows/` reaches a consumer's `node_modules` rests on three independent sources that agree: `package.json:56`, npm's `files` documentation, and the repo's own recorded observation (`docs/tracker-log.md:2389`). **No file count is asserted here.**
- I did **not** execute `npx ai-workflow-setup` against a scratch consumer. Every behavioural claim about the phases is a reading of `scripts/setup/*.js`, not an observed run.
- The reusable-workflow **secret-leak** answer is derived from the documented `secrets`/`inherit` mechanics, not from an observed run. The claim is narrow and matches the docs' wording exactly; a hostile caller passing `secrets: inherit` to any third-party workflow is the actual risk, and it is the caller's own choice.
- Token pricing is **UNVERIFIED** (inherited from both prior reports). No per-run dollar figure appears anywhere in this report.
- Whether `lycheeverse/lychee-action@v2` is still the current major was **not** re-checked this session; it is inherited as VERIFIED from the value report §2c dated 2026-11-12.

---

## 11. Status history

| Date | Status | Note |
|---|---|---|
| 2026-11-12 | ✅ Complete | Distribution options compared (§3), create-if-absent pattern specified against the existing code (§5), shipped set chosen (§4), drift story answered honestly (§6), spec written for `coder` (§7). No code, no file outside `docs/`, no command executed — read-only research agent. Builds on both prior reports without re-deriving them. |
