// ═════════════════════════════════════════════════════════════════════════════
// husky-init.test.js — Unit tests for the husky initialization phase
// ═════════════════════════════════════════════════════════════════════════════
//
// The module resolves husky from the CONSUMER's node_modules and calls its
// programmatic API.  Tests build throwaway consumer projects in temp dirs with
// a fake `node_modules/husky` fixture, so the real repository is never touched.
// `child_process.execSync` and `./ui.js` are mocked; `fs` is real.
//
// Covered scenarios:
//   1.  dryRun wins over every other flag      → action=dry-run, nothing runs
//   2.  CI environment                         → action=skipped + warning
//   3.  No .git directory                      → action=skipped + console.warn
//   4.  husky not installed (resolve fails)    → action=skipped + install hint
//   5.  husky module throws on import          → action=skipped (same catch)
//   6.  core.hooksPath unset succeeds          → execSync called, action=initialized
//   7.  core.hooksPath unset throws            → swallowed, action=initialized
//   8.  husky() throws                         → action=failed with message
//   9.  .husky/_/h missing post-condition      → action=failed
//  10.  idempotent second run                  → action=initialized both times
//  11.  verbose flag forwards progress messages
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('./ui.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  verbose: vi.fn(),
}))

import { execSync } from 'child_process'
import { info, warn, verbose } from './ui.js'
import { initHusky } from './husky-init.js'

// ── Fake husky fixtures ───────────────────────────────────────────────────

const HUSKY_IMPLEMENTATIONS = {
  success: `
const fs = require('fs')
const path = require('path')
module.exports = function husky(root) {
  const dir = path.join(root, '.husky', '_')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'h'), '#!/bin/sh\\n')
}
`,
  throws: `
module.exports = function husky() {
  throw new Error('husky boom')
}
`,
  noop: `
module.exports = function husky() {}
`,
  importThrows: `
throw new Error('corrupt husky module')
`,
}

const tempDirs = new Set()

/**
 * Creates a temporary consumer project.
 *
 * @param {object}   [options]
 * @param {string}   [options.husky='success'] - Fake husky behaviour key.
 * @param {boolean}  [options.withPackageJson=true]
 * @returns {string} Absolute consumer root.
 */
function createConsumer({ husky = 'success', withPackageJson = true } = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'husky-init-test-'))
  tempDirs.add(dir)

  if (withPackageJson) {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2) + '\n',
    )
  }

  if (husky) {
    const huskyDir = join(dir, 'node_modules', 'husky')
    mkdirSync(huskyDir, { recursive: true })
    writeFileSync(
      join(huskyDir, 'package.json'),
      JSON.stringify({ name: 'husky', version: '9.0.0', main: 'index.js' }),
    )
    writeFileSync(join(huskyDir, 'index.js'), HUSKY_IMPLEMENTATIONS[husky])
  }

  return dir
}

/**
 * Builds the context object accepted by initHusky().
 *
 * @param {string} consumerRoot
 * @param {object} [overrides]
 * @returns {object}
 */
function makeContext(consumerRoot, overrides = {}) {
  return {
    consumerRoot,
    hasGit: true,
    dryRun: false,
    isCI: false,
    verbose: false,
    ...overrides,
  }
}

