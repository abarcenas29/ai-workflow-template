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

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'

import { info, warn, verbose } from './ui.js'

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
 * @param {boolean}  context.verbose      - When `true` emit verbose progress messages.
 * @returns {Promise<{action: string, message: string}>}
 */
export async function initHusky(context) {
  const { consumerRoot, hasGit, dryRun, isCI, verbose: verboseFlag } = context

  // ── Dry-run mode ─────────────────────────────────────────────────────
  if (dryRun) {
    info(
      '[setup] Would initialize husky (generate .husky/_/ shims, set core.hooksPath)',
    )
    return { action: 'dry-run', message: 'Would initialize husky' }
  }

  // ── CI environment ───────────────────────────────────────────────────
  if (isCI) {
    warn('[setup] CI environment detected — skipping husky init')
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
  verbose(verboseFlag, 'Resolving husky from consumer node_modules\u2026')
  try {
    const consumerRequire = createRequire(join(consumerRoot, 'package.json'))
    const huskyPath = consumerRequire.resolve('husky')
    verbose(verboseFlag, `Found husky at ${huskyPath}`)
    const mod = await import(huskyPath)
    husky = mod.default
  } catch {
    // createRequire.resolve or import() failed — husky is not installed
    verbose(verboseFlag, 'husky not found \u2014 skipping init')
    return {
      action: 'skipped',
      message: 'husky is not installed. Run: npm install husky --save-dev',
    }
  }

  // ── Clear stale hooksPath ──────────────────────────────────────────
  // Husky v9's programmatic API is a no-op when core.hooksPath already
  // exists (even if pointing to a wrong value). Unset it so husky()
  // actually generates the .husky/_/ shim files from scratch.
  verbose(verboseFlag, 'Clearing stale core.hooksPath\u2026')
  try {
    execSync('git config --local --unset core.hooksPath', {
      cwd: consumerRoot,
      stdio: 'pipe',
    })
  } catch {
    // Silently continue if the key didn't exist or is not unset-able.
    // husky() will handle hooksPath setup internally.
  }

  // ── Invoke husky() ──────────────────────────────────────────────────
  verbose(verboseFlag, 'Calling husky()\u2026')
  try {
    husky(consumerRoot)
  } catch (err) {
    verbose(verboseFlag, `husky() failed: ${err.message}`)
    return { action: 'failed', message: err.message }
  }

  // ── Verify post-condition ───────────────────────────────────────────
  verbose(verboseFlag, 'Verifying .husky/_/h exists\u2026')
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
