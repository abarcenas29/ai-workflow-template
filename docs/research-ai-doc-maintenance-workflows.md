---
id: "research-ai-doc-maintenance-workflows"
title: "What is actually worth running with AI in a GitHub workflow — and is doc sorting/pruning one of them?"
updated: "2026-11-12"
tags:
  [
    github-actions,
    opencode,
    ci,
    documentation,
    doc-staleness,
    doc-maintenance,
    pruning,
    lychee,
    markdownlint,
    vale,
    research,
  ]
entities: [github-actions, opencode, lychee, markdownlint, vale, knip, npm, husky]
doc_type: "research"
status: "complete"
---

# What is actually worth running with AI in a GitHub workflow

**Question (verbatim):** "What can I leverage with AI in github workflows? Run regular document sorting and pruning of stale docs in a repo?"

**Relationship to the prior report.** [`research-github-actions-agent-offload.md`](./research-github-actions-agent-offload.md) (2026-11-12) already establishes the *plumbing*: GitHub Models is retired (2026-07-30), `opencode run --standalone --agent X --model p/m` is the CI entry point, standard runners are free on public repos, the orchestrator gates / `scope` / DevTools sessions cannot be offloaded, and it proposes five candidate workflows (§7) with risks R1–R8. **None of that is re-derived here.** This report answers the *value* question the user actually asked: among everything AI can plausibly do in a GitHub workflow, what is worth building — and is "regular document sorting and pruning of stale docs" one of those things?

**Research date:** 2026-11-12 · **Repo state:** `@abarcenas/ai-workflow-template` v2.10.0

**Confidence labels**

- **VERIFIED** — the page/repo/file was fetched or read in this session; URL cited inline.
- **RECALLED** — model knowledge, not re-fetched this session. A lead, not evidence.
- **UNVERIFIED** — could not be established; said so rather than guessed.

---

## 1. Bottom line

Three findings, in order of how much they change the plan:

1. **Most of the twelve candidate jobs should not use a model at all.** Seven of the twelve have a deterministic tool that is cheaper, exact, and already exists (lychee, markdownlint, Knip, Dependabot, CodeQL, `git log`). Recommending an agent for those is a way to pay tokens to get a worse answer. The honest ranking in §1.2 puts five jobs above the line and seven below it.

2. **The user's doc sorting/pruning case splits cleanly in two, and the larger half is deterministic.** Detecting staleness — last-commit dates, frontmatter-vs-git disagreement, broken links, orphans, references to deleted paths — is a script. Judging whether a paragraph is *still true*, whether one doc *supersedes* another, or whether two docs should *merge* is the model's job, and it is the smaller, riskier half. **This repo can ship the detection half with 0 agent tokens** (§2f).

3. **This repo has already designed the pruning half.** `docs/spike-doc-compaction.md` (13 decisions, D-1…D-13) plus the shipped `.agents/prompts/doc-compaction.prompt.md` already encode: report-by-default, never content-rewrite historical docs, path-preserving `git mv` into an archive root, a scored deletion checklist (R1–R5, threshold ≥ 3), a `MAX_DOCUMENTS = 200` soft cap, and a hard-excluded governance surface list. **Any new workflow must reuse that prompt and schema, not invent a second opinion.** That is the single most important constraint in this report.

**Recommended first build:** a `.github/workflows/docs-health.yml` that runs deterministic doc checks on every PR touching `**/*.md` and a weekly drift report — **no model, no secret, $0 in tokens, free runner minutes** (§2f, §4).

---

## 1.1 How the ranking works

Rank by **value ÷ risk ÷ token cost**, as instructed. Each candidate is scored on four axes and then grouped:

| Axis | What it means | Scale |
|---|---|---|
| **V** (value) | Does the job catch something a human would otherwise miss or postpone? | 1–3 |
| **D** (deterministic-preferable) | Can a script/linter/DB-fix already do it exactly? | `yes` = model adds ~nothing; `partial` = model adds judgement on top; `no` = genuinely semantic |
| **R** (risk) | Blast radius if the model is wrong: does it write, delete, or gate a merge? | 1 (read-only report) – 3 (destructive or blocking) |
| **T** (token cost) | What the model must read per run | `0` / `small (diff)` / `large (tree)` |

The ordering below is the answer. **Jobs marked `D = yes` are ranked low not because they are low-value but because an agent is the wrong instrument for them** — the value is real, the token spend is wasted.

## 1.2 The ranking

