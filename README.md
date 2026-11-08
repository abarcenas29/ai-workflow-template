# AI Workflow Template

Publishable AI workflow starter pack for OpenCode — explicitly-synced, version-managed, npm-distributed agent configuration suite with vector search memory.

## Install

```bash
npm install --save-dev @abarcenas/ai-workflow-template
npx ai-workflow-setup
```

This package is a **CLI/scaffold, not a runtime library** — it has no `require`/`import` entry point, so importing it is not supported by design. Installing it copies nothing into your project and ships no install/`postinstall` hook; `npx ai-workflow-setup` is the only setup path and does all file syncing, memory-bank scaffolding, and hook installation.

### Upgrading to 2.0.0

2.0.0 removed the install-time `postinstall` sync, so upgrading no longer copies anything into your project. After installing the new version, run the setup command once:

```bash
npx ai-workflow-setup
```

Node 20 support was also dropped (`engines.node` is now `>=22`), and the package no longer declares a `main` entry point — it is a scaffold CLI, not an importable library.

## Git Hook Setup

```bash
npx ai-workflow-setup
```

### What It Does

| Phase | Action |
| --- | --- |
| Discover | Detects git repo, existing hooks, CI mode |
| Hooks | Installs `pre-commit` (version bump + validation) and `post-merge` (memory index update) |
| Prepare | Merges `"husky"` into your `package.json` prepare script |
| Husky Init | Initializes husky and sets `core.hooksPath` |
| Sync | Copies agent configurations, skills, and memory bank scaffolding |
| Skills | Refreshes pinned skills from upstream (skipped with `--skip-sync`) |
| Knowledgebase | Registers the project with the centralized knowledgebase (skipped with `--skip-knowledgebase`) |

### Options

```bash
npx ai-workflow-setup --dry-run        # Preview hooks/prepare/skills, skip sync
npx ai-workflow-setup --force          # Overwrite existing hooks
npx ai-workflow-setup --skip-hooks     # Skip hook installation
npx ai-workflow-setup --skip-sync      # Skip file sync
npx ai-workflow-setup --knowledgebase  # Run only the knowledgebase phase
npx ai-workflow-setup --help           # Show all options
```

### Hook Merging

- **Your hooks are never overwritten** — new content is appended after a separator
- **Managed hooks are detected** via marker comments and updated idempotently
- **Complex hooks** trigger a warning with manual merge instructions
- **CI environments** auto-skip hook configuration

> **No install-time scripts:** npm 12+, pnpm 10+, and Yarn 4 block dependency lifecycle scripts by default. This package ships no `postinstall`; everything runs when you explicitly invoke `npx ai-workflow-setup`.

## What This Package Does

- **41 specialized AI skills**, framework instructions, and prompt templates (`.agents/`)
- **Smart agent frameworks** — Plan Mode, Implementation Plans, Research Spikes
- **Multi-agent orchestrator** — dynamic pipelines with 10+ specialized sub-agents
- **TDD orchestrator** — strict RED→GREEN→REFACTOR/VERIFY pipeline (90% coverage gate)
- **Memory bank** — persistent project context with sqlite-vec semantic search
- **Caveman mode** — ultra-compressed communication for token efficiency
- **Playwright + Vitest testing** — E2E browser tests, unit tests with v8 coverage (≥90%)
- **Version auto-bumping + auto-publishing** — Husky-managed; npm publish on merge to `main`
- **Close-out / PR publishing** — conventional commit → push → `gh pr create`, base auto-detected from `origin/HEAD`, never merges
- **graphify knowledge graph** — queryable code-level relationship mapping

## Maintainer sync (in this repo)

`npm run sync` is a maintainer command defined in this repository's own `package.json`. It is not shipped to consumers — consumer projects sync by running `npx ai-workflow-setup`, which invokes the same sync engine.

```bash
npm run sync -- --dry-run   # Preview changes without applying
npm run sync -- --force     # Force overwrite local changes
npm run sync                # Normal sync
```

**Smart Sync Rules:**

- New files are copied automatically
- Unmodified files are refreshed from the package
- Locally edited files are preserved (skipped by default)
- Project-owned files are never overwritten or pruned after creation, and `--force` cannot replace them
- GitHub Actions workflows are excluded from consumer sync (`.github/workflows/`)

