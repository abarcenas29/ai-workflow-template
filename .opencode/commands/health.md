---
description: "Audit this project's OpenCode setup — MCP, plugins, sync, hooks, memory-bank, tracker — and report whether it is ready for first use"
agent: build
subtask: true
---

# Health Check

Audit this project's OpenCode set-up and report whether it is ready for first use. This command is report-only: it never mutates a file, never installs anything, and never repairs what it finds. The authoritative checklist is `.agents/instructions/health-check.instructions.md` — read it and follow it exactly; this file does not restate it.

## Arguments

`$ARGUMENTS` is optional. When it is empty, run with the defaults: auto-detected mode and static MCP checks.

| Argument | Effect |
|---|---|
| `--probe` | End-to-end verify every enabled MCP server by calling one read-only tool per server from the probe table. Without it, MCP checks are static only. |
| `--probe-all` | As `--probe`, plus the browser-backed servers `playwright` and `playwright-firefox`. |
| `--consumer` | Force consumer mode instead of auto-detecting. |
| `--maintainer` | Force maintainer mode instead of auto-detecting. |

Report any argument outside this table as a finding in the report body — `[WARN] ARGS — unrecognised argument "--foo"` — and continue. Never ignore an argument silently.

## Steps

1. **Read the checklist.** Read `.agents/instructions/health-check.instructions.md` in full and follow its severity contract, report format, and per-category checks. It is the only definition of what a check means.

2. **Detect the mode.** Resolve maintainer mode when `bin/setup.js` and `scripts/setup/index.js` both exist **and** `package.json`'s `name` is `@abarcenas/ai-workflow-template`. Otherwise resolve consumer mode. State the mode and the evidence: which paths existed and which name matched. An explicit `--maintainer` or `--consumer` overrides detection; say in the header line that the mode was forced.

3. **Run categories 1–7** from the checklist, in order. Use read, grep, and glob for every check that a file answers. Reserve `!` for facts no file holds:
   - `!node --version`
   - `!npx --version`
   - `!gh --version`
   - `!gh auth status`
   - `!git remote get-url origin`
   - `!git config core.hooksPath`
   - `!ls .husky/_`
   - `!printenv <X>` once for each `{env:X}` named in `opencode.json`
   - `!printenv DATABASE_URL`
   - `!gh label list --json name --limit 200`
   - `!node scripts/memory-cli.js stats`
   - `!node scripts/knowledgebase-cli.js stats`

   In maintainer mode also run `!npm run test:unit`. Every command above is read-only and named by the checklist; do not run one it does not name.

4. **Probe, when asked.** With `--probe` or `--probe-all`, run the checklist's probe table: one call per server, one retry maximum, fail-soft. Record each failure on its finding line and continue to the next server. Under plain `--probe`, mark `playwright` and `playwright-firefox` as skipped. A server that fails its probe is a warning, never a blocker.

5. **Print the report.** Emit exactly the shape the checklist defines: header line, counts line, one line per finding, the `## Fix commands` block in report order, and the verdict line last. Print the report; do not summarise the checklist in prose and do not offer a narrative around it.

## Constraints

- Never edit a file, never run a writing command, never install anything.
- Every finding carries a `<path>:<line>` reference where one exists. When no file holds the evidence, name the command that produced it instead.
- A check that could not be verified is `SKIP` with a reason. It is never `OK`.
- `FAIL` is reserved for the closed list in the checklist. Warnings never fail the run.
- Report the verdict the evidence supports, including when the run is `FAIL`.
