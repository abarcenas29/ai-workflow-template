---
applyTo: "**"
---

# Knowledge Retrieval Protocol

Every agent MUST follow this 3-layer protocol before planning, deciding, or implementing.
This protocol is **mandatory to attempt** but **graceful to fail** — no layer is a hard dependency.

## Layer 1: Memory Bank (always available — embedded SQLite)

Read `.agents/instructions/memory-bank.instructions.md`. Use `memory_bank_memory_search`
for semantic context retrieval and `memory_bank_memory_get` for full file reads.

## Layer 2: Learned Knowledge (always available — git-committed markdown)

Skim `.agents/instructions/learned-knowledge.instructions.md` for patterns, conventions,
gotchas, and agent tuning notes relevant to your role and current task. Focus on sessions
that match your pipeline type and agent role.

## Layer 3: Cross-Project Knowledgebase (graceful — requires PG + pgvector)

Call `knowledgebase_knowledgebase_search` (MCP) with a task-relevant query.

**This is mandatory to ATTEMPT, but graceful to fail:**

| Outcome | Required Action |
|---------|----------------|
| **Success** | Explicitly note in your reasoning and final summary: "knowledgebase_search executed — N results returned." |
| **Error / Unavailable** | Explicitly note: "knowledgebase_search NOT executed (PG vector unavailable)." Do NOT block, fail, or retry. Proceed normally. |

### Graceful Failure Wrapper

```
try {
  const results = await knowledgebase_knowledgebase_search({
    query: "<task-relevant query>",
    topK: 5
  });
  // Note: "knowledgebase_search executed — N results returned."
  // Use results to inform your approach
} catch (err) {
  // Note: "knowledgebase_search NOT executed (PG vector unavailable)."
  // Proceed with the task using memory-bank + learned-knowledge only
}
```

**Your final output summary MUST state which outcome occurred ("accessed" or "skipped").
This disclosure is not optional — every agent response must include it.**

### Canonical projectId

When calling `knowledgebase_knowledgebase_index`, the `projectId` parameter MUST equal
`require('./package.json').name` — the scoped package name if one exists (e.g.,
`@abarcenas/ai-workflow-template`). Never derive projectId from directory names,
orchestrator context, or display strings. The `package.json` `name` field is the
single source of truth.

When calling `knowledgebase_knowledgebase_search`, `projectId` is optional — omitting
it searches across all indexed projects (cross-project match-all). If you do pass one,
derive it from `package.json` `name` the same way.

## Retrieval Order

1. Memory bank (`memory_bank_memory_search` + `memory_bank_memory_get`)
2. Learned knowledge (skim `.agents/instructions/learned-knowledge.instructions.md`)
3. Knowledgebase (`knowledgebase_knowledgebase_search` with graceful failure)
4. Project files (read specific source files as needed)
5. Proceed with the task
