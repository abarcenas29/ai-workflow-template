---
description: "Canonical definition of the `### Documentation handoff` block an agent returns when its edit grant cannot write `memory-bank/**` or `docs/**`."
applyTo: "**"
---

# Documentation Handoff

An agent whose edit grant does not cover `memory-bank/**` or `docs/**` must not
attempt the write. It returns a `### Documentation handoff` block instead, and the
orchestrator or tracker applies it. This file is the single definition of that
block: every producer and every receiver points here.

## When to return a handoff

Return the block when the delegation brief asks for documentation and the agent's
edit grant excludes the target paths. If the grant covers them, write the files
and run `memory_bank_memory_update`; the handoff is the `otherwise` case.

Do not attempt the write when the grant excludes it. An attempted write is rejected
by the runtime, so it cannot succeed; attempting it only burns turns on a permission
error and makes the phase look like a failure.

## Canonical block

Return this block as the **last block inside slot 4** of the response — under
`## Risks and next step` for a `change-framed` reply, under
`## Decision and options with cost/risk` for a `decision-framed` one — with one entry
per target file, carrying the exact text to append.

It is a `###` sub-block, not a fifth `##` heading. The envelope
(`.agents/instructions/communication.instructions.md`, `## The Envelope`) allows
exactly four `##` headings, and the reviewer's S3 spot-check fails any reply with a
fifth, so a handoff written as `##` would violate the standard it ships under. Nesting
keeps both contracts satisfiable in one reply; exempting a fifth heading by name would
create a hole any reply could claim.

````text
### Documentation handoff

**Target:** `memory-bank/progress.md`
**Operation:** append (never overwrite)
**Reason:** this agent's edit grant does not cover `memory-bank/**`

```markdown
{exact text to append, ready to paste — no placeholders left in it}
```

**Target:** `memory-bank/activeContext.md`
**Operation:** append
**Reason:** same
```markdown
{exact text to append}
```
````

## Rules

- One `**Target:**` entry per file, in the order the brief named them.
- `**Operation:**` is `append` unless the brief explicitly asks to replace a named
  section; never propose a whole-file rewrite of `activeContext.md` or `progress.md`.
- The payload must be complete: no `{...}` placeholders, no "see above".
- If nothing needs recording, write `**Target:** none` and say why.
- Headings inside a fenced payload are literal text to append, not reply headings; the
  envelope counts only headings outside fences.
- Never claim the memory bank was updated. Say "handoff returned, not applied".
- Do not run `memory_bank_memory_update`; the applier runs it once after applying
  every entry from that step.
