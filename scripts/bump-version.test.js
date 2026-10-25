// ═════════════════════════════════════════════════════════════════════════════
// bump-version.test.js — Unit tests for the pre-commit version bumper
// ═════════════════════════════════════════════════════════════════════════════
//
// bump-version.js is a top-level script: it reads package.json on import,
// derives the previous major version from `git show HEAD:package.json`, writes
// the new version, and stages the file.  Tests therefore mock `fs` and
// `child_process` so the repository's real package.json is never touched, then
// re-import the module for each scenario with `vi.resetModules()`.
//
// Covered scenarios:
//   1.  SKIP_BUMP=1                      → logs skip, exits 0, no fs/git calls
//   2.  SKIP_BUMP=yes                     → same (any non-empty value is truthy)
//   3.  SKIP_BUMP=0                       → same (string "0" is truthy in Node)
//   4.  SKIP_BUMP=""                      → falsy, bump proceeds
//   5.  Minor bump (same major)           → 1.4.7 → 1.5.0
//   6.  Minor bump with multi-digit minor → 1.10.3 → 1.11.0
//   7.  No HEAD (git show fails)          → falls back to current major, bumps minor
//   8.  Major changed                     → 3.2.1 → 3.0.0
//   9.  Exact serialisation              → 2-space JSON + trailing newline, fields preserved
//  10.  Git commands                     → `git show HEAD:package.json` then `git add package.json`
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

const EXIT_SENTINEL = new Error('__process_exit__')

/**
 * Re-imports bump-version.js with the current mock state.
 *
 * @returns {Promise<void>}
 */
async function loadModule() {
  vi.resetModules()
  await import('./bump-version.js')
}

/**
 * Wires the fs/git mocks for a normal (non-skip) run.
 *
 * @param {object}   opts
 * @param {object}   opts.pkg          - Contents returned for package.json.
 * @param {object}   [opts.prevPkg]    - Contents returned for HEAD:package.json.
 * @param {boolean}  [opts.noHead]     - When true, `git show` throws.
 */
function mockNormalRun({ pkg, prevPkg, noHead = false }) {
  readFileSync.mockReturnValue(JSON.stringify(pkg))
  execSync.mockImplementation((cmd) => {
    if (cmd === 'git show HEAD:package.json') {
      if (noHead) throw new Error('fatal: invalid object name HEAD')
      return JSON.stringify(prevPkg)
    }
    return ''
  })
}

describe('bump-version.js', () => {
  let logSpy
  let exitSpy

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SKIP_BUMP
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.SKIP_BUMP
    logSpy.mockRestore()
    exitSpy.mockRestore()
  })

  // ── SKIP_BUMP guard ──────────────────────────────────────────────────────

  it('SKIP_BUMP=1: logs skip message, exits 0, touches nothing', async () => {
    process.env.SKIP_BUMP = '1'
    exitSpy.mockImplementation(() => {
      throw EXIT_SENTINEL
    })

    await expect(loadModule()).rejects.toBe(EXIT_SENTINEL)

    expect(logSpy).toHaveBeenCalledWith('SKIP_BUMP set — version bump skipped')
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(readFileSync).not.toHaveBeenCalled()
    expect(writeFileSync).not.toHaveBeenCalled()
    expect(execSync).not.toHaveBeenCalled()
  })

  it('SKIP_BUMP=yes: any non-empty value skips the bump', async () => {
    process.env.SKIP_BUMP = 'yes'
    exitSpy.mockImplementation(() => {
      throw EXIT_SENTINEL
    })

    await expect(loadModule()).rejects.toBe(EXIT_SENTINEL)

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('SKIP_BUMP=0: the string "0" is truthy, so the bump is skipped', async () => {
    process.env.SKIP_BUMP = '0'
    exitSpy.mockImplementation(() => {
      throw EXIT_SENTINEL
    })

    await expect(loadModule()).rejects.toBe(EXIT_SENTINEL)

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(execSync).not.toHaveBeenCalled()
  })

  it('SKIP_BUMP="": empty string is falsy, so the bump proceeds', async () => {
    process.env.SKIP_BUMP = ''
    mockNormalRun({
      pkg: { name: 'fixture', version: '1.4.7' },
      prevPkg: { version: '1.4.0' },
    })

    await loadModule()

    expect(exitSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('Version bumped: 1.4.7 → 1.5.0')
  })

  // ── Version arithmetic ───────────────────────────────────────────────────

  it('same major: bumps the minor and resets the patch', async () => {
    mockNormalRun({
      pkg: { name: 'fixture', version: '1.4.7' },
      prevPkg: { version: '1.4.0' },
    })

    await loadModule()

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.version).toBe('1.5.0')
  })

  it('multi-digit minor: increments numerically (1.10.3 → 1.11.0)', async () => {
    mockNormalRun({
      pkg: { name: 'fixture', version: '1.10.3' },
      prevPkg: { version: '1.9.9' },
    })

    await loadModule()

    expect(logSpy).toHaveBeenCalledWith('Version bumped: 1.10.3 → 1.11.0')
  })

  it('no HEAD yet: catch path keeps the current major and bumps the minor', async () => {
    mockNormalRun({
      pkg: { name: 'fixture', version: '2.3.1' },
      noHead: true,
    })

    await loadModule()

    expect(logSpy).toHaveBeenCalledWith('Version bumped: 2.3.1 → 2.4.0')
  })

  it('major changed: normalises to N.0.0', async () => {
    mockNormalRun({
      pkg: { name: 'fixture', version: '3.2.1' },
      prevPkg: { version: '2.9.9' },
    })

    await loadModule()

    expect(logSpy).toHaveBeenCalledWith('Version bumped: 3.2.1 → 3.0.0')
  })

  // ── Serialisation and git side-effects ───────────────────────────────────

  it('writes 2-space JSON with a trailing newline and preserves other fields', async () => {
    const pkg = {
      name: 'fixture',
      version: '1.4.7',
      scripts: { test: 'vitest' },
      keywords: ['a', 'b'],
    }
    mockNormalRun({ pkg, prevPkg: { version: '1.0.0' } })

    await loadModule()

    const [path, contents] = writeFileSync.mock.calls[0]
    expect(path).toMatch(/package\.json$/)
    expect(contents.endsWith('\n')).toBe(true)
    expect(contents).toBe(
      JSON.stringify({ ...pkg, version: '1.5.0' }, null, 2) + '\n',
    )
  })

  it('reads HEAD:package.json then stages package.json', async () => {
    mockNormalRun({
      pkg: { name: 'fixture', version: '0.9.2' },
      prevPkg: { version: '0.9.0' },
    })

    await loadModule()

    expect(execSync).toHaveBeenNthCalledWith(
      1,
      'git show HEAD:package.json',
      { encoding: 'utf8' },
    )
    expect(execSync).toHaveBeenNthCalledWith(2, 'git add package.json')
    expect(execSync).toHaveBeenCalledTimes(2)
  })

  it('reads package.json from the package root', async () => {
    mockNormalRun({
      pkg: { name: 'fixture', version: '1.0.0' },
      prevPkg: { version: '1.0.0' },
    })

    await loadModule()

    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/package\.json$/),
      'utf8',
    )
  })
})
