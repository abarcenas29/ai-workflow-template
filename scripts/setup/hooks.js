// ═════════════════════════════════════════════════════════════════════════════
// hooks.js — Hook installation and merging for the setup command pipeline
// ═════════════════════════════════════════════════════════════════════════════
//
// Implements the 6-case merge algorithm for installing template git hooks
// (pre-commit, post-merge) into a consumer project's .husky/ directory:
//
//   Case A : No .husky/ directory           → Create + write
//   Case B : No existing hook file          → Write
//   Case C : Existing, isManaged (= ours)   → Overwrite (idempotent re-run)
//   Case D : Existing, not ours, --force    → Backup + overwrite
//   Case E : Existing, not ours, no --force → Append with separator
//   Case F : dry-run mode                   → Log only, no writes
//
// ═════════════════════════════════════════════════════════════════════════════

import { resolve } from 'path'

import { HOOK_MARKER, HOOK_MERGE_SEPARATOR, TEMPLATE_HOOKS } from './constants.js'
import {
  chmodX,
  ensureDir,
  safeReadFile,
  safeWriteFile,
} from './utils.js'
import {
  dryRunBanner,
  step,
  stepError,
  stepSuccess,
  stepWarn,
  verbose,
} from './ui.js'

// ── Content builder ──────────────────────────────────────────────────────────

/**
 * Builds the final content for a hook file.
 *
 * The marker comment (`HOOK_MARKER`) is placed on the very first line for
 * idempotency detection.  The template hook content from `TEMPLATE_HOOKS`
 * follows immediately.
 *
 * @param {string} hookName - Key from `TEMPLATE_HOOKS` (e.g. `'pre-commit'`).
 * @returns {string} Complete file content with the marker as line 1.
 *
 * @example
 * buildHookContent('pre-commit')
 * // → "# Managed by @abarcenas/ai-workflow-template setup\nnode scripts/bump-version.js\n..."
 */
function buildHookContent(hookName) {
  const template = TEMPLATE_HOOKS[hookName]
  // The `content` field is always a string in our constants (pre-composed).
  const raw = template.content
  // Template content already has the marker on its first line.
  return raw
}

// ── Hook file path helper ────────────────────────────────────────────────────

/**
 * Returns the absolute path to a hook file inside the consumer's `.husky/`
 * directory.
 *
 * @param {string} consumerRoot - Consumer project root.
 * @param {string} hookName     - Hook filename (e.g. `'pre-commit'`).
 * @returns {string} Absolute path.
 */
function hookPath(consumerRoot, hookName) {
  return resolve(consumerRoot, '.husky', hookName)
}

// ── Dry-run result helper ────────────────────────────────────────────────────

/**
 * Determines what action *would* be taken for a hook, without performing any
 * writes.  Used exclusively by dry-run mode (Case F) and also provides the
 * human-readable message for the result entry.
 *
 * @param {object} context   - Context object from `discover.js`.
 * @param {string} hookName  - Key from `TEMPLATE_HOOKS`.
 * @returns {{ action: string, message: string }}
 */
