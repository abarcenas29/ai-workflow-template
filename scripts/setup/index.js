// ═════════════════════════════════════════════════════════════════════════════
// index.js — Setup command orchestrator
// ═════════════════════════════════════════════════════════════════════════════
//
// Implements the full setup pipeline:
//   1. Parse CLI arguments
//   2. Handle --help / --version (early exit with code 0)
//   3. Display header banner
//   4. Phase 1 — Discovery (detect consumer project state)
//   5. Phase 2 — Hooks (install / merge git hooks, unless --skip-hooks)
//   6. Phase 3 — Prepare (configure consumer package.json prepare script)
//   7. Phase 4 — Husky Init (generate .husky/_/ shims, unless --skip-hooks)
//   8. Phase 5 — Sync (spawn sync.js + normalize-memory.js, unless --skip-sync)
//   9. Phase 6 — Knowledgebase (register with centralized knowledgebase, unless --skip-knowledgebase)
//  10. Render summary table via ui.summary()
//  11. Determine exit code and return it
//
// Each phase is wrapped in try/catch. Only discovery failure is fatal.
// All other phase errors are logged and the pipeline continues (REQ-04).
// ═════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs'
import { join } from 'path'

import { EXIT_CODES } from './constants.js'
import { parseCliArgs, resolvePackageRoot } from './utils.js'
import {
  ciModeBanner,
  header,
  help,
  section,
  stepError,
  stepSuccess,
  stepWarn,
  summary,
} from './ui.js'
import { discover } from './discover.js'
import { installHooks } from './hooks.js'
import { handlePrepare } from './prepare.js'
import { initHusky } from './husky-init.js'
import { runSyncPhase } from './sync-phase.js'
import { registerKnowledgebase } from './knowledgebase.js'

// ── Package version (lazy, cached) ───────────────────────────────────────────

/** @type {string|null} */
let _cachedVersion = null

/**
 * Reads the package version from `package.json`.
 *
 * The result is cached after the first successful read so repeated calls
 * (only the `--version` flag currently) don't re-read the filesystem.
 *
 * @returns {string} Semver string (e.g. `'1.29.0'`). Falls back to `'0.0.0'`.
 */
function getPackageVersion() {
  if (_cachedVersion === null) {
    try {
      const pkgRoot = resolvePackageRoot()
      const pkgPath = join(pkgRoot, 'package.json')
      _cachedVersion =
        JSON.parse(readFileSync(pkgPath, 'utf-8')).version || '0.0.0'
    } catch {
      _cachedVersion = '0.0.0'
    }
  }
  return _cachedVersion
}

// ── Result mapping helper ────────────────────────────────────────────────────

/**
 * Maps a phase module action string to a summary status.
 *
 * @param {string} action - Action value returned by a phase module
 *   (e.g. `'added'`, `'skipped'`, `'failed'`, `'dry-run'`).
 * @returns {'success' | 'warn' | 'error'}
 */
