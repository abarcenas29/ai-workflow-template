// ═════════════════════════════════════════════════════════════════════════════
// ui.js — User interface / output formatting for the setup command pipeline
// ═════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  UNICODE_CHARS,
  PACKAGE_NAME,
  BIN_NAME,
  SUPPORTED_FLAGS,
} from './constants.js'
import { resolvePackageRoot } from './utils.js'

// ── Colour support ──────────────────────────────────────────────────────────

/** `true` when stdout is a TTY — ANSI escape codes are emitted. */
const useColor = process.stdout.isTTY

/**
 * Builds an ANSI SGR escape sequence.
 *
 * Returns an empty string when colours are disabled (piped / non-TTY output)
 * so that log files stay clean.
 *
 * @param {string} code - SGR parameter(s), e.g. `'1'`, `'32m'`, `'1;31m'`.
 * @returns {string} Escape sequence, or `''` when colours are off.
 */
function ansi(code) {
  return useColor ? `\x1b[${code}` : ''
}

/** ANSI reset. */
const RST = ansi('0m')
/** ANSI bold / increased intensity. */
const BLD = ansi('1m')
/** ANSI dim / decreased intensity. */
const DIM = ansi('2m')
/** ANSI green foreground. */
const GRN = ansi('32m')
/** ANSI yellow foreground. */
const YLW = ansi('33m')
/** ANSI red foreground. */
const RED = ansi('31m')
/** ANSI cyan foreground. */
const CYN = ansi('36m')

/**
 * Read-only colour palette for use by downstream consumers.
 *
 * @type {{ reset: string, bold: string, dim: string, green: string,
 *          yellow: string, red: string, cyan: string }}
 */
export const COLORS = Object.freeze({
  reset: RST,
  bold: BLD,
  dim: DIM,
  green: GRN,
  yellow: YLW,
  red: RED,
  cyan: CYN,
})

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strips ANSI escape sequences from a string.
 *
 * @param {string} str - Input that may contain ANSI codes.
 * @returns {string} Plain text without escape sequences.
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Returns the visible display width of a string, treating ANSI codes as
 * zero-width.
 *
 * @param {string} str - Input that may contain ANSI codes.
 * @returns {number} Number of visible characters.
 */
function visibleWidth(str) {
  return stripAnsi(str).length
}

/**
 * Returns a horizontal rule of the given character, bounded by the terminal
 * width.
 *
 * @param {string} [char='─'] - Character to repeat.
 * @param {number} [maxWidth] - Maximum available width (defaults to terminal
 *                              columns, capped at 72).
 * @returns {string} Rule string.
 */
function rule(char = '\u2500', maxWidth) {
  const width = maxWidth ?? Math.min(process.stdout.columns || 72, 72)
  return char.repeat(width)
}

// ── Version caching ─────────────────────────────────────────────────────────

/** @type {string|null} */
let _version = null

/**
 * Reads the package version from the project's `package.json`.
 *
 * The result is cached after the first successful read so repeated calls
 * (e.g. `header()` then `help()`) don't re-read the filesystem.
 *
 * @returns {string} Semver string (e.g. `'1.29.0'`). Falls back to `'0.0.0'`.
 */
function getVersion() {
  if (_version === null) {
    try {
      const pkgRoot = resolvePackageRoot()
      const pkgPath = join(pkgRoot, 'package.json')
      const raw = readFileSync(pkgPath, 'utf-8')
      _version = JSON.parse(raw).version || '0.0.0'
    } catch {
      _version = '0.0.0'
    }
  }
  return _version
}

// ── Write helpers ───────────────────────────────────────────────────────────

/**
 * Writes one or more lines to stdout.
 *
 * @param {...string} lines - Lines to print.
 */
function write(...lines) {
  for (const line of lines) {
    console.log(line)
  }
}

// ── Public output API ───────────────────────────────────────────────────────

/**
 * Prints the setup banner showing the package name and version.
 *
 * Example:
 *
 *   ────────────────────────────────────────────────────────────
 *     @abarcenas/ai-workflow-template v1.29.0 — Setup
 *   ────────────────────────────────────────────────────────────
 */
export function header() {
  const version = getVersion()
  const width = Math.min(process.stdout.columns || 72, 72)
  const sep = DIM + rule() + RST
  const title =
    `  ${BLD}${PACKAGE_NAME}${RST}` +
    ` ${GRN}v${version}${RST}` +
    ` ${DIM}\u2014${RST}` +
    ` ${BLD}Setup${RST}`

  write()
  write(sep)
  write(title)
  write(sep)
  write()
}

/**
 * Prints a progress step indicator with a rightwards arrow.
 *
 * @param {string} message - Description of the step being performed.
 * @example
 *   step('Checking environment…')
 *   // → Checking environment…
 */
export function step(message) {
  write(` ${UNICODE_CHARS.ARROW} ${message}`)
}

