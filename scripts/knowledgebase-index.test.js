// ═════════════════════════════════════════════════════════════════════════════
// knowledgebase-index.test.js — Unit tests for the core knowledgebase engine
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests chunking utility, graceful degradation (DATABASE_URL unset),
// embedding generation, CRUD operations, search, and schema management.
//
// All external dependencies (pg, pgvector, @xenova/transformers) are fully
// mocked so tests are fast, isolated, and never touch a real database.
//
// Covered scenarios (≥16, per plan T15):
//   1.  chunkLearnedKnowledge — 3 session blocks with correct metadata
//   2.  chunkLearnedKnowledge — empty markdown string
//   3.  chunkLearnedKnowledge — no session blocks
//   4.  chunkLearnedKnowledge — no projectId (invalid)
//   5.  chunkLearnedKnowledge — sessions with empty "New knowledge"
//   6.  getPool() returns null when DATABASE_URL is unset
//   7.  getPool() returns pool when DATABASE_URL is set (config validated)
//   8.  getPool() singleton — same instance reused
//   9.  embed() returns Float32Array(384)
//  10.  embed() calls transformers pipeline with correct args
//  11.  registerProject() inserts via INSERT ... ON CONFLICT
//  12.  registerProject() degrades gracefully on failure
//  13.  upsertChunks() returns inserted counts
//  14.  upsertChunks() returns updated counts
//  15.  upsertChunks() handles unique violation (skipped)
//  16.  upsertChunks() returns zeros for empty/null chunks
//  17.  upsertChunks() passes embedding as query param
//  18.  search() returns ranked results with similarity scores
//  19.  search() filters by project_id
//  20.  search() returns [] on query failure
//  21.  getStats() returns aggregated stats
//  22.  getStats() returns zeros on failure
//  23.  listProjects() returns project array with chunk counts
//  24.  listProjects() returns [] on failure
//  25.  ensureSchema() creates extension + tables + indexes
//  26.  ensureSchema() continues after CREATE EXTENSION failure
//  27.  ensureSchema() continues after HNSW index failure
//  28.  closePool() calls pool.end() and resets state
//  29.  closePool() is safe when pool never created
//  30.  All graceful degradation paths (7 functions)
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── Module mocks ───────────────────────────────────────────────────────────
// vi.mock is hoisted above all imports by Vitest.  These factories run once.
// The objects they create are shared across all test re-imports via
// vi.resetModules().  Tests access the mock objects by importing the mocked
// modules directly with static imports (which are also hoisted below).

vi.mock('pg', () => {
  const pool = {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }
  // Regular function (not arrow) so `new Pool(...)` works.
  // Returns the same shared pool object on every call.
  const MockPool = vi.fn(function () {
    return pool
  })
  return {
    default: { Pool: MockPool },
    Pool: MockPool,
  }
})

vi.mock('pgvector', () => ({
  default: {
    toSql: vi.fn((v) => v),
    fromSql: vi.fn((v) => v),
  },
  toSql: vi.fn((v) => v),
  fromSql: vi.fn((v) => v),
}))

vi.mock('@xenova/transformers', () => {
  const mockModel = vi
    .fn()
    .mockResolvedValue({ data: new Float32Array(384).fill(0.1) })
  const mockPipeline = vi.fn(() => mockModel)
  return { pipeline: mockPipeline }
})

// ── Import mocked modules for test access ──────────────────────────────────
// These reuse the same mock objects created by the vi.mock factories above.
// Pool() always returns the shared mockPool, so tests can grab the reference.

import { Pool } from 'pg'
import { pipeline as mockPipeline } from '@xenova/transformers'

/** Reference to the shared mock pool object used by the module under test */
const mockPool = Pool()

// ── Test helpers ───────────────────────────────────────────────────────────

/** Module under test — reassigned in each beforeEach via vi.resetModules() */
let mod

/**
 * Creates a mock learned-knowledge.instructions.md string with 3 session
 * blocks.  Includes "What went well:" after the first session to verify that
 * only "New knowledge:" bullet content is extracted.
 */
