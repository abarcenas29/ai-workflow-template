---
description: "Communication standard for agent output — reader model, violations, envelope variants, artifact binding"
applyTo: "**"
---

# Communication Standard

This file is the single source of truth for how agents in this template
talk to the reader. No configuration auto-loads it — the root settings file
(`opencode.json`) has no `instructions` key, only `$schema`, `mcp`, and
`permission` (`opencode.json:2,3,68`) — so each agent spec (the markdown file
that defines one agent, under `.opencode/agents/`) carries a one-line
reference that loads this file, and the `AGENTS.md` table row pointing here is
a findability aid, not a load path. Markdown artifacts keep their existing
section skeletons; only the prose inside those sections follows these rules.

## Reader Model

Write for exactly one reader: a senior software architect with a
project-manager background who does not know this repository's internal names
and does not know library trivia.

The acceptance question for every explanation is: *Could this reader follow
the explanation without opening the source?*

Four rules follow from that question:

1. Every term is glossed in ≤10 words on first use, or anchored to a path/ADR
   (an architecture decision record, one decision per file) the reader can
   open.
2. Every claim carries an evidence marker.
3. Every recommendation states its cost and its risk.
4. No unexplained acronyms and no library-internal vocabulary.

### Enforcement

The four-slot envelope (a fixed four-heading reply shape; see `## The
Envelope`) is structural, and what is checked is the text `reviewer` can
actually see: items 1–2 (slots, caps) apply to a reply — the reviewer's own,
and any agent reply quoted verbatim in the diff — and items 3–5 (vocabulary,
evidence, cost and risk) to the artifact prose in the diff. The four rules
above are advisory and judged by `reviewer` — the review agent,
`.opencode/agents/reviewer.md` — on written artifacts only, never on a live
chat reply, which no gate sees.

Why the split: a chat reader can interrupt and ask, while an artifact is read
later by someone who cannot. Cost of the split — a live chat reply can break
all four rules and no gate catches it. Risk accepted — the alternative asks
`reviewer` to audit text it never sees, so the check would be theatre.
`reviewer` runs a five-item check (slots, caps, vocabulary, evidence, cost and
risk) and records `**Communication:** ✅` or `**Communication:** ⚠️ N findings`
as the last bullet of slot 4 in its own reply
(`.opencode/agents/reviewer.md`, `### Communication standard check`). Those
findings are minor and never change the review verdict.

**Accepted risk — a live chat reply is never in a diff.** The five-item check
runs only when a diff touches `*.md` (`plan/process-communication-standard-v1.md`,
`### Risks`, RISK-01), and a reply read in chat is not a file, so no diff
carries it. A reply that drops a slot heading, or runs to 90 lines, therefore
reaches the reader with nothing counting it. This is accepted, not gated: a
check on every reply costs one check per reply, on a rule that can never block
a merge, and still cannot see a reply the user saw that the pipeline never
relayed to the reviewer.

**Mitigation — the pipeline reply spot-check.** One reply is checked per
pipeline, not per message, by `reviewer`
(`.opencode/agents/reviewer.md`, `### Communication standard check`), once per
pipeline at the review stage, on every pipeline that reaches the reviewer —
deliberately not gated on `*.md`, because that gate is the hole. The sample is
chosen by rule, not by judgement, and four checks run on it: **S1** take the
earliest upstream reply in the reviewer's context and name it by stage and
agent, falling back to the reviewer's own reply when no upstream reply is
visible; **S2** count its lines, excluding fenced tables, verbatim quotes, and
an exemption declaration, and pass at ≤40; **S3** confirm the producer's four
literal headings for its variant (`### Variant assignment` has the mapping)
appear in order 1→2→3→4, each a whole line, with no fifth `##` heading; **S4**
confirm `**Communication:**` appears exactly once, as the last bullet of slot 4.
The result is recorded by extending that same line —
`**Communication:** ✅ spot-check pass (implementer, stage 3)` — plus one
`## Evidence` bullet carrying the line count, so no slot, no file, and no stage
is added. A fail is a 🔵 minor finding against the producing agent, with the
sample quoted by reference rather than pasted, and it blocks nothing: the
verdict stays untouched, exactly as with the other communication findings.
State of the mitigation: this paragraph is the specification; the matching
instruction landed in `.opencode/agents/reviewer.md` (T13, 2026-11-01) but has
never run on a live pipeline reply (TEST-11, never run), so the behaviour is
specified and unproven and the risk above stays live pending one sampled pass.