function dryRunResult(context, hookName) {
  const hook = context.existingHooks?.[hookName]
  const hasHuskyDir = !!context.hasHuskyDir
  const existing = hook?.exists ?? false
  const isManaged = hook?.isManaged ?? false
  const force = !!(context.force || context.flags?.force)
  const desc = TEMPLATE_HOOKS[hookName]?.description ?? ''

  if (!hasHuskyDir) {
    return {
      action: 'dry-run',
      message: `Would create .husky/ and ${hookName} hook (${desc})`,
    }
  }
  if (!existing) {
    return {
      action: 'dry-run',
      message: `Would write ${hookName} hook (${desc})`,
    }
  }
  if (isManaged) {
    return {
      action: 'dry-run',
      message: `Would overwrite existing ${hookName} hook (idempotent update, ${desc})`,
    }
  }
  if (force) {
    return {
      action: 'dry-run',
      message: `Would back up existing ${hookName} hook and overwrite with force (${desc})`,
    }
  }
  // Case E equivalent in dry-run
  return {
    action: 'dry-run',
    message: `Would append to existing ${hookName} hook (${desc})`,
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Installs or merges template hooks into the consumer project's `.husky/`
 * directory.
 *
 * Implements the **6-case merge algorithm** per the setup command design
 * (§4.3).  Each hook in `TEMPLATE_HOOKS` (pre-commit, post-merge) is processed
 * independently:
 *
 * | Case | Condition                                    | Action                      | Result key  |
 * |------|----------------------------------------------|-----------------------------|-------------|
 * | A    | No `.husky/` directory                       | Create dir + write hook     | `created`   |
 * | B    | No existing hook file                        | Write hook file             | `created`   |
 * | C    | Hook exists + `isManaged` (= ours)           | Overwrite (idempotent)      | `overwritten` |
 * | D    | Hook exists + not ours + `--force`           | Backup `.bak` + overwrite   | `overwritten` |
 * | E    | Hook exists + not ours + no `--force`        | Append with separator       | `merged`    |
 * | F    | `context.dryRun` is `true`                   | Log only, no writes         | `dry-run`   |
 *
 * Every operation is wrapped in a try/catch.  A failure for one hook does not
 * prevent the other from being processed.
 *
 * @param {object} context - Context object from `discover.js`.
 * @param {string} context.consumerRoot - Absolute path to consumer project root.
 * @param {boolean} [context.hasHuskyDir] - Whether `.husky/` already exists.
 * @param {Record<string, {exists: boolean, content: string|null, isManaged: boolean}>}
 *        [context.existingHooks] - Descriptors for each hook.
 * @param {boolean} [context.dryRun] - When `true`, no files are modified.
 * @param {boolean} [context.force] - When `true`, existing hooks are overwritten.
 * @param {{force?: boolean}} [context.flags] - Parsed CLI flags (alternative to
 *        `context.force`).
 * @returns {Promise<Array<{hook: string, action: string, message: string}>>}
 *          A result entry for each hook in `TEMPLATE_HOOKS`.
 *
 * @example
 * ```js
 * const ctx = await discover({ dryRun: true })
 * const results = await installHooks(ctx)
 * // → [{ hook: 'pre-commit', action: 'dry-run', message: '...' }, ...]
 * ```
 */
export async function installHooks(context) {
  const hookNames = Object.keys(TEMPLATE_HOOKS)
  const results = []

  // ── Case F: dry-run mode ────────────────────────────────────────────
  if (context.dryRun) {
    dryRunBanner()

    for (const hookName of hookNames) {
      const r = dryRunResult(context, hookName)
      step(r.message)
      results.push({ hook: hookName, action: 'dry-run', message: r.message })
    }

    return results
  }

  // ── Process each hook ───────────────────────────────────────────────
  for (const hookName of hookNames) {
    const hookInfo = context.existingHooks?.[hookName]
    const hasHuskyDir = !!context.hasHuskyDir
    const existing = hookInfo?.exists ?? false
    const isManaged = hookInfo?.isManaged ?? false
    const force = !!(context.force || context.flags?.force)
    const desc = TEMPLATE_HOOKS[hookName]?.description ?? ''
    const target = hookPath(context.consumerRoot, hookName)
    const content = buildHookContent(hookName)

    try {
      // ── Case A: No .husky/ directory — create it and write hook ──
      if (!hasHuskyDir) {
        verbose(context.verbose, `Creating .husky/ directory\u2026`)
        ensureDir(resolve(context.consumerRoot, '.husky'))
        verbose(context.verbose, `Writing ${hookName} hook\u2026`)
        safeWriteFile(target, content)
        verbose(context.verbose, 'Setting executable permissions\u2026')
        chmodX(target)
        verbose(context.verbose, '  \u2713 done')
        const msg = `${hookName} hook created (\u2713 ${desc})`
        stepSuccess(msg)
        results.push({ hook: hookName, action: 'created', message: msg })
        continue
      }

      // ── Case B: .husky/ exists but no hook file ─────────────────
      if (!existing) {
        verbose(context.verbose, `Writing ${hookName} hook\u2026`)
        safeWriteFile(target, content)
        verbose(context.verbose, 'Setting executable permissions\u2026')
        chmodX(target)
        verbose(context.verbose, '  \u2713 done')
        const msg = `${hookName} hook created (\u2713 ${desc})`
        stepSuccess(msg)
        results.push({ hook: hookName, action: 'created', message: msg })
        continue
      }

      // ── Case C: Hook exists AND is managed by us — overwrite ────
      if (isManaged) {
        verbose(context.verbose, `Overwriting ${hookName} (idempotent update)\u2026`)
        safeWriteFile(target, content)
        verbose(context.verbose, 'Setting executable permissions\u2026')
        chmodX(target)
        verbose(context.verbose, '  \u2713 done')
        const msg = `${hookName} hook overwritten (idempotent update, ${desc})`
        stepSuccess(msg)
        results.push({ hook: hookName, action: 'overwritten', message: msg })
        continue
      }

      // ── Case D: Hook exists, not ours, --force — back up + overwrite
      if (force) {
        verbose(context.verbose, `Backing up existing ${hookName}\u2026`)
        const bakPath = target + '.bak'
        const originalContent = safeReadFile(target)
        safeWriteFile(bakPath, originalContent ?? '')
        verbose(context.verbose, `Writing ${hookName} hook (force)\u2026`)
        safeWriteFile(target, content)
        verbose(context.verbose, 'Setting executable permissions\u2026')
        chmodX(target)
        verbose(context.verbose, '  \u2713 done')
        const msg =
          `${hookName} hook overwritten (original backed up to .bak, ${desc})`
        stepSuccess(msg)
        results.push({ hook: hookName, action: 'overwritten', message: msg })
        continue
      }

      // ── Case E: Hook exists, not ours, no --force — append ──────
      verbose(context.verbose, `Reading existing ${hookName} for merge\u2026`)
      const existingContent = safeReadFile(target)
      const mergedContent =
        (existingContent ?? '') + '\n' + HOOK_MERGE_SEPARATOR + '\n' + content
      verbose(context.verbose, `Writing merged ${hookName}\u2026`)
      safeWriteFile(target, mergedContent)
      verbose(context.verbose, 'Setting executable permissions\u2026')
      chmodX(target)
      verbose(context.verbose, '  \u2713 done')
      const msg = `${hookName} hook merged with existing content (${desc})`
      stepSuccess(msg)
      results.push({ hook: hookName, action: 'merged', message: msg })
    } catch (err) {
      // Any error during file operations (permission denied, .husky/
      // is a file not a directory, read-only filesystem, etc.) is
      // caught here — non-fatal for the other hook.
      const errMsg = `${hookName} hook: ${err.message}`
      stepError(errMsg)
      results.push({
        hook: hookName,
        action: 'skipped',
        message: errMsg,
      })
    }
  }

  return results
}