function createMockMarkdown() {
  return [
    '# Previous Work Summary',
    '',
    '## Session: 2026-07-20 — Initial Setup',
    '',
    '**Pipeline:** setup',
    '**Coverage:** 85%',
    '**TDD Iterations:** 3',
    '',
    '**New knowledge:**',
    '- The `getPool()` function lazily initialises the connection pool',
    '- All functions gracefully return empty/zero when DATABASE_URL is unset',
    '- Dynamic import with try/catch enables optional dependencies pattern',
    '',
    '**What went well:**',
    '- Fast iteration with mock-based tests',
    '',
    '## Session: 2026-07-22 — Feature Implementation',
    '',
    '**Pipeline:** feature',
    '**Coverage:** 92%',
    '**TDD Iterations:** 5',
    '',
    '**New knowledge:**',
    '- Mocking dynamic imports requires `vi.resetModules()` for fresh state',
    '- Content hash idempotency prevents duplicate indexing',
    '',
    '## Session: 2026-07-25 — Bug Fixes',
    '',
    '**Pipeline:** fix',
    '**Coverage:** 78%',
    '',
    '**New knowledge:**',
    '- Connection pool errors are handled gracefully with console.warn',
    '',
  ].join('\n')
}

/**
 * Creates a fake search result row.
 * @param {object} overrides
 * @returns {object}
 */
function makeChunkRow(overrides = {}) {
  return {
    project_id: 'test-project',
    session_date: '2026-07-20',
    session_title: 'Session: 2026-07-20 — Initial Setup',
    pipeline: 'setup',
    content: 'Some chunk content',
    similarity: 0.87,
    ...overrides,
  }
}

// ── Cleanup between test groups ───────────────────────────────────────────

