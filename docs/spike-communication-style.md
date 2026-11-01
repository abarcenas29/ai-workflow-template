---
id: "spike-communication-style"
title: "Spike: Communication Style Standard"
updated: "2026-11-01"
tags: [scope, spike, communication-style]
doc_type: "spike"
---

# Spike: Communication Style Standard

**Date:** 2026-11-01
**Status:** ✅ COMPLETE
**Produced by:** Scope - Feature Scoping

---

## 1. Problem Statement

Agent output in this template — from the orchestrator and from the research, scoping, and
implementation agents — is often explained in obtuse technical language that a reader cannot follow.
The request is a single, consistent way that findings are conveyed, anchored to one explicit reader
model: **a senior software architect with a project-manager background who does not know this
repository's internal names and does not know library trivia.** Every explanation and detail report
must be followable by that reader without opening the source.

Three named violation modes define the failure the standard exists to prevent:

1. **Unexplained jargon** — a term, acronym, identifier, or library-internal concept used without a
   gloss or an anchor the reader can follow.
2. **Unsupported claim** — an assertion about the code or its behaviour with no evidence marker
   (file path, line, command, or citation) behind it.
3. **Recommendation without cost/risk** — a proposed option or next step that does not state what it
   costs and what could go wrong.

**In scope:** one canonical instruction file, a one-line reference in all 15 agent files, one row in
`AGENTS.md`'s instruction table, a communication check in `reviewer.md`, and a fixed normalization
block at orchestrator confirmation gates.

**Out of scope:** retrofitting existing artifacts, automated lint/CI enforcement, a `GLOSSARY.md`, an
ADR for the delivery mechanism, and any `opencode.json` change.

---

## 2. Investigation Results — Decisions Settled

| # | Q | Decision | Concrete parameters | Round |
|---|----|----------|---------------------|-------|
| D1 | Q1 | **Layered instruction, not a skill** | Canonical file `.agents/instructions/communication.instructions.md` is the single source of truth; one reference line per bound agent file; one row in `AGENTS.md`'s instruction table. No new skill — a skill fires only when an agent chooses to invoke it, whereas the reference line is read every time the agent spec loads. | 1 |
| D2 | Q2 | **Governs chat replies and markdown artifacts** | Chat replies carry the full envelope. Artifacts keep their existing section skeletons; only the prose inside each section follows the standard. | 1 |
| D3 | Q3 | **Reader model and four testable rules** | Reader = senior architect / PM-literate, no repo-internal names, no library trivia. Rules: (1) every term glossed in ≤10 words on first use or anchored to a path/ADR; (2) every claim carries an evidence marker; (3) every recommendation states its cost and its risk; (4) no unexplained acronyms or library-internal vocabulary. Violations are the three modes in §1. | 1 |
| D4 | Q4 | **Coverage: every user-facing-output agent plus orchestrators** | One reference line each; the exact 15-file set was fixed by D15. | 1 |
| D5 | Q5 | **Envelope enforced structurally; prose advisory** | The four-slot envelope is a mechanically checkable requirement. The four prose rules are advisory and judged by `reviewer` on written artifacts only, never in chat. | 1 |
| D6 | Q6 | **Template-wide default** | Ships in `.agents/instructions/`; the new instruction file documents `AGENTS.project.md` as the project-level override. | 1 |
| D7 | Q7 | **Orchestrator is bound but may normalize** | It may re-frame output for the reader while preserving every file path and every finding. Scope questions stay verbatim, never paraphrased. | 1 |
| D8 | Q8 | **Envelope: four literal slots, fixed order** | `## Bottom line` / slot 2 / `## Evidence` / slot 4. Caps: 1–3 sentences / ≤8 bullets / ≤5 bullets / ≤5 bullets; 40-line chat cap. Two exemptions. Full spec in §2.1. | 2 |
| D9 | Q9 | **Two named variants in the same instruction file** | `decision-framed` and `change-framed`; slots 1 and 3 identical, slots 2 and 4 differ. Each agent's reference line names its variant. Assignment in §2.2. | 2 |
| D10 | Q10 | **Inline gloss-or-anchor; no lexicon** | Gloss ≤10 words or path anchor; identifier/path/API exemption with a one-line plain-language clause; acronyms expanded once; no `GLOSSARY.md`. Verbatim in §2.3. | 2 |
| D11 | Q11 | **Bind spikes, plans, tracker entries, ADRs, orchestrator log** | `memory-bank/*` excluded; no new sections; existing sections that match a slot are treated as that slot. Table in §2.4. | 2 |
| D12 | Q12 | **Reviewer gains a five-item communication check** | Minor severity, `*.md` diffs only, never blocking; `**Communication:** ✅ \| ⚠️ N findings` output line. Specification in §2.6. | 2 |
| D13 | Q13 | **Fixed four-line block at confirmation gates** | Then `---`, then sub-agent output verbatim; `scope` gates carry status + question count only; `## Pipeline Results` unchanged. Spec in §2.5. | 2 |
| D14 | Q14 | **No config change; one `AGENTS.md` row** | `opencode.json` and `opencode.mcp.example.json` are untouched. The reference-line count in this entry was corrected by D15. | 2 |
| D15 | Q15 | **15 reference lines — Q9's full set** | 12 root agents + 3 orchestrators. The "13" in Q14 was a count slip with no named exclusions behind it. Variant map in §2.2. | 3 |

