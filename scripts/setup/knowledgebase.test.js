// ═════════════════════════════════════════════════════════════════════════════
// knowledgebase.test.js — Unit tests for the knowledgebase registration module
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests registerKnowledgebase() from knowledgebase.js — the Phase 6 setup
// module that registers the consumer project in the centralized knowledgebase.
//
// Covered scenarios (6 tests per T17 requirements):
//   1. skipKnowledgebase flag   → early return with action='skipped'
//   2. No DATABASE_URL          → graceful skip with warning message
//   3. Missing project name     → graceful skip
//   4. Successful index         → spawn exits 0, parses chunk counts
//   5. CLI failure             → non-zero exit, action='failed'
//   6. Spawn error event       → ENOENT, graceful handling
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── Mocks (vitest hoists these to the top of the module) ──────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('./ui.js', () => ({
  verbose: vi.fn(),
}))

vi.mock('./utils.js', () => ({
  resolvePackageRoot: vi.fn(() => '/fake/package/root'),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}))

import { spawn } from 'child_process'
import { registerKnowledgebase } from './knowledgebase.js'
import { logWarn } from './utils.js'

// ── Test helpers ──────────────────────────────────────────────────────────

/**
 * Creates a mock child process that mimics a spawned Node.js script.
 *
 * Supports two modes controlled by `emitError`:
 *   - false (default): registers stdout/stderr 'data' handlers and a 'close'
 *     handler, then fires them asynchronously on a microtask so the calling
 *     code's event listeners are registered before the events fire.
 *   - true: registers and fires an 'error' handler instead (for ENOENT etc.)
 *
 * @param {object}   opts
 * @param {number}   [opts.exitCode=0]     - Exit code for the 'close' event
 * @param {string}   [opts.stdoutData='']   - Data emitted via stdout 'data'
 * @param {string}   [opts.stderrData='']   - Data emitted via stderr 'data'
 * @param {boolean}  [opts.emitError=false] - If true, emit 'error' instead
 * @returns {object} Mock child process with .stdout.on, .stderr.on, .on
 */
function createMockChild({
  exitCode = 0,
  stdoutData = '',
  stderrData = '',
  emitError = false,
} = {}) {
  const stdoutHandlers = []
  const stderrHandlers = []
  let closeHandler = null
  let errorHandler = null

  const child = {
    stdout: {
      on: (event, handler) => {
        if (event === 'data') stdoutHandlers.push(handler)
      },
    },
    stderr: {
      on: (event, handler) => {
        if (event === 'data') stderrHandlers.push(handler)
      },
    },
    on: (event, handler) => {
      if (event === 'close') closeHandler = handler
      if (event === 'error') errorHandler = handler
    },
  }

  // Fire events on a microtask so handlers are registered first
  Promise.resolve().then(() => {
    if (emitError) {
      if (errorHandler) {
        errorHandler(new Error('ENOENT: no such file or directory'))
      }
    } else {
      if (stdoutData) {
        stdoutHandlers.forEach((h) => h(Buffer.from(stdoutData)))
      }
      if (stderrData) {
        stderrHandlers.forEach((h) => h(Buffer.from(stderrData)))
      }
      if (closeHandler) closeHandler(exitCode)
    }
  })

  return child
}

/**
 * Builds a minimal context object accepted by registerKnowledgebase().
 *
 * Defaults provide a valid DATABASE_URL and consumerPackageJson.name so that
 * tests can focus on one axis of variation at a time without repeating
 * setup code.
 *
 * @param {object} [overrides] - Properties to override on the default context.
 * @returns {object} Context object.
 */
