---
goal: "Ship a template-wide communication standard — one canonical instruction file, a named-variant reference line in all 15 agent specs, one AGENTS.md table row, a five-item reviewer check, and a fixed orchestrator normalization block"
version: 1
date_created: 2026-11-01
status: Completed
tags: [process, communication, instructions, agent-specs, orchestrator, reviewer, template]
---

# Plan: Communication Style Standard (v1)

## Introduction

**Status:** ✅ Completed (2026-11-01)

One follow-on item was **proposed after close, then applied on 2026-11-01**: the plan closed with an accepted
risk — reply text has no gate, because a live chat reply is never in a diff — and the cheapest mitigation for it
is specified in `## Testing` and `### Risks`, with the reviewer edit written out verbatim under T13
(`### Phase 5`) and now inserted in `.opencode/agents/reviewer.md`. The `status:` field above stays `Completed`
for the shipped work; T13 landed afterwards, and its own live check (TEST-11) has still never run.

This plan implements the settled design in [`docs/spike-communication-style.md`](../docs/spike-communication-style.md)
(decisions D1–D15, all answered by the requester). The spike is the authoritative input;
`docs/spike-communication-style.draft.md` is superseded and MUST NOT be used as a source.

The problem: agent output in this template is explained in language a reader cannot follow. The fix is one
reader model — a senior architect with a project-manager background who does not know this repository's
internal names and does not know library trivia — plus a mechanically checkable four-slot reply envelope,
expressed once in a canonical instruction file and loaded by a one-line reference inside every agent spec.

Scope of this change (D1, D15): 1 new instruction file, 1 reference line in each of 15 agent files, 1 row in
the `AGENTS.md` Instructions Reference table, a five-item communication check plus one output line in
`reviewer.md`, and a normalization block whose single copy lives in the new instruction file.

Out of scope: any `opencode.json` or `opencode.mcp.example.json` edit (D14), a new skill (D1), a
`GLOSSARY.md` or lexicon file (D10), automated lint/CI enforcement (O-3), retrofitting existing artifacts
(O-2), retiring or repairing `planner.md`'s dead tool list (O-4), and any version bump (`package.json` is
untouched; the Husky bump script owns versioning at commit time).

