---
id: "research-github-actions-agent-offload"
title: "Offloading AI-agent work to GitHub Actions runners"
updated: "2026-11-12"
tags:
  [
    github-actions,
    opencode,
    ci,
    runners,
    agent-offload,
    oidc,
    secrets,
    concurrency,
    research,
  ]
entities: [github-actions, opencode, vitest, playwright, npm, husky]
doc_type: "research"
status: "complete"
---

# Offloading AI-agent work to GitHub Actions runners

**Question (verbatim):** "Can you research to me how can I leverage you to use github workflow to offload some work to the cloud using the runing units that I have?"

**Interpretation.** "Running units" = the GitHub Actions hosted runners this repo already uses (`ubuntu-latest`, `ubuntu-24.04`), i.e. the CI capacity on the plan, not local processes. Self-hosted runners appear only as a secondary option.

**Research date:** 2026-11-12 · **Repo state:** `@abarcenas/ai-workflow-template` v2.10.0

**Confidence labels used throughout**

- **VERIFIED** — the page was fetched in this session; the URL is cited inline.
- **RECALLED** — model knowledge, not re-fetched this session. Treated as a lead, not evidence.
- **UNVERIFIED** — could not be established; said so rather than guessed.

---

## 1. Bottom line

You can offload a real, useful slice of this repo's agent work to the runners you already pay for, but the slice is **smaller than it looks** and its boundary is drawn by three facts:

