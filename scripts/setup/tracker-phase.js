// ═════════════════════════════════════════════════════════════════════════════
// tracker-phase.js — Setup Phase 8: create the GitHub Issues tracker labels
// ═════════════════════════════════════════════════════════════════════════════
//
// Creates the labels declared in the packaged tracker document
// (`.agents/config/issue-tracker.md`) on the consumer's GitHub repository.
//
// The label names, colours, and descriptions are **parsed from that document**
// — this module holds no label constants. `.agents/config/issue-tracker.md` is
// the single authored definition (CON-11), so a change there changes this
// phase without a code edit, and a malformed table becomes a loud skip rather
// than a wrong label set.
//
// Genuinely-not-applicable environments (not a git repo, no GitHub remote, no
// `gh`, an unauthenticated `gh`) return `not-applicable` so setup does not warn.
// A real failure inside an applicable run (an unreadable or malformed document,
// a rejected command) becomes `skipped` or `partial`. This module never throws,
// so the setup pipeline cannot fail because GitHub is unreachable
// (REQ-11, RISK-05).
//
// `gh` is always invoked with an argument array via `execFile`; no shell
// string is ever built (CON-03, SEC-01). The exec implementation is
// injectable so tests never touch the network.
// ═════════════════════════════════════════════════════════════════════════════

import { execFile } from 'child_process'
import { readFileSync } from 'fs'

import { step, stepSuccess, stepWarn } from './ui.js'

// ── Constants ────────────────────────────────────────────────────────────────

/** Fallback path to the canonical tracker document, relative to `import.meta.url`. */
const TRACKER_DOC_URL = new URL('../../.agents/config/issue-tracker.md', import.meta.url)

/** Matches a six-digit hex colour such as `#5319E7`. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Creates the tracker labels that are missing from the consumer's repository.
 *
 * Skips cleanly (never throws) when the project is not a git repository, has
 * no GitHub `origin`, has no `gh` on `PATH`, has an unauthenticated `gh`, or
 * when the canonical tracker document cannot be parsed.
 *
 * @param {object} [context={}] - Setup context object from `discover()`.
 * @param {boolean} [context.hasGit] - Whether the consumer is a git repository.
 * @param {string} [context.consumerRoot] - Absolute path to the consumer project.
 * @param {object} [context.flags={}] - Parsed CLI flags; `dryRun` is honoured.
 * @param {object} [options={}] - Injectable dependencies (used by tests).
 * @param {boolean} [options.dryRun] - Read-only run; creates nothing.
 * @param {string|URL} [options.docUrl] - Tracker document override.
 * @param {Function} [options.execImpl] - Command runner override.
 * @returns {Promise<{
 *   action: 'completed'|'dry-run'|'skipped'|'partial'|'not-applicable',
 *   message: string,
 *   labels: number,
 *   created: string[],
 *   present: string[]
 * }>} Structured phase result.
 *
 * @example
 * ```js
 * const result = await runTrackerPhase(context)
 * // result.action → 'completed' | 'dry-run' | 'skipped' | 'partial'
 * //                 | 'not-applicable'
 * ```
 */
