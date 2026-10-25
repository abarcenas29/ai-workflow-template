// ═════════════════════════════════════════════════════════════════════════════
// sync-phase.test.js — Unit tests for the sync phase module
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests the spawnScript() function's verbose vs non-verbose spawn behavior
// by mocking `child_process.spawn` and inspecting the options passed.
//
// Covered scenarios (5 tests per T10 requirements):
//   1. Uses stdio: 'pipe' when verbose is false (default behavior)
//   2. Uses stdio: 'inherit' when verbose is true
//   3. Sets AI_WORKFLOW_VERBOSE=1 in child env when verbose is true
//   4. Sets AI_WORKFLOW_VERBOSE=0 in child env when verbose is false
//   5. Captures stdout/stderr output correctly in non-verbose mode
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach } from 'vitest'

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
import { runSyncPhase } from './sync-phase.js'
import { logInfo, logWarn } from './utils.js'

// ── Test helpers ──────────────────────────────────────────────────────────

/**
 * Creates a mock child process that mimics a spawned Node.js script.
 *
 * The mock registers event handlers for stdout/stderr 'data' events and
 * the 'close' event, then fires them asynchronously on a microtask.
 * This allows the Promise-based flow in spawnScript() to resolve naturally.
 *
 * @param {object}   opts
 * @param {number|null} [opts.exitCode=0] - Exit code for the 'close' event
 * @param {string}   [opts.stdoutData='']  - Data emitted via stdout 'data'
 * @param {string}   [opts.stderrData='']  - Data emitted via stderr 'data'
 * @param {boolean}  [opts.emitError=false] - Emit an 'error' event instead
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
        errorHandler(new Error('spawn ENOENT'))
      }
      return
    }
    if (stdoutData) {
      stdoutHandlers.forEach((h) => h(Buffer.from(stdoutData)))
    }
    if (stderrData) {
      stderrHandlers.forEach((h) => h(Buffer.from(stderrData)))
    }
    if (closeHandler) closeHandler(exitCode)
  })

  return child
}

/**
 * Builds a minimal context object accepted by runSyncPhase().
 *
 * @param {object} [overrides] - Properties to override on the default context.
 * @returns {object} Context object.
 */
function makeContext(overrides = {}) {
  return {
    consumerRoot: '/fake/consumer',
    verbose: false,
    dryRun: false,
    skipSync: false,
    flags: {},
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('sync-phase verbose spawn behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Pipe mode (non-verbose, default) ───────────────────────────────

  it('uses stdio: "pipe" when verbose is false', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    await runSyncPhase(makeContext({ verbose: false }))

    const calls = vi.mocked(spawn).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call[2]).toBeDefined()
      expect(call[2].stdio).toBe('pipe')
    }
  })

  // ── 2. Inherit mode (verbose) ─────────────────────────────────────────

  it('uses stdio: "inherit" when verbose is true', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    await runSyncPhase(makeContext({ verbose: true }))

    const calls = vi.mocked(spawn).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call[2]).toBeDefined()
      expect(call[2].stdio).toBe('inherit')
    }
  })

  // ── 3. Verbose env var = '1' ──────────────────────────────────────────

  it('sets AI_WORKFLOW_VERBOSE=1 in child env when verbose is true', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    await runSyncPhase(makeContext({ verbose: true }))

    const calls = vi.mocked(spawn).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call[2]).toBeDefined()
      expect(call[2].env).toBeDefined()
      expect(call[2].env.AI_WORKFLOW_VERBOSE).toBe('1')
    }
  })

  // ── 4. Non-verbose env var = '0' ──────────────────────────────────────

  it('sets AI_WORKFLOW_VERBOSE=0 in child env when verbose is false', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    await runSyncPhase(makeContext({ verbose: false }))

    const calls = vi.mocked(spawn).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call[2]).toBeDefined()
      expect(call[2].env).toBeDefined()
      expect(call[2].env.AI_WORKFLOW_VERBOSE).toBe('0')
    }
  })

  // ── 5. Output capture in non-verbose mode ─────────────────────────────

  it('captures stdout/stderr output in non-verbose mode', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({
        exitCode: 0,
        stdoutData: 'copying files...\n',
        stderrData: '',
      }),
    )

    const result = await runSyncPhase(makeContext({ verbose: false }))

    expect(result.action).toBe('completed')
    expect(result.results).toHaveLength(2)
    for (const r of result.results) {
      expect(r.output).toBe('copying files...')
      expect(r.success).toBe(true)
      expect(r.exitCode).toBe(0)
    }
  })
})

// ── Execution paths (skip / dry-run / failures / forwarding) ───────────────

