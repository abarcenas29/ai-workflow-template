#!/usr/bin/env node

/**
 * Playwright MCP Launcher
 * This script launches the Playwright MCP server with the correct configuration
 * based on environment variables and project settings.
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Browser values accepted by `@playwright/mcp --browser <browser>`.
 * `chrome` is a Chrome *channel* (your installed Google Chrome), not the
 * bundled Chromium build.
 */
export const BROWSER_VALUES = ['chrome', 'firefox', 'webkit', 'msedge']

/**
 * Builds the `npx @playwright/mcp@latest` argument list from the environment.
 *
 * Supported variables (all optional, order of flags is fixed):
 * - `HEADLESS=true`       → `--headless`
 * - `BROWSER=<name>`      → `--browser <name>` (chrome | firefox | webkit | msedge)
 * - `ISOLATED=true`       → `--isolated` (in-memory profile; no state written to disk)
 * - `USER_DATA_DIR=<path>` → `--user-data-dir <path>` (persistent profile; ignored
 *   when `ISOLATED=true`, because the CLI rejects the combination outright:
 *   "Browser userDataDir is not supported in isolated mode.")
 * - `VIEWPORT=<WxH>`      → `--viewport-size <WxH>`
 *
 * `SLOW_MO` is intentionally not read: @playwright/mcp exposes no `--slow-mo`
 * flag. Slow motion applies to the Playwright test runner only
 * (`playwright.config.ts`), not to the MCP server.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment to read.
 * @returns {string[]} Arguments passed to `npx`.
 * @throws {Error} When `BROWSER` is set to a value the CLI does not accept.
 */
export function buildArgs(env = process.env) {
  const args = ['@playwright/mcp@latest']

  if (env.HEADLESS === 'true') {
    args.push('--headless')
  }

  if (env.BROWSER) {
    if (!BROWSER_VALUES.includes(env.BROWSER)) {
      throw new Error(
        `Invalid BROWSER "${env.BROWSER}". Expected one of: ${BROWSER_VALUES.join(', ')}.`,
      )
    }
    args.push('--browser', env.BROWSER)
  }

  // Isolation wins over an explicit profile directory: the two are mutually
  // exclusive (the CLI refuses `--isolated` together with `--user-data-dir`),
  // and isolation is the safer of the two.
  if (env.ISOLATED === 'true') {
    args.push('--isolated')
  } else if (env.USER_DATA_DIR) {
    args.push('--user-data-dir', env.USER_DATA_DIR)
  }

  if (env.VIEWPORT) {
    args.push('--viewport-size', env.VIEWPORT)
  }

  return args
}

/**
 * Spawns the Playwright MCP server and forwards signals / exit codes.
 *
 * @param {object}   [options]
 * @param {object}   [options.env=process.env] - Environment to read.
 * @param {object}   [options.proc=process]    - Process-like emitter for signals.
 * @param {Function} [options.exit=process.exit] - Exit function.
 * @returns {import('node:child_process').ChildProcess} The spawned child.
 */
export function launch({
  env = process.env,
  proc = process,
  exit = process.exit,
} = {}) {
  const child = spawn('npx', buildArgs(env), {
    stdio: 'inherit',
    // `shell: true` on every platform would route argv through a shell, where
    // an env value containing spaces (VIEWPORT, USER_DATA_DIR) can split or
    // inject tokens. POSIX resolves the `npx` shim from PATH without a shell;
    // Windows needs the shell for `npx.cmd`.
    shell: process.platform === 'win32',
  })

  proc.on('SIGINT', () => {
    child.kill('SIGINT')
  })

  proc.on('SIGTERM', () => {
    child.kill('SIGTERM')
  })

  child.on('exit', (code) => {
    exit(code || 0)
  })

  return child
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  launch()
}