export async function runTrackerPhase(context = {}, options = {}) {
  const { hasGit = false, consumerRoot, flags = {} } = context
  const dryRun = Boolean(options.dryRun || flags.dryRun)
  const docUrl = options.docUrl ?? TRACKER_DOC_URL
  const execImpl = options.execImpl ?? defaultExec
  const cwd = consumerRoot || process.cwd()

  const result = {
    action: 'skipped',
    message: '',
    labels: 0,
    created: [],
    present: [],
  }

  try {
    // ── 1. Environment gates ──────────────────────────────────────────────
    if (!hasGit) {
      return notApplicable(result, 'not a git repository')
    }

    const remote = await tryExec(execImpl, 'git', ['remote', 'get-url', 'origin'], {
      cwd,
    })
    if (!remote.ok || !/github\.com/i.test(remote.stdout)) {
      return notApplicable(result, 'no GitHub `origin` remote')
    }

    const ghVersion = await tryExec(execImpl, 'gh', ['--version'], { cwd })
    if (!ghVersion.ok) {
      return notApplicable(result, '`gh` is not installed or not on PATH')
    }

    // ── 2. Authentication ─────────────────────────────────────────────────
    const auth = await tryExec(execImpl, 'gh', ['auth', 'status'], { cwd })
    if (!auth.ok) {
      return notApplicable(
        result,
        '`gh` is not authenticated \u2014 run `gh auth login` and re-run setup',
      )
    }

    // ── 3. Parse the canonical document (never a hardcoded list) ──────────
    let markdown
    try {
      markdown = readFileSync(docUrl, 'utf-8')
    } catch (err) {
      return skip(
        result,
        `could not read .agents/config/issue-tracker.md (${err.message})`,
      )
    }

    let labels
    try {
      labels = parseLabels(markdown)
    } catch (err) {
      return skip(
        result,
        `.agents/config/issue-tracker.md has an invalid \`## Labels\` table (${err.message})`,
      )
    }

    if (labels.length === 0) {
      return skip(
        result,
        '.agents/config/issue-tracker.md has no usable `## Labels` table',
      )
    }
    result.labels = labels.length

    // ── 4. List the labels that already exist (one read) ──────────────────
    const listing = await tryExec(
      execImpl,
      'gh',
      ['label', 'list', '--json', 'name', '--limit', '200'],
      { cwd },
    )
    if (!listing.ok) {
      return skip(
        result,
        `could not list labels with \`gh\` (${describeFailure(listing)})`,
      )
    }

    let existing
    try {
      existing = JSON.parse(listing.stdout || '[]')
    } catch (err) {
      return skip(
        result,
        `\`gh label list\` returned invalid JSON (${err.message})`,
      )
    }

    const existingNames = new Set(
      (Array.isArray(existing) ? existing : [])
        .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
        .filter((name) => typeof name === 'string' && name.length > 0),
    )

    const missing = labels.filter((label) => !existingNames.has(label.name))
    result.present = labels
      .filter((label) => existingNames.has(label.name))
      .map((label) => label.name)

    // ── 5. Dry-run stops after the read steps ─────────────────────────────
    if (dryRun) {
      result.action = 'dry-run'
      result.message = `Would create ${missing.length} label(s)`
      stepSuccess(`Tracker: ${result.message}`)
      return result
    }

    // ── 6. Create only the missing labels ─────────────────────────────────
    const failures = []
    for (const label of missing) {
      const created = await tryExec(
        execImpl,
        'gh',
        [
          'label',
          'create',
          label.name,
          '--color',
          label.color,
          '--description',
          label.description,
        ],
        { cwd },
      )

      if (created.ok) {
        result.created.push(label.name)
        continue
      }

      // A concurrent run (or a stale listing) can race us to creation.
      const combined = `${created.stderr}\n${created.stdout}`
      if (/already exists/i.test(combined)) {
        result.present.push(label.name)
        continue
      }

      failures.push(`${label.name} (${describeFailure(created)})`)
    }

    if (failures.length > 0) {
      result.action = 'partial'
      result.message =
        `Created ${result.created.length} label(s), ${result.present.length} already present; ` +
        `failed: ${failures.join(', ')}`
      stepWarn(`Tracker: ${result.message}`)
      return result
    }

    result.action = 'completed'
    result.message = `Created ${result.created.length} label(s), ${result.present.length} already present`
    stepSuccess(`Tracker: ${result.message}`)
    return result
  } catch (err) {
    // The phase is contractually non-fatal: any unexpected error is a skip.
    return skip(result, err?.message || String(err))
  }
}

// ── Label parsing ────────────────────────────────────────────────────────────

/**
 * Parses the `## Labels` table out of the canonical tracker document.
 *
 * Only body rows are read. A row must split into exactly three non-empty
 * cells; the name and colour are expected to be backticked, and the colour
 * must be a six-digit `#RRGGBB` value. A malformed row throws so the caller
 * can turn it into a loud skip rather than creating a wrong label set.
 *
 * @param {string} markdown - The tracker document's full text.
 * @returns {Array<{name: string, color: string, description: string}>} Labels.
 * @throws {Error} When a table row fails validation.
 */
