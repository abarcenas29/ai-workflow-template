// ═════════════════════════════════════════════════════════════════════════════
// knowledgebase-cli.test.js — Unit tests for the knowledgebase CLI tool
// ═════════════════════════════════════════════════════════════════════════════
//
// The CLI reads process.argv and calls core engine functions.  The core engine
// is fully mocked so tests verify CLI-only logic: argument parsing, output
// formatting, error handling, and graceful degradation.
//
// Since main() is not exported and the module self-executes on import, each
// test uses dynamic import() after setting up process.argv + mock return
// values.  vi.resetModules() clears the module cache between tests so each
// import triggers a fresh main() execution.
//
// Covered scenarios (≥12 per plan T16):
//   1.  sync: with DATABASE_URL → indexed message
//   2.  sync: without DATABASE_URL → skip message
//   3.  sync: no new knowledge chunks → nothing to index message
//   4.  search: with results → formatted output
//   5.  search: empty results → "No results found"
//   6.  search: empty query → usage error
//   7.  search: invalid --threshold → error
//   8.  list: with projects → formatted table
//   9.  list: no projects → "No projects indexed yet"
//  10.  stats: returns data → formatted stats summary
//  11.  unknown command → usage displayed
//  12.  error handling: core function throws → caught, exit 1
//  13.  sync: core function calling verifies expected mock interactions
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ═════════════════════════════════════════════════════════════════════════════
// Module mocks — core engine is fully mocked so CLI logic is tested without
// any real database access.
// ═════════════════════════════════════════════════════════════════════════════

vi.mock('./knowledgebase-index.js', () => ({
  chunkLearnedKnowledge: vi.fn(),
  closePool: vi.fn(),
  getStats: vi.fn(),
  listProjects: vi.fn(),
  registerProject: vi.fn(),
  search: vi.fn(),
  upsertChunks: vi.fn(),
}))

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

/** Save original process.argv and DATABASE_URL for restoration in afterEach */
const ORIG_ARGV = [...process.argv]
const ORIG_DB_URL = process.env.DATABASE_URL

/**
 * Build a mock argv as if the CLI were invoked from the command line.
 * @param {...string} args - CLI arguments (e.g. 'sync', '--project', 'foo')
 * @returns {string[]} argv array suitable for process.argv assignment
 */
function buildArgv(...args) {
  return ['/usr/bin/node', '/project/scripts/knowledgebase-cli.js', ...args]
}

/**
 * A result fixture that test search and list commands can return.
 */
const sampleResults = [
  {
    project_id: 'test-project',
    session_date: '2024-07-29',
    session_title: 'Session: 2024-07-29',
    pipeline: 'test-pipeline',
    content: 'Short test content for verification',
    similarity: 0.87,
  },
  {
    project_id: 'test-project',
    session_date: '2024-07-28',
    session_title: 'Session: 2024-07-28',
    pipeline: 'test-pipeline',
    content: 'Another chunk of knowledge with slightly longer content to test the excerpt truncation behavior when the content exceeds one hundred characters in length for proper testing',
    similarity: 0.72,
  },
]

const sampleProjects = [
  {
    project_id: 'project-alpha',
    name: 'Project Alpha',
    chunk_count: 15,
    last_indexed: '2024-07-29T12:00:00Z',
  },
  {
    project_id: 'project-beta',
    name: 'Project Beta',
    chunk_count: 8,
    last_indexed: '2024-07-28T10:00:00Z',
  },
]

