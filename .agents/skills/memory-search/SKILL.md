---
description: "Search project memory bank using semantic vector search"
name: "memory-search"
---

# Memory Search Skill

Use this skill to retrieve project context from the memory bank without loading all files into context.

## When to Use

- At the start of a session: search for current project focus and recent changes
- Before making a decision: search for related past decisions
- When stuck: search for architectural patterns or known issues
- After writing to memory-bank: run `memory_rebuild` to update the index

## Available MCP Tools

This skill uses the `memory-bank` MCP server, configured in `opencode.json`:

| Tool | Purpose |
|---|---|
| `memory_search` | Semantic search across all memory-bank and docs files |
| `memory_update` | Incremental sync — only changed files (~2 seconds). Use daily. |
| `memory_rebuild` | Full rebuild (rare — fresh clone, corrupted index) |
| `memory_get` | Read a specific memory file by name |
| `memory_stats` | Get index statistics (vector count, file count, DB size) |

## Workflow

### Session Start

1. Run `memory_stats` to check if the index is populated
2. If empty, run `memory_rebuild`; otherwise, run `memory_update`
3. Search for current context: `memory_search({ query: "current focus recent changes next steps" })`

### During Tasks

- Before implementing: `memory_search({ query: "<topic>", topK: 5 })` for related decisions
- When writing to memory-bank: update files, then run `memory_update`
- For full file content: `memory_get({ file: "activeContext" })`

### After Git Pull

The `post-merge` hook runs `memory:update` automatically if memory-bank files changed.

### Search Tips

- **Be specific**: "TDD orchestrator bootstrap prerequisites" gets better results than "project"
- **Use contextual terms**: Include entity names (vitest, playwright, graphify) from the vocabulary
- **Filter by file**: `memory_search({ query: "...", sourceFile: "systemPatterns" })` to narrow scope
- **Top-K tuning**: Use `topK: 3` for focused queries, `topK: 10` for broad exploration

## Vocabulary Reference

See `memory-bank/.vocabulary.json` for the full controlled vocabulary. Key tags:

- **Agent roles**: orchestrator, coder, reviewer, tracker, architect, researcher
- **Workflow**: tdd, feature-pipeline, bootstrap, configuration, refactor, migration
- **Memory ops**: decision, discovery, status-update, task-plan, retrospective
- **Technologies**: typescript, vitest, playwright, graphify, mcp, sqlite-vec

## Manual CLI (for debugging)

```bash
node scripts/memory-cli.js search "tdd orchestrator"
node scripts/memory-cli.js rebuild
node scripts/memory-cli.js stats
```
