// ═════════════════════════════════════════════════════════════════════════════
// mcp-knowledgebase-server.test.js — Unit tests for the MCP knowledgebase server
// ═════════════════════════════════════════════════════════════════════════════
//
// The MCP server is a stdio process, so its tool-call handler is exported as
// `handleToolCall` for testability and the stdio bootstrap (main) is guarded to
// direct-run only.  The core engine (./knowledgebase-index.js) is fully mocked
// so tests verify handler logic — registration order, guards, formatting, and
// graceful degradation — without a database or stdio connection.
//
// Covered scenarios (per plan T3 / TEST-01..08 plus degradation + integrity):
//   1.  knowledgebase_index calls registerProject BEFORE upsertChunks with (projectId, projectId)
//   2.  knowledgebase_index skips registerProject when chunks are empty (guard placement)
//   3.  knowledgebase_index reads the default file when no content is provided
//   4.  knowledgebase_index returns an error response when the default file is missing
//   5.  knowledgebase_index returns formatted indexed/updated/skipped counts
//   6.  knowledgebase_index validates projectId is required
//   6b. knowledgebase_index rejects whitespace-only projectId
//   6c. knowledgebase_index trims whitespace from projectId before downstream use
//   7.  knowledgebase_search returns formatted results with similarity scores (regression)
//   8.  knowledgebase_stats returns formatted stats (regression)
//   9.  knowledgebase_search degrades gracefully when the pool/DATABASE_URL is unavailable
//  10.  knowledgebase_list degrades gracefully when the pool/DATABASE_URL is unavailable
//  11.  import integrity — registerProject is exported from knowledgebase-index.js (smoke)
//  12.  knowledgebase_search "No results found" when the pool IS available (empty-kb branch)
//  13.  knowledgebase_stats not-available message when zero counts AND no pool
//  14.  knowledgebase_list formats indexed projects when projects exist
//  15.  unknown tool name returns a caught error response (default branch + outer catch)
//  16.  knowledgebase_index returns an error response when upsertChunks rejects
//  17.  redactConnectionString FAILS CLOSED — unix-socket authority postgres://user:secret@/var/run/postgresql in an error message is redacted (no raw credentials)
//  18.  redactConnectionString FAILS CLOSED — postgresql://user:secret@/tmp?host=/tmp variant is redacted (query string now also redacted → ?***)
//  19.  redactConnectionString redacts EVERY postgres:// token in a message (not just the first)
//  20.  knowledgebase_search drops a whitespace-only projectId (match-all, graceful degradation) — trimmed value passed to the engine
//  21.  knowledgebase_search honors an explicit limit: 0 (nullish coalescing, not silently 5)
//  22.  redactConnectionString redacts query-string params in URL tokens (belt-and-braces) — ?password=... does not survive
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ═════════════════════════════════════════════════════════════════════════════
// Module mocks — core engine fully mocked; only readFileSync is stubbed in
// node:fs so the handler's default-file reads can be controlled hermetically.
// ═════════════════════════════════════════════════════════════════════════════

