---
title: "Quality Gates"
description: "Per-project declaration of the gate set: commands, what each gate proves, preconditions, ordering rules, count contract, and coverage thresholds."
---

# Quality Gates

This file is the single declaration of this project's gates. `unit-tester` reads it, and
nothing else declares a gate: a command that is not written here is not a gate this agent
may run or report on.

A gate that is not declared in this file is reported as `NOT DECLARED`. It is never
invented, never substituted with a near-equivalent command, and never dropped from the
report.

## Gate table

| ID | Command | Proves | Preconditions | Order constraint |
|----|---------|--------|---------------|------------------|

No gates are declared by default. Until a row is added, the whole set is reported
as `GATES: NOT DECLARED` — one row, with the same consequence as an absent file.
A present-but-empty table is a declaration that no gate set exists; it is never
reported as an empty table.

```text
<!-- EXAMPLE ONLY — replace or delete. No agent runs these rows. -->
| G1 | <format check command>       | <what a green run proves>          | <what must be true first>        | <gate that must run before it> |
| G2 | <unit test command>           | <what a green run proves>          | <what must be true first>        | <gate that must run before it> |
| G3 | <coverage report command>     | <what a green run proves>          | <what must be true first>        | <gate that must run before it> |
| G4 | <build command>               | <what a green run proves>          | <what must be true first>        | <gate that must run before it> |
| G5 | <artifact inspection command> | <what a green run proves>          | <what must be true first>        | <gate that must run before it> |
| G6 | <integration or security-rules command> | <what a green run proves> | <what must be true first>        | <gate that must run before it> |
```

## Count contract (optional)

A gate that pins a number — a file count, a test count, a zero-skipped count — is a count
gate. Complete all three subsections for it.

### What invariant must hold

State the arithmetic the gate asserts: which totals add up, from which sources, and what
must be zero. Name every component of the sum, so a reader can re-add it.

### Where it is pinned

Name every place the expected number is written: the gate command, its fixture, and this
file. A number written in three places is three places that drift; list them so the next
editor updates all of them.

### What must never be edited

A red count gate is an arithmetic question first. Never edit the pinned expectation — in
the gate command, in its fixture, or in this file — to turn a red run green. If the
arithmetic does justify an amendment, say so explicitly and mirror it in every place named
above.

## Coverage thresholds (optional)

| Target | Lines | Functions | Branches | Source artifact | Missing report |
|--------|-------|-----------|----------|-----------------|----------------|

A gate that reads a coverage report fails when the report is missing, and names the
target it could not find. A target with no row here has **no** threshold declared: report
it as "no coverage threshold declared", never as a default percentage.

## Ordering rules (optional)

| Rule | Why |
|------|-----|
| Example: a gate that purges or produces an artifact directory runs before the gate that reads it. | The reader would otherwise see a stale or absent artifact. |
| Example: a gate that writes a build output runs before the gate that inspects that output. | The inspector asserts on the artifact the build produced. |
| Example: a gate that produces a coverage report runs before the threshold check. | The threshold has nothing to read until the report exists. |

## Reader rules

A gate that is not declared in this file is reported as `NOT DECLARED`. It is never
invented, never substituted with a near-equivalent command, and never dropped from the
report.

- An empty `Command` cell is `NOT DECLARED`, with the reason.
- Absence of this file is `NOT DECLARED` for the whole set: exactly one row, not one row
  per assumed gate.
- A present declaration with zero declared gates is `GATES: NOT DECLARED` for the whole
  set: exactly one row, identical to the absent-file case, never an empty table.
- A declared command that does not exist in this repository is `NOT DECLARED`, never a
  near-equivalent.
- Gates run in declaration order unless an ordering rule says otherwise.
- CI configuration is not a gate declaration unless this file names it.

## How to declare a gate

1. Give it a stable ID. Do not renumber an existing row to leave room.
2. Write the exact command as it is typed from the repository root.
3. Say what a green run proves — the behaviour, not the tool.
4. State the preconditions: dependencies installed, an artifact present, a credential set.
5. State the order constraint, or write `none`.

A gate that pins a number also completes `## Count contract (optional)`; a gate that
produces a coverage report also completes `## Coverage thresholds (optional)`.

## Maintenance

When a gate command changes, this file changes in the same commit. Template sync treats
this file as project-owned: it is created if absent and never overwritten or pruned,
including with `--force`, so a project's declared gates survive a template update.