function actionStatus(action) {
  switch (action) {
    // These actions represent a successful, completed operation
    case 'added':
    case 'created':
    case 'initialized':
    case 'completed':
    case 'dry-run':
    case 'overwritten':
    case 'merged':
    case 'indexed':
      return 'success'
    // These actions indicate the phase was intentionally skipped or
    // only partially completed — not an error but worth noting
    case 'skipped':
    case 'partial':
      return 'warn'
    // Explicit failure
    case 'failed':
      return 'error'
    // Unknown action — treat as a warning
    default:
      return 'warn'
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs the full setup pipeline and returns an exit code.
 *
 * The pipeline orchestrates five phases in sequence. Each phase is wrapped
 * in a try/catch so that a non-fatal failure in one phase does not prevent
 * subsequent phases from running (graceful degradation per REQ-04).
 *
 * The returned exit code follows the `EXIT_CODES` constants:
 *   - `SUCCESS` (0)  — All phases completed without errors or warnings
 *   - `WARNINGS` (1) — One or more phases had warnings or were skipped
 *   - `FATAL`   (2)  — Discovery phase failed (fatal, no recovery possible)
 *
 * @param {string[]} argv - CLI arguments (typically `process.argv.slice(2)`).
 * @returns {Promise<number>} Numeric exit code for `process.exit(code)`.
 *
 * @example
 * ```js
 * const code = await main(process.argv.slice(2))
 * process.exit(code)
 * ```
 */
export async function main(argv) {
  // ── 1. Parse CLI arguments ──────────────────────────────────────────────
  const flags = parseCliArgs(argv)

  // ── 2. Handle early-exit flags ──────────────────────────────────────────
  if (flags.help) {
    help()
    return EXIT_CODES.SUCCESS
  }

  if (flags.version) {
    console.log(getPackageVersion())
    return EXIT_CODES.SUCCESS
  }

  // ── 3. Display header banner ────────────────────────────────────────────
  if (!flags.quiet) {
    header()
  }

  // Accumulated phase results for the final summary table.
  // Each entry: `{ phase: string, status: 'success'|'warn'|'error', message: string }`
  /** @type {Array<{ phase: string, status: string, message: string }>} */
  const phases = []

  // Mutable context object — enriched by discovery and each subsequent phase.
  /** @type {import('./discover.js').Context | object} */
  let context

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 1 — Discovery
  // ═════════════════════════════════════════════════════════════════════════
  section('Phase 1: Discovery')

  try {
    context = await discover(flags)
    const msg = context.hasGit
      ? `Git repository found at ${context.consumerRoot}`
      : `Not a git repository (${context.consumerRoot}); hooks will be skipped`
    stepSuccess(msg)
    phases.push({ phase: 'discover', status: 'success', message: msg })
  } catch (err) {
    const msg = `Discovery failed: ${err.message}`
    stepError(msg)
    phases.push({ phase: 'discover', status: 'error', message: msg })
    // Discovery failure is fatal — no further detection is possible
    if (!flags.quiet) summary(phases)
    return EXIT_CODES.FATAL
  }

  // ── CI mode banner ──────────────────────────────────────────────────────
  if (context.isCI && !flags.quiet) {
    ciModeBanner()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 2 — Hooks (unless --skip-hooks)
  // ═════════════════════════════════════════════════════════════════════════
  if (!flags.skipHooks) {
    section('Phase 2: Hooks')

    if (!context.hasGit) {
      stepWarn(
        'Not a git repository \u2014 skipping hooks. ' +
          'Run "git init" first, then re-run setup.',
      )
      phases.push({
        phase: 'hooks',
        status: 'warn',
        message: 'Skipped \u2014 not a git repository',
      })
    } else {
      try {
        const hookResults = await installHooks(context)
        context.hookResults = hookResults

        // Aggregate per-hook results into a single summary entry
        const actions = hookResults.map((r) => r.action)
        const hasErrors = actions.some((a) => a === 'skipped')
        const onlyDryRun = actions.every((a) => a === 'dry-run')
        const allCreated = actions.every((a) => a === 'created')
        const allOverwritten = actions.every((a) => a === 'overwritten')

        if (onlyDryRun) {
          phases.push({
            phase: 'hooks',
            status: 'success',
            message: 'Dry-run complete (no files modified)',
          })
        } else if (hasErrors) {
          phases.push({
            phase: 'hooks',
            status: 'error',
            message: 'One or more hooks failed',
          })
        } else if (allCreated || allOverwritten) {
          phases.push({
            phase: 'hooks',
            status: 'success',
            message: 'All hooks installed',
          })
        } else {
          // Mixed results (created, merged, overwritten, etc.)
          const summaryParts = [...new Set(actions)].map((a) => {
            const count = actions.filter((x) => x === a).length
            return `${count} ${a}`
          })
          phases.push({
            phase: 'hooks',
            status: 'success',
            message: summaryParts.join(', '),
          })
        }
      } catch (err) {
        stepError(`Hook installation failed: ${err.message}`)
        phases.push({
          phase: 'hooks',
          status: 'error',
          message: err.message,
        })
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 3 — Prepare (unless --skip-prepare)
  // ═════════════════════════════════════════════════════════════════════════
  if (!flags.skipPrepare) {
    section('Phase 3: Prepare')

    try {
      const prepareResult = await handlePrepare(context)
      context.prepareResult = prepareResult
      phases.push({
        phase: 'prepare',
        status: actionStatus(prepareResult.action),
        message: prepareResult.message,
      })
    } catch (err) {
      stepError(`Prepare script handling failed: ${err.message}`)
      phases.push({
        phase: 'prepare',
        status: 'error',
        message: err.message,
      })
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 4 — Husky Init (unless --skip-hooks)
  // ═════════════════════════════════════════════════════════════════════════
  if (!flags.skipHooks) {
    section('Phase 4: Husky Init')

    if (!context.hasGit) {
      stepWarn(
        'Not a git repository \u2014 skipping husky init. ' +
          'Run "git init" first, then re-run setup.',
      )
      phases.push({
        phase: 'husky-init',
        status: 'warn',
        message: 'Skipped \u2014 not a git repository',
      })
    } else {
      try {
        const huskyResult = await initHusky(context)
        context.huskyResult = huskyResult
        phases.push({
          phase: 'husky-init',
          status: actionStatus(huskyResult.action),
          message: huskyResult.message,
        })
      } catch (err) {
        stepError(`Husky initialization failed: ${err.message}`)
        phases.push({
          phase: 'husky-init',
          status: 'error',
          message: err.message,
        })
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 5 — Sync (unless --skip-sync)
  // ═════════════════════════════════════════════════════════════════════════
  if (!flags.skipSync) {
    section('Phase 5: Sync')

    try {
      const syncResult = await runSyncPhase(context)
      context.syncResult = syncResult
      phases.push({
        phase: 'sync',
        status: actionStatus(syncResult.action),
        message: syncResult.message,
      })
    } catch (err) {
      stepError(`Sync phase failed: ${err.message}`)
      phases.push({
        phase: 'sync',
        status: 'error',
        message: err.message,
      })
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 6 — Knowledgebase (unless --skip-knowledgebase)
  // ═════════════════════════════════════════════════════════════════════════
  if (!flags.skipKnowledgebase) {
    section('Phase 6: Knowledgebase')

    try {
      const kbResult = await registerKnowledgebase(context)
      context.kbResult = kbResult
      phases.push({
        phase: 'knowledgebase',
        status: actionStatus(kbResult.action),
        message: kbResult.message,
      })
    } catch (err) {
      stepWarn(`Knowledgebase registration skipped: ${err.message}`)
      phases.push({
        phase: 'knowledgebase',
        status: 'warn',
        message: `Skipped \u2014 ${err.message}`,
      })
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Summary
  // ═════════════════════════════════════════════════════════════════════════
  if (!flags.quiet) {
    summary(phases)
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Exit code
  // ═════════════════════════════════════════════════════════════════════════
  const hasErrors = phases.some(
    (p) => p.status === 'error',
  )
  const hasWarnings = phases.some(
    (p) => p.status === 'warn',
  )

  if (hasErrors) return EXIT_CODES.FATAL
  if (hasWarnings) return EXIT_CODES.WARNINGS
  return EXIT_CODES.SUCCESS
}
