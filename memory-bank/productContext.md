# Product Context

## Problem

AI-assisted development tools (like GitHub Copilot, OpenCode) benefit from structured context — standardized instructions, reusable skills, and specialized agent definitions. Without a shared template, each project reinvents these configurations, leading to inconsistency, duplicated effort, and missed opportunities for agent orchestration.

## Solution

This template provides a battle-tested foundation for AI-assisted development:

- **Instructions** define coding standards, language conventions, and workflow patterns
- **Skills** encapsulate reusable task-based workflows (commit, explore, test generation)
- **Agents** define specialized AI roles with clear responsibilities (implementer, tester, reviewer)
- **Orchestrators** coordinate multi-agent pipelines (TDD RED→GREEN→REFACTOR, feature pipeline)
- **Memory Bank** persists project context across AI sessions, preventing knowledge loss
- **graphify** provides a queryable knowledge graph for code-level relationship understanding

## UX Goals

- **Seamless install** — `npm install` triggers automatic sync to project
- **Zero-config start** — All agent pipelines work out of the box
- **Self-documenting** — Instructions explain conventions, agents document their work
- **Session-resilient** — Memory bank survives AI context resets
- **Extensible** — Teams can add custom agents, skills, and instructions without conflicts
