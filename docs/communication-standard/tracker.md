---
id: "communication-standard-tracker"
title: "Communication Standard — Pipeline Record"
updated: "2026-11-01"
tags: [tracker, communication, instructions, agent-specs, reviewer, orchestrator, pipeline]
doc_type: "tracker"
---

# Communication Standard — Pipeline Record

Per-step record of the pipeline that shipped the template-wide communication standard.
Authoritative inputs: `docs/spike-communication-style.md` (decisions D1–D15) and
`plan/process-communication-standard-v1.md` (12 tasks, 4 batches).

**Pipeline:** implementer (bootstrap) → scope → implementer (plan) → coder (T1) → coder ∥ ×7 (T2–T8) →
reviewer (T9) → implementer (T10) → coder (T12) → coder (T11) → tracker
**Outcome:** plan complete 12/12; `npm run test:unit` 26 files / 800 tests; parity test 8/8; Playwright 7
passed / 1 skipped. Nothing committed.
**Record note:** no `docs/.orchestrator-log.md` was kept for this run, so this file is reconstructed from the
spike, the plan, the T11 memory-bank records, and the files on disk.

| Step | Agent | Status | Artifact |
|---|---|---|---|
| 0 | implementer (bootstrap) | ✅ | context verified, nothing written |
| 1 | scope | ✅ | `docs/spike-communication-style.md` |
| 2 | implementer (plan) | ✅ | `plan/process-communication-standard-v1.md` |
| 3 | coder (T1) | ✅ | `.agents/instructions/communication.instructions.md` |
| 4 | coder ∥ ×7 (T2–T8) | ✅ | 15 agent specs + `AGENTS.md` |
| 5 | reviewer (T9) | ⚠️ → ✅ | findings, no file written |
| 6 | implementer (T10) | ✅ | smoke probe, no file written |
| 7 | coder (T12) | ✅ | 3 files remediated |
| 8 | coder (T11) | ✅ | plan + memory bank |
| 9 | tracker | ✅ | this file, `docs/tracker-log.md`, index, learned knowledge |

---

## Step 0: Implementer (Bootstrap)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Confirmed the pipeline's starting context needed no repair: the architecture context document exists and
carries real content, and all six memory-bank core files exist. Recorded the architecture document as mildly
stale and left it unedited, which is the right call for a style change.

### Files Produced / Modified

| File | Description |
|---|---|
| — | Read-only. No file created or changed. |

### Key Decisions

- **Stale architecture notes were not rewritten.** `docs/.architecture-context.md` still says `.agent.md` and
  "20+ skills" (the real names are `.md` and 34 skills). Cost of fixing: a separate accuracy pass. Risk of
  leaving it: an agent that trusts it may look for files that do not exist. Out of scope for a style change.

### Notes / Follow-up

The staleness is pre-existing and applies beyond this feature, so it belongs to a documentation-accuracy
scope rather than here.

---

## Step 1: Scope

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Narrowed a vague complaint — agent output is hard to follow — into 15 settled decisions across three rounds
of numbered questions, each with a recommended answer. The spike closes with no open questions and no request
for a prototype, which means the work could go straight to planning.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/spike-communication-style.md` | 315 lines: problem statement, decisions D1–D15 with concrete parameters, the two envelope tables, the 16-path file manifest, vocabulary rules, artifact binding, the normalization block, the reviewer check, in-repo evidence, and four deferred questions (O-1…O-4). |

### Key Decisions

- **Instruction, not skill (D1).** A skill fires only when an agent chooses to invoke it; the one-line
  reference in a spec is read every time the spec loads. Cost: the standard must be pointed at 15 times.
  Risk: an agent spec that omits the line is unbound, silently.
- **Two variants, same file (D9).** `decision-framed` for agents whose last act is a choice,
  `change-framed` for agents that land a change. Cost: two shapes to maintain. Benefit: slot 2 and slot 4 say
  the thing the reader of that reply actually needs.
- **Fixed the count at 15 files (D15).** Round 2's answer said "13" with no named exclusions; round 3
  re-derived the set from a recursive listing of `.opencode/agents/**/*.md` and found 12 root specs plus 3
  orchestrator specs. Cost: one extra round. Benefit: the invariant became countable and testable.

### Notes / Follow-up

Deferred and still open: an ADR for the delivery-mechanism decision (O-1, blocked on the repo's flat
`docs/adr-*.md` layout versus the `docs/adr/0001-slug.md` convention), retrofitting old artifacts (O-2),
automated enforcement (O-3), and repairing `planner.md`'s dead tool list (O-4).

---

## Step 2: Implementer (Plan)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Converted the spike into an executable plan: 12 tasks in 4 batches, with the exact text of every new line,
a per-file insertion map, and 10 verification checks. The plan also named a constraint the spike had not
emphasised — a parity test counts specific strings in the three orchestrator specs, so any new line there
must avoid those strings.

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/process-communication-standard-v1.md` | 559 lines when written; 656 on disk after T11 appended its verification outcomes (`:490-587`) and accepted deviations. 12 tasks in 4 batches, exact insertion text, alternatives, dependencies, file manifest, 10 test checks, risks, and five flagged ambiguities (AMB-1…AMB-5). |

