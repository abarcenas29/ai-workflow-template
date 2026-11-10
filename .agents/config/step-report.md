---
title: "Step Report"
description: "Five-line return format for delegated steps"
---

# Step Report

A delegated step returns these five lines, in order:

```text
STATUS: done | blocked | failed | needs-answer | deferred
ARTIFACTS: {paths, comma-separated, or none}
QUESTIONS: {numbered, recommended answer each, or none}
HANDOFF: {documentation handoff path, or none}
TOKENS: {est. input+output tokens} / {budget share}
```

- `STATUS` — one of the five.
- `ARTIFACTS` — paths only.
- `QUESTIONS` — numbered, recommended answer each.
- `HANDOFF` — `none` or target path.
- `TOKENS` — est. tokens + budget share.
- `deferred` — the step is parked: the pipeline continues with every step that does not depend on it. Never counted as a failure, never triggers a retry.

## Caps

- `previous_step_summary` — 40 words.
- `QUESTIONS` — 3 numbered items.
- `ARTIFACTS` — paths only, no prose.
- Every other field — one line.

Cuts are silent in the report; the orchestrator log gains one line per cut: `CAPPED: {field} {before}->{after}`.

## Rules

- All five every time; `none` if empty.
- Handoff block, if any, is last.
