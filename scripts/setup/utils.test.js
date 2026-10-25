// ═════════════════════════════════════════════════════════════════════════════
// utils.test.js — Unit tests for the setup utility helpers
// ═════════════════════════════════════════════════════════════════════════════
//
// Everything filesystem-related runs against real temp directories; nothing is
// written to the repository. Environment variables are saved/restored so the
// CI-detection tests cannot leak into other suites.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { createHash } from 'crypto'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

import {
  chmodX,
  dirExists,
  ensureDir,
  fileExists,
  getConsumerRoot,
  getNodeVersion,
  hashContent,
  isCI,
  isShellScript,
  logError,
  logInfo,
  logWarn,
  parseCliArgs,
  resolveConsumerPath,
  resolvePackageRoot,
  safeAppendFile,
  safeReadFile,
  safeReadJson,
  safeWriteFile,
  safeWriteJson,
} from './utils.js'
import { CI_ENV_VARS } from './constants.js'

// ── Temp directory helpers ─────────────────────────────────────────────────

const tempDirs = new Set()

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'utils-test-'))
  tempDirs.add(dir)
  return dir
}

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

// ── Default flag shape ─────────────────────────────────────────────────────

const DEFAULT_FLAG_KEYS = [
  'force',
  'dryRun',
  'yes',
  'skipHooks',
  'skipPrepare',
  'skipSync',
  'skipKnowledgebase',
  'knowledgebase',
  'help',
  'version',
  'quiet',
  'verbose',
]

const allFlagsFalse = () =>
  Object.fromEntries(DEFAULT_FLAG_KEYS.map((k) => [k, false]))

// ── Path resolution ────────────────────────────────────────────────────────

describe('path resolution', () => {
  const originalInitCwd = process.env.INIT_CWD

  afterEach(() => {
    if (originalInitCwd === undefined) delete process.env.INIT_CWD
    else process.env.INIT_CWD = originalInitCwd
    cleanupTempDirs()
  })

  it('getConsumerRoot() returns the absolute INIT_CWD when set', () => {
    const dir = createTempDir()
    process.env.INIT_CWD = dir

    expect(getConsumerRoot()).toBe(dir)
  })

  it('getConsumerRoot() resolves a relative INIT_CWD to an absolute path', () => {
    process.env.INIT_CWD = 'some/relative/path'

    expect(getConsumerRoot()).toBe(resolve('some/relative/path'))
  })

  it('getConsumerRoot() warns and falls back to process.cwd() without INIT_CWD', () => {
    delete process.env.INIT_CWD
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      expect(getConsumerRoot()).toBe(process.cwd())
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('INIT_CWD is not set'),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('resolvePackageRoot() points at the directory containing package.json', () => {
    const root = resolvePackageRoot()

    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).name).toBe(
      '@abarcenas/ai-workflow-template',
    )
  })

  it('resolveConsumerPath() joins segments beneath the consumer root', () => {
    const dir = createTempDir()
    process.env.INIT_CWD = dir

    expect(resolveConsumerPath('.husky', 'pre-commit')).toBe(
      join(dir, '.husky', 'pre-commit'),
    )
    expect(resolveConsumerPath()).toBe(dir)
  })
})

// ── Directory helpers ──────────────────────────────────────────────────────

describe('ensureDir()', () => {
  afterEach(cleanupTempDirs)

  it('creates nested directories and returns true', () => {
    const dir = join(createTempDir(), 'a', 'b', 'c')

    expect(ensureDir(dir)).toBe(true)
    expect(statSync(dir).isDirectory()).toBe(true)
  })

  it('returns true for a directory that already exists', () => {
    const dir = createTempDir()

    expect(ensureDir(dir)).toBe(true)
  })

  it('returns true when the path already exists as a file (EEXIST)', () => {
    const dir = createTempDir()
    const file = join(dir, 'already-a-file')
    writeFileSync(file, 'x')

    expect(ensureDir(file)).toBe(true)
  })

  it('rethrows unexpected filesystem errors', () => {
    expect(() => ensureDir(join(createTempDir(), 'bad\u0000name'))).toThrow()
  })
})

