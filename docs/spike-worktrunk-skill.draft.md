---
id: "spike-worktrunk-skill.draft"
title: "Spike draft: Worktrunk Skill"
updated: "2026-11-07"
status: "drafting"
doc_type: "spike-draft"
tags: [scope, spike, worktrunk-skill]
---

# Spike Draft: Worktrunk Skill

## Problem Statement

The requester asked: "Add a custom skill to leverage worktrunk and not just worktree." The

working interpretation is that a new skill under `.agents/skills/` should teach agents to run

git worktree workflows through the `worktrunk` CLI (`wt`) rather than relying only on the

runtime worktree tools OpenCode already exposes (`worktree_create`, `worktree_list`,

`worktree_remove`). Unknown at this point: what job the skill actually does (operational

playbook vs. configuration help), whether it replaces or augments the existing worktree tools

and worktrunk's own OpenCode plugin, whether it ships to consumers or stays repo-local, how

the agent should be allowed to reach destructive commands (`wt merge`, `wt remove`), and what

"done" means for a skill whose prerequisite binary does not appear to be installed here.

## Evidence

- `docs/.orchestrator-log.md:5,16-18` — the verbatim request and the orchestrator's own reading: a repo-local skill under `.agents/skills/` that drives `wt` instead of only the built-in worktree tooling; it names the open questions (workflow coverage, replace-or-augment, config/hooks, definition of done).
- `skills-lock.json:1-80` — 10 pinned vendored entries; `tests/spec-skills-lock.test.js:10,154-155` asserts that the two repo-local skills (`to-pr`, `close-out`) exist on disk **with no lock entry**. A new repo-local skill therefore needs no `skills-lock.json` change.
- `.agents/skills/to-pr/SKILL.md:1-4` and `.agents/skills/close-out/SKILL.md:1-5` — the repo-local precedent: `name` + `description` only, no `license`, no lock entry; `disable-model-invocation: true` is used only for the phrase-triggered human wrapper (`close-out`), while the operational skill (`to-pr`) is model-invocable.
- `.agents/instructions/agent-skill.instructions.md:33-49,236-248` — frontmatter contract (`name` lowercase-hyphen, `description` ≤1024 chars stating WHAT/WHEN/keywords), required body sections, SKILL.md kept under 500 lines with large workflows split into `references/`.
- Skill counts are hand-maintained in three places: `AGENTS.md:50`, `README.md:120`, `docs/.architecture-context.md:76` all say **41 skills**. Adding one means editing all three.
- `tests/ai-workflow.spec.ts` asserts a skills floor of `>= 30` (recorded at `memory-bank/progress.md:166`), so one added skill does not trip the Playwright structural check.
- Worktrunk docs v0.81.0 (https://worktrunk.dev) — core commands are `wt switch`, `wt list`, `wt merge`, `wt remove`; advanced surfaces are hooks (`pre/post-start`, `pre/post-merge`, `pre/post-remove`), LLM commit messages, interactive picker, `wt step copy-ignored`, aliases, and PR checkout (`wt switch pr:123`).
- https://worktrunk.dev/claude-code/ — worktrunk ships agent plugins, but **for OpenCode its plugin provides only a worktree strategy and activity markers**, not the "configuration skill" that Claude Code, Codex and Gemini get. OpenCode 2 routes OpenCode-created worktrees through `wt switch --create` / `wt remove` once that plugin is installed.
- https://worktrunk.dev/hook/ — project hooks live in `.config/wt.toml`; user hooks in `~/.config/worktrunk/config.toml`; project commands need per-command approval and `-y` bypasses prompts.
- Repo state: no `.config/` directory exists, so there is no project `wt.toml`; `~/.config/worktrunk/` does not exist.
- `wt` binary not found in `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, or `~/.cargo/bin`, and no Homebrew `worktrunk` in `/opt/homebrew/Cellar`. Contradicting evidence: `plan/refactor-opencode-plugin-v2-v1.md:196` (DEP-007) records "Worktrunk `wt` 0.81.0 — Local machine". Installation state is therefore unverified.
- The repository contains no worktree tooling source. `worktree_create` / `worktree_list` / `worktree_remove` are OpenCode runtime tools and appear only in `docs/.orchestrator-log.md:17` — there is nothing in the repo for a skill to wrap.

## Round 1 — Answers (2026-11-07)

- Pending — Q1–Q7 emitted to the orchestrator; no answers received yet.

## Frontier (open)

- [ ] **Q1** — Job of the skill: operational playbook for `wt` commands, configuration help (hooks/aliases/path templates/LLM commits), or both?
- [ ] **Q2** — Relationship to OpenCode's worktree tools and worktrunk's own OpenCode plugin: document a direct-CLI skill, require the plugin, or replace the tools?
- [ ] **Q3** — Distribution: shipped template skill under `.agents/skills/worktrunk/` (counts move 41 → 42), or repo-only and untracked?
- [ ] **Q4** — Trigger model: model-invocable (auto-loads on worktree talk) or `disable-model-invocation: true` human-only?
- [ ] **Q5** — Command surface: core four (`switch`/`list`/`remove`/`merge`) plus `wt step`, or the full documented surface?
- [ ] **Q6** — Destructive-op policy: allow `wt merge` / `wt remove` behind explicit confirmation, or forbid them in the skill?
- [ ] **Q7** — Runtime prerequisite: assume `wt` is installed with a preflight check, or have the skill walk the user through installation?

## Deferred

- None yet.

## Prototype Requests

- None. Every open question is a scope decision, not an empirical one.
