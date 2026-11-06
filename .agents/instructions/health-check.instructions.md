---
description: "Checklist for /health: audits this project's OpenCode setup across MCP, plugins, sync, hooks, memory-bank, tracker, and maintainer packaging"
applyTo: "**"
---

# Health Check

This file is loaded on demand by `/health` and is a checklist, not an always-on rule.

## Modes

| Mode | Detected when | What it adds |
|---|---|---|
| maintainer | `bin/setup.js` and `scripts/setup/index.js` both exist, and `package.json` `name` is `@abarcenas/ai-workflow-template` | Category 7; Category 3 reports S1–S7 as `SKIP` with reason "maintainer mode" (D1 covers packaging) |
| consumer | anything else | Category 3 in full |

State the resolved mode and the evidence for it: which of the two paths existed and which `name` matched. `--maintainer` and `--consumer` override detection; say so in the header line.

## Severity contract

| Status | Meaning |
|---|---|
| `FAIL` | Blocker. Only the closed list below may produce it. |
| `WARN` | Wrong but survivable. Every other defect lands here. |
| `SKIP` | Could not verify. Always states the reason. |
| `OK` | Verified, with the evidence source named. |

`FAIL` is permitted only for:

- `opencode.json` that does not parse as JSON.
- An enabled server references a `{env:X}` and `X` is absent from `.env.example`.
- A missing core memory-bank file: `projectbrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `activeContext.md`, `progress.md`.
- A missing `AGENTS.md`.
- A present-but-broken Husky hook marker.
- Node below version 22.
- In maintainer mode only, `npm run test:unit` failing.

Warnings never make the run `FAIL`. A check reported `OK` names what was read or run to prove it; a check with no readable evidence is `SKIP`, never `OK`.

## Report format

```text
HEALTH CHECK — consumer — 2026-11-06
Blockers: 0 · Warnings: 2 · Skipped: 1

[WARN] M5 opencode.json:14 — {env:CONTEXT7_TOKEN} is documented in .env.example but unset in this environment
[SKIP] O8 — model IDs cannot be verified offline
[WARN] S7 .agents/config/quality-gates.md:18 — gates not declared

## Fix commands
# M5 — export the variable the config declares
export CONTEXT7_TOKEN=<token>
# O8 — no mechanical fix: confirm the model IDs in the provider dashboard
# S7 — declare a gate or accept GATES: NOT DECLARED
$EDITOR .agents/config/quality-gates.md

HEALTH: PASS|WARN|FAIL — N blockers, M warnings
```

Replace the verdict token and the two counts with the values the run produced; the surrounding grammar does not change.

Rules for the shape above:

- The header line names the mode and an ISO date.
- The counts line is `Blockers: N · Warnings: M · Skipped: K` and counts findings, not checks.
- One line per finding, in category order then check-ID order: `[STATUS] <ID> <path>:<line> — <observation>`. Omit `<path>:<line>` only when no file holds the evidence, and say where the evidence did come from.
- `## Fix commands` follows the findings and repeats their order. Each entry is a `# <ID> — <intent>` comment plus copy-pasteable commands. A finding with no mechanical fix gets a comment naming the manual step and no command.
- The last line carries the verdict. Its grammar is fixed; only the counts vary.

The `FAIL` branch of M5 uses the same line with `[FAIL]` in place of `[WARN]`; its fix command appends the missing variable to `.env.example` (`echo 'X=' >> .env.example`) rather than exporting it.

| Verdict | Condition |
|---|---|
| `PASS` | 0 blockers and 0 warnings |
| `WARN` | 0 blockers and 1 or more warnings |
| `FAIL` | 1 or more blockers |

## Category 1 — MCP config and env vars

Read `opencode.json` and `.env.example`. "Resolves" means `printenv <X>` returns a non-empty value in the current environment.

| ID | Check | Evidence | Severity |
|---|---|---|---|
| M1 | `opencode.json` parses as JSON | `opencode.json` (parse attempt) | `FAIL` |
| M2 | Every enabled `type: local` server has a non-empty `command` array | `opencode.json` | `WARN` |
| M3 | Every enabled `type: remote` server has a `url` | `opencode.json` | `WARN` |
| M4 | No server name collides with a permission wildcard: no `<server>_*` entry also matches a different server's tools | `opencode.json` `mcp` keys vs `permission` keys | `WARN` |
| M5 | Every `{env:X}` reference in an enabled server is documented in `.env.example` | `opencode.json`, `.env.example`, `printenv` | `FAIL` when undocumented, `WARN` when documented but unset in this environment |
| M6 | Every enabled server has a matching `<server>_*` permission entry | `opencode.json` `permission` | `WARN` |
| M7 | `.env.example` documents `CONTEXT7_TOKEN` and `GITHUB_PERSONAL_ACCESS_TOKEN` | `.env.example` | `WARN` |
| M8 | Disabled `example-server` / `example-remote` placeholders are gone | `opencode.json` | `WARN` |
| M9 | `knowledgebase` parity with `opencode.mcp.example.json` | `opencode.mcp.example.json` | `WARN` |
| M10 | Probe outcome per enabled server | Probe table | `SKIP` without `--probe`, otherwise `OK` or `WARN` |

