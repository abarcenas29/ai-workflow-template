# Centralized Knowledgebase (pgvector MCP) — Reviewer

## Step 6: Code Quality & Security Review

**Date:** 2026-07-29
**Status:** ✅ APPROVE WITH CHANGES
**Pipeline:** Feature Pipeline (Centralized Knowledgebase — pgvector MCP)

### Summary

Performed comprehensive code quality, security, and architecture review of all knowledgebase feature files. No critical issues found (SQL injection safe, no shell injection, no credential exposure). Identified 4 major findings and 6 minor suggestions.

### Files Produced / Modified

| File | Description |
|---|---|
| (none) | Review findings documented in orchestrator log |

### Key Findings

**4 Major Issues:**
1. Missing `AI_WORKFLOW_VERBOSE` in spawn env — child process doesn't inherit verbose mode
2. CLI `--topK` validation gap — no upper bound check on `--topK` value
3. `search()` limit not clamped — raw user input passed directly as SQL LIMIT
4. CLI test comment typo — one test description references wrong method name

**6 Minor Issues:**
1. Dead code in chunking parser (unreachable branch)
2. `setEmbeddingProvider()` is a no-op stub with TODO comment
3. Post-commit hook stderr suppression hides real errors
4. Session marker ordering in chunking could be more efficient
5. MCP server display name formatting inconsistency
6. Fragile mock in tests (mock implementation tied to internal structure)

### Key Decisions

- **Approval granted with changes**: No architectural or security concerns blocking approval. Major issues are input validation and env var passthrough — straightforward fixes.
- **Security posture**: All queries use parameterized inputs (`$1`, `$2`, ...). No string interpolation for SQL. Connection string redacted in error logs. `OPENAI_API_KEY` never logged.

### Notes / Follow-up

Recommended follow-up tasks: clamp `--topK` to a sane maximum (e.g., 100), pass `AI_WORKFLOW_VERBOSE` to child processes, remove dead code in chunking parser, and implement the `setEmbeddingProvider()` stub or remove it.
