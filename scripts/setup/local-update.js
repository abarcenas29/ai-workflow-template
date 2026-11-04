// ═════════════════════════════════════════════════════════════════════════════
// local-update.js — Advisory notice for local (git-ignored) OpenCode V2 state
// ═════════════════════════════════════════════════════════════════════════════
//
// OpenCode V2 renamed the plugin SDK (`@opencode-ai/plugin` →
// `@opencode/plugin`) and replaced the singular `plugin` config key with
// directory auto-discovery. Both affected files are git-ignored in consumer
// projects, so a package upgrade can never repair them. This module detects
// the stale state and prints copy-pasteable migration steps.
//
// Contract:
//   - Non-fatal: every failure is swallowed and the caller's exit code is
//     never changed.
//   - Idempotent: prints nothing when the local files are already correct.
//   - Read-only: never writes, moves, or deletes a file.
//   - Colour-safe: ANSI codes only when the output stream is a TTY and
//     `NO_COLOR` is unset.
//
// Load paths:
//   - `scripts/setup/index.js` calls `printLocalUpdateNotice()` once per
//     `npx ai-workflow-setup` run.
//   - The module is also a standalone CLI:
//     `node scripts/setup/local-update.js [consumerRoot]`.
//
// No `postinstall` hook wires this module: npm 12+, pnpm 10+, and Yarn 4
// block dependency lifecycle scripts by default, and this package deliberately
// ships none (README "No install-time scripts"; `scripts/sync-unit.test.js`
// asserts `scripts.postinstall` is undefined).
// ═════════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

// ── Constants ────────────────────────────────────────────────────────────────

/** V2 plugin SDK package name (renamed from `@opencode-ai/plugin`). */
export const V2_SDK = '@opencode/plugin'

/** SDK version that matches the OpenCode 2.2.5 runtime. */
export const V2_SDK_VERSION = '2.2.5'

/** V1 plugin SDK package name; its presence means the pin was never updated. */
export const V1_SDK = '@opencode-ai/plugin'

/** Deprecated singular config key removed in V2. */
export const DEPRECATED_CONFIG_KEY = 'plugin'

/** Shipped plugin file referenced by the migration notice. */
export const GRAPHIFY_PLUGIN = '.opencode/plugins/graphify.js'

/** OpenCode config schema URL kept in the post-migration config file. */
export const CONFIG_SCHEMA = 'https://opencode.ai/config.json'

/** Stable reason identifiers returned by the detector. */
export const REASONS = Object.freeze({
  CONFIG_KEY: 'config-plugin-key',
  SDK_V1: 'sdk-v1',
  SDK_NOT_PINNED: 'sdk-not-pinned',
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reads and parses a JSON file.
 *
 * Returns `undefined` for a missing file, unreadable file, or invalid JSON.
 * The caller treats that as "not verifiable" and stays silent rather than
 * guessing at a migration the file does not obviously need.
 *
 * @param {string} filePath - Absolute path to the JSON file.
 * @returns {object|undefined} Parsed object, or `undefined` on any failure.
 */
function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return undefined
  }
}

/**
 * Returns the dependency maps of a `package.json` object, merged so that a pin
 * in either `dependencies` or `devDependencies` counts as declared.
 *
 * @param {object} pkg - Parsed `package.json`.
 * @returns {Record<string, unknown>} Merged dependency map.
 */
function dependencyMap(pkg) {
  return {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  }
}

/**
 * Decides whether ANSI colour may be emitted for the given stream.
 *
 * @param {{ isTTY?: boolean }} stream - Output stream (defaults to stdout).
 * @returns {boolean} `true` when colour is safe.
 */
