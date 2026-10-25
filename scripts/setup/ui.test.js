// ═════════════════════════════════════════════════════════════════════════════
// ui.test.js — Unit tests for the setup output/formatting module
// ═════════════════════════════════════════════════════════════════════════════
//
// ui.js captures `process.stdout.isTTY` at module-evaluation time, so every
// test loads a fresh module instance after arranging the fake terminal:
//
//   loadUi({ isTTY, columns })  → vi.resetModules() + dynamic import
//
// Output is captured by spying on console.log / console.error (the two writers
// ui.js uses) so the suite stays silent.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { PACKAGE_NAME, BIN_NAME, UNICODE_CHARS } from './constants.js'

// ── Terminal + module loading helpers ──────────────────────────────────────

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns')

/**
 * Overrides `process.stdout.isTTY` / `.columns` for the next module import.
 *
 * @param {object} opts
 * @param {boolean} [opts.isTTY=false] - Whether colour codes should be emitted.
 * @param {number|undefined} [opts.columns] - Simulated terminal width.
 */
function arrangeTerminal({ isTTY = false, columns } = {}) {
  Object.defineProperty(process.stdout, 'isTTY', {
    value: isTTY,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(process.stdout, 'columns', {
    value: columns,
    configurable: true,
    writable: true,
  })
}

/** Restores the real stdout descriptors between tests. */
function restoreTerminal() {
  if (originalIsTTY) Object.defineProperty(process.stdout, 'isTTY', originalIsTTY)
  else delete process.stdout.isTTY
  if (originalColumns) Object.defineProperty(process.stdout, 'columns', originalColumns)
  else delete process.stdout.columns
}

/**
 * Imports a fresh copy of ui.js with the requested fake terminal attached.
 *
 * @param {object} [terminal] - See arrangeTerminal().
 * @returns {Promise<typeof import('./ui.js')>} Fresh module instance.
 */
async function loadUi(terminal = {}) {
  arrangeTerminal(terminal)
  vi.resetModules()
  return import('./ui.js')
}

const tempDirs = new Set()

/** Creates a temp dir containing the given package.json object. */
function packageDir(pkg) {
  const dir = mkdtempSync(join(tmpdir(), 'ui-test-'))
  tempDirs.add(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg), 'utf-8')
  return dir
}

// ── Spies ──────────────────────────────────────────────────────────────────

let logSpy
let errSpy

/** All lines written to stdout by the module under test. */
const out = () => logSpy.mock.calls.map((c) => c[0])
/** All lines written to stderr by the module under test. */
const err = () => errSpy.mock.calls.map((c) => c[0])

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  errSpy.mockRestore()
  restoreTerminal()
  vi.doUnmock('./utils.js')
  vi.resetModules()
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
  tempDirs.clear()
})

// ── Colour support ─────────────────────────────────────────────────────────

describe('COLORS / ANSI support', () => {
  it('exposes empty escape strings when stdout is not a TTY', async () => {
    const ui = await loadUi({ isTTY: false })

    expect(ui.COLORS).toEqual({
      reset: '',
      bold: '',
      dim: '',
      green: '',
      yellow: '',
      red: '',
      cyan: '',
    })
  })

  it('exposes ANSI SGR sequences when stdout is a TTY', async () => {
    const ui = await loadUi({ isTTY: true })

    expect(ui.COLORS.bold).toBe('\x1b[1m')
    expect(ui.COLORS.dim).toBe('\x1b[2m')
    expect(ui.COLORS.green).toBe('\x1b[32m')
    expect(ui.COLORS.yellow).toBe('\x1b[33m')
    expect(ui.COLORS.red).toBe('\x1b[31m')
    expect(ui.COLORS.cyan).toBe('\x1b[36m')
    expect(ui.COLORS.reset).toBe('\x1b[0m')
  })

  it('freezes the palette so consumers cannot mutate shared output state', async () => {
    const ui = await loadUi({ isTTY: true })

    expect(Object.isFrozen(ui.COLORS)).toBe(true)
  })
})

// ── Basic line writers ─────────────────────────────────────────────────────

