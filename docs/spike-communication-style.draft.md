---
id: "spike-communication-style.draft"
title: "Spike draft: Communication Style Standard"
updated: "2026-11-01"
status: "superseded"
doc_type: "spike-draft"
tags: [scope, spike, communication-style]
---

> **SUPERSEDED** — replaced by docs/spike-communication-style.md on 2026-11-01.

# Spike Draft: Communication Style Standard

## Problem Statement

Agent output — from the orchestrator and from the research, scoping, and implementation agents —
is often explained in obtuse technical language that is hard to understand. The request is for a
single, consistent way that findings are conveyed, anchored to a concrete reader model: *a software
architect with a project-manager background* must be able to follow every explanation and detail
report.

Settled so far: the mechanism is a **layered instruction** — one canonical file
(`.agents/instructions/communication.instructions.md`), a one-line reference in each bound agent
file, and a row in `AGENTS.md`'s instruction table; no new skill. The standard governs **both** chat
replies and markdown artifacts, with artifacts keeping their existing section skeletons. Every
agent that produces user-facing output is bound, plus the orchestrator, which may normalize but must
preserve every path and finding. Enforcement is a **mechanically checkable structural envelope**;
prose rules are advisory and judged by `reviewer` on written artifacts only. Distribution is a
**template-wide default**, with `AGENTS.project.md` documented as the override.

Settled in round 2: the envelope is four literally-labelled slots in fixed order with per-slot and
overall caps; two role variants (`decision-framed`, `change-framed`) are named headings in the same
instruction file; vocabulary is gloss-or-anchor inline with no lexicon; the bound artifact set is
spikes, plans, tracker entries, ADRs, and `docs/.orchestrator-log.md` with `memory-bank/*` excluded;
the reviewer grows a five-item communication check (minor severity, `*.md` diffs only); the
orchestrator emits a fixed four-line block before verbatim sub-agent output; and no `opencode.json`
change is made.

Resolved in round 3: the reference-line set is all **15** agent files (12 root agents + 3
orchestrators), each naming its Q9 variant; Q14's "13" was a count slip and had no exclusions behind
it. The frontier is empty and the standard is ready to plan.

## Evidence

- Agent definitions live in `.opencode/agents/*.md` with YAML frontmatter (`description`, `mode`, `permissions`) — e.g. `.opencode/agents/researcher.md:1-8`, `.opencode/agents/implementer.md:1-9`. They are loaded per delegation, so a rule written there applies only while that agent runs.
- Instruction files live in `.agents/instructions/*.instructions.md` (22 files) with `description` + `applyTo` frontmatter, per `.agents/instructions/instructions.instructions.md:18-27`.
- **Instruction files are not auto-loaded.** Root `opencode.json` has no `instructions` key (verified: `opencode.json:1-78` contains only `mcp` and `permission`); the consumer-facing `opencode.mcp.example.json:3` declares only `"instructions": ["AGENTS.project.md"]`. Instruction files are therefore loaded only by explicit reference — the established pattern being a line in each agent such as `.opencode/agents/researcher.md:72` ("Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol"). `reviewer.md:24`, `implementer.md:27-28`, and `tracker.md:24` all do the same.
- **`AGENTS.md` is auto-loaded without an `instructions` key** — it is injected as added instructions to this session (observed as "Instructions from: …/AGENTS.md"), and it is not listed in any config. So a row in its instruction table is a discoverability aid, not the load mechanism.
- Skills live in `.agents/skills/<name>/SKILL.md` (34 skills) and are loaded on demand via the skill tool; `grilling/SKILL.md:1-8` is a representative frontmatter shape. A style rule expressed only as a skill is invoked only when some agent decides to invoke it.
- Distribution is whole-directory: `scripts/sync.js:561-580` walks `sourceAgentsDir` (`.agents/`) and syncs every file, so a new `.agents/instructions/*.md` or `.agents/skills/*/SKILL.md` reaches every consumer automatically. Two exceptions exist: `.agents/instructions/learned-knowledge.instructions.md` is excluded (project-owned), and `AGENTS.project.md` is scaffold-only and never overwritten (`scripts/sync-unit.test.js:607-625`).
- `.opencode/agents/**` also ships to consumers, so editing agent files is a template-wide change, not a local one.
- **No communication-style artifact exists today.** Repo-wide search for plain-language guidance finds only: the tracker guideline `.opencode/agents/tracker.md:65` ("Write in plain English — docs are for human readers, not agents") and the `{2-3 sentence plain-English summary}` placeholder repeated in the standalone-tracking block of 10 agent files (`coder.md:73`, `reviewer.md:63`, `architect.md:64`, `deployer.md:63`, `designer.md:75`, `implementer.md:130`, `researcher.md:233`, `tracker.md:44`, `unit-tester.md:83`, `e2e-tester.md:66`). This is the only existing precedent for a reporting standard, and it is a one-liner with no rubric.
- Agent output contracts already exist and would interact with any new format: the 6-section spike document (`docs/spike-*.md`), the tracker entry format (`tracker.md:36-61`: Summary / Files / Key Decisions / Notes), and `docs/tracker-log.md` + `memory-bank/progress.md` appends.
- The orchestrator relays sub-agent output rather than re-authoring it: scope questions are presented "verbatim" (`.opencode/agents/orchestrator/orchestrator.md:122`), confirmation gates present "the agent's output summary" (line 189), and the final report uses a fixed pipeline table (lines 271-279).
- Required confirmation gates already include `researcher`, `implementer`, and `scope` (orchestrator.md:20) — i.e. the user already sees these three agents' output directly and unfiltered at a gate.
- No `GLOSSARY.md`, no `docs/adr/` directory entries, and no `AGENTS.project.md` exist in this repo (verified by glob); `.agents/config/domain.md` names `GLOSSARY.md` and `docs/adr/` as the single-context layout to be created lazily.
- Knowledge retrieval: memory-bank search returned only architecture/brief/product context — no prior decision about output style. `knowledgebase_knowledgebase_search` unavailable (DATABASE_URL not configured).

