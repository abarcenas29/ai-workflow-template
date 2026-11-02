---
goal: "Make the rewritten reviewer, unit-tester, agent.instructions and orchestrator delegation templates portable across every consuming project: declare gates in one project-owned config document, de-freeze every census, and replace the unsatisfiable 'update the memory bank' instruction with a role-aware documentation handoff"
version: 1
date_created: 2026-11-02
status: Completed
tags: [refactor, agent-definitions, portability, quality-gates, unit-tester, reviewer, orchestrator, memory-bank, documentation-handoff, template, permissions]
---

# Refactor: Agent Definition Portability

![Status: Completed](https://img.shields.io/badge/status-Completed-green)

## Introduction

**Status:** Completed 2026-11-02 — all 16 tasks implemented, plus the user-approved RISK-01 fix in
`scripts/sync.js` and its test (see "Execution Record").

Branch `feat/agent-definition-remediation` (HEAD `9015a39`) rewrote three agent definitions and `AGENTS.md`. The doctrine is a real gain: gate order, `SKIPPED` with a consequence, three-run failure classification, arithmetic count proof, discrimination proof, merge line-accounting, verification basis, role boundaries.

The defect is that the rewrite hardcoded **one consumer project's CI** into files that ship to every project. This repository has no `nx.json`, no `apps/`, no `libs/`, no `firebase.json`, no `.npmrc`, and its only workflows are `npm-publish.yml` and `pr-test.yml` — yet `unit-tester.md` declares eight gates (G1–G8), all eight unrunnable here, and cites two workflow files that do not exist. `reviewer.md`'s allowlist names seven commands that cannot be typed in this repository.

Three additional defects ride along:

1. `.agents/instructions/agent.instructions.md` carries a **frozen census** ("15 agent files", "40 edit rules", "63 shell rules", "65 allow / 38 deny") that is wrong the moment a consumer adds an agent.
2. Eight orchestrator delegation sites still order **every** sub-agent to write `memory-bank/` and run `memory_bank_memory_update` — unsatisfiable for a test-files-only agent (`unit-tester`) and for a `.md`-only agent whose grant does not include `memory-bank/**`.
3. No orchestrator currently applies a `## Documentation handoff` block, so the handoff doctrine the unit-tester already documents has no receiving end.

**In scope:** `.agents/config/quality-gates.md` (new), `.opencode/agents/unit-tester.md`, `.opencode/agents/reviewer.md`, `.agents/instructions/agent.instructions.md`, `.agents/config/README.md`, and the three orchestrator templates.

**Out of scope:** `AGENTS.md` (its plan-table change is already generic and is this plan's table contract), `.agents/config/domain.md`, `.agents/config/issue-tracker.md`, every source file (`scripts/**`, `bin/**`, tests), `package.json`, `skills-lock.json`, any new dependency, any permission widening.

**Inventory correction (spot-checked, not assumed).** The brief's ground truth said "no `scripts/`". `scripts/` **does** exist (sync, memory, knowledgebase, setup helpers). What is absent is every script the current `unit-tester.md` names: `scripts/sum-test-counts.js`, `scripts/assert-built-css.js`, `scripts/check-coverage.js`.

The conclusion is unchanged — all eight gates are unrunnable here — but the plan does not repeat the false claim. Verified: `ls nx.json apps libs firebase.json .npmrc` → all absent; `ls scripts/{sum-test-counts,assert-built-css,check-coverage}.js` → all absent; `ls .github/workflows` → `npm-publish.yml pr-test.yml` only.

**Hard acceptance rule.** After every Phase 1–2 edit, the forbidden-token scan in TEST-01 returns exactly `0`.

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T4, T5, T6, T7, T8 | Yes — seven different files | — |
| B | T3, T9 | Yes — two different files | A (T3←T2, T9←T1) |
| C | T10, T11, T12, T13, T14 | Yes — read-only verification | B |
| D | T15 | No (single) — whole-set verification | C |
| E | T16 | No (single) — documentation record | D |

Batch C tasks only read and grep; they do not edit, so they cannot collide. Every task in Batch A touches a file no other Batch A task touches. `T3` and `T2` edit the same file, so they are split across batches on purpose.

## Shared Text Blocks (copy verbatim)

Three literals recur across Phase 1. Copy them exactly; the verification greps in Phase 3 match these strings.

**BLOCK-A — role-aware memory-bank pair (orchestrator delegation templates).** Two bullets, replacing the single memory-bank bullet at each site. Match the surrounding bullet indentation: column 1 in the standard and Phase 1 / Phase 4 blocks, three spaces in the TDD Phase 2 and Phase 3 blocks.

```text
- Memory bank: read `.agents/instructions/memory-bank.instructions.md` for task/file conventions, and use `memory_bank_memory_search` / `memory_bank_memory_get` for context.
- Documentation write: if your edit grant covers `memory-bank/**` or `docs/**`, update those files and run `memory_bank_memory_update`; otherwise return a `## Documentation handoff` block as the last section and do not attempt the write — the orchestrator applies it.
```

The read side stays for every agent. Only the write side is conditional. Do **not** delete the memory-bank guidance; do **not** introduce a per-agent exception list (the grant itself is the condition).

**BLOCK-B — the orchestrator's receiving end (new subsection, one per orchestrator file).**

```text
#### Applying documentation handoffs

A sub-agent whose edit grant does not cover `memory-bank/**` or `docs/**` returns a
`## Documentation handoff` block instead of writing. This is the one write the
orchestrator performs itself, and it is transcription, not authoring. After capturing
any sub-agent summary:

1. **Detect** — look for a `## Documentation handoff` heading in the returned summary.
2. **Apply** — for each `**Target:**` entry, append the payload to that file; create it only if absent. Never overwrite, never rewrite `activeContext.md` or `progress.md` wholesale.
3. **Reindex** — run `memory_bank_memory_update` once, after every entry from that step is applied.
4. **Record** — log `handoff applied: {targets}`. If a summary carries no handoff and the agent's grant could not write documentation, log `documentation not recorded`; never assume it happened.
```

**BLOCK-C — the `NOT DECLARED` rule (quoted in `quality-gates.md` and restated in `unit-tester.md`).**

```text
A gate that is not declared in this file is reported as `NOT DECLARED`. It is never
invented, never substituted with a near-equivalent command, and never dropped from the
report.
```

## Requirements & Constraints

### Requirements

| ID | Type | Description |
|----|------|-------------|
| REQ-01 | Functional | `.agents/config/quality-gates.md` exists and declares the gate table schema, the optional count-contract / coverage-threshold / ordering blocks, and the `NOT DECLARED` rule. It ships **no** real command. |
| REQ-02 | Functional | `unit-tester.md` reads `.agents/config/quality-gates.md` instead of embedding G1–G8, and preserves every generic doctrine rule listed in T9. |
| REQ-03 | Functional | `reviewer.md`'s shell allowlist contains only generic git inspection verbs and read-only text utilities; every project command and project-shaped deny row is gone. |
| REQ-04 | Functional | `agent.instructions.md` replaces the frozen census with an audit procedure: the exact `grep`/`awk` one-liners and the invariants they check. |
| REQ-05 | Functional | All eight orchestrator sites use BLOCK-A, and each orchestrator gains BLOCK-B so a returned handoff is actually applied. |
| REQ-06 | Functional | `.agents/config/README.md` names `quality-gates.md` as a discovery entry. |
| REQ-07 | Verification | The forbidden-token scan over every edited shipped file returns `0` (TEST-01). |
| REQ-08 | Verification | Each edited file passes its own per-file check (TEST-02…TEST-06). |
| REQ-09 | Regression | `npm run test:unit` stays green; `npx playwright test` stays green. |
| REQ-10 | Functional | A missing `quality-gates.md` yields exactly one `GATES: NOT DECLARED` row plus its consequence — never one skipped row per gate. |
| REQ-11 | Functional | A gate whose `Command` cell is empty is reported `NOT DECLARED`, not invented. |
| REQ-12 | Functional | Orchestrators may apply a handoff without contradicting "never write": BLOCK-B states the carve-out explicitly. |

### Constraints

| ID | Description |
|----|-------------|
| CON-01 | Markdown and YAML-frontmatter edits only. No source code, no scripts, no workflows, no dependency changes. |
| CON-02 | `.agents/config/domain.md` and `.agents/config/issue-tracker.md` are untouched. |
| CON-03 | `AGENTS.md` is untouched. Its Batch / Dependencies / Parallel Execution Summary table shape is this plan's contract. |
| CON-04 | No permission rule is weakened. `reviewer.md` gains no write verb and no new allow; `unit-tester.md`'s permission list is byte-identical after the edit. |
| CON-05 | The catch-all `{ action: …, resource: "*", effect: deny }` stays **first** in every edited permission list. |
| CON-06 | The spaced guard rail `git merge *` stays **after** `git merge-base*`, and stays spaced. `git merge*` must not appear. |
| CON-07 | `quality-gates.md` ships no runnable command. Every example is a placeholder inside a fenced block explicitly marked as an example. |
| CON-08 | No new line-number citations into files this plan edits. Cite paths and headings instead; the eight-site rewrite invalidates line numbers by construction. |
| CON-09 | Do not add `*.md` to `unit-tester.md`'s edit grant. The handoff block is the answer, not a wider grant. |
| CON-10 | Do not introduce the substring `nx ` (note: the word "syntax" contains it) or the token `ui/` anywhere in the edited files — both are false positives in the required scan. Prefer "regular expression" over "syntax". |

### Security

| ID | Description |
|----|-------------|
| SEC-01 | `reviewer.md` remains read-only: `edit` is denied except `*.md`, `shell` opens with a catch-all deny, and the only allows are inspection/read verbs. |
| SEC-02 | Removing the enumerated build/test/install deny rows does not widen the grant: the catch-all shell deny already refuses those commands, and the plan states that in the document so the next maintainer does not "restore" them. |
| SEC-03 | No agent gains the ability to write `memory-bank/**` or `docs/**` as part of this change. |

## Implementation Steps

### Phase 1 — Declare, de-freeze, rewrite (Batch A — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Create the per-project gate declaration | `.agents/config/quality-gates.md` | A | — | 2026-11-02 |
| T2 | Replace the frozen census with an audit procedure | `.agents/instructions/agent.instructions.md` | A | — | 2026-11-02 |
| T4 | Role-aware delegation + handoff receiver in the master orchestrator | `.opencode/agents/orchestrator/orchestrator.md` | A | — | 2026-11-02 |
| T5 | Same two changes in the feature pipeline | `.opencode/agents/orchestrator/feature-pipeline.md` | A | — | 2026-11-02 |
| T6 | Same two changes plus the four TDD sites and the tracking rule | `.opencode/agents/orchestrator/tdd-orchestrator.md` | A | — | 2026-11-02 |
| T7 | Portable reviewer allowlist and body | `.opencode/agents/reviewer.md` | A | — | 2026-11-02 |
| T8 | Config discovery entry | `.agents/config/README.md` | A | — | 2026-11-02 |

---

#### T1 — Create `.agents/config/quality-gates.md`

**Anchor:** new file. It ships automatically: `package.json` `files` contains `.agents/`, and `sync.js` copies `.agents/**` (`scripts/sync.js:76`, `:575-614`).

**Frontmatter** (match `.agents/config/README.md` and `domain.md`; exactly these two keys):

```yaml
---
title: "Quality Gates"
description: "Per-project declaration of the canonical gate set: commands, what each gate proves, preconditions, ordering rules, count contract, and coverage thresholds."
---
```

**Required body, in this order.**

1. `# Quality Gates`
2. An intro paragraph stating: this file is the single declaration of the project's gates; `unit-tester` reads it; nothing else declares a gate. Then BLOCK-C verbatim.
3. `## Gate table` with the header row `| ID | Command | Proves | Preconditions | Order constraint |` and its separator row. **No data rows.** Immediately after, one sentence: "No gates are declared by default. Until a row is added, every gate is `NOT DECLARED`."
4. A fenced `text` block opened by the line `<!-- EXAMPLE ONLY — replace or delete. No agent runs these rows. -->` containing six placeholder rows that show the shape:
   - `G1 | <format check command> | ...`
   - `G2 | <unit test command> | ...`
   - `G3 | <coverage report command> | ...`
   - `G4 | <build command> | ...`
   - `G5 | <artifact inspection command> | ...`
   - `G6 | <integration or security-rules command> | ...`
   Every `Command` cell contains angle-bracket placeholders only.
5. `## Count contract (optional)` with three `###` subsections: `### What invariant must hold`, `### Where it is pinned`, `### What must never be edited`. The last subsection must say: "A red count gate is an arithmetic question first. Never edit the pinned expectation — in the gate command, in its fixture, or in this file — to turn a red run green."
6. `## Coverage thresholds (optional)` with the table `| Target | Lines | Functions | Branches | Source artifact | Missing report |`. Rule below it: a missing report fails and names the target; a target with no row has **no** threshold declared and must be reported as such, never as 90/90/90 by default.
7. `## Ordering rules (optional)` with the table `| Rule | Why |` and three example rules (mark them examples): a gate that purges or produces an artifact directory must precede the gate that reads it; a gate that writes a build output must precede the gate that inspects it; a gate that produces a coverage report must precede the threshold check.
8. `## Reader rules` — BLOCK-C restated plus: an empty `Command` cell is `NOT DECLARED`; absence of the file is `NOT DECLARED`; a command that does not exist is `NOT DECLARED`, never a near-equivalent; gates are run in declaration order; CI configuration is not a gate declaration unless this file names it.
9. `## How to declare a gate` — five numbered steps: stable ID; the exact command as typed from the repository root; what it proves; preconditions; order constraint. Add that a gate pinning a number also completes the count-contract block, and a gate producing coverage also completes the threshold block.
10. `## Maintenance` — when a gate command changes, this file changes in the same commit. Note that a consumer edit makes the file locally modified, so template sync skips it (`[ai-workflow-template] Skipped locally modified file`) rather than overwriting it; `--force` is the one path that would replace it (RISK-01).

**Must not:** name a real command, a package manager, a workspace tool, a workflow file, a count, or a coverage percentage as a default. No `nx`, no `npm run`, no numeral pin.

**Validation:** `test -f .agents/config/quality-gates.md`; `grep -c '^## ' → 7`; `grep -q 'NOT DECLARED'`; TEST-01 returns 0 for this file.

---

#### T2 — Replace the frozen census with an audit procedure

**File:** `.agents/instructions/agent.instructions.md`.

**Anchor:** delete lines 66–95 inclusive — from `## Verified Inventory — This Repository's Agent Files` through the `### Effects` table's last row (`| `ask` | 0 | Not used in this repository |`). Preserve line 60–64 (`#### **name** (NOT a v2 key)`) above and `## Permission Configuration` (currently line 97) below.

**Replacement section:** `## Audit Procedure — Re-derive the Inventory`.

Required content:

- Opening paragraph: "This document describes shapes, not counts. A count written here is wrong the moment a project adds an agent, so the counts live in the change that used them — a plan, a PR body, a review — and are re-derived with the commands below. Never quote a number from this file as evidence."
- `### What to check` — six invariants:
  1. Every `permissions` list opens with a catch-all rule (`resource: "*"`).
  2. A catch-all with `effect: allow` appears only in a deliberate full-access agent, and that file says so.
  3. No `name:`, `tools:`, or `permission:` (singular) key survives; each is a V1 field that is ignored in a file read as v2.
  4. Every `mode` is `primary`, `subagent`, or `all`.
  5. Only the documented actions appear; a new action name is a deliberate addition to document, not a typo to ignore.
  6. No unspaced deny pattern shadows a longer allowed verb, and the spaced `git merge *` guard exists where a reviewer allowlist exists.
- `### Commands` — one fenced `bash` block, seven numbered checks:
  1. file census: `find .opencode/agents -name '*.md' | sort`, then `-maxdepth 1 … | wc -l` and `-path './.opencode/agents/orchestrator/*' -name '*.md' | wc -l`.
  2. top-level keys in use: `grep -rhoE '^(description|mode|permissions|name|tools|permission):' .opencode/agents --include='*.md' | sort | uniq -c`.
  3. V1 keys absent: `grep -rnE '^(name|tools|permission):' .opencode/agents --include='*.md'` — expect no output.
  4. modes: `grep -rhE '^mode: ' .opencode/agents --include='*.md' | sort | uniq -c`.
  5. rules by effect and by action: two `grep -rhoE '\{ action: [a-z_]+, +resource: \"[^\"]+\", +effect: [a-z]+ \}'` pipelines, one through `awk -F'effect: '`, one through `awk -F'action: ' | cut -d',' -f1`, each ending `sort | uniq -c`.
  6. first rule per file: the `for f in $(find .opencode/agents -name '*.md'); do printf '%s: ' "$f"; awk '/^permissions:/{p=1;next} p&&/^  - \{/{print;exit}' "$f"; done` loop, piped to `grep -v 'resource: "*"'` — expect no output. Follow it with the same loop piped to `grep 'effect: allow'` and the note that a hit is a full-access agent requiring justification (currently `coder`, `deployer`, `planner`).
  7. guard-rail spacing: `grep -rnE 'resource: "git (add|commit|reset|checkout|restore|switch|rebase|stash|apply|clean|push)\*"' .opencode/agents --include='*.md'` — expect no output; and `grep -rn 'resource: "git merge \*"' .opencode/agents --include='*.md'` — expect one hit.
- `### Reporting a mismatch` — a mismatch means either the file or this document is wrong. Fix the file first, re-run the command, and record the corrected count in the change description.
- `### What stays out of this file` — the four numbers the old census carried (agent files, edit rules, shell rules, allow/deny split) and any percentage or coverage figure.

**Must not:** keep a table of per-file counts, keep `15 of 15`, keep a version-specific runtime path as a *requirement* (line 167's measurement stays: it is dated evidence, not a census).

**Validation:** `grep -nE 'Verified Inventory|15 of 15|40 \| 63|65 allow|38 deny' .agents/instructions/agent.instructions.md` → no output; `sed -n '/^## Audit Procedure/,/^## Permission Configuration/p' .agents/instructions/agent.instructions.md | grep -c '^### '` → 4.

---

#### T4 — `orchestrator.md`: role-aware delegation, handoff receiver

**File:** `.opencode/agents/orchestrator/orchestrator.md`.

1. **Site 1** — the standard delegation template, the bullet beginning `- Memory bank:` (currently line 201). Replace that single bullet with BLOCK-A at the same indentation as the bullet it replaces (column 1). Leave the neighbouring `- Knowledge retrieval:` and `- Architecture context:` bullets byte-identical — `tests/spec-orchestrator-parity.test.js` counts exactly two `knowledge-retrieval.instructions.md` references in this file.
2. **Site 2** — the parallel-coder delegation template, same bullet (currently line 235), same replacement.
3. **New subsection** — insert BLOCK-B immediately before `#### Parallel Coder Execution`.
4. **Carve-out** — in the Guidelines bullet beginning `- **Only delegate, never process**`, append one sentence: "The single exception is applying a returned `## Documentation handoff`, which is transcription of another agent's text."

**Must not:** change the identity paragraph's first sentence into a permission claim; change the tracker delegation block (Step 5) — it already writes `docs/tracker-log.md` through the tracker, which has the grant.

**Validation:** `grep -c 'Documentation write: if your edit grant covers' → 2`; `grep -c '^#### Applying documentation handoffs' → 1`; `grep -c 'knowledge-retrieval.instructions.md' → 2`; `grep -c 'memory_bank_memory_update' → 3`.

---

#### T5 — `feature-pipeline.md`: same two changes

**File:** `.opencode/agents/orchestrator/feature-pipeline.md`.

1. **Site 1** — the standard delegation bullet (currently line 103) → BLOCK-A.
2. **Site 2** — the parallel-coder delegation bullet (currently line 136) → BLOCK-A.
3. **New subsection** — BLOCK-B immediately before `#### Parallel Coder Execution`.
4. Keep `knowledgebase_knowledgebase_search` at exactly **2** occurrences (the parity test asserts this) and `knowledge-retrieval.instructions.md` at 2.

**Validation:** same four counts as T4, with `grep -c 'knowledgebase_knowledgebase_search' → 2`.

---

#### T6 — `tdd-orchestrator.md`: four sites, the tracking rule, and the receiver

**File:** `.opencode/agents/orchestrator/tdd-orchestrator.md`.

1. **Phase 1 (PLAN) site** — the bullet `- After completing the plan, update \`memory-bank/activeContext.md\`…` (currently line 133) → BLOCK-A at column 1, keeping the preceding `- Memory bank: read …` bullet's read half intact (BLOCK-A's first bullet is that read half; delete the duplicate).
2. **Phase 2 (RED) site** — replace the five-item `memory-bank tracking entries` sub-list (currently lines 165–170) **and** its lead-in with BLOCK-A at three-space indentation. The list is unsatisfiable for the unit-tester; do not keep a reduced version of it.
3. **Phase 3 (GREEN) site** — replace the four-item `Update memory-bank files:` sub-list (currently lines 210–214) with BLOCK-A at three-space indentation. Keep the sibling bullet that asks the coder to mark the plan's `Completed` column — it is a plan edit, not a documentation edit.
4. **Phase 4 (VERIFY) site** — replace the four-item sub-list (currently lines 250–254) with BLOCK-A at column 1.
5. **Summary asks** — in the Phase 2 and Phase 3 return-summary bullets, change the trailing `memory-bank files updated` to `documentation handoff returned, or memory-bank files updated when the grant allows`.
6. **Tracking rule** — the Guidelines bullet `- **Test tracking is mandatory**` (currently line 395) becomes: test tracking stays mandatory, but the **orchestrator** records it; the unit-tester returns the entries in its handoff because it cannot write those paths, and the orchestrator applies the block and reindexes. Do not keep a second copy of the demand on the sub-agent.
7. **New subsection** — BLOCK-B immediately before `#### Phase 1: Implementer (PLAN)`.

**Must not:** touch any of the six `knowledge-retrieval.instructions.md` references (the parity test asserts exactly six); add a fifth `#### Phase` heading; renumber phases.

**Validation:** `grep -c 'Documentation write: if your edit grant covers' → 4`; `grep -c '^#### Applying documentation handoffs' → 1`; `grep -c 'knowledge-retrieval.instructions.md' → 6`; `grep -nE 'memory-bank/tasks/TEST-|Update memory-bank files:|Run \`memory_bank_memory_update\` to sync the index' → no output`.

---

#### T7 — `reviewer.md`: portable allowlist, unchanged doctrine

**File:** `.opencode/agents/reviewer.md`.

**A. Frontmatter (delete and re-comment only — no new allow).**

Keep lines 4–6 (`edit` deny, `edit *.md` allow) and lines 7–14 (the ordered-list explanation).
Keep line 15 (`shell` catch-all deny) and lines 16–27 (the eleven git inspection verbs, each ending in `*`).
**Delete** lines 28–37 (the comment plus the seven project gate allows).
Keep lines 38–52 (the eleven read-only text utilities).
Keep lines 53–58 (guard-rail comment) and lines 59–71 (the thirteen git guard rails, including bare `git merge` and spaced `git merge *`).
**Delete** lines 72–77 (the six project-shaped denies: `npm install*`, `npm ci*`, `npm test*`, `npx nx build*`, `npx nx test*`, `npx nx run-many*`).
Insert, in place of the deleted allow block, a comment that states: the catch-all shell deny above already refuses every build, test, install, and codegen runner, so enumerating them here is project-specific noise that breaks when a consumer renames a script; the extension point is a consumer's own agent override, which adds a specific allow for a gate declared in `.agents/config/quality-gates.md`; and this file intentionally contains no such rule.
Replace the deleted deny block with a comment that the catch-all deny already covers installs and runners, so no project-shaped deny rows are needed; guard rails are for verbs a reviewer must never type even if an allow above widens.

**B. Body.**

1. **Verification basis example** (lines 88–94): replace `git show 9007477:scripts/sum-test-counts.js` with `git show <rev>:<path>` and `npx nx run contract:check` with `git diff --stat <base>...<head>`; replace the `npm ci` limitation example with "install is outside the review grant".
2. **`## Shell access — permitted and forbidden`** (lines 113–140): rewrite the permitted table to the eleven git verbs and the eleven text utilities, with a final row that is not a command: "A project gate command — only if the consuming project adds it to its own override." Rewrite the forbidden table to: staging/committing/merging-moving-the-tree verbs; any install or package-manager command (state that install flags and lockfile rules belong to the project's declaration); any build or test runner; any gate that spawns an emulator, container, or browser fleet; any editor, formatter, or code generator; `rm`/`mv`/`cp` and any redirection into a tracked path.
3. **`### Compound commands are split`** (lines 142–164): keep the mechanism and table; replace the `sed`/`xargs` examples only if they need no project context (they do not — keep as is).
4. **Memory-bank hygiene bullet** (line 207): replace the hardcoded "no `.vocabulary.json` exists in this repo today" with a conditional — "if the project has no vocabulary file, say the check is inert rather than reporting `0 unknown tags` as a pass."
5. **Gate certification bullet** (line 210): replace `npx nx build`, `npm test`, `npm run test:rules`, `G5`, `assert-built-css.js`, `G3`, `check-coverage.js` with: build and test runners and any emulator-backed gate sit outside the review grant; cite the unit-tester's numbers as its claim, or run the read-only half of a gate (a script that inspects a committed or already-built artifact) when the project's override permits it.
6. **Merge line-accounting table** (lines 237–240): replace the two example rows with `src/<module>/<file>` and `docs/<file>.md`.
7. **Output Expectations item 4** (lines 258–259): gate status is per gate **declared in `.agents/config/quality-gates.md`**; allowed values are `RUN — PASSED`, `RUN — FAILED`, `NOT RUN (reason)`, `CITED from unit-tester (unverified)`, and `NOT DECLARED`. If the declaration is absent, say `GATES: NOT DECLARED`.

**Must not:** gain a write verb or a new allow (SEC-01); reorder the guard rails above the allows; lose the four severities, the "structurally verified, not line-accounted" prohibition, the leave-the-tree rule, or the report-don't-fix rule.

**Validation:** `grep -c 'effect: allow' → 23`; `grep -c 'effect: deny' → 15`; `grep -c 'git merge-base\*' → 1`; `grep -n 'git merge\*' → no output`; `grep -nE 'npx|npm run|node scripts/' → no output`; TEST-01 → 0.

---

#### T8 — `.agents/config/README.md`: discovery entry

**File:** `.agents/config/README.md`.

There is no config-document table in this file (the other config docs are prose sections), so "add to the discovery table" becomes "add a section in the same shape".

1. Frontmatter `description` → "Discovery pointer for the scoping skills, the scope agent, the quality-gate declaration, and domain documentation locations."
2. Insert `## Quality gates` immediately after `## Issue tracker` (after line 64) and before `## Research skill`:

```text
`.agents/config/quality-gates.md` is the only declaration of a project's gates: the gate
table, the optional count contract, coverage thresholds, and ordering rules. `unit-tester`
reads it; nothing else declares a gate. It ships empty, so every gate is `NOT DECLARED`
until the project fills it in. A gate that is not declared there is reported, never
invented.
```

**Validation:** `grep -c 'quality-gates.md' → ≥1`; `grep -n '^## Quality gates' → 1`; TEST-01 → 0.

---

### Phase 2 — Consume and de-freeze (Batch B — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T3 | Remove the remaining frozen counts outside the census section | `.agents/instructions/agent.instructions.md` | B | T2 | 2026-11-02 |
| T9 | Replace G1–G8 with the declared gate set | `.opencode/agents/unit-tester.md` | B | T1 | 2026-11-02 |

---

#### T3 — De-freeze the counts that survived the census

**File:** `.agents/instructions/agent.instructions.md` (same file as T2, hence Batch B).

| Anchor (as of `9015a39`) | Replace with |
|---|---|
| Line 39, "the files in this repository run 137–286 characters" | "keep it to one sentence; the model choosing which agent to delegate to reads this string, so name the domain rather than the workflow" |
| Line 49, "This repository uses `all` on 11 agents and `primary` on `planner.md` plus the three `orchestrator/*.md` templates" | "Files intended to be delegated to use `all`; a file that is only a session entry point uses `primary`. Re-derive the split with the audit procedure." |
| Line 87, "No other action appears in this repository: …" | "The actions in use are the ones the audit prints. Any other action is left at the base policy rather than written out, and an unexpected name is a deliberate addition to document." |
| Line 139, "None of them is exercised by a file in this repository except `edit` and `shell`." | "This template exercises `edit` and `shell`. If the audit prints another action, treat it as deliberate and document it." |
| Line 206, "No agent file here gates an MCP tool yet" | "No agent in this template gates an MCP tool. A project that needs to add `<server>_<tool>` rules does so in the frontmatter of its own copy of the agent file." |
| Line 568, "(one sentence; 137–286 chars in this repository)" | "(one sentence)" |

Keep unchanged: the V1→V2 mapping table, `### Pattern Matching`, `### Shell Rules`, `### How These Semantics Were Verified`, the version-pinned measurement paragraph, and the six common-pattern examples (they point at files, not counts).

**Validation:** `grep -nE '137–286|11 agents|15 of 15|40 \| 63|65 allow|38 deny|No other action appears' .agents/instructions/agent.instructions.md` → no output.

---

#### T9 — `unit-tester.md`: read the declaration, keep the doctrine

**File:** `.opencode/agents/unit-tester.md`.

**A. Frontmatter — byte-identical.** Do not touch lines 1–30. In particular the 15 `edit` allows, the `shell` catch-all allow, and the comment explaining that `memory-bank/**` and `docs/**` are deliberately absent stay exactly as they are (CON-09, SEC-03).

**B. Description (line 2)** — `runs the canonical gate set` → `runs the gate set the project declares`.

**C. Core Responsibilities (line 43)** — `Run the **canonical gate set** for this repo (see below)` → `Run the **gate set the project declares** in `.agents/config/quality-gates.md` (see "Gate set" below)`.

**D. Approach step 5 (line 55)** — `Execute the canonical gate set in the order given below` → `Execute every gate declared in `.agents/config/quality-gates.md`, in the order the declaration gives`.

**E. Documentation boundary (lines 60–128) — keep the whole block**, with three surgical changes:

1. The subsection `### This resolves a known contradiction` cites five orchestrator line numbers. Replace the parenthetical line list with "every delegation template under `.opencode/agents/orchestrator/`". Retitle to `### Why the handoff exists`.
2. Add one sentence: the templates now say "if your edit grant covers `memory-bank/**` or `docs/**`, update; otherwise return a handoff" — this agent is the `otherwise` case, so the handoff is the expected output, not a workaround.
3. In `**What you may write:**`, remove `*/__tests__/*` from the trailing Guidelines bullet (line 138). It is not in the frontmatter allowlist, so the current prose promises a write the runtime refuses. The canonical list is the frontmatter list.

Keep unchanged: the "snapshot files are not an exception" paragraph, the "Do not run `memory_bank_memory_update` either" paragraph, and the entire `### `## Documentation handoff`` template with its six rules.

**F. Guidelines (lines 130–153) — keep every generic rule, rewrite four anchors:**

1. **SKIPPED** — keep "A SKIPPED gate must carry its reason and its consequence", replace the emulator example with a generic one: "`<gate ID>` SKIPPED — the environment it needs (network access, a runtime, a browser binary) is unavailable; consequence: the behaviour it covers was not re-verified this session." Keep "A silent omission is a defect; an explained skip is not."
2. **Install caution (lines 148–150)** — delete `--legacy-peer-deps`, `CON-02`, `.npmrc`. Replace with: "If the project declares install flags, a lockfile policy, or a package-manager version — in `quality-gates.md` or its own docs — follow them. Never run a bare install to make a gate pass; if a gate needs a dependency, report it instead of installing one."
3. **Nested package (lines 151–153)** — delete `apps/functions`, `libs/`, `npm run test:functions`. Replace with: "A nested package with its own lockfile or build configuration is not installed from the root to satisfy a gate. If the declaration does not name that package's gate command, the gate is `NOT DECLARED`."
4. Keep: never report a gate you did not run; do not trust a claim including your own.

**G. Replace `## Canonical gate set` (lines 155–177) with `## Gate set`.** Required content, in this order:

1. Read `.agents/config/quality-gates.md` before running anything; it is the only declaration — ID, exact command, what it proves, preconditions, order constraint.
2. **Missing file** — exactly one row:
   `| GATES: NOT DECLARED — `.agents/config/quality-gates.md` absent | — | NOT DECLARED | no gate claim can be certified this session |`
   followed by: do not expand this into one row per assumed gate, and do not substitute the project's CI config.
3. **Present file** — one report row per declared gate, in declaration order. An empty `Command` cell is `NOT DECLARED` with the reason.
4. **Order is load-bearing, stated as a principle:** "a gate that produces or purges an artifact must run before the gate that reads it; a gate that writes a build output must run before the gate that inspects that output." The declaration owns the constraints; follow them, never reorder for green.
5. **Never substitute** — a declared command that does not exist is `NOT DECLARED` with the reason; report it, do not reach for the nearest equivalent. A gate the declaration does not list is not a gate this agent may add.
6. **Delete** the G1–G8 table, the `npm test` non-gate row, and the CI-order paragraph (lines 175–177). All eight commands are unrunnable in this repository and the workflow citations are dead.

**H. Failure classification (lines 179–200) — keep the table and the identity discipline.** Replace the concrete arithmetic example with a symbolic one:

```text
base 120 → left 128 → right 121 → merged 129
129 = 128 + 1   (added on the left)
129 = 121 + 8   (added on the right)
```

and replace `Never edit \`EXPECTED\` in \`scripts/sum-test-counts.js\` — or its fixture — to turn a red run green` with "Never edit the pinned expectation — in the count contract, in its fixture, or in `quality-gates.md` — to turn a red run green. If the arithmetic does justify an amendment, say so explicitly and mirror it in **both** the declaration and the fixture."

**I. Discrimination proof (lines 202–221) — keep all three steps.** Replace the named scripts and `--expect-fail` examples with: "Where the project's script offers a built-in proof mode (`--expect-fail` or equivalent, declared in `quality-gates.md`), use it." Keep "Absence is not discrimination" verbatim in spirit. Keep the caching rule, generically: "Some compilers and transpilers cache per input path, so running 'before' and 'after' through the same path yields a false `0 B` delta. Use distinct input paths and separate processes for each side."

**J. Output Expectations (lines 223–245).**

- Item 2 gate table: one row per **declared** gate; the example row's Gate cell is `\`<gate ID>\`` (never `G1`–`G8`, which belonged to the deleted table) and its Command cell is `\`<command from quality-gates.md>\``; `PASSED` only if the command ran in this session.
- Item 5 coverage: per target declared in `quality-gates.md`; if no threshold is declared, write `no coverage threshold declared` — never invent 90/90/90.
- Item 7 stays: `## Documentation handoff` last.

**Validation:** `grep -nE 'G[1-8] |npx nx|scripts/(sum-test-counts|assert-built-css|check-coverage)|90/90/90|firebase|cms-apmc|apps/functions|legacy-peer-deps|CON-02' → no output`; `grep -c 'quality-gates.md' → ≥6`; `grep -c 'NOT DECLARED' → ≥5`; `git diff -U0 .opencode/agents/unit-tester.md | grep -E '^[+-]\s+- \{ action:'` → no output (frontmatter untouched); `grep -c 'knowledge-retrieval.instructions.md' → 1`.

---

### Phase 3 — Per-file verification (Batch C — Parallel)

Five independent read-only tasks. Each runs the forbidden-token scan for its own file plus the structural assertions. None edits a file.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T10 | Verify the reviewer rewrite | `.opencode/agents/reviewer.md` (read-only) | C | T7 | 2026-11-02 |
| T11 | Verify the unit-tester rewrite | `.opencode/agents/unit-tester.md` (read-only) | C | T9, T1 | 2026-11-02 |
| T12 | Verify the instructions audit procedure | `.agents/instructions/agent.instructions.md` (read-only) | C | T2, T3 | 2026-11-02 |
| T13 | Verify all three orchestrators | `.opencode/agents/orchestrator/*.md` (read-only) | C | T4, T5, T6 | 2026-11-02 |
| T14 | Verify the two config documents | `.agents/config/*.md` (read-only) | C | T1, T8 | 2026-11-02 |

**TEST-01 — the shared forbidden-token scan.** Run verbatim, from the repository root, over the five target files:

```bash
grep -rnoE "cms-apmc|\bui\b/|apps/functions|libs/contract|nx |CON-02|DaisyUI|bg-slate-100|max-h-60|firebase|test:rules|test:functions|sum-test-counts|assert-built-css|check-coverage|coverage:check|704|692|legacy-peer-deps" \
  .opencode/agents/reviewer.md \
  .opencode/agents/unit-tester.md \
  .agents/config/quality-gates.md | wc -l
```

Expected: **`0`**. Note: `nx ` also matches the tail of "syntax " — that is why CON-10 forbids the word in new text. If a hit is only that false positive, rewrite the word; do not weaken the scan.

| Task | Extra assertions (all must hold) |
|---|---|
| T10 | `grep -c 'effect: allow' → 23`; `grep -c 'effect: deny' → 15`; first shell rule is the catch-all deny (line 1 of the shell block); `grep -c 'git merge-base\*' → 1`; `grep -c 'git merge \*' → 1`; `grep -n 'git merge\*' → no output`; `grep -nE 'npx|npm run|node scripts/' → no output`; `grep -c '🔴\|BLOCKING' → ≥1`; `grep -c 'structurally verified, not line-accounted' → 1` (the prohibition is retained). |
| T11 | `grep -nE '^\| G[1-8] ' → no output`; `grep -c 'GATES: NOT DECLARED' → ≥1`; frontmatter diff empty (command above); `grep -c '## Documentation handoff' → ≥2`; `grep -c 'knowledge-retrieval.instructions.md' → 1`. |
| T12 | `grep -nE '137–286\|11 agents\|15 of 15\|65 allow\|38 deny\|No other action appears' → no output`; the seven audit commands are present (`sed -n '/^## Audit Procedure/,/^## Permission Configuration/p' .agents/instructions/agent.instructions.md \| grep -c '^### '` → **4**); V1→V2 mapping table present (`grep -c 'bash.*shell' → ≥1`). |
| T13 | Per file: `grep -c 'Documentation write: if your edit grant covers'` → orchestrator **2**, feature-pipeline **2**, tdd **4**; `grep -c '^#### Applying documentation handoffs'` → **1** each; `grep -c 'knowledge-retrieval.instructions.md'` → **2 / 2 / 6**; `grep -c 'knowledgebase_knowledgebase_search'` in feature-pipeline → **2**. |
| T14 | quality-gates: `grep -c '^## ' → 7`; `grep -nE 'npm |npx |yarn |pnpm |nx |node |make ' → no output`; `grep -c 'EXAMPLE ONLY' → 1`. README: `grep -n '^## Quality gates' → 1`; `grep -c 'quality-gates.md' → ≥1`. |

---

### Phase 4 — Whole-set verification (Batch D — single task)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T15 | Whole shipped-set token scan, dangling-reference sweep, and full test run | all eight files; repository (read-only) | D | T10, T11, T12, T13, T14 | 2026-11-02 |

Steps:

1. Re-run TEST-01 across **all eight** edited files, including the three orchestrators and `agent.instructions.md`; expect `0`.
2. Re-run the brief's original three-file inventory to confirm each file is clean in isolation:

   ```bash
   grep -rnoE "cms-apmc|\bui\b/|apps/functions|libs/contract|nx |CON-02|DaisyUI|bg-slate-100|max-h-60|firebase|test:rules|test:functions|sum-test-counts|assert-built-css|check-coverage|coverage:check|704|692|legacy-peer-deps" \
     .opencode/agents/reviewer.md .opencode/agents/unit-tester.md .agents/instructions/agent.instructions.md | wc -l
   ```

   Expected `0` (it is already `0` for `agent.instructions.md`; the other two must drop from 34 and 44).
3. Dangling reference sweep — every path and heading named by the edited files must exist. Scope the sweep to `.opencode/agents .agents/config .agents/instructions/agent.instructions.md`; `learned-knowledge.instructions.md` is a historical journal and is excluded on purpose.
   - `test -f .agents/config/quality-gates.md`
   - `grep -o '\.agents/config/quality-gates\.md' -r .opencode .agents | wc -l` → ≥ 6
   - no reference to `canonical gate set` survives: `grep -rn 'canonical gate' .opencode/agents .agents/config .agents/instructions/agent.instructions.md | wc -l` → `0`
   - no reference to a removed script or workflow: `grep -rnE 'sum-test-counts|assert-built-css|check-coverage|deploy-hosting|test-rules\.yml' .opencode/agents .agents/config .agents/instructions/agent.instructions.md | wc -l` → `0`
   - no orchestrator still orders an unconditional memory-bank write: `grep -rn "After completing work, update" .opencode/agents/orchestrator | wc -l` → `0`.
4. Run the repo gates this template actually has:
   - `npm run test:unit` → all files pass, 0 failed (baseline at HEAD: 28 files / 842 tests).
   - `npx playwright test` → 7 passed / 1 skipped (baseline at HEAD).
   If a spec test fails because it counts a literal this plan changed, the fix is to restore the literal, not to edit the test (the tests are the contract; this plan changes prose, not counts).
5. Record the command outputs in the plan's `Completed` cells and in the coder summary.

---

### Phase 5 — Record (Batch E — single task)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T16 | Record the change in the memory bank and the learned-knowledge journal | `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/tasks/_index.md`, `.agents/instructions/learned-knowledge.instructions.md` | E | T15 | 2026-11-02 |

Append (never overwrite): what changed, the `0`-hit verification for each file, the counts removed, the RISK-01 follow-up, and the fact that `quality-gates.md` ships empty. Add a `## Session: 2026-11-02 — Agent Definition Portability` entry to `learned-knowledge.instructions.md` naming the defect class ("a template agent spec must not name a consumer's CI"). Run `memory_bank_memory_update` after the appends. If the pipeline's tracker owns documentation, return a handoff block instead of writing and let it apply.

## Execution Record

**2026-11-02 — all 16 tasks complete.**

| Check | Result |
|---|---|
| TEST-01 forbidden-token scan (reviewer, unit-tester, agent.instructions, quality-gates, AGENTS.md) | **0 hits** |
| TEST-01 across all eight edited shipped files | **0 hits** |
| TEST-01 non-vacuity (seeded `cms-apmc` in a temp copy) | **1 hit** — the scan can fail |
| `npm run test:unit` | **28 files / 844 tests passed**, 0 failed |
| `npx playwright test` | **7 passed / 1 skipped** |
| `scripts/sync-unit.test.js` + `scripts/sync.test.js` + parity spec | **134 passed / 0 failed** |
| Parity counts (`knowledge-retrieval.instructions.md`) | **2 / 2 / 6** — pinned counts unchanged |
| `knowledgebase_knowledgebase_search`, feature-pipeline | **2** — pinned count unchanged |

**Deviations, all deliberate and recorded:**

1. **RISK-01 fixed, not deferred (user-approved).** `scripts/sync.js` gains
   `config/quality-gates.md` in `projectOwnedPaths` plus `projectOwnedAgentStubs`,
   so the declaration is scaffolded create-if-absent and then never overwritten or
   pruned, `--force` included. `scripts/sync-unit.test.js` proves a locally edited
   `quality-gates.md` survives a forced sync and that `config/domain.md` still syncs.
   This extends CON-01 (which said markdown only) exactly as the user approved.
2. **T7/T10's literal grep counts are off by one occurrence each.** The file keeps the
   guard-rail comment that names both the spaced pattern and the unspaced anti-pattern,
   so `grep -c 'git merge-base\*'` and `grep -c 'git merge \*'` both return **2**, not 1,
   and `grep -n 'git merge\*'` returns those two comment lines. The invariants hold at
   the rule level: exactly one `git merge-base*` allow, exactly one spaced
   `git merge *` deny, zero unspaced `git merge*` denies. The plan also required this
   comment to be kept, so the literal expectation could not be met.
3. **T1's frontmatter description drops the word "canonical"** to satisfy T15's
   `grep 'canonical gate' → 0` sweep and to avoid re-implying that the template ships a
   fixed gate set. The two keys and their shape are unchanged.
4. **The "only delegate, never process" carve-out sentence was added to all three
   orchestrators**, not just the master orchestrator as T4 specifies, because all three
   make the same absolute claim and all three now apply handoffs.
5. **`AGENTS.md`'s sample plan table** used `libs/contract/...` paths; replaced with
   generic `src/<module>/...` paths so the token scan over `AGENTS.md` is `0`. The
   table shape (Batch / Dependencies columns, Parallel Execution Summary) is unchanged.

### Review repair — 2026-11-02 (post-review)

The reviewer returned 0 BLOCKING / 3 MAJOR / 4 MINOR / 1 COSMETIC against the
uncommitted change. All were fixed inside the new contract.

| Finding | Fix | Evidence |
|---|---|---|
| MAJOR 1 — an empty declaration read as "nothing to run" | `quality-gates.md` and `unit-tester.md` now report a present-but-empty set as `GATES: NOT DECLARED` — one row, identical to absence, never an empty table | `tests/spec-quality-gates-declaration.test.js` — 3 tests |
| MAJOR 2 — two audit checks could not fail | check 6 → `grep -Fv 'resource: "*"'`; check 7 scoped to the `merge` / `merge-base` pair so legitimate bare-verb denies are not defects | real run: 6 empty, 7a empty, 7b one hit; seeded temp agent → 6 and 7a each print a hit |
| MAJOR 3 — "consumer's own agent override" defined nowhere | no durable per-agent override exists (`projectOwnedAgentStubs` holds only `config/quality-gates.md`; `projectOwnedPaths` has no agent file), so the claim was removed from `reviewer.md` (3 sites), `unit-tester.md` and `agent.instructions.md`; replaced with "cite the unit-tester's status and mark it unverified; a project widens its own copy and maintains it against `--force`" | `grep -rn "override"` → 0 in those files |
| MINOR 1 — `--dry-run` created files | all five scaffold loops guarded by `dryRun` (memory-bank, agent instructions, project-owned `.agents/`, root stubs, `opencode.json`); the would-scaffold count is still reported | `sync-unit.test.js` dry-run cases updated + new zero-write assertions |
| MINOR 2 — stale present tense | `unit-tester.md` delegation-template sentence is past tense | read |
| MINOR 3 — handoff contract under-specified and untested | `.agents/instructions/documentation-handoff.instructions.md` is now the single canonical block; unit-tester and read-only e2e-tester point at it; all eight delegation sites and the three receivers reference it; parity spec gained a separate 3-case receiver assertion | parity **141 passed**; receivers **1 / 1 / 1** |
| MINOR 4 — unverified `--prune` claim | new sync-unit case: edit the declaration, record the edit as the baseline, remove the package copy, run `--prune --force`; the file survives | 1 new test |
| COSMETIC — reviewer's own recursion | reviewer now says "Open `## Evidence` with a Verification basis block", which is what its slot map enforces | read |

**Verification after the repair:** forbidden-token grep **0** (non-vacuity seeded → 1);
`npm run test:unit` **29 files / 851 tests**; `npx playwright test` **7 passed / 1 skipped**;
targeted sync + parity **141 passed**; parity counts **2 / 2 / 6**; handoff receivers
**1 / 1 / 1**. `docs/.architecture-context.md` instruction count 23 → **24** for the new
instruction file.

### Second review repair — 2026-11-02 (post-review)

The second pass returned 1 MAJOR / 3 MINOR; all four were fixed. Permissions were not
widened and no doctrine was deleted.

| Finding | Fix | Evidence |
|---|---|---|
| MAJOR — `e2e-tester` is read-only but told to write | step 5 collects findings into the handoff instead of "write to a .md document"; Standalone Tracking returns the `docs/tracker-log.md` entry instead of appending it, mirroring `unit-tester.md`; the `edit: *` deny is untouched. Every remaining `write`/`append` hit names what the *orchestrator or user* does, or says the agent cannot write | `grep -E 'action: (edit\|shell)'` → 2 deny, 0 allow; `grep -nE 'writ\|append'` reviewed hit by hit — no self-write instruction remains |
| MINOR — the reviewer's gate rule permitted an empty table | the rule now covers "absent **or present with zero declared gates**" → `GATES: NOT DECLARED`, one row, never an empty table | `tests/spec-quality-gates-declaration.test.js` — reviewer case added (4 tests); reverting the wording fails 2 of its 3 assertions |
| MINOR — memory bank named the removed extension point | `activeContext.md` and `progress.md` now say a project widens its own copy of `reviewer.md` and maintains it against `--force`; the stale planning record that repeated the old claim (`activeContext.md`, "Implementer — Plan" line) was reworded in the final polish pass, so no line still calls it the extension point | both current-state lines read "widens … against `--force`"; `grep -n 'the extension point' memory-bank/*.md` → 1 hit, the repair record that quotes the removed phrasing |
| MINOR — handoff block collided with the four-slot envelope | **nested, not exempted**: the canonical block is `### Documentation handoff`, the last block inside slot 4; `communication.instructions.md` names it the one permitted `###` sub-block, S2 excludes its lines, S3 counts only `##` headings outside fences; 8 delegation sites, 3 receivers and 2 producers say "last block inside slot 4" | `grep -c 'communication.instructions.md'` → 1 per spec; `### Documentation handoff` present in both producers |

**Why nesting rather than a named exemption:** S3's "no fifth `##` heading" is the
mechanical guard the envelope has; an exemption by name would let any reply relabel a
section as the exempt one. Nesting keeps both contracts satisfiable with one reply and
costs only the `###` level, which nothing else in the envelope uses.

**Verification after the second repair:** forbidden-token grep **0** over eleven shipped
files (seeded control → **2**); `npm run test:unit` **29 files / 852 tests**;
`npx playwright test` **7 passed / 1 skipped**; sync + parity + gate **142 passed**;
`communication.instructions.md` reference line **1 × 15 specs**; reviewer **23 allow /
15 deny**; e2e-tester **0 allow / 2 deny**.

### Final polish — 2026-11-02 (post-approval)

The third pass approved the change on static evidence (0 BLOCKING / 0 MAJOR) and left two
MINOR and two COSMETIC items. All four were applied; permissions and doctrine were not
touched, and no file gained or lost a rule.

| Item | Fix | Evidence |
|---|---|---|
| MINOR — the RED-phase brief promised `__tests__/*` | replaced the inline path set with a pointer to the **What you may write** list in `unit-tester.md`, which mirrors the frontmatter allowlist; a restated path set here would drift from it again | `grep -rn '__tests__' .opencode .agents AGENTS.md` → 0 hits (only this plan's own removal instruction still names it) |
| MINOR — a stale memory-bank line still named the removed extension point | the "Implementer — Plan" line in `activeContext.md` now says a project widens its own copy of the file and maintains it against `--force`, because `scripts/sync.js` gives no project a durable per-agent override | `grep -n 'the extension point' memory-bank/*.md` → 1 hit, the repair record that quotes the removed wording; no line asserts it |
| COSMETIC — two `reviewer.md` bullets ran 576 / 486 chars | both wrapped onto 2-space continuation lines, meaning unchanged | `awk 'length>400'` over every agent spec → **0 lines** |
| COSMETIC — `agent.instructions.md` read "A project that needs to adds" | "needs to add" | `grep -n 'needs to adds' .agents/instructions/agent.instructions.md` → no output |

**Verification after the polish:** forbidden-token scan **0** over the eight shipped files
(seeded `cms-apmc` control → **1**); `npm run test:unit` **29 files / 852 tests passed**;
`npx playwright test` **7 passed / 1 skipped**; sync + parity + gate **142 passed**
(160 with the two spec suites added); reviewer **23 allow / 15 deny**, `git merge-base*`
×1 and spaced `git merge *` ×1 at rule level, no runner command; e2e-tester **0 allow /
2 deny**; `communication.instructions.md` reference **1 × 15 specs**.

**Commit warning for whoever records this:** four paths are untracked —
`.agents/config/quality-gates.md`, `.agents/instructions/documentation-handoff.instructions.md`,
`plan/refactor-agent-portability-v1.md` and `tests/spec-quality-gates-declaration.test.js`.
A commit staged from `git diff --name-only` alone would drop all four.

## Alternatives

| ID | Option | Why rejected |
|----|--------|--------------|
| ALT-01 | Keep G1–G8 but mark them `SKIPPED — not applicable` in this repo. | Eight dead rows are still eight rows a consumer reads as instructions. The declaration file removes the rows entirely and makes "no gate" a first-class, honest state. |
| ALT-02 | Put the gate declaration at the consumer repository root (`quality-gates.md`). | Root files are also sync-managed with the same skip-if-modified rule, so durability does not improve, and the root is shipped real estate the template already uses for `AGENTS.md`. `.agents/config/` already holds two sibling declarations (`domain.md`, `issue-tracker.md`), so discovery is by convention. |
| ALT-03 | Add `.agents/config/quality-gates.md` to `projectOwnedPaths` in `scripts/sync.js`. | Adopted 2026-11-02 as the user-approved RISK-01 fix, which supersedes CON-01 for that one file: the plan's markdown-only constraint could not otherwise deliver the durability it promises. |
| ALT-04 | Widen `reviewer.md`'s allowlist to include `*.md` writes so it can apply handoffs itself. | The reviewer must not write the tree; report-don't-fix is the doctrine. The orchestrator holds the `*.md` grant and applies handoffs. |
| ALT-05 | Delete the memory-bank guidance from the orchestrator templates instead of making it conditional. | Removes the read side, which every agent still needs (conventions and context). BLOCK-A keeps the read for all and conditions only the write. |

## Dependencies

| ID | Dependency | Why it matters |
|----|-----------|----------------|
| DEP-01 | `.agents/config/quality-gates.md` must exist before `unit-tester.md` can name its sections. | T9 ← T1. Same-batch would leave the reference unverifiable. |
| DEP-02 | The census replacement must land before the adjacent-count edits. | T3 ← T2: both edit one file, and T3's anchors assume the census section is gone. |
| DEP-03 | All verifications run after their edits, never concurrently with them. | Batches C–E are ordered behind A–B. |
| DEP-04 | `tests/spec-orchestrator-parity.test.js` and `tests/spec-knowledge-retrieval.test.js` constrain the orchestrator edits. | Exact occurrence counts: `knowledge-retrieval.instructions.md` = 2 / 2 / 6; `knowledgebase_knowledgebase_search` in feature-pipeline = 2; pipeline agent specs = 11. |
| DEP-05 | Sync and packaging need no change. | `.agents/` and `.opencode/agents/` are already in `package.json` `files` and in the sync copy loops (`scripts/sync.js:76`, `:575-614`). |

## Files

| ID | Path | Action |
|----|------|--------|
| FILE-01 | `.agents/config/quality-gates.md` | Create |
| FILE-02 | `.opencode/agents/unit-tester.md` | Edit |
| FILE-03 | `.opencode/agents/reviewer.md` | Edit |
| FILE-04 | `.agents/instructions/agent.instructions.md` | Edit |
| FILE-05 | `.opencode/agents/orchestrator/orchestrator.md` | Edit |
| FILE-06 | `.opencode/agents/orchestrator/feature-pipeline.md` | Edit |
| FILE-07 | `.opencode/agents/orchestrator/tdd-orchestrator.md` | Edit |
| FILE-08 | `.agents/config/README.md` | Edit |
| FILE-09 | `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/tasks/_index.md`, `.agents/instructions/learned-knowledge.instructions.md` | Append (T16) |
| FILE-10 | `.agents/instructions/documentation-handoff.instructions.md` | Create (review repair MINOR 3) |
| FILE-11 | `tests/spec-quality-gates-declaration.test.js` | Create (review repair MAJOR 1) |
| FILE-12 | `tests/spec-orchestrator-parity.test.js` | Edit — receiver assertion (review repair MINOR 3) |
| FILE-13 | `scripts/sync.js`, `scripts/sync-unit.test.js` | Edit — dry-run guards + prune proof (review repair MINOR 1, MINOR 4) |
| FILE-14 | `docs/.architecture-context.md` | Edit — instruction count 23 → 24 (review repair) |

Untouched by design in the original scope: `AGENTS.md`, `.agents/config/domain.md`, `.agents/config/issue-tracker.md`, `package.json`, `skills-lock.json`. The review repair necessarily edited `scripts/**`, `tests/**` and `docs/.architecture-context.md`; see the Review repair section above.

## Testing

| ID | What | Command | Pass condition |
|----|------|---------|----------------|
| TEST-01 | Forbidden-token scan across the edited shipped files | the `grep -rnoE` pipeline in Phase 3 | output `0` |
| TEST-02 | Reviewer structure and read-only shape | T10 assertions | 23 allow / 15 deny; spaced merge guard; no runner commands |
| TEST-03 | Unit-tester reads the declaration, keeps doctrine | T11 assertions | no G1–G8, no hardcoded thresholds, frontmatter diff empty |
| TEST-04 | Instructions audit procedure, no frozen counts | T12 assertions | 7 audit commands present; no census phrases |
| TEST-05 | Orchestrator role-awareness and handoff receiver | T13 assertions | 2 / 2 / 4 BLOCK-A; 1 BLOCK-B each; parity counts unchanged |
| TEST-06 | Config documents | T14 assertions | 8 `##` sections; example marked; README section present |
| TEST-07 | Whole-set no-dangling-reference sweep | T15 step 3 | every command returns the stated count |
| TEST-08 | Repo gates | `npm run test:unit`; `npx playwright test` | 0 failed; 7 passed / 1 skipped |
| TEST-09 | Non-vacuity of TEST-01 | inject the token `cms-apmc` into a temporary copy of `reviewer.md`, run TEST-01, confirm a non-zero hit, delete the copy | the scan must fail on a seeded token; a scan that cannot fail is not evidence |

## Risks & Assumptions

| ID | Type | Description | Mitigation |
|----|------|-------------|-----------|
| RISK-01 | Risk | **`--force` can erase a consumer's gate declaration.** `.agents/config/quality-gates.md` is sync-managed like every `.agents/**` file; a consumer edit is skipped (`Skipped locally modified file`), but `npx ai-workflow-setup --force` overwrites it and takes the project's gates with it. | **FIXED 2026-11-02 (user-approved extension beyond CON-01):** `config/quality-gates.md` is in `projectOwnedPaths`, and `projectOwnedAgentStubs` scaffolds it create-if-absent from the package copy, so `--force` and `--prune` cannot replace it. Proven by a new `scripts/sync-unit.test.js` case. |
| RISK-02 | Risk | Removing the enumerated runner deny rows looks like a permission relaxation to a future reviewer. | The catch-all shell deny is first and unchanged (SEC-02), and the reason is written into the frontmatter comment. T10 asserts the rule counts. |
| RISK-03 | Risk | The orchestrator parity tests count literal occurrences; a well-meaning edit could add a stray `knowledge-retrieval.instructions.md` mention. | T13 asserts 2 / 2 / 6 and TEST-08 runs the suite. |
| RISK-04 | Risk | A project fills `quality-gates.md` with a command that writes the tree, and the unit-tester runs it. | The declaration's `Preconditions` and `Order constraint` columns plus `## Reader rules` require the command to be stated as run from the root; the unit-tester still cannot write outside test files. A declaration is a project decision, not a permission grant. |
| RISK-05 | Risk | Deleting the CI citations (`.github/workflows/deploy-hosting.yml`, `test-rules.yml`) removes the link between local gates and CI. | Those files do not exist here. The declaration replaces them: `quality-gates.md` is where a project says "this mirrors CI", and the reference is now checkable. |
| ASSUMPTION-01 | Assumption | Every consumer's gate set can be expressed as `ID / Command / Proves / Preconditions / Order constraint`. | Holds for the gates seen in this template's history (contract check, tests + count, coverage, build, artifact inspection, isolated-package tests, emulator tests, guard replay). A gate needing extra columns can record them in `Preconditions`. |
| ASSUMPTION-02 | Assumption | `scripts/` exists but the three gate scripts do not; all eight current gates are unrunnable here. | Verified at `9015a39` (see Introduction). Re-verify before Phase 1 if HEAD moved. |
| ASSUMPTION-03 | Assumption | Orchestrators hold the `edit: *.md` grant needed to apply handoffs. | Verified in all three frontmatters. If a project narrows that grant, BLOCK-B's step 2 becomes the orchestrator's unsatisfiable instruction — the project must keep `*.md` for the orchestrator or route handoffs to `tracker`. |
| ASSUMPTION-04 | Assumption | No test asserts on the prose this plan rewrites. | Verified: `grep -rn 'G1\|check-coverage\|quality-gates\|cms-apmc\|704' tests/ scripts/` → no output. Only the parity tests' occurrence counts constrain the edits. |

## Related Specifications

| Document | Relationship |
|---|---|
| `AGENTS.md` → `### Implementation Plan Generation` | Defines this plan's table shape and batch semantics; unchanged by this plan. |
| `.opencode/agents/implementer.md` | The planning authority for the fields used here. |
| `.agents/instructions/agent.instructions.md` | The document being rewritten in T2/T3; its V1→V2 mapping and pattern-matching sections are the contract the audit procedure verifies. |
| `.agents/config/domain.md`, `.agents/config/issue-tracker.md` | Sibling declarations whose frontmatter and prose shape `quality-gates.md` must match. Not edited. |
| `.opencode/agents/unit-tester.md` `## Documentation boundary` | The doctrine this plan generalises to every agent with a narrow grant. |
| `plan/feature-matt-skills-expansion-v1.md` | Precedent for the Batch / Dependencies / Parallel Execution Summary table shape used here. |
