// ═════════════════════════════════════════════════════════════════════════════
// playwright-mcp-launcher.test.js — Unit tests for the MCP launcher
// ═════════════════════════════════════════════════════════════════════════════
//
// `spawn` is mocked so no MCP server is ever launched.  Signal handling and
// exit-code propagation are exercised through injected fakes (an EventEmitter
// double for the process and a fake child), plus a direct-run import that
// verifies the CLI bootstrap branch.
//
// Covered scenarios:
//   1.  default args (no env flags)
//   2.  HEADLESS=true adds --headless
//   3.  HEADLESS=false does not
//   4.  VIEWPORT adds --viewport <size>
//   5.  HEADLESS + VIEWPORT together
//   6.  spawn is called as `npx <args>` with inherited stdio + shell
//   7.  exit code 0 is forwarded
//   8.  non-zero exit code is forwarded
//   9.  missing exit code falls back to 0
//  10.  SIGINT / SIGTERM are forwarded to the child
//  11.  launch returns the child
//  12.  direct run auto-launches; imported elsewhere it does not
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'

const cp = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock('node:child_process', () => ({
  spawn: cp.spawn,
}))

import { spawn } from 'node:child_process'
import { buildArgs, launch } from './playwright-mcp-launcher.js'

/**
 * Creates a fake ChildProcess.
 *
 * @returns {object} Fake child with kill/on and a helper to emit 'exit'.
 */
function makeChild() {
  const handlers = {}
  return {
    kill: vi.fn(),
    on: vi.fn((event, handler) => {
      handlers[event] = handler
    }),
    emitExit(code) {
      handlers.exit?.(code)
    },
  }
}

describe('playwright-mcp-launcher', () => {
  let child

  beforeEach(() => {
    vi.clearAllMocks()
    child = makeChild()
    spawn.mockReturnValue(child)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── buildArgs ────────────────────────────────────────────────────────────

  it('buildArgs: returns only the package when no env flags are set', () => {
    expect(buildArgs({})).toEqual(['@playwright/mcp@latest'])
  })

  it('buildArgs: HEADLESS=true adds --headless', () => {
    expect(buildArgs({ HEADLESS: 'true' })).toEqual([
      '@playwright/mcp@latest',
      '--headless',
    ])
  })

  it('buildArgs: HEADLESS=false does not add --headless', () => {
    expect(buildArgs({ HEADLESS: 'false' })).toEqual(['@playwright/mcp@latest'])
  })

  it('buildArgs: VIEWPORT adds a two-token viewport flag', () => {
    expect(buildArgs({ VIEWPORT: '1280x720' })).toEqual([
      '@playwright/mcp@latest',
      '--viewport',
      '1280x720',
    ])
  })

  it('buildArgs: combines headless and viewport flags', () => {
    expect(buildArgs({ HEADLESS: 'true', VIEWPORT: '800x600' })).toEqual([
      '@playwright/mcp@latest',
      '--headless',
      '--viewport',
      '800x600',
    ])
  })

  // ── launch ───────────────────────────────────────────────────────────────

  it('launch: spawns npx with inherited stdio and shell', () => {
    launch({ env: {}, proc: new EventEmitter(), exit: vi.fn() })

    expect(spawn).toHaveBeenCalledWith('npx', ['@playwright/mcp@latest'], {
      stdio: 'inherit',
      shell: true,
    })
  })

  it('launch: returns the spawned child', () => {
    const returned = launch({
      env: {},
      proc: new EventEmitter(),
      exit: vi.fn(),
    })

    expect(returned).toBe(child)
  })

  it('launch: forwards exit code 0', () => {
    const exit = vi.fn()
    launch({ env: {}, proc: new EventEmitter(), exit })

    child.emitExit(0)

    expect(exit).toHaveBeenCalledWith(0)
  })

  it('launch: forwards a non-zero exit code', () => {
    const exit = vi.fn()
    launch({ env: {}, proc: new EventEmitter(), exit })

    child.emitExit(5)

    expect(exit).toHaveBeenCalledWith(5)
  })

  it('launch: falls back to 0 when no exit code is provided', () => {
    const exit = vi.fn()
    launch({ env: {}, proc: new EventEmitter(), exit })

    child.emitExit(undefined)

    expect(exit).toHaveBeenCalledWith(0)
  })

  it('launch: forwards SIGINT to the child', () => {
    const proc = new EventEmitter()
    launch({ env: {}, proc, exit: vi.fn() })

    proc.emit('SIGINT')

    expect(child.kill).toHaveBeenCalledWith('SIGINT')
  })

  it('launch: forwards SIGTERM to the child', () => {
    const proc = new EventEmitter()
    launch({ env: {}, proc, exit: vi.fn() })

    proc.emit('SIGTERM')

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  // ── Direct-run guard ─────────────────────────────────────────────────────

  it('direct run: auto-launches when argv[1] is this module', async () => {
    const modulePath = fileURLToPath(
      new URL('./playwright-mcp-launcher.js', import.meta.url),
    )
    const originalArgv1 = process.argv[1]
    const intListeners = process.listeners('SIGINT')
    const termListeners = process.listeners('SIGTERM')
    process.argv[1] = modulePath

    try {
      vi.resetModules()
      await import('./playwright-mcp-launcher.js')

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['@playwright/mcp@latest']),
        { stdio: 'inherit', shell: true },
      )
    } finally {
      process.argv[1] = originalArgv1
      for (const listener of process.listeners('SIGINT')) {
        if (!intListeners.includes(listener)) {
          process.removeListener('SIGINT', listener)
        }
      }
      for (const listener of process.listeners('SIGTERM')) {
        if (!termListeners.includes(listener)) {
          process.removeListener('SIGTERM', listener)
        }
      }
    }
  })

  it('imported with an empty argv[1]: does not launch', async () => {
    const originalArgv1 = process.argv[1]
    process.argv[1] = ''

    try {
      vi.resetModules()
      await import('./playwright-mcp-launcher.js')

      expect(spawn).not.toHaveBeenCalled()
    } finally {
      process.argv[1] = originalArgv1
    }
  })
})