describe('line writers (no colour)', () => {
  it('step() writes an arrow-prefixed line', async () => {
    const ui = await loadUi()
    ui.step('Checking environment…')

    expect(out()).toEqual([` ${UNICODE_CHARS.ARROW} Checking environment…`])
  })

  it('stepSuccess() writes a check-prefixed line', async () => {
    const ui = await loadUi()
    ui.stepSuccess('Environment ready')

    expect(out()).toEqual([` ${UNICODE_CHARS.CHECK} Environment ready`])
  })

  it('stepWarn() writes a warning-prefixed line', async () => {
    const ui = await loadUi()
    ui.stepWarn('Husky is newer than expected')

    expect(out()).toEqual([` ${UNICODE_CHARS.WARN} Husky is newer than expected`])
  })

  it('stepError() writes a cross-prefixed line', async () => {
    const ui = await loadUi()
    ui.stepError('Git repository not found')

    expect(out()).toEqual([` ${UNICODE_CHARS.CROSS} Git repository not found`])
  })

  it('success() writes a check-prefixed line', async () => {
    const ui = await loadUi()
    ui.success('Done')

    expect(out()).toEqual([`${UNICODE_CHARS.CHECK} Done`])
  })

  it('section() writes the title unchanged', async () => {
    const ui = await loadUi()
    ui.section('Environment Discovery')

    expect(out()).toEqual(['Environment Discovery'])
  })

  it('info() writes the message unchanged', async () => {
    const ui = await loadUi()
    ui.info('plain information')

    expect(out()).toEqual(['plain information'])
  })

  it('warn() writes to stderr with a namespace prefix', async () => {
    const ui = await loadUi()
    ui.warn('hooks were not installed')

    expect(out()).toEqual([])
    expect(err()).toEqual(['warning  hooks were not installed'])
  })

  it('error() writes to stderr with a namespace prefix', async () => {
    const ui = await loadUi()
    ui.error('permission denied')

    expect(out()).toEqual([])
    expect(err()).toEqual(['error    permission denied'])
  })

  it('verbose() is a no-op when disabled', async () => {
    const ui = await loadUi()

    ui.verbose(false, 'hidden')
    ui.verbose(0, 'hidden')
    ui.verbose(undefined, 'hidden')

    expect(out()).toEqual([])
  })

  it('verbose() writes a dimmed ellipsis line when enabled', async () => {
    const ui = await loadUi()
    ui.verbose(true, 'Resolving consumer root…')

    expect(out()).toEqual(['  … Resolving consumer root…'])
  })

  it('verbose() emits ANSI dim codes when colour is on', async () => {
    const ui = await loadUi({ isTTY: true })
    ui.verbose(1, 'spawning')

    expect(out()).toEqual(['  \x1b[2m… spawning\x1b[0m'])
  })

  it('verbose() accepts any truthy value, not just booleans', async () => {
    const ui = await loadUi()
    ui.verbose('yes', 'truthy string')

    expect(out()).toEqual(['  … truthy string'])
  })
})

// ── header / divider ───────────────────────────────────────────────────────

describe('header()', () => {
  it('prints a banner with package name, version and setup label', async () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    )
    const ui = await loadUi()
    ui.header()

    // write() with no arguments is a no-op, so only three lines are emitted.
    const lines = out()
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('─'.repeat(72))
    expect(lines[1]).toContain(PACKAGE_NAME)
    expect(lines[1]).toContain(`v${pkg.version}`)
    expect(lines[1]).toContain('Setup')
    expect(lines[2]).toBe('─'.repeat(72))
  })

  it('respects a narrower terminal width', async () => {
    const ui = await loadUi({ columns: 40 })
    ui.header()

    expect(out()[0]).toBe('─'.repeat(40))
  })

  it('caps the rule at 72 columns on very wide terminals', async () => {
    const ui = await loadUi({ columns: 200 })
    ui.header()

    expect(out()[0]).toBe('─'.repeat(72))
  })

  it('emits colour codes around the title when stdout is a TTY', async () => {
    const ui = await loadUi({ isTTY: true })
    ui.header()

    const title = out()[1]
    expect(title).toContain('\x1b[1m')
    expect(title).toContain('\x1b[32m')
    expect(title.endsWith('\x1b[0m')).toBe(true)
  })
})

describe('divider()', () => {
  it('prints a dimmed rule', async () => {
    const ui = await loadUi()
    ui.divider()

    expect(out()).toEqual([` ${'─'.repeat(72)}`])
  })

  it('honours the terminal width and colour', async () => {
    const ui = await loadUi({ isTTY: true, columns: 20 })
    ui.divider()

    expect(out()).toEqual([` \x1b[2m${'─'.repeat(20)}\x1b[0m`])
  })
})

// ── Banners ────────────────────────────────────────────────────────────────

