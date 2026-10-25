// ═════════════════════════════════════════════════════════════════════════════
// sync-unit.test.js — In-process unit tests for scripts/sync.js
// ═════════════════════════════════════════════════════════════════════════════
//
// The spawn-based suite (sync.test.js) exercises the CLI end-to-end but v8
// cannot instrument child processes. These tests import the module directly and
// call runSync() with explicit package/consumer roots backed by temp dirs, so
// every branch below is measured in the test process.
// ═════════════════════════════════════════════════════════════════════════════

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

import {
  agentInstructionsStubs,
  collectFiles,
  createSyncContext,
  hashFile,
  isEntryPoint,
  isPathInside,
  isRegularFile,
  isUntouched,
  memoryBankStubs,
  parseArgs,
  readManifest,
  resolvePruneEntry,
  runSync,
  writeManifest,
} from './sync.js'

const tempDirs = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sync-unit-'))
  tempDirs.push(dir)
  return dir
}

function writeFixtureFile(baseDir, relativePath, contents) {
  const filePath = join(baseDir, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
  return filePath
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function readConsumerManifest(consumerDir) {
  return JSON.parse(
    readFileSync(join(consumerDir, '.agents-sync-manifest.json'), 'utf8'),
  )
}

function outputOf(spy) {
  return spy.mock.calls.map((call) => call.join(' ')).join('\n')
}

// Builds a throwaway "published package" with its own .agents/.opencode/scripts
// and root files. Omitted sections are not created at all, which lets tests hit
// the "source directory/file missing" branches.
function createPackage({
  agents,
  opencode,
  scripts,
  root,
  mcpExample,
} = {}) {
  const packageRoot = createTempDir()
  writeFileSync(join(packageRoot, 'package.json'), '{ "type": "module" }\n')

  if (agents) {
    mkdirSync(join(packageRoot, '.agents'), { recursive: true })
    for (const [relativePath, contents] of Object.entries(agents)) {
      writeFixtureFile(packageRoot, join('.agents', relativePath), contents)
    }
  }

  if (opencode) {
    mkdirSync(join(packageRoot, '.opencode'), { recursive: true })
    for (const [relativePath, contents] of Object.entries(opencode)) {
      writeFixtureFile(packageRoot, join('.opencode', relativePath), contents)
    }
  }

  if (scripts) {
    mkdirSync(join(packageRoot, 'scripts'), { recursive: true })
    for (const [relativePath, contents] of Object.entries(scripts)) {
      writeFixtureFile(packageRoot, join('scripts', relativePath), contents)
    }
  }

  if (root) {
    for (const [relativePath, contents] of Object.entries(root)) {
      writeFixtureFile(packageRoot, relativePath, contents)
    }
  }

  if (mcpExample !== undefined) {
    writeFixtureFile(packageRoot, 'opencode.mcp.example.json', mcpExample)
  }

  return packageRoot
}

let warnSpy
let errorSpy
let logSpy

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

// ── Argument parsing ─────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults every flag to false for an empty argv', () => {
    expect(parseArgs([], {})).toEqual({
      forceOverwrite: false,
      dryRun: false,
      prune: false,
      isVerbose: false,
    })
  })

  it('uses an empty argv when none is supplied', () => {
    expect(parseArgs(undefined, {})).toMatchObject({
      forceOverwrite: false,
      dryRun: false,
      prune: false,
    })
  })

  it('recognises --force, --dry-run and --prune individually', () => {
    expect(parseArgs(['--force'], {}).forceOverwrite).toBe(true)
    expect(parseArgs(['--dry-run'], {}).dryRun).toBe(true)
    expect(parseArgs(['--prune'], {}).prune).toBe(true)
  })

  it('recognises any combination of flags', () => {
    expect(parseArgs(['--force', '--prune', '--dry-run'], {})).toMatchObject({
      forceOverwrite: true,
      dryRun: true,
      prune: true,
    })
  })

  it('ignores unknown flags and positional arguments', () => {
    expect(parseArgs(['--unknown', 'positional', '--forc'], {})).toMatchObject({
      forceOverwrite: false,
      dryRun: false,
      prune: false,
    })
  })

  it('enables verbose output only when AI_WORKFLOW_VERBOSE is "1"', () => {
    expect(parseArgs([], { AI_WORKFLOW_VERBOSE: '1' }).isVerbose).toBe(true)
    expect(parseArgs([], { AI_WORKFLOW_VERBOSE: '0' }).isVerbose).toBe(false)
    expect(parseArgs([], {}).isVerbose).toBe(false)
  })

  it('reads process.env by default', () => {
    const previous = process.env.AI_WORKFLOW_VERBOSE
    process.env.AI_WORKFLOW_VERBOSE = '1'
    try {
      expect(parseArgs([]).isVerbose).toBe(true)
    } finally {
      if (previous === undefined) {
        delete process.env.AI_WORKFLOW_VERBOSE
      } else {
        process.env.AI_WORKFLOW_VERBOSE = previous
      }
    }
  })
})

// ── Context resolution ───────────────────────────────────────────────────────