vi.mock('./knowledgebase-index.js', () => ({
  search: vi.fn(),
  upsertChunks: vi.fn(),
  chunkLearnedKnowledge: vi.fn(),
  getStats: vi.fn(),
  listProjects: vi.fn(),
  registerProject: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn(),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_KB_FILE = '.agents/instructions/learned-knowledge.instructions.md'

const markdownWithSession = [
  '# Previous Work Summary',
  '',
  '## Session: 2026-08-02 — MCP registerProject Fix',
  '',
  '**Pipeline:** fix',
  '',
  '**New knowledge:**',
  '- registerProject must be called before upsertChunks',
  '- The MCP server now registers the project row before inserting chunks',
  '',
].join('\n')

const sampleChunks = [
  {
    project_id: 'test-project',
    session_date: '2026-08-02',
    content: 'registerProject must be called before upsertChunks',
    content_hash: 'abc123',
  },
]

const sampleResults = [
  {
    project_id: 'test-project',
    session_date: '2026-08-01',
    session_title: 'Session: 2026-08-01',
    pipeline: 'test-pipeline',
    content: 'Short test content for verification',
    similarity: 0.87,
  },
  {
    project_id: 'test-project',
    session_date: '2026-07-31',
    session_title: 'Session: 2026-07-31',
    pipeline: 'test-pipeline',
    content: 'Another chunk of knowledge for the second result row',
    similarity: 0.72,
  },
]

const sampleStats = {
  total_projects: 2,
  total_chunks: 23,
  db_size: '128 kB',
  last_sync: '2026-08-02T12:00:00Z',
}

/**
 * Build an MCP tool-call request object as the SDK would deliver it.
 * @param {string} name - tool name
 * @param {Record<string, any>} args - tool arguments
 * @returns {{ params: { name: string, arguments: Record<string, any> } }}
 */
function buildRequest(name, args = {}) {
  return { params: { name, arguments: args } }
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('mcp-knowledgebase-server', () => {
  let mod
  let kb
  let readFileSyncMock

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mod = await import('./mcp-knowledgebase-server.js')
    kb = await import('./knowledgebase-index.js')
    readFileSyncMock = (await import('node:fs')).readFileSync
    // Default: reading the file succeeds with the fixture.  Individual tests
    // override readFileSyncMock.mockImplementation when they need ENOENT.
    readFileSyncMock.mockReturnValue(markdownWithSession)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── TEST-01: registerProject is called before upsertChunks ─────────────

  it('knowledgebase_index: calls registerProject before upsertChunks with (projectId, projectId)', async () => {
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockResolvedValue({ inserted: 1, updated: 0, skipped: 0 })

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    // registerProject called with the CLI convention (projectId, projectId)
    expect(kb.registerProject).toHaveBeenCalledTimes(1)
    expect(kb.registerProject).toHaveBeenCalledWith(
      'test-project',
      'test-project',
    )

    // upsertChunks still called with the parsed chunks after registration
    expect(kb.upsertChunks).toHaveBeenCalledTimes(1)
    expect(kb.upsertChunks).toHaveBeenCalledWith(sampleChunks)

    // Order assertion: registerProject resolved BEFORE upsertChunks started
    const registerOrder = kb.registerProject.mock.invocationCallOrder[0]
    const upsertOrder = kb.upsertChunks.mock.invocationCallOrder[0]
    expect(registerOrder).toBeLessThan(upsertOrder)

    // Response shape delivered to the MCP client
    expect(response.content).toBeInstanceOf(Array)
    expect(response.content[0].type).toBe('text')
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-02: registerProject skipped when chunks are empty ─────────────

  it('knowledgebase_index: does NOT call registerProject when chunks are empty', async () => {
    kb.chunkLearnedKnowledge.mockReturnValue([])

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    expect(kb.registerProject).not.toHaveBeenCalled()
    expect(kb.upsertChunks).not.toHaveBeenCalled()

    expect(response.content[0].text).toContain(
      'No valid knowledge chunks found for project "test-project"',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-03: default file read when no content provided ────────────────

  it('knowledgebase_index: reads the default file when no content is provided', async () => {
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockResolvedValue({ inserted: 1, updated: 0, skipped: 0 })

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', { projectId: 'test-project' }),
    )

    expect(readFileSyncMock).toHaveBeenCalledTimes(1)
    expect(readFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining(DEFAULT_KB_FILE),
      'utf8',
    )
    // The file contents flow into chunkLearnedKnowledge
    expect(kb.chunkLearnedKnowledge).toHaveBeenCalledWith(
      markdownWithSession,
      'test-project',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-04: error response when default file is missing ───────────────

  it('knowledgebase_index: returns error response when default file is missing and no content', async () => {
    readFileSyncMock.mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory, open ...')
      err.code = 'ENOENT'
      throw err
    })

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', { projectId: 'test-project' }),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('could not be read')
    expect(response.content[0].text).toContain(DEFAULT_KB_FILE)

    // No engine calls happen before the early error return
    expect(kb.chunkLearnedKnowledge).not.toHaveBeenCalled()
    expect(kb.registerProject).not.toHaveBeenCalled()
    expect(kb.upsertChunks).not.toHaveBeenCalled()
  })

  // ── TEST-05: formatted counts response ─────────────────────────────────

  it('knowledgebase_index: returns formatted indexed/updated/skipped counts', async () => {
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockResolvedValue({ inserted: 3, updated: 2, skipped: 1 })

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    expect(response.content[0].text).toBe(
      'Indexed 3 chunks, updated 2, skipped 1 for project "test-project".',
    )
    expect(response.content[0].text).toContain('test-project')
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-06: projectId validation ──────────────────────────────────────

  it('knowledgebase_index: returns error response when projectId is missing', async () => {
    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', { content: markdownWithSession }),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain(
      'Error: projectId is required for knowledgebase_index.',
    )

    // No engine calls happen for an invalid request
    expect(kb.chunkLearnedKnowledge).not.toHaveBeenCalled()
    expect(kb.registerProject).not.toHaveBeenCalled()
    expect(kb.upsertChunks).not.toHaveBeenCalled()
  })

  // ── TEST-06b: whitespace-only projectId validation ────────────────────

  it('knowledgebase_index: returns error response when projectId is whitespace-only', async () => {
    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: '   ',
        content: markdownWithSession,
      }),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain(
      'Error: projectId is required for knowledgebase_index.',
    )

    // No engine calls happen for an invalid request
    expect(kb.chunkLearnedKnowledge).not.toHaveBeenCalled()
    expect(kb.registerProject).not.toHaveBeenCalled()
    expect(kb.upsertChunks).not.toHaveBeenCalled()
  })

  // ── TEST-06c: projectId trimmed before downstream use ─────────────────

  it('knowledgebase_index: trims surrounding whitespace from projectId before use', async () => {
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockResolvedValue({ inserted: 1, updated: 0, skipped: 0 })

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: '  test-project  ',
        content: markdownWithSession,
      }),
    )

    // The trimmed value flows into chunking, registration, and the response
    expect(kb.chunkLearnedKnowledge).toHaveBeenCalledWith(
      markdownWithSession,
      'test-project',
    )
    expect(kb.registerProject).toHaveBeenCalledWith('test-project', 'test-project')
    expect(kb.upsertChunks).toHaveBeenCalledWith(sampleChunks)
    expect(response.content[0].text).toContain(
      'for project "test-project".',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-07: knowledgebase_search formatting (regression) ──────────────

  it('knowledgebase_search: returns formatted results with similarity scores', async () => {
    kb.search.mockResolvedValue(sampleResults)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_search', { query: 'test query' }),
    )

    expect(kb.search).toHaveBeenCalledWith('test query', {
      project_id: undefined,
      threshold: 0.1,
      limit: 5,
    })

    expect(response.content[0].type).toBe('text')
    expect(response.content[0].text).toContain('### Result 1 (similarity: 0.87)')
    expect(response.content[0].text).toContain('### Result 2 (similarity: 0.72)')
    expect(response.content[0].text).toContain('**Project:** `test-project`')
    expect(response.content[0].text).toContain('**Date:** 2026-08-01')
    expect(response.content[0].text).toContain('**Pipeline:** test-pipeline')
    expect(response.content[0].text).toContain('---')
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-08: knowledgebase_stats formatting (regression) ───────────────

  it('knowledgebase_stats: returns formatted stats', async () => {
    kb.getStats.mockResolvedValue(sampleStats)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_stats', {}),
    )

    expect(kb.getStats).toHaveBeenCalledTimes(1)
    expect(response.content[0].type).toBe('text')
    expect(response.content[0].text).toContain('**Knowledgebase Stats**')
    expect(response.content[0].text).toContain('- Total projects: 2')
    expect(response.content[0].text).toContain('- Total chunks: 23')
    expect(response.content[0].text).toContain('- Database size: 128 kB')
    expect(response.content[0].text).toContain('- Last sync: 2026-08-02T12:00:00Z')
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-09: graceful degradation — search with no pool ────────────────

  it('knowledgebase_search: degrades gracefully when pool/DATABASE_URL unavailable (never throws)', async () => {
    kb.search.mockResolvedValue([])
    kb.getPool.mockResolvedValue(null)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_search', { query: 'anything' }),
    )

    expect(response.content[0].text).toContain(
      'Knowledgebase not available: DATABASE_URL is not configured.',
    )
    expect(response.isError).toBeUndefined()
    expect(kb.getPool).toHaveBeenCalledTimes(1)
  })

  // ── TEST-10: graceful degradation — list with no pool ──────────────────

  it('knowledgebase_list: degrades gracefully when pool/DATABASE_URL unavailable (never throws)', async () => {
    kb.listProjects.mockResolvedValue([])
    kb.getPool.mockResolvedValue(null)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_list', {}),
    )

    expect(response.content[0].text).toContain(
      'Knowledgebase not available: DATABASE_URL is not configured.',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-11: import integrity smoke check ──────────────────────────────

  it('import integrity: registerProject is exported from the real knowledgebase-index.js', async () => {
    // Bypass the mock to smoke-check the real module's public surface
    const real = await vi.importActual('./knowledgebase-index.js')

    expect(typeof real.registerProject).toBe('function')
    expect(typeof real.upsertChunks).toBe('function')
    expect(typeof real.chunkLearnedKnowledge).toBe('function')
  })

  // ── TEST-12: search — empty results with an available pool ─────────────

  it('knowledgebase_search: returns "No results found" when pool IS available', async () => {
    // search() returns [] but the pool exists → the empty-KB branch (not the
    // "DATABASE_URL not configured" branch) must be hit
    kb.search.mockResolvedValue([])
    kb.getPool.mockResolvedValue({})

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_search', { query: 'anything' }),
    )

    expect(response.content[0].text).toBe(
      'No results found. The knowledgebase may be empty.',
    )
    expect(response.isError).toBeUndefined()
    expect(kb.getPool).toHaveBeenCalledTimes(1)
  })

  // ── TEST-13: stats — zero counts with no pool ──────────────────────────

  it('knowledgebase_stats: returns not-available message when zero counts AND no pool', async () => {
    kb.getStats.mockResolvedValue({
      total_projects: 0,
      total_chunks: 0,
      db_size: '0 B',
      last_sync: null,
    })
    kb.getPool.mockResolvedValue(null)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_stats', {}),
    )

    expect(response.content[0].text).toContain(
      'Knowledgebase not available: DATABASE_URL is not configured.',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-14: list — formatted projects when projects exist ─────────────

  it('knowledgebase_list: formats indexed projects with chunk counts', async () => {
    kb.listProjects.mockResolvedValue([
      {
        project_id: 'project-a',
        name: 'Project A',
        chunk_count: 5,
        last_indexed: '2026-08-02T00:00:00Z',
      },
      {
        project_id: 'project-b',
        name: null, // exercises the name || project_id fallback
        chunk_count: 0,
        last_indexed: null, // exercises the last_indexed || 'Never' fallback
      },
    ])

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_list', {}),
    )

    expect(response.content[0].type).toBe('text')
    expect(response.content[0].text).toContain('**Indexed Projects:**')
    expect(response.content[0].text).toContain(
      '- Project A (5 chunks, last indexed: 2026-08-02T00:00:00Z)',
    )
    expect(response.content[0].text).toContain(
      '- project-b (0 chunks, last indexed: Never)',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-15: unknown tool — outer catch returns error response ─────────

  it('unknown tool: returns a caught error response (default branch)', async () => {
    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_bogus', {}),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toBe(
      'Error: Unknown tool: knowledgebase_bogus',
    )
    // The default branch throws — no engine function should have been touched
    expect(kb.search).not.toHaveBeenCalled()
    expect(kb.upsertChunks).not.toHaveBeenCalled()
  })

  // ── TEST-16: index — error path when upsertChunks rejects ──────────────

  it('knowledgebase_index: returns error response when upsertChunks fails', async () => {
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockRejectedValue(new Error('DB connection failed'))

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    // registerProject still ran before the failure (the fix order is preserved)
    expect(kb.registerProject).toHaveBeenCalledTimes(1)
    expect(kb.upsertChunks).toHaveBeenCalledTimes(1)
    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain(
      'Error: DB connection failed',
    )
  })

  // ── TEST-17: redactConnectionString FAILS CLOSED — unix-socket authority ─

  it('redactConnectionString: redacts unix-socket authority postgres://user:secret@/var/run/postgresql (fail-closed)', async () => {
    // `new URL()` throws on this libpq bare-authority form — the helper must
    // still strip the credentials instead of returning the message unchanged.
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockRejectedValue(
      new Error('connect ECONNREFUSED postgres://user:secret@/var/run/postgresql'),
    )

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    expect(response.isError).toBe(true)
    // Credentials redacted, host/path preserved
    expect(response.content[0].text).toContain(
      'postgres://***@/var/run/postgresql',
    )
    // No raw credentials anywhere in the error text
    expect(response.content[0].text).not.toContain('user:secret')
  })

  // ── TEST-18: redactConnectionString FAILS CLOSED — ?host= variant ───────

  it('redactConnectionString: redacts postgresql://user:secret@/tmp?host=/tmp (fail-closed)', async () => {
    // The alternate unix-socket form (`postgresql://user:secret@/tmp?host=/tmp`)
    // is also unparseable by `new URL()` — credentials must not leak, and the
    // query string is redacted too (→ ?***) as belt-and-braces.
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockRejectedValue(
      new Error('connect ECONNREFUSED postgresql://user:secret@/tmp?host=/tmp'),
    )

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain(
      'postgresql://***@/tmp?***',
    )
    expect(response.content[0].text).not.toContain('user:secret')
    expect(response.content[0].text).not.toContain('host=/tmp')
  })

  // ── TEST-19: redactConnectionString redacts EVERY token ─────────────────

  it('redactConnectionString: redacts EVERY postgres:// token in a message', async () => {
    // A message containing multiple connection-string tokens must have all of
    // them redacted, not just the first (replace-all strategy).
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockRejectedValue(
      new Error(
        'primary postgres://u1:p1@host1/db1 secondary postgres://u2:p2@host2/db2',
      ),
    )

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('postgres://***@host1/db1')
    expect(response.content[0].text).toContain('postgres://***@host2/db2')
    expect(response.content[0].text).not.toContain('u1:p1')
    expect(response.content[0].text).not.toContain('u2:p2')
  })

  // ── TEST-20: search — whitespace-only projectId is dropped (match-all) ───

  it('knowledgebase_search: drops a whitespace-only projectId (match-all, graceful)', async () => {
    // A whitespace-only projectId is not a meaningful filter — it is dropped
    // to match-all (undefined), mirroring the INDEX handler's trim/validate
    // parity while staying graceful (no hard error for a read-only filter).
    kb.search.mockResolvedValue(sampleResults)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_search', {
        query: 'test query',
        projectId: '   ',
      }),
    )

    expect(kb.search).toHaveBeenCalledWith('test query', {
      project_id: undefined,
      threshold: 0.1,
      limit: 5,
    })
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-20b: search — surrounding whitespace trimmed from projectId ─────

  it('knowledgebase_search: trims surrounding whitespace from projectId before filtering', async () => {
    kb.search.mockResolvedValue(sampleResults)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_search', {
        query: 'test query',
        projectId: '  test-project  ',
      }),
    )

    expect(kb.search).toHaveBeenCalledWith('test query', {
      project_id: 'test-project',
      threshold: 0.1,
      limit: 5,
    })
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-21: search — explicit limit 0 is honored (?? not ||) ────────────

  it('knowledgebase_search: honors an explicit limit of 0 (nullish coalescing)', async () => {
    // `args.limit || 5` would silently coerce an explicit 0 to 5; `?? 5`
    // preserves it so the engine receives limit: 0 (LIMIT 0).
    kb.search.mockResolvedValue(sampleResults)

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_search', {
        query: 'test query',
        limit: 0,
      }),
    )

    expect(kb.search).toHaveBeenCalledWith('test query', {
      project_id: undefined,
      threshold: 0.1,
      limit: 0,
    })
    expect(response.isError).toBeUndefined()
  })

  // ── TEST-22: redactConnectionString redacts query-string params ──────────

  it('redactConnectionString: redacts query-string params in URL tokens (belt-and-braces)', async () => {
    // A hypothetical ?password=... query param in a connection string must not
    // survive redaction — the entire query string is replaced with ?***.
    kb.chunkLearnedKnowledge.mockReturnValue(sampleChunks)
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2026-08-02T00:00:00Z',
    })
    kb.upsertChunks.mockRejectedValue(
      new Error(
        'connect ECONNREFUSED postgres://user:secret@host:5432/kb?password=hunter2',
      ),
    )

    const response = await mod.handleToolCall(
      buildRequest('knowledgebase_index', {
        projectId: 'test-project',
        content: markdownWithSession,
      }),
    )

    expect(response.isError).toBe(true)
    // userinfo redacted and host/path preserved
    expect(response.content[0].text).toContain(
      'postgres://***@host:5432/kb?***',
    )
    // neither the password value nor the query key survives
    expect(response.content[0].text).not.toContain('hunter2')
    expect(response.content[0].text).not.toContain('password=')
  })
})
