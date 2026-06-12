# opencode Agent Instructions

## Project Context

This project includes AI-assisted development configuration distributed through the `ai-workflow-template` package. The key directories are:

- `.agents/instructions/` — Language, framework, and workflow instructions
- `.agents/skills/` — Reusable skill definitions for task-based workflows
- `.agents/agents/` — Specialized agent definitions for planning, research, and implementation
- `.agents/prompts/` — Reusable prompt templates

## Core Workflow

1. **Understand before acting** — Read relevant instructions from `.agents/instructions/` before working with specific technologies
2. **Plan before implementing** — Use `.agents/agents/plan.agent.md` or `.agents/agents/implementation-plan.agent.md` patterns for structured work
3. **Track progress** — Update `memory-bank/activeContext.md` and `memory-bank/progress.md` after each task (see `.agents/instructions/task-implementation.instructions.md`)
4. **Maintain context** — Keep memory bank files updated (see `.agents/instructions/memory-bank.instructions.md`)

## Instructions Reference

| Scope | File |
|---|---|
| All work | `.agents/instructions/memory-bank.instructions.md` |
| Task implementation | `.agents/instructions/task-implementation.instructions.md` |
| TypeScript | `.agents/instructions/typescript.instructions.md` |
| Node.js / Vitest | `.agents/instructions/nodejs-vitest.instructions.md` |
| Shell scripts | `.agents/instructions/shell.instructions.md` |
| Go | `.agents/instructions/go.instructions.md` |
| Angular | `.agents/instructions/angular.instructions.md` |
| Markdown docs | `.agents/instructions/markdown.instructions.md` |
| Prompts | `.agents/instructions/prompt.instructions.md` |
| Agent files | `.agents/instructions/agent.instructions.md` |
| Agent skills | `.agents/instructions/agent-skill.instructions.md` |
| Security | `.agents/instructions/security-owasp.instructions.md` |
| Playwright tests | `.agents/instructions/playwright-typescript.instructions.md` |
| Instructions files | `.agents/instructions/instructions.instructions.md` |
| Agent safety | `.agents/instructions/agent-safety.instructions.md` |
| AI safety | `.agents/instructions/ai-prompt-engineering-safety.instructions.md` |
| Context7 | `.agents/instructions/context7.instructions.md` |
| HTML/CSS styling | `.agents/instructions/html-to-css-guide.instructions.md` |

## Available Skills

Skills in `.agents/skills/` provide structured workflows for common tasks. Load them when the task matches the skill's purpose:

- `architecture-blueprint-generator` — Generate project architecture blueprints
- `conventional-commit` — Create conventional commit messages
- `create-implementation-plan` — Create structured implementation plans
- `create-readme` — Generate README files
- `create-specification` — Create specification files for GenAI consumption
- `context-map` — Map relevant files before making changes
- `editorconfig` — Generate .editorconfig files
- `git-commit` — Execute safe git commits
- `github-issues` — Manage GitHub issues via MCP
- `microsoft-docs` — Query Microsoft documentation
- `playwright-explore-website` — Explore websites with Playwright
- `playwright-generate-test` — Generate Playwright tests
- `polygot-test-agent` — Multi-agent polyglot test generation
- `prompt-builder` — Build high-quality prompts
- `agent-governance` — Add governance and safety to agent systems
- `boost-prompt` — Iteratively refine prompts
- `chrome-devtools` — Browser automation via Chrome DevTools MCP
- `gh-cli` — GitHub CLI reference
- `caveman` — Ultra-compressed communication mode
- `caveman-commit` — Compressed commit message generator
- `caveman-compress` — Token compression tool
- `caveman-help` — Help system for caveman skills
- `caveman-review` — Automated code review
- `caveman-stats` — Tracking and statistics for caveman usage
- `cavecrew` — Multi-agent coordination for caveman skills
- `compress` — General compression utilities

## Available Prompts

Prompts in `.agents/prompts/` can be invoked directly:

