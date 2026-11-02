# Issue Tracker

This repository uses **GitHub Issues** on `origin` (the default remote).
Every skill that needs a tracker is handed this file, and it is the only authored definition of the tracker.

If labels are missing, run `/setup-matt-pocock-skills`.
If this file is missing, run `npx ai-workflow-setup`.

## Labels

This table is the single label definition: it is restated nowhere else. `scripts/setup/tracker-phase.js` reads the packaged copy shipped in the npm tarball, while `/setup-matt-pocock-skills` reads the project copy — so editing this file in a consumer project changes the labels the command reads, not the ones setup creates.

| Label | Colour | Description |
|---|---|---|
| `wayfinder:map` | `#5319E7` | A wayfinding map: one issue tracking a large effort that spans sessions. |
| `wayfinder:research` | `#1D76DB` | A map or ticket item that needs external research before a decision can be made. |
| `wayfinder:prototype` | `#0E8A16` | A ticket whose open question can only be settled by a throwaway prototype. |
| `wayfinder:grilling` | `#FBCA04` | A ticket whose open question is settled by a grilling interview. |
| `wayfinder:task` | `#C2E0C6` | A child ticket of a wayfinding map that an agent can execute. |
| `ready-for-agent` | `#B60205` | Marks a spec or ticket an agent may pick up with no further interviewing. |

Both creation paths are idempotent: each creates only missing labels and neither edits an existing label.
Wayfinding maps and tickets carry only `wayfinder:*` labels and never `ready-for-agent`.

## Wayfinding operations

- **Map** — one GitHub issue labelled `wayfinder:map`. Its body states the destination and the open questions.
- **Ticket** — a child issue labelled `wayfinder:task` whose body opens with `Map: #<n>`, naming the map it belongs to.
- **Claim** — `gh issue edit <n> --add-assignee @me`, run before any work starts: an open, unassigned ticket is unclaimed.
- **Blocking** — a `Blocked by: #12, #14` line in the ticket body. `gh` exposes no stable command for GitHub's native blocking relationship, so this tracker falls back to a body convention, resolved by hand once every listed issue is closed.
- **Frontier query** — `gh issue list --label wayfinder:task --state open --json number,title,body,labels,assignees`, then keep only rows that are unassigned and whose `Blocked by:` issues are all closed.
- **Closing** — `gh issue close <n> --comment "<decision>"`, recording the decision that closes the ticket.

## Triage

`ready-for-agent` marks a spec or ticket an agent may pick up with no further interviewing.

## Local-markdown fallback

When no tracker is configured, maps and tickets live under `.scratch/wayfinder/<map-slug>/`.
That directory is gitignored, so nothing written there can be committed.

## Repo-local mirror

Some vendored skills name `docs/agents/issue-tracker.md`; that file is a pointer so this doc stays the single definition, and the fenced block below is written to it verbatim:

```markdown
# Issue tracker

This repository uses **GitHub Issues** on `origin`.

The canonical tracker declaration — the label table and the wayfinding operations — is `.agents/config/issue-tracker.md`, which `npx ai-workflow-setup` keeps current. Labels are created by `npx ai-workflow-setup` or by `/setup-matt-pocock-skills`; both are idempotent. Read the canonical doc's `## Wayfinding operations` section before creating or reading a map or ticket.

This file is a pointer, not a second definition. It exists because the vendored `wayfinder`, `to-tickets`, and `to-spec` skills name this exact path.
```
