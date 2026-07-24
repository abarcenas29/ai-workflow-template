// ═════════════════════════════════════════════════════════════════════════════
// husky-init.js — Phase 4: Programmatic husky initialization
// ═════════════════════════════════════════════════════════════════════════════
//
// This module generates the `.husky/_/` shim directory and sets
// `core.hooksPath` via husky's programmatic API.  It is called after
// hook files have been installed/merged (hooks.js) and the consumer's
// `prepare` script has been configured (prepare.js).
//
// The dynamic import of husky resolves from the **consumer's**
// node_modules (never the package's own) so that the consumer's
// installed husky version is used.
// ═════════════════════════════════════════════════════════════════════════════

import { existsSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Initializes husky in the consumer's project.
 *
 * Calls the husky programmatic API (`husky()`) to:
 *   - Set `git config core.hooksPath .husky/_` in the consumer repo
 *   - Generate `.husky/_/` shim files (h, husky.sh, pre-commit, post-merge)
 *   - Generate `.husky/_/.gitignore` with content `*`
 *
 * The call is **idempotent** — running it multiple times is safe with no
 * duplicate side-effects.
 *
 * @param {object}   context              - Pipeline context object.
 * @param {string}   context.consumerRoot - Absolute path to the consumer project.
 * @param {boolean}  context.hasGit       - Whether the project has a `.git/` directory.
 * @param {boolean}  context.dryRun       - When `true` only report, do nothing.
 * @param {boolean}  context.isCI         - When `true` skip husky init entirely.
 * @returns {Promise<{action: string, message: string}>}
 */
export async function initHusky(context) {
  const { consumerRoot, hasGit, dryRun, isCI } = context

  // ── Dry-run mode ─────────────────────────────────────────────────────
  if (dryRun) {
    console.log(
      '[setup] Would initialize husky (generate .husky/_/ shims, set core.hooksPath)',
    )
    return { action: 'dry-run', message: 'Would initialize husky' }
  }

  // ── CI environment ───────────────────────────────────────────────────
  if (isCI) {
    console.log('[setup] CI environment detected — skipping husky init')
    return {
      action: 'skipped',
      message: 'Skipping husky init in CI environment',
    }
  }

  // ── No git repository ────────────────────────────────────────────────
  if (!hasGit) {
    console.warn('[setup] No .git directory — not a git repository')
    return {
      action: 'skipped',
      message: 'No .git directory — not a git repository',
    }
  }

  // ── Resolve husky from the consumer's node_modules ──────────────────
  let husky
  try {
    const consumerRequire = createRequire(join(consumerRoot, 'package.json'))
    const huskyPath = consumerRequire.resolve('husky')
    const mod = await import(huskyPath)
    husky = mod.default
  } catch {
    // createRequire.resolve or import() failed — husky is not installed
    return {
      action: 'skipped',
      message: 'husky is not installed. Run: npm install husky --save-dev',
    }
  }

  // ── Invoke husky() ──────────────────────────────────────────────────
  try {
    husky(consumerRoot)
  } catch (err) {
    return { action: 'failed', message: err.message }
  }

  // ── Verify post-condition ───────────────────────────────────────────
  const hPath = join(consumerRoot, '.husky', '_', 'h')
  if (!existsSync(hPath)) {
    return {
      action: 'failed',
      message:
        'Husky initialization may have failed — .husky/_/h not found after init',
    }
  }

  // ── Success ─────────────────────────────────────────────────────────
  return { action: 'initialized', message: 'Husky initialized successfully' }
}
