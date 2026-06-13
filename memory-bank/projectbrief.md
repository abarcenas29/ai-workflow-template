# Project Brief

## Purpose

`@abarcenas/ai-workflow-template` is a comprehensive template repository for AI-assisted development workflows. It provides a structured approach to leveraging AI assistance through pre-configured skills, prompts, agents, and coding standards distributed as an npm package.

## Core Goals

1. **Standardize AI-assisted development** — Provide consistent instructions, skills, and agent definitions across projects
2. **Enable multi-agent orchestration** — Support TDD, feature pipelines, and dynamic agent workflows
3. **Maintain persistent project context** — Memory bank system tracks state across AI sessions
4. **Distribute as npm package** — Teams install via npm and sync configuration to their projects
5. **Support knowledge graphs** — graphify integration for code-level relationship mapping

## Scope

- Configuration distribution (`.agents/`, `.opencode/`, `.github/`, `scripts/`)
- Agent pipeline orchestration (TDD, feature pipeline)
- Testing infrastructure (Playwright E2E, Vitest unit)
- Memory bank for cross-session context persistence
- Not a deployable application — this is developer tooling infrastructure