describe('createSyncContext', () => {
  it('resolves explicit package and consumer roots', () => {
    const packageRoot = createTempDir()
    const consumerRoot = createTempDir()

    const context = createSyncContext({
      packageRoot,
      consumerRoot,
      argv: ['--force', '--prune'],
      env: {},
    })

    expect(context.packageRoot).toBe(packageRoot)
    expect(context.consumerRoot).toBe(consumerRoot)
    expect(context.sourceAgentsDir).toBe(join(packageRoot, '.agents'))
    expect(context.targetAgentsDir).toBe(join(consumerRoot, '.agents'))
    expect(context.sourceOpenCodeDir).toBe(join(packageRoot, '.opencode'))
    expect(context.sourceScriptsDir).toBe(join(packageRoot, 'scripts'))
    expect(context.targetScriptsDir).toBe(join(consumerRoot, 'scripts'))
    expect(context.manifestPath).toBe(
      join(consumerRoot, '.agents-sync-manifest.json'),
    )
    expect(context.forceOverwrite).toBe(true)
    expect(context.prune).toBe(true)
    expect(context.dryRun).toBe(false)
  })

  it('derives the consumer root from INIT_CWD', () => {
    const packageRoot = createTempDir()
    const initCwd = createTempDir()

    const context = createSyncContext({
      packageRoot,
      env: { INIT_CWD: initCwd },
      argv: [],
    })

    expect(context.consumerRoot).toBe(initCwd)
  })

  it('falls back to process.cwd() when INIT_CWD is absent', () => {
    const packageRoot = createTempDir()

    const context = createSyncContext({ packageRoot, env: {}, argv: [] })

    expect(context.consumerRoot).toBe(process.cwd())
  })

  it('derives the package root from the module location by default', () => {
    const consumerRoot = createTempDir()

    const context = createSyncContext({ consumerRoot, env: {}, argv: [] })

    expect(context.packageRoot).toBe(resolveRepoRoot())
    expect(context.sourceAgentsDir).toBe(join(resolveRepoRoot(), '.agents'))
  })

  it('accepts an explicit manifest path', () => {
    const consumerRoot = createTempDir()
    const manifestPath = join(consumerRoot, 'nested', 'custom-manifest.json')

    const context = createSyncContext({
      packageRoot: createTempDir(),
      consumerRoot,
      manifestPath,
      env: {},
      argv: [],
    })

    expect(context.manifestPath).toBe(manifestPath)
  })

  it('builds prune channels that match the copy-pass roots', () => {
    const packageRoot = createTempDir()
    const consumerRoot = createTempDir()

    const context = createSyncContext({ packageRoot, consumerRoot })

    expect(context.pruneChannels.agents).toEqual({
      prefix: '',
      packageDir: join(packageRoot, '.agents'),
      consumerDir: join(consumerRoot, '.agents'),
    })
    expect(context.pruneChannels.opencode).toEqual({
      prefix: '__opencode__/',
      packageDir: join(packageRoot, '.opencode'),
      consumerDir: join(consumerRoot, '.opencode'),
    })
    expect(context.pruneChannels.scripts).toEqual({
      prefix: '__scripts__/',
      packageDir: join(packageRoot, 'scripts'),
      consumerDir: join(consumerRoot, 'scripts'),
    })
    expect(context.pruneChannels.root).toEqual({
      prefix: '__root__/',
      packageDir: packageRoot,
      consumerDir: consumerRoot,
    })
  })

  it('falls back to process.argv when argv is omitted', () => {
    const context = createSyncContext({ env: {} })

    expect(typeof context.forceOverwrite).toBe('boolean')
  })
})

function resolveRepoRoot() {
  return process.cwd()
}

// ── Manifest I/O ─────────────────────────────────────────────────────────────

