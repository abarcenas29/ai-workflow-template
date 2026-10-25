// ═════════════════════════════════════════════════════════════════════════════
// memory-cli.test.js — Unit tests for the manual memory-index CLI
// ═════════════════════════════════════════════════════════════════════════════
//
// The CLI is a top-level script: it reads process.argv, dispatches one command,
// and always closes the DB in `finally`.  Tests mock ./memory-index.js, set
// argv, and re-import the module per scenario.  `process.exit` is stubbed so
// the assertions can inspect the requested exit code without terminating.
//
// Covered scenarios:
//   1.  search <query>                    → JSON results
//   2.  search defaults                   → topK=5, no file filter
//   3.  search --topK/--file             → flags parsed and forwarded
//   4.  search with non-numeric --topK   → falls back to 5
//   5.  search with no results            → empty result + rebuild hint
//   6.  search without a query            → usage + exit 1
//   7.  rebuild                           → status ok + result fields
//   8.  update                            → status ok + result fields
//   9.  get <fileId>                      → raw content
//  10.  get without a fileId             → usage + exit 1
//  11.  get unknown file                 → error + exit 1
//  12.  stats                            → JSON stats
//  13.  unknown command                  → usage + exit 1
//  14.  no command                       → usage + exit 1
//  15.  engine failure                   → `Error: …` + exit 1
//  16.  flags at end of argv             → treated as positional arguments
//  17.  closeDB                          → always called (finally)
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const index = vi.hoisted(() => ({
  search: vi.fn(),
  rebuildIndex: vi.fn(),
  incrementalUpdate: vi.fn(),
  getFile: vi.fn(),
  getStats: vi.fn(),
  closeDB: vi.fn(),
}))

vi.mock('./memory-index.js', () => index)

