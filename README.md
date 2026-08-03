# AI Workflow Template

Publishable AI workflow starter pack for OpenCode — auto-syncing, version-managed, npm-distributed agent configuration suite with vector search memory.

## Install

```bash
npm install @abarcenas/ai-workflow-template
```

The package runs `postinstall` to sync files; for full setup including git hooks, use the setup command below.

## Git Hook Setup

```bash
# One-step setup (fetches from npm registry automatically):
npx @abarcenas/ai-workflow-template

# Or if the package is already installed:
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

### Options

```bash
npx ai-workflow-setup --dry-run        # Preview without changes
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

> **npm v12 note:** Future npm versions block automatic `postinstall` scripts. The explicit `npx setup` command is the recommended, future-proof approach.

## What This Package Does

- **29 specialized AI skills**, framework instructions, and prompt templates (`.agents/`)
- **Smart agent frameworks** — Plan Mode, Implementation Plans, Research Spikes
- **Multi-agent orchestrator** — dynamic pipelines with 10+ specialized sub-agents
- **TDD orchestrator** — strict RED→GREEN→REFACTOR/VERIFY pipeline (90% coverage gate)
- **Memory bank** — persistent project context with sqlite-vec semantic search
- **Caveman mode** — ultra-compressed communication for token efficiency
- **Playwright + Vitest testing** — E2E browser tests, unit tests with v8 coverage (≥90%)
- **Version auto-bumping + auto-publishing** — Husky-managed, npm publish on merge to `main`
- **graphify knowledge graph** — queryable code-level relationship mapping

## Sync Behavior

```bash
npm run sync -- --dry-run   # Preview changes without applying
npm run sync -- --force     # Force overwrite local changes
npm run sync                # Normal sync
```

**Smart Sync Rules:**

- New files are copied automatically
- Unmodified files are refreshed from the package
- Locally edited files are preserved (skipped by default)
- GitHub Actions workflows are excluded from consumer sync (`.github/workflows/`)

## Core Structure

Post-install, your project receives this structure:

```text
.agents/
├── instructions/   # Framework, workflow, and security guidance
├── skills/         # 29 specialized AI skills
└── prompts/        # Reusable prompt templates
.opencode/agents/   # Orchestrator + specialized sub-agents
.github/workflows/  # CI/CD automation (excluded from sync)
docs/               # Guides (e.g. playwright-mcp-configuration.md)
AGENTS.md           # Master instruction file with agent guidance
```

## Multi-Agent Orchestrator

### Agents

| Agent | File | Role |
| --- | --- | --- |
| Orchestrator | `.opencode/agents/orchestrator/orchestrator.agent.md` | Master — analyzes requests, builds pipelines, delegates |
| Researcher | `.opencode/agents/researcher.agent.md` | Technical investigation, library evaluation |
| Architect | `.opencode/agents/architect.agent.md` | System design, component architecture |
| Implementer | `.opencode/agents/implementer.agent.md` | Translates designs into implementation plans |
| Designer | `.opencode/agents/designer.agent.md` | UI/UX, styling, responsive design |
| Coder | `.opencode/agents/coder.agent.md` | Production code implementation |
| Unit Tester | `.opencode/agents/unit-tester.agent.md` | Unit and integration tests |
| E2E Tester | `.opencode/agents/e2e-tester.agent.md` | Playwright browser tests |
| Reviewer | `.opencode/agents/reviewer.agent.md` | Code review, security audit |
| Deployer | `.opencode/agents/deployer.agent.md` | CI/CD, deployment scripts |
| Tracker | `.opencode/agents/tracker.agent.md` | Documentation recorder |

### How to Use

Invoke the orchestrator with `@orchestrator` followed by your task:

```bash
@orchestrator Add a user login feature with email verification
@orchestrator full pipeline: refactor authentication to use JWT
@orchestrator fix the pagination bug in the search results component
```

- **Run flow:** auto-bootstraps architecture on first run → builds a pipeline → executes agents sequentially (confirm/skip each step, or enable auto-confirm) → tracker documents to `docs/tracker-log.md` → persists new knowledge.
- **First run only:** runs the architecture-blueprint-generator skill to detect tech stack/patterns, writing context to `docs/.architecture-context.md` and `.agents/instructions/learned-knowledge.instructions.md`; later runs skip this.

### MCP Tooling

Some agents require MCP servers configured in `opencode.mcp`:

| Agent | Required MCP | Purpose |
| --- | --- | --- |
| Researcher | ddg-search, Context7 | Web search + documentation queries |
| E2E Tester | Playwright | Browser automation |
| Reviewer | GitHub | PR and issue management |
| Deployer | GitHub | Releases, Actions |

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

All memory-bank files use YAML frontmatter (`id`, `title`, `updated`, `tags`, `entities`, `category`) for search indexing; see `memory-bank/.vocabulary.json` for the controlled vocabulary. `npm install` runs `normalize-memory.js` to add frontmatter; the Husky pre-commit hook rejects invalid frontmatter. Task commands: `add task`, `update task [ID]`, `show tasks [filter]`.

### Token Efficiency

| Approach | Tokens per session |
| --- | --- |
| Read all memory files | ~5,000–15,000+ |
| Semantic search | ~500–2,000 (top 3–5 chunks) |

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

- **Workflow automation:** `architecture-blueprint-generator`, `create-implementation-plan`, `create-readme`, `context-map`, `graphify` (global skill), `graphify-framework-aware`
- **Development tools:** `playwright-explore-website`, `playwright-generate-test`, `github-issues`, `gh-cli`, `polygot-test-agent`, `microsoft-docs`
- **Token & efficiency:** `caveman`, `caveman-compress`, `compress`, `caveman-commit`, `cavecrew`, `caveman-stats`
- **Quality & safety:** `agent-governance`, `conventional-commit`, `git-commit` (OWASP guidance in `.agents/instructions/security-owasp.instructions.md`)

## Versioning

Husky auto-bumps versions on every commit: minor by default (`1.2.0 → 1.3.0`), patch resets to 0 on each bump, and major changes reset to `<major>.0.0`. No manual version management required.

## Publish Flow

GitHub Actions automatically publishes to npm when merging to `main`.

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
npm run memory:normalize   # Normalize frontmatter (runs automatically on install)
```

### Testing

| Type | Framework | Command | Coverage |
| --- | --- | --- | --- |
| E2E | Playwright | `npm test` | — |
| Unit | Vitest | `npm run test:unit` | `npm run test:unit:coverage` (≥90%) |

- E2E tests live in `tests/*.spec.ts` — browser automation via Playwright
- Unit tests live in `scripts/*.test.{js,ts}` — component tests via Vitest with v8 coverage

## Updating the Template

1. Edit files in `.agents/`, `docs/`, or `scripts/`
2. Test changes locally
3. Commit (triggers auto-version bump)
4. Merge to `main` (triggers npm publish)
5. Consumers run `npm install` to get updates

## Important Notes

- Uses `INIT_CWD` to install against the consuming project (not the package dir)
- Local changes are always preserved unless `--force` is used
- `AGENTS.md` is the main instruction file agents should read
- Package assumes the public npm registry
- Playwright MCP integration is documented in `docs/`
- Run `npx ai-workflow-setup` after install to configure git hooks (npm v12+ compatible)