1. **Headless agent runs are a first-class, documented OpenCode feature.** `opencode run` is explicitly "designed for scripts, CI jobs, and other workflows" (VERIFIED, <https://opencode.ai/docs/cli/>). There is also a packaged GitHub Action, `anomalyco/opencode/github@latest`, with documented `schedule`, `workflow_dispatch`, `pull_request`, `issues`, and `issue_comment` triggers (VERIFIED, <https://opencode.ai/docs/github/>).
2. **The interactive half of this template cannot run there.** The orchestrator's confirmation gates, the `scope` round-trip ("never answers its own questions… no silence-as-consent"), and Chrome-DevTools browser debugging all require a human or a live browser. Running them unattended produces either a hang or an agent answering its own questions — the exact failure the spec forbids.
3. **GitHub Models is gone.** "As of July 30, 2026, GitHub Models has been fully retired. The playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer." (VERIFIED, <https://docs.github.com/en/github-models/about-github-models>). Any design that assumed a free, GitHub-provided inference endpoint is dead. A runner reaches a model through a **provider API key in secrets** (or OIDC to your own cloud), full stop.

**Recommended first step:** land one `workflow_dispatch`-only workflow, `.github/workflows/agent-review.yml`, that runs the **`reviewer`** role headlessly and uploads its report as an artifact. It touches nothing, needs no write token, and costs a few cents per run. Details in §7.

**Most valuable second step:** make the **knowledgebase re-index** a job (`npm run memory:rebuild`, `npm run kb:sync`) because it is currently a Husky post-merge hook that silently degrades to a no-op when `DATABASE_URL` is absent — see §5.4.

---

## 2. What actually exists in this repo (verified by reading)

| Fact | Evidence | Confidence |
|---|---|---|
| Two workflows only: `pr-test.yml` (unit + Playwright on PRs to `main`) and `npm-publish.yml` (push to `main` → npm publish with provenance) | `.github/workflows/` read this session | VERIFIED |
| `pr-test.yml` runs `npm ci` + `npm run test:unit` in one job, and `npm ci` + `npx playwright install --with-deps chromium` + `npm test` in a second job on `ubuntu-24.04` with `HEADLESS: 'true'` | `.github/workflows/pr-test.yml:1-54` | VERIFIED |
| `npm-publish.yml` already uses `permissions: { contents: read, id-token: write }`, a `concurrency:` group with `cancel-in-progress: false`, `timeout-minutes: 20`, an `if: github.repository == 'abarcenas29/ai-workflow-template'` guard, and `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` | `.github/workflows/npm-publish.yml:20-38,103-106` | VERIFIED |
| Node engine is `>=22`; both workflows pin `node-version: '22'` | `package.json:42-44`, both workflows | VERIFIED |
| 12 role agents + 3 orchestrators under `.opencode/agents/`; `orchestrator.md` defines a `Sub-Agent Registry`, `confirmationGates`, and a parallel-coder batch protocol | `.opencode/agents/orchestrator/orchestrator.md:36-50,263-305` | VERIFIED |
| `reviewer.md` is read-only: edit denied except `*.md`, shell is an ordered allowlist with a catch-all deny first | `.opencode/agents/reviewer.md:4-71` | VERIFIED |
| `unit-tester.md` may edit test files and has `shell: allow *` | `.opencode/agents/unit-tester.md:14-30` | VERIFIED |
| Husky `pre-commit` runs `scripts/bump-version.js`, `scripts/vocab-sync.js`, `scripts/validate-memory-schema.js`; `post-commit` syncs the knowledgebase; `post-merge` updates the memory index | `.husky/pre-commit:3-5`, `.husky/post-commit:7-10`, `.husky/post-merge:7-10` | VERIFIED |
| `package.json` already exposes machine-callable scripts: `test:unit`, `test:unit:coverage`, `test`, `memory:rebuild`, `memory:normalize`, `kb:sync`, `kb:stats` | `package.json:8-26` | VERIFIED |
| MCP servers are configured with `npx -y …@latest` and remote URLs, including `context7` via `{env:CONTEXT7_TOKEN}` | `opencode.json:3-67` | VERIFIED |
| `.env.example` documents `DATABASE_URL` (pgvector) and `OPENAI_API_KEY` for embeddings, both optional with graceful degradation | `.env.example:31-38` | VERIFIED |
| Knowledge retrieval ran: **skipped** — `knowledgebase_knowledgebase_search` returned "Knowledgebase not available: DATABASE_URL is not configured." | tool call this session | VERIFIED |

> **Note on the working tree.** `opencode.json` at the repo root is the distribution copy and its MCP block uses V1-shaped keys (`mcp`, `permission`, `plugins`). `memory-bank/activeContext.md` records that the **runtime** config was migrated to V2 shape (`{ "$schema": … }` only, plugins auto-discovered from `.opencode/plugins/`). Anything a CI job relies on must be checked against the shape actually committed, not the local git-ignored file.

---

## 3. What can actually be offloaded

Classified by *how much judgement* the job needs, because that is what determines whether an agent belongs in it at all.

### (a) Deterministic work already in CI — offloadable today, no agent needed

Tests, lint, coverage, and script execution are already there or trivially added. These need no model, no prompt, and no secret beyond the checkout token. This is the cheapest capacity you own and the part you should not spend agent tokens on.

| Candidate | Command that exists | Status |
|---|---|---|
| Unit tests | `npm run test:unit` | Already in `pr-test.yml` |
| Coverage gate | `npm run test:unit:coverage` | Not in CI today — new step, no agent |
| Playwright E2E | `npm test` (headless) | Already in `pr-test.yml` |
| Memory schema check | `node scripts/validate-memory-schema.js` | Only in the local pre-commit hook |
| Vocabulary sync check | `node scripts/vocab-sync.js` | Only in the local pre-commit hook |
| Agent spec parity | `scripts/sync-unit.test.js` and the `tests/**` spec tests | Covered by `npm run test:unit` |

**Key point:** the three Husky hooks are *local-only*. A contributor with hooks disabled, or a web-UI commit, bypasses `validate-memory-schema` and `vocab-sync` entirely. Re-running those two as plain CI steps is the highest-value, lowest-risk change in this entire report, and it involves no AI at all.

### (b) Non-interactive agent runs — the real offload surface

`opencode run` is the documented non-interactive entry point. The flags below are **VERIFIED** from <https://opencode.ai/docs/cli/commands/> (fetched 2026-11-12):

| Flag | Documented behaviour |
|---|---|
| `opencode run [message..]` | "Sends a message and prints the reply without opening the interactive interface." |
| `--model` / `-m` | Model in `provider/model` form; `--model provider/model#variant` also appears on `run` |
| `--agent` | Run with a specific agent |
| `--file` | Attach files to the message (`--file a.ts --file b.ts`) |
| `--format json` | "Emit newline-delimited JSON for scripts" |
| `--auto` | "Auto-approve permissions that are not explicitly denied" |
| `--standalone` | Private server, for CI: "use standalone mode so the private server receives it" |
| `--session` / `--continue` / `--fork` | Continue a specific or the last session |
| `--archived` | Keep a scripted run out of the session list |

The documented CI recipe is explicit (VERIFIED, same page):

```yaml
- uses: actions/checkout@v4
- run: npm install --global @opencode/cli
- run: opencode run --standalone --model anthropic/claude-sonnet-5-5 "Review this repository…"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Two consequences that matter for this repo:

- **`--standalone` is the CI-relevant flag**, because the default shared background server is a per-user service that will not exist on a runner.
- **Permissions resolve the same way in headless as interactive.** The `--auto` flag only approves what is *not explicitly denied*; an agent whose frontmatter denies `edit: *` still cannot edit, which is exactly the property that makes `reviewer` safe to run headlessly.

### (c) PR-triggered agent jobs — supported, with one hard caveat

`anomalyco/opencode/github@latest` documents these triggers (VERIFIED, <https://opencode.ai/docs/github/>): `issue_comment`, `pull_request_review_comment`, `issues`, `pull_request`, `schedule`, `workflow_dispatch`.

The action's inputs are `model` (**required**, `provider/model`), `agent`, `prompt`, `mentions` (default `/opencode,/oc`), `variant`, `oidc_base_url`, and `use_github_token`. Two operating modes:

| Mode | What it needs | What it can do |
|---|---|---|
| Default (OIDC) | `id-token: write`, `contents: read`, the OpenCode GitHub App installed | "OpenCode exchange an OIDC token for a GitHub App token, which supplies the permissions used to comment and push changes" |
| `use_github_token: true` | No app; you pass `GITHUB_TOKEN` and grant the scopes yourself | Runs "without installing the OpenCode GitHub App"; you must also set a git user name/email if it commits |

The caveat is in the docs themselves: *"This example is intended for PRs from branches in the same repository; PRs from forks normally get a read-only `GITHUB_TOKEN` and no secrets."* (VERIFIED, same page). See §4.4.

### (d) Scheduled / maintenance jobs — best fit for this repo

This is the category where a runner beats a human, because the work is periodic, boring, and currently silently skipped. Verified capabilities:

- `schedule` in the action "Requires `prompt` input. Output goes to logs and PRs (no issue to comment on)." (VERIFIED, <https://opencode.ai/docs/github/>)
- `workflow_dispatch` likewise requires `prompt` (VERIFIED, same page).
- Plain GitHub `schedule` has hard constraints, all VERIFIED from <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows> (§`schedule`):
  - "Scheduled workflows will only run on the default branch."
  - "By default, scheduled workflows run in UTC" (an IANA `timezone:` key now also exists).
  - "The shortest interval you can run scheduled workflows is once every 5 minutes."
  - "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."
  - "The `schedule` event can be delayed during periods of high loads… High load times include the start of every hour. If the load is sufficiently high enough, some queued jobs may be dropped."
- `workflow_dispatch` "only receives events when the workflow file is on the default branch" (VERIFIED, workflow-syntax page).

Candidate maintenance jobs for this repo, in value order:

| Job | Entry point that exists | Why a runner helps |
|---|---|---|
| Memory-bank normalization drift | `npm run memory:normalize` | Local-only today |
| Knowledgebase re-index | `npm run memory:rebuild`, `npm run kb:sync` | Post-merge hook no-ops without `DATABASE_URL` |
| Docs drift (stale `updated:` / tag vocabulary) | `scripts/validate-memory-schema.js` + a reviewer run | Never enforced for web-UI commits |
| Dependency bump PR | `npm outdated` / Dependabot | Not present today |
| Stale-artifact cleanup | `actions/upload-artifact` retention | Retention already 7 days in `pr-test.yml` |

---

## 4. What cannot be offloaded

State these as constraints, not preferences. Each one is grounded in this repo's own specs or in verified GitHub behaviour.

### 4.1 The orchestrator's gates

`orchestrator.md` defines `confirmationGates` (default `["researcher","implementer","scope"]`) and states the gate "fires **regardless** of `autoConfirm` and of `pipelineMode: auto` — it is a mandatory pause point" (`orchestrator/orchestrator.md:24,247-252`). A CI job has no one to answer "Confirm to proceed?". Running it unattended either hangs to the job timeout or requires weakening the spec — and the spec is the product.

### 4.2 `scope` grilling

`orchestrator.md:118` — "**Always interactive.** `scope` is a mandatory pause even under `autoConfirm: true`: never skipped, and the orchestrator never answers for the user — no 'assume defaults', no inferred answers, no silence-as-consent." A scheduled `scope` job would produce the one thing the spec exists to prevent: an agent inventing its own answers. **Do not schedule `scope`.**

### 4.3 Browser-session debugging

`e2e-tester.md` drives Chrome DevTools MCP. `pr-test.yml` already has to set `HEADLESS: 'true'` with the comment "CI runners have no display." A headless Chromium can run *Playwright specs* (§3a) but cannot stand in for a human-driven DevTools exploration session. Add that `chrome-devtools` and `playwright` MCPs are launched via `npx -y …@latest` in `opencode.json:9-46` — an unpinned `@latest` download on every CI run is a supply-chain and flakiness risk that must be pinned before any of this goes to a runner.

### 4.4 Fork PRs get no secrets

VERIFIED, <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>: "With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository. The `GITHUB_TOKEN` has read-only permissions in pull requests from forked repositories."

So **any PR-triggered agent job must be written to degrade gracefully for forks** — either skip (`if: github.event.pull_request.head.repo.full_name == github.repository`) or run without a model and say so. Note also: "Workflows triggered by Dependabot pull requests are treated as though they are from a forked repository, and are also subject to these restrictions."

### 4.5 Anything needing local credentials the repo will not get

`CONTEXT7_TOKEN`, `DATABASE_URL` (pgvector), and `OPENAI_API_KEY` are all absent on a fresh runner. Two of the three fail gracefully by design (`.env.example:31-38`), but `context7` will simply not work, and `knowledgebase_*` will return "Knowledgebase not available" — as it did in this very session. A scheduled knowledgebase job is therefore **blocked** until `DATABASE_URL` is added as a repository secret and the database is reachable from GitHub's IP ranges. GitHub explicitly warns against IP allowlists for hosted runners: "we do not recommend that you use these as allowlists for your internal resources" (VERIFIED, <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>).

### 4.6 Model access for untrusted code

`pull_request_target` runs "in the context of the default branch… This event allows your workflow to do things like label or comment on pull requests from forks. **Avoid using this event if you need to build or run code from the pull request.**" And the warning on the same page (VERIFIED): "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities. These vulnerabilities include cache poisoning and granting unintended access to write privileges or secrets." Plus, from the syntax page: under `pull_request_target`, "the `GITHUB_TOKEN` is granted read/write repository permission, even when it is triggered from a public fork."

An agent job *is* "running code" (it executes model-directed tool calls). So `pull_request_target` must never be used to give a fork's diff a model with secrets in scope.

---

## 5. The mechanics

### 5.1 Runner types

All VERIFIED, <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>:

| Label | Public repo | Private repo | Notes |
|---|---|---|---|
| `ubuntu-slim` | 1 CPU, 5 GB, 14 GB SSD | same | Container, not a VM; **"The job timeout for single-CPU runners is 15 minutes"**; unprivileged — no Docker-in-Docker |
| `ubuntu-latest` / `ubuntu-24.04` | 4 CPU, 16 GB | 2 CPU, 8 GB | The label this repo already uses |
| `ubuntu-24.04-arm` | 4 CPU | 2 CPU | ARM; the CLI ships a Linux ARM64 binary |
| `macos-latest` | 3-core M1, 7 GB | same | Most expensive |

`ubuntu-slim` is a genuinely interesting fit for `reviewer` jobs: lightweight, no Docker needed, and its 15-minute timeout doubles as a cost circuit-breaker.

**Larger runners** (Team/Enterprise only) offer static IPs, Azure VNet, GPU, and autoscaling — relevant only if you need to reach a private database or run local inference (§5.6).

### 5.2 Concurrency and time limits

All VERIFIED, <https://docs.github.com/en/actions/reference/limits>:

| Limit | Value |
|---|---|
| Concurrent jobs, Free plan | **20** (Pro 40, Team 60, Enterprise 500) |
| Concurrent macOS jobs | 5 (shared across standard and larger runners) |
| Job execution time, GitHub-hosted | **6 hours** |
| Job queue time, self-hosted | 24 hours |
| Job matrix | **256 jobs per workflow run** |
| Re-runs | 50 |
| Workflow file size | 500 KB |
| Concurrency group queue | 100 runs with `queue: max` |
| Workflow trigger rate | 1500 events / 10 s / repo |

Note the 256-job matrix cap. The repo's parallel-batch coder pattern (batch letters A→E, one task per spawn) maps onto a matrix, but a 60-task plan would consume a quarter of the free concurrency if all jobs ran at once.

`concurrency:` semantics (VERIFIED, workflow-syntax page): "By default, any existing pending job or workflow in the same concurrency group will be canceled and the new queued job or workflow will take its place." `queue: max` allows up to 100 pending; `queue: max` + `cancel-in-progress: true` is a validation error. The repo already uses this correctly in `npm-publish.yml:27-29`.

### 5.3 `permissions:` matrix you actually need

`write` includes `read`; "If you specify the access for any of these permissions, all of those that are not specified are set to `none`" (VERIFIED, workflow-syntax page). That default-`none` behaviour is the reason a job that omits `permissions:` entirely inherits the repository default, while a job that lists two scopes explicitly disables the rest.

| Job purpose | Minimum `permissions:` |
|---|---|
| Read-only agent review, artifact upload | `contents: read` |
| Agent posts a PR comment | `contents: read`, `pull-requests: read`, `issues: write` (the OpenCode docs note "GitHub handles PR comments through the issues API") |
| Agent pushes a branch / opens a PR | `contents: write`, `pull-requests: write` |
| Agent uses the OpenCode GitHub App via OIDC | `id-token: write`, `contents: read` |
| Coverage upload to Code Quality | `code-quality: write` (VERIFIED as an available permission, workflow-syntax page) |

### 5.4 OIDC vs long-lived secrets

VERIFIED, <https://docs.github.com/en/actions/concepts/security/openid-connect>: OIDC lets a job "request a short-lived access token directly from the cloud provider," removing the need to "duplicate your cloud credentials as long-lived GitHub secrets," and "your cloud provider issues a short-lived access token that is only valid for a single job."

Two distinct uses, and conflating them is the usual mistake:

1. **`id-token: write` → cloud provider (AWS/Azure/GCP/Vault).** Use this if you want the model behind your own cloud gateway without storing a static key. `npm-publish.yml` already declares `id-token: write` — but for npm provenance, not for LLM access.
2. **`id-token: write` → OpenCode's own token exchange.** The action's default mode does exactly this: "`id-token: write` lets OpenCode exchange an OIDC token for a GitHub App token."

**OIDC does not remove the model cost.** It removes the *credential*; you still pay the provider.

### 5.5 Caching, artifacts, matrix, dispatch

- **`actions/setup-node` with `cache: 'npm'`** is already in both workflows (`pr-test.yml:14-18`, `npm-publish.yml:50-53`) — it caches the *npm cache directory*, not `node_modules`. Cache allowance is 10 GB per repository, separately from artifact storage (VERIFIED, <https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions>). For `node_modules`, `actions/cache` keyed on `package-lock.json`'s hash is the pattern; `npm ci` remains the safer install command.
- **Artifacts:** `actions/upload-artifact@v4` with `retention-days: 7` is already used for the Playwright report (`pr-test.yml:48-54`). This is the cleanest return channel for an agent report — an HTML or markdown file the human downloads, with zero write permissions on the repo.
- **Matrix fan-out:** `strategy: matrix` with `fail-fast: false` and `max-parallel` maps directly onto the orchestrator's batch protocol (`orchestrator.md:263-305`): one matrix leg per task, and batch letters become sequential `needs:` chains rather than a single flattened matrix. **Caveat:** the orchestrator's per-task `TASK SLICE` and `stepKey` bookkeeping lives in an orchestrator session that does not exist in CI, so a matrix job is a *fan-out of prompts*, not a faithful reproduction of the batch contract.
- **`repository_dispatch`:** triggers a workflow from the REST API with a custom `event_type` — useful for "a local session finished; go run the review in the cloud" (`workflow_dispatch` and `repository_dispatch` are the two events that *do* create runs when triggered by `GITHUB_TOKEN`, per the events page note).
- **`workflow_dispatch` inputs:** max 25 top-level properties, max 65,535 characters payload, types `boolean | choice | number | environment | string` (VERIFIED, workflow-syntax page). A `task`, `agent`, and `model` input trio fits comfortably.

### 5.6 Model / inference reachability from a runner

| Route | How it works | Verified status |
|---|---|---|
| **Provider API key in repo/org/environment secret** | `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` in the step `env`, consumed by `opencode run` | **VERIFIED** — this is the documented CI recipe and the documented action input (`<https://opencode.ai/docs/cli/commands/>`, `<https://opencode.ai/docs/github/>`) |
| **Environment secrets with required reviewers** | A job "cannot access environment secrets until approval is granted by a reviewer" | **VERIFIED**, <https://docs.github.com/en/actions/reference/security/secure-use> — the right home for an expensive model key |
| **OIDC → your cloud LLM gateway** | Short-lived token exchanged with AWS/Azure/GCP, then OpenCode points at `settings.baseURL` | OIDC mechanism **VERIFIED**; OpenCode's `baseURL` override **VERIFIED** at <https://opencode.ai/docs/providers/>. The specific gateway wiring is **UNVERIFIED** — no end-to-end example was found |
| **GitHub Models** | — | **VERIFIED DEAD**: "fully retired" as of 2026-07-30, "inference API, and bring your own key (BYOK) are no longer available to any customer" |
| **Self-hosted inference** | `ollama` / `vllm` / `lmstudio` providers pointed at `settings.baseURL`; would need a larger runner with GPU or a reachable private endpoint | Provider support **VERIFIED** (<https://opencode.ai/docs/providers/>); feasibility from a hosted runner **UNVERIFIED** |
| **Copilot** | Device OAuth flow — inherently interactive | **VERIFIED** as device-OAuth only; unsuitable for unattended CI |

**Also worth noting:** the local `opencode.json` names `deepseek-flash` as the session model in this environment; no provider/model choice is committed in a way CI can rely on, so a workflow must pass `--model` explicitly. An explicit `--model provider/model` (and a pinned `--agent`) is the only way to keep a CI run deterministic.

### 5.7 Security posture — the non-negotiables

1. **`pull_request`, never `pull_request_target`, for anything that executes PR content.** Both the "avoid" sentence and the cache-poisoning warning are quoted in §4.6.
2. **Least privilege `GITHUB_TOKEN`.** "It's good security practice to set the default permission for the `GITHUB_TOKEN` to read access only for repository contents. The permissions can then be increased, as required, for individual jobs." (VERIFIED, secure-use page). Set it at the **repository level** too, so a workflow that forgets `permissions:` is still read-only.
3. **Secret masking is best-effort, not a guarantee.** VERIFIED, same page: "Because there are multiple ways a secret value can be transformed, automatic redaction is not guaranteed"; "Never use structured data as a secret… do not use a blob of JSON, XML, or YAML"; "Register all secrets used within workflows"; "If an unredacted secret is sent to a workflow run log, you should delete the log and rotate the secret."
4. **Who can read secrets:** "Any user with write access to your repository has read access to all secrets configured in your repository." This repo ships a public npm package — treat every secret as reachable by every collaborator.
5. **Pin the actions.** The docs and the OpenCode site both show `actions/checkout@v6`; this repo uses `@v4`. Do not mix without checking. **Do not invent versions** — `@v4` is what the repo already runs and is verified working; `@v6` is what the fetched docs show. Both are supported; pick one and be consistent.
6. **`::add-mask::`** for any derived value that must not appear in logs.
7. **Pin the `npx -y …@latest` MCP servers** before any agent runs on a runner. Fetching an unpinned package on every CI run is the single largest supply-chain exposure in this design.

---

## 6. Cost and limit math

All figures **VERIFIED** on 2026-11-12 from <https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions>.

**Per-minute rates (billed against included compute usage):**

| OS | SKU | $/minute |
|---|---|---|
| Linux 1-core x64 | `actions_linux_slim` | **$0.002** |
| Linux 2-core x64 | `actions_linux` | **$0.006** |
| Linux 2-core arm64 | `actions_linux_arm` | **$0.005** |
| Windows 2-core | `actions_windows` | $0.010 |
| macOS 3/4-core | `actions_macos` | $0.062 |

**Included compute usage per month:**

| Plan | Included compute | Artifact storage | Cache |
|---|---|---|---|
| Free | **$12** | 500 MB | 10 GB/repo |
| Pro | $18 | 1 GB | 10 GB/repo |
| Team | $18 | 2 GB | 10 GB/repo |
| Enterprise Cloud | $300 | 50 GB | 10 GB/repo |

**The most important line:** "Standard GitHub-hosted runners in **public** repositories" are **free and unlimited**, and "remain free independently and do not reduce the included compute usage." Same on the runners page: "Use of the standard GitHub-hosted runners is free and unlimited on public repositories." **Larger runners are billed for public repositories.**

**Concrete math for this repo** (`abarcenas29/ai-workflow-template` is a public npm package, so standard runners are free):

- Runner minutes: **$0**, regardless of how many jobs you add, as long as they stay on standard public-repo runners.
- The *only* marginal cost is the **model**. A 15-minute `reviewer` run on `ubuntu-slim` costs $0 in compute and whatever the model tokens cost.
- If the repo were private: `ubuntu-slim` at $0.002/min → $12 covers 6,000 minutes/month; `ubuntu-latest` at $0.006/min → $12 covers 2,000 minutes/month.
- Artifact storage: 500 MB on Free. A handful of markdown reports with 7-day retention is negligible; a Playwright report per run is not.

**UNVERIFIED:** per-token model pricing. The fetched OpenCode pages state a provider catalog exists at models.dev and that costs can be declared per model, but no number was verified this session. Do not put a per-run dollar figure on an agent job without checking the provider's own pricing page.

**Limit math for the free tier is therefore not the binding constraint — the model budget is.** That framing matters: it argues for *fewer, higher-value* agent jobs, and for `ubuntu-slim` wherever it fits.

---

## 7. Mapping to THIS repo — five proposed workflows

Each is described by name, trigger, jobs, permissions, secrets, estimated minutes, agent role, and return channel. Nothing here is implemented — this section is a specification for the `coder`/`deployer` agent.

### 7.1 `verify-local-hooks.yml` — deterministic, no agent (do this first)

| Field | Value |
|---|---|
| **Trigger** | `pull_request` → `main` and `push` → any branch |
| **Jobs** | One job, `ubuntu-slim`: `npm ci` → `node scripts/validate-memory-schema.js` → `node scripts/vocab-sync.js` → `npm run test:unit:coverage` |
| **Permissions** | `contents: read` |
| **Secrets** | none |
| **Estimated minutes** | 2–4 |
| **Agent role** | none |
| **Returns** | Pass/fail check |

Why first: it closes a real hole (Husky hooks are bypassable), has zero model cost, zero secret surface, and zero risk. It is also the prerequisite for every agent job that follows, because it proves the repo's gates are runnable from a clean runner.

### 7.2 `agent-review.yml` — the `reviewer` role, headless (recommended first *agent* step)

| Field | Value |
|---|---|
| **Trigger** | `workflow_dispatch` only (inputs: `base` (default `main`), `model` (choice)) |
| **Jobs** | `ubuntu-slim`; `actions/checkout@v4` with `fetch-depth: 0` (a diff review needs history), `setup-node` 22, `npm ci`, then `opencode run --standalone --agent reviewer --model <choice> "<prompt from docs/agents/pr-review.prompt.md>"` |
| **Permissions** | `contents: read` |
| **Secrets** | `ANTHROPIC_API_KEY` (or the chosen provider's key) from an **environment** with required reviewers |
| **Estimated minutes** | 5–12 |
| **Agent role** | `reviewer` — read-only by frontmatter (`edit: *` denied, shell allowlist with catch-all deny), so `--auto` cannot grant it a write |
| **Returns** | Artifact (`review-<sha>.md`) via `actions/upload-artifact@v4`, plus the job summary |

Why `workflow_dispatch` first and not `pull_request`: it lets you measure real token cost and real runtime on your own branch before any PR spends money. `reviewer` is the safest role because its permissions file already encodes the boundary. The `--format json` flag gives you machine-readable events if you later want to parse findings into a check.

### 7.3 `agent-test-triage.yml` — `unit-tester` in classify-only mode

| Field | Value |
|---|---|
| **Trigger** | `workflow_run` on `PR Unit Tests` `completed`, `if: github.event.workflow_run.conclusion == 'failure'` |
| **Jobs** | `ubuntu-latest` (needs the Playwright-capable image if E2E failed); download the failed run's artifacts, then `opencode run --standalone --agent unit-tester --model <choice>` with the failing output attached via `--file` |
| **Permissions** | `contents: read`, `actions: read` |
| **Secrets** | provider key |
| **Estimated minutes** | 5–15 |
| **Agent role** | `unit-tester`, **constrained by prompt to classify only** (MERGE-CAUSED vs PRE-EXISTING) and forbidden from editing |
| **Returns** | Artifact with the triage table |

**Design warning:** `unit-tester.md` has `edit: *.test.ts` and `shell: allow *` (`unit-tester.md:14-30`). On a runner with `contents: write` that becomes "an agent that can rewrite a failing assertion." Keep `contents: read` and rely on the artifact channel, or add a dedicated read-only `test-triage` agent file. This is the single most important permission decision in the whole proposal.

### 7.4 `agent-docs-drift.yml` — scheduled maintenance

| Field | Value |
|---|---|
| **Trigger** | `schedule: - cron: '17 6 * * 1'` (Monday 06:17 UTC — off the top of the hour, per the load warning) + `workflow_dispatch` |
| **Jobs** | `ubuntu-slim`; `npm run memory:normalize`; `node scripts/validate-memory-schema.js`; optionally `opencode run --agent reviewer --model <choice>` over `memory-bank/**` |
| **Permissions** | `contents: read` (report) or `contents: write`, `pull-requests: write` (open a fix PR) |
| **Secrets** | provider key |
| **Estimated minutes** | 3–8 |
| **Agent role** | `reviewer` (report) |
| **Returns** | Artifact; or a PR on `chore/docs-drift-<date>` |

Because the schedule only runs on the default branch and disables after 60 days of public-repo inactivity, and because drift reports are not urgent, weekly is right. Do **not** schedule `scope` or the orchestrator.

### 7.5 `agent-issue-triage.yml` — `issues: [opened]`

| Field | Value |
|---|---|
| **Trigger** | `issues: types: [opened]` |
| **Jobs** | `ubuntu-slim`; account-age spam filter via `actions/github-script@v7`; `anomalyco/opencode/github@latest` with `prompt` and `model` |
| **Permissions** | `id-token: write`, `contents: read`, plus `issues: write` |
| **Secrets** | provider key; **requires the OpenCode GitHub App installed** (OIDC mode) |
| **Estimated minutes** | 3–6 |
| **Agent role** | none of the 12; a triage prompt |
| **Returns** | Issue comment |

**Lowest priority.** It is the only proposal that requires installing a third-party GitHub App with repository write reach, and the repo has no issue backlog driving it. Note the docs' own caveat that scheduled/no-comment events "run without a user context to permission-check."

### 7.6 What to change in the repo to make any of this work

| Change | Why | Path |
|---|---|---|
| **Prompt files** | Keep CI prompts out of YAML so they are reviewable and versioned | `docs/agents/pr-review.prompt.md`, `docs/agents/test-triage.prompt.md`, `docs/agents/docs-drift.prompt.md` |
| **Headless entry wrapper** | One script that pins `opencode run` flags, adds `--standalone`, injects `--archived`, and fails on empty output | `scripts/agent-run.js` (invoked as `node scripts/agent-run.js reviewer --base main --out review.md`) |
| **New npm script** | Discoverability and consistency with the existing set | `package.json` → `"agent:run": "node ./scripts/agent-run.js"` |
| **Pinned CLI version** | Reproducible installs | `npm install --global @opencode/cli@<exact>` in the workflow, not bare `@latest` |
| **Pin MCP versions** | Removes `npx -y …@latest` from CI | `opencode.json` — pin `chrome-devtools-mcp`, `@playwright/mcp`, `ddg-mcp-search` to exact versions, or disable the browser MCPs for CI via a CI-specific config |
| **A CI config file** | The root `opencode.json` enables 10 MCP servers, including browser and Angular CLI ones, that a review job does not need | `opencode.ci.json` — `{ "$schema": …, "mcp": { "memory-bank": …, "knowledgebase": … }, "permission": {…} }` |
| **A read-only triage agent** | `unit-tester` can edit test files; CI triage must not | `.opencode/agents/test-triage.md` (edit `*` denied; shell read-only allowlist) |
| **Repository secret** | The model | `ANTHROPIC_API_KEY` (or provider of choice) in an **environment** named `agent-ci` with required reviewers |
| **Repository setting** | Defence in depth | Settings → Actions → Workflow permissions → **Read repository contents permission** (default) |
| **`DATABASE_URL` + reachable DB** | Unblocks every knowledgebase job | Repository/environment secret; requires network reachability, which hosted runners do not allowlist well |

---

## 8. Risks and the recommended first step

### Risks, ranked

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `unit-tester` in CI can rewrite failing assertions (`edit: *.test.*` + `shell: allow *`) | 🔴 High | `contents: read` + artifact return; or a dedicated read-only triage agent |
| R2 | `pull_request_target` used to give a fork a model | 🔴 High | Forbidden. `pull_request` + fork skip guard |
| R3 | Unpinned `npx …@latest` MCPs execute arbitrary code on every run | 🟠 Medium | Pin exact versions; CI-specific config |
| R4 | Model cost is unbounded and the only real spend | 🟠 Medium | `workflow_dispatch` first; `timeout-minutes`; `ubuntu-slim`; environment gate |
| R5 | Secrets are readable by anyone with write access | 🟠 Medium | Environment + required reviewers; rotate; never structured secrets |
| R6 | Scheduled workflows go silently dead after 60 days of inactivity | 🟡 Low | Pair every `schedule` with `workflow_dispatch` |
| R7 | Prompt drift between `docs/agents/*.prompt.md` and the agent specs | 🟡 Low | Reference the agent spec path in the prompt; review prompts like code |
| R8 | A model run that hangs to the 6-hour job limit | 🟡 Low | `timeout-minutes:` on the job, plus `ubuntu-slim`'s 15-minute cap where it fits |

### Recommended first step

**Ship §7.1 (`verify-local-hooks.yml`) as a plain, agent-free workflow, then §7.2 (`agent-review.yml`) behind `workflow_dispatch`.**

The exact file, the exact trigger:

```yaml
# .github/workflows/agent-review.yml
name: Agent Review (manual)
on:
  workflow_dispatch:
    inputs:
      base:
        description: Base ref to diff against
        type: string
        default: main
      model:
        description: provider/model to use
        type: choice
        options: [anthropic/claude-sonnet-5-5, anthropic/claude-haiku-5]
        default: anthropic/claude-sonnet-5-5

permissions:
  contents: read

jobs:
  review:
    runs-on: ubuntu-slim
    timeout-minutes: 20
    environment: agent-ci          # requires reviewer approval, holds the key
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm install --global @opencode/cli@<pin>
      - run: |
          opencode run --standalone --agent reviewer --model '${{ inputs.model }}' \
            "Review the diff between origin/${{ inputs.base }} and HEAD. $(cat docs/agents/pr-review.prompt.md)" \
            > review.md
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: agent-review
          path: review.md
          retention-days: 7
```

Six properties make this the right first step: it is **manual** (no surprise spend), **read-only** (`contents: read`, so the token cannot write even if the agent tried), **`reviewer`** (frontmatter already denies edits), **artifact-returning** (no PR comment, no commit), **cheap** (`ubuntu-slim`, free on a public repo, $0.002/min otherwise), and **time-bounded** (`timeout-minutes: 20`, plus a 15-minute platform cap on `ubuntu-slim`).

Then measure the token cost of three real runs before adding any `pull_request` trigger. That single measurement is the number every later decision depends on, and it is the one thing this report could not verify.

---

## 9. External resources

All fetched 2026-11-12 unless noted.

**OpenCode**

- <https://opencode.ai/docs/cli/> — CLI intro; "Use `opencode run` to submit a prompt without opening the interactive interface. It is designed for scripts, CI jobs, and other workflows."
- <https://opencode.ai/docs/cli/commands/> — full `run` flag list: `--model`, `--agent`, `--file`, `--format json`, `--auto`, `--standalone`, `--session`, `--continue`, `--fork`, `--archived`; the documented CI recipe.
- <https://opencode.ai/docs/github/> — the `anomalyco/opencode/github@latest` action, inputs (`model` required, `agent`, `prompt`, `mentions`, `variant`, `use_github_token`), supported events, fork-PR caveat, `id-token: write` OIDC exchange.
- <https://opencode.ai/docs/agents/> — agent `mode` (`primary`/`subagent`/`all`), `model: provider/model#variant`, ordered `permissions` with "last matching rule wins".
- <https://opencode.ai/docs/providers/> — provider config, `settings.baseURL` override, `ollama`/`vllm`/`lmstudio`, Copilot device-OAuth.
- <https://opencode.ai/docs/> — install paths, Docker image `ghcr.io/anomalyco/opencode:<version>`, Linux ARM64 binaries.
- <https://opencode.ai/docs/config/>, <https://opencode.ai/docs/permissions/> — fetched (HTTP 200) but not mined in depth.

**GitHub Actions**

- <https://docs.github.com/en/actions/reference/limits> — concurrency table (Free 20 / Pro 40 / Team 60 / Ent), 6-hour job cap, 256-job matrix, 500 KB workflow file, included compute per plan.
- <https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions> — per-minute rates, included compute ($12 Free … $300 Ent), "Standard GitHub-hosted runners in public repositories" are free.
- <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax> — `concurrency` + `queue`, `permissions` semantics and default-`none`, `schedule` + cron + timezone, `workflow_dispatch` inputs (25 properties / 65,535 chars), `workflow_call`.
- <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows> — `pull_request_target` "runs in the context of the default branch… Avoid using this event if you need to build or run code from the pull request" + cache-poisoning warning; `schedule` default-branch / UTC / 5-minute / 60-day-disable / delay caveats; fork secrets restriction; Dependabot treated as fork.
- <https://docs.github.com/en/actions/reference/runners/github-hosted-runners> — runner specs per label, `ubuntu-slim` 15-minute job cap and container isolation, larger runners, IP-allowlist advice.
- <https://docs.github.com/en/actions/concepts/security/openid-connect> — OIDC token exchange, per-job short-lived token, `sub` claim examples.
- <https://docs.github.com/en/actions/reference/security/secure-use> — least-privilege `GITHUB_TOKEN`, "automatic redaction is not guaranteed", "never use structured data as a secret", "any user with write access… has read access to all secrets", `::add-mask::`, environment required reviewers.
- <https://docs.github.com/en/github-models/about-github-models> — **"GitHub Models has been retired" as of 2026-07-30**; playground, catalog, inference API, BYOK unavailable.

**Repo files consulted**

`.github/workflows/pr-test.yml`, `.github/workflows/npm-publish.yml`, `package.json`, `opencode.json`, `.env.example`, `.husky/pre-commit`, `.husky/post-commit`, `.husky/post-merge`, `.opencode/agents/orchestrator/orchestrator.md`, `.opencode/agents/reviewer.md`, `.opencode/agents/unit-tester.md`, `docs/.architecture-context.md`, `memory-bank/activeContext.md`.

**MCP decision.** No documentation MCP was needed beyond `context7` (already configured); GitHub docs were fetched directly. `context7`'s `resolve-library-id`/`query-docs` were not used because every OpenCode and GitHub claim was resolved from the vendor's own pages, which outrank a third-party doc mirror. Knowledge retrieval was attempted and **skipped** (`DATABASE_URL` unset).

---

## 10. Status history

| Date | Status | Note |
|---|---|---|
| 2026-11-12 | ✅ Complete | Research done; no workflow implemented (read-only research agent). §7 is a specification for `coder`/`deployer`. |