In maintainer mode, `knowledgebase` enabled in `opencode.json` while absent from `opencode.mcp.example.json` is the known drift; report it with that wording until the example file gains the server. In consumer mode, report only an actual mismatch between the project's `opencode.json` and the example file. A referenced-but-undocumented variable is `M5` `FAIL`: the config promises a dependency the project never declares. A documented-but-unset variable is `M5` `WARN`: the fix is an export, not a repo change.

## Category 2 — OpenCode surface

| ID | Check | Evidence | Severity |
|---|---|---|---|
| O1 | `opencode.json` declares `$schema` and uses no deprecated V1 keys (`mcpServers`, or a server typed `stdio`/`sse` instead of `local`/`remote`) | `opencode.json` | `WARN` |
| O2 | `.opencode/opencode.json` does not shadow the root config — no deprecated V1 keys (`mcpServers`, `stdio`/`sse` server types) and no conflicting `mcp`/`permission` block; a `$schema`-only file is correct | `.opencode/opencode.json` when present | `WARN` |
| O3 | Every `.opencode/plugins/*.js` default-exports an object with `id` and `setup` | each plugin file | `WARN` |
| O4 | Every `.opencode/agents/**/*.md` has parseable YAML frontmatter with `description` and `mode` | each agent file | `WARN` |
| O5 | Every `.opencode/commands/*.md` frontmatter has `description` | each command file | `WARN` |
| O6 | Every `.agents/skills/*/SKILL.md` has `name` and `description`, and every `skills-lock.json` entry resolves to a file on disk with a `computedHash` | each `SKILL.md`, `skills-lock.json` | `WARN` |
| O7 | Every `subagent_type` named inside an agent file resolves to `.opencode/agents/<name>.md` | each agent file's references | `WARN` |
| O8 | Model IDs in agent frontmatter are valid for the configured provider | none offline | `SKIP` — model IDs cannot be verified offline |

Plugins are discovered by convention from `.opencode/plugins/`, not from a config key: absence from `opencode.json` is correct, not a finding. OpenCode 2 rejects a V1 plugin export, so O3 checks the default export's shape, not only its presence.

## Category 3 — Sync integrity

Consumer mode runs S1–S7. Maintainer mode runs Category 7 and reports S1–S7 as `SKIP` with reason "maintainer mode".

| ID | Check | Evidence | Severity |
|---|---|---|---|
| S1 | `.agents-sync-manifest.json` exists and its `__opencode__`, `__scripts__`, `__memory-bank__`, `__project__` key prefixes resolve to real paths | `.agents-sync-manifest.json` | `WARN` |
| S2 | No drift: every manifest entry exists on disk | manifest vs filesystem | `WARN` |
| S3 | No untracked file under a managed directory that the manifest omits | filesystem vs manifest | `WARN` |
| S4 | `AGENTS.md` is present | `AGENTS.md` | `FAIL` |
| S5 | `AGENTS.project.md` is present | `AGENTS.project.md` | `WARN` |
| S6 | The five project-owned paths are intact: `AGENTS.project.md`, `opencode.json`, `.prettierignore`, `.agents/config/quality-gates.md`, `.agents/instructions/learned-knowledge.instructions.md` | each path | `WARN` |
| S7 | `.agents/config/quality-gates.md` declares at least one gate row | `.agents/config/quality-gates.md` `## Gate table` | `WARN` — "gates not declared" |

## Category 4 — Hooks and runtime

| ID | Check | Evidence | Severity |
|---|---|---|---|
| H1 | Node is version 22 or newer | `node --version` | `FAIL` |
| H2 | `core.hooksPath` is `.husky/_` and that directory exists | `git config core.hooksPath`, `ls .husky/_` | `FAIL` when `.husky/` exists but the marker is broken; `WARN` when `.husky/` is absent |
| H3 | `pre-commit`, `post-commit`, `post-merge` exist and contain the `@abarcenas/ai-workflow-template` marker | each hook file | `WARN` |
| H4 | Each hook file is executable | file mode of each hook | `WARN` |
| H5 | `npx` is on `PATH` | `npx --version` | `WARN` |
| H6 | `gh` is on `PATH` | `gh --version` | `WARN` |
| H7 | `package.json` `scripts.prepare` contains `husky` | `package.json` | `WARN` |
| H8 | The working directory is inside a git work tree | `git rev-parse --git-dir` | `SKIP` when it is not — H2–H4 are `SKIP` with reason "not a git repository" |

