---
name: to-pr
description: "Closes out the current branch end to end: commits with a conventional message, pushes the branch, and opens a pull request with gh. Use when the user says \"open a PR\", \"close this out\", or asks to publish a branch. The base branch is auto-detected from origin/HEAD; ask the user when it is ambiguous. Never merges, force-pushes, or deletes a branch."
---

# to-pr

Publish the current branch as a pull request: commit, push, open the PR, stop.

## When to Use This Skill

- The user says "open a PR", "raise a PR", or "close this out".
- A branch is finished and needs to reach review.
- Work is committed locally but not pushed, or pushed without a PR.

## Prerequisites

- `gh` is installed.
- The repository has a remote named `origin`.
- The working tree is clean, or the intended changes are staged for a commit. A clean tree is fine when the branch already has commits ahead of the base.

## Step 1: Preconditions

1. Run `git status --porcelain` and read the output.
2. If the tree has nothing staged, modified, or untracked, resolve the base branch using the Step 4 rules (asking when they say to ask), then run `git rev-list --count origin/<base>..HEAD`. Proceed when the count is greater than 0 — the branch is already committed and only needs push + PR. Stop and say there is nothing to publish only when the tree is clean **and** the count is 0.
3. Run `gh auth status`. If it fails, stop and print: `Run gh auth login, then retry.` Do not attempt a commit or push that cannot be published.

## Step 2: Commit

1. If Step 1 found a clean tree, skip this step.
2. Read `.agents/skills/conventional-commit/SKILL.md` and follow it to construct the message. Do not restate or paraphrase its type list here; that file is the authority.
3. Stage only the paths that belong to this change. Do not run `git add -A` or `git add .` when the tree holds unrelated edits.
4. Commit with the conventional message produced above.
5. If the commit is already pushed, never amend it. Add a new commit instead.

## Step 3: Push

Run `git push -u origin <current-branch>`, where `<current-branch>` is the output of `git rev-parse --abbrev-ref HEAD`.

Never use `--force` or `--force-with-lease`.

## Step 4: Resolve the Base Branch

Apply these rules in order:

1. If the user named a base branch, use it.
2. Otherwise run `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` and strip the leading `origin/`. That is the base.
3. Ask the user which base to use, and wait for an answer, when any of these is true:
   - the command in step 2 fails;
   - the result equals the current branch;
   - the current branch nests under another remote branch, for example `feat/a/b` while `origin/feat/a` exists.
4. Never fall back to `main` silently. When the base is ambiguous, the only correct action is to ask.

## Step 5: Compose the PR Body

Read `.agents/skills/pr/SKILL.md` and use its Summary, Evidence, and Merge Danger structure for the body.

- Evidence may be a test-run excerpt when the change has no screenshots.
- Keep the body factual and short; the PR is for a reviewer, not a changelog.

## Step 6: Create the PR

Write the body to a temporary file, then run:

```bash
gh pr create --base <base> --head <branch> --title "<conventional title>" --body-file <tmpfile>
```

The title follows the same conventional shape as the commit subject.

## Step 7: Stop

Print the PR URL and stop. The terminal artifact of this skill is an open pull request awaiting human review.

## Forbidden Actions

- `gh pr merge`
- `git merge`
- force-push (`--force`, `--force-with-lease`)
- deleting a branch (`git branch -d`, `git push --delete`)
- `--admin` on any `gh` command
- approving or auto-approving a pull request

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `gh auth status` fails | Not logged in | Run `gh auth login`, then retry |
| `No commits between` on create | Base and head point at the same commit | Confirm the base; the branch may already be merged |
| `origin/HEAD` unset | Clone lacks a recorded default branch | Ask the user which base to use |
