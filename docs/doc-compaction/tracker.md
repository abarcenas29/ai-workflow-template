---
id: "doc-compaction-tracker"
title: "Documentation Compaction Prompt — Tracker Documentation"
updated: "2026-11-10"
tags: [prompt, documentation, compaction, deduplication, portability, review, tracker]
doc_type: "tracker"
pipeline: "doc-compaction"
---

# Documentation Compaction Prompt — Tracker Documentation

Pipeline record for the portable, human-invoked documentation compaction prompt at
`.agents/prompts/doc-compaction.prompt.md`.

## Pipeline Overview

**Pipeline:** scope (3 rounds, ⏹️ TERMINATED) → implementer (plan) → coder → reviewer (⚠️ CHANGES REQUESTED) → coder (fix pass) → reviewer (✅ APPROVED) → coder (cosmetic polish) → tracker → deployer (PR #49)
**Date:** 2026-11-10
**Feature:** A portable Markdown compaction prompt that finds duplicates, stale files, and over-written pages in a project's docs and proposes merges, archives, and deletions
**Total Tasks:** 4 tasks across 3 batches
**Test Results:** ✅ `npx vitest run` → 33 files / 1,049 tests passed (independently re-run by the deployer against the final tree)

**Delivery note:** the deliverable is a **portable, human-invoked prompt** — not an agent spec, not a script. It carries no `agent`, `tools`, `model`, or `temperature` keys. A person invokes it deliberately against a chosen set of roots. That is the point of the feature, and it is why the prompt ships inside `.agents/`, which is already in the npm `files` array and the sync copy loop.

---

## Step 1: Scope — Feature Narrowing (3 Rounds)

**Date:** 2026-11-10
**Status:** ✅ SUCCESS — frontier empty after 3 rounds

### Summary

Narrowed an underspecified "clean up our docs" request into a settled design through three rounds of numbered questions. Thirteen decisions (D-1 … D-13) were settled and four items were explicitly deferred (O-1 … O-4). The terminal artifact is `docs/spike-doc-compaction.md`; the earlier working draft at `docs/spike-doc-compaction.draft.md` was superseded and left in place as history.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/spike-doc-compaction.md` | Terminal scope artifact — 13 decisions, 4 deferrals, consumed by the implementer |
| `docs/spike-doc-compaction.draft.md` | Superseded working draft, retained as a historical record |

### Key Decisions

- **A prompt, not an agent.** The feature ships as a human-invoked prompt file, so nothing about agent registration, tool grants, or model selection applies.
- **Read-only by default.** The prompt always writes a scored proposal to `.doc-compaction/report.json` and changes nothing else unless explicitly run in `apply` mode.
- **Never delete silently.** Even in `apply` mode the prompt prints the exact `rm` / `git rm` command before removing anything — the human remains the actor of record.
- **Thirteen decisions over three rounds.** The scope focused on what evidence a merge proposal needs, how roots are declared, how `report.json` is shaped, and where the read-only boundary sits.
- **Four items deferred rather than guessed** (O-1 … O-4), carried forward instead of being resolved speculatively.

### Notes / Follow-up

The scope terminated with an empty frontier — no remaining unknowns beyond the four explicit deferrals. The superseded draft was deliberately left untracked rather than deleted.

---

## Step 2: Implementer — Implementation Plan

**Date:** 2026-11-10
**Status:** ✅ SUCCESS

### Summary

Turned the spike into a deterministic plan: 469 lines, 4 tasks across 3 batches, with 14 requirements (REQ-01 … REQ-14), 6 design rules (DR-01 … DR-06), and 11 test checks (TEST-01 … TEST-11). Each task names its file, its batch, and its dependencies, so the plan was directly actionable by a single coder.

### Files Produced / Modified

| File | Description |
|---|---|
| `plan/feature-doc-compaction-prompt-v1.md` | 469-line plan — 4 tasks, 3 batches, REQ-01..REQ-14, DR-01..DR-06, TEST-01..TEST-11 |

### Key Decisions

- **Seven mandated sections.** The plan fixed the prompt's section structure up front, so the coder wrote structure to spec rather than inventing it.
- **Three batches, four tasks.** Batch ordering reflected a small dependency chain — the report schema and the scanning rules had to settle before the merge workflow and the apply mode could be written coherently.
- **Explicit design rules instead of prose guidance.** DR-01 … DR-06 stated the invariants (read-only default, no silent deletion, verification tied to the merge it describes) as checkable rules, which is what let the reviewer find F-1 as a rule violation rather than a matter of taste.
- **Test checks written before code** (TEST-01 … TEST-11), giving the review pass concrete criteria.

### Notes / Follow-up

None. The spike was sufficient input; no re-scoping was needed between scope and planning.

---

## Step 3: Coder — Prompt Implementation

**Date:** 2026-11-10
**Status:** ✅ SUCCESS

### Summary

Wrote `.agents/prompts/doc-compaction.prompt.md` — a portable, human-invoked prompt with no agent frontmatter. The coder reported the file at 453 lines; the reviewer later counted 414, and that correction is recorded in Step 4.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/prompts/doc-compaction.prompt.md` | **NEW** — the compaction prompt: mandated sections, scored proposal to `.doc-compaction/report.json`, read-only default, explicit `apply` mode |

### Key Decisions

- **Land inside `.agents/prompts/`.** That directory already travels in the npm `files` array and the sync copy loop, so the prompt reaches consumers with no packaging change at all.
- **`report.json` as the default output.** A machine-readable scored proposal is reviewable and diffable, and it keeps the default run from touching a single Markdown file.
- **Apply mode gated behind an explicit opt-in** rather than a dry-run flag, because the failure mode of a default-on compaction tool is data loss.

### Notes / Follow-up

The coder's self-reported line count (453) was wrong; the true count was 414. See Step 4.

---

## Step 4: Reviewer — First Review

**Date:** 2026-11-10
**Status:** ⚠️ CHANGES REQUESTED — 1 BLOCKING, 3 MAJOR, 3 MINOR, 1 COSMETIC

### Summary

The first review found a genuine correctness bug, not a style complaint: the merge workflow could write a verification block captured *before* the merge existed, so a merged page would carry evidence that never described it (F-1, BLOCKING). Three major findings followed — the command list for decision D-3 had been softened, the portability claim leaked and contradicted the single-root rule, and the prompt named no historical patterns — plus three minor findings and one cosmetic. The reviewer also corrected the file's line count to 414.

### Files Produced / Modified

| File | Description |
|---|---|
| — | Review only; no files changed in this step |

### Key Decisions

- **F-1 was treated as blocking on correctness grounds.** A verification block that predates the artifact it verifies is worse than no verification, because it reads as evidence.
- **The D-3 softening was flagged as a design drift.** The plan settled a specific command list; the implementation had generalised it, which quietly changed a settled decision.
- **The portability contradiction was reported as one finding, not two.** The leak (a project-specific assumption leaking into supposedly portable text) and the single-root rule are the same defect seen from two sides.
- **Gate status NOT RUN at this stage.** The reviewer did not run the test suite, so no verdict on the suite came from this step.

### Notes / Follow-up

The line-count discrepancy (453 reported vs. 414 actual) was raised as a correction to the step report, not as a defect in the artifact.

---

## Step 5: Coder — Fix Pass

**Date:** 2026-11-10
**Status:** ✅ SUCCESS — 8/8 findings closed

### Summary

Closed all eight findings from the first review and took the file from 414 to 472 lines. The merge workflow now captures its verification evidence after the merge is written, which is the actual fix for F-1. A `total_found` field was added to the report schema.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/prompts/doc-compaction.prompt.md` | **MODIFIED** — verification re-captured post-merge; D-3 command list restored; portability leak and single-root contradiction repaired; historical patterns named; three minor findings addressed; `total_found` added. 414 → 472 lines |

### Key Decisions

- **Fix the ordering, not the wording.** F-1 was resolved by moving where verification is captured, not by rewording the verification section.
- **Restore the settled command list verbatim.** The softened D-3 list was reverted to what the plan specified rather than re-negotiated in the code.
- **Add `total_found` to the report schema** so a consumer can distinguish "no duplicates found" from "scan incomplete."

### Notes / Follow-up

None outstanding after this pass; the file went back to review.

---

## Step 6: Reviewer — Second Review

**Date:** 2026-11-10
**Status:** ✅ APPROVED — 8/8 findings closed

### Summary

Re-review confirmed all eight findings closed and approved the artifact. One new cosmetic finding was raised: the Disjointness paragraph sat mid-bullet-list, breaking the contiguous rendering of the `report.json` field rules.

### Files Produced / Modified

| File | Description |
|---|---|
| — | Review only; no files changed in this step |

### Key Decisions

- **Approval with an open cosmetic.** A positional nit in a bullet list does not block a correctness-approved artifact, so it was recorded rather than looped back as rework.
- **Verification of each closure individually.** The approval states 8/8 closed rather than a general pass, so the earlier BLOCKING finding is traceable to its fix.

### Notes / Follow-up

The cosmetic was handed to a dedicated polish pass rather than folded into approval.

---

## Step 7: Coder — Cosmetic Polish

**Date:** 2026-11-10
**Status:** ✅ SUCCESS — 1/1 cosmetic closed

### Summary

Moved the Disjointness paragraph from mid-list to below the `halted` bullet, so `archives` and `halted` now render adjacently and the field rules read as one block. No wording changed. The file remains 472 lines, which is exactly what a pure relocation should produce.

### Files Produced / Modified

| File | Description |
|---|---|
| `.agents/prompts/doc-compaction.prompt.md` | **MODIFIED** — Disjointness paragraph relocated below the `halted` bullet. Line count unchanged at 472 |

### Key Decisions

- **Relocation, not rewriting.** The finding was positional, so the fix was too — keeping the approved wording byte-identical.
- **Stable line count as the correctness signal.** 472 → 472 confirms nothing was added or lost, only reordered.

### Notes / Follow-up

None. All findings across the pipeline are closed.

---

## Step 8: Tracker — Documentation

**Date:** 2026-11-10
**Status:** ✅ SUCCESS

### Summary

Recorded the pipeline: the full record went into `docs/tracker-log.md` earlier in this run, and this per-feature file is the companion record the `docs/<feature>/<agent>.md` convention expects. Both point at the same artifact; neither duplicates the other's role.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/tracker-log.md` | Pipeline record (written earlier in this run) |
| `docs/doc-compaction/tracker.md` | This per-feature record |

### Key Decisions

- **Two records, distinct jobs.** `tracker-log.md` is the cross-pipeline chronological log; `docs/<feature>/tracker.md` is the per-feature narrative a reader can find by feature name.
- **No duplication.** This file summarises by step and carries the pipeline's caveats; it does not restate the log entry.

### Notes / Follow-up

`knowledgebase_search` **NOT executed** (PG vector unavailable — `DATABASE_URL` not configured). Reported per the graceful-failure contract, not retried.

---

## Step 9: Deployer — Version Bump and Pull Request

**Date:** 2026-11-10
**Status:** ✅ SUCCESS — PR #49 opened

### Summary

Bumped the package from 2.9.0 to 2.10.0 and opened PR #49 against `main` from branch `feat/doc-compaction-prompt`. The deployer independently re-ran the full suite against the final tree before pushing, which is the only trustworthy gate result in this pipeline — the reviewer's earlier gate status was NOT RUN.

### Files Produced / Modified

| File | Description |
|---|---|
| `package.json` | Version 2.9.0 → 2.10.0 |
| `.agents/prompts/doc-compaction.prompt.md` | Ship artifact — already inside the npm `files` array and sync copy loop |
| — | PR: 2 commits (`36c66e8`, `310de20`), 10 files, `feat/doc-compaction-prompt` → `main` |

### Key Decisions

- **Minor bump (2.10.0).** New capability, no breaking change to anything existing — nothing in `package.json` scripts, `scripts/sync.js`, `.agents/instructions/**`, or `opencode.json` changed.
- **Independent gate re-run.** The deployer re-ran `npx vitest run` itself rather than trusting a review-stage claim, because that claim did not exist.
- **Two commits on one branch.** Implementation and polish remained separate commits, preserving the review history in the diff.

### Notes / Follow-up

PR: https://github.com/abarcenas29/ai-workflow-template/pull/49

---

## Overall Summary

### What Was Built

One deliverable: `.agents/prompts/doc-compaction.prompt.md`, a 472-line portable prompt across 7 mandated sections. A person runs it over a project's Markdown docs; it finds duplicates, stale files, and over-written pages, and proposes merges, archives, and deletions in a scored `.doc-compaction/report.json`. It is read-only by default and never deletes a file without printing the exact `rm` / `git rm` command first.

**It is a prompt, not an agent spec.** No agent frontmatter, no tool grants, no model key — a human invokes it deliberately.

### Files Summary

| File | Kind |
|---|---|
| `docs/spike-doc-compaction.md` | Scope artifact (terminal) |
| `docs/spike-doc-compaction.draft.md` | Scope artifact (superseded) |
| `plan/feature-doc-compaction-prompt-v1.md` | Plan (469 lines) |
| `.agents/prompts/doc-compaction.prompt.md` | **The deliverable** (472 lines) |
| `docs/tracker-log.md` | Pipeline log |
| `docs/doc-compaction/tracker.md` | This file |

### Verification

| Check | Result |
|---|---|
| `npx vitest run` | ✅ 33 files / 1,049 tests passed |
| Gate provenance | ✅ Independently re-run by the deployer against the final tree; the reviewer's earlier gate status was NOT RUN |
| Review rounds | ✅ Round 1 CHANGES REQUESTED (8 findings) → round 2 APPROVED (8/8 closed, 1 new cosmetic) → cosmetic closed |

### Known Gaps

- **`docs/.orchestrator-log.md` was never written.** The orchestrator had no shell grant in this run, so the usual status table and `FINAL STATUS` block do not exist. This record is the replacement, not a citation of one.
- **`docs/spike-doc-compaction.draft.md` is untracked by decision** — kept as history, deliberately not deleted and deliberately not committed.
- **`docs/TRACKER-INDEX.md` was trimmed to this feature's rows only.** Rows for other pipelines are not present in it.
- **`.agents/instructions/learned-knowledge.instructions.md` was only partially committed.** The 2026-11-08 plugin session entry was left uncommitted.
- **`knowledgebase_search` was unavailable throughout** (`DATABASE_URL` not configured) — graceful degradation, not retried.
