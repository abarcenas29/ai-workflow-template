// ═════════════════════════════════════════════════════════════════════════════
// mcp-memory-server.test.js — Unit tests for the memory-bank MCP server
// ═════════════════════════════════════════════════════════════════════════════
//
// The stdio bootstrap is direct-run guarded, so importing the module in tests
// does not open a transport.  The MCP SDK and the index engine are mocked:
// tests exercise the exported `listTools` / `handleToolCall` handlers, the
// formatting of every tool response, error propagation, and the start-up
// (`main` / `bootstrap`) paths — including the fatal path.
//
// Covered scenarios:
//   1.  listTools exposes all five tools with schemas
//   2.  memory_search formats ranked results
//   3.  memory_search defaults (topK=5, no source filter)
//   4.  memory_search honours explicit topK/sourceFile
//   5.  memory_search empty index message
//   6.  memory_search error → isError response
//   7.  memory_rebuild formats counts and stats
//   8.  memory_update with changed files + stats
//   9.  memory_update with no changes
//  10.  memory_get returns content
//  11.  memory_get missing file → available-files hint
//  12.  memory_stats formats the index statistics
//  13.  unknown tool → caught error response
//  14.  main() connects a stdio transport and logs start-up
//  15.  bootstrap() exits 1 when the transport fails
//  16.  direct run auto-bootstraps; empty argv[1] does not
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fileURLToPath } from 'url'

const sdk = vi.hoisted(() => ({ connect: vi.fn() }))

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    setRequestHandler() {}
    connect(transport) {
      return sdk.connect(transport)
    }
  },
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    constructor() {
      this.kind = 'stdio'
    }
  },
}))

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'call-tool',
  ListToolsRequestSchema: 'list-tools',
}))

vi.mock('./memory-index.js', () => ({
  search: vi.fn(),
  rebuildIndex: vi.fn(),
  incrementalUpdate: vi.fn(),
  getFile: vi.fn(),
  getStats: vi.fn(),
}))

/**
 * Builds an MCP tool-call request as the SDK delivers it.
 *
 * @param {string} name
 * @param {object} [args]
 * @returns {{params: {name: string, arguments: object}}}
 */
function buildRequest(name, args = {}) {
  return { params: { name, arguments: args } }
}

const sampleResults = [
  {
    score: 0.91,
    source_file: 'activeContext',
    content: 'Current focus is the coverage push.',
  },
  {
    score: 0.72,
    source_file: 'progress',
    content: 'All five scripts now have tests.',
  },
]