describe('dirExists()', () => {
  afterEach(cleanupTempDirs)

  it('returns true for a directory', () => {
    expect(dirExists(createTempDir())).toBe(true)
  })

  it('returns false for a regular file', () => {
    const file = join(createTempDir(), 'file.txt')
    writeFileSync(file, 'x')

    expect(dirExists(file)).toBe(false)
  })

  it('returns false for a missing path', () => {
    expect(dirExists(join(createTempDir(), 'missing'))).toBe(false)
  })
})

describe('fileExists()', () => {
  afterEach(cleanupTempDirs)

  it('returns true for files and directories', () => {
    const dir = createTempDir()
    const file = join(dir, 'present.txt')
    writeFileSync(file, 'x')

    expect(fileExists(file)).toBe(true)
    expect(fileExists(dir)).toBe(true)
  })

  it('returns false for a missing path', () => {
    expect(fileExists(join(createTempDir(), 'nope.txt'))).toBe(false)
  })
})

// ── File read/write helpers ────────────────────────────────────────────────

describe('safeReadFile()', () => {
  afterEach(cleanupTempDirs)

  it('returns the UTF-8 contents of an existing file', () => {
    const file = join(createTempDir(), 'readme.txt')
    writeFileSync(file, 'héllo wörld', 'utf-8')

    expect(safeReadFile(file)).toBe('héllo wörld')
  })

  it('returns null for a missing file (ENOENT)', () => {
    expect(safeReadFile(join(createTempDir(), 'missing.txt'))).toBeNull()
  })

  it('rethrows non-ENOENT errors such as EISDIR', () => {
    const dir = createTempDir()

    expect(() => safeReadFile(dir)).toThrow()
  })
})

describe('safeWriteFile()', () => {
  afterEach(cleanupTempDirs)

  it('writes content and creates parent directories', () => {
    const file = join(createTempDir(), 'nested', 'deep', 'out.txt')

    expect(safeWriteFile(file, 'content')).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('content')
  })

  it('overwrites an existing file', () => {
    const file = join(createTempDir(), 'out.txt')
    writeFileSync(file, 'old')

    expect(safeWriteFile(file, 'new')).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('new')
  })

  it('returns false instead of throwing on EACCES', () => {
    const file = join(createTempDir(), 'readonly.txt')
    writeFileSync(file, 'locked')
    chmodSync(file, 0o444)

    expect(safeWriteFile(file, 'nope')).toBe(false)
    expect(readFileSync(file, 'utf-8')).toBe('locked')
  })

  it('rethrows unexpected errors (ENOTDIR)', () => {
    const dir = createTempDir()
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'i am a file')

    expect(() => safeWriteFile(join(blocker, 'child.txt'), 'x')).toThrow()
  })
})

describe('safeAppendFile()', () => {
  afterEach(cleanupTempDirs)

  it('creates the file and appends on repeated calls', () => {
    const file = join(createTempDir(), 'nested', 'log.txt')

    safeAppendFile(file, 'first\n')
    safeAppendFile(file, 'second\n')

    expect(readFileSync(file, 'utf-8')).toBe('first\nsecond\n')
  })
})

// ── Shell script inspection ───────────────────────────────────────────────

describe('isShellScript()', () => {
  afterEach(cleanupTempDirs)

  it('returns true when the first line starts with a shebang', () => {
    const file = join(createTempDir(), 'hook')
    writeFileSync(file, '#!/bin/sh\necho hi\n')

    expect(isShellScript(file)).toBe(true)
  })

  it('returns false when the first line is not a shebang', () => {
    const file = join(createTempDir(), 'hook')
    writeFileSync(file, '# just a comment\n')

    expect(isShellScript(file)).toBe(false)
  })

  it('returns false for an empty file', () => {
    const file = join(createTempDir(), 'empty')
    writeFileSync(file, '')

    expect(isShellScript(file)).toBe(false)
  })

  it('returns false for a missing file', () => {
    expect(isShellScript(join(createTempDir(), 'missing'))).toBe(false)
  })
})

