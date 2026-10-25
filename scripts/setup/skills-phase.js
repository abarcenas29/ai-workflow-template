// ═════════════════════════════════════════════════════════════════════════════
// skills-phase.js — Setup phase: install pinned skills from upstream
// ═════════════════════════════════════════════════════════════════════════════
//
// Reads `skills-lock.json`, downloads every file recorded for each *pinned*
// skill (an entry with a `ref` and a non-empty `files[]`), verifies each
// buffer's SHA-256 against the lock, and writes the verified bytes into
// `<consumerRoot>/.agents/skills/<name>/`.
//
// The phase converts every upstream failure into a fallback and never throws
// for network/timeout/non-200/hash errors. On such a failure it copies the
// pinned skills shipped inside this package (`<packageRoot>/.agents/skills/`)
// instead and prints exactly one notice (REQ-13, D-08). A destination file
// whose content differs from the lock is overwritten after a warning naming
// that file, because the pin is authoritative (REQ-14, D-09). Unexpected
// filesystem write errors are the caller's to handle (index.js warns).
//
// Both paths are stage-then-commit: upstream files are buffered and verified
// before anything is written, and shipped copies are read in full before the
// first file lands on disk. A skill therefore never ends up half-written.
//
// Skipping/gating:
//   - `flags.skipSync` → `{ action: 'skipped' }` (index.js also gates the call)
//   - no pinned entries → no-op, zero network calls
//
// The `fetch` implementation is injectable so tests never touch the network.
// ═════════════════════════════════════════════════════════════════════════════

import { createHash } from 'crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

import { stepSuccess, stepWarn } from './ui.js'

// ── Constants ────────────────────────────────────────────────────────────────

/** Name of the lock file at the package root. */
const LOCK_FILE = 'skills-lock.json'

/** Base URL for raw files on GitHub. */
const UPSTREAM_BASE = 'https://raw.githubusercontent.com'

/** Default network timeout for a single file download. */
const DEFAULT_TIMEOUT_MS = 5000

/** Path segments (from a project root) that contain installed skills. */
const SKILLS_DIR = ['.agents', 'skills']

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Refreshes pinned skills from upstream, falling back to the shipped copies.
 *
 * Every upstream failure mode (network, timeout, non-200, hash mismatch) is
 * converted into a fallback: the returned promise never rejects for those.
 * Unexpected filesystem write errors propagate to the caller.
 *
 * @param {object} [context={}] - Setup context object.
 * @param {string} [context.consumerRoot] - Absolute path to the consumer project.
 * @param {boolean} [context.dryRun=false] - When `true`, perform no writes.
 * @param {object} [context.flags={}] - Parsed CLI flags. `skipSync` short-circuits.
 * @param {object} [options={}] - Injectable dependencies (used by tests).
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {string} [options.packageRoot] - Package root override.
 * @param {string} [options.lockPath] - Lock file path override.
 * @param {number} [options.fetchTimeoutMs] - Per-file timeout override.
 * @returns {Promise<{
 *   action: 'completed'|'dry-run'|'skipped',
 *   message: string,
 *   pinned: number,
 *   fetched: string[],
 *   fallback: string[],
 *   skipped: string[],
 *   warnings: string[]
 * }>} Structured phase result.
 *
 * @example
 * ```js
 * const result = await runSkillsPhase(context)
 * // result.fetched → ['grilling', 'prototype']
 * ```
 */
