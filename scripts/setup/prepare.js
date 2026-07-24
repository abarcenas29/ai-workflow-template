// ═════════════════════════════════════════════════════════════════════════════
// prepare.js — Handle consumer package.json prepare script
// ═════════════════════════════════════════════════════════════════════════════

import { join } from 'path'

import { safeWriteJson } from './utils.js'
import { step, stepSuccess, stepWarn } from './ui.js'

/**
 * Handles the prepare script in the consumer's package.json.
 *
 * Merges `"husky"` into the `scripts.prepare` field according to the
 * classification of the existing (or absent) prepare script:
 *
 * | # | Condition                          | Action                   | Return action  |
 * |---|------------------------------------|--------------------------|----------------|
 * | 1 | No `package.json`                  | Skip with warning        | `skipped`      |
 * | 2 | Prepare already contains "husky"   | Skip (already configured)| `skipped`      |
 * | 3 | No prepare script                  | Set to `"husky"`         | `added`        |
 * | 4 | Simple prepare (single command)    | Append `&& husky`        | `merged`       |
 * | 5 | Complex prepare + `--force`        | Replace with `"husky"`   | `added`        |
 * | 5 | Complex prepare, no `--force`      | Warn, skip auto-merge    | `skipped`      |
 * | 6 | `--dry-run`                        | Log, do not write        | `dry-run`      |
 *
 * @param {object} context - Context object from discover.js.
 * @param {string} context.consumerRoot - Absolute path to consumer root.
 * @param {object|undefined} context.consumerPackageJson - Parsed package.json.
 * @param {string|undefined} context.existingPrepare - Existing prepare script.
 * @param {boolean} context.prepareIsSimple - Whether the script is simple.
 * @param {boolean} context.dryRun - Do not modify when `true`.
 * @param {boolean} context.force - Force overwrite when `true`.
 * @returns {Promise<{action: string, message: string}>}
 */
export async function handlePrepare(context) {
  const {
    consumerRoot,
    consumerPackageJson,
    existingPrepare,
    prepareIsSimple,
    dryRun,
    force,
  } = context

  // ── Case 1: No package.json ──────────────────────────────────────────
  if (!consumerPackageJson) {
    stepWarn('Skipping prepare script — no package.json found')
    return { action: 'skipped', message: 'No package.json found' }
  }

  // ── Case 2: Prepare already includes "husky" ─────────────────────────
  if (existingPrepare && existingPrepare.includes('husky')) {
    stepSuccess('Prepare script already includes husky')
    return { action: 'skipped', message: 'prepare script already includes husky' }
  }

  // ── Case 3: No prepare script ────────────────────────────────────────
  if (!existingPrepare || existingPrepare.trim() === '') {
    if (dryRun) {
      step('[dry-run] Would add "prepare": "husky" to package.json')
      return { action: 'dry-run', message: 'Would add "prepare": "husky" to package.json' }
    }

    const pkgPath = join(consumerRoot, 'package.json')
    const updated = {
      ...consumerPackageJson,
      scripts: { ...(consumerPackageJson.scripts || {}), prepare: 'husky' },
    }
    safeWriteJson(pkgPath, updated)
    stepSuccess('Added "prepare": "husky" to package.json')
    return { action: 'added', message: 'Added "prepare": "husky" to package.json' }
  }

  // ── Case 4: Simple prepare script (single command, auto-merge safe) ──
  if (prepareIsSimple) {
    if (dryRun) {
      step(`[dry-run] Would merge husky: "${existingPrepare} && husky"`)
      return { action: 'dry-run', message: `Would merge: "${existingPrepare} && husky"` }
    }

    const pkgPath = join(consumerRoot, 'package.json')
    const updated = {
      ...consumerPackageJson,
      scripts: {
        ...(consumerPackageJson.scripts || {}),
        prepare: `${existingPrepare} && husky`,
      },
    }
    safeWriteJson(pkgPath, updated)
    stepSuccess('Merged husky into existing prepare script')
    return { action: 'merged', message: 'Merged husky into existing prepare script' }
  }

  // ── Case 5: Complex prepare script ───────────────────────────────────
  // (multi-line, has || or ;, or && chain > 3 — detected by discover.js)

  // Check dry-run before branching on force
  if (dryRun) {
    if (force) {
      step('[dry-run] Would replace complex prepare script with "husky" (--force)')
      return { action: 'dry-run', message: 'Would replace complex prepare with "husky" (--force)' }
    }
    step('[dry-run] Complex prepare script — would skip (use --force to override)')
    return { action: 'dry-run', message: 'Complex prepare — would skip (use --force to override)' }
  }

  if (force) {
    const pkgPath = join(consumerRoot, 'package.json')
    const updated = {
      ...consumerPackageJson,
      scripts: {
        ...(consumerPackageJson.scripts || {}),
        prepare: 'husky',
      },
    }
    safeWriteJson(pkgPath, updated)
    stepSuccess('Replaced complex prepare script with "husky" (--force)')
    return { action: 'added', message: 'Replaced complex prepare script with "husky" (--force)' }
  }

  // No --force: warn and skip — consumer must merge manually
  stepWarn(
    'Complex prepare script — skipping auto-merge. ' +
      'Use --force to override, or manually add " && husky" to the prepare script.',
  )
  return { action: 'skipped', message: 'Complex prepare script — manual merge required' }
}