Cost of the spot-check: one read and four counts per pipeline, with no new
agent, no new stage, no CI job, and no committed test (automated enforcement
stays deferred, ALT-08). Residual risk — a sample is not a gate: with k replies
in a pipeline the sample covers 1/k, so drift on an un-sampled reply stays
undetected; a reply produced before the review stage and never relayed into the
reviewer's context sits outside the sample frame; and when the reviewer samples
its own reply, a fail is caught before sending, which is correction rather than
detection. Accepted on the same ground as the risk above: the cheap check
catches shape drift on a sample, while a per-reply gate would cost the whole
pipeline's reply volume and still miss every reply the pipeline never relays.

## Violation Modes

Every wording failure in this template is one of three modes, and each has a
mechanical fix.

| # | Mode | What it looks like | Fix |
|---|------|--------------------|-----|
| 1 | Unexplained jargon | A term, acronym, identifier, or library-internal concept with no gloss and no anchor | Gloss in ≤10 words or anchor to a path/line |
| 2 | Unsupported claim | An assertion about the code or its behaviour with no evidence marker | Add a path, line, command, or citation |
| 3 | Recommendation without cost/risk | A proposed option or next step that does not say what it costs and what could go wrong | State both, in the same bullet |

## Where This Applies

The standard binds chat replies in full, and reaches markdown artifacts
through their prose only.

- Chat replies carry the full envelope: all four slots, fixed order, caps
  respected.
- Markdown artifacts keep their existing skeletons and only their prose
  follows these rules (see `## Artifacts`).
- `memory-bank/*.md` (the agent context store) is excluded (see `## Artifacts`).

### Mapping spec content onto the slots

Most agent specs list their expected output as a bullet list rather than as
slots. That list is a set of content requirements, not a structure: put each
item into the slot that matches its kind, and the spec's own wording still
decides what must appear.

| Spec-listed content | Slot |
|---------------------|------|
| The outcome in one paragraph | `## Bottom line` |
| Files reviewed, files created or changed | `## What changed, file by file` |
| What was examined and what was found (the findings behind the change) | decision-framed slot 2, `## What I found and where` |
| Measurements, citations, proofs, `path:line` references | `## Evidence` |
| Options, trade-offs, risks, follow-ups, the verdict, the next action | slot 4 (`## Risks and next step` / `## Decision and options with cost/risk`) |

The four headings are the only headings in a reply; the bullets above are
content requirements, placed into the slot that matches their kind.

### Variant assignment

Each agent spec names exactly one variant in its reference line; no spec names
both, and no spec leaves the name out — the invariant is mechanical:
`grep -c 'communication.instructions.md'` returns `1` for each of the 15 files
under `.opencode/agents/` (`plan/process-communication-standard-v1.md:478`,
TEST-03).

| # | Agent spec | Variant |
|---|------------|---------|
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

Six specs decide, nine report a change — the split follows what the agent's
last act is, and it is settled in `docs/spike-communication-style.md:116-132`.
Cost of repeating the list here: it duplicates the 15 spec files and drifts if
an agent is added or renamed. Risk: a reader trusts this table over a spec's
own line, so treat the spec's line as authoritative for that agent and this
table as the map. Drift is caught two ways: the `reviewer` communication check
reads this table against the specs whose `.md` files appear in a diff, and the
per-file `grep -c 'communication.instructions.md'` static check (TEST-03,
`plan/process-communication-standard-v1.md:478`) proves every spec still carries
exactly one reference line.

## The Envelope

Every chat reply is four literal `##` headings, in a fixed order, with no
renaming, no substitutions, and no extra slots.

If a slot has nothing to report, keep the heading and write a single bullet
`None.` — never drop the heading. A dropped heading is indistinguishable from
a forgotten one, so the reviewer's check could not tell "nothing to say" from
"broke the format".

### change-framed

For work that landed a change: code, a config, a document, a deployment. Slot
2 answers "what moved", slot 4 answers "what could this break and what happens
next".