describe('sync-phase execution paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skipSync=true returns "skipped" without spawning anything', async () => {
    const result = await runSyncPhase(makeContext({ skipSync: true }))

    expect(result).toEqual({
      action: 'skipped',
      message: 'Sync phase skipped (--skip-sync)',
      results: [],
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledWith(
      '[setup] Sync phase skipped (--skip-sync)',
    )
  })

  it('dryRun=true returns "dry-run" and mentions the consumer root', async () => {
    const result = await runSyncPhase(makeContext({ dryRun: true }))

    expect(result.action).toBe('dry-run')
    expect(result.message).toContain('sync.js')
    expect(result.message).toContain('normalize-memory.js')
    expect(result.message).toContain('/fake/consumer')
    expect(result.results).toEqual([])
    expect(spawn).not.toHaveBeenCalled()
  })

  it('forwards --force to both child scripts when flags.force is set', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    await runSyncPhase(makeContext({ flags: { force: true } }))

    const argv = vi.mocked(spawn).mock.calls.map((c) => c[1])
    expect(argv).toHaveLength(2)
    for (const args of argv) {
      expect(args).toContain('--force')
    }
  })

  it('does not forward --force by default', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    await runSyncPhase(makeContext({ flags: {} }))

    for (const call of vi.mocked(spawn).mock.calls) {
      expect(call[1]).not.toContain('--force')
    }
  })

  it('treats a non-zero exit as partial and logs each failing script', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => createMockChild({ exitCode: 1 }))
      .mockImplementationOnce(() => createMockChild({ exitCode: 0 }))

    const result = await runSyncPhase(makeContext())

    expect(result.action).toBe('partial')
    expect(result.message).toBe(
      'Sync phase completed with 1 script failure(s)',
    )
    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({ script: 'sync.js', success: false, exitCode: 1 })
    expect(result.results[1]).toMatchObject({ script: 'normalize-memory.js', success: true })

    expect(logWarn).toHaveBeenCalledWith(
      '[setup] Sync phase completed with 1 script failure(s)',
    )
    expect(logWarn).toHaveBeenCalledWith(
      '[setup]   sync.js exited with code 1',
    )
  })

  it('counts every failing script in the partial message', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => createMockChild({ exitCode: 2 }))
      .mockImplementationOnce(() => createMockChild({ exitCode: 3 }))

    const result = await runSyncPhase(makeContext())

    expect(result.action).toBe('partial')
    expect(result.message).toBe('Sync phase completed with 2 script failure(s)')
    expect(logWarn).toHaveBeenCalledWith('[setup]   sync.js exited with code 2')
    expect(logWarn).toHaveBeenCalledWith(
      '[setup]   normalize-memory.js exited with code 3',
    )
  })

  it('forwards child stderr to the parent stderr in non-verbose mode', async () => {
    const writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({
        exitCode: 0,
        stdoutData: 'copied files\n',
        stderrData: 'skipped locally modified file\n',
      }),
    )

    try {
      const result = await runSyncPhase(makeContext({ verbose: false }))

      // Warning text reaches the terminal even though stdout is captured
      expect(writeSpy).toHaveBeenCalledWith('skipped locally modified file\n')
      // ...and the same text is preserved in the captured output
      for (const r of result.results) {
        expect(r.output).toContain('copied files')
        expect(r.output).toContain('skipped locally modified file')
      }
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('verbose mode streams output and does not capture it', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ exitCode: 0 }))

    const result = await runSyncPhase(makeContext({ verbose: true }))

    expect(result.action).toBe('completed')
    for (const r of result.results) {
      expect(r.output).toBe('(streamed to terminal)')
    }
    for (const call of vi.mocked(spawn).mock.calls) {
      expect(call[2].stdio).toBe('inherit')
    }
  })

  it('resolves a spawn error event into a failed result instead of throwing', async () => {
    vi.mocked(spawn).mockImplementation(() => createMockChild({ emitError: true }))

    const result = await runSyncPhase(makeContext())

    expect(result.action).toBe('partial')
    expect(result.results).toHaveLength(2)
    for (const r of result.results) {
      expect(r.success).toBe(false)
      expect(r.exitCode).toBe(-1)
      expect(r.output).toContain('Failed to spawn child process')
      expect(r.output).toContain('spawn ENOENT')
    }
  })

  it('normalises a null exit code (killed by signal) to -1', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      createMockChild({ exitCode: null }),
    )

    const result = await runSyncPhase(makeContext())

    expect(result.action).toBe('partial')
    for (const r of result.results) {
      expect(r.success).toBe(false)
      expect(r.exitCode).toBe(-1)
    }
  })
})