### Round 2 evidence (added 2026-11-01)

- **15 agent files exist**, not 11: the 11 registry agents (`.opencode/agents/{scope,researcher,architect,implementer,designer,coder,unit-tester,e2e-tester,reviewer,deployer,tracker}.md`), the legacy `planner.md`, and three orchestrators at `.opencode/agents/orchestrator/{orchestrator,feature-pipeline,tdd-orchestrator}.md`. `feature-pipeline.md` and `tdd-orchestrator.md` also print user-facing pipeline output, so "the orchestrator" is ambiguous as a single file.
- **Existing envelope precedent already exists in the orchestrator's final report** (`orchestrator.md:271-286`): `## Pipeline Results` → `**Overall:** ✅|⚠️|❌` → step table → `**Log:**` / `**Doc:**` / `**Next:**`. That is bottom-line-first, with a next step last — the four-slot envelope maps onto it with no restructuring.
- **Confirmation gates today present "the agent's output summary"** (`orchestrator.md:188-193`), and the gate question is a fixed sentence; there is no formatting rule for what is put above that output.
- **Reviewer output format is fixed and severity-coded** (`reviewer.md:40-47`): Files reviewed → 🔴 critical → 🟡 major → 🔵 minor → overall assessment. There is no style/comprehension check and no `*.md`-specific criterion; the reviewer already has edit permission on `*.md` (deny elsewhere) and is told to review the diff.
- **Artifact skeletons are fixed and numerous**: `plan/*.md` follows the mandated 9-section order (Introduction, Requirements & Constraints, Implementation Steps, Alternatives, Dependencies, Files, Testing, Risks & Assumptions, Related Specifications — e.g. `plan/feature-matt-skills-integration-v1.md:13-277`); `docs/spike-*.md` in-repo uses Date/Status/Research Goal/Investigation Results (`docs/spike-verbose-logging.md:1-11`), not the 6-section template; tracker entries use Summary / Files / Key Decisions / Notes (`tracker.md:36-61`).
- **ADR naming in the repo does not match `domain.md`**: the one existing ADR is flat at `docs/adr-knowledgebase-pgvector.md` titled `ADR-001`, not `docs/adr/0001-slug.md`. Any ADR convention change is a separate decision.
- `memory-bank/*.md` is agent context (projectbrief, productContext, systemPatterns, techContext, activeContext, progress) rewritten for retrieval by agents, not for a human reader — binding it to a reader-model prose standard would fight `.agents/instructions/memory-bank.instructions.md`.
- `docs/.orchestrator-log.md` is surfaced to the user as "Link to the full log file" (`orchestrator.md:283`), so it is user-facing even though it is written for coordination.
- `AGENTS.md`'s instruction table already lists ~20 instruction files with a one-line purpose each — a row for the new file fits the existing shape with no structural change.

### Round 3 evidence (re-verification, 2026-11-01)

- Roster re-confirmed by directory read: `.opencode/agents/` holds 12 `.md` files (`architect`,
  `coder`, `deployer`, `designer`, `e2e-tester`, `implementer`, `planner`, `researcher`, `reviewer`,
  `scope`, `tracker`, `unit-tester`) and `.opencode/agents/orchestrator/` holds 3
  (`orchestrator.md`, `feature-pipeline.md`, `tdd-orchestrator.md`) — **15 total**.
