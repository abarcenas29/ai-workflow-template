---
goal: "Cut the token cost per unit of completed work in the three orchestrators by inlining coder slices, collapsing the per-spawn read set, replacing prose step summaries with a five-line report, and ordering the prompt for a stable cache prefix."
version: 2
revision: R2
date_created: 2026-11-08
date_updated: 2026-11-08
status: Planned
tags: [refactor, orchestrator, token-cost, prompt, delegation, agents, idempotence, session-continuity]
---

# Refactor — Orchestrator Token Cost (v1)

## Introduction

**Status:** 🟡 Planned

Researcher (step 1 of 3, 2026-11-08) compared this repo's three orchestrators and twelve root
agent specs against the DeepSeek "Super-agent" architecture (`dsh-superagent`, 2026-10-31).
Its load-bearing finding was that the gap is *duration, not topology*: this repo has the same
fan-out shape and stronger verification. The cost problem is not the shape; it is what each
spawn is made to read and what each step re-emits.

Settled before planning (do not re-open): the pipeline shape is correct; the single
optimisation target is **token cost per unit of completed work**; no new agent, no new
orchestrator, no size-based selector, no verification gate, no durable run journal.

This plan applies four levers to the prompt text:

| Lever | Change | Net effect |
|---|---|---|
| **L1** | Every parallel-coder delegation carries a five-field task slice inline; the coder is forbidden to read the plan. | Removes N full-plan reads per batch. |
| **L2** | The ~5–6 per-spawn instruction reads collapse to the agent spec plus at most one conditional file, with both protocols carried inline in the digest. | Removes ~2–6 KB of file input per spawn. |
| **L3** | Prose step summaries become a fixed five-line report; confirmation gates relay those five lines instead of re-emitting prose. | Removes the longest repeated text in a run. |
| **L4** | Static delegation body first, per-step slice second, per-run digest last; the static body is frozen mid-run. | Maximises the cacheable prefix across spawns. |

Two secondary items ride along because they are cost levers, not robustness work: a three-class
failure taxonomy (W5, re-run elimination) and an optional soft `TOKEN BUDGET` (W6). One further
batch (W8) is **optional** and marked as such; nothing depends on it.

