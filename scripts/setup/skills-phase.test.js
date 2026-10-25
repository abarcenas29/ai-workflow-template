// ═════════════════════════════════════════════════════════════════════════════
// skills-phase.test.js — Unit tests for the pinned-skills setup phase
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests runSkillsPhase() from skills-phase.js with:
//   - real temp directories for the consumer project and the package root
//   - an injected fake `fetch` (no network access)
//   - mocked ui helpers (no console output)
//
// Covered scenarios:
//   1.  Happy path — fetch N files, verify hashes, write them
//   2.  Default fetch / no AbortSignal.timeout support
//   3.  Non-200 response → fallback, one notice (TEST-07)
//   4.  Null response / missing status → fallback
//   5.  Network rejection → fallback for all remaining skills (TEST-07)
//   6.  Timeout → fallback naming "timed out"
//   7.  Non-Error rejection / undefined rejection → fallback
//   8.  Upstream hash mismatch → fallback (TEST-07)
//   9.  Local edit → warning naming the file, file overwritten
//  10.  No pinned entries → no-op, zero fetch calls
//  11.  Unusable lock shapes → no-op
//  12.  --dry-run → zero writes, zero fetch calls
//  13.  --dry-run with local edit → warning, file untouched
//  14.  Destination already matching → no fetch, no write
//  15.  Mixed upstream + fallback skills
//  16.  --skip-sync flag → skipped (no fetch)
//  17.  Missing consumer root → no-op
//  18.  Path traversal → refused
//  19.  Fallback: missing shipped copy / shipped hash mismatch
//  20.  Default upstream source
//  21.  Unreadable response body → fallback
//  22.  Fallback is all-or-nothing (missing/unreadable/unwritable shipped copies)
//  23.  Malformed lock file records ignored
//  24.  Fallback overwrites local edits with a warning
//  25.  index.js wiring: runs / skipped by --skip-sync / errors contained
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

// ── Mocks ────────────────────────────────────────────────────────────────
//
// index.js imports every phase module; they are mocked here so the wiring
// tests never touch the filesystem. The skills module is wrapped (not
// replaced) so the unit tests below still exercise the real implementation
// while the wiring tests can assert whether it was invoked.

vi.mock('./ui.js', () => ({
  ciModeBanner: vi.fn(),
  header: vi.fn(),
  help: vi.fn(),
  section: vi.fn(),
  step: vi.fn(),
  stepError: vi.fn(),
  stepSuccess: vi.fn(),
  stepWarn: vi.fn(),
  summary: vi.fn(),
}))

vi.mock('./utils.js', () => ({
  parseCliArgs: vi.fn(),
  resolvePackageRoot: vi.fn(),
}))

vi.mock('./discover.js', () => ({ discover: vi.fn() }))
vi.mock('./hooks.js', () => ({ installHooks: vi.fn() }))
vi.mock('./prepare.js', () => ({ handlePrepare: vi.fn() }))
vi.mock('./husky-init.js', () => ({ initHusky: vi.fn() }))
vi.mock('./sync-phase.js', () => ({ runSyncPhase: vi.fn() }))
vi.mock('./knowledgebase.js', () => ({ registerKnowledgebase: vi.fn() }))

vi.mock('./skills-phase.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, runSkillsPhase: vi.fn(actual.runSkillsPhase) }
})

// ── Imports (resolved to the mocks above) ────────────────────────────────

import { runSkillsPhase } from './skills-phase.js'
import { main } from './index.js'
import { stepSuccess, stepWarn } from './ui.js'
import { parseCliArgs } from './utils.js'
import { discover } from './discover.js'
import { installHooks } from './hooks.js'
import { handlePrepare } from './prepare.js'
import { initHusky } from './husky-init.js'
import { runSyncPhase } from './sync-phase.js'
import { registerKnowledgebase } from './knowledgebase.js'
import { EXIT_CODES } from './constants.js'

// ── Fixtures ─────────────────────────────────────────────────────────────

const tempDirs = new Set()

/**
 * Creates and registers a temporary directory for a single test case.
 *
 * @returns {string} Absolute path to the new temp directory.
 */
