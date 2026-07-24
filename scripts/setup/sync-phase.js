// ═════════════════════════════════════════════════════════════════════════════
// sync-phase.js — Phase 5: spawn sync.js and normalize-memory.js as child
//                 processes (avoids process.exit() killing the parent setup)
// ═════════════════════════════════════════════════════════════════════════════

import { spawn } from 'child_process'
import { join } from 'path'

import { resolvePackageRoot, logInfo, logWarn, logError } from './utils.js'

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Runs the sync phase of the setup pipeline.
 *
 * Spawns `scripts/sync.js` and `scripts/normalize-memory.js` as child processes
 * rather than importing them directly. This is required because `sync.js` calls
 * `process.exit()` internally (line 83), which would terminate the entire setup
 * process if it were imported as a module.
 *
 * **Early exits:**
 * - `skipSync` is `true` → returns `{ action: 'skipped' }` without spawning
 * - `dryRun`   is `true` → returns `{ action: 'dry-run' }` after logging intent
 *
 * **Normal execution:**
 * Both scripts are spawned sequentially (sync.js first, normalize-memory.js
 * second) with `INIT_CWD` set to `consumerRoot` so they resolve consumer
 * paths correctly. If `flags.force` is set, the `--force` argument is
 * forwarded to both child scripts.
 *
 * Non-zero exit codes from either script are treated as warnings, not
 * failures — the overall action becomes `'partial'` but the pipeline
 * continues (graceful degradation per REQ-04).
 *
 * @param {object} context - Setup context object.
 * @param {string} context.consumerRoot - Absolute path to the consumer project root.
 * @param {boolean} [context.dryRun=false] - If `true`, only simulate without spawning.
 * @param {boolean} [context.skipSync=false] - If `true`, skip the entire sync phase.
 * @param {object} [context.flags={}] - Parsed CLI flags (may include `force`).
 * @returns {Promise<{
 *   action: 'completed'|'partial'|'skipped'|'dry-run',
 *   message: string,
 *   results: Array<{
 *     script: string,
 *     success: boolean,
 *     exitCode: number,
 *     output: string
 *   }>
 * }>}
 */
export async function runSyncPhase(context) {
  const { consumerRoot, dryRun = false, skipSync = false, flags = {} } = context

  // ── Skip path ──────────────────────────────────────────────────────────
  if (skipSync) {
    const message = 'Sync phase skipped (--skip-sync)'
    logInfo(`[setup] ${message}`)
    return { action: 'skipped', message, results: [] }
  }

  // ── Dry-run path ───────────────────────────────────────────────────────
  if (dryRun) {
    const message =
      `Would run sync.js and normalize-memory.js ` +
      `with INIT_CWD="${consumerRoot}"`
    logInfo(`[setup] dry-run: ${message}`)
    return { action: 'dry-run', message, results: [] }
  }

  const packageRoot = resolvePackageRoot()
  const extraArgs = flags.force ? ['--force'] : []

  // ── Spawn sync.js ──────────────────────────────────────────────────────
  const syncPath = join(packageRoot, 'scripts', 'sync.js')
  const syncResult = await spawnScript(
    'sync.js',
    syncPath,
    consumerRoot,
    extraArgs,
  )

  // ── Spawn normalize-memory.js ──────────────────────────────────────────
  const normPath = join(packageRoot, 'scripts', 'normalize-memory.js')
  const normResult = await spawnScript(
    'normalize-memory.js',
    normPath,
    consumerRoot,
    extraArgs,
  )

  const results = [syncResult, normResult]
  const allSucceeded = results.every((r) => r.success)
  const action = allSucceeded ? 'completed' : 'partial'
  const failureCount = results.filter((r) => !r.success).length

  const message =
    action === 'completed'
      ? 'Sync phase completed'
      : `Sync phase completed with ${failureCount} script failure(s)`

  if (!allSucceeded) {
    logWarn(`[setup] ${message}`)
    for (const r of results) {
      if (!r.success) {
        logWarn(`[setup]   ${r.script} exited with code ${r.exitCode}`)
      }
    }
  }

  return { action, message, results }
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Spawns a Node.js script as a child process and waits for it to complete.
 *
 * Both stdout and stderr are captured into a single `output` string
 * (interleaved in the order data events arrive). The returned promise
 * resolves when the child process exits or fails to spawn.
 *
 * Uses `process.execPath` so the child always runs the same Node.js
 * binary as the parent setup process.
 *
 * @param {string} name - Display name for the script (e.g. `'sync.js'`).
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @param {string} cwd - Working directory for the child process.
 * @param {string[]} extraArgs - Extra CLI arguments forwarded to the script.
 * @returns {Promise<{
 *   script: string,
 *   success: boolean,
 *   exitCode: number,
 *   output: string
 * }>}
 */
function spawnScript(name, scriptPath, cwd, extraArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      cwd,
      env: { ...process.env, INIT_CWD: cwd },
      stdio: 'pipe',
    })

    let output = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      output += data.toString()
    })

    child.on('close', (exitCode) => {
      resolve({
        script: name,
        success: exitCode === 0,
        exitCode: exitCode ?? -1,
        output: output.trim(),
      })
    })

    child.on('error', (err) => {
      resolve({
        script: name,
        success: false,
        exitCode: -1,
        output: `Failed to spawn child process: ${err.message}`,
      })
    })
  })
}