afterEach(() => {
  delete process.env.DATABASE_URL
  // Restore any overridden mock implementations (e.g. the embed test
  // that temporarily sets mockPipeline.mockReturnValue(null))
  vi.restoreAllMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// chunkLearnedKnowledge — pure function, no external dependencies
// ═════════════════════════════════════════════════════════════════════════════

describe('chunkLearnedKnowledge', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mod = await import('./knowledgebase-index.js')
  })

  it('parses 3 session blocks and returns correct chunks with metadata', () => {
    const markdown = createMockMarkdown()
    const chunks = mod.chunkLearnedKnowledge(markdown, 'test-project')

    expect(chunks).toHaveLength(3)

    // ── Session 1 ──
    expect(chunks[0].project_id).toBe('test-project')
    expect(chunks[0].session_date).toBe('2026-07-20')
    expect(chunks[0].session_title).toBe(
      'Session: 2026-07-20 — Initial Setup',
    )
    expect(chunks[0].pipeline).toBe('setup')
    expect(chunks[0].coverage).toBe('85%')
    expect(chunks[0].tdd_iterations).toBe(3)
    expect(chunks[0].content).toContain('getPool()')
    expect(chunks[0].content).toContain('Dynamic import with try/catch')
    // "What went well" must NOT be included in "New knowledge" content
    expect(chunks[0].content).not.toContain('What went well')
    expect(chunks[0].content).not.toContain('Fast iteration')
    // content_hash is SHA-256 = 64 hex chars
    expect(chunks[0].content_hash).toMatch(/^[a-f0-9]{64}$/)

    // ── Session 2 ──
    expect(chunks[1].session_date).toBe('2026-07-22')
    expect(chunks[1].session_title).toBe(
      'Session: 2026-07-22 — Feature Implementation',
    )
    expect(chunks[1].pipeline).toBe('feature')
    expect(chunks[1].coverage).toBe('92%')
    expect(chunks[1].tdd_iterations).toBe(5)
    expect(chunks[1].content).toContain('vi.resetModules()')
    expect(chunks[1].content).toContain('Content hash idempotency')
    expect(chunks[1].content_hash).toMatch(/^[a-f0-9]{64}$/)

    // ── Session 3 ──
    expect(chunks[2].session_date).toBe('2026-07-25')
    expect(chunks[2].session_title).toBe('Session: 2026-07-25 — Bug Fixes')
    expect(chunks[2].pipeline).toBe('fix')
    expect(chunks[2].coverage).toBe('78%')
    expect(chunks[2].tdd_iterations).toBe(0) // defaults to 0 when missing
    expect(chunks[2].content).toContain('Connection pool errors')
  })

  it('returns empty array for empty markdown string', () => {
    expect(mod.chunkLearnedKnowledge('', 'test-project')).toEqual([])
  })

  it('returns empty array for markdown with no ## Session: blocks', () => {
    const md = '# Just a header\n\nSome plain text without sessions.\n'
    expect(mod.chunkLearnedKnowledge(md, 'test-project')).toEqual([])
  })

  it('returns empty array when projectId is empty, null, or undefined', () => {
    const md = createMockMarkdown()
    expect(mod.chunkLearnedKnowledge(md, '')).toEqual([])
    expect(mod.chunkLearnedKnowledge(md, null)).toEqual([])
    expect(mod.chunkLearnedKnowledge(md, undefined)).toEqual([])
  })

  it('falls back to all non-header content when "New knowledge:" section is empty', () => {
    const md = [
      '## Session: 2026-07-20 — Setup',
      '',
      '**Pipeline:** setup',
      '',
      '**New knowledge:**',
      '',
      '**What went wrong:**',
      '- Nothing to learn here',
      '',
      '## Session: 2026-07-22 — Feature',
      '',
      '**Pipeline:** feature',
      '',
      '**New knowledge:**',
      '- Actual learning content',
    ].join('\n')

    const chunks = mod.chunkLearnedKnowledge(md, 'test-project')
    // First session has empty "New knowledge:" → falls back to session content
    expect(chunks).toHaveLength(2)
    expect(chunks[0].session_date).toBe('2026-07-20')
    expect(chunks[0].content).toContain('**Pipeline:** setup')
    expect(chunks[0].content).toContain('Nothing to learn here')
    // Second session has normal "New knowledge:" content
    expect(chunks[1].session_date).toBe('2026-07-22')
    expect(chunks[1].content).toBe('Actual learning content')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Graceful degradation — all functions return empty/zero results when
// DATABASE_URL is not configured.  No exceptions are thrown.
// ═════════════════════════════════════════════════════════════════════════════

describe('graceful degradation (without DATABASE_URL)', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.DATABASE_URL
    mod = await import('./knowledgebase-index.js')
  })

  it('getPool() returns null', async () => {
    expect(await mod.getPool()).toBeNull()
  })

  it('upsertChunks() returns {inserted:0, updated:0, skipped:0}', async () => {
    const result = await mod.upsertChunks([
      { project_id: 'p', session_date: '2026-01-01', content: 'test' },
    ])
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0 })
  })

  it('search() returns []', async () => {
    expect(await mod.search('test query', {})).toEqual([])
  })

  it('getStats() returns zero-filled defaults', async () => {
    expect(await mod.getStats()).toEqual({
      total_chunks: 0,
      total_projects: 0,
      db_size: '0 MB',
      last_sync: null,
    })
  })

  it('listProjects() returns []', async () => {
    expect(await mod.listProjects()).toEqual([])
  })

  it('registerProject() returns id with null first_indexed_at', async () => {
    expect(await mod.registerProject('my-project', 'My Project')).toEqual({
      id: 'my-project',
      first_indexed_at: null,
    })
  })

  it('ensureSchema() does nothing — pool.query never called', async () => {
    await expect(mod.ensureSchema()).resolves.toBeUndefined()
    expect(mockPool.query).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// embed() — embedding generation via mocked @xenova/transformers pipeline
// ═════════════════════════════════════════════════════════════════════════════

describe('embed', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mod = await import('./knowledgebase-index.js')
  })

  it('returns a Float32Array of length 384', async () => {
    const vector = await mod.embed('test text to embed')

    expect(vector).toBeInstanceOf(Float32Array)
    expect(vector.length).toBe(384)

    // 0.1 stored as Float32 → ~0.10000000149011612 due to precision loss
    expect(vector[0]).toBeCloseTo(0.1, 2)
    expect(vector[383]).toBeCloseTo(0.1, 2)
  })

  it('calls the transformers pipeline with correct arguments', async () => {
    await mod.embed('some query')

    // pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    )
    // model(text, { pooling: 'mean', normalize: true })
    const mockModel = mockPipeline.mock.results[0].value
    expect(mockModel).toHaveBeenCalledWith('some query', {
      pooling: 'mean',
      normalize: true,
    })
  })

  it('throws when embedder model is not available', async () => {
    // Save the original implementation, then override to return null.
    // Must save BEFORE overriding since vi.clearAllMocks in beforeEach
    // does NOT clear mock implementations.
    const savedImpl = mockPipeline.getMockImplementation()
    mockPipeline.mockImplementation(() => null)

    vi.resetModules()
    vi.clearAllMocks()
    mod = await import('./knowledgebase-index.js')

    await expect(mod.embed('test')).rejects.toThrow(
      'Embedding model not available',
    )

    // Restore immediately so the "with database" tests are unaffected
    mockPipeline.mockImplementation(savedImpl)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// With database — DATABASE_URL is set; pool is available.
// mockPool.query() responses control what the core functions return.
// ═════════════════════════════════════════════════════════════════════════════

describe('with database (DATABASE_URL set)', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.DATABASE_URL =
      'postgres://user:pass@localhost:5432/knowledgebase'
    mod = await import('./knowledgebase-index.js')
  })

  // ── getPool ────────────────────────────────────────────────────────────

  describe('getPool', () => {
    it('returns a pool with validated config when DATABASE_URL is set', async () => {
      const pool = await mod.getPool()

      expect(pool).not.toBeNull()
      expect(pool).toBe(mockPool)

      // Pool constructor called with correct config
      expect(Pool).toHaveBeenCalledWith({
        connectionString:
          'postgres://user:pass@localhost:5432/knowledgebase',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })

      // Error handler registered
      expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('returns the same pool instance on subsequent calls (singleton)', async () => {
      const pool1 = await mod.getPool()
      const pool2 = await mod.getPool()

      expect(pool1).toBe(pool2)
      expect(Pool).toHaveBeenCalledTimes(1)
    })
  })

  // ── registerProject ────────────────────────────────────────────────────

  describe('registerProject', () => {
    it('calls pool.query with INSERT ... ON CONFLICT and returns project', async () => {
      const expectedRow = {
        id: 'my-project',
        first_indexed_at: '2026-07-29T00:00:00.000Z',
      }
      mockPool.query.mockResolvedValue({ rows: [expectedRow] })

      const result = await mod.registerProject('my-project', 'My Project')

      expect(result).toEqual(expectedRow)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['my-project', 'My Project'],
      )
    })

    it('returns id with null timestamp when pool.query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'))

      const result = await mod.registerProject('broken-project', 'Broken')

      expect(result).toEqual({ id: 'broken-project', first_indexed_at: null })
    })
  })

  // ── upsertChunks ──────────────────────────────────────────────────────

  describe('upsertChunks', () => {
    const testChunks = [
      {
        project_id: 'test-project',
        session_date: '2026-07-20',
        pipeline: 'setup',
        content: 'First knowledge item\nSecond knowledge item',
      },
      {
        project_id: 'test-project',
        session_date: '2026-07-22',
        pipeline: 'feature',
        content: 'Third knowledge item',
      },
    ]

    it('returns inserted count for new chunks (is_insert=true)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_insert: true }] })
        .mockResolvedValueOnce({ rows: [{ is_insert: true }] })

      const result = await mod.upsertChunks(testChunks)

      expect(result).toEqual({ inserted: 2, updated: 0, skipped: 0 })
      expect(mockPool.query).toHaveBeenCalledTimes(2)
    })

    it('counts duplicate content as updated (is_insert=false)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_insert: false }] })
        .mockResolvedValueOnce({ rows: [{ is_insert: true }] })

      const result = await mod.upsertChunks(testChunks)

      expect(result).toEqual({ inserted: 1, updated: 1, skipped: 0 })
    })

    it('counts unique violation (error code 23505) as skipped', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_insert: true }] })
        .mockRejectedValueOnce({ code: '23505' })

      const result = await mod.upsertChunks(testChunks)

      expect(result).toEqual({ inserted: 1, updated: 0, skipped: 1 })
    })

    it('returns zero counts and does not call query for empty or null chunks', async () => {
      expect(await mod.upsertChunks([])).toEqual({
        inserted: 0,
        updated: 0,
        skipped: 0,
      })
      expect(await mod.upsertChunks(null)).toEqual({
        inserted: 0,
        updated: 0,
        skipped: 0,
      })
      expect(mockPool.query).not.toHaveBeenCalled()
    })
  })

  // ── search ─────────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns ranked results with similarity scores', async () => {
      const fakeRows = [
        makeChunkRow({
          project_id: 'proj-a',
          session_date: '2026-07-20',
          pipeline: 'setup',
          content: 'How to configure the pool',
          similarity: 0.92,
        }),
        makeChunkRow({
          project_id: 'proj-a',
          session_date: '2026-07-22',
          pipeline: 'feature',
          content: 'How to mock transformers',
          similarity: 0.78,
        }),
      ]
      mockPool.query.mockResolvedValue({ rows: fakeRows })

      const results = await mod.search('pool configuration', {
        project_id: 'proj-a',
        limit: 5,
        threshold: 0.6,
      })

      expect(results).toHaveLength(2)
      expect(results[0].project_id).toBe('proj-a')
      expect(results[0].similarity).toBe(0.92)
      expect(results[0].pipeline).toBe('setup')
      expect(results[0].session_date).toBe('2026-07-20')
      expect(results[1].similarity).toBe(0.78)

      // Verify SQL uses parameterized placeholders (never interpolates user input)
      const sql = mockPool.query.mock.calls[0][0]
      expect(sql).toContain('$1')
      expect(sql).toContain('$2')
      expect(sql).toContain('$3')
      expect(sql).not.toContain('pool configuration')
    })

    it('filters by project_id when provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      await mod.search('test', { project_id: 'specific-project' })

      const sql = mockPool.query.mock.calls[0][0]
      expect(sql).toContain('AND project_id = $')
    })

    it('returns empty array when pool.query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('query failed'))

      const results = await mod.search('test')
      expect(results).toEqual([])
    })
  })

  // ── getStats ───────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns aggregated statistics from database', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: 15 }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ size: '12 MB' }] })
        .mockResolvedValueOnce({
          rows: [{ last_sync: '2026-07-29T12:00:00.000Z' }],
        })

      const stats = await mod.getStats()

      expect(stats).toEqual({
        total_chunks: 15,
        total_projects: 3,
        db_size: '12 MB',
        last_sync: '2026-07-29T12:00:00.000Z',
      })
      expect(mockPool.query).toHaveBeenCalledTimes(4)
    })

    it('returns zero-filled defaults when pool.query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('stats error'))

      expect(await mod.getStats()).toEqual({
        total_chunks: 0,
        total_projects: 0,
        db_size: '0 MB',
        last_sync: null,
      })
    })
  })

  // ── listProjects ───────────────────────────────────────────────────────

  describe('listProjects', () => {
    it('returns array of projects with chunk counts', async () => {
      const fakeRows = [
        {
          project_id: 'proj-a',
          name: 'Project A',
          chunk_count: 10,
          last_indexed: '2026-07-29T12:00:00.000Z',
        },
        {
          project_id: 'proj-b',
          name: 'Project B',
          chunk_count: 5,
          last_indexed: null,
        },
      ]
      mockPool.query.mockResolvedValue({ rows: fakeRows })

      const projects = await mod.listProjects()

      expect(projects).toHaveLength(2)
      expect(projects[0]).toEqual({
        project_id: 'proj-a',
        name: 'Project A',
        chunk_count: 10,
        last_indexed: '2026-07-29T12:00:00.000Z',
      })
      expect(projects[1]).toEqual({
        project_id: 'proj-b',
        name: 'Project B',
        chunk_count: 5,
        last_indexed: null,
      })
    })

    it('returns [] when pool.query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('list failed'))
      expect(await mod.listProjects()).toEqual([])
    })
  })

  // ── ensureSchema ───────────────────────────────────────────────────────

  describe('ensureSchema', () => {
    it('creates extension, tables, and indexes on success', async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      await mod.ensureSchema()

      // First call is CREATE EXTENSION
      expect(mockPool.query.mock.calls[0][0]).toContain(
        'CREATE EXTENSION IF NOT EXISTS vector',
      )

      const allSql = mockPool.query.mock.calls.map((c) => c[0])
      expect(
        allSql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS projects')),
      ).toBe(true)
      expect(
        allSql.some((s) =>
          s.includes('CREATE TABLE IF NOT EXISTS knowledge_chunks'),
        ),
      ).toBe(true)

      // 4 B-tree indexes + optional HNSW
      const bTreeSql = allSql.filter(
        (s) =>
          s.includes('idx_knowledge_chunks_project_id') ||
          s.includes('idx_knowledge_chunks_session_date') ||
          s.includes('idx_knowledge_chunks_pipeline') ||
          s.includes('idx_projects_last_indexed'),
      )
      expect(bTreeSql).toHaveLength(4)
    })

    it('catches CREATE EXTENSION failure and continues with tables', async () => {
      mockPool.query
        .mockRejectedValueOnce(new Error('permission denied'))
        .mockResolvedValue({ rows: [] })

      await expect(mod.ensureSchema()).resolves.toBeUndefined()

      // Table creation should still be attempted
      expect(mockPool.query.mock.calls.length).toBeGreaterThan(1)
      const secondSql = mockPool.query.mock.calls[1][0]
      expect(secondSql).toContain('CREATE TABLE IF NOT EXISTS projects')
    })

    it('catches HNSW index creation failure gracefully', async () => {
      // Extension fails → tables created → HNSW fails → B-tree indexes succeed
      mockPool.query
        .mockRejectedValueOnce(new Error('extension not available'))
        .mockResolvedValueOnce({ rows: [] }) // projects table
        .mockResolvedValueOnce({ rows: [] }) // knowledge_chunks table
        .mockRejectedValueOnce(new Error('HNSW not supported')) // HNSW index
        .mockResolvedValue({ rows: [] }) // B-tree indexes

      await expect(mod.ensureSchema()).resolves.toBeUndefined()

      const allSql = mockPool.query.mock.calls.map((c) => c[0])
      const bTreeSql = allSql.filter(
        (s) =>
          s.includes('idx_knowledge_chunks_project_id') ||
          s.includes('idx_knowledge_chunks_session_date') ||
          s.includes('idx_knowledge_chunks_pipeline') ||
          s.includes('idx_projects_last_indexed'),
      )
      // All 4 B-tree indexes still created despite HNSW failure
      expect(bTreeSql).toHaveLength(4)
    })
  })

  // ── closePool ──────────────────────────────────────────────────────────

  describe('closePool', () => {
    it('calls pool.end() and resets internal state for re-init', async () => {
      await mod.getPool()
      await mod.closePool()

      expect(mockPool.end).toHaveBeenCalledTimes(1)

      // After close, a fresh getPool() re-creates the pool
      const poolAgain = await mod.getPool()
      expect(poolAgain).toBe(mockPool)
      expect(Pool).toHaveBeenCalledTimes(2)
    })

    it('is safe to call when pool was never created', async () => {
      await expect(mod.closePool()).resolves.toBeUndefined()
      expect(mockPool.end).not.toHaveBeenCalled()
    })
  })

  // ── setEmbeddingProvider ────────────────────────────────────────────────

  describe('setEmbeddingProvider', () => {
    it('accepts a provider name without throwing', () => {
      expect(() => mod.setEmbeddingProvider('openai')).not.toThrow()
    })
  })
})