## Category 5 — Memory-bank and knowledgebase

| ID | Check | Evidence | Severity |
|---|---|---|---|
| K1 | All six core memory-bank files exist | `memory-bank/` | `FAIL` |
| K2 | Every core file's YAML frontmatter carries `id`, `title`, `updated`, `tags`, `entities`, `category` | each core file | `WARN` |
| K3 | `memory-bank/.vocabulary.json` exists | `memory-bank/.vocabulary.json` | `WARN` |
| K4 | The vector index is built | `node scripts/memory-cli.js stats` (read-only) | `WARN` |
| K5 | `DATABASE_URL` is set | `printenv DATABASE_URL` | `WARN` — the knowledgebase is optional and setup skips it silently |
| K6 | `node scripts/knowledgebase-cli.js stats` succeeds and this project's `package.json` name is indexed | `node scripts/knowledgebase-cli.js stats` | `WARN` |

## Category 6 — Tracker and docs readiness

| ID | Check | Evidence | Severity |
|---|---|---|---|
| T1 | The directory is a git repository | `git rev-parse --git-dir` | `WARN` |
| T2 | `origin` exists and its URL contains `github.com` | `git remote get-url origin` | `WARN` |
| T3 | `gh auth status` succeeds | `gh auth status` | `WARN` |
| T4 | Every label in the `## Labels` table of `.agents/config/issue-tracker.md` exists | `gh label list --json name --limit 200` vs that table | `WARN` |
| T5 | `docs/agents/issue-tracker.md` mirror is present | that path | `WARN` |

`T4` is `SKIP` when `gh` is unavailable or unauthenticated; name which of the two applies.

## Category 7 — Maintainer-only

| ID | Check | Evidence | Severity |
|---|---|---|---|
| D1 | `package.json` `files` covers `bin/`, `.agents/`, `.opencode/agents/`, `.opencode/commands/`, `.opencode/plugins/`, `scripts/`, `AGENTS.md`, `skills-lock.json` | `package.json` | `WARN` |
| D2 | No orphan manifest namespace: every `__*__` prefix in the manifest maps to a directory `package.json` ships, excluding the scaffold-only `__project__` namespace | `.agents-sync-manifest.json`, `package.json` | `WARN` |
| D3 | `npm run test:unit` passes | `npm run test:unit` | `FAIL` |

`__project__` entries are scaffolded files, not synced directories — they are exempt from D2.

## Probe table

Run only with `--probe` or `--probe-all`. One call per server, one retry maximum, fail-soft: record the failure and continue to the next row.

| Server | Probe call | Cost | Note |
|---|---|---|---|
| `ddg-search` | `search "opencode"` with `max_results: 1` | one search | Cheapest read-only call. |
| `chrome-devtools` | `list_pages` | one browser query | Read-only; no navigation. |
| `angular-cli` | `get_best_practices` with no arguments | one lookup | Returns the bundled guide; cheaper than `ai_tutor`. |
| `github` | `search_repositories "opencode"` | one API search | Needs `GITHUB_PERSONAL_ACCESS_TOKEN`; a 401 is the finding, not a crash. |
| `context7` | `resolve-library-id "React"` | one API lookup | Needs `CONTEXT7_TOKEN`. |
| `playwright` | `browser_tabs` with action `list` | launches a browser — only with `--probe-all` | Skipped under plain `--probe`. |
| `playwright-firefox` | `browser_tabs` with action `list` | launches a browser — only with `--probe-all` | Skipped under plain `--probe`. |
| `memory-bank` | `memory_stats` | one index read | Read-only. |
| `knowledgebase` | `knowledgebase_stats` | one DB read | Fails softly when `DATABASE_URL` is unset. |
| `example-server` | none | none | Disabled in `opencode.json` → `SKIP`. |
| `example-remote` | none | none | Disabled in `opencode.json` → `SKIP`. |

Without `--probe`, `M10` is `SKIP` with reason "MCP checks are static only". With `--probe`, a server that fails its probe is `WARN`; the failure message goes on the finding line.

## What this command never does

- Never edits, creates, or deletes a file.
- Never installs a package or runs `npx ai-workflow-setup`.
- Never runs `npm run sync` or any sync with `--force`.
- Never creates, edits, or deletes a GitHub label or issue.
- Never writes to the memory bank or rebuilds the vector index.
- Never writes a report file: the report is printed to the terminal, by design.
