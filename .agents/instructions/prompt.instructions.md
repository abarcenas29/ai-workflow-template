---
description: "Guidelines for creating high-quality prompt files for opencode"
applyTo: "**/*.prompt.md"
---

# opencode Prompt Files Guidelines

Instructions for creating effective and maintainable prompt files that guide the AI assistant in delivering consistent, high-quality outcomes across any repository.

## Scope and Principles

- Target audience: maintainers and contributors authoring reusable prompts for opencode.
- Goals: predictable behaviour, clear expectations, minimal permissions, and portability across repositories.
- Primary references: opencode documentation on prompt files and organization-specific conventions.

## Frontmatter Requirements

Every prompt file should include YAML frontmatter with the following fields:

### Required/Recommended Fields

| Field         | Required    | Description                                                                             |
| ------------- | ----------- | --------------------------------------------------------------------------------------- |
| `description` | Recommended | A short description of the prompt (single sentence, actionable outcome)                 |
| `name`        | Optional    | The name shown when invoking the prompt. Defaults to filename if not specified          |

### Guidelines

- Use consistent quoting (single quotes recommended) and keep one field per line for readability and version control clarity
- Preserve any additional metadata (`language`, `tags`, `visibility`, etc.) required by your organization
- opencode prompts have a simpler frontmatter model than other platforms; avoid adding tool, model, or agent fields that are not supported

## File Naming and Placement

- Use kebab-case filenames ending with `.prompt.md` and store them under `.agents/prompts/` unless your workspace standard specifies another directory.
- Provide a short filename that communicates the action (for example, `generate-readme.prompt.md` rather than `prompt1.prompt.md`).

## Body Structure

- Start with an `#` level heading that matches the prompt intent so it surfaces well in search.
- Organize content with predictable sections. Recommended baseline: `Mission` or `Primary Directive`, `Scope & Preconditions`, `Inputs`, `Workflow` (step-by-step), `Output Expectations`, and `Quality Assurance`.
- Adjust section names to fit the domain, but retain the logical flow: why → context → inputs → actions → outputs → validation.
- Reference related prompts or instruction files using relative links to aid discoverability.

## Input and Context Handling

- Describe required inputs clearly in prose (for example, "The user must supply a file path to the target component"). When optional, specify defaults or how the prompt should infer the value.
- Reference file paths and workspace context explicitly rather than relying on implicit contextual variables. If the prompt needs a specific file, state the expected path or pattern (for example, "Look for `src/config/*.ts` and use the first match").
- Document how to proceed when mandatory context is missing (for example, "Request the file path and stop if it remains undefined").

## Tool and Permission Guidance

- opencode provides the following tools: `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Task`, `TodoWrite`, `Skill`, `WebFetch`, `WebSearch`, among others. Limit tool usage to the smallest set that enables the task.
- If the prompt expects the assistant to run shell commands, explicitly name `Bash` as a required tool. For file inspection, prefer `Read` and `Grep` over shell-based alternatives.
- Warn about destructive operations (file creation, edits, terminal commands) and include guard rails or confirmation steps in the workflow.
- When the prompt depends on a specific skill, reference it by name so the assistant can load it via the `Skill` tool.

## Instruction Tone and Style

- Write in direct, imperative sentences targeted at the AI assistant (for example, "Analyze", "Generate", "Summarize").
- Keep sentences short and unambiguous, following Google Developer Documentation translation best practices to support localization.
- Avoid idioms, humor, or culturally specific references; favor neutral, inclusive language.

## Output Definition

- Specify the format, structure, and location of expected results (for example, "Create `docs/adr/adr-XXXX.md` using the template below").
- Include success criteria and failure triggers so the assistant knows when to halt or retry.
- Provide validation steps—manual checks, automated commands, or acceptance criteria lists—that reviewers can execute after running the prompt.

## Examples and Reusable Assets

- Embed Good/Bad examples or scaffolds (Markdown templates, JSON stubs) that the prompt should produce or follow.
- Maintain reference tables (capabilities, status codes, role descriptions) inline to keep the prompt self-contained. Update these tables when upstream resources change.
- Link to authoritative documentation instead of duplicating lengthy guidance.

## Quality Assurance Checklist

- [ ] Frontmatter fields are complete, accurate, and least-privilege.
- [ ] Inputs include default behaviours and fallbacks for missing context.
- [ ] Workflow covers preparation, execution, and post-processing without gaps.
- [ ] Output expectations include formatting and storage details.
- [ ] Validation steps are actionable (commands, diff checks, review prompts).
- [ ] Security, compliance, and privacy policies referenced by the prompt are current.
- [ ] Prompt executes successfully in opencode using representative scenarios.

## Maintenance Guidance

- Version-control prompts alongside the code they affect; update them when dependencies, tooling, or review processes change.
- Review prompts periodically to ensure tool references, linked documents, and workspace conventions remain valid.
- Coordinate with other repositories: when a prompt proves broadly useful, extract common guidance into instruction files or shared prompt packs.

## Additional Resources

- [opencode Documentation](https://opencode.ai)
