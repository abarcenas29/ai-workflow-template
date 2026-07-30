# Centralized Knowledgebase (pgvector MCP) — Architect

## Step 2: Architecture Design — ADR-001

**Date:** 2026-07-29
**Status:** ✅ SUCCESS
**Pipeline:** Feature Pipeline (Centralized Knowledgebase — pgvector MCP)

### Summary

Designed the complete architecture for a centralized knowledgebase module using PostgreSQL + pgvector as the third layer in the project's knowledge system (Markdown source of truth → SQLite local memory bank → PostgreSQL centralized). Produced `docs/adr-knowledgebase-pgvector.md` (~1344 lines, 10 sections) covering database schema, module design, connection strategy, MCP interface, chunking pipeline, setup integration, git hooks, and agent instructions.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/adr-knowledgebase-pgvector.md` | Architecture Decision Record — full system design with DDL schemas, module interfaces, MCP tool definitions, data flow diagrams |

### Key Decisions

- **Separate MCP server**: Different DB lifecycle than memory-bank. Follows existing multi-server pattern (9 servers already in `opencode.json`).
- **`pg` + raw SQL**: Only ~4 query types needed (insert, search, stats, list). Raw SQL matches `memory-index.js` patterns and gives full control over pgvector-specific operators (`<=>`, HNSW creation).
- **`all-MiniLM-L6-v2` (384d)**: Already an optional dependency, zero cost, sufficient for <<10k chunks. OpenAI upgrade path documented.
- **Post-commit hook**: Needs committed content. Matches post-merge pattern. Always exits 0 — never blocks commits.
- **Graceful degradation**: Knowledgebase is optional — never blocks setup or normal operation. All operations become no-ops when `DATABASE_URL` is unset.
- **Schema**: `projects` table (id TEXT PK, name, timestamps) + `knowledge_chunks` table (BIGSERIAL PK, project_id FK, session metadata, content TEXT, content_hash TEXT, VECTOR(384), indexed_at). HNSW index with m=16, ef_construction=64. Composite UNIQUE on (project_id, session_date, content_hash) for idempotency.
- **Key Risk**: `CREATE EXTENSION vector` needs superuser — auto-provision catches and directs to manual init script. Supabase/Neon pre-install pgvector.

### Notes / Follow-up

The ADR explicitly documents that the knowledgebase complements but does not replace the memory bank. The three layers serve different purposes: markdown files are the git-committed source of truth, SQLite provides fast per-project semantic search, and PostgreSQL enables cross-project knowledge sharing.