export function parseLabels(markdown) {
  if (typeof markdown !== 'string') return []

  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '## Labels')
  if (start === -1) return []

  const rows = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^##\s+/.test(line.trim())) break
    if (!line.trim().startsWith('|')) continue

    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())

    // Skip the header and the `|---|` separator row.
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue
    if (cells[0] === 'Label' && cells[1] === 'Colour') continue

    if (cells.length !== 3) {
      throw new Error(`expected 3 cells, found ${cells.length} in "${line.trim()}"`)
    }
    if (cells.some((cell) => cell.length === 0)) {
      throw new Error(`empty cell in "${line.trim()}"`)
    }

    const name = stripBackticks(cells[0])
    const color = stripBackticks(cells[1])
    const description = cells[2]

    if (name.length === 0) {
      throw new Error(`empty label name in "${line.trim()}"`)
    }
    if (!HEX_COLOR.test(color)) {
      throw new Error(`invalid colour "${color}" for label "${name}"`)
    }

    rows.push({ name, color, description })
  }

  return rows
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Removes one pair of surrounding backticks from a table cell.
 *
 * @param {string} value - A trimmed table cell.
 * @returns {string} The cell without its surrounding backticks.
 */
function stripBackticks(value) {
  return value.replace(/^`/, '').replace(/`$/, '')
}

/**
 * Marks a result as not applicable, logs it neutrally, and returns it.
 *
 * Used for environments where the tracker phase has nothing to do (no git
 * repo, no GitHub remote, no `gh`, an unauthenticated `gh`). Setup maps this
 * to a neutral status so those cases do not raise a warning.
 *
 * @param {object} result - The mutable result object.
 * @param {string} reason - Human-readable reason the phase does not apply.
 * @returns {object} The same result object, mutated.
 */
function notApplicable(result, reason) {
  result.action = 'not-applicable'
  result.message = reason
  step(`Tracker: not applicable \u2014 ${reason}`)
  return result
}

/**
 * Marks a result as skipped, logs a warning, and returns it.
 *
 * @param {object} result - The mutable result object.
 * @param {string} reason - Human-readable reason for the skip.
 * @returns {object} The same result object, mutated.
 */
function skip(result, reason) {
  result.action = 'skipped'
  result.message = reason
  stepWarn(`Tracker: skipped \u2014 ${reason}`)
  return result
}

/**
 * Runs one command through the injected executor and converts a rejection
 * into a structured failure instead of propagating it.
 *
 * @param {Function} execImpl - Command runner.
 * @param {string} command - Executable name (never a shell string).
 * @param {string[]} args - Argument array.
 * @param {object} [options] - `execFile` options (usually `{ cwd }`).
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, error: Error|null}>}
 *   Normalised command outcome.
 */
async function tryExec(execImpl, command, args, options = {}) {
  try {
    const output = await execImpl(command, args, options)
    return {
      ok: true,
      stdout: output?.stdout ? String(output.stdout) : '',
      stderr: output?.stderr ? String(output.stderr) : '',
      error: null,
    }
  } catch (err) {
    return {
      ok: false,
      stdout: err?.stdout ? String(err.stdout) : '',
      stderr: err?.stderr ? String(err.stderr) : '',
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

/**
 * Builds a short failure description from a normalised command outcome.
 *
 * @param {{error: Error|null, stderr: string}} outcome - A `tryExec` result.
 * @returns {string} A one-line description for the phase message.
 */
function describeFailure(outcome) {
  if (outcome.stderr) return outcome.stderr.trim().split('\n')[0]
  if (outcome.error?.message) return outcome.error.message
  return 'command failed'
}

/**
 * Default command runner: a promise wrapper around `child_process.execFile`.
 *
 * A rejected promise carries the child's `stdout`/`stderr` so callers can
 * report the real reason (including `already exists`).
 *
 * @param {string} command - Executable name.
 * @param {string[]} args - Argument array.
 * @param {object} [options] - `execFile` options.
 * @returns {Promise<{stdout: string, stderr: string}>} Captured output.
 */
function defaultExec(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        rejectPromise(error)
        return
      }
      resolvePromise({ stdout, stderr })
    })
  })
}