export function shouldUseColor(stream) {
  if (process.env.NO_COLOR) return false
  return stream?.isTTY === true
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Inspects the consumer's local, git-ignored OpenCode files.
 *
 * Absent files are treated as "nothing to migrate", which keeps a clean
 * checkout and a brand-new consumer silent. A file that exists but cannot be
 * parsed is also skipped: the module never nags about state it cannot read.
 *
 * @param {string} consumerRoot - Absolute consumer project root.
 * @returns {{ stale: boolean, reasons: string[], files: Record<string, string>, configKeys?: string[] }}
 *   `stale` is `true` when at least one migration step applies. `configKeys`
 *   names the deprecated key(s) actually found in the config file.
 */
export function detectLocalUpdate(consumerRoot) {
  if (!consumerRoot) {
    return { stale: false, reasons: [], files: {} }
  }

  const files = {
    config: join(consumerRoot, '.opencode', 'opencode.json'),
    package: join(consumerRoot, '.opencode', 'package.json'),
  }

  /** @type {string[]} */
  const reasons = []

  // The actual deprecated key(s) present, so the notice can name only the keys
  // the consumer has to remove instead of guessing between `plugin`/`plugins`.
  /** @type {string[]} */
  const configKeys = []

  // 1. Deprecated `plugin`/`plugins` keys (V2 uses directory auto-discovery).
  if (existsSync(files.config)) {
    const config = readJson(files.config)
    const isObject = config !== null && typeof config === 'object' && !Array.isArray(config)
    if (isObject) {
      if (Object.prototype.hasOwnProperty.call(config, DEPRECATED_CONFIG_KEY)) {
        configKeys.push(DEPRECATED_CONFIG_KEY)
      }
      if (Object.prototype.hasOwnProperty.call(config, 'plugins')) {
        configKeys.push('plugins')
      }
      if (configKeys.length > 0) {
        reasons.push(REASONS.CONFIG_KEY)
      }
    }
  }

  // 2. Plugin SDK pin: V1 package present, or V2 package absent/mis-versioned.
  if (existsSync(files.package)) {
    const pkg = readJson(files.package)
    if (pkg !== null && typeof pkg === 'object' && !Array.isArray(pkg)) {
      const deps = dependencyMap(pkg)
      if (Object.prototype.hasOwnProperty.call(deps, V1_SDK)) {
        reasons.push(REASONS.SDK_V1)
      }
      if (deps[V2_SDK] !== V2_SDK_VERSION) {
        reasons.push(REASONS.SDK_NOT_PINNED)
      }
    }
  }

  return { stale: reasons.length > 0, reasons, files, configKeys }
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Wraps text in an ANSI SGR sequence.
 *
 * @param {string} code - SGR parameter, e.g. `'1;33'`.
 * @param {string} text - Text to wrap.
 * @param {boolean} enabled - When `false`, returns the text unchanged.
 * @returns {string} Painted or plain text.
 */
function paint(code, text, enabled) {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text
}

/**
 * Formats the deprecated config keys detected by the detector.
 *
 * Falls back to both known keys when the state comes from a caller that did not
 * run detection, so the notice never silently drops the key the user has.
 *
 * @param {string[]|undefined} keys - Detected keys, in config order.
 * @returns {string} Quoted key list, e.g. `"plugins"` or `"plugin" and "plugins"`.
 */
function formatConfigKeys(keys) {
  const detected = Array.isArray(keys) && keys.length > 0 ? keys : ['plugin', 'plugins']
  const quoted = detected.map((key) => `"${key}"`)

  if (quoted.length === 1) return quoted[0]
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`

  return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`
}

/**
 * Renders the migration notice for a stale local configuration.
 *
 * Each step is emitted only when its reason applies, so a config-only tree is
 * not told to re-pin an SDK it already has, and a `plugins`-only tree is not
 * told to remove a `plugin` key it does not have.
 *
 * Returns an empty string when the state is not stale, so callers can write
 * the result unconditionally.
 *
 * @param {{ stale: boolean, reasons: string[], configKeys?: string[] }} state - Detector output.
 * @param {{ color?: boolean }} [options] - Rendering options.
 * @returns {string} Notice text (may be empty).
 */
export function renderLocalUpdateNotice(state, options = {}) {
  if (!state?.stale) return ''

  const color = options.color === true
  const reasons = Array.isArray(state.reasons) ? state.reasons : []
  const hasConfigReason = reasons.includes(REASONS.CONFIG_KEY)
  const hasV1SdkReason = reasons.includes(REASONS.SDK_V1)
  const hasSdkReason = hasV1SdkReason || reasons.includes(REASONS.SDK_NOT_PINNED)

  const heading = paint(
    '1;33',
    '[ai-workflow-template] Local OpenCode V2 update required',
    color,
  )
  const bold = (text) => paint('1', text, color)
  const dim = (text) => paint('2', text, color)

  /** @type {Array<{ title: string, lines: string[] }>} */
  const steps = []

  if (hasConfigReason) {
    const detectedKeys =
      Array.isArray(state.configKeys) && state.configKeys.length > 0
        ? state.configKeys
        : ['plugin', 'plugins']
    const keyNoun = detectedKeys.length === 1 ? 'key' : 'keys'

    steps.push({
      title: `Remove the deprecated ${formatConfigKeys(detectedKeys)} ${keyNoun} from .opencode/opencode.json`,
      lines: [
        '   OpenCode V2 auto-discovers every file in .opencode/plugins/. A configured',
        '   path either triggers an npm install attempt (the singular key with a',
        '   single file) or duplicates the auto-discovered directory load (the plural',
        '   key). The file should contain only:',
        `     {"$schema": "${CONFIG_SCHEMA}"}`,
      ],
    })
  }

  if (hasSdkReason) {
    const lines = []
    if (hasV1SdkReason) {
      lines.push(`   OpenCode V2 renamed the SDK package from ${V1_SDK} to ${V2_SDK}.`)
    } else {
      lines.push(`   .opencode/package.json must pin ${V2_SDK} at the runtime version.`)
    }

    steps.push({
      title: `Set ${V2_SDK} to ${V2_SDK_VERSION} in .opencode/package.json`,
      lines: [
        ...lines,
        '   Set the package manifest to:',
        '     {',
        '       "type": "module",',
        `       "dependencies": { "${V2_SDK}": "${V2_SDK_VERSION}" }`,
        '     }',
        '   Then reinstall:',
        '     npm install --prefix .opencode',
      ],
    })
  }

  if (reasons.length > 0) {
    steps.push({
      title: 'Restart OpenCode',
      lines: [`   Plugins load at startup, so a restart reloads ${GRAPHIFY_PLUGIN}.`],
    })
  }

  const lines = [
    '',
    heading,
    dim('These files are git-ignored, so a package upgrade cannot update them.'),
  ]

  for (const [index, step] of steps.entries()) {
    lines.push('', bold(`${index + 1}. ${step.title}`), ...step.lines)
  }

  lines.push(
    '',
    bold('Also note'),
    '- ~/.config/opencode/plugins/herdr-agent-state.js is still V1-shaped: its',
    '  logic lives in a server() hook, which V2 ignores. Port it to a default',
    '  { id, setup } export separately; this template does not manage that file.',
    '- MCP servers that need DATABASE_URL will report',
    '  "DATABASE_URL is not configured" until it is set (see .env.example).',
    '',
  )

  return lines.join('\n')
}

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * Detects and prints the migration notice. Never throws.
 *
 * @param {object} [options] - Call options.
 * @param {string} [options.consumerRoot] - Consumer project root.
 * @param {NodeJS.WritableStream} [options.stream] - Output stream (stdout).
 * @param {boolean} [options.quiet] - Suppress all output when `true`.
 * @param {boolean} [options.color] - Force colour on/off; auto-detected when omitted.
 * @returns {{ printed: boolean, reasons: string[] }} What happened.
 */
export function printLocalUpdateNotice(options = {}) {
  const { consumerRoot, stream = process.stdout, quiet = false } = options

  if (quiet) return { printed: false, reasons: [] }

  try {
    const state = detectLocalUpdate(consumerRoot)
    if (!state.stale) return { printed: false, reasons: [] }

    const color =
      typeof options.color === 'boolean' ? options.color : shouldUseColor(stream)
    stream.write(renderLocalUpdateNotice(state, { color }))

    return { printed: true, reasons: state.reasons }
  } catch {
    // Advisory only: a broken notice must never fail setup.
    return { printed: false, reasons: [] }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//
// Runs only when this file is executed directly, so importing it from the
// setup pipeline has no side effects. Always exits 0.

function isDirectInvocation() {
  if (!process.argv[1]) return false
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isDirectInvocation()) {
  const consumerRoot = process.argv[2] || process.env.INIT_CWD || process.cwd()
  printLocalUpdateNotice({ consumerRoot })
  process.exitCode = 0
}