### 2.1 The envelope — both variants

The four slots appear as **literal `##` markdown headings, in this order**. No substitutions, no
renamed slots, no extra slots.

**`change-framed`**

| Slot | Literal heading | Cap |
|------|-----------------|-----|
| 1 | `## Bottom line` | 1–3 sentences |
| 2 | `## What changed, file by file` | ≤8 bullets |
| 3 | `## Evidence` | ≤5 bullets |
| 4 | `## Risks and next step` | ≤5 bullets |

**`decision-framed`**

| Slot | Literal heading | Cap |
|------|-----------------|-----|
| 1 | `## Bottom line` | 1–3 sentences |
| 2 | `## What I found and where` | ≤8 bullets |
| 3 | `## Evidence` | ≤5 bullets |
| 4 | `## Decision and options with cost/risk` | ≤5 bullets |

Rules that apply to both variants:

- **Overall cap: 40 lines per chat reply.** Tables and verbatim quotes do not count against the 40
  lines (they still sit inside the slot they belong to).
- **Exemption 1 — multi-option decisions.** Where a decision has several options and each needs its
  own cost and risk, the slot-4 bullet cap and the 40-line cap are lifted. Without the lift a
  six-option decision could not be reported at all.
- **Exemption 2 — verbatim relays.** Where the agent relays sub-agent or user text verbatim, the
  40-line cap is lifted.
- **Both exemptions require the reply to state, in one line, that it is exceeding the cap and why.**
  An undeclared overrun is a violation; a declared one is not.
- An exemption lifts the per-slot cap on the slot it affects *and* the overall cap — otherwise it
  could not serve its purpose.

### 2.2 File manifest

**Canonical instruction file (new):** `.agents/instructions/communication.instructions.md`
Frontmatter follows `.agents/instructions/instructions.instructions.md:18-27` (`description` +
`applyTo`); mirror `.agents/instructions/knowledge-retrieval.instructions.md:1-4`, which uses
`applyTo: "**"`. The file contains: the reader model, the three violation modes, both variant
envelopes from §2.1, the vocabulary rules from §2.3, the artifact binding from §2.4, and the
`AGENTS.project.md` override note (D6). No skill is created (D1).

**Reference line (15 files, one line each).** Transcription template:

```text
- **Communication:** Read `.agents/instructions/communication.instructions.md` and follow the `<variant>` envelope for all user-facing output.
```