- `planner.md:3` declares `mode: primary` and still references legacy tools (`codebase`,
  `searchResults` — `planner.md:25-27`), i.e. it is a directly-invoked primary mode, not a
  sub-agent, but it does emit user-facing output.
- `feature-pipeline.md:172-176` and `tdd-orchestrator.md:355` both define an `## Output Format`
  section, and `feature-pipeline.md:176` prints `## Pipeline Results` — both pipelines surface
  output to the user exactly as `orchestrator.md:269-286` does.
- `opencode.json` re-read (78 lines): keys are only `$schema`, `mcp`, `permission` — no
  `instructions` key. The claim behind Q14 is intact.
- Reference-line precedent re-confirmed at `.opencode/agents/reviewer.md:24`,
  `researcher.md:72`, `implementer.md:27-28`, `tracker.md:24`, `coder.md:28`, `architect.md:26-27`.

## Round 1 — Answers (2026-11-01)

- **Q1** — Delivery mechanism: answered "yes" (accept recommendation) → **Settled:** layered delivery. Canonical `.agents/instructions/communication.instructions.md` is the single source; each in-scope agent file gets a one-line "read and follow" reference; `AGENTS.md`'s instruction table gets a row. No new skill is created — a skill would only fire when some agent chose to invoke it, whereas the reference line fires every time the agent spec is read.
- **Q2** — What the standard governs: "yes" → **Settled:** both chat replies and markdown artifacts. Chat replies carry the full standard; artifacts keep their existing section skeletons and only the prose inside each section follows the standard.
- **Q3** — Reader model and vocabulary ceiling: "yes" → **Settled:** reader = senior architect/PM-literate reader who does not know this repo's internal names or library trivia. Four testable rules: (1) every term glossed in ≤10 words on first use, or anchored to a path/ADR; (2) every claim carries an evidence marker; (3) every recommendation states its cost and its risk; (4) no unexplained acronyms or library-internal vocabulary. Violations are the three named failure modes (unexplained jargon, unsupported claim, recommendation without cost/risk).
- **Q4** — Coverage: "yes" → **Settled:** every agent that produces user-facing output is bound, plus the orchestrator — one reference line each. Role-specific format variants explicitly deferred to round 2.
- **Q5** — Enforcement strength: "yes" → **Settled:** the structural envelope (bottom line → what changed and where → evidence → risks and next step) is enforced as a mechanically checkable requirement; the four prose rules are advisory; prose is judged by `reviewer` on written artifacts only, never in chat.
- **Q6** — Distribution stance: "yes" → **Settled:** template-wide default shipped in `.agents/instructions/`; `AGENTS.project.md` is documented (in the new instruction file) as the project-level override.
- **Q7** — Orchestrator behaviour: "yes" → **Settled:** the orchestrator is bound and may normalize output for the reader, preserving every file path and every finding. Scope questions stay verbatim, never paraphrased.

## Round 2 — Answers (2026-11-01)

All answers "yes" — each recommended option accepted verbatim.

- **Q8** — Envelope: literal labels, order, length cap → **Settled:** option (a). Four literal
  markdown headings in fixed order: `## Bottom line` / `## What changed and where` / `## Evidence` /
  `## Risks and next step`. Per-slot caps: slot 1 = 1–3 sentences; slot 2 = ≤8 bullets; slot 3 = ≤5
  bullets; slot 4 = ≤5 bullets. Overall cap = 40 lines in chat; tables and verbatim quotes do not
  count against it. Two documented exemptions — multi-option decisions (each option needs its cost
  and its risk) and verbatim relays — may exceed the cap, and the reply must state that it is
  exceeding and why.
- **Q9** — Variants: **Settled:** option (b). Two variants defined as named headings in the same
  instruction file. `decision-framed` (scope, researcher, architect, implementer, designer,
  planner): slot 2 = "what I found and where", slot 4 = "decision and options with cost/risk".
  `change-framed` (coder, unit-tester, e2e-tester, reviewer, deployer, tracker): slot 2 = "what
  changed, file by file", slot 4 = "risks and next step". The three orchestrator files
  (`orchestrator.md`, `feature-pipeline.md`, `tdd-orchestrator.md`) take `change-framed`. Each
  agent's reference line names its variant.
- **Q10** — Vocabulary: **Settled:** option (a). Inline parenthetical gloss on first use (≤10 words)
  OR an anchor to a path/line. No lexicon file. Code identifiers, file paths, and API names are
  exempt from glossing but must be followed by a one-line plain-language clause on first appearance
  in prose. Acronyms expanded once, even inside paths. No `GLOSSARY.md` created by this change — it
  stays governed by `.agents/config/domain.md` and is created lazily.