| Slot | Literal heading | Cap |
|------|-----------------|-----|
| 1 | `## Bottom line` | 1–3 sentences |
| 2 | `## What changed, file by file` | ≤8 bullets |
| 3 | `## Evidence` | ≤5 bullets |
| 4 | `## Risks and next step` | ≤5 bullets |

  ```markdown
  ## Bottom line
  One to three sentences: the outcome, in the reader's terms.

  ## What changed, file by file
  - `path/to/file.ext:12-40` — what changed there, in one plain sentence.

  ## Evidence
  - `command that ran` — what it printed, in one line.

  ## Risks and next step
  - Risk: what could break, and who notices. Next: the one action to take.
  ```

### decision-framed

For work that ends in a choice: research findings, a scope verdict, a design
option, an implementation strategy. Slot 2 answers "what did you find", slot 4
answers "what should we do, and what does each option cost".

| Slot | Literal heading | Cap |
|------|-----------------|-----|
| 1 | `## Bottom line` | 1–3 sentences |
| 2 | `## What I found and where` | ≤8 bullets |
| 3 | `## Evidence` | ≤5 bullets |
| 4 | `## Decision and options with cost/risk` | ≤5 bullets |

  ```markdown
  ## Bottom line
  One to three sentences: the recommendation, and what it buys.

  ## What I found and where
  - `path/to/file.ext:12-40` — the finding, and what it means for the choice.

  ## Evidence
  - `command that ran` — what it printed, in one line.

  ## Decision and options with cost/risk
  - Option A (recommended): cost — …; risk — …. Option B: cost — …; risk — ….
  ```

### Rules common to both variants

- Overall cap: 40 lines per chat reply.
- Tables and verbatim quotes do not count toward the 40 lines, but stay inside
  the slot they belong to.
- Caps are maxima; slot 1 is a range of 1–3 sentences.
- Slots and their order are identical in both variants except slots 2 and 4.

Cost of the 40-line cap: a change too large to describe in 40 lines pushes
detail into a linked artifact, and the reply can only point at it. Risk of the
uncounted-tables rule: a reply could hide a 60-row table inside slot 2 and
still be 40 lines on paper — which is why the per-slot bullet caps, not the
line count, are the real guard.

### Exemptions

- **Exemption 1 — multi-option decisions.** When a decision has several
  options and each needs its own cost and risk, the slot-4 bullet cap and the
  40-line cap are lifted. Without the lift, a six-option decision could not be
  reported at all.
- **Exemption 2 — verbatim relays.** When relaying sub-agent (an agent the
  orchestrator launched for one step) or user text verbatim, the 40-line cap
  is lifted.
- Both exemptions require one line stating that the reply exceeds the cap and
  which exemption applies. An undeclared overrun is a violation; a declared
  one is not.
- An exemption lifts the per-slot cap on the slot it affects and the overall
  cap.

Risk of exemption 1: it is the widest hole in this standard, because "several
options" is a judgement call and a bloated slot 4 can always claim it. The
declaration line is what makes the claim reviewable — it names the exemption,
so a reviewer can disagree with the claim itself, not only with the length.

## Vocabulary Rules

Vocabulary is the largest single source of the jargon violation, so it gets
fixed rules rather than advice.

- **Inline parenthetical gloss on first use (≤10 words) OR an anchor to a
  path/line.** One of the two, on first appearance.
- **No lexicon file.** There is no vocabulary list to maintain.
- **Code identifiers, file paths, and API names are exempt from glossing** but
  must be followed by a one-line plain-language clause on their first
  appearance in prose.
- **Acronyms are expanded once**, even inside paths.
- **No `GLOSSARY.md` is created.** Glossary ownership stays with
  `.agents/config/domain.md` (`:15-17`) and is exercised lazily, only once a
  term is actually settled.

`Good:` The sync command copies every file under `.agents/` (the shared
instructions and config shipped to every consumer) that the project does not
own, so a new file there needs no manifest change —
`scripts/sync.js:570,579-594`.

`Bad:` The sync command copies the files, so a new file there needs no
manifest change.

Cost of the gloss rule: prose gets longer, roughly a parenthetical per new
term. Risk of the identifier exemption: an identifier followed by a vague
clause ("the scheduler") reads as a gloss but explains nothing, so the clause
must name the effect, not the category.

## Artifacts

