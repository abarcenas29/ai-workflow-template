---
description: "Commit staged files with emoji + timestamp, push to branch, and create PR"
agent: build
subtask: true
---

# GitHub PR Publisher

Commit staged files, push to a branch, and create a thorough PR on GitHub. The branch name is required as the first argument (`$1`).

## Instructions

1. **Check for staged files** — `!git diff --cached --stat`. If no files are staged, tell the user and stop.

2. **Read tracker log** — `!cat docs/tracker-log.md 2>/dev/null || echo "No tracker log found"`.

3. **Generate commit message** — Analyze the staged changes (`!git diff --cached`) and craft a Conventional Commits message with:
   - Auto-detect type from changes: `✨ feat:` for features, `🐛 fix:` for bug fixes, `📝 docs:` for docs, `♻️ refactor:` for refactors, `🧪 test:` for tests, `🔧 chore:` for maintenance
   - A clear, concise description of what changed
   - A timestamp appended: `[YYYY-MM-DD HH:MM]`

4. **Commit** — `!git commit -m "<message>"`

5. **Push** — `!git push -u origin $1`

6. **Create PR** — Use `!gh pr create` with:
   - Title matching the commit message
   - Base branch: `main`
   - Body containing the tracker log content, wrapped in a "## Changes" section

7. **Check for errors** — If `gh` is not authenticated, warn the user. If push fails, report the error.