- **Q11** — Artifact binding: **Settled:** option (a). Bind spike docs, plans, tracker entries
  (`docs/tracker-log.md`, `docs/<feature>/<agent>.md`), ADRs, and `docs/.orchestrator-log.md`.
  Exclude `memory-bank/*`. No new sections added to any artifact; existing sections that already
  match a slot are treated as that slot (spike decision section = bottom line, tracker
  `### Summary` = bottom line).
- **Q12** — Reviewer check: **Settled:** option (a). Five-item "Communication standard" check added
  to `reviewer.md` Output Expectations, plus a `**Communication:** ✅ | ⚠️ N findings` line in the
  review report. Applies only when the diff touches `*.md`. Findings are minor severity, never
  blocking. Verified by one reviewer pass on this spike plus one smoke prompt in the same change.
- **Q13** — Orchestrator normalization: **Settled:** option (a). At confirmation gates the
  orchestrator emits a fixed four-line block (`**Bottom line:**` one sentence / `**Files:**` paths
  verbatim / `**Blocker:**` none-or-what-is-needed / `**Next:**` one step), then `---`, then the
  sub-agent output verbatim. The final `## Pipeline Results` table is unchanged. For `scope`, the
  block is status + question count only; the questions follow unmodified.
- **Q14** — Load guarantee: **Settled:** option (a). No `opencode.json` or
  `opencode.mcp.example.json` change. 13 reference lines + one `AGENTS.md` instruction-table row.

> **Superseded by Q15 (2026-11-01):** the count is **15 reference lines**, not 13 — the figure was a
> count slip and no file exclusions were ever named behind it. Q14's substance (no config change; one
> `AGENTS.md` row) stands unchanged.

### Readings applied (not new decisions — recorded so the implementer transcribes them consistently)

- **Q8 vs Q9 heading precedence.** Q8's four literals are the `change-framed` set. Q9 is the more
  specific answer about slot names, so `decision-framed` agents substitute slot 2 and slot 4 only
  (`## What I found and where`, `## Decision and options with cost/risk`); slots 1 and 3
  (`## Bottom line`, `## Evidence`) are identical in both variants.
- **Scope of the Q8 exemptions.** An exemption lifts the per-slot cap on the slot it affects *and*
  the 40-line overall cap, otherwise the exemption could not achieve its stated purpose (a
  six-option decision cannot fit a ≤5-bullet slot). The stating-and-why requirement still applies.
- **Q14 vs Q9 cardinality — RESOLVED by Q15.** Q9 names fifteen files with a variant each; Q14 said
  thirteen reference lines. Round 3 settled the count at fifteen, so Q9's variant assignment is
  transcribed in full and no file is excluded.

## Round 3 — Answers (2026-11-01)

- **Q15** — Reference-line set: answered "all yes" → **Settled:** option (a). All **15** agent files
  receive a reference line — the 12 root agents (`architect`, `coder`, `deployer`, `designer`,
  `e2e-tester`, `implementer`, `planner`, `researcher`, `reviewer`, `scope`, `tracker`,
  `unit-tester`) plus `orchestrator.md`, `feature-pipeline.md`, `tdd-orchestrator.md`. The "13" in
  Q14 was a count slip; the settled count is **15**. Variant assignment follows Q9 unchanged:
  `decision-framed` = scope, researcher, architect, implementer, designer, planner (6);
  `change-framed` = coder, unit-tester, e2e-tester, reviewer, deployer, tracker, orchestrator.md,
  feature-pipeline.md, tdd-orchestrator.md (9).

## Frontier (open)

None — Q1–Q15 are all settled.

- [x] **Q15** — Reference-line set: 15 (Q9's full set); settled in round 3.

## Deferred

- ADR for the delivery-mechanism decision (instruction over skill; template-wide default) — deferred until the standard lands; the repo's one ADR is flat at `docs/adr-knowledgebase-pgvector.md` titled `ADR-001`, so numbering and location must be settled separately before a second ADR is written.
- Migration of existing artifacts (retrofitting old spikes/plans/tracker entries to the standard) — out of scope; the standard applies to output produced after it lands.
- Enforcement in automated tooling (lint script, CI check) — deferred; Q5 settled the envelope as mechanically checkable, but not that a machine checks it.
- Numeric per-slot limits — resolved by Q8; no longer deferred.
- `feature-pipeline.md` / `tdd-orchestrator.md` reference lines — resolved by Q15; both are bound and
  take `change-framed`.

## Prototype Requests

- none yet.