| # | File | Variant |
|---|------|---------|
| 1 | `.opencode/agents/scope.md` | `decision-framed` |
| 2 | `.opencode/agents/researcher.md` | `decision-framed` |
| 3 | `.opencode/agents/architect.md` | `decision-framed` |
| 4 | `.opencode/agents/implementer.md` | `decision-framed` |
| 5 | `.opencode/agents/designer.md` | `decision-framed` |
| 6 | `.opencode/agents/planner.md` | `decision-framed` |
| 7 | `.opencode/agents/coder.md` | `change-framed` |
| 8 | `.opencode/agents/unit-tester.md` | `change-framed` |
| 9 | `.opencode/agents/e2e-tester.md` | `change-framed` |
| 10 | `.opencode/agents/reviewer.md` | `change-framed` |
| 11 | `.opencode/agents/deployer.md` | `change-framed` |
| 12 | `.opencode/agents/tracker.md` | `change-framed` |
| 13 | `.opencode/agents/orchestrator/orchestrator.md` | `change-framed` |
| 14 | `.opencode/agents/orchestrator/feature-pipeline.md` | `change-framed` |
| 15 | `.opencode/agents/orchestrator/tdd-orchestrator.md` | `change-framed` |

Placement: for the 12 root agents, next to the existing `.agents/instructions/` reference (the
pattern cited in §2.7). The three orchestrator files have no such self-reference line today, so their
line is new and belongs in their rules/guidelines section.

**`AGENTS.md` row.** Add one row to the Instructions Reference table (`AGENTS.md:27-44`):

```markdown
| Communication style | `.agents/instructions/communication.instructions.md` |
```

This row is a discoverability aid only — `AGENTS.md` is auto-injected regardless of config (§2.7).

**`reviewer.md`.** Five-item check added to `## Output Expectations` (`reviewer.md:40-47`) plus the
`**Communication:**` output line — full specification in §2.6.

### 2.3 Vocabulary rules (verbatim, as settled by Q10)

- **Inline parenthetical gloss on first use (≤10 words) OR an anchor to a path/line.** One of the
  two, on first appearance.
- **No lexicon file.** There is no vocabulary list to maintain.
- **Code identifiers, file paths, and API names are exempt from glossing** but must be followed by a
  one-line plain-language clause on their first appearance in prose.
- **Acronyms are expanded once**, even inside paths.
- **No `GLOSSARY.md` is created by this change.** Glossary ownership stays with
  `.agents/config/domain.md` and is exercised lazily.

### 2.4 Artifact binding

| Artifact | Bound? | How it applies |
|----------|--------|----------------|
| Spike docs (`docs/spike-*.md`, `docs/spikes/*.md`) | Yes | Existing sections play the slots. The decision/recommendation section is the bottom line; Investigation Results carries the evidence. |
| Plans (`plan/*.md`) | Yes | The mandated 9-section order is untouched. Prose inside Introduction / Implementation Steps / Testing / Risks & Assumptions follows the standard. |
| `docs/tracker-log.md` | Yes | `### Summary` is the bottom line; Files Produced/Modified, Verification Results, and Key Decisions/Notes cover the remaining slots. |
| `docs/<feature>/<agent>.md` | Yes | Same rule as tracker entries: existing headings only. |
| ADRs (`docs/adr/*.md`, and the existing flat `docs/adr-*.md`) | Yes | Decision is the bottom line; Context and Consequences carry evidence and risk. |
| `docs/.orchestrator-log.md` | Yes | Step entries and the final status line follow the standard; the log's structure does not change. |
| `memory-bank/*.md` | **No** | Excluded — these files are rewritten for agent retrieval, not for the reader model; binding them would fight `.agents/instructions/memory-bank.instructions.md`. |

**Rule:** no new sections are added to any artifact. An existing section that already matches a slot
is treated as that slot — the two settled examples are the spike's decision section = bottom line and
the tracker's `### Summary` = bottom line. Where no section matches, the prose inside existing
sections follows the standard.

### 2.5 Orchestrator normalization block

At every confirmation gate (`researcher`, `implementer`, `scope` — `orchestrator.md:20`,
`:188-194`), the orchestrator emits exactly this, in this order:

```markdown
**Bottom line:** <one sentence>
**Files:** <paths, verbatim>
**Blocker:** <none, or what is needed>
**Next:** <one step>
---
<sub-agent output, verbatim and unmodified>
```

- Four bold lines in that fixed order, then a `---` rule, then the sub-agent's output **verbatim**.
  No re-authoring, no paraphrase, no summary replacing the output.
- Every file path and every finding survives the normalization.
- **`scope` gates:** the block carries status and question count only — bottom line = status plus
  "N questions", Files = the draft path, Next = "answer Q1–QN". The questions themselves follow
  **unmodified**. The orchestrator never answers, edits, or reorders them.
- **The final `## Pipeline Results` table is unchanged** (`orchestrator.md:273-286`). No Communication
  column, no extra line, no new field.

### 2.6 Reviewer communication check

Added to `reviewer.md` `## Output Expectations` (`reviewer.md:40-47`). Five items — derived directly
from D3 and D8, not a new decision:

1. **Slots present.** The four headings for the producer's variant appear, literally, in the fixed
   order.
2. **Caps respected.** 1–3 sentences / ≤8 bullets / ≤5 bullets / ≤5 bullets, and ≤40 lines overall —
   or the overrun is declared, with a reason that is one of the two exemptions.
3. **Vocabulary.** Every term is glossed in ≤10 words or anchored to a path/line on first use;
   identifiers, paths, and API names are followed by a one-line plain-language clause.
4. **Evidence.** Every claim carries an evidence marker.
5. **Cost and risk.** Every recommendation states both.

Output line, alongside the existing severity summary:

```markdown
**Communication:** ✅ | ⚠️ N findings
```

- Findings are **🔵 minor**, never blocking — the review verdict does not change because of them.
- The check runs **only when the diff touches `*.md`**.
- Verification for this change: one reviewer pass on this spike document plus one smoke prompt, both
  in the same change.

### 2.7 In-repo evidence

**No `instructions` key in the root config.** `opencode.json:1-78` has exactly three top-level keys —
`$schema` (`:2`), `mcp` (`:3`), and `permission` (`:68`). There is no `instructions` array, so
`.agents/instructions/*.instructions.md` files are never auto-loaded by the root config. The
consumer-facing example is different and does not help here: `opencode.mcp.example.json:3` declares
`"instructions": ["AGENTS.project.md"]` — one project-owned file, not the instruction directory.

**Existing reference-line precedent (this is the load mechanism).** Because nothing auto-loads the
instruction directory, the working pattern is a one-line "read and follow" reference inside the agent
spec, so the rule loads whenever that spec is read:

- `.opencode/agents/researcher.md:72` — "Read `.agents/instructions/knowledge-retrieval.instructions.md`
  and follow the 3-layer knowledge-retrieval protocol"
- `.opencode/agents/reviewer.md:24` — same line as step 0 of `## Approach`
- `.opencode/agents/implementer.md:27-28` — memory-bank line plus the knowledge-retrieval line
- `.opencode/agents/tracker.md:24`, `.opencode/agents/coder.md:28`,
  `.opencode/agents/architect.md:26-27`, `.opencode/agents/designer.md:32-33`,
  `.opencode/agents/deployer.md:25`, `.opencode/agents/unit-tester.md:42`,
  `.opencode/agents/e2e-tester.md:25`, `.opencode/agents/scope.md:260` — same shape.

`AGENTS.md` is a separate case: it is injected as added instructions to the session even with no
`instructions` key, which is why its table row (§2.2) is a discoverability aid rather than the load
mechanism.

**Distribution is whole-directory, so no packaging work is needed.** `scripts/sync.js:570` collects
every file under `.agents/` (`const sourceFiles = collectFiles(sourceAgentsDir)`) and the loop at
`:579-594` copies each one with hash tracking — a new
`instructions/communication.instructions.md` therefore reaches every consumer automatically.
`scripts/sync.js:614-637` does the same for `.opencode/` (`collectFiles(sourceOpenCodeDir)`), so the
15 edited agent files also ship. The only exclusions are explicit: `scripts/sync.js:18-20` excludes
`instructions/learned-knowledge.instructions.md`, and `:29-37` protects `AGENTS.project.md`,
`opencode.json`, `.prettierignore`, and `.agents-sync-ignore` as project-owned. None of them is the
new file.

