/**
 * knowledgebase-index.js — Core engine for PostgreSQL + pgvector knowledgebase.
 *
 * Centralized knowledgebase for cross-project learned knowledge sharing.
 * Manages connection pool, embedding generation, CRUD operations,
 * semantic search, and statistics.
 *
 * All exported functions gracefully return empty/zero results when the
 * database is not configured — never throw.
 *
 * Usage:
 *   import { search, upsertChunks, getStats } from './knowledgebase-index.js';
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Configuration ──────────────────────────────────────────────────────

const EMBEDDING_DIM = 384;

// ── Lazy-loaded module state ───────────────────────────────────────────

/** @type {import('pg').Pool|null} */
let _pool = null;

/** @type {boolean} */
let _poolInitialised = false;

/** @type {import('pgvector').toSql|null} */
let _toSql = null;

/** @type {import('pgvector').fromSql|null} */
let _fromSql = null;

/** @type {Function|null} */
let _pipelineFn = null;

/** @type {Promise<any>|null} */
let _embedderPromise = null;

/** @type {any|null} */
let _embedder = null;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of a string.
 * @param {string} content
 * @returns {string}
 */
function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Redact a connection string for safe logging.
 * @param {string} url
 * @returns {string}
 */
function redactConnectionString(url) {
  try {
    const u = new URL(url);
    const auth = u.username ? '***@' : '';
    return `${u.protocol}//${auth}${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return '***';
  }
}

// ── Connection Management ──────────────────────────────────────────────

/**
 * Get or create the PostgreSQL connection pool.
 *
 * Lazily initialised on first call. Reads DATABASE_URL from process.env.
 * Returns null when DATABASE_URL is not set or optional deps (pg, pgvector)
 * are missing — never throws.
 *
 * Pool configuration:
 *   max: 5                    — conservative for single-user MCP stdio
 *   idleTimeoutMillis: 30000  — 30s idle timeout
 *   connectionTimeoutMillis: 5000 — fail fast if unreachable
 *
 * @returns {Promise<import('pg').Pool|null>}
 */
async function getPool() {
  if (_poolInitialised) return _pool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[knowledgebase] DATABASE_URL not set. Knowledgebase unavailable. ' +
      'Set DATABASE_URL in your .env file to enable cross-project knowledge search.');
    _poolInitialised = true;
    _pool = null;
    return null;
  }

  // Lazy import: pg (optional dependency)
  let pgMod;
  try {
    pgMod = await import('pg');
  } catch {
    console.warn('[knowledgebase] pg module not installed. Install with: npm install pg');
    _poolInitialised = true;
    _pool = null;
    return null;
  }
  const { Pool } = pgMod.default || pgMod;

  // Lazy import: pgvector (optional dependency)
  try {
    const vecMod = await import('pgvector');
    const v = vecMod.default || vecMod;
    _toSql = v.toSql;
    _fromSql = v.fromSql;
  } catch {
    console.warn('[knowledgebase] pgvector module not installed. Install with: npm install pgvector');
    _poolInitialised = true;
    _pool = null;
    return null;
  }

  try {
    _pool = new Pool({
      connectionString: dbUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    _pool.on('error', (err) => {
      console.error('[knowledgebase] Unexpected connection pool error:', err.message);
    });

    _poolInitialised = true;
    return _pool;
  } catch (err) {
    console.warn('[knowledgebase] Failed to create connection pool:', err.message);
    _poolInitialised = true;
    _pool = null;
    return null;
  }
}

/**
 * Close the connection pool and release all connections.
 * Safe to call even if the pool was never created.
 */
async function closePool() {
  if (_pool) {
    try {
      await _pool.end();
    } catch (err) {
      console.warn('[knowledgebase] Error closing pool:', err.message);
    }
    _pool = null;
    _poolInitialised = false;
  }
}

/**
 * Ensure the database schema exists.
 *
 * Creates the pgvector extension, projects and knowledge_chunks tables,
 * and all indexes. Catches CREATE EXTENSION failures gracefully and
 * directs the user to run the manual init script.
 *
 * @returns {Promise<void>}
 */
async function ensureSchema() {
  const pool = await getPool();
  if (!pool) return;

  // Attempt to create the pgvector extension (may fail due to permissions)
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (err) {
    console.warn('[knowledgebase] pgvector extension not available. ' +
      'Run manually: psql $DATABASE_URL -f scripts/knowledgebase-init.sql');
    console.warn('[knowledgebase] Extension error:', err.message);
    // Continue — tables can exist without the extension
  }

  try {
    // Projects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        first_indexed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Knowledge chunks table with vector embedding column
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id              BIGSERIAL PRIMARY KEY,
        project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_date    DATE NOT NULL,
        session_title   TEXT,
        pipeline        TEXT,
        coverage        TEXT,
        tdd_iterations  INTEGER NOT NULL DEFAULT 0,
        content         TEXT NOT NULL,
        content_hash    TEXT NOT NULL,
        embedding       VECTOR(${EMBEDDING_DIM}),
        indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_knowledge_chunk UNIQUE (project_id, session_date, content_hash)
      )
    `);

    // HNSW index for cosine similarity search
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
        ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
    } catch (idxErr) {
      console.warn('[knowledgebase] Could not create HNSW index ' +
        '(pgvector extension may not be available):', idxErr.message);
    }

    // B-tree indexes for structured queries and filters
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project_id
      ON knowledge_chunks (project_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_session_date
      ON knowledge_chunks (session_date DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_pipeline
      ON knowledge_chunks (pipeline)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_last_indexed
      ON projects (last_indexed_at DESC)
    `);
  } catch (err) {
    console.warn('[knowledgebase] Schema creation failed:', err.message);
    throw err;
  }
}

// ── Embedding ───────────────────────────────────────────────────────────

/**
 * Get or create the embedding model singleton.
 * Uses @xenova/transformers pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2').
 * Model is created once and cached for reuse across calls.
 *
 * @returns {Promise<any|null>}
 */
async function getEmbedder() {
  if (_embedder) return _embedder;
  if (_embedderPromise) return _embedderPromise;

  _embedderPromise = (async () => {
    if (!_pipelineFn) {
      try {
        const mod = await import('@xenova/transformers');
        _pipelineFn = mod.pipeline;
      } catch {
        console.warn('[knowledgebase] @xenova/transformers not installed. ' +
          'Embedding unavailable. Install with: npm install @xenova/transformers');
        return null;
      }
    }

    try {
      _embedder = await _pipelineFn('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      return _embedder;
    } catch (err) {
      console.warn('[knowledgebase] Failed to load embedding model:', err.message);
      return null;
    }
  })();

  return _embedderPromise;
}

/**
 * Generate an embedding vector for the given text.
 *
 * Uses the local @xenova/transformers pipeline with all-MiniLM-L6-v2 (384d).
 * Returns a Float32Array of 384 floats using mean pooling + L2 normalization.
 * pgvector's `toSql()` accepts both Float32Array and plain arrays, so callers
 * can rely on receiving a Float32Array.
 *
 * @param {string} text - Text to embed
 * @returns {Promise<Float32Array>} Float32Array of 384 floats
 * @throws {Error} When the embedding model is not available
 */
async function embed(text) {
  const model = await getEmbedder();
  if (!model) {
    throw new Error(
      'Embedding model not available. Install @xenova/transformers.'
    );
  }

  const result = await model(text, { pooling: 'mean', normalize: true });
  // Wrap in Float32Array — the pipeline may return a different typed array type
  return new Float32Array(result.data);
}

/**
 * Set the embedding provider strategy.
 *
 * @param {'local'|'openai'} provider - Embedding backend to use
 *   'local'  — @xenova/transformers all-MiniLM-L6-v2 (384d, default)
 *   'openai' — OpenAI text-embedding-3-small (1536d, requires OPENAI_API_KEY)
 */
function setEmbeddingProvider(provider) {
  // Currently only 'local' is implemented.
  // Future: 'openai' support will use OpenAI API with 1536-d embeddings.
  console.warn(`[knowledgebase] Embedding provider set to: ${provider}`);
}

// ── CRUD ───────────────────────────────────────────────────────────────

/**
 * Register or update a project in the projects table.
 *
 * Creates the project if it doesn't exist, or updates the display name
 * and last_indexed_at timestamp if it does (idempotent upsert).
 *
 * @param {string} projectId - Project identifier (from package.json "name")
 * @param {string} name - Display name for the project
 * @returns {Promise<{id: string, first_indexed_at: string|null}>}
 */
async function registerProject(projectId, name) {
  const pool = await getPool();
  if (!pool) return { id: projectId, first_indexed_at: null };

  try {
    const result = await pool.query(
      `INSERT INTO projects (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         last_indexed_at = NOW()
       RETURNING id, first_indexed_at`,
      [projectId, name]
    );
    return result.rows[0];
  } catch (err) {
    console.warn('[knowledgebase] registerProject failed:', err.message);
    return { id: projectId, first_indexed_at: null };
  }
}

/**
 * Upsert multiple knowledge chunks in batch.
 *
 * Each chunk is embedded and upserted with ON CONFLICT idempotency using
 * the (project_id, session_date, content_hash) unique constraint.
 * Chunks with matching hashes update metadata but preserve idempotency.
 *
 * @param {Array<{
 *   project_id: string,
 *   session_date: string,
 *   session_title?: string,
 *   pipeline?: string,
 *   coverage?: string,
 *   tdd_iterations?: number,
 *   content: string,
 *   content_hash?: string
 * }>} chunks - Array of chunk objects to upsert
 * @returns {Promise<{inserted: number, updated: number, skipped: number}>}
 */
async function upsertChunks(chunks) {
  const pool = await getPool();
  if (!pool || !Array.isArray(chunks) || chunks.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    try {
      // Compute content hash if not provided
      const contentHash = chunk.content_hash ||
        hashContent(chunk.content + (chunk.session_date || '') + (chunk.pipeline || ''));

      // Generate embedding from session-contextualised content
      let embeddingSql = null;
      try {
        const contextText = `Session: ${chunk.session_date || ''}` +
          (chunk.pipeline ? ` — Pipeline: ${chunk.pipeline}` : '') +
          `\n${chunk.content}`;
        const vec = await embed(contextText);
        embeddingSql = _toSql(vec);
      } catch (embedErr) {
        console.warn('[knowledgebase] Embedding failed for chunk, ' +
          'inserting without vector:', embedErr.message);
      }

      // ON CONFLICT uses the composite unique constraint
      const result = await pool.query(
        `INSERT INTO knowledge_chunks
         (project_id, session_date, session_title, pipeline, coverage,
          tdd_iterations, content, content_hash, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (project_id, session_date, content_hash) DO UPDATE SET
           content     = EXCLUDED.content,
           session_title = COALESCE(EXCLUDED.session_title,
                           knowledge_chunks.session_title),
           pipeline    = COALESCE(EXCLUDED.pipeline,
                          knowledge_chunks.pipeline),
           coverage    = COALESCE(EXCLUDED.coverage,
                          knowledge_chunks.coverage),
           tdd_iterations = COALESCE(EXCLUDED.tdd_iterations,
                               knowledge_chunks.tdd_iterations),
           embedding   = COALESCE(EXCLUDED.embedding,
                          knowledge_chunks.embedding),
           indexed_at  = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [
          chunk.project_id,
          chunk.session_date || null,
          chunk.session_title || null,
          chunk.pipeline || null,
          chunk.coverage || null,
          chunk.tdd_iterations || 0,
          chunk.content,
          contentHash,
          embeddingSql,
        ]
      );

      const row = result.rows[0];
      if (row && row.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      // Unique violation when hash matches exactly → truly a skip
      if (err.code === '23505') {
        skipped++;
      } else {
        console.warn('[knowledgebase] upsertChunks chunk failed:', err.message);
        skipped++;
      }
    }
  }

  return { inserted, updated, skipped };
}

// ── Search ──────────────────────────────────────────────────────────────

/**
 * Semantic search across knowledge chunks.
 *
 * Generates an embedding for the query text and performs cosine similarity
 * search via the <=> pgvector operator. Results are ranked by similarity
 * (0.0–1.0, higher = more relevant).
 *
 * @param {string} query - Natural language query
 * @param {object} [options]
 * @param {string} [options.project_id] - Filter results to a specific project
 * @param {number} [options.threshold=0.0] - Minimum similarity threshold (0.0–1.0)
 * @param {number} [options.limit=5] - Maximum number of results (1–50)
 * @returns {Promise<Array<{
 *   project_id: string,
 *   session_date: string,
 *   session_title: string|null,
 *   pipeline: string|null,
 *   content: string,
 *   similarity: number
 * }>>}
 */
async function search(query, options = {}) {
  const pool = await getPool();
  if (!pool) return [];

  const { project_id, threshold = 0.0, limit = 5 } = options;

  try {
    const queryEmbedding = await embed(query);

    // Parameterised query — never interpolate user input into SQL
    let sql = `
      SELECT
        project_id,
        session_date,
        session_title,
        pipeline,
        content,
        1 - (embedding <=> $1) AS similarity
      FROM knowledge_chunks
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1) >= $2
    `;
    const params = [_toSql(queryEmbedding), threshold];

    if (project_id) {
      sql += ` AND project_id = $${params.length + 1}`;
      params.push(project_id);
    }

    sql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(sql, params);

    return result.rows.map((r) => ({
      project_id: r.project_id,
      session_date: r.session_date,
      session_title: r.session_title || null,
      pipeline: r.pipeline || null,
      content: r.content,
      similarity: Math.round(r.similarity * 1000) / 1000,
    }));
  } catch (err) {
    console.warn('[knowledgebase] Search failed:', err.message);
    return [];
  }
}

// ── Stats ───────────────────────────────────────────────────────────────

/**
 * Get knowledgebase statistics.
 *
 * Returns aggregate counts and database size information.
 * Returns zero-filled defaults when the database is not configured.
 *
 * @returns {Promise<{
 *   total_chunks: number,
 *   total_projects: number,
 *   db_size: string,
 *   last_sync: string|null
 * }>}
 */
async function getStats() {
  const pool = await getPool();
  if (!pool) {
    return { total_chunks: 0, total_projects: 0, db_size: '0 MB', last_sync: null };
  }

  try {
    const [chunksResult, projectsResult, sizeResult, syncResult] =
      await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM knowledge_chunks'),
        pool.query('SELECT COUNT(*)::int AS count FROM projects'),
        pool.query(
          'SELECT pg_size_pretty(pg_database_size(current_database())) AS size'
        ),
        pool.query('SELECT MAX(indexed_at) AS last_sync FROM knowledge_chunks'),
      ]);

    return {
      total_chunks: chunksResult.rows[0].count,
      total_projects: projectsResult.rows[0].count,
      db_size: sizeResult.rows[0].size,
      last_sync: syncResult.rows[0].last_sync || null,
    };
  } catch (err) {
    console.warn('[knowledgebase] getStats failed:', err.message);
    return { total_chunks: 0, total_projects: 0, db_size: '0 MB', last_sync: null };
  }
}