> `npx ai-workflow-setup --dry-run` previews the hooks, prepare, and skills phases but skips sync, so no files are copied or pruned and no scaffold files are created. For a preview of sync itself, run `npm run sync -- --dry-run` in this repository; consumers sync with `npx ai-workflow-setup`.

### Project-owned files

`AGENTS.project.md` is the supported home for project-specific agent rules. It is created if absent, then treated as project-owned: sync never overwrites or prunes it, `--force` cannot replace it, and deleting it recreates it on the next sync. New projects load it through `"instructions": ["AGENTS.project.md"]` in `opencode.json`; a project created before that entry existed must add it once, because sync never rewrites an existing `opencode.json`.

The same ownership rule protects `opencode.json`, `.prettierignore`, and `.agents/instructions/learned-knowledge.instructions.md`. `.agents-sync-ignore` is also protected from overwrite and deletion, but sync does **not** read or honour its contents yet — do not rely on it.

`__project__/<file>` entries in `.agents-sync-manifest.json` are reporting metadata written only when sync creates the file. Files that already existed before the upgrade are intentionally absent, because sync has no managed baseline for them.

The package ships a `.prettierignore` and scaffolds it when absent. New projects get coverage automatically for `.agents/`, `.opencode/agents/`, `.opencode/commands/`, `AGENTS.md`, `skills-lock.json`, and every synced script; the shipped file also ignores `AGENTS.project.md`, though that file is not hash-managed. Existing projects keep their own `.prettierignore` untouched (it is project-owned), so if it does not cover every managed path sync prints one warning:

```text
[ai-workflow-template] Existing .prettierignore does not protect managed files; merge the patterns from node_modules/@abarcenas/ai-workflow-template/.prettierignore
```

Merge those patterns manually — sync never edits the file. Template-side additions to `rootFiles` or `scriptsToSync` also require a matching manual line in an existing project; the shipped file only updates the defaults for new projects. A formatter run over managed files rewrites their hashes, so every later sync skips them and the consumer stops receiving template updates.

If sync warns `Skipped locally modified root file: AGENTS.md`, move those local rules into `AGENTS.project.md`, restore the managed file from `node_modules/@abarcenas/ai-workflow-template/AGENTS.md`, then re-run sync.

## Core Structure

Post-install, your project receives this structure:

```text
.agents/
├── instructions/   # Framework, workflow, and security guidance
├── skills/         # 41 specialized AI skills
└── prompts/        # Reusable prompt templates
.opencode/
├── agents/         # Orchestrator + specialized sub-agents
├── commands/       # Slash commands (incl. /health, /setup-matt-pocock-skills)
└── plugins/        # graphify plugin (loaded automatically)
memory-bank/        # Persistent project context (+ tasks/)
scripts/            # Sync, memory, and knowledgebase CLI helpers
AGENTS.md           # Master instruction file with agent guidance
AGENTS.project.md   # Project-owned rules (recreated if deleted, never overwritten)
opencode.json       # OpenCode config (project-owned after creation)
.prettierignore     # Formatter coverage for managed files (project-owned)
skills-lock.json    # Pinned skill versions
.github/workflows/  # Repo-only — never synced to consumers
```

## Multi-Agent Orchestrator

### Agents

| Agent | File | Role |
| --- | --- | --- |
| Orchestrator | `.opencode/agents/orchestrator/orchestrator.md` | Master — analyzes requests, builds pipelines, delegates |
| Scope | `.opencode/agents/scope.md` | Conditional front door for underspecified requests — grilling rounds, then a spike doc |
| Researcher | `.opencode/agents/researcher.md` | Technical investigation, library evaluation |
| Architect | `.opencode/agents/architect.md` | System design, component architecture |
| Implementer | `.opencode/agents/implementer.md` | Translates designs into implementation plans |
| Designer | `.opencode/agents/designer.md` | UI/UX, styling, responsive design |
| Coder | `.opencode/agents/coder.md` | Production code implementation |
| Unit Tester | `.opencode/agents/unit-tester.md` | Unit and integration tests |
| E2E Tester | `.opencode/agents/e2e-tester.md` | Playwright browser tests |
| Reviewer | `.opencode/agents/reviewer.md` | Code review, security audit |
| Deployer | `.opencode/agents/deployer.md` | CI/CD, deployment scripts |
| Tracker | `.opencode/agents/tracker.md` | Documentation recorder |

### How to Use