const sampleStats = {
  total_projects: 2,
  total_chunks: 23,
  db_size: '128 kB',
  last_sync: '2024-07-29T12:00:00Z',
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('knowledgebase-cli', () => {
  let exitSpy
  let errorSpy
  let logSpy

  beforeEach(() => {
    // Clear module cache so the next dynamic import() executes main() fresh
    vi.resetModules()
    // Reset all vi.fn() instances (mock factory fns + spies)
    vi.clearAllMocks()

    // Prevent process.exit from killing the test runner
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore original argv and env
    process.argv = [...ORIG_ARGV]
    process.env.DATABASE_URL = ORIG_DB_URL
    vi.restoreAllMocks()
  })

  // ── 1. sync command with DATABASE_URL ─────────────────────────────────

  it('sync: with DATABASE_URL indexes chunks and prints summary', async () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test'
    process.argv = buildArgv('sync', '--project', 'test-project')

    // Set up mock return values
    const kb = await import('./knowledgebase-index.js')
    kb.chunkLearnedKnowledge.mockReturnValue([
      {
        project_id: 'test-project',
        session_date: '2024-07-29',
        content: 'test knowledge',
        content_hash: 'abc123',
      },
    ])
    kb.upsertChunks.mockResolvedValue({
      inserted: 1,
      updated: 0,
      skipped: 0,
    })
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2024-07-29T00:00:00Z',
    })
    kb.closePool.mockResolvedValue(undefined)

    // Import triggers main() — must wait for async completion
    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    // Verify the summary message
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Indexed 1 new'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('updated 0'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipped 0'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('test-project'),
    )

    // Verify core functions were called with expected args
    expect(kb.chunkLearnedKnowledge).toHaveBeenCalledOnce()
    expect(kb.registerProject).toHaveBeenCalledWith(
      'test-project',
      'test-project',
    )
    expect(kb.upsertChunks).toHaveBeenCalledOnce()
    expect(kb.closePool).toHaveBeenCalledOnce()

    // Should not have errored or exited
    expect(errorSpy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 2. sync command without DATABASE_URL ─────────────────────────────

  it('sync: without DATABASE_URL prints skip message and exits gracefully', async () => {
    delete process.env.DATABASE_URL
    process.argv = buildArgv('sync', '--project', 'test-project')

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_URL not configured'),
    )

    // Core functions should NOT have been called
    const kb = await import('./knowledgebase-index.js')
    expect(kb.chunkLearnedKnowledge).not.toHaveBeenCalled()
    expect(kb.upsertChunks).not.toHaveBeenCalled()
    expect(kb.registerProject).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 3. sync command with no new knowledge ────────────────────────────

  it('sync: no new knowledge chunks prints nothing-to-index message', async () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test'
    process.argv = buildArgv('sync', '--project', 'test-project')

    const kb = await import('./knowledgebase-index.js')
    kb.chunkLearnedKnowledge.mockReturnValue([])
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('No new knowledge chunks'),
    )
    expect(kb.upsertChunks).not.toHaveBeenCalled()
    expect(kb.registerProject).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 4. search command with results ──────────────────────────────────

  it('search: with results formats output with project, similarity, date', async () => {
    process.argv = buildArgv(
      'search',
      'test query',
      '--project',
      'test-project',
      '--topK',
      '3',
    )

    const kb = await import('./knowledgebase-index.js')
    kb.search.mockResolvedValue(sampleResults)
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    // Should print "Found X result(s):"
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Found 2 result(s)'),
    )

    // Should include formatted result fields
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('test-project'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('0.87'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('2024-07-29'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('2024-07-28'),
    )

    // Should truncate content > 100 chars
    const longContent = sampleResults[1].content
    // eslint-disable-next-line no-unused-expressions
    expect(longContent.length).toBeGreaterThan(100)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('...'),
    )

    expect(kb.search).toHaveBeenCalledWith('test query', {
      project_id: 'test-project',
      threshold: undefined,
      limit: 3,
    })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 5. search command with no results ────────────────────────────────

  it('search: no results prints "No results found" message', async () => {
    process.argv = buildArgv('search', 'nonexistent term')

    const kb = await import('./knowledgebase-index.js')
    kb.search.mockResolvedValue([])
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('No results found'),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 6. search command with empty query ──────────────────────────────

  it('search: empty query prints usage and exits 1', async () => {
    process.argv = buildArgv('search')

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(errorSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    // Should print usage guidance to stderr
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
    )

    // Should exit with code 1
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // ── 7. search with invalid --threshold ──────────────────────────────

  it('search: invalid --threshold value prints error and exits 1', async () => {
    process.argv = buildArgv('search', 'test', '--threshold', '1.5')

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(errorSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--threshold must be a number between'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // ── 8. list command with projects ──────────────────────────────────

  it('list: with projects prints formatted table', async () => {
    process.argv = buildArgv('list')

    const kb = await import('./knowledgebase-index.js')
    kb.listProjects.mockResolvedValue(sampleProjects)
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Indexed projects (2)'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('project-alpha'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Project Alpha'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('15'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('project-beta'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Project Beta'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('8'),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 9. list command with no projects ───────────────────────────────

  it('list: no projects prints empty message', async () => {
    process.argv = buildArgv('list')

    const kb = await import('./knowledgebase-index.js')
    kb.listProjects.mockResolvedValue([])
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('No projects indexed yet'),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 10. stats command ─────────────────────────────────────────────

  it('stats: prints formatted statistics summary', async () => {
    process.argv = buildArgv('stats')

    const kb = await import('./knowledgebase-index.js')
    kb.getStats.mockResolvedValue(sampleStats)
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(logSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Knowledgebase statistics'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Total projects: 2'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Total chunks:   23'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Database size:  128 kB'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Last sync:      2024-07-29'),
    )
    expect(kb.getStats).toHaveBeenCalledOnce()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── 11. unknown command ────────────────────────────────────────────

  it('unknown command: prints usage to stderr and exits 1', async () => {
    process.argv = buildArgv('bogus-command')

    const kb = await import('./knowledgebase-index.js')
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(errorSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('sync'),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('search'),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('list'),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('stats'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // ── 12. error handling: core function throws ─────────────────────────

  it('error handling: when upsertChunks throws, CLI catches and exits 1', async () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test'
    process.argv = buildArgv('sync', '--project', 'test-project')

    const kb = await import('./knowledgebase-index.js')
    kb.chunkLearnedKnowledge.mockReturnValue([
      {
        project_id: 'test-project',
        session_date: '2024-07-29',
        content: 'test',
      },
    ])
    kb.registerProject.mockResolvedValue({
      id: 'test-project',
      first_indexed_at: '2024-07-29T00:00:00Z',
    })
    kb.upsertChunks.mockRejectedValue(
      new Error('Connection refused'),
    )

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(errorSpy).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[knowledgebase] Error:'),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Connection refused'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)

    // closePool should be called even when there's an error (finally block)
    expect(kb.closePool).toHaveBeenCalledOnce()
  })

  // ── 13. sync: --threshold 0.5 passed to search() ────────────────────

  it('search: --threshold 0.5 is passed to search() as threshold option', async () => {
    process.argv = buildArgv('search', 'query', '--threshold', '0.5')

    const kb = await import('./knowledgebase-index.js')
    kb.search.mockResolvedValue(sampleResults)
    kb.closePool.mockResolvedValue(undefined)

    await import('./knowledgebase-cli.js')
    await vi.waitFor(
      () => {
        expect(kb.search).toHaveBeenCalled()
      },
      { interval: 10, timeout: 2000 },
    )

    expect(kb.search).toHaveBeenCalledWith('query', {
      project_id: undefined,
      threshold: 0.5,
      limit: 5,
    })
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