export async function runSkillsPhase(context = {}, options = {}) {
  const { consumerRoot, dryRun = false, flags = {} } = context
  const packageRoot = options.packageRoot ?? resolvePackageRoot()
  const lockPath = options.lockPath ?? join(packageRoot, LOCK_FILE)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.fetchTimeoutMs ?? DEFAULT_TIMEOUT_MS

  const result = {
    action: 'completed',
    message: '',
    pinned: 0,
    fetched: [],
    fallback: [],
    skipped: [],
    warnings: [],
  }

  // ── 1. Defensive skip (index.js already gates on --skip-sync) ───────────
  if (flags.skipSync) {
    result.action = 'skipped'
    result.message = 'Skills phase skipped (--skip-sync)'
    stepWarn('Skills: phase skipped (--skip-sync)')
    return result
  }

  // ── 2. No target project ────────────────────────────────────────────────
  if (!consumerRoot || !isDirectory(consumerRoot)) {
    result.message = 'Skills phase skipped \u2014 consumer root not found'
    return result
  }

  // ── 3. Read the lock and select pinned entries ──────────────────────────
  const pinned = pinnedEntries(readLock(lockPath))
  result.pinned = pinned.length

  if (pinned.length === 0) {
    result.message = '0 pinned skills, nothing to fetch'
    stepSuccess('Skills: 0 pinned skills, nothing to fetch')
    return result
  }

  // ── 4. Classify each pinned skill ───────────────────────────────────────
  const toFetch = []

  for (const { name, entry } of pinned) {
    const files = []

    for (const file of entry.files) {
      const dest = destinationFor(consumerRoot, name, file, result)
      if (!dest) continue
      files.push({ file, dest, currentHash: hashFile(dest) })
    }

    if (files.length === 0) continue // every recorded path was rejected

    const pending = files.filter((f) => f.currentHash !== f.file.sha256)
    if (pending.length === 0) {
      result.skipped.push(name)
      continue
    }

    if (dryRun) {
      for (const f of pending) noteLocalEdit(f, result, true)
      result.fetched.push(name)
      continue
    }

    toFetch.push({ name, entry, files })
  }

  if (dryRun) {
    result.action = 'dry-run'
    result.message = `Would fetch ${result.fetched.length} pinned skill(s) from upstream`
    if (result.skipped.length) {
      result.message += `; ${result.skipped.length} already up to date`
    }
    stepSuccess(`Skills: ${result.message}`)
    return result
  }

  // ── 5. Fetch, verify, write (fallback per skill) ────────────────────────
  let noticePrinted = false
  let upstreamDown = false

  for (const { name, entry, files } of toFetch) {
    if (upstreamDown) {
      copyShippedSkill(name, files, packageRoot, result)
      result.fallback.push(name)
      continue
    }

    let verified
    try {
      verified = await fetchVerifiedFiles(files, entry, fetchImpl, timeoutMs)
    } catch (err) {
      if (!noticePrinted) {
        stepWarn(
          `Skills: upstream fetch unavailable (${describeError(err)}) \u2014 ` +
            'using the copies shipped with the package.',
        )
        noticePrinted = true
      }
      if (err && err.networkFailure) upstreamDown = true
      copyShippedSkill(name, files, packageRoot, result)
      result.fallback.push(name)
      continue
    }

    for (const f of verified) {
      if (f.currentHash === f.file.sha256) continue
      noteLocalEdit(f, result, false)
      writeFile(f.dest, f.buffer)
    }
    result.fetched.push(name)
  }

  // ── 6. Report ───────────────────────────────────────────────────────────
  const parts = []
  if (result.fetched.length) {
    parts.push(`Fetched ${result.fetched.length} pinned skill(s) from upstream`)
  }
  if (result.fallback.length) {
    parts.push(
      `${result.fallback.length} restored from the copies shipped with the package`,
    )
  }
  if (result.skipped.length) {
    parts.push(`${result.skipped.length} already up to date`)
  }
  result.message = parts.join('; ')
  stepSuccess(`Skills: ${result.message}`)

  return result
}

// ── Lock helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves the package root from this module's own location.
 *
 * @returns {string} Absolute path to `<packageRoot>`.
 */
function resolvePackageRoot() {
  const thisDir = dirname(fileURLToPath(import.meta.url)) // .../scripts/setup
  return resolve(thisDir, '..', '..')
}

/**
 * Reads and parses a JSON lock file.
 *
 * @param {string} lockPath - Absolute path to `skills-lock.json`.
 * @returns {object|null} Parsed lock, or `null` when unreadable/invalid.
 */
