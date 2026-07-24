# 🤖 AI Workflow Template

**Publishable AI workflow starter pack for OpenCode** — Auto-syncing, version-managed, npm-distributed agent configuration suite with vector search memory.

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
- 🧠 **Memory Bank** — Persistent project context across AI sessions with semantic search
- 🔍 **Vector Memory Search** — sqlite-vec powered semantic search (token-efficient, zero deps)
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

The package runs `postinstall` automatically to sync files. For full setup including git hooks, run the one-step setup command below.

---

## 🪝 Git Hook Setup

After installing the package, configure husky git hooks with one command:

```bash
# One-step setup (fetches from npm registry automatically):
npx @abarcenas/ai-workflow-template

# Or if the package is already installed:
npx ai-workflow-setup
```

### What It Does

The setup command automatically:

| Phase | Action |
|-------|--------|
| 🔍 **Discover** | Detects git repo, existing hooks, CI mode |
| 🪝 **Hooks** | Installs `pre-commit` (version bump + validation) and `post-merge` (memory index update) |
| 📦 **Prepare** | Merges `"husky"` into your `package.json` prepare script |
| ⚙️ **Husky Init** | Initializes husky and sets `core.hooksPath` |
| 🔄 **Sync** | Copies agent configurations, skills, and memory bank scaffolding |

### Options

```bash
npx ai-workflow-setup --dry-run     # Preview without changes
npx ai-workflow-setup --force       # Overwrite existing hooks
npx ai-workflow-setup --skip-hooks  # Skip hook installation
npx ai-workflow-setup --skip-sync   # Skip file sync
npx ai-workflow-setup --help        # Show all options
```

### Hook Merging

If you already have existing husky hooks, the setup command intelligently merges:
- **Your hooks are never overwritten** — new content is appended after a separator
- **Managed hooks are detected** via marker comments and updated idempotently
- **Complex hooks** trigger a warning with manual merge instructions
- **CI environments** auto-skip hook configuration

> **ℹ️ npm v12 note:** Future npm versions block automatic `postinstall` scripts. The explicit `npx setup` command is the recommended, future-proof approach.

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

### 🧠 Memory Bank — Persistent Project Context with Vector Search

The memory bank preserves project knowledge across AI sessions, preventing context loss after resets. **New: semantic vector search** lets agents query project memory without loading all files into context — saving thousands of tokens per session.

#### Architecture

```
Markdown files (git-committed)          Vector Index (.gitignore'd)
══════════════════════════════          ════════════════════════════
memory-bank/                            memory-bank/.index/
├── activeContext.md                    └── memory.db  ← sqlite-vec + better-sqlite3
├── progress.md                              │
├── systemPatterns.md                         │  rebuilt from .md files
├── ...                                       ▼  on demand
                                        memory_search("tdd orchestrator")
                                        → top 5 relevant chunks (~500 tokens)
```

**Source of truth:** Markdown files (git-versioned, human-readable).  
**Search index:** `sqlite-vec` vector database (disposable, rebuildable, never committed).

#### MCP Tools (OpenCode)

| Tool | Purpose |
|---|---|
| `memory_search` | Semantic search across memory-bank + docs (query + topK) |
| `memory_update` | Incremental sync — only changed files (~2 seconds) |
| `memory_rebuild` | Full rebuild from markdown files (rare — clone/corruption) |
| `memory_get` | Read a specific memory file by name |
| `memory_stats` | Index statistics (vector count, DB size) |

#### File Structure

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

#### Document Schema

All memory-bank files use YAML frontmatter for search indexing:

```yaml
---
id: activeContext
title: "Active Context"
updated: 2026-07-23
tags: [orchestrator, bootstrap, tdd]
entities: [vitest, graphify, memory-bank]
category: context
---
```

See `memory-bank/.vocabulary.json` for the controlled vocabulary (user-extensible).

**Auto-normalization:** `npm install` runs `normalize-memory.js` to add frontmatter to existing files.  
**Pre-commit validation:** Husky hook rejects commits with invalid frontmatter.

**Task commands:** `add task`, `update task [ID]`, `show tasks [filter]`

#### Token Efficiency

| Approach | Tokens per session |
|---|---|
| Read all memory files | ~5,000–15,000+ |
| Semantic search | ~500–2,000 (top 3–5 chunks) |

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

# ─── Memory Bank (Vector Search) ───

# Build the vector search index (one-time, ~8 min for 5K files)
npm run memory:rebuild

# Incremental update (seconds — only changed files)
npm run memory:update

# Search project memory
npm run memory:search "tdd orchestrator status"

# Normalize document frontmatter (runs automatically on install)
npm run memory:normalize
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
- 🪝 Run `npx ai-workflow-setup` after install to configure git hooks (npm v12+ compatible)

---

**Happy coding with AI-powered workflows!** 🤖✨
