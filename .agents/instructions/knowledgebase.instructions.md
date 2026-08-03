---
applyTo: "**"
---

# Knowledgebase

You have access to a centralized knowledgebase containing learned knowledge from past
pipeline sessions across all projects that have been indexed. The knowledgebase is
powered by PostgreSQL + pgvector with semantic (cosine similarity) search.

**MANDATORY TO ATTEMPT, GRACEFUL TO FAIL:** You MUST attempt to query the knowledgebase
before planning any task, when encountering errors, and when starting work on a known
area. The attempt is mandatory — but the outcome is graceful: if the knowledgebase is
unavailable or the search errors, explicitly note the skip and continue. Never block or
fail the task because the knowledgebase is unavailable. See
`.agents/instructions/knowledge-retrieval.instructions.md` for the full protocol
including the required explicit reporting.

## MCP Tools

The knowledgebase is accessed via the `knowledgebase` MCP server configured in
`opencode.json`. The following tools are available:

| Tool | Purpose | Parameters |
|------|---------|------------|
| `knowledgebase_search` | Semantic search across learned knowledge from all indexed projects | `query` (required), `topK` (default 5), `projectId` (optional) |
| `knowledgebase_index` | Index or re-index a project's learned-knowledge.instructions.md | `projectId` (required — from `package.json` `name` field) |
| `knowledgebase_stats` | Get knowledgebase statistics (total projects, chunks, DB size) | None |
| `knowledgebase_list` | List all projects currently indexed in the knowledgebase | None |

### Tool Details

- **`knowledgebase_search`** — Use for finding relevant patterns, past decisions, and solutions.
  Returns results ranked by cosine similarity with metadata (project, date, pipeline, content).
  Results are OpenAI-compatible tool call responses with structured text content. Restart
  OpenCode after code changes to pick up updates.

- **`knowledgebase_index`** — Use to manually trigger re-indexing of a project's learned knowledge
  file. Idempotent: unchanged sessions are skipped. Typically used when the post-commit hook
  did not fire or you want to index changes before committing. The `projectId` MUST be the scoped
  package name (e.g., `@abarcenas/ai-workflow-template`), read from `package.json` `name`. This
  ensures a single canonical project per repository.

- **`knowledgebase_stats`** — Use to check whether the knowledgebase has data and how much.
  Useful for diagnosing empty results or confirming indexing worked.

- **`knowledgebase_list`** — Use to discover which projects have contributed knowledge,
  especially when searching for cross-project patterns.

## When to Query

**Always query BEFORE starting implementation work**, especially in these scenarios:

### 1. Planning Tasks

Search for past patterns, conventions, and architectural decisions relevant to the
current task. Example queries:
- "What verbose flag infrastructure exists?"
- "How are parallel batch task dependencies structured?"
- "What pattern is used for git hook templates?"

### 2. Encountering Errors

Before debugging from scratch, search for similar errors and their known resolutions.
Example queries:
- "spawnScript child process hanging silent output"
- "process.exit kills parent import module"
- "npm postinstall blocked in v12"

### 3. Making Architectural Decisions

Search for prior design decisions and their rationale before choosing an approach.
Example queries:
- "separate MCP server vs merged memory server"
- "raw SQL vs ORM for vector database"
- "post-commit vs pre-commit hook indexing"

### 4. Working with Specific Technologies

Search for tech-specific gotchas, configuration patterns, and integration notes.
Example queries:
- "child_process.spawn env var communication"
- "husky v9 programmatic API"
- "SHA-256 content hash idempotency"

### 5. Agent Tuning

If unsure about conventions or how to approach a task as a specific agent role.
Example queries:
- "what should the coder agent know about parallel batches"
- "researcher ecosystem investigation patterns"
- "tracker documentation format conventions"

## How to Query

Use natural language queries that describe the concept, problem, or pattern you are
looking for. Be specific but concise — the embedding model works best with clear,
focused queries.

**Basic query:**
```
knowledgebase_search({
    query: "how to handle verbose logging in child processes",
    topK: 5
})
```

**Filtered by project:**
```
knowledgebase_search({
    query: "TDD pipeline patterns and conventions",
    projectId: "my-app",
    topK: 5
})
```

**Finding specific error resolutions:**
```
knowledgebase_search({
    query: "npm postinstall execution blocked in v12 dependency lifecycle",
    topK: 3
})
```

**Finding agent-specific guidance:**
```
knowledgebase_search({
    query: "tracker documentation requirements and format for pipeline sessions",
    topK: 5
})
```

### Query Patterns by Use Case

| Use Case | What to search for | Example |
|----------|-------------------|---------|
| **Error resolution** | Error message keywords, component names, symptom descriptions | "spawnScript hangs silent output capture" |
| **Implementation approach** | Pattern names, technology names, architecture terms | "hash-based manifest sync namespace" |
| **Conventions** | Project-specific terms, file naming, code structure | "hook marker comment idempotency" |
| **Historical decisions** | Decision topic, alternative names, trade-off terms | "co-location constraint sync dependencies" |
| **Agent behavior** | Agent role name, task type, pipeline stage | "parallel coder batch dependency ordering" |

## How to Interpret Results

Results are ranked by cosine similarity score (0.0–1.0, higher = more relevant):

