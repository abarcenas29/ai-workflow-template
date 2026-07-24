// ═════════════════════════════════════════════════════════════════════════════
// utils.js — Shared utility functions for the setup command pipeline
// ═════════════════════════════════════════════════════════════════════════════

import { createHash } from 'crypto'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

import { CI_ENV_VARS, SUPPORTED_FLAGS } from './constants.js'

// ── Path resolution ──────────────────────────────────────────────────────────

/**
 * Resolves the consumer project root directory.
 *
 * Priority:
 *   1. `INIT_CWD` environment variable (set by npm/npx) — resolved to absolute
 *   2. `process.cwd()` — fallback with a warning
 *
 * @returns {string} Absolute path to the consumer's project root.
 */
export function getConsumerRoot() {
  const initCwd = process.env.INIT_CWD
  if (initCwd) {
    return resolve(initCwd)
  }
  logWarn(
    '[setup] INIT_CWD is not set; falling back to process.cwd(). ' +
      'Consumer root detection may be inaccurate.',
  )
  return process.cwd()
}

/**
 * Resolves the package root (where this package is installed) by walking up
 * from the current module's location.
 *
 * Uses `import.meta.url` to determine the filesystem path of this file,
 * assumes it lives at `<packageRoot>/scripts/setup/utils.js`, and walks up
 * two directories.
 *
 * @returns {string} Absolute path to the package root.
 */
export function resolvePackageRoot() {
  const thisFile = fileURLToPath(import.meta.url)
  const thisDir = dirname(thisFile) // .../scripts/setup
  return resolve(thisDir, '..', '..') // .../
}

/**
 * Joins the consumer project root with the provided path segments to produce
 * an absolute path.
 *
 * @param {...string} segments - Path segments to join beneath the consumer root.
 * @returns {string} Absolute path.
 */
export function resolveConsumerPath(...segments) {
  return resolve(getConsumerRoot(), ...segments)
}

// ── File system helpers ──────────────────────────────────────────────────────

/**
 * Creates a directory and its parents if they do not already exist
 * (equivalent to `mkdir -p`).
 *
 * @param {string} dirPath - Absolute or relative directory path.
 * @returns {boolean} `true` if the directory exists or was created.
 * @throws {Error} If a non-EEXIST filesystem error occurs.
 */
export function ensureDir(dirPath) {
  try {
    mkdirSync(dirPath, { recursive: true })
    return true
  } catch (err) {
    // EEXIST is expected when the directory already exists
    if (err.code === 'EEXIST') return true
    throw err
  }
}

/**
 * Reads a file from disk and returns its contents as a UTF-8 string.
 *
 * Returns `null` when the file does not exist (ENOENT). All other errors
 * are re-thrown so callers can handle unexpected failures explicitly.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {string|null} File contents, or `null` if the file does not exist.
 */