describe('mcp-memory-server', () => {
  let mod
  let index
  let consoleErrorSpy
  let exitSpy
  let originalArgv1

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    originalArgv1 = process.argv[1]
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    mod = await import('./mcp-memory-server.js')
    index = await import('./memory-index.js')
  })

  afterEach(() => {
    process.argv[1] = originalArgv1
    consoleErrorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  // ── 1. listTools ─────────────────────────────────────────────────────────

  it('listTools: exposes the five memory-bank tools with schemas', async () => {
    const result = await mod.listTools()

    expect(result.tools.map((tool) => tool.name)).toEqual([
      'memory_search',
      'memory_rebuild',
      'memory_update',
      'memory_get',
      'memory_stats',
    ])

    const search = result.tools.find((tool) => tool.name === 'memory_search')
    expect(search.inputSchema.required).toEqual(['query'])
    expect(search.inputSchema.properties.topK.default).toBe(5)

    const get = result.tools.find((tool) => tool.name === 'memory_get')
    expect(get.inputSchema.required).toEqual(['file'])
    expect(get.inputSchema.properties.file.enum).toContain('activeContext')
    expect(get.inputSchema.properties.file.enum).toContain(
      'playwright-mcp-configuration',
    )
  })

  // ── 2. memory_search formatting ──────────────────────────────────────────

  it('memory_search: formats ranked results with scores and source files', async () => {
    index.search.mockResolvedValue(sampleResults)

    const response = await mod.handleToolCall(
      buildRequest('memory_search', { query: 'what is the focus?' }),
    )

    expect(index.search).toHaveBeenCalledWith('what is the focus?', {
      topK: 5,
      sourceFile: undefined,
    })

    const text = response.content[0].text
    expect(text).toContain('### Result 1 (score: 0.91)')
    expect(text).toContain('**File:** `activeContext`')
    expect(text).toContain('Current focus is the coverage push.')
    expect(text).toContain('### Result 2 (score: 0.72)')
    expect(text).toContain('\n\n---\n\n')
    expect(response.isError).toBeUndefined()
  })

  // ── 3/4. memory_search options ───────────────────────────────────────────

  it('memory_search: defaults topK to 5 when omitted', async () => {
    index.search.mockResolvedValue([])

    await mod.handleToolCall(buildRequest('memory_search', { query: 'x' }))

    expect(index.search).toHaveBeenCalledWith('x', {
      topK: 5,
      sourceFile: undefined,
    })
  })

  it('memory_search: forwards explicit topK and sourceFile', async () => {
    index.search.mockResolvedValue(sampleResults)

    await mod.handleToolCall(
      buildRequest('memory_search', {
        query: 'focus',
        topK: 2,
        sourceFile: 'activeContext',
      }),
    )

    expect(index.search).toHaveBeenCalledWith('focus', {
      topK: 2,
      sourceFile: 'activeContext',
    })
  })

  // ── 5. Empty results ─────────────────────────────────────────────────────

  it('memory_search: returns a rebuild hint when the index is empty', async () => {
    index.search.mockResolvedValue([])

    const response = await mod.handleToolCall(
      buildRequest('memory_search', { query: 'nothing' }),
    )

    expect(response.content[0].text).toBe(
      'No results found. The index may be empty. Try running memory_rebuild first.',
    )
    expect(response.isError).toBeUndefined()
  })

  // ── 6. Error propagation ─────────────────────────────────────────────────

  it('memory_search: converts engine errors into an isError response', async () => {
    index.search.mockRejectedValue(new Error('vector store offline'))

    const response = await mod.handleToolCall(
      buildRequest('memory_search', { query: 'x' }),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toBe('Error: vector store offline')
  })

  // ── 7. memory_rebuild ────────────────────────────────────────────────────

  it('memory_rebuild: formats indexed/skipped counts and stats', async () => {
    index.rebuildIndex.mockResolvedValue({
      indexed: 12,
      skipped: 3,
      stats: { totalVectors: 42, totalFiles: 8, dbSize: '512 kB' },
    })

    const response = await mod.handleToolCall(
      buildRequest('memory_rebuild', {}),
    )

    const text = response.content[0].text
    expect(text).toContain('Index rebuilt successfully.')
    expect(text).toContain('- Chunks indexed: 12')
    expect(text).toContain('- Chunks skipped (unchanged): 3')
    expect(text).toContain('- Total vectors: 42')
    expect(text).toContain('- Total files: 8')
    expect(text).toContain('- DB size: 512 kB')
    expect(response.isError).toBeUndefined()
  })

  // ── 8. memory_update with changes ────────────────────────────────────────

  it('memory_update: lists changed files and the new vector total', async () => {
    index.incrementalUpdate.mockResolvedValue({
      indexed: 4,
      skipped: 1,
      changed: ['activeContext.md', 'progress.md'],
    })
    index.getStats.mockReturnValue({ totalVectors: 100 })

    const response = await mod.handleToolCall(
      buildRequest('memory_update', {}),
    )

    const text = response.content[0].text
    expect(text).toContain('Index updated incrementally.')
    expect(text).toContain('- Chunks re-indexed: 4')
    expect(text).toContain('- Chunks cached (unchanged): 1')
    expect(text).toContain('- Changed files: activeContext.md, progress.md')
    expect(text).toContain('- Total vectors: 100')
    expect(response.isError).toBeUndefined()
  })

  // ── 9. memory_update with no changes ────────────────────────────────────

  it('memory_update: reports "No files changed." when nothing changed', async () => {
    index.incrementalUpdate.mockResolvedValue({
      indexed: 0,
      skipped: 7,
      changed: [],
    })
    index.getStats.mockReturnValue({ totalVectors: 100 })

    const response = await mod.handleToolCall(
      buildRequest('memory_update', {}),
    )

    expect(response.content[0].text).toContain('- No files changed.')
    expect(response.content[0].text).not.toContain('- Changed files:')
  })

  // ── 10. memory_get ───────────────────────────────────────────────────────

  it('memory_get: returns the full file content', async () => {
    index.getFile.mockReturnValue('# Active Context\n\nWorking.')

    const response = await mod.handleToolCall(
      buildRequest('memory_get', { file: 'activeContext' }),
    )

    expect(index.getFile).toHaveBeenCalledWith('activeContext')
    expect(response.content[0].text).toBe('# Active Context\n\nWorking.')
    expect(response.isError).toBeUndefined()
  })

  // ── 11. memory_get missing file ─────────────────────────────────────────

  it('memory_get: lists available files when the file does not exist', async () => {
    index.getFile.mockReturnValue(undefined)

    const response = await mod.handleToolCall(
      buildRequest('memory_get', { file: 'nope' }),
    )

    const text = response.content[0].text
    expect(text).toContain('File not found: nope.md.')
    expect(text).toContain('Available files: activeContext,')
    expect(response.isError).toBeUndefined()
  })

  // ── 12. memory_stats ─────────────────────────────────────────────────────

  it('memory_stats: formats vector, file, and size statistics', async () => {
    index.getStats.mockReturnValue({
      totalVectors: 321,
      totalFiles: 17,
      dbSize: '1.2 MB',
    })

    const response = await mod.handleToolCall(
      buildRequest('memory_stats', {}),
    )

    const text = response.content[0].text
    expect(text).toContain('**Memory Index Stats**')
    expect(text).toContain('- Total vectors: 321')
    expect(text).toContain('- Total files indexed: 17')
    expect(text).toContain('- Database size: 1.2 MB')
  })

  // ── 13. Unknown tool ─────────────────────────────────────────────────────

  it('unknown tool: returns a caught error response', async () => {
    const response = await mod.handleToolCall(
      buildRequest('memory_bogus', {}),
    )

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toBe('Error: Unknown tool: memory_bogus')
  })

  // ── 14. main() ───────────────────────────────────────────────────────────

  it('main: connects a stdio transport and logs start-up', async () => {
    sdk.connect.mockResolvedValue(undefined)

    await mod.main()

    expect(sdk.connect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'stdio' }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[memory-bank-mcp] Server started via stdio transport',
    )
  })

  // ── 15. bootstrap() fatal path ───────────────────────────────────────────

  it('bootstrap: logs the fatal error and exits 1 when connect fails', async () => {
    const err = new Error('transport exploded')
    sdk.connect.mockRejectedValue(err)

    await mod.bootstrap()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[memory-bank-mcp] Fatal error:',
      err,
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // ── 16. Direct-run guard ─────────────────────────────────────────────────

  it('direct run: auto-bootstraps when argv[1] is this module', async () => {
    const modulePath = fileURLToPath(
      new URL('./mcp-memory-server.js', import.meta.url),
    )
    process.argv[1] = modulePath
    sdk.connect.mockResolvedValue(undefined)
    vi.resetModules()

    await import('./mcp-memory-server.js')

    await vi.waitFor(() => expect(sdk.connect).toHaveBeenCalledTimes(1))
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[memory-bank-mcp] Server started via stdio transport',
    )
  })

  it('imported with an empty argv[1]: does not start the server', async () => {
    process.argv[1] = ''
    vi.resetModules()

    await import('./mcp-memory-server.js')

    expect(sdk.connect).not.toHaveBeenCalled()
  })
})