Invoke the orchestrator with `@orchestrator` followed by your task:

```bash
@orchestrator Add a user login feature with email verification
@orchestrator full pipeline: refactor authentication to use JWT
@orchestrator fix the pagination bug in the search results component
```

- **Run flow:** checks architecture context inline (a `test`/`grep` probe over `docs/.architecture-context.md` and the two core memory-bank files) → builds a pipeline → executes agents sequentially (confirm/skip each step, or enable auto-confirm) → tracker documents to `docs/tracker-log.md` → persists new knowledge.
- **Scope step (conditional, runs first):** inserted at the front of the pipeline only when the request is underspecified — `scope` runs grilling rounds against a draft file, writes `docs/spike-<feature>.md`, then hands off to `researcher` or `implementer`. Always interactive (auto-confirm cannot skip it) and has **no command-execution permission** — prototypes are delegated to `coder` (logic) or `designer` (UI).
- **Bootstrap (conditional):** the architecture-blueprint-generator skill runs only when that probe exits non-zero — `docs/.architecture-context.md` is missing, empty, or template-only (no `##` section), or a core memory-bank file is missing. It writes `docs/.architecture-context.md`; a probe that exits 0 skips the delegation entirely, so later runs never reach it.

### MCP Tooling

Some agents require MCP servers configured in `opencode.json` (template: `opencode.mcp.example.json`):

| Agent | Required MCP | Purpose |
| --- | --- | --- |
| Researcher | ddg-search, Context7 | Web search + documentation queries |
| E2E Tester | Playwright | Browser automation |
| Reviewer | GitHub | PR and issue management |
| Deployer | GitHub | Releases, Actions |