export function safeReadFile(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Writes content to a file, creating parent directories if necessary.
 *
 * Handles permission-denied and read-only filesystem errors gracefully by
 * returning `false` instead of throwing.
 *
 * @param {string} filePath - Absolute path to the file.
 * @param {string|Buffer} content - Content to write.
 * @param {object} [options] - Write options (encoding, mode, etc.).
 * @returns {boolean} `true` on successful write, `false` on EACCES/EROFS.
 * @throws {Error} If an unexpected filesystem error occurs.
 */
export function safeWriteFile(filePath, content, options = {}) {
  try {
    ensureDir(dirname(filePath))
    writeFileSync(filePath, content, options)
    return true
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EROFS') return false
    throw err
  }
}

/**
 * Appends content to a file, creating parent directories and the file itself
 * if they do not yet exist.
 *
 * @param {string} filePath - Absolute path to the file.
 * @param {string} content - Content to append.
 * @throws {Error} If a filesystem error occurs.
 */
export function safeAppendFile(filePath, content) {
  ensureDir(dirname(filePath))
  appendFileSync(filePath, content, 'utf-8')
}

/**
 * Checks whether a path exists on the filesystem.
 *
 * @param {string} filePath - Path to check.
 * @returns {boolean} `true` if the path exists (file, directory, symlink, etc.).
 */
export function fileExists(filePath) {
  return existsSync(filePath)
}

/**
 * Checks whether a path exists AND is a directory.
 *
 * @param {string} dirPath - Path to check.
 * @returns {boolean} `true` if the path exists and is a directory.
 */
export function dirExists(dirPath) {
  try {
    return statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

// ── File inspection ──────────────────────────────────────────────────────────

/**
 * Checks whether a file is a shell script by reading its first line and testing
 * for a `#!` (shebang) prefix.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {boolean} `true` if the first line starts with `#!`.
 */
export function isShellScript(filePath) {
  try {
    const firstLine = readFileSync(filePath, 'utf-8').split('\n')[0]
    return firstLine != null && firstLine.startsWith('#!')
  } catch {
    return false
  }
}

/**
 * Sets the executable permission bits (0755 / rwxr-xr-x) on a file.
 *
 * @param {string} filePath - Absolute path to the file.
 * @throws {Error} If the file does not exist or permissions cannot be changed.
 */
export function chmodX(filePath) {
  chmodSync(filePath, 0o755)
}

// ── JSON helpers ─────────────────────────────────────────────────────────────

/**
 * Reads and parses a JSON file.
 *
 * Returns `undefined` when the file cannot be read or parsed (ENOENT,
 * JSON syntax errors, etc.) so callers can safely attempt optional reads.
 *
 * @param {string} filePath - Absolute path to the JSON file.
 * @returns {object|undefined} Parsed object, or `undefined` on failure.
 */
export function safeReadJson(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

/**
 * Writes an object to a JSON file with 2-space indentation and a trailing
 * newline. Creates parent directories if needed.
 *
 * @param {string} filePath - Absolute path to the JSON file.
 * @param {object} obj - Object to serialize.
 * @throws {Error} If the file cannot be written.
 */
export function safeWriteJson(filePath, obj) {
  const content = JSON.stringify(obj, null, 2) + '\n'
  safeWriteFile(filePath, content)
}

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 hex digest of a string.
 *
 * Useful for comparing file contents without holding them in memory.
 *
 * @param {string} content - The string content to hash.
 * @returns {string} Lowercase hex-encoded SHA-256 digest.
 */
export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex')
}

// ── Environment detection ────────────────────────────────────────────────────

/**
 * Detects whether the command is running inside a CI/CD pipeline.
 *
 * Checks every environment variable name from `CI_ENV_VARS`:
 * - `NODE_ENV` is tested for strict equality to `'production'`
 * - All others are tested for truthiness
 *
 * @returns {boolean} `true` if any CI indicator is found.
 */
export function isCI() {
  return CI_ENV_VARS.some((name) => {
    const value = process.env[name]
    if (name === 'NODE_ENV') return value === 'production'
    return !!value
  })
}

/**
 * Returns the consumer's major Node.js version as an integer.
 *
 * Parses `process.version` (e.g. `"v18.17.1"` → `18`).
 *
 * @returns {number} Major Node.js version.
 */
export function getNodeVersion() {
  return parseInt(process.version.slice(1).split('.')[0], 10)
}

// ── CLI argument parsing ────────────────────────────────────────────────────

/**
 * Builds a default flags object with every supported flag key set to `false`.
 *
 * @returns {object} Flags object.
 */
function defaultFlags() {
  const keys = [...new Set(Object.values(SUPPORTED_FLAGS))]
  return Object.fromEntries(keys.map((k) => [k, false]))
}

/**
 * Parses CLI arguments (`argv` array) into a structured flags object.
 *
 * Handles these argument formats:
 *   `--flag`           → boolean `true`
 *   `--flag=value`     → string value (for non-boolean flags)
 *   `--no-flag`        → boolean `false`
 *   `-f` (short form)  → boolean `true` (mapped via `SUPPORTED_FLAGS`)
 *
 * Unrecognised arguments are silently ignored.
 *
 * @param {string[]} argv - Array of CLI arguments (typically `process.argv.slice(2)`).
 * @returns {object} Flags object with all supported keys set.
 *
 * @example
 * parseCliArgs(['--force', '--dry-run', '--skip-hooks'])
 * // → { force: true, dryRun: true, yes: false, skipHooks: true, skipPrepare: false,
 * //     skipSync: false, help: false, version: false, quiet: false, verbose: false }
 */
export function parseCliArgs(argv) {
  const flags = defaultFlags()

  for (const arg of argv) {
    // --no-flag-name → flagName: false
    if (arg.startsWith('--no-')) {
      const dashed = arg.slice(5) // remove '--no-'
      const camel = dashed.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      if (camel in flags) {
        flags[camel] = false
      }
      continue
    }

    // --flag=value → property = value (as string)
    if (arg.includes('=')) {
      const eqIdx = arg.indexOf('=')
      const raw = arg.slice(0, eqIdx)
      const value = arg.slice(eqIdx + 1)
      const mapped = SUPPORTED_FLAGS[raw]
      if (mapped) {
        flags[mapped] = value
      }
      continue
    }

    // --flag or -f → property: true
    const mapped = SUPPORTED_FLAGS[arg]
    if (mapped) {
      flags[mapped] = true
    }
  }

  return flags
}

// ── Logging wrappers ─────────────────────────────────────────────────────────

/**
 * Logs an error message to stderr.
 * Will be enhanced with colour formatting by ui.js in the future.
 *
 * @param {string} message - Error message.
 */
export function logError(message) {
  console.error(message)
}

/**
 * Logs a warning message to stderr.
 * Will be enhanced with colour formatting by ui.js in the future.
 *
 * @param {string} message - Warning message.
 */
export function logWarn(message) {
  console.warn(message)
}

/**
 * Logs an informational message to stdout.
 * Will be enhanced with colour formatting by ui.js in the future.
 *
 * @param {string} message - Info message.
 */
export function logInfo(message) {
  console.log(message)
}
