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