Artifacts are bound, but only in their prose: every existing section skeleton
stays exactly as it is, so a reader who knows the format is never surprised by
a new section.

Five of the artifact kinds are working documents this template writes, and
knowing what each is makes the table readable: a spike (a scope note recording
settled and deferred decisions), a plan (a step-by-step build order), a
tracker entry (a per-agent record of what one pipeline step produced), an ADR,
and the orchestrator log (a run log of one pipeline).

| Artifact | Bound? | How it applies |
|----------|--------|----------------|
| Spike docs (`docs/spike-*.md`, `docs/spikes/*.md`) | Yes | Existing sections play the slots. The decision/recommendation section is the bottom line; Investigation Results carries the evidence. |
| Plans (`plan/*.md`) | Yes | The mandated 9-section order is untouched. Prose inside Introduction / Implementation Steps / Testing / Risks & Assumptions follows the standard. |
| `docs/tracker-log.md` | Yes | `### Summary` is the bottom line; Files Produced/Modified, Verification Results, and Key Decisions/Notes cover the remaining slots. |
| `docs/<feature>/<agent>.md` | Yes | Same rule as tracker entries: existing headings only. |
| ADRs (`docs/adr/*.md`, and the existing flat `docs/adr-*.md`) | Yes | Decision is the bottom line; Context and Consequences carry evidence and risk. |
| `docs/.orchestrator-log.md` | Yes | Step entries and the final status line follow the standard; the log's structure does not change. |
| `memory-bank/*.md` | **No** | Excluded — these files are rewritten for agent retrieval, not for the reader model; binding them would fight `.agents/instructions/memory-bank.instructions.md`. |

No new sections are added to any artifact. An existing section that already
matches a slot is treated as that slot — the settled examples are the spike's
decision section as bottom line and the tracker's `### Summary` as bottom
line. Where no section matches, the prose inside existing sections follows the
standard.

Cost of that rule: artifacts written before this standard keep their old
prose, so a reader meets two dialects in the same directory. Risk: no backfill
leaves the audit trail intact, which is the point — rewriting a historical
record to match a later style would falsify it.

## Orchestrator Normalization Block

This section is the only copy of the block; orchestrator specs carry a pointer
to it, never a duplicate, because three copies drift and any edit would need
three synchronized changes.

When: at every confirmation gate — the pause where an `orchestrator` (the
agent that runs a multi-agent pipeline and delegates to the others) stops and
waits for the user before the next stage. The gates default to `researcher`,
`implementer`, and `scope` (`orchestrator.md:20`, `:188-194`). The
orchestrator emits exactly this, in this order:

```markdown
**Bottom line:** <one sentence>
**Files:** <paths, verbatim>
**Blocker:** <none, or what is needed>
**Next:** <one step>
---
<sub-agent output, verbatim and unmodified>
```

- Four bold lines in that fixed order, then a `---` rule, then the sub-agent's
  output verbatim — no re-authoring, no paraphrase, no summary replacing the
  output.
- Every file path and every finding survives the normalization.
- `scope` gates: the block carries status and question count only — bottom
  line = status plus "N questions", Files = the draft path, Next = "answer
  Q1–QN". The questions follow unmodified; the orchestrator never answers,
  edits, or reorders them.
- The final `## Pipeline Results` table is unchanged
  (`orchestrator.md:273-286`): no Communication column, no extra line, no new
  field.

Cost: the orchestrator cannot compress a rambling report, so the reader may
see length the orchestrator is not allowed to fix. Risk: a relay is a copy
operation, so a truncated relay silently loses a finding — which is why "every
finding survives" is stated as a rule and not as a suggestion.

## Project Override

`AGENTS.project.md` is the project-owned override. A project that wants a
different house style replaces this standard there: write the replacement
rules in `AGENTS.project.md`, state which sections of this file they supersede,
and that project's agents follow the replacement. The override is durable
because sync never overwrites or prunes `AGENTS.project.md`
(`scripts/sync.js:29-37` lists it in `projectOwnedPaths`), and it is loaded
because consumers declare `"instructions": ["AGENTS.project.md"]` in
`opencode.json` (the shipped default is `opencode.mcp.example.json:3`). Where
the two conflict, `AGENTS.project.md` wins; where it is silent, this file
applies.
