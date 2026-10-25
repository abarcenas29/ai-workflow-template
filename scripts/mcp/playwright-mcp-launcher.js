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
 * Builds the `npx @playwright/mcp@latest` argument list from the environment.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment to read.
 * @returns {string[]} Arguments passed to `npx`.
 */
export function buildArgs(env = process.env) {
  const args = ['@playwright/mcp@latest']

  if (env.HEADLESS === 'true') {
    args.push('--headless')
  }

  if (env.VIEWPORT) {
    args.push('--viewport', env.VIEWPORT)
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
    shell: true,
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
