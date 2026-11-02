---
name: close-out
description: "Human-invoked close-out for the current branch. Triggered by \"I am done with this, close it up\", \"done with this\", or \"close it up\". Runs the to-pr skill end to end — conventional commit, push, open a pull request — and stops at an open PR for human review. Never merges, never force-pushes, never deletes anything."
disable-model-invocation: true
---

# close-out

The phrase-triggered wrapper around `to-pr`: when the user says they are done, publish the branch and stop at an open PR.

## Trigger

This skill is human-invoked only. Run it when the user says any of these phrases:

- "I am done with this, close it up"
- "done with this"
- "close it up"

Do not start it unprompted.

## Scope

This closes out the current branch. It does not:

- start new work;
- review the change for quality;
- merge, approve, label, or delete anything.

## Steps

1. Read `.agents/skills/to-pr/SKILL.md` and follow it end to end.
2. If the base branch is ambiguous, ask the user which base to use and wait. Never default to `main`.
3. If `to-pr` stops on a precondition failure, relay its message and stop.

## Terminal State

Stop at an **open PR**. Print its URL and tell the user the next step is review and merge by a human.

## Never

- merge a pull request;
- approve or auto-approve a pull request;
- force-push;
- delete a branch;
- apply or remove labels.
