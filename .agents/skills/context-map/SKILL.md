---
name: context-map
description: "Generate a map of all files relevant to a task before making changes"
---

# Context Map

> **Wired into:** `architecture-blueprint-generator` loads this skill as its pre-discovery step to build a scoped file-level map before generating the full blueprint.
> **Graphify:** All discovery uses `graphify query`, `graphify path`, and `graphify explain` against `graphify-out/graph.json`. Grep/glob are fallbacks only.

Before implementing any changes, analyze the codebase and create a context map.

## Task

{{task_description}}

## Instructions

### Graphify-First Discovery

1. **Bootstrap graph if needed:** Check `graphify-out/graph.json`. If missing, run `graphify .` first. The graph provides relationship data that grep alone cannot discover.

2. **Discover related files:** Use `graphify query "{{task_description}}"` to find files and nodes relevant to the task. For multi-concept tasks, run separate queries per concept and merge results.

3. **Identify direct dependencies:** Use `graphify path "<source>" "<target>"` between key components to trace dependency chains. This reveals import/export relationships without scanning every file.

4. **Find related tests:** Use `graphify query "test spec <task_keywords>"` to surface test files connected to the relevant components.

5. **Discover similar patterns:** Use `graphify explain "<pattern_or_component>"` to find existing implementations and connected nodes that follow the same pattern.

### Fallback (graphify unavailable or no results)

If `graphify-out/graph.json` is missing and cannot be generated, or queries return no results:

1. Search the codebase for files related to this task (grep/glob)
2. Identify direct dependencies (imports/exports via grep)
3. Find related tests (glob `**/*.test.*` / `**/*.spec.*`)
4. Look for similar patterns in existing code (grep for class/function patterns)

### Post-Generation

After the context map is created, run `graphify update .` to sync the graph with any newly identified relationships. This keeps future context-map invocations efficient.

## Output Format

```markdown
## Context Map

### Files to Modify

| File         | Purpose     | Changes Needed |
| ------------ | ----------- | -------------- |
| path/to/file | description | what changes   |

### Dependencies (may need updates)

| File        | Relationship                 |
| ----------- | ---------------------------- |
| path/to/dep | imports X from modified file |

### Test Files

| Test         | Coverage                     |
| ------------ | ---------------------------- |
| path/to/test | tests affected functionality |

### Reference Patterns

| File            | Pattern           |
| --------------- | ----------------- |
| path/to/similar | example to follow |

### Risk Assessment

- [ ] Breaking changes to public API
- [ ] Database migrations needed
- [ ] Configuration changes required
```

Do not proceed with implementation until this map is reviewed.