function makeContext(overrides = {}) {
  return {
    flags: {},
    verbose: false,
    consumerRoot: '/fake/consumer',
    consumerPackageJson: { name: 'test-consumer' },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('registerKnowledgebase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a valid DATABASE_URL by default so only tests that explicitly
    // delete it exercise the missing-URL path.
    process.env.DATABASE_URL = 'postgres://localhost:5432/knowledgebase'
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  // ── 1. Skip flag ───────────────────────────────────────────────────────

  it('returns action="skipped" when flags.skipKnowledgebase is true', async () => {
    const ctx = makeContext({ flags: { skipKnowledgebase: true } })

    const result = await registerKnowledgebase(ctx)

    expect(result).toEqual({
      action: 'skipped',
      message: expect.stringContaining('skip-knowledgebase'),
    })
    // No child process should be spawned when the flag short-circuits
    expect(spawn).not.toHaveBeenCalled()
  })

  // ── 2. Missing DATABASE_URL ───────────────────────────────────────────

  it('returns action="skipped" with warning when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL
    const ctx = makeContext()

    const result = await registerKnowledgebase(ctx)

    expect(result).toEqual({
      action: 'skipped',
      message: expect.stringContaining('DATABASE_URL not configured'),
    })
    // The warning must guide the consumer to set DATABASE_URL and re-run
    // with the scoped package name and the --knowledgebase flag.
    expect(result.message).toContain('@abarcenas/ai-workflow-template')
    expect(result.message).toContain('--knowledgebase')
    expect(spawn).not.toHaveBeenCalled()
  })

  // ── 3. Missing project name ───────────────────────────────────────────

  it('returns action="skipped" when consumerPackageJson has no name field', async () => {
    const ctx = makeContext({ consumerPackageJson: {} })

    const result = await registerKnowledgebase(ctx)

    expect(result).toEqual({
      action: 'skipped',
      message: expect.stringContaining('project name'),
    })
    expect(spawn).not.toHaveBeenCalled()
  })

  // ── 4. Successful index ───────────────────────────────────────────────

  it('returns action="indexed" with parsed chunk counts on successful spawn', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({
        exitCode: 0,
        stdoutData: [
          '[knowledgebase]',
          'Indexed 5 new, updated 3, skipped 2 chunks',
          'from project "test-consumer"',
        ].join(' '),
      }),
    )

    const ctx = makeContext()
    const result = await registerKnowledgebase(ctx)

    expect(result).toEqual({
      action: 'indexed',
      message: expect.stringContaining('8 chunks indexed'),
      chunks_indexed: 8,   // 5 new + 3 updated
      chunks_skipped: 2,
    })
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  // ── 5. CLI failure (non-zero exit) ────────────────────────────────────

  it('returns action="failed" when the CLI exits with a non-zero code', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({
        exitCode: 1,
        stderrData: 'Error: connection refused',
      }),
    )

    const ctx = makeContext()
    const result = await registerKnowledgebase(ctx)

    expect(result).toEqual({
      action: 'failed',
      message: expect.stringContaining('exit code 1'),
    })
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  // ── 6. Spawn error event (ENOENT) ─────────────────────────────────────

  it('gracefully handles spawn error (ENOENT) returning action="failed"', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({ emitError: true }),
    )

    const ctx = makeContext()

    // The function must not throw — the spawn 'error' event resolves the
    // internal promise with success=false, and registerKnowledgebase
    // converts that into a graceful 'failed' result.
    const result = await registerKnowledgebase(ctx)

    expect(result.action).toBe('failed')
    expect(result.message).toContain('exit code -1')
    expect(result.message).toContain('ENOENT')
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})


// ── Execution / option branches ────────────────────────────────────────────

describe('registerKnowledgebase — execution branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = 'postgres://localhost:5432/knowledgebase'
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it('spawns the CLI with the project id and inherits stdio in verbose mode', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({ exitCode: 0 }),
    )

    const result = await registerKnowledgebase(makeContext({ verbose: true }))

    // No chunk-count line in the output → both counters default to zero
    expect(result).toMatchObject({
      action: 'indexed',
      chunks_indexed: 0,
      chunks_skipped: 0,
    })
    expect(result.message).toBe(
      'Registered "test-consumer" — 0 chunks indexed, 0 skipped',
    )

    const call = vi.mocked(spawn).mock.calls[0]
    expect(call[1]).toEqual([
      '/fake/package/root/scripts/knowledgebase-cli.js',
      'sync',
      '--project',
      'test-consumer',
    ])
    expect(call[2].stdio).toBe('inherit')
    expect(call[2].env.INIT_CWD).toBe('/fake/consumer')
  })

  it('falls back to process.cwd() when consumerRoot is missing', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({
        exitCode: 0,
        stdoutData: 'Indexed 1 new, updated 0, skipped 0 chunks from project "test-consumer"',
      }),
    )

    const ctx = makeContext()
    delete ctx.consumerRoot

    const result = await registerKnowledgebase(ctx)

    expect(result.action).toBe('indexed')
    expect(vi.mocked(spawn).mock.calls[0][2].cwd).toBe(process.cwd())
  })

  it('treats a null exit code (signal) as -1', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({ exitCode: null }),
    )

    const result = await registerKnowledgebase(makeContext())

    expect(result.action).toBe('failed')
    expect(result.message).toContain('exit code -1')
  })

  it('gracefully skips when spawning throws synchronously', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('ENOENT: knowledgebase-cli.js is missing')
    })

    const result = await registerKnowledgebase(makeContext())

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('knowledgebase-cli.js not available')
    expect(result.message).toContain('ENOENT')
    expect(logWarn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping Phase 6'),
    )
  })

  it('defaults flags and verbose when the context omits them', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({ exitCode: 0 }),
    )

    const result = await registerKnowledgebase({
      consumerRoot: '/fake/consumer',
      consumerPackageJson: { name: 'test-consumer' },
    })

    expect(result.action).toBe('indexed')
    expect(vi.mocked(spawn).mock.calls[0][2].stdio).toBe('pipe')
  })
})