- `editconfig` — Generate .editorconfig
- `playwright-explore` — Explore a website
- `playwright-generate-test` — Generate Playwright tests
- `documentation-writer` — Write documentation (Diataxis framework)

## Available Agent Workflows

These agent workflows (from `.agents/agents/`) define specialized modes of operation. Invoke the relevant workflow at the start of a task by stating which mode you want to activate.

### Plan Mode — Strategic Planning & Architecture

Use this when starting a new feature, refactoring, or any non-trivial change. Follow this sequence:

1. **Understand the Goal** — Ask clarifying questions about requirements and goals
2. **Explore Context** — Examine relevant files, components, and systems that will be affected
3. **Identify Constraints** — Determine technical limitations, dependencies, and requirements
4. **Clarify Scope** — Establish how extensive the changes should be
5. **Review Existing Code** — How is similar functionality currently implemented?
6. **Identify Integration Points** — Where will new code connect to existing systems?
7. **Plan Step-by-Step** — Create a logical sequence for implementation
8. **Consider Testing** — How can the implementation be validated?
9. **Present Clear Plans** — Provide detailed strategy with reasoning, file paths, and order

Always prioritize understanding and planning over immediate implementation. Break down complex requirements into manageable components. Propose multiple approaches with trade-offs when viable alternatives exist.

### Implementation Plan Generation

Use this to create deterministic, structured plans saved to `/plan/`. Follow this template:

- Save files as `/plan/[purpose]-[component]-[version].md`
- Purpose prefixes: `upgrade|refactor|feature|data|infrastructure|process|architecture|design`
- **Required front matter**: `goal`, `version`, `date_created`, `status` (Completed/In progress/Planned/Deprecated/On Hold), `tags`
- **Required sections** (in order):
  1. Introduction (with status badge)
  2. Requirements & Constraints (with REQ-, SEC-, CON- identifiers)
  3. Implementation Steps (phases with task tables: Task ID, Description, Completed, Date)
  4. Alternatives (ALT- identifiers with rationale)
  5. Dependencies (DEP- identifiers)
  6. Files (FILE- identifiers)
  7. Testing (TEST- identifiers)
  8. Risks & Assumptions (RISK-, ASSUMPTION- identifiers)
  9. Related Specifications

Plans must be deterministic, self-contained, and immediately actionable. Use unambiguous language, specific file paths, and explicit completion criteria per task. DO NOT make code edits — only generate the plan.

### Research Spike — Systematic Technical Investigation

Use this when investigating technical unknowns, evaluating libraries, or validating approaches. Follow this process:

1. **Parse Spike** — Read and understand the spike document; identify all research questions and success criteria
2. **Investigate Exhaustively** — Research official docs, search for code examples, examine real implementations, explore edge cases
3. **Recursive Research** — For every new term/concept discovered, immediately investigate it; continue until no new relevant information emerges
4. **Cross-Reference** — Validate findings across multiple sources; document both successes AND dead ends
5. **Experimental Validation** — Ask permission before creating files or running commands; design minimal proof-of-concept tests
6. **Continuous Documentation** — Update the spike document continuously as discoveries are made (not just at the end)
7. **Evidence Standards** — Cite specific sources with URLs and versions; include timestamps; note limitations

Always ask user permission before: creating files, running commands, modifying the system, or experimental operations.

### Feature Pipeline — Stripped-Down Sequential Pipeline

Use this when you want a fixed, opinionated pipeline: **implementer → designer → coder → tracker**. It bootstraps architecture context, supports step-by-step confirmation, logs progress, and persists lessons learned.

The agent file is at `.opencode/agents/orchestrator/feature-pipeline.agent.md`.

**When to use:** You want a predictable, four-step feature pipeline without dynamic agent selection. The orchestrator agent is more flexible; this is more opinionated.

## Additional Resources

### Playwright MCP Configuration

For details on how Playwright MCP integrates with the headed mode debugging configuration, see:
- **Docs**: `docs/playwright-mcp-configuration.md`

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