/**
 * Prints a step that completed successfully (checkmark).
 *
 * @param {string} message - Description of the completed step.
 * @example
 *   stepSuccess('Environment ready')
 *   // ✓ Environment ready
 */
export function stepSuccess(message) {
  write(` ${GRN}${UNICODE_CHARS.CHECK}${RST} ${message}`)
}

/**
 * Prints a step that completed with a warning.
 *
 * @param {string} message - Warning description.
 * @example
 *   stepWarn('Husky version is newer than expected')
 *   // ⚠ Husky version is newer than expected
 */
export function stepWarn(message) {
  write(` ${YLW}${UNICODE_CHARS.WARN}${RST} ${message}`)
}

/**
 * Prints a step that failed.
 *
 * @param {string} message - Error description.
 * @example
 *   stepError('Git repository not found')
 *   // ✗ Git repository not found
 */
export function stepError(message) {
  write(` ${RED}${UNICODE_CHARS.CROSS}${RST} ${message}`)
}

/**
 * Prints an informational message (default colour, stdout).
 *
 * @param {string} message - Message to display.
 */
export function info(message) {
  write(message)
}

/**
 * Prints a warning message (yellow, bold) to stderr.
 *
 * @param {string} message - Warning message.
 */
export function warn(message) {
  console.error(`${YLW}${BLD}warning${RST}  ${message}`)
}

/**
 * Prints an error message (red, bold) to stderr.
 *
 * @param {string} message - Error message.
 */
export function error(message) {
  console.error(`${RED}${BLD}error${RST}    ${message}`)
}

/**
 * Prints a success message (green) to stdout.
 *
 * @param {string} message - Success message.
 */
export function success(message) {
  write(`${GRN}${UNICODE_CHARS.CHECK}${RST} ${message}`)
}

/**
 * Prints a bold section header.
 *
 * @param {string} title - Section title.
 * @example
 *   section('Environment Discovery')
 *   // Environment Discovery
 */
export function section(title) {
  write(`${BLD}${title}${RST}`)
}

/**
 * Prints a formatted summary table from phase results.
 *
 * Each result entry is rendered as a single row in a text table with three
 * columns: **Phase**, **Status**, and **Message**.  The table is followed by
 * an overall result line (success / warnings / errors).
 *
 * @param {Array<{ phase: string, status: string, message: string }>} results
 *   Phase results to display.
 *   - `phase`   — Short phase name (e.g. `'discover'`, `'hooks'`)
 *   - `status`  — One of `'success'`, `'warn'`, `'error'`, or a custom string
 *   - `message` — Human-readable result description
 *
 * @example
 *   summary([
 *     { phase: 'discover', status: 'success', message: 'Git repo found' },
 *     { phase: 'hooks',    status: 'error',   message: 'Permission denied' },
 *   ])
 */
export function summary(results) {
  if (!results || results.length === 0) return

  const headerPhase = 'Phase'
  const headerStatus = 'Status'
  const headerMessage = 'Message'

  // ── Column widths ───────────────────────────────────────────────────
  const phases = results.map((r) => r.phase)
  const statuses = results.map((r) => r.status)
  const colPhase = Math.max(headerPhase.length, ...phases.map((s) => s.length))
  const colStatus = Math.max(headerStatus.length, ...statuses.map((s) => s.length))
  const colMsg = Math.max(
    headerMessage.length,
    ...results.map((r) => visibleWidth(r.message || '')),
  )

  // ── Status rendering ────────────────────────────────────────────────
  /**
   * Formats a status string with a colour-coded symbol.
   *
   * @param {string} s - Status key.
   * @returns {string} Formatted status (may contain ANSI codes).
   */
  const fmtStatus = (s) => {
    switch (s) {
      case 'success':
        return `${GRN}${UNICODE_CHARS.CHECK}${RST} success`
      case 'warn':
        return `${YLW}${UNICODE_CHARS.WARN}${RST} warn`
      case 'error':
        return `${RED}${UNICODE_CHARS.CROSS}${RST} error`
      default:
        return s
    }
  }

  // Number of extra invisible chars added by the colour wrapper in fmtStatus
  const statusAnsiExtra =
    useColor && ['success', 'warn', 'error'].includes(statuses[0])
      ? // Each coloured status wraps the symbol in open + close = 2 escapes
        // e.g. `\x1b[32m✓\x1b[0m success` = 5+5+8 = 18 visible, but 28 chars
        // The extra is the ANSI codes length per status
        10
      : 0

  // ── Print ───────────────────────────────────────────────────────────
  write()
  section('Setup Summary')
  divider()

  // Header
  write(
    `  ${headerPhase.padEnd(colPhase)}  ` +
      `${headerStatus.padEnd(colStatus + statusAnsiExtra)}  ` +
      `${headerMessage}`,
  )

  // Separator
  write(
    `  ${DIM}${'\u2500'.repeat(colPhase)}` +
      `  ${'\u2500'.repeat(Math.max(colStatus, 6))}` +
      `  ${'\u2500'.repeat(colMsg)}${RST}`,
  )

  // Rows
  for (const r of results) {
    const p = r.phase.padEnd(colPhase)
    const s = fmtStatus(r.status).padEnd(colStatus + statusAnsiExtra)
    write(`  ${p}  ${s}  ${r.message || ''}`)
  }

  divider()

  // Overall result
  const hasErrors = results.some((r) => r.status === 'error')
  const hasWarnings = results.some((r) => r.status === 'warn')
  if (hasErrors) {
    error('Setup completed with errors.')
  } else if (hasWarnings) {
    warn('Setup completed with warnings.')
  } else {
    success('Setup completed successfully.')
  }
  write()
}

