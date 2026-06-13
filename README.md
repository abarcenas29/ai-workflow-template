# 🤖 AI Workflow Template

**Publishable AI workflow starter pack for GitHub Copilot** - Auto-syncing, version-managed, npm-distributed agent configuration suite.

---

## ✨ What This Package Does

This isn't a one-off template to clone—it's a **live npm package** that distributes AI workflow configurations to consumer projects. When installed, it automatically syncs its intelligent agent setup into your project and keeps everything updated over time.

### 🎯 Included Capabilities

- ⚙️ **27+ Specialized AI Skills** - Reusable, task-based workflows (`.agents/skills/`)
- 🧠 **Smart Agent Frameworks** - Plan Mode, Implementation Plans, Research Spikes (`.agents/agents/`)
- 🔄 **Multi-Agent Orchestrator** — Dynamic pipeline builder with 10+ specialized sub-agents
- 🧪 **TDD Orchestrator** — Strict RED→GREEN→REFACTOR/VERIFY test-driven pipeline (90% coverage gate)
- 📝 **Framework Instructions** - Technology-specific guidance (`.agents/instructions/`)
- 💬 **Prompt Templates** - Ready-to-use prompt blueprints (`.agents/prompts/`)
- 🧠 **Memory Bank** — Persistent project context across AI sessions
- 🏃‍♂️ **Caveman Mode** - Ultra-compressed communication for token efficiency
- 🎭 **Playwright Testing** - Automated E2E testing with MCP integration
- ⚡ **Vitest Unit Testing** — Fast unit tests with v8 coverage (≥90% threshold)
- 📦 **Version Auto-Bumping** - Husky-managed semantic versioning
- 🚀 **Auto-Publishing** - npm publish on merge to `main`
- 🗺️ **graphify Knowledge Graph** — Queryable code-level relationship mapping

---

## 🚀 Install

Install directly into the project that needs AI workflow configuration:

```bash
npm install @abarcenas/ai-workflow-template
```

The package runs `postinstall` automatically to sync configurations.

---

## 🔄 Sync Behavior

The sync script runs automatically but offers flexible control:

### 🔧 Manual Sync Options

```bash
# Preview changes without applying
npm run sync -- --dry-run

# Force overwrite local changes
npm run sync -- --force

# Normal sync
npm run sync
```

**Smart Sync Rules:**
- ✅ New files are copied automatically
- ✅ Unmodified files are refreshed from the package
- ✅ Locally edited files are preserved (skipped by default)
- ✅ GitHub Actions workflows are excluded from consumer sync (`.github/workflows/`)

---

## 📚 Core Structure

Post-install, your project receives this organized structure:

```
.agents/
├── 📖 instructions/    # 17 instruction sets (frameworks, workflows, security)
├── 🛠️ skills/         # 27+ specialized AI skills with tools
├── 🤖 agents/          # 3 agent workflow patterns
├── 💬 prompts/         # Reusable prompt templates
└── 📦 compress/        # Token optimization tools

.github/
└── workflows/          # CI/CD automation (excluded from sync)

docs/
└── playwright-mcp-configuration.md  # Testing integration guide

AGENTS.md               # Master instruction file with agent guidance

## 🎯 Multi-Agent Orchestrator

The project includes a **multi-agent orchestrator** that dynamically builds and runs development pipelines using specialized sub-agents.

### Agents

| Agent | File | Role |
|---|---|---|
| **Orchestrator** | `.opencode/agents/orchestrator.agent.md` | Master — analyzes requests, builds pipelines, delegates |
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
# Full automated pipeline (auto-bootstraps architecture on first run)
@orchestrator Add a user login feature with email verification
```

```bash
# Quick execution without step-by-step confirmation
@orchestrator full pipeline: refactor authentication to use JWT
```

```bash
# Specific scope — only the relevant agents run
@orchestrator fix the pagination bug in the search results component
```

#### What Happens When You Run the Orchestrator

