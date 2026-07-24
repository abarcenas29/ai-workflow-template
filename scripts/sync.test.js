import { describe, expect, it, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
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

    // Verify all 6 script files were created in the consumer's scripts/ dir
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

    // Verify all 6 files were overwritten with source content
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

    // Verify all 6 __scripts__ entries are tracked with valid SHA-256 hashes
    for (const script of scriptsToSync) {
      const key = `__scripts__/${script}`
      expect(updatedManifest.files[key]).toBeDefined()
      expect(updatedManifest.files[key]).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})