describe('chmodX()', () => {
  afterEach(cleanupTempDirs)

  it('sets 0755 permission bits', () => {
    const file = join(createTempDir(), 'script')
    writeFileSync(file, '#!/bin/sh\n')

    chmodX(file)

    expect(statSync(file).mode & 0o777).toBe(0o755)
  })

  it('throws for a missing file', () => {
    expect(() => chmodX(join(createTempDir(), 'missing'))).toThrow()
  })
})

// ── JSON helpers ───────────────────────────────────────────────────────────

describe('safeReadJson()', () => {
  afterEach(cleanupTempDirs)

  it('parses a valid JSON file', () => {
    const file = join(createTempDir(), 'pkg.json')
    writeFileSync(file, JSON.stringify({ name: 'x', nested: { ok: true } }))

    expect(safeReadJson(file)).toEqual({ name: 'x', nested: { ok: true } })
  })

  it('returns undefined when the file is missing', () => {
    expect(safeReadJson(join(createTempDir(), 'missing.json'))).toBeUndefined()
  })

  it('returns undefined when the JSON is malformed', () => {
    const file = join(createTempDir(), 'broken.json')
    writeFileSync(file, '{ not json')

    expect(safeReadJson(file)).toBeUndefined()
  })
})

describe('safeWriteJson()', () => {
  afterEach(cleanupTempDirs)

  it('writes 2-space indented JSON with a trailing newline', () => {
    const file = join(createTempDir(), 'nested', 'data.json')

    safeWriteJson(file, { a: 1, b: [2, 3] })

    expect(readFileSync(file, 'utf-8')).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n',
    )
    expect(safeReadJson(file)).toEqual({ a: 1, b: [2, 3] })
  })
})

// ── Hashing ────────────────────────────────────────────────────────────────

describe('hashContent()', () => {
  it('returns the SHA-256 hex digest', () => {
    // Well-known vector: sha256('abc')
    expect(hashContent('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(hashContent('abc')).toBe(
      createHash('sha256').update('abc').digest('hex'),
    )
  })

  it('produces different digests for different content', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'))
  })

  it('handles the empty string', () => {
    expect(hashContent('')).toHaveLength(64)
  })
})

// ── CI detection ───────────────────────────────────────────────────────────