describe('dryRunBanner()', () => {
  it('prints a bordered dry-run warning', async () => {
    const ui = await loadUi({ columns: 10 })
    ui.dryRunBanner()

    const lines = out()
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('─'.repeat(10))
    expect(lines[1]).toContain('DRY RUN MODE')
    expect(lines[1]).toContain('No files will be modified.')
    expect(lines[2]).toBe('─'.repeat(10))
  })

  it('uses yellow escapes around the rule in colour mode', async () => {
    const ui = await loadUi({ isTTY: true, columns: 8 })
    ui.dryRunBanner()

    expect(out()[0]).toBe(`\x1b[33m${'─'.repeat(8)}\x1b[0m`)
    expect(out()[1]).toContain('\x1b[33m')
  })

  it('falls back to 72 columns when the terminal reports no width', async () => {
    const ui = await loadUi()
    ui.dryRunBanner()

    expect(out()[0]).toBe('─'.repeat(72))
  })
})

describe('ciModeBanner()', () => {
  it('prints a bordered CI-mode notice', async () => {
    const ui = await loadUi({ columns: 12 })
    ui.ciModeBanner()

    const lines = out()
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('─'.repeat(12))
    expect(lines[1]).toContain('CI MODE DETECTED')
    expect(lines[1]).toContain('Git hooks will be skipped.')
    expect(lines[1]).toContain('--skip-hooks')
    expect(lines[2]).toBe('─'.repeat(12))
  })

  it('uses cyan escapes around the rule in colour mode', async () => {
    const ui = await loadUi({ isTTY: true, columns: 6 })
    ui.ciModeBanner()

    expect(out()[0]).toBe(`\x1b[36m${'─'.repeat(6)}\x1b[0m`)
    expect(out()[1]).toContain(UNICODE_CHARS.BULLET)
  })

  it('falls back to 72 columns when the terminal reports no width', async () => {
    const ui = await loadUi()
    ui.ciModeBanner()

    expect(out()[0]).toBe('─'.repeat(72))
  })
})

// ── help() ─────────────────────────────────────────────────────────────────

describe('help()', () => {
  it('prints usage, description, options and examples', async () => {
    const ui = await loadUi()
    ui.help()

    const text = out().join('\n')
    expect(text).toContain(`${PACKAGE_NAME}`)
    expect(text).toContain('Usage:')
    expect(text).toContain(`npx ${PACKAGE_NAME} [options]`)
    expect(text).toContain(`${BIN_NAME} [options]`)
    expect(text).toContain('Description:')
    expect(text).toContain('Options:')
    expect(text).toContain('Examples:')
    expect(text).toContain(`${BIN_NAME} --help`)
  })

  it('documents every canonical flag with its description', async () => {
    const ui = await loadUi()
    ui.help()

    const text = out().join('\n')
    const expected = [
      ['--force', 'Overwrite existing hooks'],
      ['--dry-run', 'Show what would be done'],
      ['--yes', 'Skip confirmation prompts'],
      ['--skip-hooks', 'Skip git hook installation phase'],
      ['--skip-prepare', 'Skip prepare script modification phase'],
      ['--skip-sync', 'Skip file sync phase'],
      ['--skip-knowledgebase', 'Skip knowledgebase registration phase'],
      ['--knowledgebase', 'Run ONLY the knowledgebase registration phase'],
      ['--help', 'Show this help message and exit'],
      ['--version', 'Show the version number and exit'],
      ['--quiet', 'Suppress non-error output'],
      ['--verbose', 'Show detailed debug information'],
    ]
    for (const [flag, description] of expected) {
      expect(text).toContain(flag)
      expect(text).toContain(description)
    }
  })

  it('lists short flags before their long equivalents', async () => {
    const ui = await loadUi()
    ui.help()

    const text = out().join('\n')
    expect(text).toContain('-y, --yes')
    expect(text).toContain('-h, --help')
    expect(text).toContain('-v, --version')
    expect(text).toContain('-q, --quiet')
    expect(text).toContain('-V, --verbose')
    expect(text).toContain('--force')
  })

  it('aligns descriptions to the widest flag group', async () => {
    const ui = await loadUi()
    ui.help()

    const optionLines = out().filter((l) => l.startsWith('    -'))
    expect(optionLines).toHaveLength(12)
    // 4-space indent + widest flag group (20) + 2-space gap = column 26
    for (const line of optionLines) {
      expect(line[26]).not.toBe(' ')
      expect(line.slice(4, 26).trimEnd()).toBe(line.slice(4, 26).trimEnd().trimStart())
    }
  })
})

// ── summary() ──────────────────────────────────────────────────────────────

