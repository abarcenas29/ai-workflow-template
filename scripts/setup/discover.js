// ═════════════════════════════════════════════════════════════════════════════
// discover.js — Consumer project state detection for the setup command pipeline
// ═════════════════════════════════════════════════════════════════════════════

import { resolve } from 'path'

import { HOOK_MARKER, TEMPLATE_HOOKS } from './constants.js'
import {
  dirExists,
  getConsumerRoot,
  getNodeVersion,
  isCI,
  safeReadFile,
  safeReadJson,
} from './utils.js'

// ── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Returns a default hook descriptor for cases where detection fails.
 *
 * @returns {{ exists: boolean, content: null, isManaged: boolean }}
 */
function defaultHookEntry() {
  return { exists: false, content: null, isManaged: false }
}

/**
 * Builds a minimal Context object with every property initialised to a safe
 * default.  Callers can always destructure the returned Context without
 * checking for undefined.
 *
 * @param {object} [flags={}]
 * @returns {Context}
 */
function createDefaultContext(flags = {}) {
  /** @type {Record<string, { exists: boolean, content: string|null, isManaged: boolean }>} */
  const existingHooks = {}
  for (const name of Object.keys(TEMPLATE_HOOKS)) {
    existingHooks[name] = defaultHookEntry()
  }

  return {
    consumerRoot: '',
    hasGit: false,
    hasHuskyDir: false,
    hasPackageJson: false,
    consumerPackageJson: null,
    existingHooks,
    existingPrepare: null,
    prepareIsSimple: false,
    isCI: false,
    nodeVersion: 0,
    dryRun: !!flags.dryRun,
  }
}

// ── Prepare script classifier ────────────────────────────────────────────────

/**
 * Determines whether an existing `prepare` script is "simple" enough for
 * automatic `&& husky` appending.
 *
 * A script is considered **simple** when it is a single-line command or a basic
 * `&&` chain.  It is **complex** (and will not be auto-merged) when any of
 * these apply:
 *
 *   - Multi-line (contains `\n`)
 *   - Contains the `||` (OR) operator
 *   - Contains a semicolon `;` command separator
 *
 * @param {string|null} prepare - The current `prepare` script value.
 * @returns {boolean} `true` if auto-merge is safe.
 */
function isPrepareSimple(prepare) {
  if (typeof prepare !== 'string' || prepare.trim() === '') return false

  const val = prepare.trim()
  if (val.includes('\n')) return false
  if (val.includes('||')) return false
  if (val.includes(';')) return false

  return true
}

// ── Hook detection helpers ───────────────────────────────────────────────────

/**
 * Reads a single hook file from the consumer's `.husky/` directory and returns
 * a descriptor containing the existence, raw content, and managed status.
 *
 * A hook is considered **managed** when its very first line (trimmed) matches
 * the `HOOK_MARKER` constant.
 *
 * @param {string} consumerRoot - Absolute path to the consumer project root.
 * @param {string} hookName     - Hook filename (e.g. `'pre-commit'`).
 * @returns {{ exists: boolean, content: string|null, isManaged: boolean }}
 */
function detectHook(consumerRoot, hookName) {
  try {
    const hookPath = resolve(consumerRoot, '.husky', hookName)
    const content = safeReadFile(hookPath)
    const exists = content !== null

    if (!exists) return { exists, content: null, isManaged: false }

    const firstLine = content.split('\n')[0]
    const isManaged =
      firstLine != null && firstLine.trim() === HOOK_MARKER

    return { exists, content, isManaged }
  } catch {
    return defaultHookEntry()
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Discovers the consumer project's state and returns a Context object.
 *
 * The returned Context captures the environment before any modifications are
 * made, so the orchestrator (and downstream pipeline modules) can decide which
 * phases to run and how to handle each edge case.
 *
 * All detection steps are wrapped in individual try/catch blocks so that a
 * failure in one area (e.g., reading package.json) does not prevent the rest
 * of the discovery from completing.  The Context is **always** returned, even
 * if every detection step fails.
 *
 * @param {object} [flags={}] - Parsed CLI flags from `parseCliArgs()`.
 * @param {boolean} [flags.dryRun] - When `true`, discovery notes dry-run mode.
 * @returns {Promise<Context>} Resolved context object.
 *
 * @example
 * ```js
 * import { parseCliArgs } from './utils.js'
 * import { discover } from './discover.js'
 *
 * const flags = parseCliArgs(process.argv.slice(2))
 * const ctx = await discover(flags)
 * console.log(ctx.hasGit) // true / false
 * ```
 */
export async function discover(flags = {}) {
  const ctx = createDefaultContext(flags)

  // ── 1. Resolve consumer root ──────────────────────────────────────────
  try {
    ctx.consumerRoot = getConsumerRoot()
  } catch {
    // If consumerRoot cannot be resolved we return early — no further
    // detection is possible without a target directory.
    ctx.nodeVersion = getNodeVersion()
    ctx.isCI = isCI()
    return ctx
  }

  if (!ctx.consumerRoot) {
    ctx.nodeVersion = getNodeVersion()
    ctx.isCI = isCI()
    return ctx
  }

  // ── 2. Detect git repository ──────────────────────────────────────────
  try {
    ctx.hasGit = dirExists(resolve(ctx.consumerRoot, '.git'))
  } catch {
    // Non-fatal — hasGit stays false
  }

  // ── 3. Detect .husky/ directory ───────────────────────────────────────
  try {
    ctx.hasHuskyDir = dirExists(resolve(ctx.consumerRoot, '.husky'))
  } catch {
    // Non-fatal — hasHuskyDir stays false
  }

  // ── 4. Detect + parse package.json ────────────────────────────────────
  try {
    const pkgPath = resolve(ctx.consumerRoot, 'package.json')
    const pkg = safeReadJson(pkgPath)
    ctx.hasPackageJson = pkg !== undefined
    ctx.consumerPackageJson = pkg ?? null
  } catch {
    // Non-fatal — hasPackageJson stays false, consumerPackageJson stays null
  }

  // ── 5. Detect existing hooks ──────────────────────────────────────────
  // existingHooks is pre-initialised by createDefaultContext() so the loop
  // below only overrides the entries it successfully reads.  Any hook that
  // cannot be read keeps its safe default (exists: false).
  try {
    for (const hookName of Object.keys(TEMPLATE_HOOKS)) {
      ctx.existingHooks[hookName] = detectHook(ctx.consumerRoot, hookName)
    }
  } catch {
    // Non-fatal — existingHooks already contains default entries
  }

  // ── 6. Extract existing prepare script ────────────────────────────────
  try {
    const prepare = ctx.consumerPackageJson?.scripts?.prepare
    ctx.existingPrepare =
      typeof prepare === 'string' && prepare.trim().length > 0
        ? prepare.trim()
        : null
  } catch {
    // Non-fatal — existingPrepare stays null
  }

  // ── 7. Classify prepare script simplicity ─────────────────────────────
  try {
    ctx.prepareIsSimple = isPrepareSimple(ctx.existingPrepare)
  } catch {
    ctx.prepareIsSimple = false
  }

  // ── 8. Detect CI environment ──────────────────────────────────────────
  try {
    ctx.isCI = isCI()
  } catch {
    ctx.isCI = false
  }

  // ── 9. Detect Node.js version ─────────────────────────────────────────
  try {
    ctx.nodeVersion = getNodeVersion()
  } catch {
    ctx.nodeVersion = 0
  }

  // NOTE: `ctx.dryRun` is already set by createDefaultContext(flags)

  return ctx
}