### Key Decisions

- **Anchor insertions on quoted text, not line numbers.** Line numbers were given for orientation only.
  Cost: the plan is longer. Risk avoided: a line-number anchor drifts as soon as a sibling edit lands
  (RISK-07).
- **Single writer for shared files.** Seven parallel Batch B coders were forbidden from writing the plan or
  `memory-bank/*`; T11 did all bookkeeping. Cost: each coder returns a summary instead of recording itself.
  Risk avoided: seven concurrent writers clobbering `activeContext.md`, which would have burned the audit
  trail (RISK-04).
- **No new committed test.** Automated enforcement is deferred (O-3), so verification is ad hoc commands plus
  one reviewer pass and one smoke prompt. Cost: the invariants are proven once, not continuously (RISK-01).

### Notes / Follow-up

Two ambiguities were resolved by judgement and should be re-read before any future edit: AMB-1 (where the
`**Communication:**` line sits — inside slot 4, never as a fifth block) and AMB-2 (the inert gate clause in
the two non-gated orchestrator specs).

---

## Step 3: Coder (T1 — Canonical Instruction File)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Created the one file that now defines the house standard. It states the reader, the three ways a sentence
fails the reader, both reply shapes with their caps, the vocabulary rules, which artifacts the standard binds
and how, the single orchestrator block, and how a project overrides the whole thing.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/instructions/communication.instructions.md` | **NEW**, 342 lines. Frontmatter is exactly `description` + `applyTo: "**"`. Eight `##` sections in the planned order, listed with line anchors below. Longest line 196 characters; no `####` headings. |

Section anchors, in order: Reader Model (`:17`), Violation Modes (`:56`), Where This Applies (`:67`),
The Envelope (`:133`), Vocabulary Rules (`:231`), Artifacts (`:260`), Orchestrator Normalization Block
(`:293`), Project Override (`:331`).

### Key Decisions

- **Every rule carries its own cost and risk.** Six sections end with a sentence naming that rule's cost, its
  risk, or both (`:46-49`, `:205-209`, `:226-229`, `:255-258`, `:288-291`, `:326-329`). Cost: the file is
  longer than a bare checklist. Benefit: the standard demonstrably applies to itself, which was a T9 finding
  against the spike.
- **Terms are glossed where they are introduced.** "Envelope" is glossed at `:37` as "a fixed four-heading
  reply shape"; "ADR" is expanded at `:29`; "sub-agent" is glossed at `:217`. Cost: a few extra words per
  term. Risk avoided: the standard failing its own jargon rule.

### Notes / Follow-up

The instruction file is the only copy of the normalization block by design; the three orchestrator specs carry
pointers. Renaming a `##` heading here breaks one citation in `reviewer.md` (open item 4 in the tracker log).

---

## Step 4: Coder ∥ ×7 (T2–T8 — Reference Lines, `AGENTS.md`, Reviewer Check)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Seven agents working in parallel inserted one line each into disjoint file sets, plus the `AGENTS.md` row and
the reviewer's check block. Since nothing auto-loads the instruction directory, these 15 lines are the actual
load mechanism — the file alone would never be read.

### Files Produced / Modified

