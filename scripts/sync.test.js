import { describe, expect, it, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
  statSync,
} from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

const projectRoot = process.cwd()
const tempDirs = []

function createTempDir() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-test-'))
  tempDirs.push(tmpDir)
  return tmpDir
}

function runSync(tempDir, args = []) {
  return spawnSync('node', ['scripts/sync.js', ...args], {
    cwd: projectRoot,
    env: { ...process.env, INIT_CWD: tempDir },
    encoding: 'utf8',
  })
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function writeFixtureFile(baseDir, relativePath, contents) {
  const filePath = join(baseDir, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
  return filePath
}

// Builds a throwaway "published package" containing its own copy of sync.js, so
// prune tests never depend on the real repository's file contents.
function createFakePackage({ agents = {} } = {}) {
  const packageDir = createTempDir()
  writeFileSync(join(packageDir, 'package.json'), '{ "type": "module" }\n')
  mkdirSync(join(packageDir, 'scripts'), { recursive: true })
  copyFileSync(
    join(projectRoot, 'scripts', 'sync.js'),
    join(packageDir, 'scripts', 'sync.js'),
  )
  mkdirSync(join(packageDir, '.agents'), { recursive: true })

  for (const [relativePath, contents] of Object.entries(agents)) {
    writeFixtureFile(packageDir, join('.agents', relativePath), contents)
  }

  return packageDir
}

function runSyncFrom(packageDir, consumerDir, args = []) {
  return spawnSync(
    'node',
    [join(packageDir, 'scripts', 'sync.js'), ...args],
    {
      cwd: packageDir,
      env: { ...process.env, INIT_CWD: consumerDir },
      encoding: 'utf8',
    },
  )
}

function readConsumerManifest(consumerDir) {
  return JSON.parse(
    readFileSync(join(consumerDir, '.agents-sync-manifest.json'), 'utf8'),
  )
}

describe('sync utility functions', () => {
  it('should validate basic assertions work', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle string operations', () => {
    const result = 'ai-workflow-template'.split('-').join(' ')
    expect(result).toBe('ai workflow template')
  })
})

describe('__scripts__ sync behavior', () => {
  const scriptsToSync = [
    'memory-cli.js',
    'memory-index.js',
    'bump-version.js',
    'validate-memory-schema.js',
    'vocab-sync.js',
    'mcp-memory-server.js',
    'mcp/playwright-mcp-launcher.js',
  ]

  it('should copy scripts when they do not exist in consumer project', () => {
    const tempDir = createTempDir()

    // Create a manifest with __scripts__ entries (initial tracking)
    const manifest = {
      version: 1,
      files: Object.fromEntries(
        scriptsToSync.map((s) => [`__scripts__/${s}`, null]),
      ),
    }
    writeFileSync(
      join(tempDir, '.agents-sync-manifest.json'),
      JSON.stringify(manifest, null, 2),
    )

    const result = runSync(tempDir)
    expect(result.status).toBe(0)

    // Verify all 7 script files were created in the consumer's scripts/ dir
    for (const script of scriptsToSync) {
      const targetFile = join(tempDir, 'scripts', script)
      expect(
        existsSync(targetFile),
        `Expected scripts/${script} to exist`,
      ).toBe(true)
    }
  })

  it('should skip scripts that exist in target without manifest tracking', () => {
    const tempDir = createTempDir()
    const sourceScriptsDir = join(projectRoot, 'scripts')

    // Pre-populate target with files matching source content (same hash)
    // but create a manifest that has NO __scripts__ entries
    for (const script of scriptsToSync) {
      const sourceFile = join(sourceScriptsDir, script)
      const targetFile = join(tempDir, 'scripts', script)
      mkdirSync(dirname(targetFile), { recursive: true })
      copyFileSync(sourceFile, targetFile)
    }

    // Empty manifest — no __scripts__ keys → isUntouched = false for all
    writeFileSync(
      join(tempDir, '.agents-sync-manifest.json'),
      JSON.stringify({ version: 1, files: {} }),
    )

    // Record mtimes before sync
    const mtimesBefore = {}
    for (const script of scriptsToSync) {
      mtimesBefore[script] = statSync(
        join(tempDir, 'scripts', script),
      ).mtimeMs
    }

    const result = runSync(tempDir)
    expect(result.status).toBe(0)

    // Verify mtimes are unchanged (files were NOT overwritten)
    for (const script of scriptsToSync) {
      expect(statSync(join(tempDir, 'scripts', script)).mtimeMs).toBe(
        mtimesBefore[script],
      )
    }
  })

  it('should force overwrite all scripts with --force', () => {
    const tempDir = createTempDir()
    const sourceScriptsDir = join(projectRoot, 'scripts')

    // Pre-populate target with dummy content (different from source)
    for (const script of scriptsToSync) {
      const targetFile = join(tempDir, 'scripts', script)
      mkdirSync(dirname(targetFile), { recursive: true })
      writeFileSync(targetFile, `// modified ${script}`)
    }

    const result = runSync(tempDir, ['--force'])
    expect(result.status).toBe(0)

    // Verify all 7 files were overwritten with source content
    for (const script of scriptsToSync) {
      const targetFile = join(tempDir, 'scripts', script)
      const sourceFile = join(sourceScriptsDir, script)
      expect(existsSync(targetFile)).toBe(true)
      expect(readFileSync(targetFile, 'utf8')).toBe(
        readFileSync(sourceFile, 'utf8'),
      )
    }
  })

  it('should show scripts in --dry-run output but not write files', () => {
    const tempDir = createTempDir()

    const result = runSync(tempDir, ['--dry-run'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('dry-run')

    // Verify no script files were written to disk
    for (const script of scriptsToSync) {
      expect(existsSync(join(tempDir, 'scripts', script))).toBe(false)
    }
  })

  it('should track new manifest entries after sync', () => {
    const tempDir = createTempDir()

    // Create empty manifest
    writeFileSync(
      join(tempDir, '.agents-sync-manifest.json'),
      JSON.stringify({ version: 1, files: {} }),
    )

    const result = runSync(tempDir)
    expect(result.status).toBe(0)

    // Read back the updated manifest
    const updatedManifest = JSON.parse(
      readFileSync(join(tempDir, '.agents-sync-manifest.json'), 'utf8'),
    )

    // Verify all 7 __scripts__ entries are tracked with valid SHA-256 hashes
    for (const script of scriptsToSync) {
      const key = `__scripts__/${script}`
      expect(updatedManifest.files[key]).toBeDefined()
      expect(updatedManifest.files[key]).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})

describe('--prune behavior', () => {
  const KEEP_CONTENT = 'keep skill v1\n'
  const STALE_CONTENT = 'retired skill content\n'
  const MODIFIED_ORIGINAL = 'modifiable skill v1\n'
  const MODIFIED_LOCAL = 'local edits that must survive\n'
  const GONE_CONTENT = 'already deleted by the user\n'

  function createPruneFixture() {
    // The fake package only ships `skills/keep/SKILL.md`. The consumer's `stale`,
    // `modified`, and `gone` entries therefore all have an absent package source.
    const packageDir = createFakePackage({
      agents: { 'skills/keep/SKILL.md': KEEP_CONTENT },
    })
    const consumerDir = createTempDir()

    writeFixtureFile(consumerDir, '.agents/skills/keep/SKILL.md', KEEP_CONTENT)
    writeFixtureFile(consumerDir, '.agents/skills/stale/SKILL.md', STALE_CONTENT)
    writeFixtureFile(
      consumerDir,
      '.agents/skills/modified/SKILL.md',
      MODIFIED_LOCAL,
    )

    writeFileSync(
      join(consumerDir, '.agents-sync-manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          files: {
            'skills/keep/SKILL.md': sha256(KEEP_CONTENT),
            'skills/stale/SKILL.md': sha256(STALE_CONTENT),
            'skills/modified/SKILL.md': sha256(MODIFIED_ORIGINAL),
            'skills/gone/SKILL.md': sha256(GONE_CONTENT),
          },
        },
        null,
        2,
      )}\n`,
    )

    return { packageDir, consumerDir }
  }

  const stalePath = (consumerDir) =>
    join(consumerDir, '.agents/skills/stale/SKILL.md')
  const modifiedPath = (consumerDir) =>
    join(consumerDir, '.agents/skills/modified/SKILL.md')
  const keepPath = (consumerDir) =>
    join(consumerDir, '.agents/skills/keep/SKILL.md')
  const gonePath = (consumerDir) =>
    join(consumerDir, '.agents/skills/gone/SKILL.md')

  it('TEST-02: without --prune, a package-absent manifest entry is left untouched', () => {
    const { packageDir, consumerDir } = createPruneFixture()

    const result = runSyncFrom(packageDir, consumerDir)
    expect(result.status).toBe(0)

    // Tree unchanged: stale + modified files survive, and no entry is dropped.
    expect(existsSync(stalePath(consumerDir))).toBe(true)
    expect(readFileSync(stalePath(consumerDir), 'utf8')).toBe(STALE_CONTENT)
    expect(existsSync(modifiedPath(consumerDir))).toBe(true)

    const manifest = readConsumerManifest(consumerDir)
    expect(manifest.files['skills/stale/SKILL.md']).toBe(sha256(STALE_CONTENT))
    expect(manifest.files['skills/modified/SKILL.md']).toBe(
      sha256(MODIFIED_ORIGINAL),
    )
    expect(manifest.files['skills/gone/SKILL.md']).toBeDefined()
  })

  it('TEST-03: --prune removes only unmodified files whose package source is gone', () => {
    const { packageDir, consumerDir } = createPruneFixture()

    const result = runSyncFrom(packageDir, consumerDir, ['--prune'])
    expect(result.status).toBe(0)

    // Hash-identical + package-absent => deleted, entry dropped.
    expect(existsSync(stalePath(consumerDir))).toBe(false)
    expect(readConsumerManifest(consumerDir).files['skills/stale/SKILL.md']).toBe(
      undefined,
    )

    // Package-owned files are never candidates.
    expect(existsSync(keepPath(consumerDir))).toBe(true)
    expect(readConsumerManifest(consumerDir).files['skills/keep/SKILL.md']).toBe(
      sha256(KEEP_CONTENT),
    )

    // Directories are never deleted: the now-empty skill dir is reported, not removed.
    expect(existsSync(join(consumerDir, '.agents/skills/stale'))).toBe(true)
    expect(result.stdout).toContain(
      'Left empty directory in place: .agents/skills/stale',
    )
    expect(result.stdout).toContain(
      'Pruned 1 stale file(s); skipped 1 locally modified.',
    )
  })

  it('TEST-04: --prune never removes a locally modified file and retains its entry', () => {
    const { packageDir, consumerDir } = createPruneFixture()

    const result = runSyncFrom(packageDir, consumerDir, ['--prune'])
    expect(result.status).toBe(0)

    expect(existsSync(modifiedPath(consumerDir))).toBe(true)
    expect(readFileSync(modifiedPath(consumerDir), 'utf8')).toBe(
      MODIFIED_LOCAL,
    )
    // Warning names the file, and the manifest entry is retained with its original hash.
    expect(result.stderr).toContain(
      'Skipped pruning locally modified file: .agents/skills/modified/SKILL.md',
    )
    expect(readConsumerManifest(consumerDir).files['skills/modified/SKILL.md']).toBe(
      sha256(MODIFIED_ORIGINAL),
    )
  })

  it('TEST-05: --prune never removes a path that is still shipped in the package', () => {
    const { packageDir, consumerDir } = createPruneFixture()

    // The consumer copy is byte-identical to the package and tracked by hash —
    // exactly the state that would qualify for deletion if the package had dropped it.
    expect(readFileSync(keepPath(consumerDir), 'utf8')).toBe(KEEP_CONTENT)

    const result = runSyncFrom(packageDir, consumerDir, ['--prune'])
    expect(result.status).toBe(0)

    expect(existsSync(keepPath(consumerDir))).toBe(true)
    expect(readFileSync(keepPath(consumerDir), 'utf8')).toBe(KEEP_CONTENT)
    expect(readConsumerManifest(consumerDir).files['skills/keep/SKILL.md']).toBe(
      sha256(KEEP_CONTENT),
    )
  })

  it('--prune --dry-run reports candidates but deletes nothing', () => {
    const { packageDir, consumerDir } = createPruneFixture()

    const result = runSyncFrom(packageDir, consumerDir, [
      '--prune',
      '--dry-run',
    ])
    expect(result.status).toBe(0)

    expect(result.stdout).toContain(
      'Would prune: .agents/skills/stale/SKILL.md',
    )
    expect(result.stdout).toContain(
      'Would prune 1 stale file(s); skipped 1 locally modified.',
    )

    // Nothing deleted, and the manifest on disk is unchanged.
    expect(existsSync(stalePath(consumerDir))).toBe(true)
    expect(readFileSync(stalePath(consumerDir), 'utf8')).toBe(STALE_CONTENT)
    expect(readConsumerManifest(consumerDir).files['skills/stale/SKILL.md']).toBe(
      sha256(STALE_CONTENT),
    )
  })

  it('--prune drops entries whose consumer file is already missing, without error', () => {
    const { packageDir, consumerDir } = createPruneFixture()
    expect(existsSync(gonePath(consumerDir))).toBe(false)

    const result = runSyncFrom(packageDir, consumerDir, ['--prune'])
    expect(result.status).toBe(0)
    expect(result.stderr).not.toContain('Error')
    expect(readConsumerManifest(consumerDir).files['skills/gone/SKILL.md']).toBe(
      undefined,
    )
  })

  it('--prune never removes scaffold-only manifest entries (memory-bank, learned knowledge)', () => {
    const { packageDir, consumerDir } = createPruneFixture()

    // First sync scaffolds these files and records their hashes.
    expect(runSyncFrom(packageDir, consumerDir).status).toBe(0)

    const result = runSyncFrom(packageDir, consumerDir, ['--prune'])
    expect(result.status).toBe(0)

    expect(existsSync(join(consumerDir, 'memory-bank/projectbrief.md'))).toBe(
      true,
    )
    expect(
      existsSync(
        join(
          consumerDir,
          '.agents/instructions/learned-knowledge.instructions.md',
        ),
      ),
    ).toBe(true)

    const manifest = readConsumerManifest(consumerDir)
    expect(manifest.files['__memory-bank__/projectbrief.md']).toBeDefined()
    expect(
      manifest.files['__agents-instructions__/learned-knowledge.instructions.md'],
    ).toBeDefined()
  })

  it('--prune resolves __scripts__ and __root__ keys against the package', () => {
    const packageDir = createFakePackage({
      agents: { 'skills/keep/SKILL.md': KEEP_CONTENT },
    })
    const consumerDir = createTempDir()

    writeFixtureFile(consumerDir, 'scripts/old-tool.js', 'console.log(1)\n')
    writeFixtureFile(consumerDir, 'AGENTS.md', '# locally edited agents\n')
    writeFileSync(
      join(consumerDir, '.agents-sync-manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          files: {
            '__scripts__/old-tool.js': sha256('console.log(1)\n'),
            '__root__/AGENTS.md': sha256('# locally edited agents\n'),
          },
        },
        null,
        2,
      )}\n`,
    )

    const result = runSyncFrom(packageDir, consumerDir, ['--prune'])
    expect(result.status).toBe(0)

    expect(existsSync(join(consumerDir, 'scripts/old-tool.js'))).toBe(false)
    expect(existsSync(join(consumerDir, 'AGENTS.md'))).toBe(false)

    const manifest = readConsumerManifest(consumerDir)
    expect(manifest.files['__scripts__/old-tool.js']).toBeUndefined()
    expect(manifest.files['__root__/AGENTS.md']).toBeUndefined()
  })
})