function createTempDir() {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'skills-phase-test-'))
  tempDirs.add(dir)
  return dir
}

/** Removes every temp directory created during a test. */
function cleanupTempDirs() {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
  tempDirs.clear()
}

/**
 * Computes the SHA-256 hex digest of a string.
 *
 * @param {string} content - Content to hash.
 * @returns {string} Hex digest.
 */
function sha(content) {
  return createHash('sha256').update(Buffer.from(content)).digest('hex')
}

/**
 * Writes a list of `{ path, content }` files beneath a root directory.
 *
 * @param {string} root - Base directory.
 * @param {Array<{ path: string, content: string }>} files - Files to write.
 */
function writeFiles(root, files) {
  for (const file of files) {
    const filePath = join(root, file.path)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, file.content)
  }
}

/**
 * Builds the pinned raw URL used by the phase.
 *
 * @param {string} name - Skill name.
 * @param {string} filePath - File path inside the skill.
 * @param {object} [spec] - Skill spec (may override ref/source/upstreamPath).
 * @returns {string} Raw GitHub URL.
 */
function urlFor(name, filePath, spec = {}) {
  const source = spec.source ?? 'mattpocock/skills'
  const ref = spec.ref ?? 'v1.3.1'
  const upstreamPath =
    spec.upstreamPath ?? `skills/engineering/${name}/${filePath}`
  return `https://raw.githubusercontent.com/${source}/${ref}/${upstreamPath}`
}

/**
 * Builds a package root containing `skills-lock.json` and the shipped copies.
 *
 * A spec with `pinned: false` produces a legacy entry (no `ref`/`files`).
 * `shipped` overrides the contents of the package's copy for fallback tests.
 *
 * @param {Array<object>} specs - Skill specs.
 * @returns {{ pkgRoot: string, consumerRoot: string, routes: object }}
 */
function workspace(specs) {
  const root = createTempDir()
  const pkgRoot = join(root, 'package')
  const consumerRoot = join(root, 'consumer')
  mkdirSync(pkgRoot, { recursive: true })
  mkdirSync(consumerRoot, { recursive: true })

  const skills = {}
  const routes = {}

  for (const spec of specs) {
    if (!spec.pinned) {
      skills[spec.name] = {
        source: 'JuliusBrussee/caveman',
        sourceType: 'github',
        skillPath: `${spec.name}/SKILL.md`,
        computedHash: 'legacy-hash',
      }
      continue
    }

    const files = spec.files.map((file) => ({
      path: file.path,
      sha256: file.sha256 ?? sha(file.content),
      upstreamPath:
        file.upstreamPath ?? `skills/engineering/${spec.name}/${file.path}`,
    }))

    skills[spec.name] = {
      sourceType: 'github',
      skillPath: `skills/engineering/${spec.name}/SKILL.md`,
      ref: spec.ref ?? 'v1.3.1',
      computedHash: files[0].sha256,
      files,
    }
    if (spec.source !== null) {
      skills[spec.name].source = spec.source ?? 'mattpocock/skills'
    }

    writeFiles(
      join(pkgRoot, '.agents', 'skills', spec.name),
      spec.shipped ?? spec.files,
    )

    for (const file of spec.files) {
      routes[urlFor(spec.name, file.path, spec)] = { content: file.content }
    }
  }

  writeFileSync(
    join(pkgRoot, 'skills-lock.json'),
    JSON.stringify({ version: 1, skills }, null, 2),
  )

  return { pkgRoot, consumerRoot, routes }
}

/**
 * Builds a minimal setup context.
 *
 * @param {string|undefined} consumerRoot - Consumer project root.
 * @param {object} [overrides] - Context overrides.
 * @returns {object} Context.
 */
function makeContext(consumerRoot, overrides = {}) {
  return { consumerRoot, dryRun: false, flags: {}, ...overrides }
}