function readLock(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Extracts the pinned skill entries from a parsed lock file.
 *
 * Only usable file records survive: a malformed lock must degrade to a no-op,
 * never to a thrown `TypeError` while building URLs or destination paths.
 *
 * @param {object|null} lock - Parsed lock object.
 * @returns {Array<{ name: string, entry: object }>} Pinned entries.
 */
function pinnedEntries(lock) {
  const skills =
    lock && lock.skills && typeof lock.skills === 'object' ? lock.skills : {}

  return Object.entries(skills)
    .filter(([, entry]) => isPinned(entry))
    .map(([name, entry]) => ({
      name,
      entry: {
        ...entry,
        ref: entry.ref.trim(),
        source:
          typeof entry.source === 'string' && entry.source.trim().length > 0
            ? entry.source.trim()
            : 'mattpocock/skills',
        files: entry.files.filter(isUsableFile),
      },
    }))
}

/**
 * Returns `true` when an entry is pinned to a ref with at least one usable file.
 *
 * Entries without `ref`/`files` (the caveman skills) are deliberately ignored.
 *
 * @param {object|undefined} entry - Lock entry.
 * @returns {boolean} Whether the entry has a usable pin.
 */
function isPinned(entry) {
  return Boolean(
    entry &&
      typeof entry.ref === 'string' &&
      entry.ref.trim().length > 0 &&
      Array.isArray(entry.files) &&
      entry.files.some(isUsableFile),
  )
}

/**
 * Returns `true` when a recorded file has the fields the phase needs.
 *
 * @param {object|undefined} file - Recorded file entry.
 * @returns {boolean} Whether the record can be fetched and written safely.
 */
function isUsableFile(file) {
  return Boolean(
    file &&
      typeof file.path === 'string' &&
      file.path.trim().length > 0 &&
      typeof file.sha256 === 'string' &&
      file.sha256.trim().length > 0 &&
      typeof file.upstreamPath === 'string' &&
      file.upstreamPath.trim().length > 0,
  )
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

/**
 * Builds the pinned raw URL for one recorded file.
 *
 * @param {object} entry - Pinned lock entry.
 * @param {{ upstreamPath: string }} file - Recorded file.
 * @returns {string} Raw GitHub URL.
 */
function upstreamUrl(entry, file) {
  const source = entry.source || 'mattpocock/skills'
  return `${UPSTREAM_BASE}/${source}/${entry.ref}/${file.upstreamPath}`
}

/**
 * Downloads and hash-verifies every file of one skill.
 *
 * Buffering all files before returning guarantees a skill is never written
 * half-verified. Throws an error tagged with `networkFailure` for transport
 * failures so the caller can short-circuit the remaining skills.
 *
 * @param {Array<{ file: object, dest: string, currentHash: string|null }>} files
 * @param {object} entry - Pinned lock entry.
 * @param {typeof fetch} fetchImpl - Fetch implementation.
 * @param {number} timeoutMs - Per-file timeout.
 * @returns {Promise<Array<{ file: object, dest: string, currentHash: string|null, buffer: Buffer }>>}
 */
async function fetchVerifiedFiles(files, entry, fetchImpl, timeoutMs) {
  const verified = []

  for (const f of files) {
    let response
    try {
      response = await fetchImpl(upstreamUrl(entry, f.file), buildRequestInit(timeoutMs))
    } catch (err) {
      throw markNetworkFailure(err)
    }

    if (!response || !response.ok) {
      const status = response && response.status != null ? response.status : 'unknown'
      throw markNetworkFailure(new Error(`HTTP ${status}`))
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const actual = sha256(buffer)

    if (actual !== f.file.sha256) {
      const err = new Error(
        `hash mismatch for ${f.file.path} (expected ${f.file.sha256}, got ${actual})`,
      )
      err.networkFailure = false
      throw err
    }

    verified.push({ ...f, buffer })
  }

  return verified
}

/**
 * Builds fetch options, adding an abort timeout when the runtime supports it.
 *
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {object} `RequestInit`-compatible options.
 */
function buildRequestInit(timeoutMs) {
  if (
    typeof AbortSignal === 'undefined' ||
    typeof AbortSignal.timeout !== 'function'
  ) {
    return {}
  }
  return { signal: AbortSignal.timeout(timeoutMs) }
}

/**
 * Tags an error as a transport (network) failure.
 *
 * @param {*} err - Thrown value.
 * @returns {*} The same value, with `networkFailure = true` when possible.
 */
function markNetworkFailure(err) {
  if (err && typeof err === 'object') err.networkFailure = true
  return err
}

/**
 * Produces a short human-readable reason for a failure.
 *
 * @param {*} err - Thrown value.
 * @returns {string} Reason text.
 */
function describeError(err) {
  if (!err) return 'unknown error'
  if (err.name === 'TimeoutError') return 'timed out'
  return err.message || String(err)
}

// ── Fallback / write helpers ─────────────────────────────────────────────────

/**
 * Copies one skill from the package's shipped copies into the consumer.
 *
 * Every recorded file is read and validated into memory before the first write,
 * so a missing/unreadable shipped file cannot leave a half-populated skill
 * directory. Missing or hash-mismatched shipped files produce warnings but
 * never throw. Files whose current content differs from the pin are reported
 * with the same local-edit warning used by the upstream path (REQ-14).
 *
 * @param {string} name - Skill name.
 * @param {Array<{ file: object, dest: string, currentHash: string|null }>} files
 *   Recorded files with their resolved destinations.
 * @param {string} packageRoot - Package root.
 * @param {string} consumerRoot - Consumer project root.
 * @param {object} result - Mutable phase result.
 * @returns {number} Number of files copied.
 */
function copyShippedSkill(name, files, packageRoot, result) {
  const sourceDir = join(packageRoot, ...SKILLS_DIR, name)
  const staged = []

  for (const { file, dest, currentHash } of files) {
    const source = join(sourceDir, file.path)
    let content
    try {
      content = readFileSync(source)
    } catch (err) {
      const reason =
        err && err.code === 'ENOENT'
          ? 'Shipped copy missing'
          : 'Shipped copy unreadable'
      const msg = `${reason} for ${name}/${file.path}`
      result.warnings.push(msg)
      stepWarn(`Skills: ${msg}`)
      continue
    }

    if (sha256(content) !== file.sha256) {
      const msg = `Shipped copy does not match the lock hash: ${name}/${file.path}`
      result.warnings.push(msg)
      stepWarn(`Skills: ${msg}`)
    }

    staged.push({ file, dest, currentHash, content })
  }

  // Stage-then-commit: only write when the whole skill is available.
  if (staged.length !== files.length) {
    return 0
  }

  try {
    for (const { file, dest, currentHash, content } of staged) {
      noteLocalEdit({ file, dest, currentHash }, result, false)
      writeFile(dest, content)
    }
  } catch (err) {
    const msg = `Could not write the shipped copy for ${name}: ${describeError(err)}`
    result.warnings.push(msg)
    stepWarn(`Skills: ${msg}`)
    return 0
  }

  return staged.length
}

/**
 * Resolves a destination path and rejects paths that escape the skill dir.
 *
 * @param {string} consumerRoot - Consumer project root.
 * @param {string} name - Skill name.
 * @param {{ path: string }} file - Recorded file.
 * @param {object} result - Mutable phase result.
 * @returns {string|null} Absolute destination, or `null` when rejected.
 */
function destinationFor(consumerRoot, name, file, result) {
  const skillDir = join(consumerRoot, ...SKILLS_DIR, name)
  const dest = resolve(skillDir, file.path)

  if (dest !== skillDir && !dest.startsWith(skillDir + sep)) {
    const msg = `Refusing to write outside ${skillDir}: ${file.path}`
    result.warnings.push(msg)
    stepWarn(`Skills: ${msg}`)
    return null
  }

  return dest
}

/**
 * Records (and logs) a warning for a file that has local edits.
 *
 * @param {{ file: object, dest: string, currentHash: string|null }} state
 * @param {object} result - Mutable phase result.
 * @param {boolean} dryRun - Whether the run is a dry run.
 */
function noteLocalEdit(state, result, dryRun) {
  if (state.currentHash === null || state.currentHash === state.file.sha256) {
    return
  }

  const msg = dryRun
    ? `Local edits in ${state.dest} would be overwritten by the pinned version`
    : `Local edits in ${state.dest} \u2014 overwriting with the pinned version`
  result.warnings.push(msg)
  stepWarn(`Skills: ${msg}`)
}

// ── Filesystem helpers ───────────────────────────────────────────────────────

/**
 * Writes a buffer, creating parent directories.
 *
 * @param {string} dest - Absolute destination path.
 * @param {Buffer|string} content - Content to write.
 */
function writeFile(dest, content) {
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content)
}

/**
 * Computes the SHA-256 hex digest of a buffer.
 *
 * @param {Buffer} buffer - Content to hash.
 * @returns {string} Lowercase hex digest.
 */
function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Hashes a file on disk.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {string|null} Hex digest, or `null` when the file is absent.
 */
function hashFile(filePath) {
  try {
    return sha256(readFileSync(filePath))
  } catch {
    return null
  }
}

/**
 * Checks whether a path exists and is a directory.
 *
 * @param {string} dirPath - Path to check.
 * @returns {boolean} `true` for an existing directory.
 */
function isDirectory(dirPath) {
  try {
    return statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}