**Agent file count is 15.** A recursive glob of `.opencode/agents/**/*.md` returns exactly 15 paths:
12 under `.opencode/agents/` (`architect`, `coder`, `deployer`, `designer`, `e2e-tester`,
`implementer`, `planner`, `researcher`, `reviewer`, `scope`, `tracker`, `unit-tester`) and 3 under
`.opencode/agents/orchestrator/` (`orchestrator`, `feature-pipeline`, `tdd-orchestrator`). This is the
count D15 settles; Q14's 13 matches no subset of the directory.

**Supporting precedents.** The only existing plain-language guidance is the tracker guideline
`.opencode/agents/tracker.md:65` ("Write in plain English — docs are for human readers, not agents")
and the `{2-3 sentence plain-English summary}` placeholder in the standalone-tracking block of ten
agent files — a one-liner with no rubric, which is why a standard is needed. The orchestrator's final
report already has the envelope's shape bottom-line-first with the next step last
(`orchestrator.md:273-286`), so D13 maps onto existing output with no restructuring. The instruction
directory currently holds 22 `.agents/instructions/*.instructions.md` files.

---

## 3. Open / Deferred Questions

| # | Question | Why deferred | Reopens when |
|---|----------|--------------|--------------|
| O-1 | ADR recording the delivery-mechanism decision (instruction over skill; template-wide default) | The repo's only ADR is flat at `docs/adr-knowledgebase-pgvector.md` titled `ADR-001`, which does not match the `docs/adr/0001-slug.md` convention in `.agents/config/domain.md:13-17`. Numbering and location must be settled before a second ADR is written. | A second ADR is requested, or the ADR layout is normalized. |
| O-2 | Migration of existing artifacts (retrofitting old spikes, plans, tracker entries) | The standard applies to output produced after it lands; rewriting historical records would erase the audit trail. | Someone asks for a backfill, or an old artifact is re-opened for editing. |
| O-3 | Automated enforcement (lint script, CI check) | D5 settled that the envelope is *mechanically checkable*, not that a machine checks it. The reviewer pass is the enforcement for now. | A CI quality gate is proposed, or reviewer findings show repeated drift. |
| O-4 | Whether `planner.md` (legacy, `mode: primary`, references retired tools at `planner.md:25-27`) should be retired | Out of scope for a communication standard; it is bound by D15, nothing more. | A separate cleanup of legacy agents is scoped. |

---

## 4. Decision / Recommendation

**Recommended next step:** `implementer`

Every branch of the design tree is settled (Q1–Q15), the envelope is specified down to literal
headings and caps, the file manifest names all 16 touched paths with a variant each, and no external
evidence is required — the four load/distribution questions were answered from the repository itself
(§2.7). The implementer should plan directly from this document; `researcher` adds nothing here.

---

## 5. External Resources

None — no external sources were used. All evidence is in-repo and cited in §2.7. The cross-project
knowledgebase was unavailable during scoping (`DATABASE_URL` not configured), and memory-bank search
returned no prior decision about output style.

---

## 6. Decision Trail

| When | Action | Result |
|------|--------|--------|
| Round 1 | Asked Q1–Q7 (mechanism, scope, reader model, coverage, enforcement, distribution, orchestrator) | All settled |
| Round 2 | Asked Q8–Q14 (envelope, variants, vocabulary, artifact binding, reviewer, orchestrator block, load guarantee) | All settled; Q9/Q14 cardinality conflict surfaced |
| Round 3 | Asked Q15 (reference-line set) | Settled at 15 files; Q14's "13" superseded |
| Round 3 | Recomputed frontier | Empty — 15/15 settled, no prototype requests |

**Status history:** `drafting` → `complete` on 2026-11-01.
