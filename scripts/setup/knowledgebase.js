// ═════════════════════════════════════════════════════════════════════════════
// knowledgebase.js — Setup Phase 6: register consumer project in the
//                    centralized knowledgebase (PostgreSQL + pgvector)
// ═════════════════════════════════════════════════════════════════════════════
//
// Spawns `knowledgebase-cli.js sync --project <id>` as a child process to
// register the consumer project and index its learned-knowledge chunks.
//
// Gracefully degrades when DATABASE_URL is not configured or when the CLI
// script is unavailable — never blocks the setup pipeline.
// ═════════════════════════════════════════════════════════════════════════════

import { spawn } from 'child_process'
import { join } from 'path'

import { UNICODE_CHARS } from './constants.js'
import { verbose } from './ui.js'
import { logInfo, logWarn, resolvePackageRoot } from './utils.js'

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Registers the consumer project in the centralized knowledgebase.
 *
 * Spawns `scripts/knowledgebase-cli.js sync --project <projectId>` as a child
 * process so the CLI's own graceful degradation (DATABASE_URL check, optional
 * dependency loading) is reused rather than duplicated.
 *
 * **Early exits (all return `{ action: 'skipped' }`):**
 * - `flags.skipKnowledgebase` is `true` — user opted out via flag
 * - `process.env.DATABASE_URL` is not set — not configured yet
 * - `consumerPackageJson` has no `name` field — can't identify the project
 *
 * **Normal execution:**
 * The CLI is spawned with `INIT_CWD` set to `consumerRoot`. If the child
 * process exits with a non-zero code, the action becomes `'failed'` but the
 * pipeline continues (graceful degradation per REQ-08).
 *
 * @param {object} context - Setup context object.
 * @param {object} [context.flags={}] - Parsed CLI flags.
 * @param {boolean} [context.flags.skipKnowledgebase=false] - If `true`, skip.
 * @param {boolean} [context.verbose=false] - Enable verbose child output.
 * @param {string} [context.consumerRoot] - Absolute consumer project root.
 * @param {object} [context.consumerPackageJson] - Consumer's package.json.
 * @returns {Promise<{
 *   action: 'indexed'|'skipped'|'failed',
 *   message: string,
 *   chunks_indexed?: number,
 *   chunks_skipped?: number
 * }>}
 */
export async function registerKnowledgebase(context) {
  const { flags = {}, verbose: verboseFlag = false } = context

  // ── Skip flag check ──────────────────────────────────────────────────
  if (flags.skipKnowledgebase) {
    const message =
      '[knowledgebase] Skipping Phase 6 \u2014 --skip-knowledgebase flag set'
    logInfo(message)
    return { action: 'skipped', message }
  }

  // ── DATABASE_URL check ───────────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    const message =
      'DATABASE_URL not configured. Set DATABASE_URL in your .env file, ' +
      'then re-run: npx @abarcenas/ai-workflow-template --knowledgebase'
    logWarn(
      `[knowledgebase] Skipping Phase 6 \u2014 ${message}`,
    )
    return { action: 'skipped', message }
  }

  // ── Resolve project ID from consumer package.json ────────────────────
  const projectId = context.consumerPackageJson?.name
  if (!projectId) {
    const message = 'No project name in consumer package.json'
    logWarn(
      `[knowledgebase] Skipping Phase 6 \u2014 ${message}`,
    )
    return { action: 'skipped', message }
  }

  // ── Spawn knowledgebase-cli.js sync ──────────────────────────────────
  const packageRoot = resolvePackageRoot()
  const cliPath = join(packageRoot, 'scripts', 'knowledgebase-cli.js')
  const cwd = context.consumerRoot || process.cwd()

  verbose(verboseFlag, `Spawning knowledgebase-cli.js sync for project "${projectId}"\u2026`)

  try {
    const result = await spawnScript(
      'knowledgebase-cli.js',
      cliPath,
      cwd,
      ['sync', '--project', projectId],
      verboseFlag,
    )

    // Non-zero exit from the CLI is a warning, not a blocker
    if (!result.success) {
      const trimmedOutput = result.output
      const message =
        `Knowledgebase sync failed (exit code ${result.exitCode}): ${trimmedOutput}`
      logWarn(`[knowledgebase] ${message}`)
      return { action: 'failed', message }
    }

    // Parse the human-readable output for chunk counts.
    // The CLI outputs: "[knowledgebase] Indexed X new, updated Y, skipped Z chunks from project <name>"
    let chunksIndexed = 0
    let chunksSkipped = 0
    const outputLine = result.output
    const match = outputLine.match(
      /Indexed (\d+) new, updated (\d+), skipped (\d+) chunks/,
    )
    if (match) {
      // "indexed" = new chunks + updated chunks (both were processed)
      chunksIndexed = parseInt(match[1], 10) + parseInt(match[2], 10)
      chunksSkipped = parseInt(match[3], 10)
    }

    const message =
      `Registered "${projectId}" \u2014 ${chunksIndexed} chunks indexed, ` +
      `${chunksSkipped} skipped`
    logInfo(`[knowledgebase] ${UNICODE_CHARS.CHECK} ${message}`)

    return {
      action: 'indexed',
      message,
      chunks_indexed: chunksIndexed,
      chunks_skipped: chunksSkipped,
    }
  } catch (err) {
    // Catch spawn-level errors (ENOENT when script doesn't exist, etc.)
    const message = `knowledgebase-cli.js not available: ${err.message}`
    logWarn(
      `[knowledgebase] Skipping Phase 6 \u2014 ${message}`,
    )
    return { action: 'skipped', message }
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Spawns a Node.js script as a child process and waits for completion.
 *
 * Matches the `spawnScript` pattern from `sync-phase.js`: uses
 * `process.execPath` so the child runs the same Node binary as the parent,
 * streams output in real-time when `verbose` is `true`, and captures
 * interleaved stdout + stderr when not.
 *
 * @param {string} name - Display name for the script.
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @param {string} cwd - Working directory for the child process.
 * @param {string[]} args - CLI arguments forwarded to the script.
 * @param {boolean} [verbose=false] - Stream output in real-time when `true`.
 * @returns {Promise<{
 *   script: string,
 *   success: boolean,
 *   exitCode: number,
 *   output: string
 * }>}
 */
function spawnScript(name, scriptPath, cwd, args, verbose = false) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, INIT_CWD: cwd },
      stdio: verbose ? 'inherit' : 'pipe',
    })

    let output = ''

    if (!verbose) {
      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        output += data.toString()
      })
    }

    child.on('close', (exitCode) => {
      resolve({
        script: name,
        success: exitCode === 0,
        exitCode: exitCode ?? -1,
        output: verbose ? '(streamed to terminal)' : output.trim(),
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
