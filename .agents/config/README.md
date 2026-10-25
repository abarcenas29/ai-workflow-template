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

`grill-me` and `grill-with-docs` are human-invoked wrappers: the first calls `grilling` alone,
the second calls `grilling` and `domain-modeling` together.

## Scope agent

`.opencode/agents/scope.agent.md` is the front door for underspecified feature requests. It
runs grilling in rounds against a draft file, emits the current frontier as numbered questions,
and finishes by writing a spike document at `docs/spike-<feature>.md` — the input
`researcher.agent.md` already expects.

It never builds or runs code. When a question needs a prototype it emits
`prototype needed: <question>`, and the orchestrator delegates the work to `coder` (logic) or
`designer` (UI).

## Domain docs

`.agents/config/domain.md` declares where domain documentation lives: `GLOSSARY.md` at the
repository root and ADRs under `docs/adr/`. The `domain-modeling` skill reads it; when the file
or the docs it names are absent, the skill proceeds silently.