describe('readManifest / writeManifest', () => {
  it('returns an empty manifest when the file is missing', () => {
    const manifestPath = join(createTempDir(), 'missing.json')

    expect(readManifest(manifestPath)).toEqual({ version: 1, files: {} })
  })

  it('returns an empty manifest for malformed JSON', () => {
    const dir = createTempDir()
    const manifestPath = writeFixtureFile(dir, 'manifest.json', '{ not json')

    expect(readManifest(manifestPath)).toEqual({ version: 1, files: {} })
  })

  it('returns an empty manifest for non-object JSON values', () => {
    const dir = createTempDir()

    expect(readManifest(writeFixtureFile(dir, 'null.json', 'null'))).toEqual({
      version: 1,
      files: {},
    })
    expect(readManifest(writeFixtureFile(dir, 'string.json', '"text"'))).toEqual({
      version: 1,
      files: {},
    })
  })

  it('repairs a missing or non-object files map', () => {
    const dir = createTempDir()

    const noFiles = readManifest(
      writeFixtureFile(dir, 'no-files.json', '{"version":1}'),
    )
    expect(noFiles.files).toEqual({})

    const badFiles = readManifest(
      writeFixtureFile(dir, 'bad-files.json', '{"version":1,"files":"nope"}'),
    )
    expect(badFiles.files).toEqual({})

    const arrayManifest = readManifest(
      writeFixtureFile(dir, 'array.json', '[]'),
    )
    expect(arrayManifest.files).toEqual({})
  })

  it('preserves valid manifest contents, including unknown fields', () => {
    const dir = createTempDir()
    const manifest = {
      version: 2,
      extra: true,
      files: { 'skills/a/SKILL.md': 'abc' },
    }
    const manifestPath = writeFixtureFile(
      dir,
      'manifest.json',
      JSON.stringify(manifest),
    )

    expect(readManifest(manifestPath)).toEqual(manifest)
  })

  it('writes pretty-printed JSON with a trailing newline and round-trips', () => {
    const dir = createTempDir()
    const manifestPath = join(dir, '.agents-sync-manifest.json')
    const manifest = { version: 1, files: { 'a.md': sha256('a') } }

    writeManifest(manifestPath, manifest)

    const raw = readFileSync(manifestPath, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toBe(`${JSON.stringify(manifest, null, 2)}\n`)
    expect(readManifest(manifestPath)).toEqual(manifest)
  })
})

// ── Hashing and overwrite decisions ──────────────────────────────────────────

describe('hashFile / isUntouched', () => {
  it('hashes file contents with sha256', () => {
    const dir = createTempDir()
    const filePath = writeFixtureFile(dir, 'file.txt', 'hello\n')

    expect(hashFile(filePath)).toBe(sha256('hello\n'))
    expect(hashFile(filePath)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('decides a copy is safe only when a recorded hash matches the local file', () => {
    expect(isUntouched('abc', 'abc')).toBe(true)
    expect(isUntouched('abc', 'def')).toBe(false)
    expect(isUntouched(null, 'abc')).toBe(false)
    expect(isUntouched(null, null)).toBe(false)
  })
})

// ── File collection ──────────────────────────────────────────────────────────

describe('collectFiles', () => {
  it('collects files recursively and skips directories as entries', () => {
    const dir = createTempDir()
    writeFixtureFile(dir, 'a.md', 'a')
    writeFixtureFile(dir, join('nested', 'b.md'), 'b')
    writeFixtureFile(dir, join('nested', 'deep', 'c.md'), 'c')

    const files = collectFiles(dir).map((filePath) => filePath.slice(dir.length + 1))

    expect(files.sort()).toEqual(['a.md', 'nested/b.md', 'nested/deep/c.md'])
  })

  it('returns an empty list for an empty directory', () => {
    expect(collectFiles(createTempDir())).toEqual([])
  })

  it('skips non-regular entries such as symlinks', () => {
    const dir = createTempDir()
    const target = writeFixtureFile(dir, 'target.md', 'target')
    symlinkSync(target, join(dir, 'link.md'))

    const files = collectFiles(dir)

    expect(files).toContain(target)
    expect(files).not.toContain(join(dir, 'link.md'))
  })
})

// ── Path containment and regular-file checks ─────────────────────────────────

describe('isPathInside', () => {
  it('accepts descendants', () => {
    expect(isPathInside('/base', '/base/child')).toBe(true)
    expect(isPathInside('/base', join('/base', 'a', 'b'))).toBe(true)
  })

  it('rejects the base directory itself', () => {
    expect(isPathInside('/base', '/base')).toBe(false)
  })

  it('rejects the parent directory and any escape', () => {
    expect(isPathInside('/base', '/base/..')).toBe(false)
    expect(isPathInside('/base', '/base/../sibling')).toBe(false)
    expect(isPathInside('/base', '/other/child')).toBe(false)
  })
})

describe('isRegularFile', () => {
  it('returns true for regular files and false for directories', () => {
    const dir = createTempDir()
    const filePath = writeFixtureFile(dir, 'file.md', 'x')

    expect(isRegularFile(filePath)).toBe(true)
    expect(isRegularFile(dir)).toBe(false)
  })

  it('returns false when the path cannot be statted', () => {
    expect(isRegularFile(join(createTempDir(), 'missing.md'))).toBe(false)
  })

  it.skipIf(process.getuid?.() === 0)(
    'returns false for an unreadable parent directory',
    () => {
      const dir = createTempDir()
      writeFixtureFile(dir, 'locked/file.md', 'x')
      chmodSync(join(dir, 'locked'), 0o000)

      try {
        expect(isRegularFile(join(dir, 'locked', 'file.md'))).toBe(false)
      } finally {
        chmodSync(join(dir, 'locked'), 0o755)
      }
    },
  )
})

// ── Entry-point detection ────────────────────────────────────────────────────

describe('isEntryPoint', () => {
  const modulePath = new URL('./sync.js', import.meta.url)

  it('returns false when process.argv[1] is missing', () => {
    // Passing '' (rather than undefined, which triggers the default parameter)
    // exercises the falsy-argv guard while also exercising the default moduleUrl.
    expect(isEntryPoint(undefined, '')).toBe(false)
  })

  it('returns true when argv points at this module', () => {
    expect(isEntryPoint(modulePath.href, fileURLToPath(modulePath))).toBe(true)
  })

  it('returns true across symlinked paths', () => {
    const dir = createTempDir()
    const linkPath = join(dir, 'sync-link.js')
    symlinkSync(fileURLToPath(modulePath), linkPath)

    expect(isEntryPoint(modulePath.href, linkPath)).toBe(true)
  })

  it('returns false for a different existing file', () => {
    const other = writeFixtureFile(createTempDir(), 'other.js', '')

    expect(isEntryPoint(modulePath.href, other)).toBe(false)
  })

  it('returns false when argv points at a path that does not exist', () => {
    expect(
      isEntryPoint(modulePath.href, join(createTempDir(), 'nope.js')),
    ).toBe(false)
  })

  it('runs one sync pass when Node executes the module as the entry point', async () => {
    const consumerRoot = createTempDir()
    const syncPath = fileURLToPath(new URL('./sync.js', import.meta.url))
    const originalArgv1 = process.argv[1]
    const originalInitCwd = process.env.INIT_CWD

    process.argv[1] = syncPath
    process.env.INIT_CWD = consumerRoot
    try {
      // A query string busts the module cache so the entry-point guard evaluates
      // with argv[1] pointing at sync.js — exactly what `node scripts/sync.js` does.
      await import('./sync.js?entry-point-test')
    } finally {
      process.argv[1] = originalArgv1
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD
      } else {
        process.env.INIT_CWD = originalInitCwd
      }
    }

    const manifest = readConsumerManifest(consumerRoot)
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0)
    expect(existsSync(join(consumerRoot, 'AGENTS.md'))).toBe(true)
  })
})

// ── Prune entry resolution (channel + path table) ────────────────────────────

describe('resolvePruneEntry', () => {
  function context() {
    return createSyncContext({
      packageRoot: createTempDir(),
      consumerRoot: createTempDir(),
    })
  }

  it('resolves an untagged manifest key through the .agents channel', () => {
    const ctx = context()

    const entry = resolvePruneEntry('skills/alpha/SKILL.md', ctx)

    expect(entry.packagePaths).toEqual([
      join(ctx.sourceAgentsDir, 'skills/alpha/SKILL.md'),
    ])
    expect(entry.consumerPath).toBe(
      join(ctx.targetAgentsDir, 'skills/alpha/SKILL.md'),
    )
  })

  it.each([
    ['__opencode__/agents/coder.md', 'opencode', 'agents/coder.md'],
    ['__scripts__/memory-cli.js', 'scripts', 'memory-cli.js'],
    ['__root__/AGENTS.md', 'root', 'AGENTS.md'],
  ])('resolves %s through the %s channel', (key, channel, relativePath) => {
    const ctx = context()

    const entry = resolvePruneEntry(key, ctx)

    expect(entry.packagePaths[0]).toBe(
      join(ctx.pruneChannels[channel].packageDir, relativePath),
    )
    expect(entry.consumerPath).toBe(
      join(ctx.pruneChannels[channel].consumerDir, relativePath),
    )
  })

  it('keeps opencode.json alive via the example fallback source', () => {
    const ctx = context()

    const entry = resolvePruneEntry('__root__/opencode.json', ctx)

    expect(entry.packagePaths).toEqual([
      join(ctx.packageRoot, 'opencode.json'),
      join(ctx.packageRoot, 'opencode.mcp.example.json'),
    ])
  })

  it.each([
    ['unknown internal namespace', '__future__/thing.md'],
    ['scaffold-only memory-bank namespace', '__memory-bank__/projectbrief.md'],
    ['scaffold-only instructions namespace', '__agents-instructions__/x.md'],
    ['excluded learned-knowledge file', 'instructions/learned-knowledge.instructions.md'],
    ['excluded opencode node_modules path', '__opencode__/node_modules/dep.js'],
    ['excluded opencode package.json', '__opencode__/package.json'],
    ['empty opencode key', '__opencode__/'],
    ['empty scripts key', '__scripts__/'],
    ['empty root key', '__root__/'],
    ['empty agents key', ''],
    ['parent-directory escape', '..'],
    ['sibling-directory escape', '../escape.txt'],
    ['self-referential key', './.'],
  ])('returns null for %s', (_label, key) => {
    expect(resolvePruneEntry(key, context())).toBeNull()
  })
})

// ── Copy passes ──────────────────────────────────────────────────────────────

const AGENTS_FILES = {
  'instructions/typescript.md': 'typescript instructions\n',
  'instructions/learned-knowledge.instructions.md': 'package copy must not win\n',
  'skills/alpha/SKILL.md': 'alpha skill\n',
}
const OPENCODE_FILES = {
  'agents/coder.md': 'coder agent\n',
  'node_modules/dep/index.js': 'dependency\n',
  'nested/node_modules/keep.js': 'nested kept\n',
  'package.json': '{"name":"pkg"}\n',
  '.gitignore': 'ignored\n',
  'skills/beta/SKILL.md': 'beta skill\n',
}
const SCRIPT_FILES = {
  'memory-cli.js': '// memory cli\n',
  'mcp/playwright-mcp-launcher.js': '// launcher\n',
}
const ROOT_FILE_CONTENTS = {
  'AGENTS.md': '# package agents\n',
  'skills-lock.json': '{ "skills": [] }\n',
}
const MCP_EXAMPLE = '{\n  "mcp": {}\n}\n'

function createCopyFixture() {
  const packageRoot = createPackage({
    agents: AGENTS_FILES,
    opencode: OPENCODE_FILES,
    scripts: SCRIPT_FILES,
    root: ROOT_FILE_CONTENTS,
    mcpExample: MCP_EXAMPLE,
  })

  return { packageRoot, consumerRoot: createTempDir() }
}

describe('runSync copy passes', () => {
  it('copies .agents, .opencode, scripts and root files and scaffolds stubs', () => {
    const { packageRoot, consumerRoot } = createCopyFixture()

    const result = runSync({ packageRoot, consumerRoot })

    expect(result.exitCode).toBe(0)
    expect(result.copied).toBe(9)
    expect(result.added).toBe(9)
    expect(result.scaffolded).toBe(8)
    expect(result.skipped).toBe(0)
    expect(errorSpy).not.toHaveBeenCalled()

    // .agents copies the regular file and skips the excluded learned-knowledge path.
    expect(
      readFileSync(
        join(consumerRoot, '.agents', 'skills', 'alpha', 'SKILL.md'),
        'utf8',
      ),
    ).toBe(AGENTS_FILES['skills/alpha/SKILL.md'])
    expect(
      readFileSync(
        join(consumerRoot, '.agents', 'instructions', 'typescript.md'),
        'utf8',
      ),
    ).toBe(AGENTS_FILES['instructions/typescript.md'])
    expect(
      readFileSync(
        join(
          consumerRoot,
          '.agents',
          'instructions',
          'learned-knowledge.instructions.md',
        ),
        'utf8',
      ),
    ).toBe(agentInstructionsStubs['learned-knowledge.instructions.md'])

    // .opencode copies regular files but not excluded paths or top-level node_modules.
    expect(
      readFileSync(join(consumerRoot, '.opencode', 'agents', 'coder.md'), 'utf8'),
    ).toBe(OPENCODE_FILES['agents/coder.md'])
    expect(
      readFileSync(
        join(consumerRoot, '.opencode', 'skills', 'beta', 'SKILL.md'),
        'utf8',
      ),
    ).toBe(OPENCODE_FILES['skills/beta/SKILL.md'])
    expect(
      readFileSync(
        join(consumerRoot, '.opencode', 'nested', 'node_modules', 'keep.js'),
        'utf8',
      ),
    ).toBe(OPENCODE_FILES['nested/node_modules/keep.js'])
    expect(existsSync(join(consumerRoot, '.opencode', 'node_modules'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.opencode', 'package.json'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.opencode', '.gitignore'))).toBe(false)

    // scripts are copied from the allow-list only.
    expect(
      readFileSync(join(consumerRoot, 'scripts', 'memory-cli.js'), 'utf8'),
    ).toBe(SCRIPT_FILES['memory-cli.js'])
    expect(
      readFileSync(
        join(consumerRoot, 'scripts', 'mcp', 'playwright-mcp-launcher.js'),
        'utf8',
      ),
    ).toBe(SCRIPT_FILES['mcp/playwright-mcp-launcher.js'])
    expect(existsSync(join(consumerRoot, 'scripts', 'memory-index.js'))).toBe(false)

    // root files, with opencode.json scaffolded from the example.
    for (const [fileName, contents] of Object.entries(ROOT_FILE_CONTENTS)) {
      expect(readFileSync(join(consumerRoot, fileName), 'utf8')).toBe(contents)
    }
    expect(readFileSync(join(consumerRoot, 'opencode.json'), 'utf8')).toBe(
      MCP_EXAMPLE,
    )

    // memory-bank stubs.
    for (const fileName of Object.keys(memoryBankStubs)) {
      expect(existsSync(join(consumerRoot, 'memory-bank', fileName))).toBe(true)
    }

    // Manifest tracks every channel, including scaffolds.
    const manifest = readConsumerManifest(consumerRoot)
    expect(manifest.version).toBe(1)
    expect(manifest.files['skills/alpha/SKILL.md']).toBe(
      sha256(AGENTS_FILES['skills/alpha/SKILL.md']),
    )
    expect(manifest.files['instructions/typescript.md']).toBe(
      sha256(AGENTS_FILES['instructions/typescript.md']),
    )
    expect(manifest.files['instructions/learned-knowledge.instructions.md']).toBeUndefined()
    expect(manifest.files['__opencode__/agents/coder.md']).toBe(
      sha256(OPENCODE_FILES['agents/coder.md']),
    )
    expect(manifest.files['__scripts__/memory-cli.js']).toBe(
      sha256(SCRIPT_FILES['memory-cli.js']),
    )
    expect(manifest.files['__root__/AGENTS.md']).toBe(
      sha256(ROOT_FILE_CONTENTS['AGENTS.md']),
    )
    expect(manifest.files['__root__/opencode.json']).toBe(sha256(MCP_EXAMPLE))
    expect(
      manifest.files['__agents-instructions__/learned-knowledge.instructions.md'],
    ).toBe(
      sha256(agentInstructionsStubs['learned-knowledge.instructions.md']),
    )
    for (const fileName of Object.keys(memoryBankStubs)) {
      expect(manifest.files[`__memory-bank__/${fileName}`]).toBeDefined()
    }

    expect(readFileSync(join(consumerRoot, '.agents-sync-manifest.json'), 'utf8'))
      .toMatch(/\n$/)
    expect(logSpy.mock.calls.join('\n')).toContain(
      `Synced ${result.copied} files (${result.added} new)`,
    )
    expect(outputOf(logSpy)).toContain(
      'skipped 0 modified files. Mode: safe.',
    )
  })

  it('re-copies untouched files on a second run without warnings', () => {
    const { packageRoot, consumerRoot } = createCopyFixture()

    runSync({ packageRoot, consumerRoot })
    const second = runSync({ packageRoot, consumerRoot })

    expect(second.copied).toBe(9)
    expect(second.added).toBe(0)
    expect(second.scaffolded).toBe(0)
    expect(second.skipped).toBe(0)
    expect(warnSpy).not.toHaveBeenCalled()
    expect(outputOf(logSpy)).toContain(
      'skipped 0 modified files. Mode: safe.',
    )
  })

  it('skips locally modified files in every channel', () => {
    const { packageRoot, consumerRoot } = createCopyFixture()

    runSync({ packageRoot, consumerRoot })

    const modified = [
      ['.agents/skills/alpha/SKILL.md', 'agents local'],
      ['.opencode/agents/coder.md', 'opencode local'],
      ['scripts/memory-cli.js', 'scripts local'],
      ['AGENTS.md', 'root local'],
    ]
    for (const [relativePath, contents] of modified) {
      writeFixtureFile(consumerRoot, relativePath, contents)
    }

    const result = runSync({ packageRoot, consumerRoot })

    expect(result.skipped).toBe(4)
    for (const [relativePath, contents] of modified) {
      expect(readFileSync(join(consumerRoot, relativePath), 'utf8')).toBe(
        contents,
      )
    }

    const warnings = outputOf(warnSpy)
    expect(warnings).toContain(
      'Skipped locally modified file: skills/alpha/SKILL.md',
    )
    expect(warnings).toContain(
      'Skipped locally modified opencode file: agents/coder.md',
    )
    expect(warnings).toContain(
      'Skipped locally modified script file: scripts/memory-cli.js',
    )
    expect(warnings).toContain('Skipped locally modified root file: AGENTS.md')
  })

  it('overwrites locally modified files with --force', () => {
    const { packageRoot, consumerRoot } = createCopyFixture()

    runSync({ packageRoot, consumerRoot })
    writeFixtureFile(consumerRoot, '.agents/skills/alpha/SKILL.md', 'agents local')
    writeFixtureFile(consumerRoot, '.opencode/agents/coder.md', 'opencode local')
    writeFixtureFile(consumerRoot, 'scripts/memory-cli.js', 'scripts local')
    writeFixtureFile(consumerRoot, 'AGENTS.md', 'root local')

    const result = runSync({
      packageRoot,
      consumerRoot,
      argv: ['--force'],
      env: {},
    })

    expect(result.skipped).toBe(0)
    expect(warnSpy).not.toHaveBeenCalled()
    expect(
      readFileSync(
        join(consumerRoot, '.agents', 'skills', 'alpha', 'SKILL.md'),
        'utf8',
      ),
    ).toBe(AGENTS_FILES['skills/alpha/SKILL.md'])
    expect(
      readFileSync(join(consumerRoot, '.opencode', 'agents', 'coder.md'), 'utf8'),
    ).toBe(OPENCODE_FILES['agents/coder.md'])
    expect(
      readFileSync(join(consumerRoot, 'scripts', 'memory-cli.js'), 'utf8'),
    ).toBe(SCRIPT_FILES['memory-cli.js'])
    expect(readFileSync(join(consumerRoot, 'AGENTS.md'), 'utf8')).toBe(
      ROOT_FILE_CONTENTS['AGENTS.md'],
    )
    expect(outputOf(logSpy)).toContain('Mode: force.')
  })

  it('prefers a package-shipped opencode.json over the example file', () => {
    const packageRoot = createPackage({
      agents: {},
      root: { 'opencode.json': '{ "mcp": { "from": "package" } }\n' },
      mcpExample: MCP_EXAMPLE,
    })
    const consumerRoot = createTempDir()

    runSync({ packageRoot, consumerRoot })

    expect(readFileSync(join(consumerRoot, 'opencode.json'), 'utf8')).toBe(
      '{ "mcp": { "from": "package" } }\n',
    )
  })

  it('logs progress details when AI_WORKFLOW_VERBOSE=1', () => {
    const { packageRoot, consumerRoot } = createCopyFixture()

    runSync({
      packageRoot,
      consumerRoot,
      argv: [],
      env: { AI_WORKFLOW_VERBOSE: '1' },
    })

    const errors = outputOf(errorSpy)
    expect(errors).toContain('… syncing: .agents/skills/alpha/SKILL.md')
    expect(errors).toContain('… syncing: .opencode/agents/coder.md')
    expect(errors).toContain('… syncing: scripts/memory-cli.js')
    expect(errors).toContain('… syncing: AGENTS.md')
    expect(errors).toContain('… scaffolding: memory-bank/projectbrief.md')
    expect(errors).toContain(
      '… scaffolding: .agents/instructions/learned-knowledge.instructions.md',
    )
    expect(errors).toContain('… scaffolding: opencode.json from example')

    // A second verbose run covers the overwrite branch logging.
    runSync({
      packageRoot,
      consumerRoot,
      argv: [],
      env: { AI_WORKFLOW_VERBOSE: '1' },
    })
    expect(outputOf(errorSpy)).toContain('… syncing: AGENTS.md')
  })

  it('writes nothing in --dry-run except pre-existing scaffolding behaviour', () => {
    const { packageRoot, consumerRoot } = createCopyFixture()

    const result = runSync({
      packageRoot,
      consumerRoot,
      argv: ['--dry-run'],
      env: {},
    })

    expect(result.copied).toBe(9)
    expect(result.added).toBe(9)
    // Copy passes are suppressed.
    expect(existsSync(join(consumerRoot, '.agents', 'skills', 'alpha', 'SKILL.md'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.opencode', 'agents', 'coder.md'))).toBe(false)
    expect(existsSync(join(consumerRoot, 'scripts', 'memory-cli.js'))).toBe(false)
    expect(existsSync(join(consumerRoot, 'AGENTS.md'))).toBe(false)
    // No manifest is persisted.
    expect(existsSync(join(consumerRoot, '.agents-sync-manifest.json'))).toBe(false)
    // Scaffolding is not gated by --dry-run (pre-existing behaviour).
    expect(existsSync(join(consumerRoot, 'memory-bank', 'projectbrief.md'))).toBe(true)
    expect(existsSync(join(consumerRoot, 'opencode.json'))).toBe(true)
    expect(outputOf(logSpy)).toContain('Mode: dry-run.')
  })

  it('does not copy .opencode when the package has no such directory', () => {
    const packageRoot = createPackage({
      agents: { 'skills/alpha/SKILL.md': 'alpha\n' },
      mcpExample: MCP_EXAMPLE,
    })
    const consumerRoot = createTempDir()

    const result = runSync({ packageRoot, consumerRoot })

    expect(result.copied).toBe(1)
    expect(existsSync(join(consumerRoot, '.opencode'))).toBe(false)
  })

  it('warns and returns early when the package has no .agents directory', () => {
    const packageRoot = createPackage({})
    const consumerRoot = createTempDir()

    const result = runSync({ packageRoot, consumerRoot })

    expect(result.exitCode).toBe(0)
    expect(result.copied).toBe(0)
    expect(outputOf(warnSpy)).toContain(
      'No .agents directory found to sync.',
    )
    expect(existsSync(join(consumerRoot, '.agents-sync-manifest.json'))).toBe(false)
  })

  it('creates missing parent directories for nested targets', () => {
    const packageRoot = createPackage({
      agents: { 'deep/nested/tree/SKILL.md': 'deep\n' },
      mcpExample: MCP_EXAMPLE,
    })
    const consumerRoot = createTempDir()

    runSync({ packageRoot, consumerRoot })

    expect(
      readFileSync(
        join(consumerRoot, '.agents', 'deep', 'nested', 'tree', 'SKILL.md'),
        'utf8',
      ),
    ).toBe('deep\n')
  })
})

// ── Prune decisions ──────────────────────────────────────────────────────────

const PRUNE_CONTENT = {
  agentsShipped: 'shipped skill\n',
  agentsStale: 'stale skill\n',
  agentsModifiedOriginal: 'modified skill v1\n',
  agentsModifiedLocal: 'local edits must survive\n',
  opencodeShipped: 'shipped opencode\n',
  opencodeStale: 'stale opencode\n',
  scriptsShipped: '// memory cli shipped\n',
  scriptsStale: '// old tool\n',
  rootAgents: '# package agents\n',
  mcpExample: '{ "mcp": {} }\n',
  rootStale: 'stale root\n',
  rootModifiedOriginal: 'root original\n',
  rootModifiedLocal: 'root local edits\n',
}

function createPruneFixture() {
  const { agentsShipped, opencodeShipped, scriptsShipped, rootAgents, mcpExample } =
    PRUNE_CONTENT

  const packageRoot = createPackage({
    agents: { 'skills/shipped/SKILL.md': agentsShipped },
    opencode: { 'agents/shipped.md': opencodeShipped },
    scripts: { 'memory-cli.js': scriptsShipped },
    root: { 'AGENTS.md': rootAgents },
    mcpExample,
  })
  const consumerRoot = createTempDir()

  writeFixtureFile(
    consumerRoot,
    '.agents/skills/shipped/SKILL.md',
    agentsShipped,
  )
  writeFixtureFile(consumerRoot, '.agents/skills/stale/SKILL.md', PRUNE_CONTENT.agentsStale)
  writeFixtureFile(
    consumerRoot,
    '.agents/skills/modified/SKILL.md',
    PRUNE_CONTENT.agentsModifiedLocal,
  )
  mkdirSync(join(consumerRoot, '.agents', 'skills', 'dir', 'SKILL.md'), {
    recursive: true,
  })

  writeFixtureFile(
    consumerRoot,
    '.opencode/agents/shipped.md',
    opencodeShipped,
  )
  writeFixtureFile(
    consumerRoot,
    '.opencode/agents/stale.md',
    PRUNE_CONTENT.opencodeStale,
  )
  writeFixtureFile(consumerRoot, '.opencode/node_modules/dep.js', 'dep\n')
  writeFixtureFile(consumerRoot, '.opencode/package.json', '{}\n')

  writeFixtureFile(consumerRoot, 'scripts/memory-cli.js', scriptsShipped)
  writeFixtureFile(consumerRoot, 'scripts/old-tool.js', PRUNE_CONTENT.scriptsStale)

  writeFixtureFile(consumerRoot, 'AGENTS.md', rootAgents)
  writeFixtureFile(consumerRoot, 'opencode.json', mcpExample)
  writeFixtureFile(consumerRoot, 'stale-root.md', PRUNE_CONTENT.rootStale)
  writeFixtureFile(consumerRoot, 'untracked.txt', 'untracked\n')
  writeFixtureFile(consumerRoot, 'empty-hash.txt', 'empty hash\n')
  writeFixtureFile(
    consumerRoot,
    'modified-root.md',
    PRUNE_CONTENT.rootModifiedLocal,
  )

  const manifest = {
    version: 1,
    files: {
      'skills/shipped/SKILL.md': sha256(agentsShipped),
      'skills/stale/SKILL.md': sha256(PRUNE_CONTENT.agentsStale),
      'skills/modified/SKILL.md': sha256(PRUNE_CONTENT.agentsModifiedOriginal),
      'skills/gone/SKILL.md': sha256('gone'),
      'skills/dir/SKILL.md': sha256('directory placeholder'),
      'instructions/learned-knowledge.instructions.md': sha256('excluded'),
      '../escape.txt': sha256('escape'),
      '..': sha256('parent'),
      './.': sha256('self'),
      '': sha256('empty'),
      '__memory-bank__/projectbrief.md': sha256('scaffold'),
      '__agents-instructions__/learned-knowledge.instructions.md': sha256(
        'scaffold',
      ),
      '__future__/thing.md': sha256('future'),
      '__opencode__/agents/shipped.md': sha256(opencodeShipped),
      '__opencode__/agents/stale.md': sha256(PRUNE_CONTENT.opencodeStale),
      '__opencode__/node_modules/dep.js': sha256('dep'),
      '__opencode__/package.json': sha256('pkg'),
      '__opencode__/': sha256('empty'),
      '__opencode__/agents/missing.md': sha256('missing'),
      '__scripts__/memory-cli.js': sha256(scriptsShipped),
      '__scripts__/old-tool.js': sha256(PRUNE_CONTENT.scriptsStale),
      '__scripts__/': sha256('empty'),
      '__root__/AGENTS.md': sha256(rootAgents),
      '__root__/opencode.json': sha256(mcpExample),
      '__root__/stale-root.md': sha256(PRUNE_CONTENT.rootStale),
      '__root__/gone-root.md': sha256('gone'),
      '__root__/untracked.txt': null,
      '__root__/empty-hash.txt': '',
      '__root__/modified-root.md': sha256(PRUNE_CONTENT.rootModifiedOriginal),
    },
  }
  writeFixtureFile(
    consumerRoot,
    '.agents-sync-manifest.json',
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  return { packageRoot, consumerRoot, manifest }
}

describe('--prune decision matrix', () => {
  it('prunes only unmodified files whose package source is gone', () => {
    const { packageRoot, consumerRoot } = createPruneFixture()

    const result = runSync({
      packageRoot,
      consumerRoot,
      argv: ['--prune'],
      env: {},
    })

    expect(result.pruned).toBe(4)
    expect(result.pruneSkipped).toBe(4)

    // Pruned: agents stale, opencode stale, scripts old-tool, root stale-root.
    for (const relativePath of [
      '.agents/skills/stale/SKILL.md',
      '.opencode/agents/stale.md',
      'scripts/old-tool.js',
      'stale-root.md',
    ]) {
      expect(existsSync(join(consumerRoot, relativePath)), relativePath).toBe(
        false,
      )
    }

    // Kept: package-shipped files, locally modified files, directories.
    for (const relativePath of [
      '.agents/skills/shipped/SKILL.md',
      '.agents/skills/modified/SKILL.md',
      '.opencode/agents/shipped.md',
      'scripts/memory-cli.js',
      'AGENTS.md',
      'opencode.json',
      'modified-root.md',
      'untracked.txt',
      'empty-hash.txt',
    ]) {
      expect(existsSync(join(consumerRoot, relativePath)), relativePath).toBe(
        true,
      )
    }
    expect(
      readFileSync(
        join(consumerRoot, '.agents/skills/modified/SKILL.md'),
        'utf8',
      ),
    ).toBe(PRUNE_CONTENT.agentsModifiedLocal)
    expect(
      readFileSync(join(consumerRoot, 'modified-root.md'), 'utf8'),
    ).toBe(PRUNE_CONTENT.rootModifiedLocal)

    // Directories are never deleted, and an emptied parent is reported.
    expect(existsSync(join(consumerRoot, '.agents/skills/dir/SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(consumerRoot, '.agents/skills/stale'))).toBe(true)
    expect(outputOf(logSpy)).toContain(
      'Left empty directory in place: .agents/skills/stale',
    )

    const manifest = readConsumerManifest(consumerRoot)
    // Pruned entries and entries whose consumer copy was already gone are dropped.
    for (const key of [
      'skills/stale/SKILL.md',
      'skills/gone/SKILL.md',
      '__opencode__/agents/stale.md',
      '__opencode__/agents/missing.md',
      '__scripts__/old-tool.js',
      '__root__/stale-root.md',
      '__root__/gone-root.md',
    ]) {
      expect(manifest.files[key], key).toBeUndefined()
    }

    // Everything kept retains its bookkeeping entry, including defensive nulls.
    for (const key of [
      'skills/shipped/SKILL.md',
      'skills/modified/SKILL.md',
      'skills/dir/SKILL.md',
      'instructions/learned-knowledge.instructions.md',
      '../escape.txt',
      '..',
      './.',
      '',
      '__memory-bank__/projectbrief.md',
      '__agents-instructions__/learned-knowledge.instructions.md',
      '__future__/thing.md',
      '__opencode__/agents/shipped.md',
      '__opencode__/node_modules/dep.js',
      '__opencode__/package.json',
      '__opencode__/',
      '__scripts__/memory-cli.js',
      '__scripts__/',
      '__root__/AGENTS.md',
      '__root__/opencode.json',
      '__root__/untracked.txt',
      '__root__/empty-hash.txt',
      '__root__/modified-root.md',
    ]) {
      expect(manifest.files, key).toHaveProperty([key])
    }
    expect(manifest.files['skills/modified/SKILL.md']).toBe(
      sha256(PRUNE_CONTENT.agentsModifiedOriginal),
    )
    expect(manifest.files['__root__/untracked.txt']).toBeNull()
    expect(manifest.files['__root__/empty-hash.txt']).toBe('')

    const warnings = outputOf(warnSpy)
    expect(warnings).toContain(
      'Skipped pruning locally modified file: .agents/skills/modified/SKILL.md',
    )
    expect(warnings).toContain(
      'Skipped pruning locally modified file: modified-root.md',
    )
    expect(warnings).toContain(
      'Skipped pruning untracked file: untracked.txt',
    )
    expect(warnings).toContain(
      'Skipped pruning untracked file: empty-hash.txt',
    )
    expect(outputOf(logSpy)).toContain(
      'Pruned 4 stale file(s); skipped 4 locally modified.',
    )
  })

  it('reports prune candidates in --dry-run without deleting or persisting', () => {
    const { packageRoot, consumerRoot } = createPruneFixture()
    const manifestPath = join(consumerRoot, '.agents-sync-manifest.json')
    const manifestBefore = readFileSync(manifestPath, 'utf8')

    const result = runSync({
      packageRoot,
      consumerRoot,
      argv: ['--prune', '--dry-run'],
      env: {},
    })

    expect(result.pruned).toBe(4)
    expect(result.pruneSkipped).toBe(4)

    for (const relativePath of [
      '.agents/skills/stale/SKILL.md',
      '.opencode/agents/stale.md',
      'scripts/old-tool.js',
      'stale-root.md',
    ]) {
      expect(existsSync(join(consumerRoot, relativePath)), relativePath).toBe(
        true,
      )
    }

    // The manifest on disk is byte-for-byte unchanged.
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBefore)

    const logs = outputOf(logSpy)
    expect(logs).toContain('Would prune: .agents/skills/stale/SKILL.md')
    expect(logs).toContain('Would prune: .opencode/agents/stale.md')
    expect(logs).toContain('Would prune: scripts/old-tool.js')
    expect(logs).toContain('Would prune: stale-root.md')
    expect(logs).toContain(
      'Would prune 4 stale file(s); skipped 4 locally modified.',
    )
  })

  it('does not drop stale entries for missing consumer files in --dry-run', () => {
    const { packageRoot, consumerRoot } = createPruneFixture()

    const result = runSync({
      packageRoot,
      consumerRoot,
      argv: ['--prune', '--dry-run'],
      env: {},
    })

    expect(result.exitCode).toBe(0)
    // Dry-run must not drop the entries either; the file is simply reported as-is.
    expect(readConsumerManifest(consumerRoot).files['skills/gone/SKILL.md']).toBeDefined()
  })

  it('keeps scaffold-only namespaces out of the prune path', () => {
    const { packageRoot, consumerRoot } = createPruneFixture()

    runSync({ packageRoot, consumerRoot, argv: ['--prune'], env: {} })

    expect(existsSync(join(consumerRoot, 'memory-bank/projectbrief.md'))).toBe(
      true,
    )
    expect(
      existsSync(
        join(
          consumerRoot,
          '.agents/instructions/learned-knowledge.instructions.md',
        ),
      ),
    ).toBe(true)
    const manifest = readConsumerManifest(consumerRoot)
    expect(manifest.files['__memory-bank__/projectbrief.md']).toBeDefined()
    expect(
      manifest.files['__agents-instructions__/learned-knowledge.instructions.md'],
    ).toBeDefined()
  })
})

// ── Manifest snapshot semantics ──────────────────────────────────────────────

describe('prune snapshot semantics', () => {
  it('never prunes a file scaffolded during the same run', () => {
    const packageRoot = createPackage({
      agents: {},
      mcpExample: MCP_EXAMPLE,
    })
    const consumerRoot = createTempDir()

    // First run scaffolds memory-bank + opencode.json and records them.
    runSync({ packageRoot, consumerRoot })
    // Second run with --prune: source package has no memory-bank, but the keys
    // were present before this run and must not be treated as stale.
    runSync({ packageRoot, consumerRoot, argv: ['--prune'], env: {} })

    expect(existsSync(join(consumerRoot, 'memory-bank', 'projectbrief.md'))).toBe(
      true,
    )
    expect(existsSync(join(consumerRoot, 'opencode.json'))).toBe(true)
  })

  it('keeps manifest bookkeeping for an emptied directory path', () => {
    const { packageRoot, consumerRoot } = createPruneFixture()

    runSync({ packageRoot, consumerRoot, argv: ['--prune'], env: {} })

    const manifest = readConsumerManifest(consumerRoot)
    expect(manifest.files['skills/dir/SKILL.md']).toBe(
      sha256('directory placeholder'),
    )
    expect(readdirSync(join(consumerRoot, '.agents/skills/dir'))).toContain(
      'SKILL.md',
    )
  })
})
