---
description: "Guidelines for creating custom agent files for opencode"
applyTo: "**/*.agent.md"
---

# Custom Agent File Guidelines

Instructions for creating effective and maintainable custom agent files that provide specialized expertise for specific development tasks in opencode.

## Project Context

- Target audience: Developers creating custom agents for opencode
- File format: Markdown with YAML frontmatter
- File naming convention: lowercase with hyphens (e.g., `test-specialist.agent.md`)
- Location: `.agents/agents/` directory (repository-level) or `.opencode/agents/` directory
- Purpose: Define specialized agents with tailored expertise, tools, and instructions for specific tasks
- Official documentation: [opencode.ai](https://opencode.ai)

## Required Frontmatter

Every agent file must include YAML frontmatter with the following fields:

```yaml
---
description: "Brief description of the agent purpose and capabilities"
name: "Agent Display Name"
tools: ["Read", "Edit", "Grep"]
---
```

### Core Frontmatter Properties

#### **description** (REQUIRED)

- Single-quoted string, clearly stating the agent's purpose and domain expertise
- Should be concise (50-150 characters) and actionable
- Example: `'Focuses on test coverage, quality, and testing best practices'`

#### **name** (OPTIONAL)

- Display name for the agent
- If omitted, defaults to filename (without `.md` or `.agent.md`)
- Use title case and be descriptive
- Example: `'Testing Specialist'`

#### **tools** (OPTIONAL)

- List of tool names the agent can use
- Supports YAML array format
- If omitted, agent has access to all available tools
- See "Tool Configuration" section below for details

## Tool Configuration

### Tool Specification Strategies

**Enable all tools** (default):

```yaml
# Omit tools property entirely, or use:
tools: ["*"]
```

**Enable specific tools**:

```yaml
tools: ["Read", "Edit", "Grep", "Bash"]
```

**Enable MCP server tools**:

```yaml
tools: ["Read", "Edit", "github/*", "playwright/navigate"]
```

**Disable all tools**:

```yaml
tools: []
```

### Standard opencode Tools

All tool names are case-sensitive:

| Tool          | Category         | Description                                   |
| ------------- | ---------------- | --------------------------------------------- |
| `Bash`        | Shell execution  | Execute shell commands in the terminal        |
| `Read`        | File reading     | Read file contents                            |
| `Write`       | File editing     | Write or create new files                     |
| `Edit`        | File editing     | Modify existing files via string replacement  |
| `Grep`        | Code search      | Search file contents using regular expressions |
| `Glob`        | File search      | Find files by glob patterns                   |
| `Task`        | Sub-agent        | Invoke other agents with subtasks             |
| `TodoWrite`   | Task management  | Create and manage task items for tracking     |
| `Skill`       | Skill loader     | Load specialized skill instructions           |
| `WebFetch`    | Web access       | Fetch and read web content                    |
| `WebSearch`   | Web access       | Search the web (requires configured MCP)      |

### MCP Server Tools

MCP servers configured in `opencode.json` are available as tools:

```yaml
tools: ['github/*']           # All GitHub MCP tools
tools: ['playwright/navigate'] # Specific Playwright MCP tool
```

The `tools` entry format for MCP tools is `server-name/tool-name`, matching the MCP server name in your `opencode.json` configuration.

### Tool Selection Best Practices

- **Principle of Least Privilege**: Only enable tools necessary for the agent's purpose
- **Security**: Limit `Bash` access unless explicitly required
- **Focus**: Fewer tools = clearer agent purpose and better performance
- **Documentation**: Comment why specific tools are required for complex configurations

## Sub-Agent Invocation (Agent Orchestration)

Agents can invoke other agents using the **`Task` tool** to orchestrate multi-step workflows.

The recommended approach is **prompt-based orchestration**:

- The orchestrator defines a step-by-step workflow in natural language.
- Each step is delegated to a specialized agent.
- The orchestrator passes only the essential context (e.g., base path, identifiers) and requires each sub-agent to read its own `.agent.md` spec for tools/constraints.

### How It Works

1. Enable agent invocation by including `Task` in the orchestrator's tools list:

```yaml
tools: ["Read", "Edit", "Grep", "Task"]
```

2. For each step, invoke a sub-agent by providing:

- **Agent name** (the identifier users select/invoke)
- **Agent spec path** (the `.agent.md` file to read and follow)
- **Minimal shared context** (e.g., base path, project name, log file)

### Prompt Pattern (Recommended)

Use a consistent "wrapper prompt" for every step so sub-agents behave predictably:

```text
This phase must be performed as the agent "<AGENT_NAME>" defined in "<AGENT_SPEC_PATH>".

IMPORTANT:
- Read and apply the entire .agent.md spec (tools, constraints, quality standards).
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
Spec: .agents/agents/data-processor.agent.md
Context: projectName, basePath
Input: basePath/raw/
Output: basePath/processed/
Expected: write basePath/processed/summary.md

Step 2: Analyze processed data (depends on Step 1 output)
Agent: data-analyst
Spec: .agents/agents/data-analyst.agent.md
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

### ⚠️ Tool Availability Requirement

**Critical**: If a sub-agent requires specific tools (e.g., `Edit`, `Bash`, `Grep`), the orchestrator must include those tools in its own `tools` list. Sub-agents cannot access tools that aren't available to their parent orchestrator.

**Example**:

```yaml
# If your sub-agents need to edit files, execute commands, or search code
tools: ["Read", "Edit", "Grep", "Bash", "Task"]
```

The orchestrator's tool permissions act as a ceiling for all invoked sub-agents. Plan your tool list carefully to ensure all sub-agents have the tools they need.

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
This phase must be performed as the agent "documentation-writer" defined in ".agents/agents/documentation-writer.agent.md".

IMPORTANT:
- Read and apply the entire .agent.md spec.
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

2. Invoke specialized agents sequentially (each agent reads its own `.agent.md` spec):

```text
Step 1: Security Review
Agent: security-reviewer
Spec: .agents/agents/security-reviewer.agent.md
Context: repository name, PR number, base path
Output: security-review.md

Step 2: Test Coverage
Agent: test-coverage
Spec: .agents/agents/test-coverage.agent.md
Context: repository name, PR number, base path
Output: coverage-report.md

Step 3: Aggregate
Agent: review-aggregator
Spec: .agents/agents/review-aggregator.agent.md
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

- Location: `.agents/agents/` or `.opencode/agents/`
- Scope: Available only in the specific repository
- Access: Uses repository-configured MCP servers from `opencode.json`

### Naming Conventions

- Use lowercase with hyphens: `test-specialist.agent.md`
- Name should reflect agent purpose
- Filename becomes default agent name (if `name` not specified)
- Allowed characters: `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`

## Agent Creation Checklist

### Frontmatter

- [ ] `description` field present and descriptive (50-150 chars)
- [ ] `description` wrapped in single quotes
- [ ] `name` specified (optional but recommended)
- [ ] `tools` configured appropriately (or intentionally omitted)

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
- [ ] File placed in correct directory (`.agents/agents/` or `.opencode/agents/`)
- [ ] Filename uses only allowed characters
- [ ] File extension is `.agent.md`

### Quality Assurance

- [ ] Agent purpose is unique and not duplicative
- [ ] Tools are minimal and necessary
- [ ] Instructions are clear and unambiguous
- [ ] Agent has been tested with representative tasks
- [ ] Documentation references are current
- [ ] Security considerations addressed (if applicable)

## Common Agent Patterns

### Testing Specialist

**Purpose**: Focus on test coverage and quality
**Tools**: All tools (for comprehensive test creation)
**Approach**: Analyze, identify gaps, write tests, avoid production code changes

### Implementation Planner

**Purpose**: Create detailed technical plans and specifications
**Tools**: Limited to `['Read', 'Grep', 'Write']`
**Approach**: Analyze requirements, create documentation, avoid implementation

### Code Reviewer

**Purpose**: Review code quality and provide feedback
**Tools**: `['Read', 'Grep']` only
**Approach**: Analyze, suggest improvements, no direct modifications

### Refactoring Specialist

**Purpose**: Improve code structure and maintainability
**Tools**: `['Read', 'Grep', 'Edit']`
**Approach**: Analyze patterns, propose refactorings, implement safely

### Security Auditor

**Purpose**: Identify security issues and vulnerabilities
**Tools**: `['Read', 'Grep', 'WebFetch']`
**Approach**: Scan code, check against OWASP, report findings

## Common Mistakes to Avoid

### Frontmatter Errors

- ❌ Missing `description` field
- ❌ Description not wrapped in quotes
- ❌ Invalid tool names without checking documentation
- ❌ Incorrect YAML syntax (indentation, quotes)

### Tool Configuration Issues

- ❌ Granting excessive tool access unnecessarily
- ❌ Missing required tools for agent's purpose
- ❌ Using tool aliases from other platforms instead of opencode tool names
- ❌ Forgetting MCP server namespace (`server-name/tool`)

### Prompt Content Problems

- ❌ Vague, ambiguous instructions
- ❌ Conflicting or contradictory guidelines
- ❌ Lack of clear scope definition
- ❌ Missing output expectations
- ❌ Overly verbose instructions (exceeding character limits)
- ❌ No examples or context for complex tasks

### Organizational Issues

- ❌ Filename doesn't reflect agent purpose
- ❌ Wrong directory (using `.github/agents/` instead of `.agents/agents/`)
- ❌ Using spaces or special characters in filename
- ❌ Duplicate agent names causing conflicts

## Testing and Validation

### Manual Testing

1. Create the agent file with proper frontmatter
2. Open opencode in your terminal or editor
3. Invoke the agent by referencing its name
4. Test with representative user queries
5. Verify tool access works as expected
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
