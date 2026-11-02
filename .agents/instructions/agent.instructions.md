---
description: "Guidelines for creating custom agent files for opencode"
applyTo: "**/agents/**/*.md"
---

# Custom Agent File Guidelines

Instructions for creating effective and maintainable custom agent files that provide specialized expertise for specific development tasks in opencode.

## Project Context

- Target audience: Developers creating custom agents for opencode
- File format: Markdown with YAML frontmatter
- File naming convention: lowercase with hyphens (e.g., `test-specialist.md`)
- Location: `.opencode/agents/` directory (repository-level)
- Purpose: Define specialized agents with tailored expertise, permissions, and instructions for specific tasks
- Official documentation: [opencode.ai](https://opencode.ai)

## Required Frontmatter

Every agent file must include YAML frontmatter. The runtime this repository targets (opencode v2) reads three keys, and every agent file here uses exactly these three:

```yaml
---
description: "Brief description of the agent purpose and capabilities"
mode: all
permissions:
  - { action: edit,  resource: "*",    effect: deny }
  - { action: edit,  resource: "*.md", effect: allow }
  - { action: shell, resource: "*",    effect: allow }
---
```

### Core Frontmatter Properties

#### **description** (REQUIRED)

- Double-quoted string, clearly stating the agent's purpose and domain expertise
- One sentence and actionable; the files in this repository run 137–286 characters
- The model choosing which agent to delegate to reads this string, so name the domain rather than the workflow
- Example: `"Production code implementation specialist. Writes clean, maintainable code following project conventions."`

#### **mode** (RECOMMENDED — defaults to `primary`)

- One of `primary`, `subagent`, or `all`
- `primary` — runs as the main agent for a session
- `subagent` — runs only in a child session launched by another agent
- `all` — either; this is what makes an agent delegable
- This repository uses `all` on 11 agents and `primary` on `planner.md` plus the three `orchestrator/*.md` templates

#### **permissions** (REQUIRED for enforcement)

- Ordered list of rules; each rule is `{ action, resource, effect }`
- `action` — the operation being gated (see "Permission Configuration" below)
- `resource` — the value matched: a path, a command line, an agent ID, a URL
- `effect` — `allow`, `deny`, or `ask`
- An agent with no `permissions` list inherits the runtime's base policy, which allows everything except `.env` reads — omitting this key is not "no access", it is "no restriction"
- See "Permission Configuration" section below for details

#### **name** (NOT a v2 key)

- The agent ID comes from the file path: `.opencode/agents/team/reviewer.md` is `team/reviewer`
- `name` is a V1 frontmatter field, ignored in any file that is read as v2 — that is, any file using `permissions`, `system`, `request`, or `disabled`
- Do not add it; rename the file instead

## Verified Inventory — This Repository's Agent Files

The tables below are derived from the 15 agent files under `.opencode/agents/` (12 root files plus 3 under `orchestrator/`). They are the evidence that this document describes reality; when you add a rule shape here, add it there first.

### Top-level keys

| Key | Files using it | Example value |
| --- | --- | --- |
| `description` | 15 of 15 | `"Code review specialist. Reviews diffs with read-only shell access…"` |
| `mode` | 15 of 15 | `all` (11 files), `primary` (4 files) |
| `permissions` | 15 of 15 | ordered list of `{ action, resource, effect }` |
| `name` | 0 | — |
| `tools` | 0 | — |

### Permission actions

| `action` | Files using it | Rules | Example `resource` | `effect` values seen |
| --- | --- | --- | --- | --- |
| `edit` | 15 | 40 | `*.md`, `*.spec.ts`, `*` | `allow`, `deny` |
| `shell` | 15 | 63 | `*`, `git diff*`, `git merge *` | `allow`, `deny` |

No other action appears in this repository: `read`, `glob`, `grep`, `webfetch`, and `subagent` are left at the runtime's base policy rather than written out. `ask` is not used either — an agent here either grants a capability or removes it.

### Effects

| `effect` | Rules | Where it appears |
| --- | --- | --- |
| `allow` | 65 | Specific grants, and the whole of `coder.md`, `deployer.md`, `planner.md` |
| `deny` | 38 | Catch-all `*` gates, and the guard rails at the bottom of `reviewer.md` |
| `ask` | 0 | Not used in this repository |

## Permission Configuration

`permissions` is the only enforcement mechanism. A `tools:` array is a V1 field: it is ignored in any file that is read as v2, which is every file that also uses `permissions`, `system`, `request`, or `disabled`.

### Rule Syntax

**Grant everything** — the runtime's own base policy, useful only as a starting point:

```yaml
permissions:
  - { action: "*", resource: "*", effect: allow }
```

**Deny by default, then grant specifically** — the shape used by most agents here:

```yaml
permissions:
  - { action: edit,  resource: "*",    effect: deny }
  - { action: edit,  resource: "*.md", effect: allow }
  - { action: shell, resource: "*",    effect: allow }
```

**Gate one action and leave the rest alone** — `read`, `glob`, and `grep` keep the base policy's `allow`, so a read-only agent needs two rules, not twenty:

```yaml
permissions:
  - { action: edit,  resource: "*", effect: deny }
  - { action: shell, resource: "*", effect: deny }
```

If no rule matches at all, the runtime asks. The base policy's `{ action: "*", resource: "*", effect: "allow" }` usually matches first, which is why a restriction has to be written down explicitly.

### Action Names

`action` is a string, not a closed enum, so plugins may add their own. The names that changed from V1 are the ones that bite:

| V1 name | V2 name | Why it matters |
| --- | --- | --- |
| `bash` | `shell` | A `bash` rule never matches, so the shell stays on the base `allow` |
| `task` | `subagent` | Same failure: the parent can launch every agent it wants |
| `write`, `patch` | `edit` | One `edit` rule covers the `edit`, `write`, and `patch` tools |

The full vocabulary — `read`, `edit`, `glob`, `grep`, `shell`, `subagent`, `skill`, `question`, `webfetch`, `websearch`, `external_directory`, `execute`, and `<server>_<tool>` — is defined by the runtime, not by this template. None of them is exercised by a file in this repository except `edit` and `shell`.

### Pattern Matching

- `*` matches zero or more characters, including `/` — `*.md` matches `docs/adr/0001-x.md`
- `?` matches exactly one character; every other character matches literally
- The pattern is matched against the whole value, not a substring: `git status` does not match `git status --short`
- A shell pattern ending in ` *` also matches the bare command, so `git status *` covers `git status` too

### Shell Rules

- `resource` for `shell` is the command line as typed — `git status --short`, not `git status`
- The trailing `*` is what allows arguments: `git diff*` covers `git diff`, `git diff HEAD~1`, and `git diff --stat`
- A compound command is split on `|`, `&&`, and `;`, and every segment is checked; one segment without an allow rule refuses the whole command
- Redirection such as `2>/dev/null` does not break the match
- `shell` runs with the host user's filesystem, process, and network authority — prefer a narrow allowlist over patterns that try to recognise every dangerous command

### Permission Selection Best Practices

- **Principle of Least Privilege**: open with `{ action: <x>, resource: "*", effect: deny }` and add only the allows the agent cannot work without
- **Order is meaning**: the last matching rule wins, so the catch-all `*` deny goes **first** and the specific allows follow
- **Guard rails go last**: a narrow deny such as `git commit*` belongs at the bottom, so a future widening of an allow above it still loses
- **Space your patterns**: `git merge *` cannot swallow `git merge-base*`; `git merge*` would, and would silently remove the reviewer's most important read-only verb
- **Focus**: every rule you add is a capability; an agent with four rules is easier to audit than one with forty
- **Documentation**: comment why a specific allow exists, as `reviewer.md` and `unit-tester.md` do

### How These Semantics Were Verified

The rule shape, the effect values, the `mode` values, and the V1 → V2 action renames are read from the v2 documentation — [permissions](https://opencode.ai/v2/docs/permissions/), [agents](https://opencode.ai/v2/docs/agents/), [migrate-v1](https://opencode.ai/v2/docs/migrate-v1) — and corroborated against the installed runtime (`opencode v2.2.5`, `/opt/homebrew/Cellar/opencode-v2/2.2.5/bin/opencode`), whose embedded schema declares `Permission.Rule = { action: string, resource: string, effect: "allow" | "deny" | "ask" }`, `Permission.Effect = allow | deny | ask`, and `Agent.Info.mode = subagent | primary | all`.

The ordering, wildcard, and shell facts were measured with live permission probes against a consumer of this package. They are recorded here as measurements, not as quotations from a specification:

| Measured fact | Failure it prevents |
| --- | --- |
| The last matching rule wins | A catch-all `deny` written last locks the agent out of everything; written first, it is what makes the allows meaningful |
| `*` spans `/` | `*.spec.ts` assumed to match one path segment only, so a nested test file is refused (or, with `*.md`, a nested doc is silently writable) |
| The `shell` resource is the bare command line | A rule of `git status` that never matches `git status --short`, leaving the agent unable to inspect |
| Compound commands are decomposed and every segment must match | `git status --short \| xargs rm` allowed because the left-hand segment was allowlisted |
| Redirection does not break the match | `2>/dev/null` silently un-matching an otherwise allowlisted command |

### Migrating a V1 `tools:` Array

If you are copying an agent definition from an older version of this template, a `tools:` array is a V1 field: in a file that is read as v2 it contributes nothing — the runtime ignores it and logs a warning, and the agent falls back to the base policy, which allows everything. Convert it to a `permissions` list.

Before:

```yaml
tools: ["Read", "Edit", "Grep"]
```

After:

```yaml
permissions:
  - { action: edit,  resource: "*",    effect: deny }
  - { action: edit,  resource: "*.md", effect: allow }
```

### MCP Server Tools

MCP tools are not entries in a tool list. Each is a permission action named `<server>_<tool>`, with characters outside the identifier set replaced by `_` — the `github` server's `add_issue_comment` tool is `github_add_issue_comment`, and the `memory-bank` server's `memory_search` tool is `memory_bank_memory_search`:

```yaml
permissions:
  - { action: github_add_issue_comment, resource: "*", effect: deny }
```

Server names come from `opencode.json` (or `opencode.mcp.example.json` in this repository). No agent file here gates an MCP tool yet; the naming scheme is the runtime's, not this template's.

## Sub-Agent Invocation (Agent Orchestration)

Agents can invoke other agents through the **`subagent` permission action** to orchestrate multi-step workflows.

The recommended approach is **prompt-based orchestration**:

- The orchestrator defines a step-by-step workflow in natural language.
- Each step is delegated to a specialized agent.
- The orchestrator passes only the essential context (e.g., base path, identifiers) and requires each sub-agent to read its own `.md` spec for permissions/constraints.

### How It Works

1. Enable agent invocation by granting the `subagent` action in the orchestrator's `permissions`:

```yaml
permissions:
  - { action: subagent, resource: "*",     effect: deny }
  - { action: subagent, resource: "coder", effect: allow }
```

2. For each step, invoke a sub-agent by providing:

- **Agent name** (the identifier users select/invoke)
- **Agent spec path** (the `.md` file to read and follow)
- **Minimal shared context** (e.g., base path, project name, log file)

### Prompt Pattern (Recommended)

Use a consistent "wrapper prompt" for every step so sub-agents behave predictably:

```text
This phase must be performed as the agent "<AGENT_NAME>" defined in "<AGENT_SPEC_PATH>".

IMPORTANT:
- Read and apply the entire agent spec file (permissions, constraints, quality standards).
- Work on "<WORK_UNIT_NAME>" with base path: "<BASE_PATH>".
- Perform the necessary reads/writes under this base path.
- Return a clear summary (actions taken + files produced/modified + issues).
```

Optional: if you need a lightweight, structured wrapper for traceability, embed a small JSON block in the prompt (still human-readable and tool-agnostic):

```text
{
  "step": "<STEP_ID>",
  "agent": "<AGENT_NAME>",
  "spec": "<AGENT_SPEC_PATH>",
  "basePath": "<BASE_PATH>"
}
```

### Orchestrator Structure (Keep It Generic)

For maintainable orchestrators, document these structural elements:

- **Dynamic parameters**: what values are extracted from the user (e.g., project name, file name, base path).
- **Sub-agent registry**: a list/table mapping each step to agent name + agent spec path.
- **Step ordering**: explicit sequence (Step 1 → Step N).
- **Trigger conditions** (optional but recommended): define when a step runs vs is skipped.
- **Logging strategy** (optional but recommended): a single log/report file updated after each step.

Avoid embedding orchestration "code" (JavaScript, Python, etc.) inside the orchestrator prompt; prefer deterministic, tool-driven coordination.

### Basic Pattern

Structure each step invocation with:

1. **Step description**: Clear one-line purpose (used for logs and traceability)
2. **Agent identity**: agent name + agent spec path
3. **Context**: A small, explicit set of variables (paths, IDs, environment name)
4. **Expected outputs**: Files to create/update and where they should be written
5. **Return summary**: Ask the sub-agent to return a short, structured summary

### Example: Multi-Step Processing

```text
Step 1: Transform raw input data
Agent: data-processor
Spec: .opencode/agents/data-processor.md
Context: projectName, basePath
Input: basePath/raw/
Output: basePath/processed/
Expected: write basePath/processed/summary.md

Step 2: Analyze processed data (depends on Step 1 output)
Agent: data-analyst
Spec: .opencode/agents/data-analyst.md
Context: projectName, basePath
Input: basePath/processed/
Output: basePath/analysis/
Expected: write basePath/analysis/report.md
```

### Key Points

- **Pass variables in prompts**: Use clear descriptions for all dynamic values
- **Keep prompts focused**: Clear, specific tasks for each sub-agent
- **Return summaries**: Each sub-agent should report what it accomplished
- **Sequential execution**: Run steps in order when dependencies exist between outputs/inputs
- **Error handling**: Check results before proceeding to dependent steps

### ⚠️ Sub-Agent Availability Requirement

**Critical**: a sub-agent's capabilities come from its own `permissions`, not from its parent's. The parent's `subagent` rules decide *which* agents it may launch; the child then runs with the rules in its own file.

**Example** — an orchestrator that may launch only the coder:

```yaml
# The parent gates delegation; it does not lend the child its own capabilities
permissions:
  - { action: subagent, resource: "*",     effect: deny }
  - { action: subagent, resource: "coder", effect: allow }
```

The child's file is what stops the child from editing source or running arbitrary commands. If the child needs to write files, the `edit` rules in *its* frontmatter have to say so — widening the parent changes nothing.

### ⚠️ Important Limitation

**Sub-agent orchestration is NOT suitable for large-scale data processing.** Avoid using multi-step sub-agent pipelines when:

- Processing hundreds or thousands of files
- Handling large datasets
- Performing bulk transformations on big codebases
- Orchestrating more than 5-10 sequential steps

Each sub-agent invocation adds latency and context overhead. For high-volume processing, implement logic directly in a single agent instead. Use orchestration only for coordinating specialized tasks on focused, manageable datasets.

## Agent Prompt Structure

The markdown content below the frontmatter defines the agent's behavior, expertise, and instructions. Well-structured prompts typically include:

1. **Agent Identity and Role**: Who the agent is and its primary role
2. **Core Responsibilities**: What specific tasks the agent performs
3. **Approach and Methodology**: How the agent works to accomplish tasks
4. **Guidelines and Constraints**: What to do/avoid and quality standards
5. **Output Expectations**: Expected output format and quality

### Prompt Writing Best Practices

- **Be Specific and Direct**: Use imperative mood ("Analyze", "Generate"); avoid vague terms
- **Define Boundaries**: Clearly state scope limits and constraints
- **Include Context**: Explain domain expertise and reference relevant frameworks
- **Focus on Behavior**: Describe how the agent should think and work
- **Use Structured Format**: Headers, bullets, and lists make prompts scannable

## Variable Definition and Extraction

Agents can define dynamic parameters to extract values from user input and use them throughout the agent's behavior and sub-agent communications. This enables flexible, context-aware agents that adapt to user-provided data.

### When to Use Variables

**Use variables when**:

- Agent behavior depends on user input
- Need to pass dynamic values to sub-agents
- Want to make agents reusable across different contexts
- Require parameterized workflows
- Need to track or reference user-provided context

**Examples**:

- Extract project name from user prompt
- Capture feature name for pipeline processing
- Identify file paths or directories
- Extract configuration options
- Parse module identifiers

### Variable Declaration Pattern

Define variables section early in the agent prompt to document expected parameters:

```markdown
# Agent Name

## Dynamic Parameters

- **Parameter Name**: Description and usage
- **Another Parameter**: How it's extracted and used

## Your Mission

Process [PARAMETER_NAME] to accomplish [task].
```

### Variable Extraction Methods

#### 1. **Explicit User Input**

Ask the user to provide the variable if not detected in the prompt:

```markdown
## Your Mission

Process the project by analyzing your codebase.

### Step 1: Identify Project

If no project name is provided, **ASK THE USER** for:

- Project name or identifier
- Base path or directory location
- Configuration type (if applicable)

Use this information to contextualize all subsequent tasks.
```

#### 2. **Implicit Extraction from Prompt**

Automatically extract variables from the user's natural language input:

```markdown
## Variable Resolution Strategy

1. **From User Prompt**: First, look for explicit mentions in user input
2. **From File Context**: Check current file name or path
3. **From Workspace**: Use workspace folder or active project
4. **From Settings**: Reference configuration files
5. **Ask User**: If all else fails, request missing information
```

### Using Variables in Agent Prompts

Describe variables in agent prompts to make them dynamic:

```markdown
# Agent Name

## Dynamic Parameters

- **Project Name**: The name of the project being worked on
- **Base Path**: Root directory for the project files
- **Output Directory**: Where results should be written

## Your Mission

Process the project based on the provided parameters.

## Process Steps

1. Read input from the base path
2. Process files according to project configuration
3. Write results to the output directory
4. Generate summary report
```

#### Passing Variables to Sub-Agents

When invoking a sub-agent, pass all context through descriptive instructions in the prompt. Prefer passing **paths and identifiers**, not entire file contents.

Example (prompt template):

```text
This phase must be performed as the agent "documentation-writer" defined in ".opencode/agents/documentation-writer.md".

IMPORTANT:
- Read and apply the entire agent spec file.
- Project: [project name]
- Base path: [base path]
- Input: [input path]
- Output: [output path]

Task:
1. Read source files under the input path.
2. Generate documentation.
3. Write outputs under the output path.
4. Return a concise summary (files created/updated, key decisions, issues).
```

The sub-agent receives all necessary context embedded in the prompt.

### Real-World Example: Code Review Orchestrator

Example of a simple orchestrator that validates code through multiple specialized agents:

1. Determine shared context:
   - Repository name, PR number
   - Base path

2. Invoke specialized agents sequentially (each agent reads its own `.md` spec):

```text
Step 1: Security Review
Agent: security-reviewer
Spec: .opencode/agents/security-reviewer.md
Context: repository name, PR number, base path
Output: security-review.md

Step 2: Test Coverage
Agent: test-coverage
Spec: .opencode/agents/test-coverage.md
Context: repository name, PR number, base path
Output: coverage-report.md

Step 3: Aggregate
Agent: review-aggregator
Spec: .opencode/agents/review-aggregator.md
Context: repository name, PR number, base path
Output: final-review.md
```

### Variable Best Practices

#### 1. **Clear Documentation**

Always document what variables are expected:

```markdown
## Required Variables

- **projectName**: The name of the project (string, required)
- **basePath**: Root directory for project files (path, required)

## Optional Variables

- **mode**: Processing mode - quick/standard/detailed (string, default: standard)
- **outputFormat**: Output format - markdown/json/html (string, default: markdown)

## Derived Variables

- **outputDir**: Automatically set based on base path
- **logFile**: Automatically set for session tracking
```

#### 2. **Consistent Naming**

Use consistent variable naming conventions:

```markdown
# Good: Clear, descriptive naming
- projectName     # What project to work on
- basePath        # Where project files are located
- outputDir       # Where to save results
- processingMode  # How to process (detail level)

# Avoid: Ambiguous or inconsistent
- name            # Too generic
- path            # Unclear which path
- mode            # Too short
- config          # Too vague
```

## File Organization and Naming

### Repository-Level Agents

- Location: `.opencode/agents/`
- Scope: Available only in the specific repository
- Access: Uses repository-configured MCP servers from `opencode.json`

### Naming Conventions

- Use lowercase with hyphens: `test-specialist.md`
- Name should reflect agent purpose
- Filename becomes default agent name (if `name` not specified)
- Allowed characters: `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`

## Agent Creation Checklist

### Frontmatter

- [ ] `description` field present and descriptive (one sentence; 137–286 chars in this repository)
- [ ] `description` wrapped in double quotes
- [ ] `mode` set to `primary`, `subagent`, or `all`
- [ ] `permissions` present, opening with a catch-all `*` deny and followed by specific allows
- [ ] No V1 keys (`name`, `tools`, `permission`) — they are ignored in a file read as v2

### Prompt Content

- [ ] Clear agent identity and role defined
- [ ] Core responsibilities listed explicitly
- [ ] Approach and methodology explained
- [ ] Guidelines and constraints specified
- [ ] Output expectations documented
- [ ] Examples provided where helpful
- [ ] Instructions are specific and actionable
- [ ] Scope and boundaries clearly defined
- [ ] Total content under 30,000 characters

### File Structure

- [ ] Filename follows lowercase-with-hyphens convention
- [ ] File placed in correct directory (`.opencode/agents/`)
- [ ] Filename uses only allowed characters
- [ ] File extension is `.md`

### Quality Assurance

- [ ] Agent purpose is unique and not duplicative
- [ ] Permission rules are minimal and necessary
- [ ] Instructions are clear and unambiguous
- [ ] Agent has been tested with representative tasks
- [ ] Documentation references are current
- [ ] Security considerations addressed (if applicable)

## Common Agent Patterns

Each pattern below is taken from a file in this repository, so the YAML is known to parse and known to be in use.

### Testing Specialist

**Purpose**: Focus on test coverage and quality
**Permissions**: Tests only — `edit *` denied, one allow per test-file convention, shell allowed so the suite can actually run (`unit-tester.md`)
**Approach**: Analyze, identify gaps, write tests, avoid production code changes

```yaml
permissions:
  - { action: edit,  resource: "*",         effect: deny }
  - { action: edit,  resource: "*.spec.ts", effect: allow }
  - { action: edit,  resource: "*_test.go", effect: allow }
  - { action: shell, resource: "*",         effect: allow }
```

### Implementation Planner

**Purpose**: Create detailed technical plans and specifications
**Permissions**: Documentation only — `edit *` denied, `*.md` allowed, shell allowed for reading the codebase (`implementer.md`)
**Approach**: Analyze requirements, create documentation, avoid implementation

```yaml
permissions:
  - { action: edit,  resource: "*",    effect: deny }
  - { action: edit,  resource: "*.md", effect: allow }
  - { action: shell, resource: "*",    effect: allow }
```

### Code Reviewer

**Purpose**: Review code quality and provide feedback
**Permissions**: Edits denied except Markdown; shell denied first, then the inspection verbs, then the guard rails (`reviewer.md`)
**Approach**: Analyze, suggest improvements, no direct modifications

```yaml
permissions:
  - { action: edit,  resource: "*",           effect: deny }
  - { action: edit,  resource: "*.md",        effect: allow }
  - { action: shell, resource: "*",           effect: deny }
  - { action: shell, resource: "git diff*",   effect: allow }
  - { action: shell, resource: "git log*",    effect: allow }
  - { action: shell, resource: "git commit*", effect: deny }
```

### Refactoring Specialist

**Purpose**: Improve code structure and maintainability
**Permissions**: Full edit and shell (`coder.md`, `deployer.md`)
**Approach**: Analyze patterns, propose refactorings, implement safely

```yaml
permissions:
  - { action: edit,  resource: "*", effect: allow }
  - { action: shell, resource: "*", effect: allow }
```

### Security Auditor

**Purpose**: Identify security issues and vulnerabilities
**Permissions**: Read-only — no edits and no shell, which still leaves `read`, `glob`, and `grep` at the base policy's `allow` (`e2e-tester.md`, `scope.md`)
**Approach**: Scan code, check against OWASP, report findings

```yaml
permissions:
  - { action: edit,  resource: "*", effect: deny }
  - { action: shell, resource: "*", effect: deny }
```

## Common Mistakes to Avoid

### Frontmatter Errors

- ❌ Missing `description` field
- ❌ Description not wrapped in quotes
- ❌ `permission:` (singular) instead of `permissions:` — the V1 spelling, ignored in a file read as v2
- ❌ A `tools:` array or a `name:` key — V1 fields, ignored in a file read as v2
- ❌ Incorrect YAML syntax (indentation, quotes)

### Permission Configuration Issues

- ❌ Granting `edit` or `shell` with `resource: "*"` and `effect: allow` to an agent whose purpose is analysis
- ❌ The catch-all `*` deny placed last — it then wins over every allow above it and locks the agent out of everything
- ❌ A V1 action name (`bash`, `task`, `write`, `patch`) that matches nothing, leaving the capability on `allow`
- ❌ A `shell` pattern of `git status` when the agent will type `git status --short`
- ❌ An unspaced guard pattern (`git merge*`) that swallows the read-only verb beside it (`git merge-base*`)

### Prompt Content Problems

- ❌ Vague, ambiguous instructions
- ❌ Conflicting or contradictory guidelines
- ❌ Lack of clear scope definition
- ❌ Missing output expectations
- ❌ Overly verbose instructions (exceeding character limits)
- ❌ No examples or context for complex tasks

### Organizational Issues

- ❌ Filename doesn't reflect agent purpose
- ❌ Wrong directory (using `.github/agents/` instead of `.opencode/agents/`)
- ❌ Using spaces or special characters in filename
- ❌ Duplicate agent names causing conflicts

## Testing and Validation

### Manual Testing

1. Create the agent file with proper frontmatter
2. Open opencode in your terminal or editor
3. Invoke the agent by referencing its name
4. Test with representative user queries
5. Verify the permission rules behave as expected — a denied action must be refused, not prompted
6. Confirm output meets expectations

### Integration Testing

- Test agent with different file types in scope
- Verify MCP server connectivity (if configured)
- Check agent behavior with missing context
- Test error handling and edge cases
- Validate agent switching and task delegation

### Quality Checks

- Run through agent creation checklist
- Review against common mistakes list
- Compare with example agents in repository
- Get peer review for complex agents
- Document any special configuration needs

## Additional Resources

### Official Documentation

- [opencode.ai Documentation](https://opencode.ai)

### Related Files

- [Prompt Files Guidelines](./prompt.instructions.md) - For creating prompt files
- [Instructions Guidelines](./instructions.instructions.md) - For creating instruction files
- [Skill Guidelines](./agent-skill.instructions.md) - For creating skill files
- [Task Implementation Guidelines](./task-implementation.instructions.md) - For structured implementation workflow