describe('summary()', () => {
  it('prints nothing for an empty result list', async () => {
    const ui = await loadUi()

    ui.summary([])
    ui.summary(undefined)

    expect(out()).toEqual([])
    expect(err()).toEqual([])
  })

  it('renders one row per phase with aligned columns', async () => {
    const ui = await loadUi()
    ui.summary([
      { phase: 'discover', status: 'success', message: 'ok' },
      { phase: 'hooks', status: 'warn', message: 'skipped' },
    ])

    const lines = out()
    expect(lines[0]).toBe('Setup Summary')
    expect(lines[1]).toBe(` ${'─'.repeat(72)}`)
    expect(lines[2]).toBe('  Phase     Status   Message')
    expect(lines[4]).toBe('  discover  ✓ success  ok')
    expect(lines[5]).toBe('  hooks     ⚠ warn   skipped')
    expect(err()).toEqual(['warning  Setup completed with warnings.'])
  })

  it('renders success status with a check symbol', async () => {
    const ui = await loadUi()
    ui.summary([{ phase: 'sync', status: 'success', message: 'done' }])

    expect(out().some((l) => l.includes(`${UNICODE_CHARS.CHECK} success`))).toBe(true)
  })

  it('renders error status with a cross symbol', async () => {
    const ui = await loadUi()
    ui.summary([{ phase: 'hooks', status: 'error', message: 'denied' }])

    expect(out().some((l) => l.includes(`${UNICODE_CHARS.CROSS} error`))).toBe(true)
    expect(err()).toEqual(['error    Setup completed with errors.'])
  })

  it('passes custom status strings through unchanged', async () => {
    const ui = await loadUi()
    ui.summary([{ phase: 'custom', status: 'pending-review', message: 'later' }])

    expect(out().some((l) => l.includes('pending-review'))).toBe(true)
  })

  it('treats a missing message as an empty string', async () => {
    const ui = await loadUi()
    ui.summary([
      { phase: 'sync', status: 'success' },
      { phase: 'hooks', status: 'success', message: null },
    ])

    // colMsg falls back to the width of the "Message" header (7)
    expect(out()[2]).toBe('  Phase  Status   Message')
  })

  it('reports errors as fatal even when warnings are also present', async () => {
    const ui = await loadUi()
    ui.summary([
      { phase: 'a', status: 'warn', message: 'w' },
      { phase: 'b', status: 'error', message: 'e' },
    ])

    expect(err()).toEqual(['error    Setup completed with errors.'])
    expect(out().every((l) => !l.includes('completed with warnings'))).toBe(true)
  })

  it('uses ANSI-aware widths when colour output is enabled', async () => {
    const ui = await loadUi({ isTTY: true })
    ui.summary([{ phase: 'hooks', status: 'success', message: 'ok' }])

    const lines = out()
    // The coloured status wrapper is 19 chars; statusAnsiExtra keeps the
    // header and rows aligned with a 10-char pad.
    expect(lines[2]).toContain('Phase')
    expect(lines[4]).toContain('\x1b[32m')
    expect(lines[4]).toContain('success')
    expect(err()).toEqual([])
  })

  it('keeps the status column wide enough for the header on short statuses', async () => {
    const ui = await loadUi()
    ui.summary([{ phase: 'x', status: 'e', message: 'm' }])

    // Status header is 6 chars → separator uses max(colStatus, 6)
    const separator = out()[3]
    expect(separator).toContain('─'.repeat(6))
  })

  it('accounts for wide unicode messages when sizing the message column', async () => {
    const ui = await loadUi()
    ui.summary([{ phase: 'utf', status: 'success', message: '✓⚠→•✓' }])

    // Message header (7) is narrower than the 5-symbol message? no — 7 wins;
    // the row must still contain the untouched message.
    expect(out().some((l) => l.includes('✓⚠→•✓'))).toBe(true)
  })
})

// ── Version resolution ─────────────────────────────────────────────────────

describe('version resolution', () => {
  it('falls back to 0.0.0 when package.json cannot be read', async () => {
    vi.resetModules()
    vi.doMock('./utils.js', () => ({
      resolvePackageRoot: () => '/definitely/not/a/real/package/root',
    }))

    const ui = await import('./ui.js')
    ui.header()

    expect(out().join('\n')).toContain('v0.0.0')
  })

  it('falls back to 0.0.0 when the version field is missing', async () => {
    const dir = packageDir({ name: 'no-version-here' })
    vi.resetModules()
    vi.doMock('./utils.js', () => ({
      resolvePackageRoot: () => dir,
    }))

    const ui = await import('./ui.js')
    ui.header()

    expect(out().join('\n')).toContain('v0.0.0')
  })

  it('caches the version across header() and help() calls', async () => {
    const ui = await loadUi()
    ui.header()
    ui.help()

    const versions = out()
      .filter((l) => l.includes('v'))
      .map((l) => (l.match(/v(\d+\.\d+\.\d+)/) || [])[1])
      .filter(Boolean)
    expect(new Set(versions).size).toBe(1)
  })
})
