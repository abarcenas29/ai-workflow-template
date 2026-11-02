---
title: "Agent skills and configuration"
description: "Discovery pointer for the scoping skills, the scope agent, and domain documentation locations."
---

## Why this file exists

Root-file sync skips any file you have modified locally. If you edited `AGENTS.md`, newer
versions of the template will not overwrite it, so a `## Agent skills` section added upstream
will never reach your copy. This file is the discovery path in that case: it lives under
`.agents/`, which syncs on every update.

## Scoping skills

Each skill lives at `.agents/skills/<name>/SKILL.md` and is loaded with the skill tool.

| Skill | Use it when |
|-------|-------------|
| `grilling` | A plan, decision, or idea needs stress-testing, or a request is too vague to plan — rounds of numbered questions narrow the frontier, each with a recommended answer. |
| `grill-me` | You want the same interview with no repository context and no document output — a stateless, one-shot entry point. |
| `grill-with-docs` | You want the interview plus the written record — the glossary and ADRs are created as decisions settle. |
| `domain-modeling` | Project terminology or architectural decisions are being introduced or changed, and `GLOSSARY.md` or an ADR needs to capture them. |
| `prototype` | A design question can only be settled by running throwaway code — the logic branch for state models and data flow, the UI branch for look and feel. |
| `wayfinder` | A chunk of work is too big for one session and needs a shared map of decision tickets on the issue tracker. |
| `to-tickets` | A plan, spec, or conversation must become tracer-bullet tickets, each declaring its blocking edges. |
| `to-spec` | The conversation already holds the decisions and needs to be synthesized into a spec on the issue tracker. |
| `pr` | A pull request body needs the Summary / Evidence / Merge Danger structure. |

`grill-me` and `grill-with-docs` are human-invoked wrappers: the first calls `grilling` alone,
the second calls `grilling` and `domain-modeling` together.

## Scope agent

`.opencode/agents/scope.md` is the front door for underspecified feature requests. It
runs grilling in rounds against a draft file, emits the current frontier as numbered questions,
and finishes by writing a spike document at `docs/spike-<feature>.md` — the input
`researcher.md` already expects.

It never builds or runs code. When a question needs a prototype it emits
`prototype needed: <question>`, and the orchestrator delegates the work to `coder` (logic) or
`designer` (UI).

## Close-out and PR

`to-pr` (`.agents/skills/to-pr/SKILL.md`) commits with a conventional message, pushes the branch, and
opens a pull request. It resolves the base from `origin/HEAD`, asks the user when that is ambiguous,
and never merges.
`close-out` is the human-invoked wrapper: say "I am done with this, close it up", "done with this",
or "close it up".
`pr` (`.agents/skills/pr/SKILL.md`) is the body-shape reference — Summary / Evidence / Merge Danger.

## Domain docs

`.agents/config/domain.md` declares where domain documentation lives: `GLOSSARY.md` at the
repository root and ADRs under `docs/adr/`. The `domain-modeling` skill reads it; when the file
or the docs it names are absent, the skill proceeds silently.

## Issue tracker

`.agents/config/issue-tracker.md` is the only label definition and the home of the
`## Wayfinding operations` conventions.
`npx ai-workflow-setup` and `/setup-matt-pocock-skills` both create missing labels idempotently, and
the command is what the vendored `wayfinder`, `to-tickets`, and `to-spec` skills tell users to run.
When no tracker is configured, maps and tickets fall back to `.scratch/wayfinder/`, which is gitignored.

## Research skill

`research` is vendored at `.agents/skills/research/SKILL.md`. It carries no `disable-model-invocation`,
so it is model-invocable: `researcher` calls it through the skill tool for each `wayfinder:research`
ticket. It is not a human trigger.