1. **Step 0** — On first run only: auto-detects your project's tech stack, architecture patterns, and layer structure (via the architecture-blueprint-generator skill). Subsequent runs skip this.
2. **Steps 1-2** — Analyzes your request and builds a pipeline of the relevant sub-agents.
3. **Steps 3-4** — Executes each agent sequentially; you can confirm or skip each step (or enable auto-confirm for hands-off execution).
4. **Step 5** — Tracker agent documents everything to `docs/tracker-log.md`.
5. **Steps 6-7** — Presents results and persists new knowledge so the system gets smarter over time.

#### First-Run Behavior

The very first time you use `@orchestrator` in a project, it automatically runs the architecture-blueprint-generator skill to:
- Detect your tech stack (frameworks, databases, infrastructure)
- Identify architectural patterns (Clean Architecture, MVC, etc.)
- Map layer structure and dependency rules
- Write the context to `docs/.architecture-context.md` and `.agents/instructions/learned-knowledge.instructions.md`

All subsequent runs skip this — agents get architecture context pre-filled.

#### MCP Tooling

Some agents require MCP servers configured in `opencode.mcp.json` (copy from `opencode.mcp.example.json`):

| Agent | Required MCP | Purpose |
|---|---|---|
| Researcher | ddg-search, Context7 | Web search + documentation queries |
| E2E Tester | Playwright | Browser automation |
| Reviewer | GitHub | PR and issue management |
| Deployer | GitHub | Releases, Actions |
```

**Main Instructions:** `AGENTS.md` - Central guidance for using all features.

---

## 🎨 Featured Skills

### Workflow Automation
- 🏗️ `architecture-blueprint-generator` - Project analysis & documentation
- 📋 `create-implementation-plan` - Structured task planning
- ✍️ `create-readme` - Automated README generation
- 🎯 `context-map` - File relevance mapping
- 🧠 `graphify` - Codebase knowledge graph generation

### Development Tools
- 🎭 `playwright-explore-website` / `playwright-generate-test` - Browser automation
- 🐙 `github-issues` / `gh-cli` - GitHub integration
- 🧪 `polygot-test-agent` - Multi-language test generation
- 📚 `microsoft-docs` - Microsoft documentation queries

### Token & Efficiency Tools
- 🗣️ `caveman` - Ultra-compressed communication modes
- 📉 `caveman-compress` / `compress` - Memory file compression
- 📝 `caveman-commit` - Optimized commit messages
- 👥 `cavecrew` - Multi-agent coordination
- 📊 `caveman-stats` - Token usage tracking

### Quality & Safety
- 🛡️ `agent-governance` - AI safety controls
- 🔒 `security-owasp` - OWASP security guidelines
- 🤝 `conventional-commit` / `git-commit` - Git best practices

---

### 🧠 Knowledge Graph (graphify)

Turns any folder of code, docs, papers, images, or videos into a **queryable knowledge graph** with community detection, interactive HTML visualization, and GraphRAG-ready JSON.

```bash
# Build a knowledge graph for the current directory
/graphify

# Build for a specific path
/graphify <path>

