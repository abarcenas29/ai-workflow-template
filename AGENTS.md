# opencode Agent Instructions

## Project Context

This project includes AI-assisted development configuration distributed through the `ai-workflow-template` package. The key directories are:

- `.agents/instructions/` — Language, framework, and workflow instructions
- `.agents/skills/` — Reusable skill definitions for task-based workflows
- `.opencode/agents/` — Specialized agent definitions for planning, research, and implementation
- `.agents/prompts/` — Reusable prompt templates

## Core Workflow

1. **Understand before acting** — Read relevant instructions from `.agents/instructions/` before working with specific technologies
2. **Plan before implementing** — Narrow underspecified work with the `scope` agent first, then use the `.opencode/agents/plan.agent.md` (optional deep planning) or `.opencode/agents/implementer.agent.md` patterns for structured work
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

All 34 skills installed in `.agents/skills/` are listed below. Load one when the task matches its purpose. The five scoping skills (`domain-modeling`, `grill-me`, `grill-with-docs`, `grilling`, `prototype`) are described in detail in [`## Agent skills`](#agent-skills).

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
- `domain-modeling` — Build and sharpen the project's domain model (`GLOSSARY.md`, ADRs)
- `graphify-framework-aware` — Exclude framework boilerplate from graphify knowledge graphs
- `grill-me` — Human-invoked router for a relentless interview (calls `grilling`)
- `grill-with-docs` — Human-invoked router for the interview plus glossary/ADR writing
- `grilling` — Stress-test a plan or idea with rounds of numbered questions
- `lighthouse-cli` — Run Lighthouse performance, accessibility, and SEO audits
- `memory-search` — Semantic vector search over the memory bank
- `prototype` — Build a throwaway prototype to answer a design question

## Available Prompts

Prompts in `.agents/prompts/` can be invoked directly:

- `editconfig` — Generate .editorconfig
- `playwright-explore` — Explore a website
- `playwright-generate-test` — Generate Playwright tests
- `documentation-writer` — Write documentation (Diataxis framework)

## Agent skills

Five skills installed from `mattpocock/skills` (pinned at `v1.3.1`) drive scoping and design work. They sit beside the other skills in `.agents/skills/`; this section explains when to reach for them and what they pair with.

### Skills

| Skill | Path | Use it when |
|-------|------|-------------|
| `grilling` | `.agents/skills/grilling/SKILL.md` | A plan, decision, or idea needs stress-testing, or a request is too vague to plan. Works a design tree in rounds: the current frontier is asked as numbered questions, each with a recommended answer. |
| `grill-me` | `.agents/skills/grill-me/SKILL.md` | You want the same interview with no repository context and no document output — a stateless, one-shot entry point. |
| `grill-with-docs` | `.agents/skills/grill-with-docs/SKILL.md` | You want the interview plus the written record — the glossary and ADRs are created as decisions settle. |
| `domain-modeling` | `.agents/skills/domain-modeling/SKILL.md` | Project terminology or an architectural decision is being introduced or changed and `GLOSSARY.md` or an ADR needs to capture it. |
| `prototype` | `.agents/skills/prototype/SKILL.md` | A design question can only be settled by running throwaway code — the logic branch for state models and data flow, the UI branch for look and feel. |

`grill-me` and `grill-with-docs` are **human-invoked routers**: both set `disable-model-invocation: true`, so an agent cannot load them. Agents invoke `grilling` directly, plus `domain-modeling` when a term or decision actually settles.

### Scope agent

`.opencode/agents/scope.agent.md` is the front door for underspecified work. It runs `grilling` in rounds against a single draft file, emits each round's frontier as numbered questions with a recommended answer per question, and stops when the frontier is empty or the remaining unknowns are explicitly deferred.

It terminates by writing `docs/spike-<feature>.md` — the spike document `.opencode/agents/researcher.agent.md` already expects as its input. From there the work continues to `researcher` (open questions need evidence), `implementer` (scope settled, planning remains), or `architect` (the shape of the system is the open problem).

The agent has no command-execution permission: it never builds, runs, or tests code. When a question can only be settled empirically it emits `prototype needed: <question>` with a branch, and that work is handed off to `coder` (logic) or `designer` (UI).

### Domain docs

`.agents/config/domain.md` declares where domain documentation lives: `GLOSSARY.md` at the repository root and ADRs in `docs/adr/`, numbered `0001-slug.md` onwards — the single-context layout.
The `domain-modeling` skill reads it before exploring the codebase; when the file or the docs it names are absent, the skill proceeds silently and creates them lazily, only once a term or decision has actually been settled.

## Available Agent Workflows

These agent workflows (from `.opencode/agents/`) define specialized modes of operation. Invoke the relevant workflow at the start of a task by stating which mode you want to activate.

### Plan Mode — Strategic Planning & Architecture

Underspecified work does not start here. The default front door is the **`scope` agent** (see [`## Agent skills`](#agent-skills)): it narrows the request through grilling rounds and writes `docs/spike-<feature>.md`, which is handed to `researcher` when open questions need evidence, or to `implementer` when only planning remains.

`.opencode/agents/plan.agent.md` remains available as an **optional deep-planning mode** for work that is already scoped but needs a step-by-step plan. It is not deleted and not deprecated — it is demoted in the default flow only. When you use it, follow this sequence:

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

### TDD Orchestrator — Test-Driven Development Pipeline

Use this when you want strict Test-Driven Development: **tests first, code second**. The pipeline enforces the RED → GREEN → REFACTOR/VERIFY cycle:

```
implementer (PLAN) → unit-tester∥ (RED) → coder∥ (GREEN) → unit-tester (VERIFY ≥90%) → reviewer → tracker
```

| Step | Phase | Agent | Role |
|------|-------|-------|------|
| 1 | PLAN | implementer | Creates plan with parallel test/code batch tables |
| 2 | RED | unit-tester∥ | Writes failing tests before any implementation exists |
| 3 | GREEN | coder∥ | Writes minimal code to pass tests — no extra features |
| 4 | VERIFY | unit-tester | Runs all tests, checks coverage ≥ 90% |
| 5 | REVIEW | reviewer | Audits tests + code for quality, security, patterns |
| 6 | DOCUMENT | tracker | Records results to `docs/tracker-log.md` |

The agent file is at `.opencode/agents/orchestrator/tdd-orchestrator.agent.md`.

**When to use:** Any feature, bug fix, or refactor where tests should be written first. The orchestrator automatically selects this pipeline when testable code changes are requested.

**Coverage gate:** If coverage < 90%, the pipeline loops back to RED phase (up to 3 iterations).

### Memory Bank

The memory bank at `memory-bank/` preserves project context across AI sessions. Core files:

| File | Purpose |
|------|---------|
| `projectbrief.md` | Core requirements, goals, scope |
| `productContext.md` | Problem solved, UX goals |
| `systemPatterns.md` | Architecture, design patterns |
| `techContext.md` | Technologies, setup, constraints |
| `activeContext.md` | Current focus, recent changes, next steps |
| `progress.md` | What works, what's left, known issues |
| `tasks/` | Per-task tracking with `_index.md` |

**Always read `activeContext.md` and `progress.md` at the start of every task.** Update them after completing work. See `.agents/instructions/memory-bank.instructions.md` for full details.

## Additional Resources

### Playwright MCP Configuration

For details on how Playwright MCP integrates with the headed mode debugging configuration, see:
- **Docs**: `docs/playwright-mcp-configuration.md`

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke these skills in order before doing anything else:
1. `skill: "graphify-framework-aware"` — detects project frameworks and configures `.graphifyignore` to exclude boilerplate
2. `skill: "graphify"` — runs the knowledge graph pipeline

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