| # | Job | Trigger | What the agent would do | Deterministic-preferable? | Returns | V / R / T | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **Docs drift & health (deterministic)** | PR on `**/*.md` + weekly cron | *Nothing — a script does it* | **yes** — use lychee / markdownlint / a small `git log` script | Check pass/fail + annotations | 3 / 1 / **0** | **Build this first.** Highest value per unit risk, and it costs no tokens at all. §2f |
| 2 | **PR review / diff review** | `workflow_dispatch` (then `pull_request`) | Reads a diff, reports findings on correctness, conventions, security smells | **partial** — Copilot code review already exists; lint/CodeQL cover the mechanical part | Artifact `review-<sha>.md` | 3 / 1 / small | **Worth it**, but only after measuring real token cost. Already §7.2 of the prior report; do not rebuild. |
| 3 | **Test-failure triage / classification** | `workflow_run` on failure | Classifies MERGE-CAUSED vs PRE-EXISTING from logs + diff | **partial** — CI already tells you *which* test failed; the model only labels *why* | Triage table artifact | 2 / 1 / small | **Worth it** *if* the repo's suite is flaky-prone. Needs a read-only agent file (prior report R1). |
| 4 | **Docs staleness *judgement* (semantic)** | Weekly cron, after #1 | "Is this paragraph still true?" "Does A supersede B?" "Should these merge?" | **no** — genuinely semantic | Proposal + `report.json` | 2 / **3** / large | **Worth it only in report mode**, reusing `doc-compaction.prompt.md`. Deletion stays human-gated. §2b–§2d |
| 5 | **Changelog / release-notes drafting** | On tag or `workflow_dispatch` | Groups merged PRs into user-facing release notes | **partial** — `git log --format` + PR labels get most of the way; prose is the model's only edge | Draft `CHANGELOG` section / PR body | 2 / 1 / small | **Marginal.** Only if you want prose, not a list. |
| 6 | **Dependency-bump PR explanation** | `pull_request` from Dependabot | Explains *what changed and why it matters* in a bump PR | **yes** — Dependabot already writes the changelog body and the compatibility notes | PR comment | 1 / 1 / small | **Skip.** Dependabot's own PR body is the deliverable; an agent restates it. |
| 7 | **Issue triage & labelling** | `issues: [opened]` | Labels, asks for repro, de-dupes | **yes** for labelling (label rules / issue forms); model only helps on *content* | Issue comment + labels | 1 / 2 / small | **Skip for now.** Requires a third-party GitHub App with write reach; the repo has no issue backlog (prior report §7.5). |
| 8 | **Dead-code / unused-export detection** | PR or weekly | Finds unreferenced files, exports, deps | **yes** — **Knip** does exactly this, and better (VERIFIED, <https://knip.dev/>) | — | 2 / 1 / 0 | **Skip the agent. Use Knip.** A model guessing at dead exports is strictly worse. |
| 9 | **Architecture-context regeneration** | On merge to `main` | Rewrites `docs/.architecture-context.md` from the tree | **partial** — a tree/glob script covers structure; the model adds prose | Updated doc PR | 1 / 2 / large | **Skip.** The current file is dated 2026-06-13 and manually bootstrapped; stale prose is not worth a token budget. |
| 10 | **Memory-bank / KB re-index & normalization** | Post-merge / cron | Runs `memory:rebuild`, `kb:sync`, `memory:normalize` | **yes, entirely** — these are existing npm scripts | Exit status | 2 / 1 / 0 | **Skip the agent; run the scripts.** Blocked on `DATABASE_URL` per the prior report §4.5. |
| 11 | **Flaky-test detection across runs** | Nightly over run history | Correlates failures across runs to find flaky specs | **yes** — this is counting over `gh run list` / JUnit history, not judgement | Flaky-spec table | 2 / 1 / 0 | **Skip the agent.** A script over stored results is exact; a model over the same data is a guess. |
| 12 | **Secret-scanning triage** | Code-scanning alert | Triages a secret alert | **yes** — GitHub secret scanning + push protection are the product | — | 2 / 3 / small | **Never.** Deterministic tools first, always; a model in the secrets path is an unacceptable risk surface. |

**Reading the table.** Rows 1–3 are worth building; row 4 is worth building *only* as a report; rows 5–12 are either already solved by a deterministic tool or barred on risk. The pattern is consistent: **an agent earns its cost only where the question is "is this statement true?" rather than "does this token exist?"**

---

## 2. The docs sorting/pruning case — deep dive

This is what the user asked. It gets the full treatment, because the answer is nuanced: **the mechanics are deterministic and the judgement is not, and conflating them is how doc-hygiene automation becomes destructive.**

### 2a. What "stale" can be measured deterministically

This is the part a model should **not** do. Every check below is exact, reproducible, and free.

**1. Last-commit date per file.** The single most useful signal, and one line of shell:

```bash
# Every tracked Markdown doc with the date of its last commit, oldest first
git ls-files 'docs/**/*.md' '*.md' | while read -r f; do
  printf '%s\t%s\n' "$(git log -1 --format=%cs -- "$f")" "$f"
done | sort
```

`%cs` is the committer date in `YYYY-MM-DD` short format; `%as` gives the author date. `%cs` is the right choice because it reflects when the change actually landed on the branch. This exact idiom is also what established practice uses (VERIFIED example, <https://datadef.io/guides/en/documentation-drift>, 2026-08-12).

**2. Frontmatter `updated:` vs git date disagreement.** This is where this repo has a real, measurable defect.

> **Measured this session.** `docs/**` contains **42 Markdown files** (41 before this report was added) but only **22** carry a YAML `updated:` field. The `docs/spikes/`, `docs/research/`, `docs/agents/`, and per-feature `docs/<feature>/` documents have **no frontmatter at all** — e.g. `docs/spikes/npm-e404-consumption-investigation.md` opens directly with `# Research Spike: …`. (VERIFIED by reading the files and grepping `^updated:`.)

Two consequences, and they matter for design:

- A date-based check that reads **frontmatter only** silently skips half the corpus. Microsoft's own freshness system documents that failure mode explicitly: "The script skips files with no frontmatter block… Files without `ms.date` are not counted as stale, and the skip is only reported in verbose output." (VERIFIED, <https://github.com/microsoft/hve-core/blob/main/docs/contributing/documentation-maintenance.md>, read 2026-11-12.) That page also warns that a malformed date "can hide a stale file."
- Therefore **git is the source of truth for date; frontmatter is a claim to be cross-checked against it.** The disagreement *between* them is itself a finding:

```bash
# Flag docs whose `updated:` frontmatter disagrees with the git date
for f in $(git ls-files 'docs/**/*.md'); do
  fm=$(sed -n 's/^updated:[[:space:]]*"\{0,1\}\([0-9-]\{10\}\)"\{0,1\}.*/\1/p' "$f" | head -1)
  [ -z "$fm" ] && continue
  gitd=$(git log -1 --format=%cs -- "$f")
  [ "$fm" != "$gitd" ] && printf 'DRIFT %s frontmatter=%s git=%s\n' "$f" "$fm" "$gitd"
done
```

The `docs-health-action` implements the same idea as a first-class check, "flagging docs where the dates diverge by more than 7 days" (VERIFIED, <https://github.com/joaquimscosta/docs-health-action>, read 2026-11-12).

**3. Broken relative links — use a link checker, not a regex.** Hand-rolled link matching breaks on code blocks, reference-style links, and anchors. This is a solved problem; see §2c.

**4. Orphaned files (no inbound links).** Build an inbound-link map from the corpus and report files nobody points to:

```bash
# Docs that no other tracked Markdown file links to (by filename stem)
for f in $(git ls-files 'docs/**/*.md'); do
  stem=$(basename "$f" .md)
  hits=$(git grep -l -- "$stem" -- '*.md' | grep -v -x "$f" | wc -l | tr -d ' ')
  [ "$hits" -eq 0 ] && echo "ORPHAN $f"
done
```

Caveat, stated plainly: an `index`/TOC file legitimately carries all inbound links, so "orphan" must be computed as *zero inbound links from anywhere except its own index* — otherwise every correctly-indexed doc reports as an orphan. The existing compaction prompt already solves this with row `R2` ("Zero inbound links from the scanned corpus", 2 points) and `R4` ("Not referenced by any `AGENTS.md`, `README.md`, or documentation index", 1 point) (VERIFIED, `.agents/prompts/doc-compaction.prompt.md:169-171`).

**5. Files referencing deleted paths / commands / exports.** Two exact sub-checks:

```bash
# Every fenced path-like token in docs, tested for existence on disk
git grep -hoE '`(\./|/)?[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+`' -- 'docs/**/*.md' \
  | tr -d '`' | sort -u | while read -r p; do
      [ -e "$p" ] || echo "MISSING-PATH $p"
    done
```

```bash
# npm scripts referenced in docs that no longer exist in package.json
node -e '
const s = Object.keys(require("./package.json").scripts || {});
const fs = require("fs"), cp = require("child_process");
const out = cp.execSync("git grep -hoE \"npm run [a-z0-9:_-]+\" -- \"*.md\" \"docs/**/*.md\"", {encoding:"utf8"});
const used = new Set(out.split("\n").map(l => l.replace("npm run ","").trim()).filter(Boolean));
for (const u of used) if (!s.includes(u)) console.log("MISSING-SCRIPT", u);
'
```

`docs-health-action` ships this class of check as both "broken links… and backtick-quoted file paths that point to missing targets" and "version drift — version numbers cited in docs that no longer match ground truth (`package.json`, `.nvmrc`…)" (VERIFIED, same repo page).

**6. Duplicate / near-duplicate docs.** Deterministic approximation: normalize whitespace and compare heading sets, or hash the body after stripping frontmatter.

```bash
# Identical bodies (after frontmatter strip) — exact duplicate detection
for f in $(git ls-files 'docs/**/*.md'); do
  sed '1{/^---$/!q};1,/^---$/d' "$f" | sha1sum | cut -d' ' -f1
done | sort | uniq -d
```

Near-duplicates require similarity scoring and are a **model judgement**, not a script — see §2b. The compaction prompt treats "content fully contained in another scanned document" as row `R3` (2 points), which is the right granularity: *containment*, checkable by hand at review time, not fuzzy similarity at scan time.

**7. Stale `TODO` / `DEPRECATED` markers.** Exact, with a date parsed out of the marker:

```bash
# TODO/DEPRECATED markers carrying a date older than 90 days
cut -d' ' -f1 <(date -v-90d +%Y-%m-%d) >/dev/null 2>&1 || true
THRESHOLD=$(date -v-90d +%Y-%m-%d 2>/dev/null || date -d '90 days ago' +%Y-%m-%d)
git grep -nE '\b(TODO|DEPRECATED|FIXME)\b[^\n]*\b(20[0-9]{2}-[0-9]{2}-[0-9]{2})\b' -- '*.md' \
  | while IFS=: read -r file line _rest; do :; done
# Belt-and-braces: list every dated marker and let the shell compare
git grep -hoE '\b(TODO|DEPRECATED|FIXME)\b[^\n]*\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b' -- '*.md' \
  | grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' | sort | awk -v t="$THRESHOLD" '$0 < t'
```

**8. Doc age vs subject churn** — the highest-signal staleness proxy that no date check alone gives you. A doc last touched two years ago in a directory with 400 commits since is drift with near-certainty:

```bash
# For each doc, count commits to a related code path since the doc last changed
since=$(git log -1 --format=%cs -- docs/setup-command/tracker.md)
echo "$since $(git rev-list --count "$since"..HEAD -- scripts/ bin/)"   # → date, commits-since
```

This is the check the drift literature calls the real unit of measure: "Age is a proxy for drift, not a measure of it. The real unit is 'changes to the system since the doc was last true'." (VERIFIED, <https://datadef.io/guides/en/documentation-drift>, 2026-08-12.)

**Summary of §2a.** All eight checks are deterministic, run in seconds on ~40 files, and need no model. **A workflow that runs only these has already captured most of the value of "regular document pruning."**

### 2b. What genuinely needs a model

Four questions cannot be answered by a date or a regex:

| Question | Why it needs a model | How often it is right | Where it hallucinates |
|---|---|---|---|
| **"Is this paragraph still true?"** | Requires reading the doc *and* the code it describes, then judging equivalence. | Moderately — reliable on *specific* claims (a named command, a named flag, a version number), weak on prose describing behaviour. | Invents plausible-but-wrong APIs; "fixes" a correct doc to match a misread symbol. |
| **"Is this doc superseded by that one?"** | Requires comparing two documents' semantic scope. | Good on near-identical topics with obvious recency; poor when both are partly current. | Declares supersession from title similarity alone. |
| **"Should these two be merged?"** | Requires judging whether the union is coherent and whether readers want them together. | Weak — merge decisions are editorial, not factual. | Proposes merges that duplicate sections or drop the historically specific parts. |
| **"Which section should this go in?"** | Requires understanding an intended taxonomy that may be unwritten. | Reasonable *if* the taxonomy is written down; near-random if it isn't. | Invents a taxonomy, then sorts against its own invention. |

**The honest summary, and it is the crux of this report:** a model is a good *proposer* and a poor *decider* on all four. It should emit candidates with a cited reason, never an action. The existing compaction prompt already encodes exactly this discipline — every deletion must "cite at least one row ID by name, verbatim", and "'Old and unused' is not a reason" (VERIFIED, `.agents/prompts/doc-compaction.prompt.md:160-180`).

**Where the model demonstrably adds nothing:** detecting that a link is broken, that a script is missing, that a file is old, or that two files are byte-identical. **Say it plainly: for those four, a script beats a model on cost, latency, precision, and auditability.**

### 2c. Do existing tools already do it? — verified

Only tools verified this session are named. **No action name or version here is invented.**

| Capability | Tool | Licence | Verified capability | Confidence |
|---|---|---|---|---|
| **Link checking** (internal + external + anchors) | **lychee** (+ `lycheeverse/lychee-action@v2`) | Apache-2.0 **or** MIT, dual | `--include-fragments` (anchor checking), `--offline`, `--exclude-path`, `--base-url`, `--root-dir`, exit code **2** = link failures; action has `fail`, `format: markdown\|json`, `output`, `jobSummary` inputs and an `args` passthrough | **VERIFIED**, <https://github.com/lycheeverse/lychee> and <https://github.com/lycheeverse/lychee-action> (read 2026-11-12) |
| **Markdown structure linting** | **markdownlint** (+ `markdownlint-cli2-action`) | MIT | Includes `MD051` *link-fragments* ("Link fragments should be valid"), `MD043` *required-headings*, `MD025` *single-title*, `MD041` *first-line-heading*; `applyFixes` for auto-fix | **VERIFIED**, <https://github.com/DavidAnson/markdownlint> (read 2026-11-12) |
| **Prose / style linting** | **Vale** (+ `vale-action`) | **MIT** — "Vale is a 100% open-source, MIT-licensed project" | Syntax-aware prose linting; rules are YAML; can target headings only; code blocks ignored by default; `substitution` rules for terminology consistency | **VERIFIED**, <https://docs.vale.sh/topics/readme.md> (read 2026-11-12) |
| **Dead code / unused exports & deps** | **Knip** | — (site doesn't state licence on landing page; do not assume) | "finds and fixes unused dependencies, exports and files"; 200+ plugins including **GitHub Actions** and Vitest | **VERIFIED as capable**, <https://knip.dev/> (read 2026-11-12); licence **UNVERIFIED** |
| **Doc staleness + frontmatter-vs-git drift** | **`docs-health-action`** (`joaquimscosta/docs-health-action@v1`) | MIT | Checks: `links`, `versions`, `staleness`, `claude-md`, `cross-doc`, `frontmatter`; flags frontmatter-vs-git divergence > 7 days; inline PR annotations; JSON artifact; `fail-on: errors\|warnings\|none` | **VERIFIED**, <https://github.com/joaquimscosta/docs-health-action> (read 2026-11-12) — **but 0 stars, 21 commits, created 2026-04-03**: treat as a *reference implementation to copy*, not a dependency to trust. |
| **Stale-doc → issue automation (reference)** | **microsoft/hve-core** `msdate-freshness-check.yml` + `create-stale-docs-issues.yml` | Repo's own | Compares `ms.date` against a 90-day threshold; `changed-files-only: true` on PRs; weekly full scan Monday 09:00 UTC; **idempotent** issue creation keyed on a hidden marker `<!-- automation:stale-docs:{file-path} -->` | **VERIFIED**, <https://github.com/microsoft/hve-core/blob/main/docs/contributing/documentation-maintenance.md> (read 2026-11-12). This is the most credible production pattern found. |
| **Dependency bumps** | **Dependabot** | GitHub product | Schedules, grouping, security updates; on Dependabot PRs "workflows are treated as though they are from a forked repository" (prior report §4.4) | **VERIFIED** via prior report |
| **Static analysis / security** | **CodeQL / GitHub Code Quality** | GitHub product | "Rules-based CodeQL-powered analysis on pull requests and on your default branch" + test-coverage metrics | **VERIFIED**, <https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review> (fetched 2026-11-12) |
| **Prettier / dprint** | formatting only | — | **Not evaluated here** — confirmed neither detects staleness; irrelevant to this question | **RECALLED** |

**Two things I could not verify, and will not assert:** per-action star counts as a proxy for quality beyond what's noted above, and whether the Marketplace `content-freshness-gate` / `Find Old Files` actions (which appeared in search results) are maintained — **UNVERIFIED**, do not adopt without checking the source repo.

**The critical gap in the tool ecosystem.** Every tool above detects *link rot*, *formatting*, or *date age*. **None** detects "this paragraph is now false." That is the genuine, narrow gap a model fills — and it is exactly the gap the existing compaction prompt targets. Which is why the recommendation is not "replace the prompt with lychee", it is **"run lychee/markdownlint as the gate, and keep the prompt for the judgement."**

### 2d. The pruning safety model

Deletion is irreversible in an agent's hands. GitHub's own documentation on agent-generated fixes is blunt about the general case: "AI-generated fixes are not always correct. Coding agents can produce incomplete patches, miss edge cases, or suggest changes that introduce new issues. **Always review the pull request, verify that tests pass, and confirm the fix is appropriate before merging.**" (VERIFIED, <https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation>.)

The recommended shape, and it matches what this repo already decided:

**Agent proposes → PR containing the deletions → human reviews the diff → merge. Never auto-delete on a schedule.**

Five mechanisms that make that shape safe:

1. **Report by default; writes require an explicit mode.** Already decided as D-1 and D-3: "Default output is a read-only report/proposal; destructive merging requires an explicit apply/merge flag" and "the exact `rm`/`git rm` manifest printed before any removal" (VERIFIED, `docs/spike-doc-compaction.md`).
2. **An exclusion list, checked before any proposal.** The compaction prompt hard-excludes `.agents/instructions/`, `.agents/skills/`, `.agents/config/`, `AGENTS.md`, `opencode.json`, `memory-bank/**` (D-10). For a *workflow*, add a machine-readable `docs/.doc-prune-ignore` (globs, one per line) so a run can exclude docs that are intentionally frozen without editing the workflow. This is a **new, small file** — it does not exist yet; I am specifying it, not claiming it.
3. **Archive, don't delete.** `git mv` into `docs/archive/<original path>` keeps the path relative-graph intact *and* keeps the content greppable, so a "deleted" doc can still be found by search and restored by `git mv` back. Deleting outright removes it from `git grep` at `HEAD`. The prompt's precedent is a "path-preserving `git mv` into a single archive root" (D-9).
4. **Never prune a doc that is stale in git but still correct.** This is the failure mode the user's phrasing invites. Three guards, in order: (a) **churn pairing** — if the *subject* code has not changed since the doc was written, age is meaningless (§2a check 8); (b) **property-based exceptions** — ADRs, `docs/adr/**`, tracker logs, and completed plans are *historical evidence*, never prunable content (prompt: "It is evidence, not draft text"); (c) **the acknowledgement step** — a human must actually read the manifest, which is the only mechanism that catches "the model thought this was obsolete and was wrong."
5. **Deletion is a scored decision, not a vibe.** Score ≥ 3 from the R1–R5 checklist, every score citing a row ID (VERIFIED, `.prompts/doc-compaction.prompt.md:160-180`). Nothing below threshold is proposed.

**One more, from experience the prompt already encodes:** *never* let the same scheduled job both propose and merge. The propose step must be `contents: read` (artifact/PR only); a separate, human-triggered step is what carries `contents: write`.

### 2e. A concrete "sorting" design

"What sorting means for a docs tree" decomposes into six operations. For each: script-able or model-worthy, and **what already exists in this repo**.

| Operation | Script or model? | What already exists to reuse |
|---|---|---|
| **Moving files into a declared taxonomy** | **Model proposes, script executes.** Choosing the folder is a judgement; performing the move is `git mv`. | `doc-compaction.prompt.md` already handles archival `git mv` with a printed manifest. Taxonomy itself is *not declared anywhere* — that is the gap. |
| **Fixing index / TOC drift** | **Script.** Compare `git ls-files docs/**` against `docs/TRACKER-INDEX.md` rows; a missing row is a mechanical diff. | `docs/TRACKER-INDEX.md` exists and is currently maintained by hand (55+ rows). No automation. |
| **Normalizing frontmatter** (`id`, `title`, `updated`, `tags`) | **Script, entirely.** | **Already built:** `scripts/normalize-memory.js` adds/corrects frontmatter, and `scripts/validate-memory-schema.js` validates `id`-matches-filename, ISO `updated`, and vocabulary `tags`/`category`. |
| **Alphabetizing indexes** | **Script.** `sort` on the table rows. | Nothing; trivial. |
| **Deduplicating sections** | **Model.** Containment/supersession is semantic. | `doc-compaction.prompt.md` R1/R3 rows. |
| **Enforcing required headings** | **Script** — lint rule, not a model. | `markdownlint` `MD043` *required-headings*. |

**What already exists that a workflow must reuse rather than reinvent (read this session):**

- **`scripts/normalize-memory.js`** — normalizes memory-bank **and** `docs/**` frontmatter; idempotent; supports `--dry-run` and `--force`; migrates `plan/` → `docs/`. Its `inferDocType()` already maps `spike`, `architecture`, `tracker-log`, etc.
- **`scripts/validate-memory-schema.js`** — validates `id` shall equal the filename, `updated` shall be `YYYY-MM-DD`, `category` shall be in the vocabulary, `tags` shall come from `memory-bank/.vocabulary.json`. **Note: it only inspects `memory-bank/**` files** (`getStagedMemoryFiles()` filters `f.startsWith('memory-bank/')`), so it currently does **not** validate `docs/**` at all.
- **`memory-bank/.vocabulary.json`** — the tag/category vocabulary (`doc_types`: `spike`, `architecture`, `configuration`, `orchestrator-log`, `tracker-log`, `decision`; `file_category_map`; `entity_patterns`).

**Two real defects found while reading, both worth fixing before any workflow depends on them:**

1. **`normalize-memory.js` uses filesystem mtime, not git commit date.** `getGitMtime()` is documented as "Fallback to filesystem mtime if git not available" but never attempts `git` — it always calls `statSync(filePath).mtime` (VERIFIED, `scripts/normalize-memory.js:115-124`). On a fresh CI checkout every file has *today's* mtime, so a run would stamp `updated: <today>` onto every doc it touches. **This must not be run in CI as-is** — it would manufacture the exact drift §2a is meant to detect.
2. **`validate-memory-schema.js` does not cover `docs/**`.** Extending its file filter (or adding a parallel `docs` mode) is the cheapest way to get frontmatter validation on the doc corpus — reusing a tested module rather than writing a new one.

### 2f. Verdict + the minimal viable workflow for this repo

**Verdict on the user's question.** "Regular document sorting and pruning of stale docs" is **worth doing, and is mostly not an AI job.** Rank it high on value (V = 3) — stale docs actively mislead agents and humans — but the *detection* half is deterministic (`D = yes`, `T = 0`) and the *judgement* half already has a shipped, human-gated prompt. **Do not build a new agent to do what lychee + markdownlint + a 30-line script + `doc-compaction.prompt.md` already do.**

**The minimal viable workflow — and yes, it needs 0 agent tokens.**

| Field | Value |
|---|---|
| **File** | `.github/workflows/docs-health.yml` |
| **Trigger** | `pull_request: paths: ['**/*.md']` (gate) **and** `schedule: cron '17 6 * * 1'` + `workflow_dispatch` (drift report). Never `pull_request_target` (prior report R2). |
| **Runner** | `ubuntu-slim` (15-min platform cap doubles as a timeout; free on public repos) |
| **Steps** | `actions/checkout@v4` with `fetch-depth: 0` (staleness needs history) → `lycheeverse/lychee-action@v2` with `fail: true`, `--offline` for the internal-link subset → `markdownlint-cli2-action` (or `npx markdownlint-cli2`) → `node scripts/validate-memory-schema.js` → a new `scripts/docs-staleness.js` printing the §2a table |
| **Permissions** | `contents: read` **only.** No `pull-requests: write` on the first iteration. |
| **Secrets** | **none** |
| **Returns** | Pass/fail check on PRs; on schedule, the staleness table to `$GITHUB_STEP_SUMMARY` + a JSON artifact (`retention-days: 7`) |
| **Model** | **none** |
| **Token cost** | **0** |

Why `--offline` for the internal subset: it confines the PR gate to *this repo's own* links, so a flaky third party cannot fail a docs PR. The external-link sweep belongs on the schedule, not the gate — a distinction lychee's `--offline` flag makes explicit (VERIFIED, lychee README).

**The second, optional step — keep the prompt, move it into CI.** Once §2f is green, wire `.agents/prompts/doc-compaction.prompt.md` into a **`workflow_dispatch`-only** job that runs `opencode run --standalone --model <pinned> --agent <read-only>` with the prompt and uploads `report.json` + the human report as an artifact. That is the "judgement" half, it never writes, and it reuses D-1…D-13 rather than re-deriving them.

---

## 3. Cost reality

Token cost per job class is the binding constraint (prior report §6: runner minutes are free on a public repo; **the model is the only marginal cost**). What drives each top-ranked job's cost, and the cheapest bound:

| Job | Cost driver | Cheapest bound | Evidence |
|---|---|---|---|
| **Docs health (deterministic)** | **Nothing.** Git + lychee + markdownlint are CPU. | `paths: ['**/*.md']` so it only runs on doc changes; `--offline` on PRs to avoid network retries | lychee "Exit codes… 2 Link check failures"; `--offline` "Only check local files and block network requests" (VERIFIED) |
| **Docs staleness judgement** | **Number of docs × their length.** The agent reads the whole corpus. | Feed **only the flagged files** from §2f as `--file` args — the §2a script already ranks them. Then the model reads ~5 docs, not 41. | OpenCode `--file` attaches files to the message (prior report §3b, VERIFIED) |
| **PR review** | **Diff size**, plus how much of the repo the agent chooses to read. | Checkout with `fetch-depth: 0` but prompt for the *diff only*; cap PR size with a skip guard; `ubuntu-slim`'s 15-min cap | Prior report §7.2 |
| **Test triage** | **Failure log size** — the worst case is a 40 MB Playwright log. | Attach only the *failing* test names + last N lines per failure via `--file`; never the whole artifact | Prior report §7.3 |
| **Changelog drafting** | **Number of commits/PRs since last tag.** | `git log <last-tag>..HEAD --format` as the only input, not the full history | — |

**One verified hard limit worth designing against:** Copilot code review — a useful benchmark for "what a cheap model pass over a PR costs" — has documented limits of "≤ 10 GB / **≤ 100 files**" per PR and "Concurrent reviews (org / user / PR) 5 / 2 / 1" (VERIFIED via <https://techcommunity.microsoft.com/blog/microsoftmissioncriticalblog/ai-just-joined-your-code-reviews-github-copilot-comes-to-azure-repos/4552795>, 2026-09-03 — *Azure Repos*, so apply the shape, not the numbers, to GitHub Actions).

**No invented pricing.** Per-token model pricing remains **UNVERIFIED** (prior report §6). The prior report's instruction stands and should be followed literally: *measure three real runs before adding any automatic trigger.*

**The one cost insight this report can add:** **the deterministic checks are the cheapest way to reduce the expensive job's cost.** §2f narrows ~40 docs to a handful of flagged ones; that smaller set is the *input* to the model job. Doing the script first is not just safer — it makes the agent job cheaper by an order of magnitude.

---

## 4. Recommended build order

Three items, maximum. The first requires zero agents.

### 4.1. `docs-health.yml` — deterministic doc gate + weekly drift report (0 tokens)

`.github/workflows/docs-health.yml`, as specified in §2f. `lychee-action@v2` + markdownlint + `validate-memory-schema` + a new `scripts/docs-staleness.js` that emits the §2a table. `contents: read`, no secrets, `ubuntu-slim`. This closes a real hole: **nothing currently validates `docs/**` at all** — `validate-memory-schema.js` only looks at `memory-bank/**`. It is also the prerequisite for everything else, because it produces the ranked list the model job consumes.

### 4.2. Fix the mtime bug, then extend schema validation to `docs/**`

Before any workflow calls `normalize-memory.js`: replace `getGitMtime()`'s `statSync().mtime` with `git log -1 --format=%cs` and keep mtime only as a genuine fallback. Then widen `validate-memory-schema.js`'s file filter to include `docs/**`. Both are small, tested-module changes; both are prerequisites for trusting any frontmatter `updated:` date. **Still 0 tokens.** (This is the second item precisely because §4.1 exposes the bug rather than depending on it.)

### 4.3. `docs-compaction.yml` — `workflow_dispatch` only, report-only

Run `.agents/prompts/doc-compaction.prompt.md` through `opencode run --standalone --agent <read-only> --model <pinned>` with `--file` restricted to the files §4.1 flagged. Upload `report.json` + the human report as an artifact. **No writes, no PR creation, no schedule.** This is where a model first earns its cost, and it is deliberately last because it is the only item that spends tokens and the only one that could be wrong in a way that matters.

**Explicitly not recommended:** the seven "skip" jobs in §1.2 — especially dead-code detection (use Knip), dependency-bump explanation (Dependabot's own PR body), and anything touching secret scanning.

---

## 5. Open questions / deferred

| # | Question | Why deferred |
|---|---|---|
| O-1 | Should the doc gate **fail** a PR or only annotate? | Microsoft's pattern fails on stale files in `docs/` they touched; a first adoption week should annotate only. Needs one week of real data. |
| O-2 | Is a declared `docs/` taxonomy warranted, or is the current flat layout fine? | No evidence either way; a taxonomy is an editorial decision, not a research finding. |
| O-3 | Does `docs-health-action` (0 stars, 21 commits) deserve adoption, or is it only a reference? | Cannot verify maintenance. Recommend copying its checks, not depending on it. |
| O-4 | Knip's licence. | Landing page does not state it; **UNVERIFIED** — check the repo before adding a dependency. |

---

## 6. External resources

All fetched/read **2026-11-12** unless noted.

**Deterministic doc tooling (VERIFIED this session)**

- <https://github.com/lycheeverse/lychee> — full README: `--include-fragments`, `--offline`, `--exclude-path`, `--root-dir`, `--base-url`, `--dump`, exit codes (`2` = link failures), dual Apache-2.0/MIT licence, comparison table incl. `markdown-link-check`.
- <https://github.com/lycheeverse/lychee-action> — `v2` action: inputs `args`, `fail`, `format`, `output`, `jobSummary`, `lycheeVersion`, `token`; the schedule + `create-issue-from-file` example; "pin to SHA" advice.
- <https://github.com/DavidAnson/markdownlint> — rule list incl. `MD051` *link-fragments*, `MD043` *required-headings*, `MD041`, `MD025`; MIT; `applyFixes`; `markdownlint-cli2-action`.
- <https://docs.vale.sh/topics/readme.md> (and <https://vale.sh/docs/>) — "Vale is a 100% open-source, **MIT-licensed** project"; syntax/context-aware linting; `substitution` rule example; `vale-action`.
- <https://knip.dev/> — "Knip finds and fixes unused dependencies, exports and files"; 200+ plugins including **GitHub Actions** and Vitest. Licence **not stated on the page**.
- <https://github.com/joaquimscosta/docs-health-action> — checks `links`/`versions`/`staleness`/`claude-md`/`cross-doc`/`frontmatter`; frontmatter-vs-git divergence > 7 days; MIT; **0 stars / 21 commits / created 2026-04-03** → reference, not dependency.

**Production staleness patterns (VERIFIED)**

- <https://github.com/microsoft/hve-core/blob/main/docs/contributing/documentation-maintenance.md> — `ms.date` + 90-day threshold, `changed-files-only`, weekly Monday 09:00 UTC, idempotent issue creation with `<!-- automation:stale-docs:{file-path} -->`, and the documented failure mode that files without frontmatter are silently skipped.
- <https://datadef.io/guides/en/documentation-drift> (2026-08-12) — "Age is a proxy for drift, not a measure of it"; the `git log -1 --format=%as` per-doc idiom; doc-age-vs-subject-churn as the real signal.

**Agent-cost context (VERIFIED)**

- <https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review> — CodeQL-powered rules-based analysis and coverage metrics complementing agent review.
- <https://techcommunity.microsoft.com/blog/microsoftmissioncriticalblog/ai-just-joined-your-code-reviews-github-copilot-comes-to-azure-repos/4552795> (2026-09-03) — review limits "≤ 10 GB / ≤ 100 files"; useful as a cost-shaped benchmark (Azure Repos numbers).
- <https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation> — "AI-generated fixes are not always correct… **Always review the pull request**." The governing rule for §2d.

**Repo files read this session**

`docs/research-github-actions-agent-offload.md` (prior report — plumbing, R1–R8, §7 workflows; **not** re-derived), `docs/spike-doc-compaction.md` (D-1…D-13), `.agents/prompts/doc-compaction.prompt.md` (scored checklist R1–R5, `MAX_DOCUMENTS = 200`, hard-excluded surfaces, archive mechanics), `scripts/normalize-memory.js` (the mtime defect), `scripts/validate-memory-schema.js` (memory-bank-only filter), `memory-bank/.vocabulary.json`, `docs/TRACKER-INDEX.md`, `docs/spikes/npm-e404-consumption-investigation.md` (no frontmatter), `package.json`, `docs/.architecture-context.md`.

**MCP decisions.** Knowledge retrieval attempted and **skipped** — `knowledgebase_knowledgebase_search` returned "Knowledgebase not available: DATABASE_URL is not configured" (same as the prior report). No documentation MCP was needed: every external tool claim came from the vendor's own repo or site, which outranks a doc mirror.

**Research limitations.**
- Token pricing **not verified** — no per-run dollar figure is stated anywhere in this report.
- Knip's licence **not verified**.
- The specific `.github/workflows/` on the remote default branch were **not** re-fetched; the prior report's account of `pr-test.yml` / `npm-publish.yml` is inherited, and this report adds nothing that depends on new remote workflow state.
- The staleness *accuracy* of a model ("is this paragraph true?") has **no measured error rate** here — that is exactly what the report's §4.3 proposes to measure on three real runs.

---

## 7. Status history

| Date | Status | Note |
|---|---|---|
| 2026-11-12 | ✅ Complete | Value ranking (§1), doc-pruning deep dive (§2), cost bounds (§3), build order (§4). No workflow implemented — read-only research agent; §4 is a specification for `coder`/`deployer`. Builds on `research-github-actions-agent-offload.md` without re-deriving it. |