# Query an existing graph
/graphify query "How does authentication work?"
```

#### Prerequisites

- **Python 3.10+** — required runtime
- **`graphifyy` Python package** — `pip install graphifyy` or `uv tool install graphifyy`
- **Optional: Gemini API key** (`GEMINI_API_KEY` or `GOOGLE_API_KEY`) — enables faster semantic extraction; without it, graphify falls back to Claude subagents

> 📖 [GitHub: safishamsi/graphify](https://github.com/safishamsi/graphify) — full docs, examples, and source

---

### 🧪 TDD Orchestrator — Test-Driven Development Pipeline

The project enforces a strict **Test-Driven Development** methodology through a specialized orchestrator that runs the **RED → GREEN → REFACTOR/VERIFY** cycle:

```
implementer (PLAN) → unit-tester∥ (RED) → coder∥ (GREEN) → unit-tester (VERIFY) → reviewer → tracker
```

| Step | Agent | Phase | Description |
|------|-------|-------|-------------|
| 1 | Implementer | PLAN | Creates implementation plan with parallel test/code batch tables |
| 2 | Unit Tester | RED | Writes FAILING tests first — defines expected behavior before any code exists |
| 3 | Coder | GREEN | Writes MINIMAL production code to pass all tests — no extra features |
| 4 | Unit Tester | VERIFY | Runs full suite, enforces ≥90% coverage threshold |
| 5 | Reviewer | REFACTOR | Audits tests + implementation for quality, security, patterns |
| 6 | Tracker | DOCUMENT | Records pipeline results to `docs/tracker-log.md` |

**Key TDD rules enforced:**
- Tests are ALWAYS written first (RED phase) — no implementation until tests exist
- Coverage gate: if <90%, loop back to RED phase (up to 3 iterations)
- Every test suite tracked in `memory-bank/tasks/`
- Lessons learned persisted to `.agents/instructions/learned-knowledge.instructions.md`

**How to invoke:**

```bash
@orchestrator Add user authentication with login/logout endpoints
```

The TDD orchestrator uses `subagent_type "tdd-orchestrator"` and auto-selects the strict TDD pipeline when testable code changes are requested.

### 🧠 Memory Bank — Persistent Project Context

The memory bank preserves project knowledge across AI sessions, preventing context loss after resets:

```
projectbrief.md → productContext.md / systemPatterns.md / techContext.md → activeContext.md → progress.md / tasks/
```

| File | Purpose |
|------|---------|
| `memory-bank/projectbrief.md` | Core requirements, goals, and scope |
| `memory-bank/productContext.md` | Problem solved, UX goals |
| `memory-bank/systemPatterns.md` | Architecture, design patterns, component relationships |
| `memory-bank/techContext.md` | Technologies, dev setup, constraints |
| `memory-bank/activeContext.md` | Current focus, recent changes, next steps |
| `memory-bank/progress.md` | What works, what's left, known issues |
| `memory-bank/tasks/` | Per-task tracking with `_index.md` |

**Task commands:** `add task`, `update task [ID]`, `show tasks [filter]`

---

## 📦 Versioning

Husky automatically bumps versions on every commit:

- **Minor** version increments by default: `1.2.0 → 1.3.0`
- **Patch** resets to 0 on each bump
- **Major** changes reset to `<major>.0.0`

No manual version management required!

---

## 🚀 Publish Flow

GitHub Actions automatically publishes to npm when merging to `main`.

### 🔑 Required Setup

Add `NPM_TOKEN` to GitHub repository secrets:

1. Repository → Settings → Secrets and variables → Actions
2. New repository secret → Name: `NPM_TOKEN`
3. Paste npm automation token

**Note:** Publish workflow files (`.github/workflows/`) are excluded from consumer sync to prevent conflicts.

---

## 💻 Local Development

```bash
# Install dependencies & activate Husky hooks
npm install

# Verify sync behavior (dry run)
npm run sync -- --dry-run

# Test package creation
npm pack --json

# Run Playwright E2E tests
npm test

# Run unit tests (Vitest)
npm run test:unit

# Run unit tests with coverage (90% threshold)
npm run test:unit:coverage

# Watch mode for unit tests
npm run test:unit:watch
```

### Testing

| Type | Framework | Command | Coverage |
|------|-----------|---------|----------|
| E2E | Playwright | `npm test` | — |
| Unit | Vitest | `npm run test:unit` | `npm run test:unit:coverage` (≥90%) |

- **E2E tests** live in `tests/*.spec.ts` — browser automation via Playwright
- **Unit tests** live in `scripts/*.test.{js,ts}` — component tests via Vitest with v8 coverage

---

## 🔄 Updating the Shared Template

1. ✏️ Edit files in `.agents/`, `docs/`, or `scripts/`
2. 🎯 Test changes locally
3. 💾 Commit (triggers auto-version bump)
4. 🚀 Merge to `main` (triggers npm publish)
5. ♻️ Consumers run `npm install` to get updates

---

## 🔔 Important Notes

- ⚙️ Uses `INIT_CWD` to install against consuming project (not package dir)
- 💾 Local changes are always preserved unless `--force` is used
- 📖 `AGENTS.md` is the main instruction file agents should read
- 🎯 Package assumes public npm registry
- 🎭 Playwright MCP integration documented in `docs/` folder

---

**Happy coding with AI-powered workflows!** 🤖✨