| File | Description |
|---|---|
| `AGENTS.md` | One row at `:45` in the Instructions Reference table. |
| 6 `decision-framed` specs | `scope.md:267`, `researcher.md:77`, `architect.md:28`, `implementer.md:29`, `designer.md:34`, `planner.md:92`. |
| 9 `change-framed` specs | `coder.md:29`, `unit-tester.md:43`, `e2e-tester.md:26`, `deployer.md:26`, `tracker.md:26`, `reviewer.md:25`, and `orchestrator.md:268`, `feature-pipeline.md:171`, `tdd-orchestrator.md:397`. |
| `.opencode/agents/reviewer.md` | Added the five-item `### Communication standard check` (`:50-64`), the `*.md`-only trigger, the `**Communication:**` placement rule, and the slot-mapping table for its own output (`:73-79`). |

### Key Decisions

- **Insert next to the existing knowledge-retrieval reference.** That line already established the
  "read and follow this file" shape (spike §2.7), so the new line inherits a pattern agents already resolve.
  Cost: placement is not visually prominent. Benefit: no new heading, no renumbering — which keeps
  `coder.md`'s "step 6" and `tracker.md`'s "step 1"/"step 4" self-references valid (CON-01).
- **One label differs per context.** `planner.md` uses `**House standard**` because it already sits under a
  `### Communication` heading, where `**Communication:**` would read as a stutter; the orchestrators use
  `**Communication standard**` because their bullet also carries the gate clause (plan RD-01).

### Notes / Follow-up

The 15-line invariant is verified by counting, not by a committed test. Any future agent spec must add its own
line or the mapping table in the canonical file becomes incomplete.

---

## Step 5: Reviewer (T9 — Check the Standard Against a Document Written Before It)

**Date:** 2026-11-01
**Status:** ⚠️ FINDINGS → ✅ RESOLVED BY T12

### Summary

Applied the new five-item check to the spike document, which was written before the standard existed. This
was a test of whether the standard is checkable in practice, not a critique of the spike. It returned three
major and four minor findings, and all seven were fixed in the standard and the reviewer spec rather than in
the historical spike.

### Files Produced / Modified

| File | Description |
|---|---|
| — | Review only; findings routed to T12. The spike was deliberately not edited (O-2). |

### Key Decisions

- **Recorded the findings instead of retrofitting the spike.** Rewriting a historical record to match a later
  style would falsify the audit trail. Cost: the spike still reads in the old dialect. Risk avoided: two
  dialects in one directory is honest; a rewritten history is not.
- **Treated "the checklist is inert" as a major, not a nit.** Items 1–2 originally asked the reviewer to check
  text it never sees. Cost: a rewrite of the enforcement section. Risk avoided: a check that always reports
  clean because it examines nothing.

### Notes / Follow-up

The three majors were: items 1–2 were inert; `orchestrator.md:189` carried a rival gate specification that
competed with the canonical block; and the slot-2 cap was unsatisfiable when more than eight files changed and
each needed its own bullet.

---

## Step 6: Implementer (T10 — Smoke Probe)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Asked a `decision-framed` agent a plain decision question — whether to raise the 40-line cap to 60 for review
reports — and said nothing about format. The reply produced all four headings in order, inside the caps, with
cost and risk on every option. That is the only evidence that the load path works end to end, because a
reference line that is read but not obeyed would look identical in a file listing.

### Files Produced / Modified

| File | Description |
|---|---|
| — | Read-only probe; no file written. |

### Key Decisions

- **Never mention the format in the probe.** Naming the slots would test instruction-following, not whether
  the standard is loaded and applied unprompted. Cost: a failing probe is harder to diagnose. Benefit: a
  passing probe is real evidence.

### Notes / Follow-up

The probe passed with no defect, so T12's scope came from T9's findings alone.

---

## Step 7: Coder (T12 — Remediation)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Fixed all seven findings in three files without widening scope: the canonical file, the reviewer spec, and the
main orchestrator spec. The most consequential fix was making the reviewer's first two items apply to text the
reviewer can see (a reply in the diff), while the prose rules stay on artifacts.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/instructions/communication.instructions.md` | `### Enforcement` (`:35-54`) now splits what is checked where, explains why the split exists, and states its cost and risk. Cost/risk sentences were also added to the sections that lacked them. |
| `.opencode/agents/reviewer.md` | `:52` states the trigger and the split; `:77` allows "one bullet per group of files sharing a finding, within the slot's ≤8 bullet cap", which makes the cap satisfiable. |
| `.opencode/agents/orchestrator/orchestrator.md` | `:189` now points at "the Orchestrator Normalization Block's four labelled lines" instead of restating a competing specification. |