describe('memory-cli.js', () => {
  let logSpy
  let errorSpy
  let exitSpy
  let originalArgv

  beforeEach(() => {
    vi.clearAllMocks()
    originalArgv = process.argv
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    logSpy.mockRestore()
    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  /**
   * Runs the CLI with the given arguments and waits for `closeDB` (the
   * `finally` block), which marks command completion.
   *
   * @param {string[]} argv - Arguments after the script name.
   * @returns {Promise<void>}
   */
  async function runCli(argv) {
    process.argv = ['node', 'scripts/memory-cli.js', ...argv]
    vi.resetModules()
    await import('./memory-cli.js')
    await vi.waitFor(() => expect(index.closeDB).toHaveBeenCalled())
  }

  /**
   * Returns the parsed first console.log payload.
   *
   * @returns {object}
   */
  function loggedJson() {
    return JSON.parse(logSpy.mock.calls[0][0])
  }

  // ── search ───────────────────────────────────────────────────────────────

  it('search: prints the results as JSON', async () => {
    const results = [
      { source_file: 'activeContext', content: 'focus', score: 0.9 },
    ]
    index.search.mockResolvedValue(results)

    await runCli(['search', 'focus'])

    expect(index.search).toHaveBeenCalledWith('focus', {
      topK: 5,
      sourceFile: undefined,
    })
    expect(loggedJson()).toEqual({ results })
  })

  it('search: joins multiple positional words into one query', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search', 'where', 'are', 'we'])

    expect(index.search).toHaveBeenCalledWith('where are we', {
      topK: 5,
      sourceFile: undefined,
    })
  })

  it('search: parses --topK and --file', async () => {
    index.search.mockResolvedValue([])

    await runCli([
      'search',
      'hello',
      'world',
      '--topK',
      '2',
      '--file',
      'activeContext',
    ])

    expect(index.search).toHaveBeenCalledWith('hello world', {
      topK: 2,
      sourceFile: 'activeContext',
    })
  })

  it('search: a non-numeric --topK falls back to 5', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search', 'q', '--topK', 'not-a-number'])

    expect(index.search).toHaveBeenCalledWith('q', {
      topK: 5,
      sourceFile: undefined,
    })
  })

  it('search: prints an empty result with a rebuild hint', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search', 'nothing'])

    expect(loggedJson()).toEqual({
      results: [],
      hint: 'No results. Try running "rebuild" first.',
    })
  })

  it('search: missing query prints usage and exits 1', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search'])

    expect(errorSpy).toHaveBeenCalledWith(
      'Usage: node scripts/memory-cli.js search "<query>" [--topK 5] [--file name]',
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('search: flags at the end of argv become positional query words', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search', 'q', '--topK'])

    expect(index.search).toHaveBeenCalledWith('q --topK', {
      topK: 5,
      sourceFile: undefined,
    })
  })

  it('search: a trailing --file without a value becomes positional', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search', 'q', '--topK', '2', '--file'])

    expect(index.search).toHaveBeenCalledWith('q --file', {
      topK: 2,
      sourceFile: undefined,
    })
  })

  // ── rebuild / update ─────────────────────────────────────────────────────

  it('rebuild: prints status ok followed by the engine result', async () => {
    index.rebuildIndex.mockResolvedValue({ indexed: 12, skipped: 3 })

    await runCli(['rebuild'])

    expect(index.rebuildIndex).toHaveBeenCalledTimes(1)
    expect(loggedJson()).toEqual({
      status: 'ok',
      indexed: 12,
      skipped: 3,
    })
  })

  it('update: prints status ok followed by the engine result', async () => {
    index.incrementalUpdate.mockResolvedValue({ indexed: 4, skipped: 0 })

    await runCli(['update'])

    expect(index.incrementalUpdate).toHaveBeenCalledTimes(1)
    expect(loggedJson()).toEqual({ status: 'ok', indexed: 4, skipped: 0 })
  })

  // ── get ──────────────────────────────────────────────────────────────────

  it('get: prints the raw file content', async () => {
    index.getFile.mockReturnValue('# Active Context\n\nWorking.')

    await runCli(['get', 'activeContext'])

    expect(index.getFile).toHaveBeenCalledWith('activeContext')
    expect(logSpy).toHaveBeenCalledWith('# Active Context\n\nWorking.')
  })

  it('get: missing fileId prints usage and exits 1', async () => {
    index.getFile.mockReturnValue(undefined)

    await runCli(['get'])

    expect(errorSpy).toHaveBeenCalledWith(
      'Usage: node scripts/memory-cli.js get <fileId>',
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('get: unknown file prints an error and exits 1', async () => {
    index.getFile.mockReturnValue(undefined)

    await runCli(['get', 'missing'])

    expect(index.getFile).toHaveBeenCalledWith('missing')
    expect(errorSpy).toHaveBeenCalledWith('File not found: missing')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // ── stats ────────────────────────────────────────────────────────────────

  it('stats: prints the index statistics as JSON', async () => {
    const stats = { totalVectors: 42, totalFiles: 7, dbSize: '256 kB' }
    index.getStats.mockReturnValue(stats)

    await runCli(['stats'])

    expect(index.getStats).toHaveBeenCalledTimes(1)
    expect(loggedJson()).toEqual(stats)
  })

  // ── unknown / missing command ────────────────────────────────────────────

  it('unknown command: prints usage and exits 1', async () => {
    await runCli(['bogus'])

    expect(errorSpy).toHaveBeenCalledWith(
      'Usage: node scripts/memory-cli.js <search|rebuild|update|get|stats> [args...]',
    )
    expect(errorSpy).toHaveBeenCalledWith('Commands:')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('no command: prints usage and exits 1', async () => {
    await runCli([])

    expect(errorSpy).toHaveBeenCalledWith(
      'Usage: node scripts/memory-cli.js <search|rebuild|update|get|stats> [args...]',
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // ── Error handling ───────────────────────────────────────────────────────

  it('engine failure: prints `Error: <message>` and exits 1', async () => {
    index.search.mockRejectedValue(new Error('database is locked'))

    await runCli(['search', 'anything'])

    expect(errorSpy).toHaveBeenCalledWith('Error: database is locked')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(index.closeDB).toHaveBeenCalledTimes(1)
  })

  it('always closes the DB, including on success', async () => {
    index.search.mockResolvedValue([])

    await runCli(['search', 'q'])

    expect(index.closeDB).toHaveBeenCalledTimes(1)
  })
})
