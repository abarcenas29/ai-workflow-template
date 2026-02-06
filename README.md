# AI Workflow Template

A comprehensive template repository for AI-assisted development workflows using GitHub Copilot. This template provides a structured approach to leveraging AI assistance through pre-configured skills, prompts, agents, and coding standards.

## 📋 Overview

This template repository is designed to accelerate project setup and maintain consistency across your AI-assisted development projects. It includes battle-tested configurations, coding standards, and reusable AI workflows that help you work more efficiently with GitHub Copilot and other AI coding assistants.

## 🏗️ Repository Structure

```
.github/
├── co-pilot.instructions.md    # Main GitHub Copilot configuration
├── skills/                      # Reusable domain-specific knowledge modules
├── prompts/                     # Task-specific prompt templates
├── agents/                      # Multi-step autonomous task handlers
└── instructions/                # Language and framework coding standards
```

## ✨ Features

### 🎯 Skills

Domain-specific knowledge modules that provide specialized capabilities:

- **gh-cli** - Comprehensive GitHub CLI reference for all GitHub operations
- **git-commit** - Conventional commit message generation with intelligent staging
- **github-issues** - Create and manage GitHub issues using best practices

### 📝 Prompts

Pre-configured prompt templates for common development tasks:

- **copilot-instructions-blueprint-generator** - Generate custom Copilot instruction files
- **documentation-writer** - Create comprehensive project documentation
- **editconfig** - Configure editor settings and preferences
- **playwright-explore** - Explore web applications with Playwright
- **playwright-generate-test** - Generate automated E2E tests

### 🤖 Agents

Autonomous task handlers for complex, multi-step workflows:

- **plan** - High-level project planning and task breakdown
- **implementation-plan** - Detailed implementation planning with technical specifications
- **research-spike** - Research and exploration for technical decisions

### 📚 Instructions

Coding standards and best practices for various technologies:

- **angular** - Angular-specific coding standards and conventions
- **html-to-css-guide** - Accessible design and styling guidelines
- **playwright-typescript** - Playwright test generation best practices
- **prompt** - Guidelines for creating high-quality prompt files
- **security-owasp** - OWASP Top 10 security guidelines for all languages
- **typescript** - TypeScript development standards (ES2022/TS5.x)

## 🚀 Getting Started

### Using This Template

1. Click the "Use this template" button at the top of this repository
2. Create a new repository from this template
3. Clone your new repository:
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

### Customizing for Your Project

1. **Update co-pilot.instructions.md** - Modify the main Copilot configuration with your project-specific context
2. **Add project documentation** - Create `docs/memory.md` for project state tracking
3. **Select relevant instructions** - Remove or add instruction files based on your tech stack
4. **Customize skills** - Extend or modify skills for your specific workflows
5. **Add project-specific prompts** - Create new prompt files for recurring tasks in your project

## 📖 How to Use

### With GitHub Copilot

GitHub Copilot will automatically discover and use the `.github/co-pilot.instructions.md` file and the instructions in the `.github/instructions/` directory. The AI will apply these guidelines when generating code suggestions.

### Skills

Skills are triggered automatically when relevant tasks are detected. For example:

- Type `/commit` or ask to "commit changes" to use the git-commit skill
- Ask to "create an issue" to use the github-issues skill

### Prompts

Reference prompts directly in your conversations with AI assistants:

```
@workspace Use the playwright-generate-test prompt to create tests for the login page
```

### Agents

Delegate complex tasks to agents:

```
Use the implementation-plan agent to create a detailed plan for the user authentication feature
```

## 🔒 Security

This template includes comprehensive OWASP-based security guidelines in `.github/instructions/security-owasp.instructions.md`. All code generation follows security-first principles including:

- Input validation and sanitization
- Parameterized queries to prevent SQL injection
- Secure authentication and session management
- Protection against XSS, CSRF, and other common vulnerabilities

## 🤝 Contributing

When contributing to projects using this template:

1. Follow the coding standards defined in `.github/instructions/`
2. Use conventional commit messages (see git-commit skill)
3. Document changes in project changelog
4. Update `docs/memory.md` for significant project state changes

## 📄 License

This template is provided as-is for use in your projects. Customize it freely to meet your needs.

## 🔍 Additional Resources

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Playwright Documentation](https://playwright.dev/)

---

**Ready to start?** Use this template for your next project and experience AI-assisted development with pre-configured best practices and workflows.