### Key Decisions

- **Grouped bullets over a raised cap.** Raising the ≤8 cap would have changed a settled decision (D8); one
  bullet per group of files keeps the cap and the information. Cost: findings are grouped by file rather than
  severity. Risk: a reader must scan slot 2 for severity markers, which is why the marker comes first.
- **Pointer over restatement in the orchestrator.** A second copy of the block would drift. Cost: the reader
  follows one link. Risk avoided: two specifications that disagree (the exact T9 finding).

### Notes / Follow-up

The reviewer's check remains non-blocking by design. That is a recorded trade-off, not an oversight: a style
finding must never fail a security review.

---

## Step 8: Coder (T11 — Verification and Bookkeeping)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Ran all eight automated checks, recorded the real output including the debt it found, marked the plan complete,
and updated the memory bank as the single writer. One check passed only with recorded debt, and that is stated
rather than smoothed over.

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/process-communication-standard-v1.md` | All 12 rows marked ✅ 2026-11-01; `status: Completed`; `### Verification outcomes` (`:490-585`) and `### Accepted deviations` (`:577-585`) added. |
| `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/tasks/_index.md` | Completion records, including the 13-line debt list and the open follow-ups. |

### Key Decisions

- **Debt recorded, not paid.** The 13 over-length lines were each compared against `git show HEAD:<file>` to
  prove they were pre-existing, then left alone because CON-01 forbids unrelated rewording. Cost: the
  line-length rule is unmet in 13 places. Risk: a future reader assumes it is fully met.
- **The grep method was corrected and documented.** The plan's naive `^## Bottom line$` check matches nothing
  because the skeleton headings are indented inside fenced examples. Verification used a fence-aware
  `^ *## ` match and confirmed slot order. Cost: a longer verification note. Benefit: the next person running
  the same check does not read zero matches as a failure.

### Notes / Follow-up

Suites: `npm run test:unit` 26 files / 800 tests; parity test 8/8; Playwright 7 passed / 1 skipped. The parity
counts (2 / 2 / 6) survived, so no orchestrator line introduced a banned string.

---

## Step 9: Tracker (This Record)

**Date:** 2026-11-01
**Status:** ✅ SUCCESS

### Summary

Recorded the pipeline in three places a future reader can reach: the chronological log, this per-feature
record, and three findings added to the existing learned-knowledge session for cross-project reuse. The run
had no orchestrator log, so the record was reconstructed from primary artifacts and checked against the files
on disk rather than trusted from a summary.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/tracker-log.md` | New "Process Pipeline 19" entry: steps, files, decisions, verification, six open items, and three recorded discrepancies. |
| `docs/communication-standard/tracker.md` | This file. |
| `docs/TRACKER-INDEX.md` | Pipeline row, entry-location row, learned-knowledge session row. |
| `.agents/instructions/learned-knowledge.instructions.md` | Three added findings in the existing 2026-11-01 communication-standard session: unprompted smoke probe, fence-aware grep, total-plus-partition invariant. |

### Key Decisions

- **Verified rather than trusted.** The 15 reference lines, the 6/9 variant split, and the `AGENTS.md:45` row
  were re-derived with a repo-wide search. Cost: a few extra checks. Benefit: three summary claims that would
  otherwise have been copied forward unchecked.
- **Reported discrepancies instead of correcting around them.** The branch name on disk differs from the run
  summary, and one check is a qualified pass. Cost: the record carries a correction. Risk avoided: a log that
  reads as cleaner than the run actually was.

### Notes / Follow-up

Six open items stand: the 13-line debt, `planner.md`'s dead tools, no cap enforcement, the heading citation in
`reviewer.md`, the inert gate clause in two orchestrator specs, and the fact that nothing is committed. The
branch on disk is `feat/enchance-explenation` (ref `9caf4d4`); whether it is pushed was not verified.