**Reader model applied to this plan:** file paths, line anchors, and literal strings are given so the coder
needs no further judgement; every recommendation below states its cost or risk in
[`## Risks & Assumptions`](#risks--assumptions).

---

## Requirements & Constraints

| ID | Type | Requirement |
|----|------|-------------|
| REQ-01 | File | `.agents/instructions/communication.instructions.md` exists with the exact frontmatter, H1, and eight `##` sections specified in T1, in the specified order. |
| REQ-02 | Agent specs | Exactly 15 agent files under `.opencode/agents/**` carry exactly one line referencing `.agents/instructions/communication.instructions.md`, naming the variant assigned in D9/D15. No file carries both variant names. |
| REQ-03 | Discoverability | `AGENTS.md` gains exactly one row in the `## Instructions Reference` table, with the literal text given in T2. |
| REQ-04 | Reviewer | `reviewer.md` gains the five-item communication check (D12) and the `**Communication:** ✅ \| ⚠️ N findings` output line; the check runs only when the diff touches `*.md` and never changes the review verdict. |
| REQ-05 | Orchestrator | The normalization block exists in exactly one place (the canonical file, REQ-01); each of the three orchestrator specs carries one pointer bullet. `## Pipeline Results` is unchanged. |
| REQ-06 | Override | The canonical file documents `AGENTS.project.md` as the project-level override with the paragraph specified in T1 §8. |
| REQ-07 | Prohibitions | No new skill, no `GLOSSARY.md`, no lexicon file, no `opencode.json` change, no `opencode.mcp.example.json` change, no `package.json` change. |
| REQ-08 | Artifacts | No artifact gains a new section. Existing sections that match an envelope slot are treated as that slot (spike §2.4). |
| REQ-09 | Parallel safety | No two tasks in the same batch write the same file. Shared files (`plan/process-communication-standard-v1.md`, `memory-bank/activeContext.md`, `memory-bank/progress.md`) are written by exactly one task (T11). |
| SEC-01 | Safety | No secrets, credentials, or environment values are introduced into any file. The change is markdown only. |
| SEC-02 | Safety | The reviewer change adds a 🔵 minor, non-blocking check; it MUST NOT weaken or reorder the existing severity gates (🔴/🟡/🔵) or the approve/changes-requested verdict. |
| SEC-03 | Safety | `AGENTS.project.md` is not created in this repository. It is project-owned (`scripts/sync.js:29-37`); documenting it is not the same as adding one. |
| CON-01 | Constraint | No existing prose inside any agent file is reworded, renumbered, or reordered. Insertions only — this keeps `coder.md`'s "step 6" self-reference and `tracker.md`'s "step 1"/"step 4" references valid. |
| CON-02 | Constraint | The new lines added to the three orchestrator specs MUST NOT contain the strings `knowledge-retrieval.instructions.md` or `knowledgebase_knowledgebase_search`. `tests/spec-orchestrator-parity.test.js:139-146, 184-190, 248-253` asserts exact occurrence counts (2 / 2 / 6); a third copy fails the suite. |
| CON-03 | Constraint | No committed test file is added (O-3 defers automated enforcement). Verification is ad hoc commands (T11) plus the reviewer pass and smoke prompt (T9/T10). |
| CON-04 | Constraint | Every file uses LF, soft-wraps prose near 80 characters, and never exceeds 400 characters per line (`.agents/instructions/markdown.instructions.md:16,30`). |
| CON-05 | Constraint | Instruction-file frontmatter uses exactly `description` + `applyTo`, per `.agents/instructions/instructions.instructions.md:22-27`, mirroring `.agents/instructions/knowledge-retrieval.instructions.md:1-4`. |
| CON-06 | Constraint | Batch B tasks do not write `memory-bank/*`, the plan file, or any file outside their listed set (see REQ-09 / RISK-04). |

---

## Implementation Steps

### Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1 | No (single) | — |
| B | T2, T3, T4, T5, T6, T7, T8 | Yes — 7 disjoint file sets | A |
| C | T9, T10, T11 | Yes — no file writes except T11's single-writer bookkeeping | B |
| D | T12 | No (single, conditional) | C |
| E (applied 2026-11-01) | T13 | No (single) | C for the landed state; TEST-11 needs one live pipeline |

**Files touched per batch (disjointness proof):**

| Batch | Task | Files owned |
|-------|------|-------------|
| A | T1 | `.agents/instructions/communication.instructions.md` (new) |
| B | T2 | `AGENTS.md` |
| B | T3 | `scope.md`, `researcher.md`, `architect.md` |
| B | T4 | `implementer.md`, `designer.md`, `planner.md` |
| B | T5 | `coder.md`, `unit-tester.md`, `e2e-tester.md` |
| B | T6 | `deployer.md`, `tracker.md` |
| B | T7 | `reviewer.md` |
| B | T8 | `orchestrator.md`, `feature-pipeline.md`, `tdd-orchestrator.md` |
| C | T11 | `plan/process-communication-standard-v1.md`, `memory-bank/activeContext.md`, `memory-bank/progress.md` |
| D | T12 | only files named by the findings it fixes |
| E | T13 | `.opencode/agents/reviewer.md` (applied 2026-11-01) |

`scope.md`, `researcher.md`, `architect.md`, `implementer.md`, `designer.md`, `planner.md`, `coder.md`,
`unit-tester.md`, `e2e-tester.md`, `deployer.md`, `tracker.md`, `reviewer.md` are under
`.opencode/agents/`; the rest are under `.opencode/agents/orchestrator/`. All paths below are repo-relative.

---

### Phase 1 — Canonical instruction file (Batch A)

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T1 | Create the canonical communication standard exactly as specified in the T1 content specification below. | `.agents/instructions/communication.instructions.md` (new) | A | — | ✅ | 2026-11-01 |

**T1 completion criteria**

1. The file exists; `head -4` shows the frontmatter below verbatim.
2. `grep -n '^## '` lists exactly the eight section headings in the specified order.
3. Both variant tables, the fenced envelope skeletons, the artifact table, and the normalization block are
   present with the literal strings listed in the specification.
4. No line exceeds 400 characters; no `####` headings; the H1 appears exactly once.
5. No `GLOSSARY.md`, skill directory, or other file is created.

#### T1 content specification

**Frontmatter (verbatim):**

```yaml
---
description: "Communication standard for agent output — reader model, violations, envelope variants, artifact binding"
applyTo: "**"
---
```

`applyTo: "**"` mirrors `.agents/instructions/knowledge-retrieval.instructions.md:2`; `description` satisfies
`.agents/instructions/instructions.instructions.md:22-27`.

**H1:** `# Communication Standard`

**Intro (2–3 sentences, must state):** this file is the single source of truth for how agents talk to the
reader; no root config auto-loads it (`opencode.json` has no `instructions` key), so each agent spec carries
a one-line reference that loads it; artifacts keep their existing section skeletons and only their prose
follows these rules.

**Sections — exact order, exact headings, required content:**

**1. `## Reader Model`**

- One sentence naming the reader: "a senior software architect with a project-manager background who does
  not know this repository's internal names and does not know library trivia."
- The acceptance question, verbatim: "Could this reader follow the explanation without opening the source?"
- A numbered list of the four rules, verbatim:
  1. Every term is glossed in ≤10 words on first use, or anchored to a path/ADR the reader can open.
  2. Every claim carries an evidence marker.
  3. Every recommendation states its cost and its risk.
  4. No unexplained acronyms and no library-internal vocabulary.
- `### Enforcement` (H3): the four-slot envelope is structural and checked; the four rules above are
  advisory, judged by `reviewer` on written artifacts only, never in chat (D5).

**2. `## Violation Modes`**

A table with header `| # | Mode | What it looks like | Fix |` and exactly three rows:

| # | Mode | What it looks like | Fix |
|---|------|--------------------|-----|
| 1 | Unexplained jargon | A term, acronym, identifier, or library-internal concept with no gloss and no anchor | Gloss in ≤10 words or anchor to a path/line |
| 2 | Unsupported claim | An assertion about the code or its behaviour with no evidence marker | Add a path, line, command, or citation |
| 3 | Recommendation without cost/risk | A proposed option or next step that does not say what it costs and what could go wrong | State both, in the same bullet |

**3. `## Where This Applies`**

- Bullets: chat replies carry the full envelope; markdown artifacts keep their existing skeletons and only
  their prose follows the rules (see `## Artifacts`); `memory-bank/*.md` is excluded.
- `### Mapping spec content onto the slots` (H3) plus this table — it resolves every agent whose
  `## Output Expectations` is a bullet list, so no per-agent mapping is needed:

| Spec-listed content | Slot |
|---------------------|------|
| The outcome in one paragraph | `## Bottom line` |
| Files reviewed, files created or changed | `## What changed, file by file` |
| What was examined and what was found (the findings behind the change) | decision-framed slot 2, `## What I found and where` |
| Measurements, citations, proofs, `path:line` references | `## Evidence` |
| Options, trade-offs, risks, follow-ups, the verdict, the next action | slot 4 (`## Risks and next step` / `## Decision and options with cost/risk`) |

- One sentence: the four headings are the only headings in a reply; the listed bullets are content
  requirements, placed into the slot that matches their kind.

**4. `## The Envelope`**

Intro sentence: four literal `##` headings, fixed order, no renaming, no substitutions, no extra slots. If a
slot has nothing to report, keep the heading and write a single bullet `None.` — never drop the heading.

`### change-framed` — table then a fenced skeleton:

| Slot | Literal heading | Cap |
|------|-----------------|-----|
| 1 | `## Bottom line` | 1–3 sentences |
| 2 | `## What changed, file by file` | ≤8 bullets |
| 3 | `## Evidence` | ≤5 bullets |
| 4 | `## Risks and next step` | ≤5 bullets |

`### decision-framed` — table then a fenced skeleton:

| Slot | Literal heading | Cap |
|------|-----------------|-----|
| 1 | `## Bottom line` | 1–3 sentences |
| 2 | `## What I found and where` | ≤8 bullets |
| 3 | `## Evidence` | ≤5 bullets |
| 4 | `## Decision and options with cost/risk` | ≤5 bullets |

Each skeleton is a fenced `markdown` block showing the four headings with one placeholder bullet each.

`### Rules common to both variants`:

- Overall cap: 40 lines per chat reply.
- Tables and verbatim quotes do not count toward the 40 lines, but stay inside the slot they belong to.
- Caps are maxima; slot 1 is a range of 1–3 sentences.
- Slots and their order are identical in both variants except slots 2 and 4.

`### Exemptions`:

- **Exemption 1 — multi-option decisions.** When a decision has several options and each needs its own cost
  and risk, the slot-4 bullet cap and the 40-line cap are lifted.
- **Exemption 2 — verbatim relays.** When relaying sub-agent or user text verbatim, the 40-line cap is
  lifted.
- Both exemptions require one line stating that the reply exceeds the cap and which exemption applies. An
  undeclared overrun is a violation; a declared one is not.
- An exemption lifts the per-slot cap on the slot it affects and the overall cap.

**5. `## Vocabulary Rules`**

Five bullets, verbatim in substance (spike §2.3): inline parenthetical gloss ≤10 words or a path/line anchor
on first use; no lexicon file; code identifiers, file paths, and API names are exempt from glossing but must
be followed by a one-line plain-language clause on first appearance; acronyms are expanded once, even inside
paths; no `GLOSSARY.md` is created — glossary ownership stays with `.agents/config/domain.md` and is
exercised lazily.

Plus one worked pair (two lines only):
`Good:` a sentence that glosses a term inline and cites `path:line`; `Bad:` the same sentence with the term
bare and the claim uncited.

**6. `## Artifacts`**

The binding table from spike §2.4, verbatim, seven rows:

| Artifact | Bound? | How it applies |
|----------|--------|----------------|
| Spike docs (`docs/spike-*.md`, `docs/spikes/*.md`) | Yes | Existing sections play the slots. The decision/recommendation section is the bottom line; Investigation Results carries the evidence. |
| Plans (`plan/*.md`) | Yes | The mandated 9-section order is untouched. Prose inside Introduction / Implementation Steps / Testing / Risks & Assumptions follows the standard. |
| `docs/tracker-log.md` | Yes | `### Summary` is the bottom line; Files Produced/Modified, Verification Results, and Key Decisions/Notes cover the remaining slots. |
| `docs/<feature>/<agent>.md` | Yes | Same rule as tracker entries: existing headings only. |
| ADRs (`docs/adr/*.md`, and the existing flat `docs/adr-*.md`) | Yes | Decision is the bottom line; Context and Consequences carry evidence and risk. |
| `docs/.orchestrator-log.md` | Yes | Step entries and the final status line follow the standard; the log's structure does not change. |
| `memory-bank/*.md` | **No** | Excluded — these files are rewritten for agent retrieval, not for the reader model. |

Closing rule paragraph: no new sections are added to any artifact; an existing section that already matches
a slot is treated as that slot (settled examples: the spike's decision section = bottom line; the tracker's
`### Summary` = bottom line); where no section matches, the prose inside existing sections follows the
standard.

**7. `## Orchestrator Normalization Block`**

- One sentence: this section is the only copy of the block; orchestrator specs carry a pointer, never a
  duplicate.
- When: at every confirmation gate in `orchestrator.md` (`confirmationGates` defaults to `researcher`,
  `implementer`, `scope`).
- Fenced `markdown` block, verbatim:

```markdown
**Bottom line:** <one sentence>
**Files:** <paths, verbatim>
**Blocker:** <none, or what is needed>
**Next:** <one step>
---
<sub-agent output, verbatim and unmodified>
```

- Bullets: four bold lines in that fixed order, then a `---` rule, then the sub-agent's output verbatim — no
  re-authoring, no paraphrase, no summary replacing the output; every file path and every finding survives
  the normalization.
- `scope` gates: the block carries status and question count only — bottom line = status plus "N questions",
  Files = the draft path, Next = "answer Q1–QN". The questions follow unmodified; the orchestrator never
  answers, edits, or reorders them.
- The final `## Pipeline Results` table is unchanged: no Communication column, no extra line, no new field.

**8. `## Project Override`**

Insert this paragraph, verbatim:

> `AGENTS.project.md` is the project-owned override. A project that wants a different house style replaces
> this standard there: write the replacement rules in `AGENTS.project.md`, state which sections of this file
> they supersede, and that project's agents follow the replacement. The override is durable because sync
> never overwrites or prunes `AGENTS.project.md` (`scripts/sync.js:29-37` lists it in `projectOwnedPaths`),
> and it is loaded because consumers declare `"instructions": ["AGENTS.project.md"]` in `opencode.json` (the
> shipped default is `opencode.mcp.example.json:3`). Where the two conflict, `AGENTS.project.md` wins; where
> it is silent, this file applies.

---

### Phase 2 — Reference lines, AGENTS.md row, reviewer check (Batch B — Parallel)

All seven tasks below are independent of each other and depend only on T1. Each writes a disjoint file set.

#### Reference-line definitions (exact text — copy character for character)

Copy each block exactly; the leading whitespace shown is significant.

```text
LINE-DF      (column 0)
- **Communication:** Read `.agents/instructions/communication.instructions.md` and follow the `decision-framed` envelope for all user-facing output.

LINE-DF-N    (three leading spaces, nested under a numbered Approach item)
   - **Communication:** Read `.agents/instructions/communication.instructions.md` and follow the `decision-framed` envelope for all user-facing output.

LINE-CF      (column 0)
- **Communication:** Read `.agents/instructions/communication.instructions.md` and follow the `change-framed` envelope for all user-facing output.

LINE-CF-N    (three leading spaces, nested under a numbered Approach item)
   - **Communication:** Read `.agents/instructions/communication.instructions.md` and follow the `change-framed` envelope for all user-facing output.

SCOPE-LINE   (column 0, appended as numbered item 5 of `## Check Knowledge`)
5. **Communication**: Read `.agents/instructions/communication.instructions.md` and follow the `decision-framed` envelope for all user-facing output.

PLANNER-LINE (column 0, first bullet of `### Communication`)
- **House standard**: Read `.agents/instructions/communication.instructions.md` and follow the `decision-framed` envelope for all user-facing output.

ORCH-LINE    (column 0, last bullet of `## Guidelines`)
- **Communication standard**: Read `.agents/instructions/communication.instructions.md` and follow the `change-framed` envelope for all user-facing output; emit its Orchestrator Normalization Block at every confirmation gate.

AGENTS-ROW   (one table row, inserted after the `HTML/CSS styling` row of `## Instructions Reference`)
| Communication style | `.agents/instructions/communication.instructions.md` |
```

`LINE-DF` / `LINE-CF` are top-level bullets (column 0); the `-N` forms are nested bullets at 3-space
indentation, which is the established continuation indent for a `1. `/`2. ` item and mirrors the existing
`   - **Query Knowledgebase**:` sub-bullet at `implementer.md:28`.

**Placement rule (applies to every agent file):** insert the line immediately after the file's existing
`.agents/instructions/knowledge-retrieval.instructions.md` reference — the precedent lines the spike cites at
`researcher.md:72`, `reviewer.md:24`, `tracker.md:24`. This inherits the established "read and follow"
section shape. Do not add a new heading, do not renumber any list, and do not reword the neighbouring line.

#### Per-file insertion map

| # | File | Variant | Insert after (current line, anchor text) | Text to insert |
|---|------|---------|------------------------------------------|----------------|
| 1 | `.opencode/agents/scope.md` | decision-framed | line 266 — `4. **Fall back to project files.** …` (last item of `## Check Knowledge`) | `SCOPE-LINE` at column 0 |
| 2 | `.opencode/agents/researcher.md` | decision-framed | line 76 — `- State the result in your final summary` (last bullet of `### 0a. Check Knowledge`) | `LINE-DF` at column 0 |
| 3 | `.opencode/agents/architect.md` | decision-framed | line 27 — the `   **Query Knowledgebase**: …` continuation of Approach step 3 | `LINE-DF-N` |
| 4 | `.opencode/agents/implementer.md` | decision-framed | line 28 — `   - **Query Knowledgebase**: …` sub-bullet of Approach step 3 | `LINE-DF-N` |
| 5 | `.opencode/agents/designer.md` | decision-framed | line 33 — `4. **Query Knowledgebase**: …` | `LINE-DF-N` |
| 6 | `.opencode/agents/planner.md` | decision-framed | line 91 — the blank line after `### Communication` (line 90), before `- **Be Consultative**` (line 93) | `PLANNER-LINE` at column 0 |
| 7 | `.opencode/agents/coder.md` | change-framed | line 28 — `3. **Check Memory Bank**: …` | `LINE-CF-N` |
| 8 | `.opencode/agents/unit-tester.md` | change-framed | line 42 — `1. **Check Knowledge**: …` | `LINE-CF-N` |
| 9 | `.opencode/agents/e2e-tester.md` | change-framed | line 25 — `2. **Check Knowledge**: …` | `LINE-CF-N` |
| 10 | `.opencode/agents/deployer.md` | change-framed | line 25 — `3. **Check Knowledge**: …` | `LINE-CF-N` |
| 11 | `.opencode/agents/tracker.md` | change-framed | line 30 — the `   **projectId derivation …**` continuation of Approach step 1 | `LINE-CF-N` |
| 12 | `.opencode/agents/reviewer.md` | change-framed | line 24 — `0. **Check Knowledge**: …` | `LINE-CF-N` (T7 also adds the check block) |
| 13 | `.opencode/agents/orchestrator/orchestrator.md` | change-framed | line 267 — `- **Never read project files for analysis**: …` (last bullet of `## Guidelines`) | `ORCH-LINE` at column 0 |
| 14 | `.opencode/agents/orchestrator/feature-pipeline.md` | change-framed | line 170 — `- **Never read project files for analysis**: …` (last bullet of `## Guidelines`) | `ORCH-LINE` at column 0 |
| 15 | `.opencode/agents/orchestrator/tdd-orchestrator.md` | change-framed | line 396 — `- **Coverage gate is enforced**: …` (last bullet of `## Guidelines`, end of file) | `ORCH-LINE` at column 0 |

Line numbers are current-state anchors for orientation only; **anchor on the quoted text**, because earlier
insertions in other files do not shift these files but a re-read is always safe (RISK-07).

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T2 | Add the `AGENTS-ROW` line defined in the fenced block above as the last row of the `## Instructions Reference` table — immediately after the `HTML/CSS styling` row (current line 44) and before the blank line preceding `## Available Skills`. Three cells, no trailing punctuation, no other edit to `AGENTS.md`. **Done when:** the row is the last row of that table and `grep -c 'communication.instructions.md' AGENTS.md` returns `1`. | `AGENTS.md` | B | T1 | ✅ | 2026-11-01 |
| T3 | Insert the decision-framed reference line into three files, per insertion map rows 1–3. No other edit, no renumbering. **Done when:** each file contains exactly one occurrence of `communication.instructions.md`, contains `decision-framed`, and does not contain `change-framed`. | `scope.md`, `researcher.md`, `architect.md` | B | T1 | ✅ | 2026-11-01 |
| T4 | Insert the decision-framed reference line into three files, per insertion map rows 4–6. `planner.md` takes `PLANNER-LINE` inside its existing `### Communication` subsection (line 90) — do **not** place it near the dead tool list at `planner.md:25-27`, and do **not** fix that list (O-4, deferred). **Done when:** each file has exactly one `communication.instructions.md` occurrence, names `decision-framed`, and `planner.md`'s lines 25–27 are byte-identical to before. | `implementer.md`, `designer.md`, `planner.md` | B | T1 | ✅ | 2026-11-01 |
| T5 | Insert the change-framed reference line into three files, per insertion map rows 7–9. **Done when:** each file has exactly one `communication.instructions.md` occurrence, names `change-framed`, and contains no `decision-framed`. | `coder.md`, `unit-tester.md`, `e2e-tester.md` | B | T1 | ✅ | 2026-11-01 |
| T6 | Insert the change-framed reference line into two files, per insertion map rows 10–11. For `tracker.md`, insert **after** line 30 (the projectId continuation) so the existing knowledge paragraph stays intact. **Done when:** both files meet the same one-occurrence / `change-framed` criteria. | `deployer.md`, `tracker.md` | B | T1 | ✅ | 2026-11-01 |
| T7 | In `reviewer.md`: (a) insert `LINE-CF-N` after line 24 (map row 12); (b) after the `## Output Expectations` bullet list (current line 55, the `- Overall assessment and recommendation …` bullet) insert the H3 block specified below. **Done when:** the file has one `communication.instructions.md` occurrence, one `### Communication standard check` heading, the five numbered items in order, the trigger sentence, and the `**Communication:**` line template. | `reviewer.md` | B | T1 | ✅ | 2026-11-01 |
| T8 | Add `ORCH-LINE` to the end of `## Guidelines` in each of the three orchestrator specs (map rows 13–15). Do **not** edit Step 4's confirmation-gate item, do **not** restate the block, and do **not** add the strings banned by CON-02. **Done when:** each file has exactly one `communication.instructions.md` occurrence; `grep -c 'knowledge-retrieval.instructions.md' orchestrator.md` = 2, …`tdd-orchestrator.md` = 6, and `grep -c 'knowledgebase_knowledgebase_search' feature-pipeline.md` = 2 (all unchanged). | `orchestrator.md`, `feature-pipeline.md`, `tdd-orchestrator.md` | B | T1 | ✅ | 2026-11-01 |

**T7 additional content — insert immediately after the `## Output Expectations` bullet list:**

```markdown
### Communication standard check

Run this check only when the diff touches `*.md`. Findings are 🔵 minor and never change the review verdict.

1. **Slots present.** The four headings for the producer's variant appear, literally, in the fixed order
   defined in `.agents/instructions/communication.instructions.md`.
2. **Caps respected.** 1–3 sentences / ≤8 bullets / ≤5 bullets / ≤5 bullets, and ≤40 lines overall — or the
   overrun is declared, with a reason that is one of the two exemptions.
3. **Vocabulary.** Every term is glossed in ≤10 words or anchored to a path/line on first use; identifiers,
   paths, and API names are followed by a one-line plain-language clause.
4. **Evidence.** Every claim carries an evidence marker.
5. **Cost and risk.** Every recommendation states both.

Record the result as the final bullet of slot 4: `**Communication:** ✅` or
`**Communication:** ⚠️ N findings`.
```

The `**Communication:**` line goes **inside** the envelope (final bullet of `## Risks and next step`), not
after it, so the reply still has exactly four headings and no fifth slot (see AMB-1).

**Batch B execution note (mandatory):** each Batch B coder writes only the files in its row and nothing
else. Per CON-06 it does **not** edit `plan/process-communication-standard-v1.md` and does **not** touch
`memory-bank/*` — seven concurrent writers to those shared files would clobber each other and burn the
audit trail (RISK-04). Each returns a one-line completion note for T11 to record.

---

### Phase 3 — Verification (Batch C — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T9 | **Reviewer pass (D12, part 1).** Run the `reviewer` agent against `docs/spike-communication-style.md` with the new standard in force: apply the five-item communication check to the spike's own prose, and report the `**Communication:**` line. Findings are 🔵 minor and are **not** applied to the spike (O-2: no retrofitting) — they are reported as a signal about whether the standard is checkable in practice. **Done when:** all five items are assessed and the Communication line is emitted. | none (read-only) | C | T2–T8 | ✅ | 2026-11-01 |
| T10 | **Smoke prompt (D12, part 2).** Spawn the `implementer` sub-agent (decision-framed) with exactly this prompt and no file writes: *"Do not edit anything. Answer as a decision: should the 40-line chat cap be raised to 60 for reviewer reports? Give the recommendation and what it costs."* **Done when:** the reply contains `## Bottom line`, `## What I found and where`, `## Evidence`, `## Decision and options with cost/risk` in that order, is ≤40 lines, respects the 1–3 / ≤8 / ≤5 / ≤5 caps, and each option carries cost and risk. If any check fails, record T12. | none (read-only) | C | T2–T8 | ✅ | 2026-11-01 |
| T11 | **Static consistency + bookkeeping.** Run the verification commands in [`## Testing`](#testing) TEST-01…TEST-08. Then, as the single writer: mark T1–T10's `Completed`/`Date` columns, update `memory-bank/activeContext.md` and `memory-bank/progress.md`, and append a `memory-bank/tasks/` entry if the pipeline requires one. **Done when:** all automated checks pass, the two suites are green, and the plan rows are marked. | `plan/process-communication-standard-v1.md`, `memory-bank/activeContext.md`, `memory-bank/progress.md` | C | T2–T8 | ✅ | 2026-11-01 |

---

### Phase 4 — Conditional remediation (Batch D — single)

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T12 | **Only if T9 or T10 found a real defect** (a missing/misordered slot, an actual cap breach with no exemption, a broken reference line, or a parity-count regression): fix the specific defect in the file that owns it, then re-run only the failing test from `## Testing`. Do **not** expand scope: no rewording of settled decisions, no new sections, no retrofitting of old artifacts. If T9/T10 pass, record T12 as "not required" and close the plan. | the file named by the finding | D | T9, T10, T11 | ✅ | 2026-11-01 |

---

### Phase 5 — Follow-on (applied 2026-11-01)

Added 2026-11-01, after the plan closed, to record one accepted risk properly instead of leaving it as a
sentence with no owner, no trigger, and no verification. **T13 was applied on 2026-11-01, after the parallel
batch that owned `reviewer.md` finished; TEST-11 (its live check) is still unrun.**

| Task ID | Description | File(s) | Batch | Dependencies | Completed | Date |
|---------|-------------|---------|-------|--------------|-----------|------|
| T13 | **APPLIED 2026-11-01 (O-5 closed; RISK-01 mitigation built but unproven).** Give `reviewer` the pipeline reply spot-check: one sampled reply per pipeline, four mechanical checks (S1–S4), recorded on the existing `**Communication:**` line. This closes the gap where reply text is never in a diff and so is never checked. **Done when:** the exact text under "T13 applied edit" is inserted at the named anchor, `reviewer.md` still carries exactly one `communication.instructions.md` occurrence (TEST-03), and TEST-11 has been run at least once or its failure recorded. **Applied:** text inserted byte-identically (diff-verified against the plan block); TEST-03 still `1`; TEST-11 **not run** — no pipeline reply has reached `reviewer` since the edit, and it is recorded as unrun below rather than claimed as a pass. | `.opencode/agents/reviewer.md` | E | C (landed state); TEST-11 needs one live pipeline | ✅ | 2026-11-01 |

**T13 applied edit — inserted verbatim 2026-11-01.** This text was written during Phase 5 and could not be
applied then, because `.opencode/agents/reviewer.md` was owned by a parallel pass; the owning batch finished on
2026-11-01 and the text below was inserted unchanged. Anchor: inside `### Communication standard check`,
immediately **after** the paragraph that begins "Run this check only when the diff touches `*.md`" and
**before** the numbered list starting `1. **Slots present.**`. If a parallel pass reworded that paragraph,
anchor on the `### Communication standard check` heading and insert directly after its first paragraph —
the spot-check must sit outside the `*.md` gate, because that gate is the hole it fills. Nothing else in the
file changes; no section is added, and no existing sentence is reworded (CON-01).

````markdown
**Pipeline reply spot-check — once per pipeline, not gated on `*.md`.** Run this in addition to the five
items below, on every pipeline that reaches you, whether or not the diff touches `*.md`. The gate above is
exactly the hole it fills: reply text is never in a diff, so nothing else counts it.

- **S1 — sample.** Take the earliest upstream reply visible in your context (the lowest stage number) and
  name it by stage and agent. If no upstream reply is visible — a standalone invocation — the sample is
  your own reply, checked before you send it.
- **S2 — line count.** Count the sample's lines, excluding fenced tables, verbatim quote blocks, and any
  exemption declaration line. Pass at ≤40.
- **S3 — slot headings.** The producer's four literal headings for its variant (`### Variant assignment` in the
  communication standard has the mapping) appear in order 1→2→3→4, each as a whole line, with no renamed slot
  and no fifth `##` heading.
- **S4 — communication line.** `**Communication:**` appears exactly once, as the last bullet of slot 4.
- **Record.** Extend that same line — `**Communication:** ✅ spot-check pass (implementer, stage 3)` or
  `**Communication:** ⚠️ N findings; spot-check fail S2 (implementer, stage 3)` — and add one
  `## Evidence` bullet with the line count. Quote the sample by reference, stage and agent, never pasted.
- **On fail.** A 🔵 minor finding naming the producing agent, plus the sample reference in your slot 4 next
  step so the user can open it. It blocks nothing and never changes the verdict.
````

**Why `reviewer` and not the orchestrator.** The orchestrator sees every reply, so its sample frame is
complete — but it would have to run the check at every gate, and its own gate output is the four-bold-line
normalization block, not the envelope, so the check would need its own exceptions. `reviewer` already owns
the five-item check, already emits the `**Communication:**` line, and already has a defined non-blocking
failure path, so the spot-check rides on existing output. Cost of that choice: the sample frame shrinks to
the replies relayed into the reviewer's context. Risk: a reply produced before the review stage and never
relayed stays invisible — recorded as residual risk, not hidden.

---

## Alternatives

| ID | Alternative | Why rejected |
|----|-------------|--------------|
| ALT-01 | A new skill carrying the standard | Rejected by D1: a skill fires only when an agent chooses to invoke it, whereas a reference line in the spec loads every time the spec is read. Cost avoided: an extra invocation decision per agent; risk avoided: silent non-use. |
| ALT-02 | Inline the envelope rules in all 15 agent files | Rejected: ~15 copies drift. The repo has already paid for this lesson — `.agents/instructions/learned-knowledge.instructions.md:345` records that the shared-protocol-file pattern beat inline duplication for the knowledge-retrieval protocol. |
| ALT-03 | Put the reference line in a new `## Communication` section in each agent | Rejected: adds a section to 15 files, forces per-file headings, and breaks the "insert next to the precedent" shape the spike cites. The 3-space nested bullet under the existing knowledge step is a one-line insertion with no renumbering. |
| ALT-04 | Renumber agent `## Approach` steps to slot the line as a numbered step | Rejected: `coder.md` says "The **Document** step (step 6) is mandatory", and `tracker.md` refers to "step 1"/"step 4". Renumbering silently breaks those self-references (CON-01). |
| ALT-05 | Make the reviewer's communication findings blocking | Rejected by D12: a style finding must not fail a security or correctness review. Cost of the chosen path: drift can survive a merge (RISK-01). |
| ALT-06 | Triplicate the normalization block inside all three orchestrator specs | Rejected by D7/REQ-05: three copies drift, and any edit to the block would need three synchronized changes. One canonical block plus one pointer bullet per spec keeps a single source of truth. |
| ALT-07 | Repair `planner.md`'s dead tool list (`planner.md:25-27`) in this change | Rejected: O-4 defers it; it is an unrelated legacy cleanup and would inflate the review surface of a markdown-only style change. Cost: the file keeps a nonsense tool list next to a correct style line (RISK-03). |
| ALT-08 | Add a committed grep test for the 15 reference lines (like `tests/spec-knowledge-retrieval.test.js`) | Rejected for this change: O-3 defers automated enforcement, and a new test file widens scope beyond the spike. Cost: the invariant is verified once, not continuously (RISK-01). |

---

## Dependencies

| ID | Dependency | Notes |
|----|------------|-------|
| DEP-01 | T2–T8 depend on T1 | The reference line points at a file that must exist first; a dangling path is worse than no line. |
| DEP-02 | T9, T10, T11 depend on T2–T8 | Verification reads the finished state of all 16 edited/created paths. |
| DEP-03 | T12 depends on T9, T10, T11 | Remediation is a response to a finding, not a scheduled step. |
| DEP-04 | No new npm package or devDependency | The change is markdown only. |
| DEP-05 | Distribution is automatic | `scripts/sync.js:570-594` copies every file under `.agents/` and `:615-637` every file under `.opencode/`, so the new instruction file and the 15 edited specs ship with no manifest change. |
| DEP-06 | No `opencode.json` dependency | The root config has no `instructions` key (spike §2.7), so the reference lines are the load mechanism; `AGENTS.md` is injected independently. |
| DEP-07 | Pre-existing suites | `npm run test:unit` and `npm test` must stay green; `tests/spec-orchestrator-parity.test.js` occurrence counts are the sharpest constraint (CON-02). |

---

## Files

| ID | File | Action | Notes |
|----|------|--------|-------|
| FILE-01 | `.agents/instructions/communication.instructions.md` | Create | Canonical standard; eight `##` sections per T1. |
| FILE-02 | `AGENTS.md` | Edit | One table row (T2). |
| FILE-03 | `.opencode/agents/scope.md` | Edit | `SCOPE-LINE` (decision-framed). |
| FILE-04 | `.opencode/agents/researcher.md` | Edit | `LINE-DF`. |
| FILE-05 | `.opencode/agents/architect.md` | Edit | `LINE-DF-N`. |
| FILE-06 | `.opencode/agents/implementer.md` | Edit | `LINE-DF-N`. |
| FILE-07 | `.opencode/agents/designer.md` | Edit | `LINE-DF-N`. |
| FILE-08 | `.opencode/agents/planner.md` | Edit | `PLANNER-LINE` in `### Communication`; dead tool list untouched (ALT-07). |
| FILE-09 | `.opencode/agents/coder.md` | Edit | `LINE-CF-N`. |
| FILE-10 | `.opencode/agents/unit-tester.md` | Edit | `LINE-CF-N`. |
| FILE-11 | `.opencode/agents/e2e-tester.md` | Edit | `LINE-CF-N`. |
| FILE-12 | `.opencode/agents/deployer.md` | Edit | `LINE-CF-N`. |
| FILE-13 | `.opencode/agents/tracker.md` | Edit | `LINE-CF-N`. |
| FILE-14 | `.opencode/agents/reviewer.md` | Edit | `LINE-CF-N` + `### Communication standard check` block. |
| FILE-15 | `.opencode/agents/orchestrator/orchestrator.md` | Edit | `ORCH-LINE`. |
| FILE-16 | `.opencode/agents/orchestrator/feature-pipeline.md` | Edit | `ORCH-LINE`. |
| FILE-17 | `.opencode/agents/orchestrator/tdd-orchestrator.md` | Edit | `ORCH-LINE`. |
| FILE-18 | `plan/process-communication-standard-v1.md` | Edit | Completion columns (T11 only). |
| FILE-19 | `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/tasks/_index.md` | Edit | T11 only (single writer). |
| FILE-20 | `docs/spike-communication-style.md` | Read | Verification input for T9; never edited (O-2). |
| FILE-21 | `.opencode/agents/reviewer.md` | Edit (applied 2026-11-01 — T13) | Pipeline reply spot-check inserted inside `### Communication standard check`; exact text and anchor are under T13. The owning parallel pass finished on 2026-11-01, so the edit was made rather than left recorded. |

Files deliberately **not** touched: `opencode.json`, `opencode.mcp.example.json`, `package.json`,
`package-lock.json`, `AGENTS.project.md` (does not exist here and must not be created), `GLOSSARY.md`
(must not be created), `.agents/config/domain.md`, `scripts/*`, `tests/*`, and
`docs/spike-communication-style.draft.md` (superseded; left as history).

---

## Testing

| ID | Check | Command / action | Passes when |
|----|-------|------------------|-------------|
| TEST-01 | Canonical file shape | `test -f .agents/instructions/communication.instructions.md && grep -n '^## ' .agents/instructions/communication.instructions.md` | File exists; the eight `##` headings appear in the T1 order; `description` + `applyTo` are the only frontmatter keys. |
| TEST-02 | Literal slots present | `grep -c '^## Bottom line$' …` style checks inside the two fenced skeletons | Both variants list `## Bottom line`, their variant slot 2, `## Evidence`, and their variant slot 4, with the four caps. |
| TEST-03 | 15 reference lines, exactly one each | `for f in scope researcher architect implementer designer planner coder unit-tester e2e-tester reviewer deployer tracker; do printf '%s %s\n' "$f" "$(grep -c 'communication.instructions.md' .opencode/agents/$f.md)"; done` and the same for the three orchestrator files | All 15 print `1`; total across `.opencode/agents/**` is exactly `15`. |
| TEST-04 | Variant assignment | `grep -l decision-framed .opencode/agents/{scope,researcher,architect,implementer,designer,planner}.md` and `grep -l change-framed .opencode/agents/{coder,unit-tester,e2e-tester,reviewer,deployer,tracker}.md .opencode/agents/orchestrator/*.md` | Each list gives exactly six / nine files; no file appears in both. |
| TEST-05 | Parity counts unchanged | `grep -c 'knowledge-retrieval.instructions.md' .opencode/agents/orchestrator/orchestrator.md` → `2`; `… tdd-orchestrator.md` → `6`; `grep -c 'knowledgebase_knowledgebase_search' .opencode/agents/orchestrator/feature-pipeline.md` → `2` | All three counts match the pre-change values (CON-02). |
| TEST-06 | `AGENTS.md` row | `grep -n 'communication.instructions.md' AGENTS.md` | Exactly one hit, inside the Instructions Reference table, immediately after the HTML/CSS styling row. |
| TEST-07 | Line length / heading depth | `awk 'length > 400 {print FILENAME":"FNR}' .agents/instructions/communication.instructions.md .opencode/agents/*.md .opencode/agents/orchestrator/*.md AGENTS.md` and `grep -n '^#### ' .agents/instructions/communication.instructions.md` | No output from either command. |
| TEST-08 | Suites green | `npm run test:unit` then `npm test` | Vitest exits 0 with no new failures (`tests/spec-knowledge-retrieval.test.js`, `tests/spec-orchestrator-parity.test.js`, `tests/spec-kb-consolidation.test.js` all pass); Playwright exits 0 (7 passed / 1 skipped baseline). |
| TEST-09 | Reviewer pass (D12) | T9 | Five items assessed on the spike; `**Communication:**` line emitted. |
| TEST-10 | Smoke prompt (D12) | T10 | Four headings in order, ≤40 lines, caps respected, cost+risk on each option. |
| TEST-11 | **Pipeline reply spot-check (instruction applied 2026-11-01 — still never run).** Samples a live reply, which TEST-01…TEST-10 cannot: they check the standard's shape and two one-off probes, and no reply is ever a file. | T13, then every pipeline that reaches `reviewer` | One sampled reply per pipeline: S1 sample named by stage and agent; S2 count ≤40 lines; S3 the four literal headings in slot order with no fifth `##`; S4 `**Communication:**` exactly once, as the last bullet of slot 4; the verdict recorded on that line with the count in `## Evidence`. A fail is recorded against the producing agent and blocks nothing. |

No committed test file is added (CON-03). `graphify update .` is not required: this change is markdown only
and does not alter the code AST.

### Verification outcomes (T11, 2026-11-01)

| ID | Result |
|----|--------|
| TEST-01 | ✅ PASS |
| TEST-02 | ✅ PASS |
| TEST-03 | ✅ PASS |
| TEST-04 | ✅ PASS |
| TEST-05 | ✅ PASS |
| TEST-06 | ✅ PASS |
| TEST-07 | ⚠️ PASS-WITH-BASELINE-DEBT |
| TEST-08 | ✅ PASS |
| TEST-09 | ✅ PASS (findings fed T12) |
| TEST-10 | ✅ PASS |

**TEST-01 — canonical file shape.** The file exists (342 lines). `grep '^## '` returns exactly the eight
headings in T1 order: `Reader Model` (`:17`), `Violation Modes` (`:56`), `Where This Applies` (`:67`),
`The Envelope` (`:133`), `Vocabulary Rules` (`:231`), `Artifacts` (`:260`),
`Orchestrator Normalization Block` (`:293`), `Project Override` (`:331`). Frontmatter keys are exactly
`description` + `applyTo` (2 keys); `grep -c '^# '` = 1; `grep -c '^#### '` = 0.

**TEST-02 — literal slots present.** The `^ *##` form was used (see the method note below). The two fenced
skeletons carry `## Bottom line` twice and `## Evidence` twice, with each variant's slot 2 and slot 4 exactly
once: `## What changed, file by file` at `:160` and `## Risks and next step` at `:166` (change-framed);
`## What I found and where` at `:187` and `## Decision and options with cost/risk` at `:193`
(decision-framed). Both blocks read in slot order 1→2→3→4. All four caps appear in both cap tables
(`:151-154`, `:178-181`), and the common rules carry `Overall cap: 40 lines` (`:199`).

**TEST-03 — 15 reference lines.** All 15 named files print `1`. The totals agree: `grep -rl` finds 15 files,
`grep -rho` finds 15 occurrences, and `.opencode/agents/**/*.md` holds exactly 15 files — so no agent spec is
unmapped and none carries a duplicate.

**TEST-04 — variant assignment.** `decision-framed` → exactly 6 (`scope`, `researcher`, `architect`,
`implementer`, `designer`, `planner`). `change-framed` → exactly 9 (`coder`, `unit-tester`, `e2e-tester`,
`reviewer`, `deployer`, `tracker`, plus the three orchestrators). The intersection is empty: no file carries
both names, and no file carries neither. `planner.md:25-27` is byte-identical to `HEAD`.

**TEST-05 — parity counts unchanged.** `orchestrator.md` = 2, `tdd-orchestrator.md` = 6, and
`feature-pipeline.md` `knowledgebase_knowledgebase_search` = 2 — all three match the pre-change values
asserted by `tests/spec-orchestrator-parity.test.js:139-146, 184-190, 248-253`. No new orchestrator line
contains either banned string (CON-02).

**TEST-06 — `AGENTS.md` row.** `grep -n 'communication.instructions.md' AGENTS.md` gives one hit,
`AGENTS.md:45`: the final row of the `## Instructions Reference` table, directly after the
`HTML/CSS styling` row (`:44`) and before the blank line preceding `## Available Skills` (`:47`).

**TEST-07 — line length / heading depth.** The heading check is clean: `grep -n '^#### '` on the canonical
file returns nothing (exit 1). The length check returns **13 hits, all pre-existing baseline debt, zero new**.
Each was compared against `git show HEAD:<file>` line by line: `coder.md:28` (467 chars), `deployer.md:25`
(453), `e2e-tester.md:25` (467), `unit-tester.md:42` (505), `scope.md:52` (431), `tracker.md:24` (845) and
`:25` (553), `orchestrator.md:20` (448), `:118` (539), `:180` (411), `:214` (417), `reviewer.md:24` (534)
and `:39` (610 — `HEAD:38`, shifted one line by the T7 insertion with identical content). The canonical
file's longest line is 196 characters and the longest line added anywhere by this change is 271. The debt is
not reworded, because CON-01 forbids unrelated edits.

**TEST-08 — suites green.** `npm run test:unit` → exit 0, **26 files / 800 tests passed**, 0 failed.
`npx vitest run tests/spec-orchestrator-parity.test.js` on its own → exit 0, **1 file / 8 tests passed**.
`npx playwright test` → exit 0, **7 passed / 1 skipped** (the `tests/example.spec.ts` self-skip, the unchanged
baseline). No new failures; `tests/spec-knowledge-retrieval.test.js` and `tests/spec-kb-consolidation.test.js`
both pass inside the 26.

**TEST-09 — reviewer pass.** Performed by T9, not by this task. All five check items were assessed against
`docs/spike-communication-style.md` and the `**Communication:**` line was emitted, so the check itself passed.
It returned **3 major findings** — checklist items 1–2 were inert, `orchestrator.md:189` carried a rival gate
specification competing with the canonical block, and the slot-2 cap was unsatisfiable against "one bullet per
file" — plus **4 minor self-application defects**. The findings were deliberately **not** applied to the spike
(O-2 forbids retrofitting); they were the signal that the standard is checkable, and all seven were remediated
by T12.

**TEST-10 — smoke prompt.** Performed by T10, not by this task. A `decision-framed` agent given a plain
decision question, and **never told the format**, spontaneously produced all four slots in order with cost and
risk on every option. The probe passed with no defect, so T12 was triggered by T9's findings alone.

**TEST-02 method note (grep shape).** The plan's naive `^## Bottom line$` form matches **0** times, and that
is correct rather than a failure: both skeleton blocks are indented two spaces inside their fenced examples,
so the `^## ` anchor cannot reach them. Verification used `^ *## ` with `awk` fence-tracking (print an
indented `##` line only while inside an open fence) and confirmed the eight skeleton headings appear in slot
order 1→2→3→4, four per variant. The plain `grep '^## '` on the same file still returns exactly the eight
real section headings, so the two-space indent keeps the section list unambiguous.

**TEST-07 baseline debt (13 lines, pre-existing at `HEAD` 9caf4d4):**
`reviewer.md:24,39`; `scope.md:52`; `tracker.md:24,25`; `orchestrator.md:20,118,180,214`; `coder.md:28`;
`e2e-tester.md:25`; `unit-tester.md:42`; `deployer.md:25`. Cost of leaving them: CON-04 is not fully satisfied
in these 13 places. Risk: a future reader may read the standard's own line-length guidance as already met.
Both were accepted because CON-01 forbids rewording untouched prose, so the debt is recorded rather than paid
here; remediation belongs to a separate cleanup scope (same class as O-4).

**Close-out gap — no check samples a live reply (TEST-11, applied but never run).** TEST-01…TEST-10 prove the
standard's *shape*: eight headings, literal slots, caps, one reference line per spec, a green suite. Two of
them are one-off probes — T9's reviewer pass on a spike, T10's single smoke prompt — and neither is a gate.
Not one of them samples a reply produced inside a real pipeline, because a reply is never a file, which is
precisely the gap RISK-01 names. The plan therefore closes with that gap *recorded* and not *verified*:
TEST-11 is a proposal whose result stays unknown until one pipeline reaches `reviewer` with the T13 edit in
place — and the edit landed on 2026-11-01 while TEST-11 stayed unrun, so the gap is now a *built but unsampled*
check rather than a missing one. Cost of closing this way: the acceptance rests on the argument below, not on a
measurement. Risk: the
first pipeline to run the spot-check may fail on drift that has been shipping since 2026-11-01.

**Line map is a snapshot, not a current index.** The accepted-risk and mitigation block added 2026-11-01
(`.agents/instructions/communication.instructions.md:56-98`, 44 lines) sits inside `### Enforcement`, so every
`:NN` pointing into that file from the verification notes above lands 44 lines too high once it is below
`### Enforcement`. The headings moved: `## Violation Modes` `:56`→`:100`, `## Where This Applies` `:67`→`:111`,
`## The Envelope` `:133`→`:177`, `## Vocabulary Rules` `:231`→`:275`, `## Artifacts` `:260`→`:304`,
`## Orchestrator Normalization Block` `:293`→`:337`, `## Project Override` `:331`→`:375`. TEST-02's anchors move
with them — `:151-154`→`:195-198`, `:160`→`:204`, `:166`→`:210`, `:178-181`→`:222-225`, `:187`→`:231`,
`:193`→`:237`, `:199`→`:243`. The old numbers stay because O-2 forbids rewriting an audit record; this
paragraph is the translation. Cost: a reader holds two number sets. Risk: someone greps an unstamped number
and lands mid-paragraph.

#### Batch E close-out — T13 applied, dead-tool debt paid (2026-11-01)

The parallel batch that owned `reviewer.md` finished, so the recorded-but-unapplied T13 text was inserted at
the documented anchor and this section records the post-apply state.

| Check | Result |
|-------|--------|
| T13 insertion (verbatim) | ✅ `diff` of the inserted block against the plan's own text → identical; anchor is after the `*.md`-gate paragraph, before `1. **Slots present.**` |
| TEST-03 (reference lines) | ✅ `1` in each of the 15 files, total `15` |
| TEST-05 (parity counts) | ✅ `orchestrator.md` = 2, `tdd-orchestrator.md` = 6, `feature-pipeline.md` = 2 |
| TEST-07 (line length, agent specs) | ✅ **0** lines over 400 chars across **all 15** `*.md` under `.opencode/agents/` — the 13-line baseline debt recorded above is now **paid**, not re-recorded |
| TEST-08 (suites) | ✅ `npm run test:unit` → 26 files / 800 tests; parity 8/8; knowledge-retrieval 6/6; kb-consolidation 12/12; `npx playwright test` → 7 passed / 1 skipped |
| Dead tool references | ✅ zero. `researcher.md` carried the same GitHub-Copilot-era vocabulary already fixed in `planner.md` (`#search`, `#fetch`, `#githubRepo`, `#extensions`, `#vscodeAPI`, `#usages`, `#codebase`, `#todos`); 20 replacements now name real tools (`WebSearch`, `WebFetch`, `Grep`, `Read`, `Glob`, `TodoWrite`, `github/*`) or plain-prose intent, and the file's read-only constraint is unchanged |
| TEST-11 (live reply sample) | ⚠️ **NOT RUN.** No pipeline reply has reached `reviewer` since the edit. The check is now built; nothing has exercised it |

The 13 baseline lines named under TEST-07 were rewrapped by the same close-out pass, so CON-04 is now satisfied
in the agent specs rather than carrying a recorded exception. Cost of that: 13 historical `path:line` anchors
inside this plan's earlier notes no longer resolve to the text they quoted. Risk: a reader comparing this plan
against the files sees different line breaks in prose that was never reworded.

### Accepted deviations (recorded, not fixed)

| ID | Deviation | Why it stands |
|----|-----------|---------------|
| AMB-2 | `feature-pipeline.md` and `tdd-orchestrator.md` carry the gate clause symmetrically although they have no confirmation gates. | The clause is inert there by design; symmetric wording is what the repo's parity lessons favour and keeps the three orchestrator bullets identical. |
| — | `reviewer.md`'s checklist cites the standard's `## The Envelope` section name instead of repeating its file path. | Keeps the one-path-occurrence criterion (REQ-02 / TEST-03) true. Residual risk: renaming that heading rots the reference silently. |
| AMB-3 | The spike's "all user-facing output" wording is broader than D2's artifact rule. | The canonical file's `## Where This Applies` is authoritative: "user-facing output" means chat replies, and artifacts follow the artifact table. |
| AMB-5 | `docs/spike-communication-style.draft.md` is kept byte-identical. | Marked SUPERSEDED upstream; annotating or deleting it would edit or destroy a historical record (O-2). |
| — | 13 pre-existing over-length lines. | **No longer a deviation — resolved 2026-11-01.** All 13 were rewrapped by the Batch E close-out; the `>400`-char scan over `.opencode/agents/**/*.md` now returns zero hits. The earlier record stays above as history (O-2). |
| RISK-01 | **A live chat reply is not gated.** The five-item check fires only when a diff touches `*.md`, and reply text is never in a diff, so a reply can drop a slot or run to 90 lines and reach the reader with nothing counting it. | Accepted by decision, not by oversight, and now stated plainly in the standard with its mitigation named rather than implied (`.agents/instructions/communication.instructions.md:56-98`). Why it stands: a gate on every reply costs one check per reply, cannot block a merge, and still cannot see a reply the pipeline never relays — the same residue at a higher price. |
| O-5 | **Built 2026-11-01; unproven.** The mitigation is now in `reviewer.md` (T13 applied), so the standard no longer documents a mitigation no agent performs. TEST-11 has still never run. | Applied by the Batch E close-out once `reviewer.md` finished its parallel edits; the text was inserted byte-identically and `reviewer.md` still carries exactly one `communication.instructions.md` line. Residual risk: a built check that has never been sampled can still be wrong — the first pipeline to reach `reviewer` may fail on drift shipped since 2026-11-01, and 1/k sampling leaves most replies unchecked. |

---

## Risks & Assumptions

### Resolved implementer decisions

| ID | Question | Resolution and reasoning |
|----|----------|--------------------------|
| RD-01 | Exact reference-line wording | The seven reference-line literals plus `AGENTS-ROW` in the definitions block. All name the variant, as D9 requires. Root-agent variants use the `**Communication:**` label; `planner.md` uses `**House standard**` because it already sits under a `### Communication` heading (the label would read "Communication: …" inside "Communication"); orchestrators use `**Communication standard**` because their bullet also carries the gate clause. |
| RD-02 | Where the line goes | Immediately after the existing knowledge-retrieval reference, as a nested 3-space bullet where that reference is a numbered `## Approach` item, and as a sibling bullet where it is a bullet list (`researcher.md`) or a numbered `## Check Knowledge` list (`scope.md`). No renumbering (ALT-04). |
| RD-03 | `planner.md` placement | Inside the existing `### Communication` subsection (`planner.md:90-96`), which is the only communication-shaped section in the file and already matches the spirit of the standard. |
| RD-04 | `planner.md` dead tools (`:25-27`) | **Deferred at the time (O-4 / ALT-07), repaired 2026-11-01.** They were legacy references to retired tools, out of scope for a style standard, and repairing them then would have forced a rewrite of `## Your Capabilities & Focus` while the reviewer was meant to look at a markdown-only insertion. The Batch E close-out repaired them, plus the identical vocabulary in `researcher.md`. |
| RD-05 | `AGENTS.md` row | Inserted as the final row of the table after `HTML/CSS styling` (line 44), matching the table's existing grouping-by-topic looseness and avoiding a mid-table rewrite. Literal text is `AGENTS-ROW` in the definitions block (spike §2.2 wording, unchanged). |
| RD-06 | Reviewer checklist attachment point | New H3 `### Communication standard check` **after** the existing `## Output Expectations` bullet list, so the five items read as an addition to the existing expectations rather than a rewrite. Findings are 🔵 minor, verdict-neutral, and gated on `*.md` diffs. |
| RD-07 | Orchestrator duplication | One canonical block in FILE-01 §7, plus one pointer bullet per orchestrator spec. The bullet never restates the block. This satisfies D7 ("may normalize") without three drift-prone copies (ALT-06). |
| RD-08 | Empty slot | Keep the heading, write a single bullet `None.`. This keeps "slots present" mechanically checkable instead of making a missing heading ambiguous between "nothing to say" and "forgot the slot". |
| RD-09 | Concurrency | Single writer for shared files (T11). Batch B coders return summaries, not file edits, for the plan and memory bank (REQ-09 / CON-06). |
| RD-10 | `AGENTS.project.md` override text | The single paragraph in T1 §8, with the sync-protection and load-path evidence inline so the paragraph itself obeys the standard. |

### Ambiguities flagged for the user

| ID | Ambiguity | What the plan does | Why it is a judgement call |
|----|-----------|--------------------|----------------------------|
| AMB-1 | D12 says the `**Communication:**` line sits "alongside the existing severity summary", but does not say where inside a four-slot reply. | Places it as the **final bullet of slot 4** (`## Risks and next step`), so the reply keeps exactly four headings. | Alternative readings: a line after slot 4 (a fifth block, which conflicts with "no extra slots"), or folded into slot 3. If you prefer a fifth line after the envelope, T7's last two lines change only. |
| AMB-2 | Only `orchestrator.md` has confirmation gates, but D7/D15 bind all three orchestrator files. | All three get the identical `ORCH-LINE`, which mentions gates; in `feature-pipeline.md` and `tdd-orchestrator.md` the gate clause never fires. | Symmetric wording is what the repo's parity lessons favour (`learned-knowledge.instructions.md:348`), but a strictly literal reading could give the two pipeline files a shorter bullet without the clause. |
| AMB-3 | The spike's literal reference line says "all user-facing output", while D2 says artifacts keep their own skeletons. | Keeps the spike's literal wording and makes `## Where This Applies` in FILE-01 authoritative: "user-facing output" is read as chat replies; artifacts are governed by the artifact table. | An alternative is to append "(artifacts keep their own section skeletons)" to all 15 lines — more explicit, but it changes the transcription template the spike fixed. |
| AMB-4 | Whether the reviewer's own reply must use the envelope, which conflicts with its existing bulleted `## Output Expectations`. | Yes it must; the mapping table in FILE-01 §3 distributes the listed bullets into slots. | The other reading treats a review report as an artifact and exempts it — simpler, but then no chat reply from the reviewer would ever demonstrate the standard. |
| AMB-5 | Whether `docs/spike-communication-style.draft.md` should be deleted, annotated, or left alone after being superseded. | Left byte-identical. | Deleting it removes the decision trail; annotating it edits a historical record (O-2). The risk is mild confusion for a future reader who opens the draft first. |

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| RISK-01 | The 40-line cap and slot caps are checked by nothing except a reviewer on `*.md`; a chat reply can breach them unnoticed — and no diff ever carries a reply, so in the chat channel that check never fires at all. | Medium | Medium | Mitigation now specified: the pipeline reply spot-check — one sampled reply per pipeline, four mechanical checks S1–S4, verdict on the existing `**Communication:**` line (TEST-11, T13, O-5; `.agents/instructions/communication.instructions.md:65-98`). A sample, not a gate: 1/k coverage, and a reply never relayed to `reviewer` stays invisible. Not built yet (O-5). Promote to a committed test (ALT-08) or a CI check only if sampled fails recur. |
| RISK-02 | Agents whose `## Output Expectations` is a bullet list may keep that list as their reply structure and skip the envelope. | Medium | Medium | The mapping table in FILE-01 §3 plus explicit "the four headings are the only headings" wording; T10 tests one decision-framed agent end to end. |
| RISK-03 | `planner.md` keeps a dead tool list, so a reader meets nonsense tool names one screen above a correct style line. | Certain | Low | Documented as deferred (RD-04). Fix belongs to a separate legacy-cleanup scope. |
| RISK-04 | Seven parallel Batch B coders each follow their spec's mandatory "Document" step and write `memory-bank/activeContext.md` / `progress.md` / the plan, clobbering each other. | High if unmitigated | High | CON-06 + REQ-09 + the Batch B execution note: coders return summaries only; T11 is the single writer. |
| RISK-05 | Adding a third mention of `knowledge-retrieval.instructions.md` (or a second `knowledgebase_knowledgebase_search`) to an orchestrator spec fails `tests/spec-orchestrator-parity.test.js`. | Low | High | CON-02 bans the strings; TEST-05 asserts the counts; TEST-08 runs the suite. |
| RISK-06 | The reviewer pass (T9) finds the spike itself violates the new standard, which could be read as the standard being unusable. | Medium | Low | Expected and useful: the spike predates the standard, and O-2 forbids retrofitting. Findings are recorded, not applied. |
| RISK-07 | Line-number anchors drift if a coder re-reads a file after another edit. | Low | Low | Each anchor quotes the line text; the map says to anchor on text, not the number. |
| RISK-08 | The instruction file's own literal `## Evidence` / `## Bottom line` strings inside fenced blocks confuse a future grep-based test. | Low | Low | They sit inside fences; any future test should match outside fences, as `tests/spec-orchestrator-parity.test.js` already does for delegation blocks. |

### Assumptions

| ID | Assumption |
|----|-----------|
| ASSUMPTION-01 | The bound set is exactly 15 files — confirmed by listing `.opencode/agents/**/*.md` (12 root specs + 3 under `orchestrator/`) — matching D15 and the spike's glob evidence. |
| ASSUMPTION-02 | No other file must reference the standard. `README.md` is not updated: the `AGENTS.md` table row is the discoverability mechanism the spike settled (D6/D14), and `README.md` describes skills/counts, not instruction files. Cost: a README-only reader will not see the standard (LOW). |
| ASSUMPTION-03 | Instruction files under `.agents/instructions/` are not auto-loaded; the per-spec reference line is the load mechanism (spike §2.7, `opencode.json` has no `instructions` key). |
| ASSUMPTION-04 | `AGENTS.md` is injected regardless of config, so the new row is a findability aid, not a load path. |
| ASSUMPTION-05 | No version bump belongs to this plan: `package.json` is untouched (REQ-07) and the Husky bump script owns versioning at commit time. |
| ASSUMPTION-06 | The `docs/spike-communication-style.draft.md` file stays in the tree unmodified (AMB-5). |

---

## Related Specifications

- [`docs/spike-communication-style.md`](../docs/spike-communication-style.md) — authoritative input:
  decisions D1–D15, the envelope tables (spike §2.1), the file manifest (§2.2), vocabulary rules (§2.3),
  artifact binding (§2.4), the normalization block (§2.5), the reviewer check (§2.6), and the in-repo
  evidence for the load mechanism (§2.7).
- [`AGENTS.md`](../AGENTS.md) `## Implementation Plan Generation` — the nine-section plan template this file
  follows, and the `## Instructions Reference` table extended by T2.
- [`.agents/instructions/instructions.instructions.md`](../.agents/instructions/instructions.instructions.md)
  — frontmatter and structure rules for FILE-01.
- [`.agents/instructions/knowledge-retrieval.instructions.md`](../.agents/instructions/knowledge-retrieval.instructions.md)
  — the shared-instruction-file precedent FILE-01 mirrors, and the source of the "read and follow" line
  shape used by every reference line.
- [`.agents/instructions/markdown.instructions.md`](../.agents/instructions/markdown.instructions.md) — line
  length and heading constraints (CON-04).
