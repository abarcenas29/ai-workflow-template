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
| G1 | `npx vitest run` | The unit and spec suite is green: every `scripts/**/*.test.js` module test and every `tests/**/*.test.js` cross-file spec check passes. | `npm ci` has run — `vitest` is a devDependency. Run from the repository root. | none |
| G2 | `npx vitest run --coverage` | The same suite is green **and** measured coverage of `scripts/**` meets the thresholds pinned in `vitest.config.ts`. | `npm ci` has run — `@vitest/coverage-v8` is a devDependency. Writes `coverage/`. | none — the run collects its own coverage |
| G3 | `npm test` | The Playwright spec suite (`tests/**/*.spec.ts`, `chromium` project) is green. | `npx playwright install chromium` has run. The config defaults to headed mode, so prefix `HEADLESS=true` where there is no display (CI does this). | none |
| G4 | `node scripts/validate-memory-schema.js` | Staged `memory-bank/**/*.md` frontmatter passes the memory-schema validator: every tag is known to `memory-bank/.vocabulary.json` and required fields are present. | Run from the repository root. It validates files staged in the git index; with a clean index it validates nothing and exits 0 vacuously. | none |

These four rows are the gates this repository has. Each one was executed from the
repository root on 2026-11-10 and recorded at the exit code it returned; a command
that could not be run here is absent rather than approximated.

Measured evidence from that run — **evidence, not pinned expectations**. No gate
here asserts a count, so no count gate is declared and the count contract below
does not apply:

| Gate | Result on 2026-11-10 | Exit |
|------|----------------------|------|
| G1 | 1,049 passed, 0 failed, 33 files | **0** |
| G2 | thresholds met (statements 96.44%, branches 93.49%, functions 97.21%, lines 96.70%) and 1,049 passed, 0 failed, 33 files | **0** |
| G3 | 7 passed, 1 skipped (pre-existing skip), 0 failed | 0 |
| G4 | clean index, zero files validated | 0 |

**G1 and G2 are green as of this re-baseline.** When these four rows were first
written, both gates were red, and `tests/spec-quality-gates-declaration.test.js`
was the cause: its assertion "the shipped declaration has a gate table with zero
data rows" (`expected [ …(4) ] to deeply equal []`) pinned the pre-declaration
state of this very file, and it was the only failing test in the suite. That
assertion now pins the declared set instead — exactly four data rows and the IDs
`G1, G2, G3, G4` — with the rest of the reporting contract untouched. Both gates
were then re-run from the repository root and returned exit 0 with the counts in
the table above. The four gate commands, the 90 coverage threshold inherited from
`vitest.config.ts`, and the G3 and G4 rows are unchanged.

A present-but-empty table is still a declaration that no gate set exists: it is
reported as `GATES: NOT DECLARED`, never as an empty table. A consumer project
that has declared nothing is in the state described by the reader rules below.

### Checked and not declared

These candidates exist as habits, not as gates. They are deliberately absent, and
the readers must report them as `NOT DECLARED` rather than substituting a
near-equivalent.

- **markdownlint** — no `package.json` script, no local dependency
  (`npm ls markdownlint-cli2` → empty), and no `.markdownlint*` config anywhere.
  An ad hoc `npx markdownlint-cli2` resolves from the npx cache under stock rules
  and reports MD013 (line length) only on this file: stylistic noise, not a gate.
- **lint** — no ESLint (or other linter) script, config, or dependency.
- **typecheck / build** — no `tsconfig.json`, no `typescript` dependency, and no
  `build` script. The package ships configuration and JavaScript; nothing compiles.
- **coverage is enforced, not waived** — `@vitest/coverage-v8` is installed and
  `npx vitest run --coverage` measures every threshold green today (96.70% lines).
  Its thresholds are declared under `## Coverage thresholds` below; there is no
  advisory fallback here.

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
| `scripts/**` | 90 | 90 | 90 | `coverage/coverage-final.json` (human-readable: `coverage/index.html`) | fails — names the target it could not find |

The numbers above are the tool's own: they are copied from `coverage.thresholds` in
`vitest.config.ts`, which also pins `statements: 90`. That column does not exist in
this table, so a reader that needs statements should read it from the vitest config
and treat it as declared — it is measured by the same run.

Measured on 2026-11-10: lines **96.70%** (2404/2486) against the 90 declared here;
statements 96.44% (2553/2647), functions 97.21% (279/287), branches 93.49%
(1379/1475). Every declared threshold is met with margin, and
`npx vitest run --coverage` exits 0 with 33 files / 1,049 tests passing.

If the thresholds in `vitest.config.ts` change, this row changes in the same commit.
`90` here is not an aspiration and not a default: it is the enforced number.
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