/**
 * Builds a fake `fetch` from a URL → response map.
 *
 * Route values:
 *   - string            → 200 with that body
 *   - `{ content }`     → 200 with that body
 *   - `{ ok, status }`  → response with the given flags
 *   - `{ reject }`      → rejects with that value
 *   - null              → resolves to `null`
 *   - `{ arrayBuffer: false }` → 200 whose body read throws
 *
 * Unknown URLs resolve to a 404 response.
 *
 * @param {Record<string, *>} routes - URL → route definition.
 * @returns {ReturnType<typeof vi.fn>} Fake fetch.
 */
function makeFetch(routes) {
  return vi.fn(async (requestUrl) => {
    const route = routes[requestUrl]
    if (route === undefined) return { ok: false, status: 404 }
    if (route === null) return null
    if (route instanceof Error) throw route
    if (typeof route === 'string') {
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(route) }
    }
    if ('reject' in route) throw route.reject
    if (route.arrayBuffer === false) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => {
          throw new Error('read failed')
        },
      }
    }
    return {
      ok: route.ok ?? true,
      status: route.status,
      arrayBuffer: async () => Buffer.from(route.content ?? ''),
    }
  })
}

/**
 * Reads a destination file inside the consumer project.
 *
 * @param {string} consumerRoot - Consumer project root.
 * @param {string} name - Skill name.
 * @param {string} filePath - File path inside the skill.
 * @returns {string} File content.
 */
function readDest(consumerRoot, name, filePath) {
  return readFileSync(
    join(consumerRoot, '.agents', 'skills', name, filePath),
    'utf-8',
  )
}

/** Returns the stepWarn messages that mention the fallback notice. */
function fallbackNotices() {
  return vi
    .mocked(stepWarn)
    .mock.calls.map((call) => call[0])
    .filter((msg) => String(msg).includes('upstream fetch unavailable'))
}

// ── Unit tests: runSkillsPhase ────────────────────────────────────────────

