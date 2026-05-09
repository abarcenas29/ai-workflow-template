# 🤖 AI Workflow Template

**Publishable AI workflow starter pack for GitHub Copilot** - Auto-syncing, version-managed, npm-distributed agent configuration suite.

---

## ✨ What This Package Does

This isn't a one-off template to clone—it's a **live npm package** that distributes AI workflow configurations to consumer projects. When installed, it automatically syncs its intelligent agent setup into your project and keeps everything updated over time.

### 🎯 Included Capabilities

- ⚙️ **27+ Specialized AI Skills** - Reusable, task-based workflows (`.agents/skills/`)
- 🧠 **Smart Agent Frameworks** - Plan Mode, Implementation Plans, Research Spikes (`.agents/agents/`)
- 📝 **Framework Instructions** - Technology-specific guidance (`.agents/instructions/`)
- 💬 **Prompt Templates** - Ready-to-use prompt blueprints (`.agents/prompts/`)
- 🏃‍♂️ **Caveman Mode** - Ultra-compressed communication for token efficiency
- 🧪 **Playwright Testing** - Automated testing with MCP integration
- 📦 **Version Auto-Bumping** - Husky-managed semantic versioning
- 🚀 **Auto-Publishing** - npm publish on merge to `main`

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

# Run Playwright tests
npm test
```

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