Scope is the prompt and the specs that back it. No written analysis ships, no runtime is
instrumented, no paid API call is made. The proof for every saving is a deterministic byte
count of delegation prompts against two fixtures, with the pre-edit baselines recorded in
[Byte Measurement Baselines and Targets](#byte-measurement-baselines-and-targets).

### Amendment R2 — 2026-11-08

Six behaviours were settled by the user after R1 was written. They are recorded here as
requirements, not as options: A1 failed-step session continuity, A2 `stepKey` + `attempt`
idempotence, A3 the `observe` pipeline mode, A4 digest field caps, A5 the `deferred` status,
A6 the spec-drift notice. None is re-litigated and no seventh is added.

| ID | Behaviour | Why it is a cost lever |
|---|---|---|
| A1 | A failed or blocked delegation surfaces its `sessionID` in the gate text and the log line, so the user resumes that session instead of re-spawning. | A re-spawn pays for the agent spec, the instruction set, and the work already done a second time. |
| A2 | Every delegation carries `stepKey` (pipeline + step + task ID) and `attempt`, and instructions to continue from artifacts that already exist. | The single largest saving on the board: a re-run by whole pipeline pays every delegation again. **Highest-priority item: proven first, by TEST-14 inside T24, before T16's gate.** |
| A3 | `pipelineMode: observe \| confirm \| auto`. In `observe` the orchestrator prints the ordered steps and the exact delegation prompts and stops. | Prices a pipeline before any delegation input is paid for. Non-executing by default. |
| A4 | `previous` ≤ 40 words, `QUESTIONS` ≤ 3 items, `ARTIFACTS` paths only, every other field one line. Silent in the report, one log line per cut. | Bounds the only digest field with no natural ceiling. |
| A5 | `STATUS` gains `deferred`; a deferred step is parked, the pipeline continues with independent steps, Step 6 lists it, no retry. | A dependency stall stops being billed as a failure and a re-run. |
| A6 | At each step boundary the orchestrator hashes the spec the step will run and logs one line on change. | Makes drift visible for one line instead of a cancelled run. |

R2 adds seven tasks (T19–T25) in two new batches (I, J). **No existing task ID is renumbered and
no existing task changes batch**; T16's dependency set is extended so it stays the single
verification gate. Batch H (T17, T18) stays optional and unamended.

The six behaviours are not free. Their measured net effect is **+188 B on every delegation** and
**+3,668 B of prose per run**, which takes the six-coder batch from 73.6% to **64.8%** and
therefore **fails the R1 ≥70% batch target**. That target is what this amendment gives up — the
feature does not. See [R2 Net Byte Accounting](#r2-net-byte-accounting) for the numbers and the
fixture, and [R2 Contract Interactions](#r2-contract-interactions) for the five collisions this
amendment has to resolve.

The file keeps the `-v1` name because the R2 amendment is applied in place; `version` bumped to
`2` and `revision` is `R2`.

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1 | No (single) | — |
| B | T2, T3, T4, T5, **T19** | Yes | A |
| C | T6, T7, T8 | Yes | B |
| D | T9, T10, T11, T12 | Yes | A, B |
| E | T13 | No (single) | A, C |
| F | T14, T15 | Yes | B |
| **I** | **T20, T21, T22** | **Yes** | **C, T19** |
| **J** | **T23, T24, T25** | **Yes** | **E, I** |
| G | T16 | No (single) | A–F, **I, J** |
| H (OPTIONAL) | T17, T18 | No — awaiting user go/no-go | C |

Batch B rewrites one orchestrator per task, so no two tasks in a batch touch the same file.
T19 joins Batch B because `step-report.md` collides with nothing in it and needs only T1.
Batch C is the second pass over the same three files and therefore cannot start until its own
file's Batch-B task is done. Batch I is the R2 pass over those same three files, so it must
follow C. Batch J holds the three R2 files that are not orchestrator specs — the communication
standard, the new contract test, and the byte harness — and none of them collides. Batch G runs
last and now depends on I and J as well, so a single T16 run covers R1 and R2. Batch H is
optional and **no task anywhere depends on it**.

Batch I and Batch J are the only two new batches. Nothing in Batches A–F changes batch.

## Requirements & Constraints

### Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| REQ-01 | Every parallel-coder delegation in all three orchestrators carries `TASK ID`, `DESCRIPTION`, `FILES`, `DEPENDS ON`, `SIBLINGS` inline, and states that the plan is not the coder's to read. | W1, D-5 |
| REQ-02 | A spawn reads its own agent spec plus at most one conditional file; both the knowledge-retrieval protocol and the documentation-handoff contract are carried inline. | W2 |
| REQ-03 | `.agents/config/step-report.md` declares exactly five lines — `STATUS`, `ARTIFACTS`, `QUESTIONS`, `HANDOFF`, `TOKENS` — and is wired into all delegation templates, the log step, the confirmation gate, and one line in each of the twelve root specs. | W3 |
| REQ-04 | The four-slot envelope and the 40-line cap are respected by placing the five lines inside an existing slot or under Exemption 3; no new exemption is created. | W3 |
| REQ-05 | All three orchestrators state the cache layout: static body first, per-run values last, static body frozen mid-run. | W4 |
| REQ-06 | A failed step is classified transient / substantive / ambiguous; transient retries up to 3 with backoff; substantive stops; ambiguous stops and asks. | W5 |
| REQ-07 | `tokenBudget` is optional with no default, appears as a digest line, warns once when a step's share is exceeded, and never halts. | W6, D-7 |
| REQ-08 | The tracker consumes the structured step reports and reads `docs/.orchestrator-log.md` only when a report is missing. | W7 |
| REQ-09 | Every claimed saving has a deterministic byte measurement attached, with pre-edit and post-edit counts and a non-vacuity run. | D-6 |
| REQ-10 | `shell` grants in the three orchestrators narrow to the probe commands; `edit: *.md` stays (log + handoff transcription are real writes). | W8(a), optional |
| REQ-11 | `tdd-orchestrator.md` stops hardcoding a coverage threshold and reports `GATES: NOT DECLARED` when the declaration carries none. | W8(b), optional |
| REQ-12 | The `feature-pipeline.md` mtime scan is removed and folded into REQ-01 rather than fixed in place. | W8(c) |
| REQ-13 | Every delegation returns a `sessionID`; the orchestrator records it in the step's log line and, on `failed` or `blocked`, prints `resume session {sessionID}` in the gate or failure text. No store: the ID lives in the log line and the gate line only. | A1 |
| REQ-14 | Every delegation carries `stepKey` and `attempt` and carries one instruction to continue from artifacts that already exist for that key rather than redo the work. No persisted run state. | A2 |
| REQ-15 | `pipelineMode: observe \| confirm \| auto` exists as a dynamic parameter in all three orchestrators; `observe` prints the ordered steps and the exact delegation prompts and stops without delegating; the precedence rule against `autoConfirm` is stated; `observe` never answers a scope question. | A3 |
| REQ-16 | `previous` ≤ 40 words, `QUESTIONS` ≤ 3 numbered items, `ARTIFACTS` paths only, every other digest field one line; truncation is silent in the report and one `CAPPED:` line in the orchestrator log; the confirmation gate relays the captured form and never restores cut prose. | A4 |
| REQ-17 | `STATUS` gains `deferred`; a deferred step parks, the pipeline continues with every step that does not depend on it, Step 6 lists it with what unblocks it, and a deferral is never classified, retried, or counted as a failure. | A5 |
| REQ-18 | At each step boundary the orchestrator hashes the spec the step will run (`git hash-object`) and logs one `SPEC DRIFT:` line when it differs from the previous step's hash; a change to the orchestrator's own spec is logged once. Nothing is cancelled or restarted. | A6 |

### Security

| ID | Constraint |
|----|-----------|
| SEC-01 | The patch adds no network call, no credential, and no new tool grant. The only permission change is a narrowing (T17, optional). |
| SEC-02 | No project data, absolute path, or secret is added to a delegation beyond what the digest already carried (`project`, `basePath`, `branch`). |
| SEC-03 | The inlined documentation-handoff shape keeps the "do not attempt the write when the grant excludes it" rule; a rejected write is not an acceptable fallback. |
| SEC-04 | A `sessionID` is a capability handle, not project data: it appears in the orchestrator log line and the gate line only. It is never added to the context digest, because a spawn carrying it would echo it into a reply and from there into the next delegation. |

### Constraints

| ID | Constraint |
|----|-----------|
| CON-01 | Nothing under `.agents/skills/` and nothing in `skills-lock.json` is modified — not one byte. |
| CON-02 | No new agent file and no new orchestrator. The new file is a config declaration, not an agent. |
| CON-03 | `.agents/config/quality-gates.md` is read by REQ-11 and never edited by this plan. |
| CON-04 | The knowledge-retrieval duty (attempt `knowledgebase_knowledgebase_search`, graceful failure, report `executed`/`skipped`) is preserved verbatim in meaning. |
| CON-05 | The documentation-handoff contract is preserved verbatim in meaning: same block, same last-block position, same append-only rule, same "do not attempt the write" rule. Only *where it is described* moves, from a mandatory file read to an inline shape whose authority is the unchanged canonical file. |
| CON-06 | `scope` never answers its own questions; REQ-03 does not touch the scope round protocol. |
| CON-07 | Every occurrence count pinned by a test is named in this plan with the test file that must be updated. A count that cannot be kept must be replaced by a stronger assertion, never deleted. |
| CON-08 | No paid API run. Verification is bytes, exit codes, and test runs only. |
| CON-09 | The plan is markdown-only. It writes plan files and documents; it does not implement. |
| CON-10 | `AGENTS.md` is untouched: its instruction table indexes `.agents/instructions/` only, and `.agents/config/step-report.md` is discovered through `.agents/config/README.md`. |
| CON-11 | The R2 behaviours add no file under `.agents/skills/`, no new agent, and no new communication exemption. |
| CON-12 | `observe` never relaxes "`scope` never answers its own questions": observe prints the delegation it would send and stops; it does not answer, infer, or default a question. |
| CON-13 | `deferred` is a status value plus an ordering rule. It is **not** the durable run journal that ALT-01 rejected: no file, no directory, no state that outlives the log line. |
| CON-14 | `stepKey` and `attempt` travel in the delegation and the log line only. No resume file, no run-state directory, no persisted counter. |
| CON-15 | Every R2 saving or cost is a byte count produced by the T15/T25 harness at the pinned fixture. No un-measured claim enters this plan, including prose added to `step-report.md` or `communication.instructions.md`. |
| CON-16 | R2 preserves, verbatim in meaning, the four contracts R1 pinned: the knowledge-retrieval executed/skipped duty (CON-04), the documentation-handoff contract and its last-block position (CON-05), "`scope` never answers its own questions" (CON-12), and the confirmation-gate pause. No R2 behaviour removes a gate — `observe` reaches none because no step runs, which is a consequence of the pause, not a relaxation of it. |

## Implementation Steps

### Phase 1 — Canonical step-report contract (Batch A)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Create the five-line step-report declaration: exact line order, allowed values, "never omit a line", envelope placement, and the "five lines first, handoff block last" ordering. | `.agents/config/step-report.md` | A | — | |

**T1 — write `.agents/config/step-report.md`**

Front matter carries `title` and `description` only, matching `.agents/config/quality-gates.md`
style (no `applyTo`; this is a config declaration, not an instruction file). Body:

````markdown
---
title: "Step Report"
description: "The five-line return format every delegated agent uses, and where those lines sit in a reply."
---

# Step Report

A delegated step returns exactly five lines, in this order, and no other prose before them:

```text
STATUS: done | blocked | failed | needs-answer
ARTIFACTS: {comma-separated paths, or none}
QUESTIONS: {numbered questions, or none}
HANDOFF: yes | no
TOKENS: {estimated input+output tokens for this step, or unknown}
```

- `STATUS` — `done` (the step's work landed), `blocked` (a dependency is missing),
  `failed` (the work was attempted and did not land), `needs-answer` (only a human can
  unblock it).
- `ARTIFACTS` — every path the step created or changed, verbatim, comma-separated. `none`
  when the step changed nothing. The orchestrator's log entry and the tracker both read
  this field, so a path missing here is a path missing from the record.
- `QUESTIONS` — the numbered questions the step needs answered, or `none`. A reply with
  `needs-answer` must carry at least one question.
- `HANDOFF` — `yes` when a `### Documentation handoff` block follows the five lines,
  `no` otherwise.
- `TOKENS` — the step's own estimate of input plus output tokens, or `unknown`. It is an
  estimate by construction: no runtime reports it. It is used only for the soft
  `TOKEN BUDGET` warning and is never a correctness signal.

## Rules

- Every line appears every time. Use `none` / `unknown` — never drop a line, never reorder.
- A `blocked` or `failed` step still returns all five lines.
- When `HANDOFF` is `yes`, the five lines come first and the
  `### Documentation handoff` block is the **last block of the same reply**. The block's
  content and rules are defined once in
  `.agents/instructions/documentation-handoff.instructions.md`; this file does not restate
  them and does not relax them.
- The five lines are the whole reply for an orchestrated step. A subagent→orchestrator
  reply sits under Exemption 3 of
  `.agents/instructions/communication.instructions.md`, so no four-slot envelope is
  required.
- A user-facing (standalone) reply keeps the four-slot envelope and renders these five
  lines as the first five bullets of `## Evidence`, with no headings of their own.
````

**Done when:** the file exists, has exactly five labelled fields in the stated order, names
the handoff file, names Exemption 3, and contains no sixth field.

### Phase 2 — Delegation rewrites (Batch B — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T2 | Add a `## Step report` section to the config discovery pointer. | `.agents/config/README.md` | B | T1 | |
| T3 | Rewrite `orchestrator.md` Step 3b, the standard delegation template, and Parallel Coder Execution: inline digest, one conditional read, inline coder slice, one plan read at the coder step. | `.opencode/agents/orchestrator/orchestrator.md` | B | T1 | |
| T4 | Same rewrite for `feature-pipeline.md`: Step 2b, standard template, and the parallel-coder path (mtime scan deleted). | `.opencode/agents/orchestrator/feature-pipeline.md` | B | T1 | |
| T5 | Same rewrite for `tdd-orchestrator.md`: Step 3b and all six Phase delegation blocks, including removal of the two "read/update the plan" lines. | `.opencode/agents/orchestrator/tdd-orchestrator.md` | B | T1 | |
| T19 | R2: add `deferred` to the `STATUS` enum with its bullet, and a `## Caps` section carrying 40 words / 3 questions / paths-only / one line plus the silent-report, one-log-line rule. | `.agents/config/step-report.md` | B | T1 | 2026-11-08 |

**The canonical digest block every delegation carries (T3, T4, T5).** This exact text is the
shared prefix; the values after `:` are the only per-run part. Keep the label order.

````text
This phase must be performed as the agent "{agent_name}" defined in ".opencode/agents/{agent_file}".

CONTEXT DIGEST
- project: {projectName} | basePath: {basePath}
- step: {N} of {M} — {role} ({purpose})
- previous: {status} — {one line; no plan path}
- owned: {paths this step may write}
- read: {none|architecture-context|quality-gates|memory-bank|learned-knowledge}
- budget: {N} total, {N/M} this step

RULES
- Read only your agent spec and the `read:` file.
- KNOWLEDGE-RETRIEVAL: call knowledgebase_knowledgebase_search; on failure continue; report executed|skipped.
- DOC: {write|handoff}
- RETURN: the five lines — STATUS / ARTIFACTS / QUESTIONS / HANDOFF / TOKENS.
````

The `budget:` line is emitted only when `tokenBudget` is set; when it is unset the line is
omitted entirely, not filled with `unset` — no default, no placeholder.

`DOC` resolves to exactly one of these two lines, chosen from the agent's edit grant:

````text
- DOC: write to memory-bank/** or docs/** and run memory_bank_memory_update.
- DOC: do not write; return `### Documentation handoff` last — `**Target:**` path, `**Operation:** append`, `**Reason:**`, then the exact markdown.
````

For a parallel coder spawn, prepend the slice and drop the `owned:` line (the slice's `FILES`
already states it):

````text
TASK SLICE
- TASK ID: {TASK_ID}
- DESCRIPTION: {task description, one line}
- FILES: {files this task owns, comma-separated}
- DEPENDS ON: {task IDs, or —}
- SIBLINGS: {other task IDs in this batch, or none} — do not touch their files; do not read the plan
````

Measured post-edit sizes for this text (values filled with the fixtures in
[Byte Measurement Baselines and Targets](#byte-measurement-baselines-and-targets)):
**643 B** standard with the `write` variant, **714 B** with the `handoff` variant, **683 B**
with a budget line, and **807 B** for a coder slice.

**T2 — `.agents/config/README.md`.** Add after `## Quality gates` (line 66–72) and before
`## Research skill`:

```markdown
## Step report

`.agents/config/step-report.md` is the five-line return format every delegated agent uses:
status, artifacts, questions, handoff flag, token estimate. It is carried inline in each
delegation's context digest; the file is the definition, not a per-spawn read.
```

**T3 — `.opencode/agents/orchestrator/orchestrator.md`.**

1. Replace `### Step 3b: Per-Spawn Context Digest and Read Policy` (lines 200–234, heading to
   the blank line before `### Step 4`) with: a two-sentence framing paragraph, the canonical
   digest block above in a ````text` fence, and this read-selection table. The heading text is
   unchanged — `tests/spec-orchestrator-parity.test.js` pins it, and the three terms
   `memory_search`, `memory-bank/tasks/`, `learned-knowledge` must stay inside the block:

   | `read:` value | The orchestrator sets it when | Resolves to |
   |---|---|---|
   | `none` | default | nothing beyond the agent spec |
   | `architecture-context` | the step touches architecture, module boundaries, or public interfaces | `docs/.architecture-context.md` |
   | `quality-gates` | the role is `unit-tester` or `reviewer` | `.agents/config/quality-gates.md` |
   | `memory-bank` | the step creates or edits a file under `memory-bank/tasks/` or must follow memory-bank section conventions | `.agents/instructions/memory-bank.instructions.md` |
   | `learned-knowledge` | the agent can name a prior session (date and title) matching this task | `.agents/instructions/learned-knowledge.instructions.md` |

   Closing rules, verbatim: "`memory_search` is always attempted; it is an embedded index, not
   a file read. If two rows could apply, the first row in table order wins — a spawn never
   reads two of these files. `DOC` is emitted as the `write` line when the role's edit grant
   covers `memory-bank/**` or `docs/**`, and as the `handoff` line otherwise (today:
   `unit-tester` and `e2e-tester`). The knowledge-retrieval protocol and the
   documentation-handoff shape are carried inline in the digest above; the orchestrator never
   re-lists them."

2. Replace the Step 4 standard delegation fence (lines 246–256, content 247–255) with the
   canonical digest block. The standard block is identified by `CONTEXT DIGEST` + `owned:`;
   the coder block by `TASK SLICE` — that pair is what T14's finders use. Do not add a
   `{work_unit}` line: the purpose field carries it.

3. Replace `#### Parallel Coder Execution` (lines 282–309) with:

   - Step 1: "**Read the plan once.** The implementer's step report names it in `ARTIFACTS:`.
     Read only its Parallel Execution Summary table and its task rows. This is the one
     project-file read the orchestrator performs, and it happens once per run, not once per
     spawn. Never scan `/plan/` by modification time."
   - Step 2: derive batch letters plus each task's `DESCRIPTION`, `FILES`, `DEPENDS ON`.
   - Step 3c: the coder template = `TASK SLICE` + canonical digest block, using the exact
     text above.
   - Step 3f: "If a task fails, classify it with the Step 4 taxonomy. A transient failure
     retries that task alone; a substantive failure stops the batch."
   - A closing rule: "**The coder never reads the plan.** If the slice is insufficient, that
     is a defect in the slice: stop and report `blocked`, do not open the plan."

**T4 — `.opencode/agents/orchestrator/feature-pipeline.md`.**

1. Replace `### Step 2b: Per-Spawn Context Digest and Read Policy` (lines 92–125) with the
   same framing, the canonical digest block, and the same five-row selection table. Keep the
   heading text (pinned by `tests/spec-orchestrator-parity.test.js`) and keep `memory_search`,
   `memory-bank/tasks/`, `learned-knowledge` inside the block.
2. Replace the Step 3 standard delegation fence (lines 144–155) with the canonical digest
   block. The block must still contain the substrings `architecture-context`,
   `knowledgebase`, and `learned-knowledge` (the `read:` enum and the KNOWLEDGE-RETRIEVAL
   line carry all three) — `tests/spec-orchestrator-parity.test.js` TEST-09 keeps that
   assertion unchanged.
3. Replace `#### Parallel Coder Execution` (lines 181–210): delete step 1 ("Read the most
   recently created plan file in `/plan/`, sort by modification time") and step 2's
   plan-parse; substitute the same "read the plan once from the implementer's `ARTIFACTS:`"
   rule as T3. Replace the parallel fence (lines 191–202) with `TASK SLICE` + canonical
   digest. This is the W8(c) merge: the defect is the mtime guess plus the unstated read,
   not the read itself, and the coder-side prohibition is what matters.

**T5 — `.opencode/agents/orchestrator/tdd-orchestrator.md`.**

1. Replace `### Step 3b: Per-Spawn Context Digest and Read Policy` (lines 126–161) with the
   canonical digest plus the same selection table. Keep the `TDD parameters: minCoverage …`
   line only until T18 decides REQ-11; if T18 is not approved, keep it as a digest line with
   the literal `NOT DECLARED` value described in T18.
2. Replace all six Phase delegation fences with `canonical digest` + the phase's own numbered
   requirements, in this order: static phase intent, `TASK SLICE` (Phase 2 and Phase 3 only),
   then the digest last (L4). Exact current ranges: Phase 1 186–199, Phase 2 216–231,
   Phase 3 255–272, Phase 4 291–308, Phase 5 327–343, Phase 6 355–368.
   - Phase 2, delete line 224 ("Read the plan file to understand the full spec…"); the slice
     plus `DESCRIPTION` is the spec. Keep the RED-phase context sentence.
   - Phase 3, delete line 263 ("Read the plan file for full context…") and line 270 ("Update
     the plan file — mark your task row's **Completed** column…"). The second deletion is
     required by REQ-01: a completion write is a plan read.
   - Phase 5, delete line 340 ("Read the plan file for context on what was supposed to be
     built") and set `read: quality-gates` for the reviewer — the reviewer cites the gate
     declaration and does not need the plan; the review reads the diff.
3. Each of the six blocks keeps the literal `KNOWLEDGE-RETRIEVAL:` marker exactly once —
   `tests/spec-orchestrator-parity.test.js` pins the count at six after T14.
4. Each block keeps at least one lowercase `knowledge-retrieval` occurrence somewhere in the
   file (the Step 3b prose is the natural home) so `tests/spec-knowledge-retrieval.test.js`
   TEST-03 still passes — its check is case-sensitive.

**Done when (T3, T4, T5):** no delegation fence contains `carry the Step 3b block verbatim`,
`carry the Step 2b block verbatim`, `knowledge-retrieval.instructions.md`,
`documentation-handoff.instructions.md`, `from plan /plan/`, or `read the plan file`; every
delegation fence contains `CONTEXT DIGEST` and `RETURN:`; the three orchestrator files each
contain at least one lowercase `knowledge-retrieval`.

**T19 — `.agents/config/step-report.md` (R2).** Three additions and nothing else. Measured
total: **+899 B** (899 is the file's own delta, not a spawn cost).

1. The `STATUS` line inside the `text` fence becomes five values — **+11 B**:
   `STATUS: done | blocked | failed | needs-answer | deferred`
2. One bullet immediately after the `needs-answer` bullet — **+271 B**:

   ```markdown
   - `deferred` — the step is parked: not attempted now, or not finishable now. It is **not** a
     failure. The orchestrator continues with every step that does not depend on it, and lists it
     at the end with the thing that unblocks it. Deferring never triggers a retry.
   ```

3. A `## Caps` section immediately before `## Rules` — **+617 B**:

   ```markdown
   ## Caps

   - `previous` (the digest field the orchestrator fills) — **40 words**. Cut at 40.
   - `QUESTIONS` — **at most 3 numbered items**. Cut at 3.
   - `ARTIFACTS` — **paths only**, comma-separated. Prose after a path is dropped.
   - Every other field — **one line**. A wrapped field is cut to its first line.

   A cap that can be argued with is not a cap: these are counts, not guidance. A producer may
   exceed one; the orchestrator applies the cap when it captures the report. The report keeps the
   cut form silently, and the orchestrator log gains exactly one line per cut —
   `CAPPED: {field} {before}->{after}`.
   ```

**Why the enum has to move into the delegation as well.** R1 states that
`.agents/config/step-report.md` is "the definition, not a per-spawn read", and the RETURN line in
the digest names only the five field names. That leaves the allowed `STATUS` values reachable
only by opening a file the spawn is told not to open. A5 makes the gap load-bearing (a producer
cannot emit `deferred` it has never heard of), so T20–T22 put the enum in the RETURN line. This
is the one place where A5 forces a per-spawn byte; it is counted as 11 of the 188.

**Done when (T19):** the file still declares exactly five labelled fields in the stated order;
`STATUS` names exactly five values; `## Caps` names four caps with the numbers 40 and 3 and the
words "paths only" and "one line"; the section contains the literal `CAPPED: {field}
{before}->{after}`; no sixth field exists.

### Phase 3 — Second pass per orchestrator (Batch C — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T6 | `orchestrator.md`: step-report wiring, cache layout, failure taxonomy, token budget, tracker input, exception list. | `.opencode/agents/orchestrator/orchestrator.md` | C | T3 | |
| T7 | `feature-pipeline.md`: same five items, scaled to its four steps. | `.opencode/agents/orchestrator/feature-pipeline.md` | C | T4 | |
| T8 | `tdd-orchestrator.md`: same five items, including the RED/GREEN/VERIFY gate payloads. | `.opencode/agents/orchestrator/tdd-orchestrator.md` | C | T5 | |

**T6 — `.opencode/agents/orchestrator/orchestrator.md`.**

1. **L3, capture and log.** Replace Step 4 item 6 ("Capture the sub-agent's response summary")
   with: "Capture the five-line step report. Parse `ARTIFACTS:` into the log's artifact list,
   `STATUS:` into its status field, `TOKENS:` into its estimate field, and `HANDOFF:` into the
   handoff flag. Do not re-read the body."
2. **L3, log entry.** Step 4 item 7 becomes: `step name | STATUS | duration | ARTIFACTS |
   TOKENS | key finding (one line)`.
3. **W5, failure taxonomy.** Replace item 8 (`If a required step fails, stop the pipeline and
   report to the user.`) with:

   ```markdown
   8. Classify a failed step before reacting:
      - **transient** — tool error, timeout, rate limit, or a sub-agent that returns no
        output. Retry the same delegation, up to 3 attempts, with 2s / 4s / 8s backoff. Log
        each attempt.
      - **substantive** — a failing test, a spec violation, a missing artifact, or a refusal
        on policy grounds. Stop the pipeline and report the failing step and its artifact.
      - **ambiguous** — the failure fits neither class, or the retry cap is reached. Stop and
        ask the user.
      The point is re-run elimination: one retry costs one delegation, a pipeline re-run costs
      every delegation again.
   ```

4. **L3, confirmation gate.** Replace item 9's first sub-bullet ("Present the agent's output
   summary … then the output verbatim") with: "Present the five-line step report as the
   Orchestrator Normalization Block's four lines plus the five lines verbatim after the rule
   — never re-emit prose that is not in the report."
5. **L4, new section.** Insert `## Prompt Cache Layout` after `## Workflow` and before
   `## Guidelines`:

   ```markdown
   ## Prompt Cache Layout

   Every delegation is ordered so its longest shared prefix repeats across spawns:

   1. **Static body** — the agent line, the `CONTEXT DIGEST` label block, and the `RULES`
      block, unchanged from one spawn to the next. This is the cacheable prefix.
   2. **Per-step slice** — the `TASK SLICE` fields, on parallel coder spawns only.
   3. **Per-run digest** — the values, appended last.

   - The static body is frozen for the duration of a run. Never edit an agent file, a
     template, or this spec mid-run.
   - Every new per-run value belongs in the digest, never in `## Dynamic Parameters` prose.
     `## Dynamic Parameters` describes the run's shape; the digest carries its values.
   ```

6. **W6, token budget.** Add to `## Dynamic Parameters`: "**tokenBudget**: Optional estimate
   of the run's total input+output tokens. No default. When set, the digest's `budget:` line
   carries the total and each step's share (`total / planned steps`); when unset the line is
   omitted entirely — no placeholder, no default." At item 7, add: "If the
   step's `TOKENS:` is numeric and the cumulative estimate exceeds the budget or the step's
   share, emit one line — `TOKEN BUDGET: {used}/{budget} after step {N} — continuing.` — and
   continue. The budget never stops a step."
7. **W7, tracker input.** Replace the Step 5 tracker delegation (lines 317–329) with a
   `STEP REPORTS` block that lists each step's five lines verbatim, and with these
   instructions: "Consume the step reports. Read `docs/.orchestrator-log.md` only when a
   report's `ARTIFACTS:` is missing or `STATUS:` is `failed`, and then only the entry for
   that step." The tracker delegation must still carry the canonical digest.
8. **Exception list.** The intro (line 12) and the two Guidelines bullets (lines 343, 351)
   currently disagree about how many exceptions exist. Rewrite both to name exactly three:
   the Step 0 existence probe, transcription of a returned documentation handoff, and the one
   plan read at the coder step. Nothing else.

**T7 — `.opencode/agents/orchestrator/feature-pipeline.md`.** Apply T6 items 1–8 with these
mappings: capture/log are Step 3 items 6–7 (lines 157–158); failure taxonomy replaces item 8
(line 159); the gate is item 9 (lines 160–166); the cache section goes before `## Guidelines`;
`tokenBudget` goes in `## Dynamic Parameters`; the tracker is step 4 of the fixed pipeline and
its delegation carries the `STEP REPORTS` block; the intro exception list is line 12 plus the
Guidelines bullets at 222 and 231.

**T8 — `.opencode/agents/orchestrator/tdd-orchestrator.md`.** Apply T6 items 1–8 with these
mappings: each Phase's capture/log pair; the failure taxonomy replaces the five per-phase
"if any task fails, stop the pipeline" lines (Phase 2 line 234, Phase 3 line 275) and the
Phase 4 "Tests fail" branch gains the same three classes; the gates are the Phase 1, 2 and 4
confirmation paragraphs; the cache section goes before `## Output Format`; the tracker is
Phase 6 and carries `STEP REPORTS`; `TDD parameters: minCoverage` stays a digest value until
T18 decides it.

**Done when (T6, T7, T8):** each orchestrator contains `## Prompt Cache Layout` (or its
mirrored one-sentence form), `tokenBudget`, the three failure classes, `STEP REPORTS`, and no
sentence anywhere still says "If a required step fails, stop the pipeline".

### Phase 4 — Consumers and spec bindings (Batch D — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T9 | `coder.md`: delete the plan read from step 1 and the plan write from step 6; add the orchestrated read override and the step-report line. | `.opencode/agents/coder.md` | D | T1, T3 | |
| T10 | `tracker.md`: consume step reports, read the log only on a gap, add the override and the step-report line. | `.opencode/agents/tracker.md` | D | T1, T3 | |
| T11 | Add the one-sentence orchestrated-mode read override to the nine remaining pipeline specs. | 9 root specs | D | T3 | |
| T12 | Add the one-line step-report reference to the ten remaining root specs. | 10 root specs | D | T1 | |

**T9 — `.opencode/agents/coder.md`.**

1. Replace step 1 (lines 23–26, "If assigned a specific task from a plan … Read the plan file …
   Read the full phase section … Check the Parallel Execution Summary") with: "Parse the
   `TASK SLICE` in your delegation. It names your task, its description, the files you own,
   its dependencies, and your siblings. **You do not read the plan**; if the slice is
   insufficient, return `STATUS: blocked` with the missing field named."
2. Replace step 6's first bullet (line 34, "Open `/plan/…` and mark your task row's
   **Completed** column") with: "**Plan**: do not write to it. Your completion is reported in
   the step report's `ARTIFACTS:` and `STATUS:`; the orchestrator records it."
3. Remove the now-false line 49 ("the orchestrator relies on updated plan file timestamps")
   and replace it with: "The **Document** step is mandatory — never skip it."
4. Add to `## Approach` after step 2: "**Orchestrated mode:** when your prompt starts with
   `This phase must be performed as the agent`, the delegation's `read:` value overrides the
   whole conditional-read list below **and** the `**Mandatory, never conditional:**` line —
   read your own spec and that one file, nothing else. The knowledge-retrieval protocol and
   the documentation-handoff block shape travel in the digest; the canonical handoff file
   stays the authority when you need an edge case it does not cover."
5. Add to `## Output Expectations`: "Return the five-line step report defined in
   `.agents/config/step-report.md` (`STATUS` / `ARTIFACTS` / `QUESTIONS` / `HANDOFF` /
   `TOKENS`) instead of a prose summary."

**T10 — `.opencode/agents/tracker.md`.**

1. Replace step 2 (line 33, "Read the orchestrator log …") with: "**Read the step reports** —
   the delegation's `STEP REPORTS` block is the primary record. Open
   `docs/.orchestrator-log.md` only when a report's `ARTIFACTS:` is missing or its `STATUS:`
   is `failed`, and then only that step's entry."
2. Keep step 3 (read the artifacts named in `ARTIFACTS:`) unchanged — that read is the work.
3. Add the orchestrated-mode override sentence from T9 item 4.
4. Add the step-report reference line from T9 item 5 to `## Output Expectations` (create the
   heading above `## Documentation Entry Format` if absent).

**T11 — the nine remaining pipeline specs.** Files: `architect.md`, `deployer.md`,
`designer.md`, `e2e-tester.md`, `implementer.md`, `researcher.md`, `reviewer.md`, `scope.md`,
`unit-tester.md`. Insert one sentence at the end of the existing
`**Context Retrieval (conditional reads)**` bullet: "**Orchestrated mode:** when the prompt
starts with `This phase must be performed as the agent`, the delegation's `read:` value
overrides this list **and** the `**Mandatory, never conditional:**` line — your own spec plus
that one file, nothing else; the knowledge-retrieval protocol and the documentation-handoff
block shape travel in the digest, with the canonical handoff file remaining the authority for
edge cases." `planner.md` is excluded because no orchestrator registry can spawn it (verified
across the three registries); it is still bound by T12.

**T12 — the ten remaining root specs.** Files: `architect.md`, `deployer.md`, `designer.md`,
`e2e-tester.md`, `implementer.md`, `planner.md`, `researcher.md`, `reviewer.md`, `scope.md`,
`unit-tester.md`. Add one line: "Return the five-line step report defined in
`.agents/config/step-report.md` (`STATUS` / `ARTIFACTS` / `QUESTIONS` / `HANDOFF` /
`TOKENS`)." Place it as the last bullet of `## Output Expectations` where that heading exists
(`architect`, `deployer`, `designer`, `e2e-tester`, `implementer`, `reviewer`, `unit-tester`);
for `planner`, `researcher`, and `scope`, create `## Output Expectations` immediately above
`## Standalone Tracking`. Do not add a second `communication.instructions.md` reference
anywhere: the documented static check in `plan/process-communication-standard-v1.md:537`
(TEST-03) requires exactly one per file across all 15 agent files.

**Done when (T9–T12):** `grep -c 'step-report.md' .opencode/agents/*.md` returns `1` for each
of the twelve root specs; `grep -rn 'Read the plan file' .opencode/agents/` returns nothing;
the communication reference loop returns `1` for each of the 15 files.

### Phase 5 — Communication standard (Batch E)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T13 | Map the five-line report onto the envelope, restate the normalization block's payload, and record the 40-line arithmetic without adding an exemption. | `.agents/instructions/communication.instructions.md` | E | T1, T6 | |

**T13 — `.agents/instructions/communication.instructions.md`.**

1. In `### Mapping spec content onto the slots` (lines 125–142), add one row:
   "A five-line step report (`STATUS` / `ARTIFACTS` / `QUESTIONS` / `HANDOFF` / `TOKENS`) →
   slot 3 `## Evidence`, as five literal lines with no headings of their own."
2. In `## Orchestrator Normalization Block` (lines 365–401), after the four-bullet rules,
   add:

   ```markdown
   - The sub-agent's output at a gate is its five-line step report
     (`.agents/config/step-report.md`), relayed verbatim after the `---` rule. The four bold
     lines are derived from it: bottom line from `STATUS` plus one sentence, Files from
     `ARTIFACTS`, Blocker from `QUESTIONS`, Next from the pipeline's next step.
   - This adds no exemption and lifts no cap. The saving comes from the producer emitting
     five lines instead of prose; the relay is still byte-for-byte, so Exemption 2 still
     governs and "every finding survives" still holds for everything the producer reported.
   - Line arithmetic: four normalization lines plus five report lines is nine of the forty
     lines a gate reply may use. Nothing else is re-emitted, so the cap is untouched.
   ```

3. In `## The Envelope`, the paragraph on the one permitted sub-block (lines 192–200) gains
   one sentence: "An orchestrated reply returns the five step-report lines first and the
   handoff block last; that ordering is fixed in `.agents/config/step-report.md`."

**Done when:** the file still has exactly eight `##` headings and four slots per variant; the
words "Exemption 4" appear nowhere; `grep -c 'communication.instructions.md'` still returns 1
per agent file.

### Phase 6 — Test harness (Batch F — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T14 | Update the parity spec: new block finders, `KNOWLEDGE-RETRIEVAL:` counts replacing the file-path counts, negative assertions on the removed read triggers. | `tests/spec-orchestrator-parity.test.js` | F | T3, T4, T5 | |
| T15 | Add the deterministic byte-budget spec and its fixture with the recorded pre-edit baselines. | `tests/spec-delegation-budget.test.js`, `tests/fixtures/delegation-budget.json` | F | T3, T4, T5 | |

**T14 — `tests/spec-orchestrator-parity.test.js`.** Current pinned counts and their fate:

| Assertion (current) | Current value | Action |
|---|---|---|
| `countOccurrences(content, 'knowledge-retrieval.instructions.md')` — orchestrator | 2 | Replace with `KNOWLEDGE-RETRIEVAL:` = 2 |
| same — feature-pipeline | 2 | Replace with `KNOWLEDGE-RETRIEVAL:` = 2 |
| same — tdd-orchestrator | 6 | Replace with `KNOWLEDGE-RETRIEVAL:` = 6 |
| `countOccurrences(content, 'knowledgebase_knowledgebase_search')` — feature | 2 | Unchanged (one per block) |
| `CONTEXT_STRINGS = ['learned-knowledge','architecture-context','knowledgebase']` | present | Unchanged — the `read:` enum and the KNOWLEDGE-RETRIEVAL line keep all three |
| block finder `'Work on "{work_unit}"'` | — | Replace with `CONTEXT DIGEST` + `owned:` for the standard block |
| block finder `'Work on "Implement task {TASK_ID}'` | — | Replace with `TASK SLICE` + `"Coder - Implementation"` |
| `### Step 3b/2b: Per-Spawn Context Digest and Read Policy` headings | present | Unchanged |
| `DIGEST_POLICY_TERMS = ['memory_search','memory-bank/tasks/','learned-knowledge']` | present | Unchanged — the selection table keeps all three |
| `#### Applying documentation handoffs` = 1 per file | 1 | Unchanged |

Add three negative assertions, one describe block: no delegation fence in any of the three
files may contain `knowledge-retrieval.instructions.md`,
`documentation-handoff.instructions.md`, `carry the Step 3b block verbatim`,
`carry the Step 2b block verbatim`, `from plan /plan/`, or `Read the plan file`. These are the
assertions that would have caught the original cost defect, so they must not be dropped to
make a count pass.

The uppercase marker must appear **only** inside delegation fences: `KNOWLEDGE-RETRIEVAL:` is
counted across the whole file, so a second uppercase occurrence typed into the Step 3b prose
would turn 2 / 2 / 6 into 3 / 3 / 7 and fail the suite. Keep the prose lowercase
(`knowledge-retrieval`) — `tests/spec-knowledge-retrieval.test.js` TEST-03 needs that
lowercase occurrence anyway.

**T15 — `tests/spec-delegation-budget.test.js` + `tests/fixtures/delegation-budget.json`.**
The spec extracts the delegation fences with the same line-trimming extractor the parity spec
uses, substitutes fixed fixture values, and asserts byte ceilings. No network, no runtime, no
API. Fixture shape:

```json
{
  "baseline": {
    "orchestrator.standard": 2941,
    "orchestrator.parallelCoder": 3056,
    "feature.standard": 3068,
    "feature.parallelCoder": 3189,
    "tdd.P1": 3771, "tdd.P2": 4060, "tdd.P3": 3985,
    "tdd.P4": 3727, "tdd.P5": 3194, "tdd.P6": 2846
  },
  "ceilings": {
    "orchestrator.standard": 750,
    "orchestrator.parallelCoder": 850,
    "feature.standard": 750,
    "feature.parallelCoder": 850,
    "tdd.P1": 900, "tdd.P2": 1100, "tdd.P3": 1100,
    "tdd.P4": 900, "tdd.P5": 900, "tdd.P6": 850
  },
  "runs": {
    "quick-fix": ["coder", "unit-tester", "reviewer"],
    "wayfinding": ["implementer", "implementer", "implementer", "coder", "unit-tester", "reviewer", "deployer"]
  }
}
```

The test computes, per run, `sum(measured template bytes)` and asserts:
`measured <= ceiling` for every block; `measured <= baseline * 0.40` for the preamble metric
(≥60% cut); and, for the six-coder fixture, `6 * measured_coder <= 0.30 * (6 * baseline_coder)`
(≥70% cut). It prints the delta per block so a failing assertion names the block.

### Phase 7 — Verification (Batch G)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T16 | Run the full verification set for R1 and R2, prove non-vacuity, and record every measured number in the Execution Record. | this plan file | G | T1–T15, T20–T25 | |

**T16 procedure** (all commands from the repository root, no paid API):

1. `npm run test:unit` — re-derive the baseline. Measured on 2026-11-08 before any edit:
   **31 files / 910 tests passed, 0 failed**. Expected after the patch: same file count, same
   or greater test count (T14/T15 add cases; none may be deleted). The progress record's
   older figure (29 files / 852 tests) is a historical entry, not the current baseline.
2. `npx playwright test` — re-derived: **7 passed / 1 skipped**. Unchanged.
3. `npx vitest run tests/spec-orchestrator-parity.test.js` — must pass with the T14 counts.
   The digest's "142 passed" figure is the historical sync + parity + gate total; re-derive it
   with `npx vitest run scripts/sync-unit.test.js tests/spec-orchestrator-parity.test.js
   tests/spec-quality-gates-declaration.test.js` and record the new number.
4. `npx vitest run tests/spec-delegation-budget.test.js` — must pass, printing the deltas.
5. **Non-vacuity.** Temporarily revert one delegation fence (e.g. `git stash push` the
   orchestrator's parallel block, or copy the pre-edit fence back into a scratch branch),
   run T15, and confirm it fails on that block with a non-zero delta. Restore, re-run, confirm
   green. Record both outputs. A harness that cannot fail is not a measurement.
6. Confirm the negative greps: no `Read the plan file` under `.opencode/agents/`; no
   `carry the Step 3b block verbatim`; `grep -c 'communication.instructions.md'` = 1 in each
   of 15 files; `grep -c 'step-report.md'` = 1 in each of the 12 root specs.
7. Record the measured pre/post bytes per block in the Execution Record, replacing every
   target with the measured value. If a ceiling is missed, adjust the ceiling *and* record
   why, rather than weakening the assertion.
8. **R2 delta gate.** `npx vitest run tests/spec-orchestrator-r2-contract.test.js` must pass,
   and `npx vitest run tests/spec-delegation-budget.test.js` must report `+188 B` for every
   block. A delta that is not 188 means a stray byte entered the canonical R2 text; fix the
   text, never the assertion.
9. **A2 proof.** Confirm the proof recorded by T24 (TEST-14); re-run it if any canonical R2 text
   changed between Batch J and this gate. Record the delegation text and the returned report in
   the Execution Record. If the instruction cannot be read as an unambiguous continue-or-redo
   rule, A2 is not satisfied and the wording changes — not the requirement.
10. **R2 prose accounting.** `wc -c` the three orchestrators, `step-report.md`, and
    `communication.instructions.md` before and after; confirm the deltas are 2,098 per
    orchestrator, 899, and 671, and write the three numbers plus the 3,668 total into the
    Execution Record. A prose delta that is not recorded does not count as measured.

### Phase 8 — OPTIONAL — awaiting user go/no-go (Batch H)

**Recommendation:** approve T17, defer T18. T17 is a two-line frontmatter change that closes a
real defect the researcher found and costs nothing to verify. T18 changes the coverage gate's
default, which changes TDD behaviour and therefore deserves its own run.

Nothing in Batches A–G depends on either task. If the user says no, delete this phase with the
plan otherwise intact.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T17 | Narrow the three orchestrators' `shell` grant to the probe commands; keep `edit: *.md`. | 3 orchestrator files | H | T6, T7, T8 | |
| T18 | Remove the hardcoded `minCoverage=90`; read the declaration and report `GATES: NOT DECLARED` when absent. | `.opencode/agents/orchestrator/tdd-orchestrator.md` | H | T8 | |

**T17.** In each of the three orchestrator front matters, replace
`- { action: shell, resource: "*", effect: allow }` with the four probe patterns and a
catch-all deny *first* (the reviewer's ordered-list convention, since the last matching rule
wins):

```yaml
  - { action: shell, resource: "*",            effect: deny }
  - { action: shell, resource: "test -*",      effect: allow }
  - { action: shell, resource: "grep -q *",    effect: allow }
  - { action: shell, resource: "git rev-parse*", effect: allow }
```

Keep `edit: *.md allow`: the log write and the handoff transcription are real and must keep
working. Do not delete the "never execute" prose — narrow the grant to match it. Done when
the Step 0 probe's four commands are all still allow-matched and `git status` does not.

**T18.** In `tdd-orchestrator.md`: drop the `minCoverage` default (`D-07`), make the digest
line `- coverage gate: {declared threshold | GATES: NOT DECLARED}`, and rewrite Phase 4's
threshold branch: when the declaration carries no coverage row, report `GATES: NOT DECLARED`,
skip the loop, and proceed to review. Keep `maxTDDIterations` as is. `.agents/config/quality-gates.md`
is read, never edited (CON-03), and `tests/spec-quality-gates-declaration.test.js` must still
pass untouched.

### Phase 9 — R2 orchestrator behaviours (Batch I — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T20 | Insert the six canonical R2 behaviours: `pipelineMode`, step-boundary hash, `sessionID` capture/surface, `stepKey` + idempotence rule, caps enforcement, `deferred` ordering; re-point the taxonomy and the batch failure line at `STATUS: failed` only. | `.opencode/agents/orchestrator/orchestrator.md` | I | T6, T19 | |
| T21 | Same six, mapped to the fixed four-step pipeline; `observe` must print the four steps as built, including the parallel-coder batch split. | `.opencode/agents/orchestrator/feature-pipeline.md` | I | T7, T19 | |
| T22 | Same six, mapped to the six phases; `deferred` in the RED/GREEN batches and in VERIFY; the TDD loop is never entered by a deferral. | `.opencode/agents/orchestrator/tdd-orchestrator.md` | I | T8, T19 | |

**The canonical R2 text (T20, T21, T22).** These six items are quoted verbatim, and a test
(T24) asserts each string appears in all three files. Measured total: **2,098 B per
orchestrator** (a3 621, a1 269, a5 266, a6 334, a4 317, a7 237, plus the +54 B log-line change).

**a7 — `stepKey` rule, into the Step 3b/2b digest section (237 B):**

```text
**`stepKey`.** `{pipeline}:{step}` for a single-agent step, `{pipeline}:{step}:{TASK_ID}` for a parallel spawn. `attempt` starts at 1 and increments only when that same step is retried; it is not persisted — it lives in the log line.
```

**a1 — session capture, into Step 4 item 6 and the gate text (269 B):**

```text
**Capture the `sessionID`.** The `subagent` tool returns one per delegation. Record it in the step's log line and, on `failed` or `blocked`, print `resume session {sessionID}` in the gate or failure text. No store: the ID lives in the log line and the gate line only.
```

**a3 — `pipelineMode`, into `## Dynamic Parameters` (621 B):**

```text
- **pipelineMode**: `observe` | `confirm` | `auto`. In `observe` the orchestrator builds the pipeline, prints every ordered step and the exact delegation prompt it would send, and stops without delegating anything. `confirm` and `auto` mean `autoConfirm: false` and `true`. **Precedence:** `pipelineMode` wins over `autoConfirm` when both are set; `confirmationGates` is orthogonal — a gate fires only after a step that actually ran, so `observe` cannot reach one. `observe` prints, it never answers: the "scope never answers its own questions" rule is unchanged. Unset leaves `autoConfirm` in charge (non-executing).
```

**a4 — caps enforcement, into the digest section next to a7 (317 B):**

```text
**Digest caps.** On capture: `previous` over 40 words is cut at 40; `QUESTIONS` over 3 numbered items is cut at 3; `ARTIFACTS` prose is dropped; any field over one line is cut to its first. The report keeps the cut form; the log gains one `CAPPED: {field} {before}->{after}` line. The gate relays the captured form.
```

**a5 — `deferred` ordering, a new Step 4 item `8b` (after the taxonomy, before the gate) (266 B):**

```text
**`deferred` ordering.** A step returning `STATUS: deferred` is parked, not failed: log it, continue with every step that does not depend on it, and list it in Step 6 with what unblocks it. A deferral is never classified, never retried, never counted as a failure.
```

**a6 — spec drift, a new Step 4 item `5b` (334 B):**

```text
**Spec drift.** At each step boundary, hash the spec the step will run (`git hash-object <spec>`). When it differs from the previous step's hash, log one line — `SPEC DRIFT: {spec} {old7}->{new7}` — and continue. If this orchestrator's own spec changed since the run started, log one line naming it. Never cancel, never restart.
```

**Log line (T6 item 2 replaces the R1 payload; this replaces it again, +54 B):**

```text
step | STATUS | duration | stepKey={key}#{attempt} | session={sessionID} | spec={hash7} | ARTIFACTS | TOKENS | finding (one line)
```

Three fields are added and all three are keyed (`stepKey=`, `session=`, `spec=`), never
positional — `tracker.md`'s optional log read (T10) parses labels, so it survives the change.

**Placement, item by item.** `5b` and `8b` exist so the four Step-4 item numbers T6 already names
(6, 7, 8, 9) keep their identity — nothing in R2 renumbers a step. `feature-pipeline.md` mirrors
the same numbering on its Step 3. `tdd-orchestrator.md` has six phases with no numbered failure
item, so the same rules attach to each phase's existing failure rule and capture step.

| Item | `orchestrator.md` | `feature-pipeline.md` | `tdd-orchestrator.md` |
|---|---|---|---|
| a3 `pipelineMode` | `## Dynamic Parameters` | `## Dynamic Parameters` | `## Dynamic Parameters` |
| a6 spec drift | Step 4 item 5b | Step 3 item 5b | each phase, immediately before its delegation |
| a1 sessionID | Step 4 item 6 + item 9 | Step 3 item 6 + item 9 | each phase's capture step + its gate |
| log line | Step 4 item 7 | Step 3 item 7 | each phase's log step |
| taxonomy opener | Step 4 item 8 | Step 3 item 8 | Phase 2 f, Phase 3 f, Phase 4's "Tests fail" branch |
| a5 `deferred` | Step 4 item 8b + Step 6 | Step 3 item 8b + Step 4 | each phase's failure rule + Step 5 |
| a4 caps | Step 3b + gate item 9 | Step 2b + gate item 9 | Step 3b + every gate |
| a7 `stepKey` | Step 3b | Step 2b | Step 3b |

**The taxonomy opener changes (A5's hardest edge).** R1's T6 wrote "Classify a failed step
before reacting" and the batch rules say "if any task fails, stop". Both must be pointed at one
status value and nothing else:

```text
8. Classify a step whose `STATUS:` is `failed` before reacting. No other status enters this taxonomy.
```

and item f of each parallel block becomes "If any task returns `STATUS: failed`, classify it;
a task returning `deferred` is recorded and its dependants are held, not failed." Item 8 must
not contain the word `deferred` at all — the ordering rule lives in 8b. T24 asserts that
negative.

**`observe` reaches no gate.** The `observe` run stops before any delegation, so no producer
produces output, so `confirmationGates` never fires — the parameter precedes the gate, it does
not suppress it. `pipelineMode: auto` still does not relax a gate (the R1 rule "regardless of
`autoConfirm`" becomes "regardless of `autoConfirm` and of `pipelineMode: auto`").

**`deferred` in the TDD loop.** A `deferred` VERIFY step does not increment the TDD iteration
counter and does not enter the "Coverage < minCoverage" branch; it parks the phase and the
pipeline proceeds to Phase 5. A `deferred` RED or GREEN task holds only the phase's dependants.

**Done when (T20, T21, T22):** each of the three files contains the literal strings
`pipelineMode`, `stepKey`, `attempt`, `resume session`, `CAPPED:`, `SPEC DRIFT:`, `deferred`,
and `Classify a step whose`; each file's item-8 region contains no `deferred`; no sentence
anywhere still reads "If a required step fails, stop the pipeline"; the three lowercase
`knowledge-retrieval` occurrences and the `KNOWLEDGE-RETRIEVAL:` counts (2 / 2 / 6) are
unchanged.

### Phase 10 — R2 shared contract and harness (Batch J — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T23 | Add the three normalization-block bullets: a capped report is relayed capped, a failed/blocked step names its session in `Next:`, a deferred step reads `deferred — {unblocker}` in `Blocker:`. No new `##`. | `.agents/instructions/communication.instructions.md` | J | T13 | |
| T24 | New contract spec: asserts every canonical R2 string in all three orchestrators, the taxonomy isolation negative, the four-bold-line invariant, the 8-`##` invariant, and the five STATUS values. | `tests/spec-orchestrator-r2-contract.test.js` | J | T20, T21, T22, T23 | |
| T25 | Extend the byte harness: pin the digest fixture values, add the R2 block bytes and ceilings, add the per-block `R2 − R1 = 188` check, restate the targets, keep the non-vacuity run. | `tests/spec-delegation-budget.test.js`, `tests/fixtures/delegation-budget.json` | J | T15, T20, T21, T22 | |

**T23 — `.agents/instructions/communication.instructions.md` (+671 B).** Three bullets appended
to the existing bullet list in `## Orchestrator Normalization Block`, after the four-line rules
and after T13's three additions:

```markdown
- **A capped report is relayed capped.** When the orchestrator applied a cap under
  `.agents/config/step-report.md`, the verbatim relay is the captured form and the gate never
  restores removed prose. "Every finding survives" now means every finding the report carries;
  what was cut is named in one log line, never in the gate.
- **A failed or blocked step names its session.** `Next:` becomes `resume session
  {sessionID}`; nothing is re-authored and the block keeps its four bold lines.
- **A deferred step is not a failure.** `Blocker:` reads `deferred — {what unblocks it}`,
  and the pipeline continues with the independent steps. No retry prompt is emitted.
```

Bullet 1 is a **narrowing** of "every finding survives the normalization", not an exemption:
the producer's report is still relayed byte-for-byte, but the report it relays is the captured
one. RISK-01 widens accordingly (see Risks). No fifth `##` heading, no fifth bold line, no new
exemption.

**T24 — `tests/spec-orchestrator-r2-contract.test.js`.** Same extractor and
`countOccurrences` shape as the parity spec (copied locally, per DEP-07). One describe block per
behaviour, one negative block:

| Assertion | Shape |
|---|---|
| `pipelineMode` in all three files | `countOccurrences(content, 'pipelineMode') >= 1` |
| precedence sentence | each file contains `pipelineMode` and `wins over` and `orthogonal` |
| `observe` never answers | each file contains `it never answers` |
| a7/a4 in all three | `stepKey`, `attempt`, `CAPPED:` each `>= 1` per file |
| every delegation fence carries A2 | for each fence found by T14's finders: contains `- stepKey:` and `IDEMPOTENCE:` |
| `sessionID` surfaced | `resume session` `>= 1` per file, and never inside a delegation fence (SEC-04) |
| drift line | `SPEC DRIFT:` `>= 1` per file |
| taxonomy isolation (negative) | the text from `Classify a step whose` to the next `\n8b\.`/`\n9\.` item contains no `deferred` |
| `deferred` present | `>= 1` per file, and `> `count in item 8 |
| step-report.md | `STATUS:` line splits to exactly 5 values; `## Caps` contains `40` and `3` and `paths only`; literal `CAPPED: {field} {before}->{after}` |
| communication.instructions.md | exactly 8 `^## ` headings; the four bold lines appear in order; contains `resume session` and `deferred —` |
| four-bold-line invariant | `**Bottom line:**` / `**Files:**` / `**Blocker:**` / `**Next:**` each exactly once, in that order, inside the normalization fence |
| R2 added no receiver | `#### Applying documentation handoffs` still exactly 1 per file (CON-16; the parity spec already pins it, so this row is a second, cheaper tripwire) |

**T24 also proves A2 first (TEST-14).** Before T16's full gate, this task runs the A2 proof as
the first R2 artefact produced, because A2 is the highest-priority behaviour and a proof that
arrives last cannot change a wording decision. On a scratch branch, take a coder delegation whose
artifacts already exist, re-issue it with the same `stepKey` and `attempt: 2`, and record the
delegation text and the returned report in the Execution Record. A pass is a report returning
`done` whose `ARTIFACTS:` names the already-landed files with no re-edit. A fail means the
IDEMPOTENCE sentence is being read as "skip because a file exists" — the wording changes, never
the requirement (RISK-09).

**T25 — harness extension.** The fixture gains a pinned `digestValues` object (R1 left it
implicit, which is why its 643 / 714 / 807 could not be reproduced — see the note in
[R2 Net Byte Accounting](#r2-net-byte-accounting)), an `r2` byte map, and re-derived ceilings.
New assertions, all additive to TEST-05:

1. `r2[block] <= ceilings.r2[block]` for every block.
2. `r2[block] - r1[block] === 188` for every block — the strongest assertion available, because
   it catches a stray byte anywhere in the added text, not just a ceiling breach.
3. Single-spawn: `r2 <= 0.40 * baseline` (≥60% cut) for the standard and handoff blocks.
4. Six-coder batch: `6 * r2_coder <= 0.40 * (6 * baseline_coder)` (≥60% cut) — **restated from
   70%**; the number and the reason are in R2 Net Byte Accounting.
5. Wayfinding run: `runR2_delegations <= 0.60 * 20,702` (≥40% cut) **and**
   `runR2_delegations + proseDelta.total <= 0.60 * 20,702` — the prose cannot be excluded from
   the run claim.
6. `proseDelta.total === 3,668` from the fixture (`step-report.md` 899 + `communication` 671 +
   one orchestrator 2,098), so prose is in the totals and cannot be quietly dropped.

Non-vacuity (TEST-06) is retained unchanged and is run again at T16: revert one delegation fence,
confirm assertion 1 or 2 fails with a non-zero delta, restore, confirm green.

## Byte Measurement Baselines and Targets

Measured on disk on 2026-11-08, before any edit, with
`sed -n 'A,Bp' <file> | wc -c`. "Spawn baseline" = the delegation fence content **plus** the
`Step 3b`/`2b` section the template says to carry verbatim — that sum is what the orchestrator
actually emits today.

| Block | File | Lines | Fence bytes | Digest section | Spawn baseline | Post ceiling |
|---|---|---|---|---|---|---|
| Standard delegation | `orchestrator.md` | 247–255 | 1,127 | 1,814 (200–234) | **2,941** | 750 |
| Parallel coder | `orchestrator.md` | 292–300 | 1,242 | 1,814 | **3,056** | 850 |
| Standard delegation | `feature-pipeline.md` | 145–154 | 1,283 | 1,785 (92–125) | **3,068** | 750 |
| Parallel coder | `feature-pipeline.md` | 192–201 | 1,404 | 1,785 | **3,189** | 850 |
| Phase 1 implementer | `tdd-orchestrator.md` | 187–198 | 1,837 | 1,934 (126–161) | **3,771** | 900 |
| Phase 2 RED | `tdd-orchestrator.md` | 217–230 | 2,126 | 1,934 | **4,060** | 1,100 |
| Phase 3 GREEN | `tdd-orchestrator.md` | 256–271 | 2,051 | 1,934 | **3,985** | 1,100 |
| Phase 4 VERIFY | `tdd-orchestrator.md` | 292–307 | 1,793 | 1,934 | **3,727** | 900 |
| Phase 5 reviewer | `tdd-orchestrator.md` | 328–342 | 1,260 | 1,934 | **3,194** | 900 |
| Phase 6 tracker | `tdd-orchestrator.md` | 356–367 | 912 | 1,934 | **2,846** | 850 |

Draft post-edit text, measured with the fixture values already filled in: **643 B** standard
with the `write` DOC variant, **714 B** with the `handoff` variant, **683 B** with a budget
line, **807 B** coder slice (slice + digest + rules).

**Targets, validated against those measurements:**

| Target | Proposed | Verdict |
|---|---|---|
| Spawn preamble bytes | ≥60% down | **Achievable, 78.1%** (2,941 → 643) for a writer role, **75.7%** (→ 714) for a handoff role. Margin is wide. |
| 6-coder batch vs a 30-task plan, delegation bytes | ≥70% down | **Achievable, 73.6%** (6 × 3,056 = 18,336 → 6 × 807 = 4,842). Margin is **3.6 points**. |
| `wayfinding` run total (7 steps) | ≥40% down | **Achievable, ~75.4%** (6 × 2,941 + 3,056 = 20,702 → 6 × 714 + 807 = 5,091). |

Correction to the brief's framing: the ≥70% figure depends on two choices, both load-bearing.
The coder slice drops the `owned:` line (its `FILES` field covers it), and the `DOC` rule uses
the short `write` variant for grants that cover `docs/**` — the long handoff shape is carried
only by the two read-only roles that actually return a block (`unit-tester`, `e2e-tester`).
Re-adding either puts the batch at 69–70% and fails the target, which is exactly what the
ceiling test is for.

> **Superseded by R2.** The ≥70% figure above does not survive the R2 additions: measured
> **64.8%**. See [R2 Net Byte Accounting](#r2-net-byte-accounting). The two load-bearing choices
> it names still matter — re-adding `owned:` to the coder slice takes R2 to 63.6%, and using the
> handoff `DOC` variant for coder grants takes it to 62.4%, both under the restated ≥60% only
> because the ceiling is now the binding guard.

**What is *not* measured:** tokens. No paid run is made (CON-08), so every token claim in this
plan is a byte-count proxy. The `TOKENS:` field is an estimate by construction and is labelled
`unknown` when the agent cannot estimate.

## R2 Net Byte Accounting

The R2 behaviours add prompt text. This section measures what they cost and states which R1
target survives.

**Procedure (identical for R1 and R2).** Take the canonical delegation text for a block, replace
every `{placeholder}` with the pinned fixture value below, and count UTF-8 bytes with
`node -e 'Buffer.byteLength(s)'` — the same count `wc -c` gives for ASCII. Braces are always
substituted, so a `{…}` annotation inside the template is a template instruction, not rendered
text, and costs 0 rendered bytes. That is why A4's caps — which are instructions the orchestrator
applies — cost 0 B on the wire.

**The pinned fixture (new in R2).** R1 published post-edit sizes of 643 / 714 / 683 / 807 B but
never pinned the values it substituted, so those numbers could not be reproduced from the plan.
At the fixture below, R1's own text measures 672 / 745 / 710 / 889 — a spread of 27–82 B. That
spread is why the R2 delta is stated as an absolute (`+188 B`), which is fixture-independent,
and why the harness now pins `digestValues`:

```json
{
  "agent_name": "Coder - Implementation",
  "agent_file": "coder.md",
  "projectName": "@abarcenas/ai-workflow-template",
  "basePath": "/repo/ai-workflow-template",
  "step": "3 of 7",
  "role": "coder",
  "purpose": "implement T4",
  "stepKey": "feature:3:T4",
  "attempt": "1",
  "status": "done",
  "previous": "plan written; 18 tasks, 8 batches",
  "owned": ".opencode/agents/coder.md",
  "budget": "24000 total, 3428 this step"
}
```

**Where the +188 B goes.** Three changes ride in every delegation, and they are separable:

| Addition | Bytes | For |
|---|---|---|
| `- stepKey: {key} \| attempt: {n}` | 37 | A2 |
| `- IDEMPOTENCE: if this stepKey's artifacts already exist, continue from them; do not redo landed work.` | 103 | A2 |
| `RETURN:` line rewritten to carry the status enum, `ARTIFACTS: paths`, `QUESTIONS: ≤3` | 48 | **A5 11 B** + A4 37 B |
| **Total per delegation** | **188** | |

A2 is **140 B** of the 188 — 17% of the 807 B coder block it has to fit inside. That single
figure decides the batch target below.

**Where the prose goes.** No R2 behaviour needs to send the `sessionID` (SEC-04), the spec hash,
or the caps to a spawn, so all of that lands in the orchestrator's own text — loaded once per
run, not once per spawn:

| File | R2 prose delta | Read when |
|---|---|---|
| `.opencode/agents/orchestrator/*.md` (the one that runs) | **2,098** | once per run |
| `.agents/instructions/communication.instructions.md` | **671** | once per run (the orchestrator reads it for its own replies) |
| `.agents/config/step-report.md` | **899** | definition, normally reference-only; counted because it is readable |
| **Per-run total** | **3,668** | |

All three orchestrator files receive the same 2,098 B, so the patch's total prose cost across the
three is 6,294 B even though only one file loads per run.

**Measured, both revisions, one fixture:**

| Block | Baseline | R1 published | R1 @ fixture | R2 @ fixture | Δ | R2 cut vs baseline | R2 ceiling |
|---|---|---|---|---|---|---|---|
| `orchestrator.standard` (write) | 2,941 | 643 | 672 | **860** | +188 | **70.8%** | 950 |
| `orchestrator.standard` (handoff) | 2,941 | 714 | 745 | **933** | +188 | **68.3%** | 1,030 |
| `orchestrator.standard` (write + budget) | 2,941 | 683 | 710 | **898** | +188 | 69.5% | 950 |
| `orchestrator.parallelCoder` | 3,056 | 807 | 889 | **1,077** | +188 | **64.8%** | 1,190 |

`feature.standard` and `feature.parallelCoder` carry the same rendered text (the R2 template is
shared), so their R2 bytes are 860 and 1,077 against baselines of 3,068 and 3,189 — **72.0%** and
**66.2%** down. The six TDD phase blocks each gain the same 188 B; their R1 ceilings were
900 / 1,100 / 1,100 / 900 / 900 / 850, so the provisional R2 ceilings are those plus 190:
1,090 / 1,290 / 1,290 / 1,090 / 1,090 / 1,040. T16 re-derives every ceiling as
`measured + 10%`, because the R1 ceilings were themselves under-measured (the coder ceiling of
850 was below the 889 B that R1's own text measures at this fixture).

**Per-run numbers:**

| Metric | R1 | R2 (delegations only) | R2 (+ run prose) |
|---|---|---|---|
| Six-coder batch | 6 × 3,056 = 18,336 → 4,842 (73.6%) | 18,336 → 6,462 (**64.8%**) | 18,336 → 10,130 (44.8%) |
| `wayfinding` run (6 writer/handoff + 1 coder) | 20,702 → 5,091 (~75.4%) | 20,702 → 6,675 (**67.8%**) | 20,702 → 10,343 (**50.0%**) |

The `wayfinding` figure keeps R1's conservative choice of counting all six non-coder spawns at
the larger handoff variant; the real run is 4 writers + 2 handoff roles + 1 coder and would be
cheaper.

**Targets, restated against the measured values:**

| Target | R2 measured | Verdict |
|---|---|---|
| Single-spawn preamble ≥60% down | 70.8% writer, 68.3% handoff | **Holds.** Margin 8.3 points. |
| Six-coder batch ≥70% down | 64.8% | **FAILS.** At R1's own fixture it is 807 + 188 = 995 → 5,970 → 67.4%, so it fails there too. |
| `wayfinding` run ≥40% down | 67.8% delegations, 50.0% with prose | **Holds.** Margin 10.0 points even after prose. |

**The target gives, not the feature.** A2 costs 140 B on a block that is 807 B, and the batch
target had 3.6 points of margin — a per-spawn budget of 916.8 B for 70%. No wording of A2 that
still says "continue from artifacts that already exist rather than redo the work" fits in
109 B, and A5's enum needs 11 more. The honest restatement is:

- **Six-coder batch target: ≥60%**, measured **64.8%**.
- **The binding assertion becomes the per-spawn ceiling** (1,190 B for a coder, 950 B for a
  standard writer). A ratio is fixture-dependent — the slice grows with `DESCRIPTION` and
  `FILES` length, which is why R1's own published 73.6% is 70.9% at the pinned fixture before a
  single R2 byte is added. A ceiling is not fixture-dependent.
- The ≥40% run target and the ≥60% single-spawn target are unchanged.

## R2 Contract Interactions

Five collisions, each resolved, each with the file that carries the resolution and the test that
would catch a regression.

| # | Collision | Resolution | File | Test |
|---|---|---|---|---|
| 1 | **A2 vs RISK-02** — a `stepKey`/`attempt` line on every delegation pushes the coder block past the 850 B ceiling that carried the 73.6%. | The ceiling rises to **1,190 B** (measured 1,077 + 10%); the six-coder target falls to **≥60%** (measured 64.8%); the fixture pins the substituted values so the number is reproducible. The `DOC:` variant split is untouched — the `write` variant still serves coder grants. | `tests/fixtures/delegation-budget.json` | `tests/spec-delegation-budget.test.js` (TEST-12) |
| 2 | **A3 vs `confirmationGates`** — does `observe` suppress a gate or precede it? | It **precedes** it. A gate fires only after a producer's output; `observe` delegates nothing, so it reaches no gate. `pipelineMode` beats `autoConfirm` when both are set; `confirmationGates` is orthogonal and is not relaxed by `pipelineMode: auto`. | `.opencode/agents/orchestrator/orchestrator.md` (`## Dynamic Parameters`, a3) | `tests/spec-orchestrator-r2-contract.test.js` (TEST-13) |
| 3 | **A4 vs the gate presentation** — the gate relays the structured report verbatim, so a capped field must not reappear there. | The cap is applied **at capture**, before the gate; the gate relays the captured form; the removed bytes are named in one `CAPPED:` log line. `communication.instructions.md` states that "every finding survives" now scopes to what the report carries. The four bold lines and their order are unchanged. | `.agents/instructions/communication.instructions.md` (`## Orchestrator Normalization Block`) | `tests/spec-orchestrator-r2-contract.test.js` (TEST-13) |
| 4 | **A5 vs the W5 taxonomy** — R1 replaced "any failure stops the pipeline" with three classes; `deferred` must not be reachable from `failed`. | The taxonomy opens on exactly one status: "Classify a step whose `STATUS:` is `failed`. No other status enters this taxonomy." The parallel-block rule moves from "if any task fails" to "returns `STATUS: failed`". `deferred` is handled by item 8b and appears nowhere in item 8, asserted as a negative. | `.opencode/agents/orchestrator/orchestrator.md` (items 8, 8b, and the batch rule) | `tests/spec-orchestrator-r2-contract.test.js` (TEST-13) |
| 5 | **A6 vs the parity block-finder** — the parity spec finds blocks by `Work on "…`, and R1 already moves that anchor. | R1's T14 moves the finder to `CONTEXT DIGEST` + `owned:` (standard) and `TASK SLICE` + `"Coder - Implementation"` (coder). R2 adds lines **inside** the digest and touches neither marker, so T14's finder stands unchanged; R2 adds only the negative that no delegation may contain `Work on "` again. A6's `git hash-object` is a shell command, which interacts with T17 — see DEP-08. | `tests/spec-orchestrator-parity.test.js` | `tests/spec-orchestrator-parity.test.js` (TEST-11) |

Two further interactions are resolved inside the task text rather than the table: the log line
gains three **labelled** fields (`stepKey=`, `session=`, `spec=`) so `tracker.md`'s optional log
read stays a label parse rather than a positional one (T20, T23); and the `STATUS` enum moves
into the delegation's `RETURN:` line because `.agents/config/step-report.md` is explicitly not a
per-spawn read (T19).

## Alternatives

| ID | Alternative | Rejected because |
|----|-------------|------------------|
| ALT-01 | Add a durable run journal so a crashed run resumes. | Explicitly rejected in shaping (D-3). It buys duration, not cost per completed unit, and it is the largest scope increase on the table. |
| ALT-02 | Add a size-based pipeline selector that skips phases for small tasks. | Rejected in shaping (D-3). It changes the shape to save tokens, and the shape was ruled correct. |
| ALT-03 | Let the coder read only its task row with `sed -n '<range>p' plan/…`. | Still a plan read, and it couples every coder to line numbers that drift the moment an earlier task edits the plan. D-5 forbids the read outright. |
| ALT-04 | Keep `knowledge-retrieval.instructions.md` in the delegation and add "do not read it". | A contradictory instruction: the cheapest reading of it is to read the file. The protocol name alone (`KNOWLEDGE-RETRIEVAL:`) carries the duty without the path. |
| ALT-05 | Add a fifth communication exemption for the five-line reply. | The envelope already exempts a subagent→orchestrator reply under Exemption 3, so no exemption is needed. A new named exemption would widen a hole for every reply. |
| ALT-06 | Rely on prompt caching alone, with no prompt rewrite. | A cache miss still pays full price, and the per-spawn file reads are separate inputs, not a cached prefix. Caching multiplies a saving; it does not create one. |
| ALT-07 | Make `tokenBudget` a hard stop. | Rejected in shaping (D-7). A stop costs a half-finished run and a user intervention; a warning costs one line. |
| ALT-08 | Delete the orchestrators' `shell` grant entirely. | The Step 0 probe needs `test -s`, `test -f`, `grep -q`, and the run needs `git rev-parse`. Narrowing matches the prose; deleting breaks the probe (T17). |
| ALT-09 | Keep `feature-pipeline.md`'s newest-`/plan/`-by-mtime scan and declare it legal. | A filesystem-order guess is nondeterministic, and the implementer's `ARTIFACTS:` already names the plan. Merged into T4 (W8(c)). |
| ALT-10 | Add a sixth report line for the step number and agent. | The digest already carries both; a sixth line breaks the "exactly five" contract that makes the report parseable and cheap. |
| ALT-11 | Keep the documentation-handoff file read and inline only the knowledge-retrieval protocol. | Leaves one mandatory read in place for every read-only agent (8 of 12 roles), defeating REQ-02. Inlining the block shape and keeping the canonical file as its authority preserves the contract (CON-05). |
| ALT-12 | Have the orchestrator read the plan per coder spawn instead of once per run. | That is the defect being removed. One read per run is the bounded exception; N reads is the cost. |
| ALT-13 | A persisted session store (a JSON file keyed by step) instead of log-only `sessionID`s. | Rejected. A file is a new artifact, a new write path, and a new failure mode (stale entries resuming a finished step). The ID is already printed by the tool and the log line is already written every step; a store buys nothing the grep of one line does not. |
| ALT-14 | A real resume journal (checkpoint per step, replay from the last one) instead of `stepKey` idempotence. | Rejected. It is the durable run journal ALT-01 already refused, and it changes what the orchestrator *is*. `stepKey` + "continue from existing artifacts" gets the same saving with no state: the artifact is the checkpoint. |
| ALT-15 | `observe` as a separate agent (`dry-run-orchestrator.md`) instead of a parameter. | Rejected. CON-02 forbids a new agent, and a second orchestrator would drift from the first — the digest, the caps, and the gate rules would need two copies. One parameter is one line of precedence. |
| ALT-16 | A5 via a retry counter (defer = attempt 2) instead of a new status value. | Rejected. A counter cannot distinguish "not finishable now" from "failed twice", so a deferral would be retried and billed; and it would make `deferred` reachable from `failed`, which is exactly the edge A5 exists to cut. |
| ALT-17 | Keep the ≥70% six-coder target and shorten the A2 text to fit 109 B. | Rejected. The shortest wording that still states *continue from existing artifacts rather than redo the work* is 140 B before A5's 11 B enum. Shrinking it further produces a rule a reader can argue with, and CON-15 forbids the unmeasured claim that would result. The ceiling, not the ratio, is the binding guard. |

## Dependencies

| ID | Dependency | Notes |
|----|-----------|-------|
| DEP-01 | Node ≥22 and the installed dev dependencies (`vitest ^4.1.8`, `@playwright/test ^1.59.1`). | Already in `package.json`; no install change. |
| DEP-02 | Playwright browsers already installed for the `7 passed / 1 skipped` baseline. | If absent, T16 records `playwright: not run (browsers absent)` rather than failing the plan. |
| DEP-03 | `.agents/config/quality-gates.md` exists and declares no gates and no coverage row. | Verified. Read-only for this plan (CON-03). |
| DEP-04 | `docs/.architecture-context.md` exists with `##` sections, so Step 0 skips bootstrap. | Verified, 6,887 B. |
| DEP-05 | `docs/.orchestrator-log.md` exists for the W7 fallback path. | Verified, 12,349 B. |
| DEP-06 | `scripts/sync.js` discovers `.agents/**` by directory walk (`collectFiles`), so the new `step-report.md` ships with no list edit. | Verified at `scripts/sync.js:419`. |
| DEP-07 | The parity spec's fence extractor is local to that test; T15 copies it rather than importing. | No shared-helper refactor, which would widen the diff. |
| DEP-08 | A6's `git hash-object` needs the orchestrator's `shell` grant. Today the grant is `*` allow, so it works. **If T17 (optional, Batch H) is approved, its allowlist must gain `git hash-object*`, or A6's probe is denied.** | T17 is unamended per the user's instruction; recorded here so the two are not approved independently without noticing. RISK-08. |
| DEP-09 | `git` is present in every consumer checkout (the orchestrators already call `git rev-parse` for the `branch:` digest line). | If absent, A6 logs `SPEC DRIFT: unverifiable` once and continues — never a stop. |

## Files

| ID | File | Action |
|----|------|--------|
| FILE-01 | `.agents/config/step-report.md` | create (T1) then edit (T19: enum, deferred bullet, `## Caps`) |
| FILE-02 | `.agents/config/README.md` | edit (one section) |
| FILE-03 | `.opencode/agents/orchestrator/orchestrator.md` | edit (T3, T6, T20) |
| FILE-04 | `.opencode/agents/orchestrator/feature-pipeline.md` | edit (T4, T7, T21) |
| FILE-05 | `.opencode/agents/orchestrator/tdd-orchestrator.md` | edit (T5, T8, T22) |
| FILE-06 | `.agents/instructions/communication.instructions.md` | edit (T13 three additions, T23 three additions; no exemption) |
| FILE-07 | `.opencode/agents/coder.md` | edit |
| FILE-08 | `.opencode/agents/tracker.md` | edit |
| FILE-09 | `.opencode/agents/{architect,deployer,designer,e2e-tester,implementer,researcher,reviewer,scope,unit-tester}.md` | edit (one sentence each) |
| FILE-10 | `.opencode/agents/{architect,deployer,designer,e2e-tester,implementer,planner,researcher,reviewer,scope,unit-tester}.md` | edit (one line each) |
| FILE-11 | `tests/spec-orchestrator-parity.test.js` | edit |
| FILE-12 | `tests/spec-delegation-budget.test.js` | create |
| FILE-13 | `tests/fixtures/delegation-budget.json` | create (T15) then edit (T25: `digestValues`, `r2`, ceilings, `proseDelta`) |
| FILE-14 | `plan/refactor-orchestrator-token-cost-v1.md` | edit (Execution Record only) |
| FILE-15 | `tests/spec-orchestrator-r2-contract.test.js` | create (R2) |
| — | `.agents/config/quality-gates.md`, `skills-lock.json`, `.agents/skills/**`, `AGENTS.md`, `docs/.architecture-context.md` | **not touched** |

## Testing

| ID | Check | Command | Pass condition |
|----|-------|---------|----------------|
| TEST-01 | Unit suite | `npm run test:unit` | 0 failures; file count ≥ 31; test count ≥ 910 |
| TEST-02 | E2E structure suite | `npx playwright test` | 7 passed, 1 skipped |
| TEST-03 | Parity counts | `npx vitest run tests/spec-orchestrator-parity.test.js` | all pass; `KNOWLEDGE-RETRIEVAL:` = 2 / 2 / 6; `/plan/` absent from every coder block |
| TEST-04 | Gate declaration | `npx vitest run tests/spec-quality-gates-declaration.test.js` | all pass, file untouched |
| TEST-05 | Byte budget | `npx vitest run tests/spec-delegation-budget.test.js` | every block ≤ ceiling; preamble ≥60%; 6-coder ≥60% (R2 restatement); wayfinding ≥40% |
| TEST-06 | Non-vacuity | revert one block, re-run TEST-05, restore | the reverted block fails with a non-zero delta; restored run is green |
| TEST-07 | Read-trigger sweep | `grep -rn 'Read the plan file\|knowledge-retrieval.instructions.md\|carry the Step 3b block verbatim' .opencode/agents/` | no hits in any delegation fence |
| TEST-08 | Reference-line counts | `for f in .opencode/agents/*.md .opencode/agents/orchestrator/*.md; do grep -c 'communication.instructions.md' "$f"; done` | `1` for each of 15 |
| TEST-09 | Step-report wiring | `for f in .opencode/agents/*.md; do grep -c 'step-report.md' "$f"; done` | `1` for each of 12 |
| TEST-10 | Knowledge-retrieval contract | `npx vitest run tests/spec-knowledge-retrieval.test.js` | all pass (case-sensitive `knowledge-retrieval` still present per file) |
| TEST-11 | Parity, R2 shape | `npx vitest run tests/spec-orchestrator-parity.test.js` | `KNOWLEDGE-RETRIEVAL:` = 2 / 2 / 6; every delegation found by the `CONTEXT DIGEST` + `owned:` / `TASK SLICE` + `"Coder - Implementation"` finders; no delegation contains `Work on "` |
| TEST-12 | Byte harness, R2 | `npx vitest run tests/spec-delegation-budget.test.js` | every `r2` block ≤ its R2 ceiling; `r2 − r1 === 188` per block; 6-coder ≥60%; `proseDelta.total === 3668` |
| TEST-13 | R2 contract | `npx vitest run tests/spec-orchestrator-r2-contract.test.js` | every canonical string in all three orchestrators; item-8 region free of `deferred`; `sessionID` outside every delegation fence; exactly 8 `##` and four bold lines in `communication.instructions.md` |
| TEST-14 | A2 proof (manual) | scratch branch: re-delegate one coder step with an existing `stepKey` | the step returns `done` without re-editing; delegation text and returned report recorded in the Execution Record |

## Risks & Assumptions

| ID | Risk / Assumption | Impact | Mitigation |
|----|-------------------|--------|-----------|
| RISK-01 | The five-line report drops a finding that prose used to carry, so a gate reviewer decides on less information. | Medium — a mis-approval costs a whole run. | `ARTIFACTS:` is mandatory and the tracker reads artifacts, not prose; the full work product is still on disk. Recorded as an accepted cost of D-2, not a hidden one. **R2 narrows this further:** A4 caps `previous` at 40 words and `QUESTIONS` at 3 items, so a gate can relay a report the orchestrator truncated. The trade is explicit — the removed bytes are named in a `CAPPED:` log line, the gate never restores them, and "every finding survives" now scopes to what the report carries (T23). |
| RISK-02 | The 73.6% six-coder figure rests on the DOC variant split: if the long handoff shape is used for coder grants, the batch drops to ~69% and fails. | Low — visible, test-caught. | The grant-to-variant mapping is stated once in Step 3b; the 850 B coder ceiling is the contract. T16 records the measured value and adjusts a ceiling only with a written reason. |
| RISK-03 | The parity test's block finders silently return `null` after the rewrites, and `expect(block).not.toBeNull()` catches it — but only if T14 lands with T3–T5. | Medium — a red suite blocks the patch. | T14 is in the same execution wave as the rewrites' tests, and Batch F depends on Batch B explicitly. |
| RISK-04 | `spec-knowledge-retrieval.test.js` TEST-03 uses a case-sensitive `knowledge-retrieval` check; `KNOWLEDGE-RETRIEVAL:` does not match. | Low, but a silent red. | Every orchestrator file keeps one lowercase occurrence in its Step 3b prose; T16 greps for it. |
| RISK-05 | Narrowing `shell` (T17) breaks the Step 0 probe if a pattern is wrong, and the orchestrator then bootstraps every run. | Medium, optional batch. | Only four patterns; T17's done-when runs all four probe commands against the new grant. |
| RISK-06 | The cache-prefix claim is unverified without a paid run; cache hit rate is not measured. | Low — the ordering is still correct. | The plan claims only that the prefix is *stable and longest-first*, not that a provider cached it. |
| ASSUMPTION-01 | Prompt bytes are a valid proxy for token cost across these models. | Bytes under-count CJK and over-count ASCII; all delegation text here is ASCII. | Recorded as a proxy in the measurement section. |
| ASSUMPTION-02 | The orchestrator can read the plan's tables without violating its "never read project files" doctrine, because the doctrine now lists three named exceptions. | The doctrine text must change in three places per file or the rule is self-contradictory. | T6 item 8 rewrites the intro and both Guidelines bullets together. |
| ASSUMPTION-03 | `planner.md` is never spawned by an orchestrator, so T11 can exclude it. | Verified across all three registries and Step 2's pattern list. | T12 still binds it to the report format. |
| ASSUMPTION-04 | Adding `.agents/config/step-report.md` needs no `scripts/sync.js` edit. | Verified: `collectFiles` walks `.agents/`. | DEP-06; T16 can confirm with `npx vitest run scripts/sync-unit.test.js`. |
| RISK-07 | The root-spec line "the five-line step report defined in `.agents/config/step-report.md`" is a pointer a spawn may resolve into a read, costing ~899 B per spawn and partly undoing L2. | Medium — silent, and it grows with the R2 additions to that file. | The digest's `RETURN:` line already names every field and every status value, so a spawn has nothing to gain by opening it; T9/T11 tell the agent its read set is the spec plus one file. Accepted and recorded, not hidden: the plan cannot test a read that does not happen in CI. |
| RISK-08 | A6 calls `git hash-object`, which T17's narrowed shell allowlist would deny if Batch H is approved without noticing DEP-08. | Medium, and it only bites on an optional batch. | DEP-08 names it, and T17 is unamended per the user's instruction — so approving T17 requires adding `git hash-object*` to the allowlist in the same change, not later. |
| RISK-09 | A2's idempotence instruction is read as "a file exists, so skip", and a half-landed change is reported `done`. | High if it happens: a silently incomplete step costs a review cycle at minimum. | The rule says "if this stepKey's artifacts already exist, **continue from them**; do not redo landed work" — continue, not skip — and the step must still return `ARTIFACTS:`. A step that cannot tell returns `blocked`, naming the missing artifact, which is already a first-class status. Accepted cost of A2; it is the user's highest-priority item and the alternative is re-running the work. |
| RISK-10 | A5's `deferred` becomes a way to avoid a hard step, and the pipeline advances with the work parked. | Medium — a deferred step that nobody unblocks is a silent omission. | Step 6 must list every deferred step with its unblocker, the Output Format's overall status cannot read `✅ Complete` while one exists (it reads `⚠️ Partial`), and TEST-13 asserts the ordering rule exists. |
| RISK-11 | `observe` prints a rendered delegation, and the run that follows prints it again — two copies that can drift. | Low. | `observe` prints the rendered prompt, not a template; the orchestrator has exactly one delegation template per step, so there is nothing to drift against. |

## Related Specifications

| Document | Relationship |
|---|---|
| `plan/process-communication-standard-v1.md` | Owns the four-slot envelope, the 40-line cap, the normalization block, and the documented `grep -c` static check at line 537 that T12 must not break. |
| `plan/refactor-agent-portability-v1.md` | Owns `.agents/config/quality-gates.md`, the `NOT DECLARED` contract, and the read-only shell-allowlist pattern T17 copies. |
| `.agents/instructions/knowledge-retrieval.instructions.md` | The protocol whose *duty* is preserved and whose *file read* is removed. |
| `.agents/instructions/documentation-handoff.instructions.md` | The canonical handoff block. Unchanged by this plan (CON-05). |
| `.agents/instructions/communication.instructions.md` | Envelope, Exemptions 1–3, normalization block. T13 adds mapping text; T23 adds the capped-relay, session, and deferred bullets. |
| `.agents/config/quality-gates.md` | The declaration T18 reads and this plan never edits. |
| `.agents/config/step-report.md` | Owns the five-line report (T1) and, after R2, the `deferred` status and the four digest caps (T19). Every orchestrator points at it; the digest carries its content inline. |
| `docs/.architecture-context.md` | Unchanged; still the Step 0 probe target and the `architecture-context` conditional read. |
| `memory-bank/progress.md`, `memory-bank/activeContext.md` | Receive the execution record through the documentation handoff. |

## Execution Record

_(Append per task at execution time; replace targets with measured values.)_

| Task | Date | Measured / Verified |
|---|---|---|
| T16 | | `npm run test:unit` → __ / __; `npx playwright test` → __ / __; parity → __; budget → __; non-vacuity → __ |
| T19 | 2026-11-08 | `step-report.md` 1141 B total (≤1150 cap), delta +244 B; STATUS values 5 (`deferred` added); `## Caps` present with 4 caps |
| T20–T22 | | per-orchestrator prose delta __ B (target 2,098); canonical strings present __/3 |
| T23 | | `communication.instructions.md` delta __ B (target 671); `##` count __ (target 8) |
| T24 | | R2 contract spec → __ passed / __ failed; A2 proof → __ |
| T25 | | `r2 − r1` per block → __ (target 188); ceilings → __; 6-coder cut __% (target ≥60) |
| T16 (R2) | | prose total __ B (target 3,668); `wayfinding` R2 cut __% delegations / __% with prose |

## R2 Execution Record (2026-11-08)

R2 is scoped to `orchestrator.md` **only**. `feature-pipeline.md` and `tdd-orchestrator.md` were reverted to R1 — both are fixed-shape pipelines that cannot amortize the R2 static cost.

| Task | Completed | Evidence |
|---|---|---|
| T16 | 2026-11-08 | `npx vitest run` — 33 files / 1,049 passed / 0 failed, exit 0. Gates `GATES: NOT DECLARED` (zero declared). Pins 5/5/8, 5/4/7, 1/1/1, 0/0/0, 1/1/1. Discrimination proven: 2/43 red on mutation, tree restored sha256-identical. |
| T20 | 2026-11-08 | R2 landed in `orchestrator.md`, then compressed to a single `## R2 contract` section; 35,411 → **29,085 B**. |
| T21, T22 | 2026-11-08 — reverted | R2 removed by T27/T28; both files carry **0** of the seven R2 markers. |
| T23 | 2026-11-08 | `communication.instructions.md` — 8 `##` headings; `resume session` ×1, `deferred —` ×1. |
| T24 | 2026-11-08 | `tests/spec-orchestrator-r2-contract.test.js` 43/43 green; A2 mutation → 2 red, restored sha256-identical. |
| T25 | 2026-11-08 | `r2 − r1` = 188 per block (37 + 103 + 48); 868 / 941 / 906 / 1045 against ceilings 950 / 1030 / 950 / 1190. |
| T26–T30 | 2026-11-08 | Added during execution; recorded in `memory-bank/progress.md`. The plan was never amended to R3. |

**Final sizes:** `orchestrator.md` 29,085 B · `feature-pipeline.md` 22,824 B · `tdd-orchestrator.md` 37,860 B · `.agents/config/step-report.md` 1,141 B · `tests/fixtures/delegation-budget.json` 3,550 B.

**End-to-end economics:** static growth 2,876 B + run prose 3,613 B = 6,489 B; per-spawn saving 2,073 B; **break-even ⌈6,489/2,073⌉ = 4 spawns**. `quick-fix` (3) **−478 B**; `wayfinding` (7) **+7,522 B**; six-coder (6) **+5,577 B**.

**Batch H (T17, T18) declined** — left unstamped. Nothing depends on it.

## Batch H Execution Record (2026-11-10) — UNDECLINED

Batch H is no longer optional; both tasks are complete.

| Task | Completed | Evidence |
|---|---|---|
| T17 | 2026-11-10 | `.opencode/agents/orchestrator/orchestrator.md` frontmatter: one broad `allow` replaced by `deny *` plus three allows — `test -*`, `grep -q *`, `git hash-object*`. **Amended from the plan:** `git hash-object` added (A6's spec-drift check depends on it; DEP-08/RISK-08), `git rev-parse` dropped (0 occurrences in the file). Step 0 probe verified byte-identical. File 29,085 → **29,297 B** (+212). |
| T18 | 2026-11-10 | `.opencode/agents/orchestrator/tdd-orchestrator.md`: hardcoded `minCoverage: 90` removed; the threshold is read from `.agents/config/quality-gates.md`, and an undeclared threshold reports `GATES: NOT DECLARED` with the coverage gate **advisory** — measured coverage is reported, no gate failure is claimed against an invented number, and the loop does not branch back on coverage. `maxTDDIterations: 3` retained as a loop cap, not a gate. File 37,860 → **41,538 B**. |

**Re-baselined pins:** `staticGrowth.current` orchestrator 29,297 (growth 3,088), tdd 41,538 (growth 10,633); `breakEven.staticGrowthOrchestrator` 6,701; `breakEvenSpawns` **4** (ceil(6,701/2,073) = 4); quick-fix **−690 B**; wayfinding **+7,310 B**; six-coder **+5,365 B**. No ceiling, per-spawn block size, or `r2` value changed — no contract regression.

**Suite:** `npx vitest run` → 33 files / 1,049 tests passed, exit 0.
