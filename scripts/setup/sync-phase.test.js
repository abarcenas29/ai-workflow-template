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

// ── Test helpers ──────────────────────────────────────────────────────────

/**
 * Creates a mock child process that mimics a spawned Node.js script.
 *
 * The mock registers event handlers for stdout/stderr 'data' events and
 * the 'close' event, then fires them asynchronously on a microtask.
 * This allows the Promise-based flow in spawnScript() to resolve naturally.
 *
 * @param {object}   opts
 * @param {number}   [opts.exitCode=0]    - Exit code for the 'close' event
 * @param {string}   [opts.stdoutData='']  - Data emitted via stdout 'data'
 * @param {string}   [opts.stderrData='']  - Data emitted via stderr 'data'
 * @returns {object} Mock child process with .stdout.on, .stderr.on, .on
 */
function createMockChild({ exitCode = 0, stdoutData = '', stderrData = '' } = {}) {
  const stdoutHandlers = []
  const stderrHandlers = []
  let closeHandler = null

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
    },
  }

  // Fire events on a microtask so handlers are registered first
  Promise.resolve().then(() => {
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