describe('isCI()', () => {
  const saved = new Map()

  beforeAll(() => {
    for (const name of CI_ENV_VARS) saved.set(name, process.env[name])
  })

  beforeEach(() => {
    for (const name of CI_ENV_VARS) delete process.env[name]
  })

  afterAll(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('returns false when no CI environment variable is set', () => {
    expect(isCI()).toBe(false)
  })

  it('returns true for a truthy generic CI variable', () => {
    process.env.CI = 'true'

    expect(isCI()).toBe(true)
  })

  it('detects provider-specific variables', () => {
    for (const name of ['GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'JENKINS_URL']) {
      for (const other of CI_ENV_VARS) delete process.env[other]
      process.env[name] = '1'

      expect(isCI(), `${name} should be detected`).toBe(true)
    }
  })

  it('treats NODE_ENV=production as CI', () => {
    process.env.NODE_ENV = 'production'

    expect(isCI()).toBe(true)
  })

  it('does not treat other NODE_ENV values as CI', () => {
    process.env.NODE_ENV = 'development'

    expect(isCI()).toBe(false)
  })

  it('ignores empty-string CI variables', () => {
    process.env.CI = ''
    process.env.GITHUB_ACTIONS = ''

    expect(isCI()).toBe(false)
  })
})

describe('getNodeVersion()', () => {
  it('returns the major version parsed from process.version', () => {
    expect(getNodeVersion()).toBe(
      parseInt(process.version.slice(1).split('.')[0], 10),
    )
    expect(Number.isInteger(getNodeVersion())).toBe(true)
  })
})

// ── CLI argument parsing ───────────────────────────────────────────────────

describe('parseCliArgs()', () => {
  it('returns every supported flag set to false for empty argv', () => {
    const flags = parseCliArgs([])

    expect(flags).toEqual(allFlagsFalse())
    expect(Object.keys(flags).sort()).toEqual([...DEFAULT_FLAG_KEYS].sort())
  })

  it('enables long-form boolean flags', () => {
    const flags = parseCliArgs([
      '--force',
      '--dry-run',
      '--yes',
      '--skip-hooks',
      '--skip-prepare',
      '--skip-sync',
      '--skip-knowledgebase',
      '--knowledgebase',
      '--help',
      '--version',
      '--quiet',
      '--verbose',
    ])

    expect(flags).toEqual(
      Object.fromEntries(DEFAULT_FLAG_KEYS.map((k) => [k, true])),
    )
  })

  it('maps short-form flags to their canonical names', () => {
    const flags = parseCliArgs(['-y', '-h', '-v', '-q', '-V'])

    expect(flags.yes).toBe(true)
    expect(flags.help).toBe(true)
    expect(flags.version).toBe(true)
    expect(flags.quiet).toBe(true)
    expect(flags.verbose).toBe(true)
  })

  it('supports --flag=value for known flags', () => {
    const flags = parseCliArgs(['--force=maybe', '--skip-sync=yes'])

    expect(flags.force).toBe('maybe')
    expect(flags.skipSync).toBe('yes')
  })

  it('supports --no-flag to explicitly disable a flag', () => {
    const flags = parseCliArgs(['--force', '--no-force', '--skip-hooks', '--no-skip-hooks'])

    expect(flags.force).toBe(false)
    expect(flags.skipHooks).toBe(false)
  })

  it('ignores unknown --no- flags', () => {
    const flags = parseCliArgs(['--no-unknown-flag'])

    expect(flags).toEqual(allFlagsFalse())
  })

  it('ignores unknown long flags, short flags and assignments', () => {
    const flags = parseCliArgs(['--nope', '-x', '--what=ever', 'positional'])

    expect(flags).toEqual(allFlagsFalse())
  })

  it('lets later arguments win over earlier ones', () => {
    expect(parseCliArgs(['--force', '--no-force']).force).toBe(false)
    expect(parseCliArgs(['--no-force', '--force']).force).toBe(true)
  })

  it('leaves unrelated flags untouched', () => {
    const flags = parseCliArgs(['--dry-run'])

    expect(flags.dryRun).toBe(true)
    expect(flags.force).toBe(false)
    expect(flags.verbose).toBe(false)
  })
})

// ── Logging wrappers ───────────────────────────────────────────────────────

describe('logging wrappers', () => {
  it('logError() writes to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logError('boom')

    expect(spy).toHaveBeenCalledWith('boom')
    spy.mockRestore()
  })

  it('logWarn() writes to stderr', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logWarn('careful')

    expect(spy).toHaveBeenCalledWith('careful')
    spy.mockRestore()
  })

  it('logInfo() writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logInfo('fyi')

    expect(spy).toHaveBeenCalledWith('fyi')
    spy.mockRestore()
  })
})

// ── Cross-cutting: no repository writes ───────────────────────────────────

describe('temp-directory isolation', () => {
  it('all fixtures live under the OS temp directory', () => {
    const dir = createTempDir()

    expect(dir.startsWith(tmpdir())).toBe(true)
    mkdirSync(join(dir, 'sandbox'))
    expect(existsSync(join(dir, 'sandbox'))).toBe(true)
  })
})