/**
 * Prints usage / help information showing all available CLI flags and their
 * descriptions.
 */
export function help() {
  const version = getVersion()

  // ── Build flag display groups ───────────────────────────────────────
  // Invert SUPPORTED_FLAGS to group short + long forms per canonical key.
  /** @type {Record<string, string[]>} */
  const groups = {}
  for (const [flag, canonical] of Object.entries(SUPPORTED_FLAGS)) {
    ;(groups[canonical] || (groups[canonical] = [])).push(flag)
  }

  // Sort each group so shorter flags come first, then build display text.
  /** @type {Record<string, string>} */
  const display = {}
  let maxLen = 0
  for (const [canonical, flags] of Object.entries(groups)) {
    flags.sort((a, b) => a.length - b.length)
    const text = flags.join(', ')
    display[canonical] = text
    maxLen = Math.max(maxLen, text.length)
  }

  // Ordered flag descriptions.
  /** @type {Record<string, string>} */
  const descriptions = {
    force: 'Overwrite existing hooks (a .bak backup is created)',
    dryRun: 'Show what would be done without making any changes',
    yes: 'Skip confirmation prompts (non-interactive mode)',
    skipHooks: 'Skip git hook installation phase',
    skipPrepare: 'Skip prepare script modification phase',
    skipSync: 'Skip file sync phase',
    help: 'Show this help message and exit',
    version: 'Show the version number and exit',
    quiet: 'Suppress non-error output (quiet mode)',
    verbose: 'Show detailed debug information',
  }

  const order = [
    'force',
    'dryRun',
    'yes',
    'skipHooks',
    'skipPrepare',
    'skipSync',
    'help',
    'version',
    'quiet',
    'verbose',
  ]

  // ── Print help text ─────────────────────────────────────────────────
  write()
  write(`${BLD}${PACKAGE_NAME}${RST} ${GRN}v${version}${RST}`)
  write()
  write(`  ${BLD}Usage:${RST}`)
  write(`    npx ${PACKAGE_NAME} setup [options]`)
  write(`    ${BIN_NAME} [options]`)
  write()
  write(`  ${BLD}Description:${RST}`)
  write(
    `    Sets up a consumer project with git hooks, memory-bank scaffolding,` +
      ` and AI workflow`,
  )
  write(`    integration for the ${PACKAGE_NAME} framework.`)
  write()
  write(`  ${BLD}Options:${RST}`)

  for (const key of order) {
    const d = display[key]
    const desc = descriptions[key] || ''
    if (d) {
      write(`    ${d.padEnd(maxLen)}  ${desc}`)
    }
  }

  write()
  write(`  ${BLD}Examples:${RST}`)
  write(`    npx ${PACKAGE_NAME} setup`)
  write(`    npx ${PACKAGE_NAME} setup --dry-run --verbose`)
  write(`    npx ${PACKAGE_NAME} setup --force --skip-hooks`)
  write(`    ${BIN_NAME} --help`)
  write()
}

/**
 * Prints a horizontal rule for visual separation.
 */
export function divider() {
  write(` ${DIM}${rule()}${RST}`)
}

/**
 * Prints a prominent banner indicating that `--dry-run` mode is active and no
 * files will be modified.
 */
export function dryRunBanner() {
  const width = Math.min(process.stdout.columns || 72, 72)
  const sep = YLW + rule() + RST
  write()
  write(sep)
  write(
    `  ${YLW}${UNICODE_CHARS.WARN}${RST}` +
      ` ${BLD}DRY RUN MODE${RST}` +
      ` ${DIM}\u2014${RST} No files will be modified.` +
      ` ${YLW}${UNICODE_CHARS.WARN}${RST}`,
  )
  write(sep)
  write()
}

/**
 * Prints a banner indicating CI mode is detected and git hooks will be
 * skipped.
 */
export function ciModeBanner() {
  const width = Math.min(process.stdout.columns || 72, 72)
  const sep = CYN + rule() + RST
  write()
  write(sep)
  write(
    `  ${CYN}${UNICODE_CHARS.BULLET}${RST}` +
      ` ${BLD}CI MODE DETECTED${RST}` +
      ` ${DIM}\u2014${RST} Git hooks will be skipped.` +
      ` Use ${CYN}--skip-hooks${RST} to suppress this message.`,
  )
  write(sep)
  write()
}