describe('runSkillsPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupTempDirs()
    vi.unstubAllGlobals()
  })

  // ── 1. Happy path ─────────────────────────────────────────────────────
  it('fetches every recorded file, verifies hashes, and writes them', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [
        { path: 'SKILL.md', content: 'upstream-skill' },
        { path: 'EXTRA.md', content: 'upstream-extra' },
      ],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    const fetchImpl = makeFetch(routes)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.action).toBe('completed')
    expect(result.pinned).toBe(1)
    expect(result.fetched).toEqual(['grilling'])
    expect(result.fallback).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.warnings).toEqual([])
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('upstream-skill')
    expect(readDest(consumerRoot, 'grilling', 'EXTRA.md')).toBe('upstream-extra')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenCalledWith(
      urlFor('grilling', 'SKILL.md'),
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(stepSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Fetched 1 pinned skill(s) from upstream'),
    )
  })

  // ── 2. Default fetch + missing AbortSignal.timeout ────────────────────
  it('uses global fetch when no fetchImpl is injected', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'via-global' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    const fetchImpl = makeFetch(routes)
    vi.stubGlobal('fetch', fetchImpl)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      packageRoot: pkgRoot,
    })

    expect(result.fetched).toEqual(['grilling'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sends no abort signal when AbortSignal.timeout is unavailable', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'no-abort' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    const fetchImpl = makeFetch(routes)
    vi.stubGlobal('AbortSignal', undefined)

    await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), {})
  })

  // ── 3. Non-200 → fallback (TEST-07) ───────────────────────────────────
  it('falls back to shipped copies on a non-200 response', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
      shipped: [{ path: 'SKILL.md', content: 'shipped' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 500 }
    const fetchImpl = makeFetch(routes)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.fetched).toEqual([])
    expect(result.fallback).toEqual(['grilling'])
    expect(result.message).toContain(
      '1 restored from the copies shipped with the package',
    )
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('shipped')
    expect(fallbackNotices()).toHaveLength(1)
    expect(fallbackNotices()[0]).toContain('HTTP 500')
    expect(fallbackNotices()[0]).toContain(
      'using the copies shipped with the package',
    )
  })

  // ── 4. Null response / unknown status ─────────────────────────────────
  it('falls back when fetch resolves to null', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = null

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(fallbackNotices()[0]).toContain('HTTP unknown')
  })

  it('falls back when a response has no status', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(fallbackNotices()[0]).toContain('HTTP unknown')
  })

  // ── 5. Network rejection short-circuits the remaining skills ──────────
  it('falls back for every skill after a network rejection, with one notice', async () => {
    const specs = [
      {
        name: 'grilling',
        pinned: true,
        files: [{ path: 'SKILL.md', content: 'a-up' }],
        shipped: [{ path: 'SKILL.md', content: 'a-shipped' }],
      },
      {
        name: 'prototype',
        pinned: true,
        files: [{ path: 'SKILL.md', content: 'b-up' }],
        shipped: [{ path: 'SKILL.md', content: 'b-shipped' }],
      },
    ]
    const { pkgRoot, consumerRoot, routes } = workspace(specs)
    routes[urlFor('grilling', 'SKILL.md')] = {
      reject: new Error('ECONNREFUSED'),
    }
    const fetchImpl = makeFetch(routes)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.fetched).toEqual([])
    expect(result.fallback).toEqual(['grilling', 'prototype'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fallbackNotices()).toHaveLength(1)
    expect(fallbackNotices()[0]).toContain('ECONNREFUSED')
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('a-shipped')
    expect(readDest(consumerRoot, 'prototype', 'SKILL.md')).toBe('b-shipped')
    expect(result.message).toContain(
      '2 restored from the copies shipped with the package',
    )
  })

  // ── 6. Timeout ────────────────────────────────────────────────────────
  it('reports a timeout when the fetch aborts', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    routes[urlFor('grilling', 'SKILL.md')] = { reject: timeout }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
      fetchTimeoutMs: 10,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(fallbackNotices()[0]).toContain('timed out')
  })

  // ── 7. Non-Error / undefined rejections ───────────────────────────────
  it('describes a string rejection without throwing', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot } = workspace([spec])

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: vi.fn(async () => {
        throw 'offline'
      }),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(fallbackNotices()[0]).toContain('offline')
  })

  it('describes an undefined rejection as an unknown error', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot } = workspace([spec])

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: vi.fn(async () => {
        throw undefined
      }),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(fallbackNotices()[0]).toContain('unknown error')
  })

  // ── 8. Hash mismatch → fallback (TEST-07) ─────────────────────────────
  it('falls back when an upstream file does not match the lock hash', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'pinned-content' }],
      shipped: [{ path: 'SKILL.md', content: 'pinned-content' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { content: 'tampered-content' }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fetched).toEqual([])
    expect(result.fallback).toEqual(['grilling'])
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('pinned-content')
    expect(fallbackNotices()[0]).toContain('hash mismatch')
  })

  // ── 9. Local edit → warning + overwrite ───────────────────────────────
  it('warns naming the file before overwriting local edits', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'pinned-content' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    writeFiles(join(consumerRoot, '.agents', 'skills', 'grilling'), [
      { path: 'SKILL.md', content: 'my local edit' },
    ])

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    const dest = join(consumerRoot, '.agents', 'skills', 'grilling', 'SKILL.md')
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('pinned-content')
    expect(result.fetched).toEqual(['grilling'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain(dest)
    expect(stepWarn).toHaveBeenCalledWith(
      expect.stringContaining('overwriting with the pinned version'),
    )
    expect(vi.mocked(stepWarn).mock.calls[0][0]).toContain(dest)
  })

  it('warns naming the file when the fallback overwrites local edits', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'pinned-content' }],
      shipped: [{ path: 'SKILL.md', content: 'pinned-content' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    writeFiles(join(consumerRoot, '.agents', 'skills', 'grilling'), [
      { path: 'SKILL.md', content: 'my local edit' },
    ])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 500 }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    const dest = join(consumerRoot, '.agents', 'skills', 'grilling', 'SKILL.md')
    expect(result.fallback).toEqual(['grilling'])
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('pinned-content')
    expect(
      result.warnings.some(
        (w) => w.includes(dest) && w.includes('overwriting with the pinned version'),
      ),
    ).toBe(true)
    expect(stepWarn).toHaveBeenCalledWith(
      expect.stringContaining('overwriting with the pinned version'),
    )
  })

  // ── 10. No pinned entries → no-op ─────────────────────────────────────
  it('is a no-op with zero fetch calls when there are no pinned entries', async () => {
    const { pkgRoot, consumerRoot } = workspace([
      { name: 'caveman', pinned: false },
      { name: 'compress', pinned: false },
    ])
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.action).toBe('completed')
    expect(result.pinned).toBe(0)
    expect(result.message).toBe('0 pinned skills, nothing to fetch')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(existsSync(join(consumerRoot, '.agents'))).toBe(false)
    expect(stepSuccess).toHaveBeenCalledWith(
      expect.stringContaining('0 pinned skills'),
    )
  })

  // ── 11. Unusable lock shapes ──────────────────────────────────────────
  it('treats a missing lock file as zero pinned skills', async () => {
    const root = createTempDir()
    const pkgRoot = join(root, 'package')
    const consumerRoot = join(root, 'consumer')
    mkdirSync(pkgRoot, { recursive: true })
    mkdirSync(consumerRoot, { recursive: true })
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.pinned).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('treats invalid JSON as zero pinned skills', async () => {
    const root = createTempDir()
    const pkgRoot = join(root, 'package')
    const consumerRoot = join(root, 'consumer')
    mkdirSync(pkgRoot, { recursive: true })
    mkdirSync(consumerRoot, { recursive: true })
    writeFileSync(join(pkgRoot, 'skills-lock.json'), 'not json')

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: vi.fn(),
      packageRoot: pkgRoot,
    })

    expect(result.pinned).toBe(0)
  })

  it('ignores a malformed skills collection', async () => {
    const root = createTempDir()
    const pkgRoot = join(root, 'package')
    const consumerRoot = join(root, 'consumer')
    mkdirSync(pkgRoot, { recursive: true })
    mkdirSync(consumerRoot, { recursive: true })
    writeFileSync(
      join(pkgRoot, 'skills-lock.json'),
      JSON.stringify({ version: 1, skills: 'nope' }),
    )

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: vi.fn(),
      packageRoot: pkgRoot,
    })

    expect(result.pinned).toBe(0)
  })

  it('ignores entries with an empty ref, no ref, or no files', async () => {
    const root = createTempDir()
    const pkgRoot = join(root, 'package')
    const consumerRoot = join(root, 'consumer')
    mkdirSync(pkgRoot, { recursive: true })
    mkdirSync(consumerRoot, { recursive: true })
    writeFileSync(
      join(pkgRoot, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          emptyRef: { ref: '', files: [{ path: 'SKILL.md', sha256: 'x' }] },
          noRef: { files: [{ path: 'SKILL.md', sha256: 'x' }] },
          noFiles: { ref: 'v1.3.1', files: [] },
          filesNotArray: { ref: 'v1.3.1', files: 'SKILL.md' },
        },
      }),
    )
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.pinned).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // ── 12. Dry run ───────────────────────────────────────────────────────
  it('performs no fetch and no writes in dry-run mode', async () => {
    const specs = [
      {
        name: 'grilling',
        pinned: true,
        files: [{ path: 'SKILL.md', content: 'pending-upstream' }],
      },
      {
        name: 'prototype',
        pinned: true,
        files: [{ path: 'SKILL.md', content: 'current-content' }],
      },
    ]
    const { pkgRoot, consumerRoot } = workspace(specs)
    writeFiles(join(consumerRoot, '.agents', 'skills', 'prototype'), [
      { path: 'SKILL.md', content: 'current-content' },
    ])
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(
      makeContext(consumerRoot, { dryRun: true }),
      { fetchImpl, packageRoot: pkgRoot },
    )

    expect(result.action).toBe('dry-run')
    expect(result.fetched).toEqual(['grilling'])
    expect(result.skipped).toEqual(['prototype'])
    expect(result.message).toBe(
      'Would fetch 1 pinned skill(s) from upstream; 1 already up to date',
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(
      existsSync(join(consumerRoot, '.agents', 'skills', 'grilling', 'SKILL.md')),
    ).toBe(false)
    expect(stepSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Would fetch 1 pinned skill(s)'),
    )
  })

  it('reports (but does not perform) local-edit overwrites in dry-run mode', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'pinned-content' }],
    }
    const { pkgRoot, consumerRoot } = workspace([spec])
    writeFiles(join(consumerRoot, '.agents', 'skills', 'grilling'), [
      { path: 'SKILL.md', content: 'my local edit' },
    ])

    const result = await runSkillsPhase(
      makeContext(consumerRoot, { dryRun: true }),
      { fetchImpl: vi.fn(), packageRoot: pkgRoot },
    )

    expect(result.action).toBe('dry-run')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('would be overwritten')
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('my local edit')
    expect(stepWarn).toHaveBeenCalledWith(
      expect.stringContaining('would be overwritten'),
    )
  })

  // ── 13. Idempotency ───────────────────────────────────────────────────
  it('skips the fetch when every destination file already matches the lock', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'current-content' }],
    }
    const { pkgRoot, consumerRoot } = workspace([spec])
    writeFiles(join(consumerRoot, '.agents', 'skills', 'grilling'), [
      { path: 'SKILL.md', content: 'current-content' },
    ])
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.action).toBe('completed')
    expect(result.fetched).toEqual([])
    expect(result.skipped).toEqual(['grilling'])
    expect(result.message).toBe('1 already up to date')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // ── 14. Mixed upstream + fallback ─────────────────────────────────────
  it('mixes upstream and fallback skills in one run', async () => {
    const specs = [
      {
        name: 'grilling',
        pinned: true,
        files: [{ path: 'SKILL.md', content: 'a-up' }],
      },
      {
        name: 'prototype',
        pinned: true,
        files: [{ path: 'SKILL.md', content: 'b-pinned' }],
        shipped: [{ path: 'SKILL.md', content: 'b-shipped' }],
      },
    ]
    const { pkgRoot, consumerRoot, routes } = workspace(specs)
    routes[urlFor('prototype', 'SKILL.md')] = { content: 'b-tampered' }
    const fetchImpl = makeFetch(routes)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.fetched).toEqual(['grilling'])
    expect(result.fallback).toEqual(['prototype'])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.message).toBe(
      'Fetched 1 pinned skill(s) from upstream; ' +
        '1 restored from the copies shipped with the package',
    )
    expect(readDest(consumerRoot, 'prototype', 'SKILL.md')).toBe('b-shipped')
  })

  // ── 15. Skip flag ─────────────────────────────────────────────────────
  it('returns action="skipped" when flags.skipSync is set', async () => {
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(
      makeContext('/tmp/never-used', { flags: { skipSync: true } }),
      { fetchImpl },
    )

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('--skip-sync')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stepWarn).toHaveBeenCalledWith(
      expect.stringContaining('--skip-sync'),
    )
  })

  // ── 16. Missing consumer root ─────────────────────────────────────────
  it('is a no-op when the consumer root does not exist', async () => {
    const fetchImpl = vi.fn()
    const missing = join(realpathSync(tmpdir()), 'skills-phase-missing-root')

    const result = await runSkillsPhase(makeContext(missing), { fetchImpl })
    const resultNoRoot = await runSkillsPhase({ flags: {} }, { fetchImpl })

    expect(result.action).toBe('completed')
    expect(result.message).toContain('consumer root not found')
    expect(resultNoRoot.message).toContain('consumer root not found')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // ── 17. Path traversal ────────────────────────────────────────────────
  it('refuses recorded paths that escape the skill directory', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: '../../escape.md', content: 'evil' }],
    }
    const { pkgRoot, consumerRoot } = workspace([spec])
    const fetchImpl = vi.fn()

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.warnings[0]).toContain('Refusing to write outside')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(
      existsSync(join(consumerRoot, '.agents', 'escape.md')),
    ).toBe(false)
  })

  it('skips traversal files during fallback but still copies valid ones', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [
        { path: 'SKILL.md', content: 'valid-pinned' },
        { path: '../../escape.md', content: 'evil' },
      ],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 503 }
    const fetchImpl = makeFetch(routes)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe('valid-pinned')
    expect(existsSync(join(consumerRoot, '.agents', 'escape.md'))).toBe(false)
  })

  // ── 18. Fallback copy problems ────────────────────────────────────────
  it('warns but does not throw when a shipped copy is missing', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
      shipped: [],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 404 }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(result.warnings.some((w) => w.includes('Shipped copy missing'))).toBe(
      true,
    )
    expect(
      existsSync(join(consumerRoot, '.agents', 'skills', 'grilling', 'SKILL.md')),
    ).toBe(false)
  })

  it('warns but still copies a shipped file whose hash differs', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'locked-content' }],
      shipped: [{ path: 'SKILL.md', content: 'stale-shipped-content' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 404 }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(
      result.warnings.some((w) => w.includes('does not match the lock hash')),
    ).toBe(true)
    expect(readDest(consumerRoot, 'grilling', 'SKILL.md')).toBe(
      'stale-shipped-content',
    )
  })

  it('writes no files when one shipped file of a multi-file skill is missing', async () => {
    const spec = {
      name: 'prototype',
      pinned: true,
      files: [
        { path: 'SKILL.md', content: 'pinned-skill' },
        { path: 'LOGIC.md', content: 'pinned-logic' },
      ],
      shipped: [{ path: 'SKILL.md', content: 'pinned-skill' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('prototype', 'SKILL.md')] = { ok: false, status: 500 }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['prototype'])
    expect(
      result.warnings.some((w) => w.includes('Shipped copy missing')),
    ).toBe(true)
    // Stage-then-commit: the available file is NOT written on its own.
    expect(
      existsSync(
        join(consumerRoot, '.agents', 'skills', 'prototype', 'SKILL.md'),
      ),
    ).toBe(false)
    expect(
      existsSync(
        join(consumerRoot, '.agents', 'skills', 'prototype', 'LOGIC.md'),
      ),
    ).toBe(false)
  })

  it('warns but does not throw when a shipped copy cannot be read', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 404 }

    // Replace the shipped file with a directory so readFileSync throws EISDIR.
    const shippedFile = join(
      pkgRoot,
      '.agents',
      'skills',
      'grilling',
      'SKILL.md',
    )
    rmSync(shippedFile)
    mkdirSync(shippedFile)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(
      result.warnings.some((w) => w.includes('Shipped copy unreadable')),
    ).toBe(true)
    expect(
      existsSync(join(consumerRoot, '.agents', 'skills', 'grilling', 'SKILL.md')),
    ).toBe(false)
  })

  it('ignores malformed file records instead of throwing', async () => {
    const root = createTempDir()
    const pkgRoot = join(root, 'package')
    const consumerRoot = join(root, 'consumer')
    mkdirSync(pkgRoot, { recursive: true })
    mkdirSync(consumerRoot, { recursive: true })
    const content = 'usable'
    writeFileSync(
      join(pkgRoot, 'skills-lock.json'),
      JSON.stringify({
        version: 1,
        skills: {
          broken: { ref: 'v1.3.1', files: [{ path: 'SKILL.md' }] },
          onlyJunk: { ref: 'v1.3.1', files: [{ sha256: 'x' }] },
          mixed: {
            ref: 'v1.3.1',
            source: '   ',
            files: [
              {
                path: 'SKILL.md',
                sha256: sha(content),
                upstreamPath: 'skills/engineering/mixed/SKILL.md',
              },
              { path: 'MISSING.md' },
            ],
          },
        },
      }),
    )
    const upstreamUrl =
      'https://raw.githubusercontent.com/mattpocock/skills/v1.3.1/' +
      'skills/engineering/mixed/SKILL.md'
    const fetchImpl = makeFetch({ [upstreamUrl]: { content } })

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.pinned).toBe(1)
    expect(result.fetched).toEqual(['mixed'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(readDest(consumerRoot, 'mixed', 'SKILL.md')).toBe(content)
  })

  it('warns but does not throw when the fallback cannot write', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'pinned-content' }],
      shipped: [{ path: 'SKILL.md', content: 'pinned-content' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { ok: false, status: 500 }

    // A file where `.agents/` should be a directory makes every write fail.
    writeFileSync(join(consumerRoot, '.agents'), 'not a directory')

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(
      result.warnings.some((w) => w.includes('Could not write the shipped copy')),
    ).toBe(true)
  })

  // ── 19. Default upstream source ───────────────────────────────────────
  it('defaults to mattpocock/skills when the lock omits source', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      source: null,
      files: [{ path: 'SKILL.md', content: 'no-source' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    const fetchImpl = makeFetch(routes)

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl,
      packageRoot: pkgRoot,
    })

    expect(result.fetched).toEqual(['grilling'])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/mattpocock/skills/v1.3.1/' +
        'skills/engineering/grilling/SKILL.md',
      expect.anything(),
    )
  })

  // ── 20. Unreadable response body ──────────────────────────────────────
  it('falls back when the response body cannot be read', async () => {
    const spec = {
      name: 'grilling',
      pinned: true,
      files: [{ path: 'SKILL.md', content: 'upstream' }],
    }
    const { pkgRoot, consumerRoot, routes } = workspace([spec])
    routes[urlFor('grilling', 'SKILL.md')] = { arrayBuffer: false }

    const result = await runSkillsPhase(makeContext(consumerRoot), {
      fetchImpl: makeFetch(routes),
      packageRoot: pkgRoot,
    })

    expect(result.fallback).toEqual(['grilling'])
    expect(fallbackNotices()[0]).toContain('read failed')
  })
})