/**
 * List all indexed projects with chunk counts and last indexed timestamp.
 *
 * Returns an empty array when the database is not configured.
 *
 * @returns {Promise<Array<{
 *   project_id: string,
 *   name: string,
 *   chunk_count: number,
 *   last_indexed: string|null
 * }>>}
 */
async function listProjects() {
  const pool = await getPool();
  if (!pool) return [];

  try {
    const result = await pool.query(`
      SELECT
        p.id      AS project_id,
        p.name,
        COUNT(kc.id)::int AS chunk_count,
        MAX(kc.indexed_at) AS last_indexed
      FROM projects p
      LEFT JOIN knowledge_chunks kc ON kc.project_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.name
    `);

    return result.rows.map((r) => ({
      project_id: r.project_id,
      name: r.name,
      chunk_count: r.chunk_count,
      last_indexed: r.last_indexed || null,
    }));
  } catch (err) {
    console.warn('[knowledgebase] listProjects failed:', err.message);
    return [];
  }
}

// ── Chunking Utility ────────────────────────────────────────────────────

/**
 * Parse a learned-knowledge.instructions.md file into structured chunks.
 *
 * Splits the markdown content by "## Session:" headers and extracts
 * session metadata (date, pipeline, coverage, TDD iterations) plus
 * the "New knowledge:" bullet content.
 *
 * Only includes sessions that have non-empty "New knowledge" content.
 * Each chunk includes a content_hash for idempotent upserting.
 *
 * @param {string} markdown - Raw markdown content of the learned-knowledge file
 * @param {string} projectId - Project identifier to assign to all chunks
 * @returns {Array<{
 *   project_id: string,
 *   session_date: string,
 *   session_title: string,
 *   pipeline: string|null,
 *   coverage: string|null,
 *   tdd_iterations: number,
 *   content: string,
 *   content_hash: string
 * }>}
 */