| Score Range | Interpretation | Action |
|-------------|---------------|--------|
| **≥ 0.85** | Highly relevant — directly applicable knowledge | Apply without reservation. This knowledge addresses your query. |
| **0.70–0.84** | Relevant — related context that may inform your approach | Review carefully. May contain useful patterns with adaptation. |
| **< 0.70** | Tangentially related — use with discretion | Consider as background context. Verify applicability before applying. |

Each result includes these fields:

- **`project`**: Which project the knowledge came from (package.json `name`). Cross-project
  results are valuable — they may contain patterns not yet used in your current project.
- **`date`**: When the session occurred. More recent knowledge (within 30 days) is generally
  more applicable due to evolving project conventions.
- **`pipeline`**: What pipeline type generated the knowledge (TDD, Feature, Research, etc.).
  Helps assess whether the knowledge came from a similar workflow context.
- **`content`**: The actual "New knowledge" bullets — the learned insights. May include
  multiple lines per session.

**More results ≠ better:** If the top result has similarity ≥ 0.85 and directly answers
your question, you do not need to examine lower-ranked results. If all results are below
0.70, refine your query with more specific terminology before proceeding.

## Graceful Degradation (Mandatory to Attempt, Graceful to Fail)

Querying the knowledgebase is **mandatory to attempt** but **graceful to fail** — it
requires a PostgreSQL database with pgvector extension. If the MCP server is
unavailable, `DATABASE_URL` is not configured, or the search call errors:

1. **Do NOT block or fail** — Proceed with your task without the knowledgebase.
2. **Explicitly report the skip** — Note in your reasoning and final summary:
   "knowledgebase_search NOT executed (PG vector unavailable)."
3. **Fall back to memory-bank** — Use `memory_search` and `memory_get` for local context.
4. **Proceed normally** — The knowledgebase is an enhancement, not a dependency.

On a **successful** search, explicitly report the outcome in your reasoning and final
summary: "knowledgebase_search executed — N results returned." (N = number of results returned.)

This explicit-report protocol is the canonical graceful-failure contract defined in
`.agents/instructions/knowledge-retrieval.instructions.md`.

The MCP tools return descriptive messages when the database is unavailable:
- `knowledgebase_search` → "Knowledgebase not available: DATABASE_URL is not configured."
- `knowledgebase_index` → "Knowledgebase not available: DATABASE_URL is not configured."
- `knowledgebase_stats` → Returns zero counts (not an error).
- `knowledgebase_list` → Returns empty list (not an error).

### MCP Server Restart After Configuration Changes

When `mcp-knowledgebase-server.js` is updated (e.g., a threshold fix or handler change), the
MCP server process spawned by OpenCode may hold a stale copy. **After any code change to the
knowledgebase server or scripts, restart OpenCode** (or reload MCP servers) to pick up the
latest version. Common gotcha: `knowledgebase_search` returns 0 results despite chunks in the
DB because the MCP process is using an old threshold default. Restart resolves this.

## When NOT to Query

Do NOT use the knowledgebase for:

- **Project-specific file paths or configuration** — Use the memory bank (`memory_search`,
  `memory_get`) or read the actual files.
- **Current task status or active work tracking** — Use `memory-bank/activeContext.md`,
  `memory-bank/progress.md`, or the tasks index.
- **Code implementation details** — Read the actual source files or use the graphify
  knowledge graph (`graphify query`, `graphify explain`).
- **Runtime state or environment variables** — These are ephemeral and project-specific.
- **Sensitive credentials or secrets** — Never query for passwords, API keys, tokens,
  or connection strings.

## Relationship to Memory Bank

The knowledgebase and memory bank serve complementary but distinct roles:

| Aspect | Knowledgebase (storage Tier 3) | Memory Bank (storage Tier 2) |
|--------|------------------------|----------------------|
| **Scope** | Cross-project — all indexed projects | Per-project — current project only |
| **Content** | Learned patterns, conventions, gotchas | Current state, tasks, architecture |
| **Persistence** | PostgreSQL + pgvector (external) | SQLite + sqlite-vec (embedded, filesystem) |
| **Availability** | Optional — requires DATABASE_URL | Always available |
| **Update trigger** | Post-commit hook + manual index | Memory update on session start + after changes |
| **Query style** | Semantic (cosine similarity) | Semantic + full file reads |

**Think of the knowledgebase as "what we've learned across all projects" and the memory
bank as "what's happening right now in this project."**

The storage hierarchy is a **storage-tier** taxonomy (Tier 1 → Tier 3), distinct from the
**retrieval-layer** numbering (L1 → L3) used in
`.agents/instructions/knowledge-retrieval.instructions.md`:

```
Tier 3: Knowledgebase → Cross-project learned patterns (PostgreSQL + pgvector)
Tier 2: Memory Bank  → Per-project current state (SQLite + sqlite-vec)
Tier 1: Markdown     → Git-committed source of truth (filesystem)
```

When you start a session, follow the protocol in
`.agents/instructions/knowledge-retrieval.instructions.md` for the complete 3-layer
retrieval order (memory-bank → learned-knowledge → knowledgebase_search → project files).

## Closed-Loop Workflow

The knowledgebase enables a continuous learning cycle:

```
1. Agent completes task
2. Appends new insights to learned-knowledge.instructions.md
3. Developer commits → post-commit hook triggers sync
4. Knowledge is indexed in PostgreSQL + pgvector
5. Future agents query knowledgebase before planning
6. Learn from past sessions → produce better output
7. Append new knowledge → cycle repeats
```

Each iteration improves all subsequent agent outputs by surfacing relevant past
experience automatically.