describe('initHusky', () => {
  let consoleWarnSpy

  beforeEach(() => {
    vi.clearAllMocks()
    execSync.mockReturnValue('')
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
    tempDirs.clear()
  })

  // ── 1. dry-run ───────────────────────────────────────────────────────────

  it('dryRun: reports the planned action and touches nothing (wins over other flags)', async () => {
    const dir = createConsumer()

    const result = await initHusky(
      makeContext(dir, { dryRun: true, isCI: true, hasGit: false }),
    )

    expect(result).toEqual({
      action: 'dry-run',
      message: 'Would initialize husky',
    })
    expect(info).toHaveBeenCalledWith(
      '[setup] Would initialize husky (generate .husky/_/ shims, set core.hooksPath)',
    )
    expect(execSync).not.toHaveBeenCalled()
    expect(existsSync(join(dir, '.husky'))).toBe(false)
  })

  // ── 2. CI ────────────────────────────────────────────────────────────────

  it('CI environment: skips with a warning', async () => {
    const dir = createConsumer()

    const result = await initHusky(makeContext(dir, { isCI: true }))

    expect(result).toEqual({
      action: 'skipped',
      message: 'Skipping husky init in CI environment',
    })
    expect(warn).toHaveBeenCalledWith(
      '[setup] CI environment detected — skipping husky init',
    )
    expect(execSync).not.toHaveBeenCalled()
  })

  // ── 3. No git repository ────────────────────────────────────────────────

  it('no .git directory: skips and warns on the console', async () => {
    const dir = createConsumer()

    const result = await initHusky(makeContext(dir, { hasGit: false }))

    expect(result).toEqual({
      action: 'skipped',
      message: 'No .git directory — not a git repository',
    })
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[setup] No .git directory — not a git repository',
    )
    expect(execSync).not.toHaveBeenCalled()
  })

  // ── 4. husky not installed ──────────────────────────────────────────────

  it('husky not installed: skips with an install hint', async () => {
    const dir = createConsumer({ husky: null })

    const result = await initHusky(makeContext(dir))

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('npm install husky --save-dev')
    expect(verbose).toHaveBeenCalledWith(
      false,
      'husky not found — skipping init',
    )
    expect(execSync).not.toHaveBeenCalled()
  })

  // ── 5. husky import failure ─────────────────────────────────────────────

  it('corrupt husky module: import throws, treated as not installed', async () => {
    const dir = createConsumer({ husky: 'importThrows' })

    const result = await initHusky(makeContext(dir))

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('husky is not installed')
  })

  // ── 6. Success ───────────────────────────────────────────────────────────

  it('success: clears core.hooksPath and verifies .husky/_/h', async () => {
    const dir = createConsumer()

    const result = await initHusky(makeContext(dir))

    expect(result).toEqual({
      action: 'initialized',
      message: 'Husky initialized successfully',
    })
    expect(execSync).toHaveBeenCalledWith(
      'git config --local --unset core.hooksPath',
      { cwd: dir, stdio: 'pipe' },
    )
    expect(existsSync(join(dir, '.husky', '_', 'h'))).toBe(true)
  })

  // ── 7. Unset failure is swallowed ───────────────────────────────────────

  it('unset failure: continues and still initializes', async () => {
    const dir = createConsumer()
    execSync.mockImplementation(() => {
      throw new Error('key does not exist')
    })

    const result = await initHusky(makeContext(dir))

    expect(result.action).toBe('initialized')
    expect(existsSync(join(dir, '.husky', '_', 'h'))).toBe(true)
  })

  // ── 8. husky() throws ───────────────────────────────────────────────────

  it('husky() throwing: returns action=failed with the error message', async () => {
    const dir = createConsumer({ husky: 'throws' })

    const result = await initHusky(makeContext(dir))

    expect(result).toEqual({ action: 'failed', message: 'husky boom' })
  })

  // ── 9. Post-condition failure ───────────────────────────────────────────

  it('post-condition: missing .husky/_/h returns action=failed', async () => {
    const dir = createConsumer({ husky: 'noop' })

    const result = await initHusky(makeContext(dir))

    expect(result.action).toBe('failed')
    expect(result.message).toContain('.husky/_/h not found after init')
  })

  // ── 10. Idempotency ─────────────────────────────────────────────────────

  it('is idempotent: a second run still reports initialized', async () => {
    const dir = createConsumer()

    const first = await initHusky(makeContext(dir))
    const second = await initHusky(makeContext(dir))

    expect(first.action).toBe('initialized')
    expect(second.action).toBe('initialized')
    expect(existsSync(join(dir, '.husky', '_', 'h'))).toBe(true)
  })

  // ── 11. Verbose progress ────────────────────────────────────────────────

  it('verbose: emits progress messages for each step', async () => {
    const dir = createConsumer()

    await initHusky(makeContext(dir, { verbose: true }))

    const messages = verbose.mock.calls.map(([, message]) => message)
    expect(verbose).toHaveBeenCalledWith(
      true,
      'Resolving husky from consumer node_modules…',
    )
    expect(messages).toContain('Clearing stale core.hooksPath…')
    expect(messages).toContain('Calling husky()…')
    expect(messages).toContain('Verifying .husky/_/h exists…')
  })
})