// ── Wiring tests: index.js gating ────────────────────────────────────────

describe('index.js skills phase wiring', () => {
  const defaultFlags = {
    force: false,
    dryRun: false,
    yes: false,
    skipHooks: false,
    skipPrepare: false,
    skipSync: false,
    skipKnowledgebase: false,
    knowledgebase: false,
    help: false,
    version: false,
    quiet: false,
    verbose: false,
  }

  const baseContext = {
    consumerRoot: join(realpathSync(tmpdir()), 'skills-wiring-no-such-dir'),
    hasGit: true,
    hasHuskyDir: false,
    hasPackageJson: true,
    consumerPackageJson: { name: 'test-consumer' },
    existingHooks: {},
    existingPrepare: null,
    prepareIsSimple: false,
    isCI: false,
    nodeVersion: 20,
    dryRun: false,
    verbose: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    parseCliArgs.mockReturnValue({ ...defaultFlags })
    discover.mockResolvedValue({ ...baseContext })
    installHooks.mockResolvedValue([])
    handlePrepare.mockResolvedValue({ action: 'added', message: 'prepared' })
    initHusky.mockResolvedValue({ action: 'initialized', message: 'husky' })
    runSyncPhase.mockResolvedValue({ action: 'completed', message: 'synced' })
    registerKnowledgebase.mockResolvedValue({ action: 'indexed', message: 'kb' })
  })

  afterEach(() => {
    cleanupTempDirs()
  })

  it('invokes the skills phase as part of the normal pipeline', async () => {
    const code = await main([])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(runSkillsPhase).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the skills phase under --skip-sync and reports it', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, skipSync: true })

    const code = await main(['--skip-sync'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(runSkillsPhase).not.toHaveBeenCalled()
    expect(stepWarn).toHaveBeenCalledWith(
      expect.stringContaining('--skip-sync'),
    )
  })

  it('suppresses the skip status in quiet mode', async () => {
    parseCliArgs.mockReturnValue({
      ...defaultFlags,
      skipSync: true,
      quiet: true,
    })

    await main(['--skip-sync', '--quiet'])

    expect(runSkillsPhase).not.toHaveBeenCalled()
    expect(stepWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('--skip-sync'),
    )
  })

  it('contains a skills phase error as a warning instead of throwing', async () => {
    vi.mocked(runSkillsPhase).mockImplementationOnce(async () => {
      throw new Error('boom')
    })

    const code = await main([])

    expect(code).toBe(EXIT_CODES.WARNINGS)
    expect(stepWarn).toHaveBeenCalledWith(
      expect.stringContaining('Skills phase skipped: boom'),
    )
  })
})
