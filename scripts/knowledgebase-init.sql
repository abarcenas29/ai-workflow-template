-- ═══════════════════════════════════════════════════════════════════════════
-- knowledgebase-init.sql — Manual Database Provisioning Script
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Purpose:
--   Creates the PostgreSQL + pgvector schema for the centralized
--   cross-project knowledgebase. This is the MANUAL fallback when
--   auto-provision via knowledgebase-index.js fails due to insufficient
--   superuser privileges for CREATE EXTENSION vector.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/knowledgebase-init.sql
--
-- Auto-provision fallback:
--   The core engine (knowledgebase-index.js) attempts the same DDL
--   programmatically via pg.Pool.query(). If it fails on CREATE EXTENSION
--   (common on managed PostgreSQL where you lack superuser), the error
--   message directs you to run this script manually.
--
-- Requirements:
--   - PostgreSQL 16+ with pgvector extension installed
--   - A user with CREATEROLE or superuser for CREATE EXTENSION
--   - A database already created (e.g. createdb knowledgebase)
--
-- Schema:
--   Two tables with HNSW vector index for cosine similarity search.
--   See docs/adr-knowledgebase-pgvector.md §2 for full design rationale.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1. Extension ══════════════════════════════════════════════════════════
-- Requires superuser privileges. On managed PostgreSQL (Supabase, Neon,
-- Aiven, etc.), pgvector is typically pre-installed. If you see:
--   ERROR: permission denied to create extension "vector"
-- ask your database admin to run: CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;

-- ══ 2. Projects table ═════════════════════════════════════════════════════
-- Each consumer project is registered once. The project_id is derived from
-- the consumer's package.json "name" field, which is stable across sessions
-- and unique within an organization.

CREATE TABLE IF NOT EXISTS projects (
    id                  TEXT PRIMARY KEY,          -- package.json "name" field (e.g. "my-consumer-app")
    name                TEXT NOT NULL,             -- human-readable display name
    first_indexed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_indexed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══ 3. Knowledge chunks table ════════════════════════════════════════════
-- Each row represents one session's "New knowledge" bullet set from a
-- learned-knowledge.instructions.md file. Content is embedded using
-- all-MiniLM-L6-v2 (384 dimensions) for cosine similarity search.
--
-- The uq_knowledge_chunk constraint ensures idempotency: re-indexing the
-- same project + session + content produces no duplicates.

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id              BIGSERIAL PRIMARY KEY,
    project_id      TEXT            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_date    DATE            NOT NULL,                        -- from ## Session: heading
    session_title   TEXT,                                             -- full heading text (e.g. "Session: 2026-07-24 — Feature Pipeline")
    pipeline        TEXT,                                             -- from **Pipeline:** field
    coverage        TEXT,                                             -- from **Coverage:** field
    tdd_iterations  INTEGER         NOT NULL DEFAULT 0,               -- from **TDD Iterations:** field
    content         TEXT            NOT NULL,                        -- the "New knowledge" bullet text
    content_hash    TEXT            NOT NULL,                        -- SHA-256(content + session_date + pipeline)
    embedding       VECTOR(384),                                     -- from all-MiniLM-L6-v2 (384d)
    indexed_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Idempotency: same project + session date + content hash → skip silently
    CONSTRAINT uq_knowledge_chunk UNIQUE (project_id, session_date, content_hash)
);

-- ══ 4. Indexes ═══════════════════════════════════════════════════════════

-- ── 4a. HNSW index for approximate nearest neighbor (ANN) search ─────────
-- Enables fast cosine similarity lookups (~1ms for 10k vectors).
-- Uses vector_cosine_ops operator class for the <=> (cosine distance) operator.
-- Parameters:
--   m = 16              — max connections per element (higher = more accurate but slower build)
--   ef_construction = 64 — dynamic candidate list size during build

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ── 4b. B-tree indexes for structured queries and filters ────────────────

-- Filter knowledge by project (used by knowledgebase_search tool)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project_id
    ON knowledge_chunks (project_id);

-- Temporal queries: "show me knowledge from the last month"
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_session_date
    ON knowledge_chunks (session_date DESC);

-- Filter by pipeline type (e.g. "TDD Infrastructure Bootstrap", "Feature Pipeline")
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_pipeline
    ON knowledge_chunks (pipeline);

-- Recently indexed projects (used by knowledgebase_list tool)
CREATE INDEX IF NOT EXISTS idx_projects_last_indexed
    ON projects (last_indexed_at DESC);

-- ══ 5. Match function ════════════════════════════════════════════════════
-- Convenience function for cosine similarity search with optional
-- project_id filtering. Returns results ordered by similarity descending.
--
-- Usage examples:
--
--   -- Find top 5 chunks similar to a query embedding
--   SELECT * FROM match_knowledge('[0.01, 0.02, ...]'::vector(384), 0.7, 5);
--
--   -- Filter to a specific project
--   SELECT * FROM match_knowledge('[0.01, 0.02, ...]'::vector(384), 0.7, 5, 'my-app');
--
--   -- Use with knowledgebase-index.js generated embeddings
--   -- (the core engine builds embedding vector from query text)

CREATE OR REPLACE FUNCTION match_knowledge(
    query_embedding     VECTOR(384),
    match_threshold     DOUBLE PRECISION,  -- minimum similarity (0.0 to 1.0); 0.7 is a good default
    match_count         INTEGER,           -- max results to return (1-20 recommended)
    filter_project_id   TEXT DEFAULT NULL   -- optional: restrict to a single project
)
RETURNS TABLE(
    id              BIGINT,
    project_id      TEXT,
    session_date    DATE,
    session_title   TEXT,
    pipeline        TEXT,
    coverage        TEXT,
    tdd_iterations  INTEGER,
    content         TEXT,
    content_hash    TEXT,
    similarity      DOUBLE PRECISION,
    indexed_at      TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        id,
        project_id,
        session_date,
        session_title,
        pipeline,
        coverage,
        tdd_iterations,
        content,
        content_hash,
        1 - (embedding <=> query_embedding) AS similarity,
        indexed_at
    FROM knowledge_chunks
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
        AND (filter_project_id IS NULL OR project_id = filter_project_id)
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ══ 6. OpenAI upgrade path ═══════════════════════════════════════════════
-- The default embedding model is Xenova/all-MiniLM-L6-v2 (384 dimensions).
-- To upgrade to OpenAI text-embedding-3-small (1536 dimensions):
--
--   1. Set OPENAI_API_KEY in your .env file
--   2. Resize the embedding column (requires dropping and recreating the
--      HNSW index first — HNSW indexes cannot be built on expression columns)
--   3. Rebuild the HNSW index for the new dimension
--
--   -- Step 1: Drop the old HNSW index (required before ALTER COLUMN TYPE)
--   DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;
--
--   -- Step 2: Change column type to 1536 dimensions
--   ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE VECTOR(1536);
--
--   -- Step 3: Rebuild the HNSW index
--   CREATE INDEX idx_knowledge_chunks_embedding
--       ON knowledge_chunks
--       USING hnsw (embedding vector_cosine_ops)
--       WITH (m = 16, ef_construction = 64);
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ Done ═════════════════════════════════════════════════════════════════
-- Verify installation by running:
--   \dt knowledge_chunks projects
--   \di idx_*
--   \df match_knowledge
--   SELECT * FROM match_knowledge('[0,0,0,0]'::vector(384), 0.0, 1);
-- (the last query should return 0 rows — confirming the function works)
