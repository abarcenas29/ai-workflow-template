---
description: "Configure the GitHub Issues tracker and wayfinding labels"
agent: build
subtask: true
---

# Setup Matt Pocock Skills Tracker

Declare GitHub Issues as this repository's issue tracker and create the wayfinding labels the vendored
`wayfinder`, `to-tickets`, and `to-spec` skills expect. This command writes one pointer file and creates
missing labels; it never distributes template files.

## Instructions

1. **Auth first** — run `!gh auth status`. If it exits non-zero, print one warning that names `gh auth login`,
   state that no labels were checked or created, and **end the command without aborting the session**. Every
   later step needs authentication, so the check belongs at the top.

2. **Canonical doc present?** — check that `.agents/config/issue-tracker.md` exists. If it does not, print
   "run `npx ai-workflow-setup`" and stop. Do **not** author a tracker document and do **not** copy any file:
   file distribution belongs to `npx ai-workflow-setup`.

3. **Read the label table** — read the label table from that file with
   `!sed -n '/^## Labels/,/^## /p' .agents/config/issue-tracker.md`. That table is the only source of label
   names, colours, and descriptions. Do not invent, hardcode, or restate any of them in this command.

4. **List what exists** — run `!gh label list --json name --limit 200 --jq '.[].name'` and keep the returned
   names as the set of labels that are already present.

5. **Create only the missing** — for each table row whose name is absent from that set, run
   `!gh label create <name> --color <hex> --description "<text>"` using the row's own values. Treat a non-zero
   exit whose output mentions `already exists` as *present* (a concurrent run or a stale list). Never retry
   with `--force`, and never run `gh label edit`.

6. **Refresh the mirror** — write `docs/agents/issue-tracker.md` with the fenced block from
   `.agents/config/issue-tracker.md`'s `## Repo-local mirror` section, verbatim. Create `docs/agents/` if it is
   missing. If the file already holds exactly those bytes, write nothing.

7. **Report** — print a three-column table (`label`, `created`, `already present`), the two counts, and the
   next step: re-run `wayfinder`, `to-tickets`, or `to-spec`.

8. **Idempotency** — state that a second run creates nothing and rewrites nothing, because steps 5 and 6 only
   act on a difference.

## Scope boundary

This command declares the tracker, creates missing labels, and writes one pointer file. It never copies,
syncs, or edits a skill, agent, instruction, prompt, script, `AGENTS.md`, `opencode.json`, or
`skills-lock.json` — file distribution is `npx ai-workflow-setup`'s job. It also never merges, pushes, or
deletes anything.