Playwright MCP is configured twice for browser parity: `playwright` (Google Chrome — the `chrome` channel, which `@playwright/mcp` uses by default, so Google Chrome must be installed) and `playwright-firefox` (Firefox, `--browser firefox --isolated`). Each server needs its own permission entry (`playwright_*`, `playwright-firefox_*`), and Firefox must be installed first with `npx playwright install firefox` — see [`docs/playwright-mcp-configuration.md`](https://github.com/abarcenas29/ai-workflow-template/blob/main/docs/playwright-mcp-configuration.md#browser-selection). Existing `opencode.json` files are never rewritten by sync, so upgrading projects must add the `playwright-firefox` block and its permission by hand.


## TDD Orchestrator

Strict Test-Driven Development through the RED → GREEN → REFACTOR/VERIFY cycle:

```text
implementer (PLAN) → unit-tester∥ (RED) → coder∥ (GREEN) → unit-tester (VERIFY) → reviewer → tracker
```

| Step | Agent | Phase | Description |
| --- | --- | --- | --- |
| 1 | Implementer | PLAN | Creates implementation plan with parallel test/code batch tables |
| 2 | Unit Tester | RED | Writes failing tests first — defines expected behavior before any code exists |
| 3 | Coder | GREEN | Writes minimal production code to pass all tests — no extra features |
| 4 | Unit Tester | VERIFY | Runs full suite, enforces ≥90% coverage threshold |
| 5 | Reviewer | REFACTOR | Audits tests + implementation for quality, security, patterns |
| 6 | Tracker | DOCUMENT | Records pipeline results to `docs/tracker-log.md` |

**Key rules:** tests are always written first; if coverage is <90%, loop back to RED (up to 3 iterations); every suite is tracked in `memory-bank/tasks/`; lessons learned persist to `.agents/instructions/learned-knowledge.instructions.md`.

**How to invoke:**

```bash
@orchestrator Add user authentication with login/logout endpoints
```

The TDD orchestrator uses `subagent_type "tdd-orchestrator"` and auto-selects the strict pipeline when testable code changes are requested.

## Memory Bank

Persistent project context across AI sessions. Semantic vector search (`sqlite-vec`) lets agents query memory without loading all files into context.

### MCP Tools

| Tool | Purpose |
| --- | --- |
| `memory_search` | Semantic search across memory-bank + docs (query + topK) |
| `memory_update` | Incremental sync — only changed files (~2 seconds) |
| `memory_rebuild` | Full rebuild from markdown files (rare — clone/corruption) |
| `memory_get` | Read a specific memory file by name |
| `memory_stats` | Index statistics (vector count, DB size) |

### File Structure

Source of truth is the git-committed Markdown; the vector index (`memory-bank/.index/memory.db`) is disposable and rebuildable.

```text
projectbrief.md → productContext.md / systemPatterns.md / techContext.md → activeContext.md → progress.md / tasks/
```

| File | Purpose |
| --- | --- |
| `memory-bank/projectbrief.md` | Core requirements, goals, and scope |
| `memory-bank/productContext.md` | Problem solved, UX goals |
| `memory-bank/systemPatterns.md` | Architecture, design patterns, component relationships |
| `memory-bank/techContext.md` | Technologies, dev setup, constraints |
| `memory-bank/activeContext.md` | Current focus, recent changes, next steps |
| `memory-bank/progress.md` | What works, what's left, known issues |
| `memory-bank/tasks/` | Per-task tracking with `_index.md` |

### Document Schema

All memory-bank files use YAML frontmatter (`id`, `title`, `updated`, `tags`, `entities`, `category`) for search indexing; see `memory-bank/.vocabulary.json` for the controlled vocabulary. `npx ai-workflow-setup` runs `normalize-memory.js` to add frontmatter; the Husky pre-commit hook rejects invalid frontmatter. Task commands: `add task`, `update task [ID]`, `show tasks [filter]`.

### Token Efficiency

| Approach | Tokens per session |
| --- | --- |
| Read all memory files | ~5,000–15,000+ |
| Semantic search | ~500–2,000 (top 3–5 chunks) |

## OpenCode plugins

Your project can load two plugins. One comes with this template. The other is a
third-party plugin that setup adds to `opencode.json` if the file is missing.

### graphify — ships with this template

`npx ai-workflow-setup` copies a small plugin file to
`.opencode/plugins/graphify.js`.

OpenCode finds it by itself. It looks in `.opencode/plugins/` when it starts. You
do not need to add anything to `opencode.json`.

**What it does:** before the first shell command in a session, it adds a short
reminder about `graphify-out/`. The reminder tells the agent to run
`graphify query` instead of grepping raw files. It adds the reminder at most once
each time OpenCode starts.

**When it does nothing:** if your project has no `graphify-out/graph.json`, the
plugin stops before it changes anything. Build a graph with `/graphify` — see
[Knowledge Graph](#knowledge-graph-graphify).

**To turn it off:**

- Do nothing. Without a graph, the plugin has no effect.
- To remove it for good, open `.opencode/plugins/graphify.js` and replace it with
  a plugin that does nothing:

  ```js
  export default { id: "graphify", setup() {} };
  ```

  Setup skips files you have changed, so it will not put the plugin back unless
  you pass `--force`. You also stop getting template updates for that file.
- Deleting the file is not permanent. The next `npx ai-workflow-setup` copies it
  again.

### @tarquinen/opencode-dcp — third-party

A new project's `opencode.json` declares this plugin:

```json
"plugins": ["@tarquinen/opencode-dcp@3.2.0"]
```

**What it does:** it removes old tool output from the conversation to save tokens.

**Licence:** AGPL-3.0-or-later, a copyleft licence: share your changes if you
redistribute it. The plugin is not bundled with this template. OpenCode fetches
it from npm and caches it the first time your project starts.

**To remove it:** delete the entry from the `plugins` array in `opencode.json`,
then restart OpenCode. `opencode.json` belongs to your project — setup never
rewrites it.

### Requirements

- **OpenCode V2.** The graphify plugin is written for V2. OpenCode V1 cannot load
  it.
- **Setup is the install step.** Installing the npm package copies nothing. There
  is no `postinstall` script; run `npx ai-workflow-setup`.
- **Restart OpenCode after setup or an upgrade.** Plugins load when OpenCode
  starts.

## Knowledge Graph (graphify)

```bash
/graphify                        # Build a graph for the current directory
/graphify <path>                 # Build for a specific path
/graphify query "How does authentication work?"
```

### Prerequisites

- Python 3.10+ — required runtime
- `graphifyy` Python package — `pip install graphifyy` or `uv tool install graphifyy`
- Optional: Gemini API key (`GEMINI_API_KEY` or `GOOGLE_API_KEY`) — faster semantic extraction; without it graphify falls back to Claude subagents

> [GitHub: safishamsi/graphify](https://github.com/safishamsi/graphify) — full docs, examples, and source

## Featured Skills

- **Feature scoping:** `grilling`, `grill-me`, `grill-with-docs`, `domain-modeling`, `prototype` — narrow underspecified requests into a spike; `GLOSSARY.md` and `docs/adr/` locations come from `.agents/config/domain.md`
- **Workflow automation:** `architecture-blueprint-generator`, `create-implementation-plan`, `create-readme`, `context-map`, `graphify` (global skill), `graphify-framework-aware`
- **Development tools:** `playwright-explore-website`, `playwright-generate-test`, `github-issues`, `gh-cli`, `polygot-test-agent`, `microsoft-docs`
- **Token & efficiency:** `caveman`, `caveman-compress`, `compress`, `caveman-commit`, `cavecrew`, `caveman-stats`
- **Quality & safety:** `agent-governance`, `conventional-commit`, `git-commit` (OWASP guidance in `.agents/instructions/security-owasp.instructions.md`)

## Versioning

Husky auto-bumps versions on every commit: minor by default (`1.2.0 → 1.3.0`), patch resets to 0 on each bump, and major changes reset to `<major>.0.0`. No manual version management required. Set `SKIP_BUMP=1` (e.g. `SKIP_BUMP=1 git commit ...`) to skip the bump for that commit — useful for doc-only changes.

## Publish Flow

GitHub Actions publishes to npm when work lands on `main` — that is, when a PR is merged. The version published is whatever `package.json` says at merge time (the Husky pre-commit hook already bumped the minor version):

```bash
git push origin feat/my-change
gh pr merge --merge    # merging to main publishes that version
```

A version already on the registry fails the run instead of republishing, so bump `package.json` rather than re-running against the same version. To retry a failed publish, dispatch against `main` — there are no inputs:

```bash
gh workflow run npm-publish.yml --ref main
```

Pushing a `v*` tag does not publish anything.

Add `NPM_TOKEN` to GitHub repository secrets:

1. Repository → Settings → Secrets and variables → Actions
2. New repository secret → Name: `NPM_TOKEN`
3. Paste npm automation token

**Note:** Publish workflow files (`.github/workflows/`) are excluded from consumer sync to prevent conflicts.

## Local Development

```bash
npm install                # Install dependencies & activate Husky hooks
npm run sync -- --dry-run  # Verify sync behavior (dry run)
npm pack --json            # Test package creation

npm test                   # Playwright E2E tests
npm run test:unit          # Unit tests (Vitest)
npm run test:unit:coverage # Unit tests with coverage (90% threshold)
npm run test:unit:watch    # Watch mode for unit tests

npm run memory:rebuild     # Build the vector index (one-time, ~8 min)
npm run memory:update      # Incremental index update (seconds)
npm run memory:search "tdd orchestrator status"
npm run memory:normalize   # Normalize frontmatter (also runs during npx ai-workflow-setup)
```

### Testing

| Type | Framework | Command | Coverage |
| --- | --- | --- | --- |
| E2E | Playwright | `npm test` | — |
| Unit | Vitest | `npm run test:unit` | `npm run test:unit:coverage` (≥90%) |

- E2E tests live in `tests/*.spec.ts` — browser automation via Playwright
- Unit tests live in `scripts/*.test.{js,ts}` and `tests/*.test.js` — component tests and cross-file spec checks via Vitest with v8 coverage

## Updating the Template

1. Edit files in `.agents/`, `docs/`, or `scripts/`
2. Test changes locally
3. Commit (triggers auto-version bump)
4. Merge the PR to `main` (triggers npm publish)
5. Consumers install the new version, then re-run `npx ai-workflow-setup` to sync

## Important Notes

- Uses `INIT_CWD` to install against the consuming project (not the package dir)
- Local changes are always preserved unless `--force` is used
- Project-owned files (`AGENTS.project.md`, `opencode.json`, `.prettierignore`, learned knowledge) are created if absent and never overwritten or pruned after that, even with `--force`
- Do not add `AGENTS.project.md` or `opencode.json` to `package.json` `files`: both are scaffolded create-if-absent and must never ship from the package
- `AGENTS.md` is the main instruction file agents should read
- Package assumes the public npm registry
- Playwright MCP integration is documented in [`docs/playwright-mcp-configuration.md`](https://github.com/abarcenas29/ai-workflow-template/blob/main/docs/playwright-mcp-configuration.md)
- Run `npx ai-workflow-setup` after install to configure git hooks (npm v12+ compatible)