function chunkLearnedKnowledge(markdown, projectId) {
  if (!markdown || !projectId) return [];

  // Split by "## Session: " headers
  const blocks = markdown.split(/(?=^## Session: )/m);
  const chunks = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith('## Session:')) continue;

    // Extract session date from heading
    // Format: "## Session: YYYY-MM-DD" or "## Session: YYYY-MM-DD — Title"
    const dateMatch = trimmed.match(/^## Session:\s*(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const sessionDate = dateMatch[1];

    // Extract full session title (the heading minus "## ")
    const titleLine = trimmed.match(/^##\s*(.+)$/m);
    const sessionTitle = titleLine
      ? titleLine[1].trim()
      : `Session: ${sessionDate}`;

    // Extract metadata fields
    const pipelineMatch = trimmed.match(/\*\*Pipeline:\*\*\s*(.+)/);
    const pipeline = pipelineMatch ? pipelineMatch[1].trim() : null;

    const coverageMatch = trimmed.match(/\*\*Coverage:\*\*\s*(.+)/);
    const coverage = coverageMatch ? coverageMatch[1].trim() : null;

    const tddMatch = trimmed.match(/\*\*TDD Iterations:\*\*\s*(\d+)/);
    const tddIterations = tddMatch ? parseInt(tddMatch[1], 10) : 0;

    // Extract "New knowledge:" content
    // Find the marker position, then capture all text until the next section
    // header (e.g., "**Agent tuning notes:**"). This correctly handles
    // knowledge bullets that contain inline bold (e.g., "**npm v12 blocks**"),
    // which the previous regex incorrectly stopped at by matching the first
    // "**" it encountered instead of the next section header's "**".
    const nkMarker = '**New knowledge:**';
    const nkIndex = trimmed.indexOf(nkMarker);
    if (nkIndex === -1) continue;

    const afterNK = trimmed.slice(nkIndex + nkMarker.length);

    // Find the next section header: a line starting with "**" and ending
    // with ":**" (e.g., "**Agent tuning notes:**"). The [^:\n]* ensures we
    // match the closing ":**" after the header name, not inline bold like
    // "**npm v12 blocks...**" which appears within bullet content.
    const nextSectionRegex = /(?:\n|^)\s*\*\*[^:\n]*:\*\*/m;
    const nextSectionMatch = afterNK.match(nextSectionRegex);

    const rawNK = nextSectionMatch
      ? afterNK.slice(0, nextSectionMatch.index)
      : afterNK;

    const newKnowledgeRaw = rawNK.trim();

    // Process knowledge content or use fallback
    let content;

    if (newKnowledgeRaw) {
      // Strip leading "- " or "* " from each bullet line while preserving
      // indentation of sub-bullets and continuation lines
      const bullets = newKnowledgeRaw
        .split('\n')
        .map((line) => {
          const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
          if (bulletMatch) {
            return bulletMatch[1] + bulletMatch[2].trim();
          }
          // Continuation or sub-bullet: keep content, trim trailing whitespace
          return line.trimRight();
        })
        .filter((line) => line.length > 0);

      if (bullets.length > 0) {
        content = bullets.join('\n');
      }
    }

    // Fallback: if no knowledge bullets were extracted (section is empty),
    // extract all non-header text from the session — metadata values,
    // other section content, etc. — as a fallback so the session is not
    // entirely lost from the knowledgebase.
    if (!content) {
      const standaloneHeader = /^\*\*[^*:]+:\*\*\s*$/;
      const fallbackLines = trimmed
        .split('\n')
        .filter((line) => {
          const l = line.trim();
          // Skip the session heading line
          if (/^##\s/.test(l)) return false;
          // Skip standalone section headers (bold with nothing after colon)
          if (standaloneHeader.test(l)) return false;
          // Skip empty lines
          if (!l) return false;
          return true;
        })
        .join('\n');

      const fallback = fallbackLines.trim();
      if (!fallback) continue;
      content = fallback;
    }

    const contentHash = hashContent(
      content + sessionDate + (pipeline || '')
    );

    chunks.push({
      project_id: projectId,
      session_date: sessionDate,
      session_title: sessionTitle,
      pipeline,
      coverage,
      tdd_iterations: tddIterations,
      content,
      content_hash: contentHash,
    });
  }

  return chunks;
}

// ── Exports ─────────────────────────────────────────────────────────────

export {
  chunkLearnedKnowledge,
  closePool,
  embed,
  ensureSchema,
  getPool,
  getStats,
  listProjects,
  registerProject,
  search,
  setEmbeddingProvider,
  upsertChunks,
};
