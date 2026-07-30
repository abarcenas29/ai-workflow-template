# Centralized Knowledgebase (pgvector MCP) — Researcher

## Step 1: Technical Investigation — pgvector Embedding Strategies & MCP Patterns

**Date:** 2026-07-29
**Status:** ✅ SUCCESS
**Pipeline:** Feature Pipeline (Centralized Knowledgebase — pgvector MCP)

### Summary

Conducted exhaustive research into embedding providers, pgvector Node.js libraries, MCP server patterns, chunking strategies, git hook integration, and consumer bootstrap flows. Evaluated 5 embedding models across cost/latency/quality dimensions (local all-MiniLM-L6-v2 at $0/12ms vs OpenAI text-embedding-3-small at $0.02/1M tokens/200-400ms). Discovered that industry benchmarks (SynaBun, Local AI Master) confirm the existing `@xenova/transformers` + `all-MiniLM-L6-v2` stack is sufficient for <<10k chunks. Recommended separate MCP server, session-level chunking, post-commit hook, and a new Phase 6 in the setup pipeline.

### Files Produced / Modified

| File | Description |
|---|---|
| `docs/spike-centralized-knowledgebase-pgvector.md` | Comprehensive research spike — 828 lines, 9 sections covering embedding comparison, pgvector libraries, MCP patterns, chunking, hooks, and bootstrap |

### Key Decisions

- **Default embedding model**: `all-MiniLM-L6-v2` (384d) via `@xenova/transformers` — already in project, zero cost, ~12ms latency. OpenAI `text-embedding-3-small` documented as upgrade path.
- **Separate MCP server**: Knowledgebase gets its own MCP server (not merged with memory-bank) — different database lifecycle, failure modes, and availability guarantees.
- **Chunking by session**: Split `learned-knowledge.instructions.md` by `## Session:` headers; embed only "New knowledge" bullets; store 7 metadata fields per chunk as database columns.
- **Post-commit hook**: New `.husky/post-commit` follows existing post-merge pattern. Detects changes via `git diff HEAD~1`. Zero changes needed to `hooks.js`.
- **Setup Phase 6**: New `setup/knowledgebase.js` module registered after Phase 5 (Sync). Graceful degradation when `DATABASE_URL` not set.
- **Files to create (6)**: `knowledgebase-index.js`, `knowledgebase-cli.js`, `mcp-knowledgebase-server.js`, `setup/knowledgebase.js`, `.husky/post-commit`, `knowledgebase.instructions.md`
- **Files to modify (6)**: `constants.js`, `sync.js`, `setup/index.js`, `opencode.json`, `package.json`, `.env.example`

### Notes / Follow-up

Research confirmed the existing project stack (`@xenova/transformers`, `@modelcontextprotocol/sdk`, dotenv, ESM) already covers all dependencies for the knowledgebase feature. The `pg` and `pgvector` npm packages are the only new additions needed (as optional dependencies).
