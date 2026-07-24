// ═════════════════════════════════════════════════════════════════════════════
// prepare.test.js — Unit tests for the prepare script handling module
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests the 6-case prepare script algorithm implemented in prepare.js using
// real temp directories.  The ui module is mocked to keep test output clean.
//
// Covered scenarios (≥12, per plan T16 + task description):
//   1. No package.json          → action='skipped', message includes 'No package.json'
//   2. prepare already has "husky" → action='skipped', message includes 'already'
//   3. No prepare script        → action='added', package.json gets "prepare": "husky"
//   4. Simple prepare (merge)   → action='merged', value becomes "npm run build && husky"
//   5. Complex prepare (multi-line) → action='skipped', manual merge required
//   6. Complex prepare with ||  → action='skipped', manual merge required
//   7. Complex prepare with ;   → action='skipped', manual merge required
//   8. Complex prepare + --force → action='added', value becomes "husky"
//   9. dryRun=true              → action='dry-run', package.json NOT modified
//  10. Empty string prepare     → treated as no prepare, action='added'
//  11. Whitespace-only prepare  → treated as empty, action='added'
//  12. "husky && npm run build" → action='skipped' (substring detection)
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, afterEach } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ── Mock ui module to keep test output clean ──────────────────────────────

vi.mock('./ui.js', () => ({
  step: vi.fn(),
  stepSuccess: vi.fn(),
  stepWarn: vi.fn(),
}))

import { handlePrepare } from './prepare.js'

// ── Test helpers ──────────────────────────────────────────────────────────

const tempDirs = new Set()

/**
 * Creates and registers a temporary directory for a single test case.
 * Automatically cleaned up in `afterEach`.
 *
 * @returns {string} Absolute path to the new temp directory.
 */
function createTempDir() {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'prepare-test-'))
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

/**
 * Writes a package.json fixture into the given directory.
 *
 * @param {string} dir        - Directory to write into.
 * @param {object} [overrides] - Properties to merge into the default package.
 * @returns {object} The written package object.
 */
function writePkg(dir, overrides = {}) {
  const pkg = { name: 'test-pkg', version: '1.0.0', ...overrides }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  return pkg
}

/**
 * Reads and parses the package.json in the given directory.
 *
 * @param {string} dir - Directory containing package.json.
 * @returns {object} Parsed package object.
 */
function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('handlePrepare', () => {
  afterEach(() => {
    cleanupTempDirs()
  })

  // ── 1. No package.json ─────────────────────────────────────────────────

  it('scenario 1: no consumerPackageJson → action=skipped, message includes "No package.json"', async () => {
    const dir = createTempDir()
    // No package.json file is written — consumerPackageJson is undefined

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: undefined,
      existingPrepare: undefined,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('No package.json')
    // Nothing should have been created
    expect(existsSync(join(dir, 'package.json'))).toBe(false)
  })

  // ── 2. Prepare already has "husky" ─────────────────────────────────────

  it('scenario 2: prepare already set to exactly "husky" → action=skipped, message includes "already"', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'husky' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'husky' } },
      existingPrepare: 'husky',
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('already')
    // package.json must be unchanged
    expect(readPkg(dir).scripts.prepare).toBe('husky')
  })

  it('scenario 2b: prepare with "husky && lint" (substring) → action=skipped', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'husky && lint' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'husky && lint' } },
      existingPrepare: 'husky && lint',
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('already')
  })

  it('scenario 2c: prepare with "build && husky" (suffix) → action=skipped', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'build && husky' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'build && husky' } },
      existingPrepare: 'build && husky',
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
  })

  it('scenario 2d: prepare with "build && husky && lint" (middle) → action=skipped', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'build && husky && lint' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'build && husky && lint' } },
      existingPrepare: 'build && husky && lint',
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
  })

  // ── 3. No prepare script ───────────────────────────────────────────────

  it('scenario 3: no prepare script → action=added, package.json gets "prepare": "husky"', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { test: 'vitest' } }) // scripts block present but no prepare

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { test: 'vitest' } },
      existingPrepare: undefined,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('added')
    expect(result.message).toContain('Added')
    const pkg = readPkg(dir)
    expect(pkg.scripts.prepare).toBe('husky')
    // Existing scripts are preserved
    expect(pkg.scripts.test).toBe('vitest')
  })

  it('scenario 3b: no scripts block at all → creates scripts block with prepare', async () => {
    const dir = createTempDir()
    writePkg(dir, {}) // no scripts block

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg' },
      existingPrepare: undefined,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('added')
    const pkg = readPkg(dir)
    expect(pkg.scripts).toEqual({ prepare: 'husky' })
  })

  // ── 4. Simple prepare (merge) ──────────────────────────────────────────

  it('scenario 4: simple prepare "npm run build" → action=merged, value becomes "npm run build && husky"', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'npm run build' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'npm run build' } },
      existingPrepare: 'npm run build',
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('merged')
    expect(result.message).toContain('Merged')
    expect(readPkg(dir).scripts.prepare).toBe('npm run build && husky')
  })

  it('scenario 4b: simple prepare "echo hello" → action=merged', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'echo hello' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'echo hello' } },
      existingPrepare: 'echo hello',
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('merged')
    expect(readPkg(dir).scripts.prepare).toBe('echo hello && husky')
  })

  // ── 5. Complex prepare (multi-line) ────────────────────────────────────

  it('scenario 5: multi-line prepare → action=skipped, manual merge required', async () => {
    const dir = createTempDir()
    const script = 'echo "line1"\necho "line2"\necho "line3"'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('manual merge')
    // File must not be modified
    expect(readPkg(dir).scripts.prepare).toBe(script)
  })

  // ── 6. Complex prepare with || ─────────────────────────────────────────

  it('scenario 6: prepare with || operator → action=skipped, manual merge required', async () => {
    const dir = createTempDir()
    const script = 'cmd1 || cmd2'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('manual merge')
    expect(readPkg(dir).scripts.prepare).toBe(script)
  })

  // ── 7. Complex prepare with ; ──────────────────────────────────────────

  it('scenario 7: prepare with ; separator → action=skipped, manual merge required', async () => {
    const dir = createTempDir()
    const script = 'cmd1; cmd2'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('manual merge')
    expect(readPkg(dir).scripts.prepare).toBe(script)
  })

  // ── 8. Complex prepare + --force ───────────────────────────────────────

  it('scenario 8: complex prepare + --force → action=added, value becomes "husky"', async () => {
    const dir = createTempDir()
    const script = 'cmd1 && cmd2 && cmd3 && cmd4'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: false,
      force: true,
    })

    expect(result.action).toBe('added')
    expect(result.message).toContain('Replaced')
    expect(readPkg(dir).scripts.prepare).toBe('husky')
  })

  it('scenario 8b: multi-line prepare + --force → value replaced with "husky"', async () => {
    const dir = createTempDir()
    const script = 'echo "a"\necho "b"\necho "c"'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: false,
      force: true,
    })

    expect(result.action).toBe('added')
    expect(readPkg(dir).scripts.prepare).toBe('husky')
  })

  // ── 9. dryRun=true ─────────────────────────────────────────────────────

  it('scenario 9a: dryRun + no prepare → action=dry-run, package.json NOT modified', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { test: 'vitest' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { test: 'vitest' } },
      existingPrepare: undefined,
      prepareIsSimple: false,
      dryRun: true,
      force: false,
    })

    expect(result.action).toBe('dry-run')
    expect(result.message).toContain('Would add')
    // Verify no change
    const pkg = readPkg(dir)
    expect(pkg.scripts.prepare).toBeUndefined()
    expect(pkg.scripts.test).toBe('vitest')
  })

  it('scenario 9b: dryRun + simple prepare → action=dry-run, package.json NOT modified', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: 'npm run build' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: 'npm run build' } },
      existingPrepare: 'npm run build',
      prepareIsSimple: true,
      dryRun: true,
      force: false,
    })

    expect(result.action).toBe('dry-run')
    expect(result.message).toContain('Would merge')
    expect(readPkg(dir).scripts.prepare).toBe('npm run build') // unchanged
  })

  it('scenario 9c: dryRun + complex prepare → action=dry-run, package.json NOT modified', async () => {
    const dir = createTempDir()
    const script = 'cmd1 && cmd2 && cmd3'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: true,
      force: false,
    })

    expect(result.action).toBe('dry-run')
    expect(result.message).toContain('would skip')
    expect(readPkg(dir).scripts.prepare).toBe(script) // unchanged
  })

  it('scenario 9d: dryRun + complex prepare + --force → action=dry-run, package.json NOT modified', async () => {
    const dir = createTempDir()
    const script = 'cmd1 && cmd2 && cmd3'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: false,
      dryRun: true,
      force: true,
    })

    expect(result.action).toBe('dry-run')
    expect(result.message).toContain('Would replace')
    expect(readPkg(dir).scripts.prepare).toBe(script) // unchanged
  })

  // ── 10. Empty string prepare ───────────────────────────────────────────

  it('scenario 10: empty string prepare → treated as no prepare, action=added', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: '' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: '' } },
      existingPrepare: '',
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('added')
    expect(readPkg(dir).scripts.prepare).toBe('husky')
  })

  // ── 11. Whitespace-only prepare ────────────────────────────────────────

  it('scenario 11: whitespace-only prepare → treated as empty, action=added', async () => {
    const dir = createTempDir()
    writePkg(dir, { scripts: { prepare: '   ' } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: '   ' } },
      existingPrepare: '   ',
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('added')
    expect(readPkg(dir).scripts.prepare).toBe('husky')
  })

  it('scenario 11b: whitespace-only prepare with tabs and newlines → treated as empty, action=added', async () => {
    const dir = createTempDir()
    const whitespace = ' \t\n '
    writePkg(dir, { scripts: { prepare: whitespace } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: whitespace } },
      existingPrepare: whitespace,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('added')
    expect(readPkg(dir).scripts.prepare).toBe('husky')
  })

  // ── 12. "husky && ..." substring detection ─────────────────────────────

  it('scenario 12: "husky && npm run build" → action=skipped (substring detects husky)', async () => {
    const dir = createTempDir()
    const script = 'husky && npm run build'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('already')
    expect(readPkg(dir).scripts.prepare).toBe(script) // unchanged
  })

  // ── Additional edge cases ──────────────────────────────────────────────

  it('preserves other package.json fields when adding prepare script', async () => {
    const dir = createTempDir()
    writePkg(dir, {
      version: '2.0.0',
      description: 'test',
      scripts: { test: 'vitest', lint: 'eslint' },
      dependencies: { lodash: '^4.0.0' },
    })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: {
        name: 'test-pkg',
        version: '2.0.0',
        description: 'test',
        scripts: { test: 'vitest', lint: 'eslint' },
        dependencies: { lodash: '^4.0.0' },
      },
      existingPrepare: undefined,
      prepareIsSimple: false,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('added')
    const pkg = readPkg(dir)
    expect(pkg.scripts.prepare).toBe('husky')
    expect(pkg.scripts.test).toBe('vitest')
    expect(pkg.scripts.lint).toBe('eslint')
    expect(pkg.version).toBe('2.0.0')
    expect(pkg.dependencies.lodash).toBe('^4.0.0')
  })

  it('preserves other package.json fields when merging prepare script', async () => {
    const dir = createTempDir()
    writePkg(dir, {
      version: '3.0.0',
      scripts: { prepare: 'npm run build', test: 'vitest' },
      devDependencies: { husky: '^9.0.0' },
    })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: {
        name: 'test-pkg',
        version: '3.0.0',
        scripts: { prepare: 'npm run build', test: 'vitest' },
        devDependencies: { husky: '^9.0.0' },
      },
      existingPrepare: 'npm run build',
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('merged')
    const pkg = readPkg(dir)
    expect(pkg.scripts.prepare).toBe('npm run build && husky')
    expect(pkg.scripts.test).toBe('vitest')
    expect(pkg.version).toBe('3.0.0')
    expect(pkg.devDependencies.husky).toBe('^9.0.0')
  })

  it('preserves other package.json fields when force-replacing prepare script', async () => {
    const dir = createTempDir()
    writePkg(dir, {
      scripts: { prepare: 'cmd1 && cmd2 && cmd3', test: 'vitest' },
      keywords: ['test'],
    })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: {
        name: 'test-pkg',
        scripts: { prepare: 'cmd1 && cmd2 && cmd3', test: 'vitest' },
        keywords: ['test'],
      },
      existingPrepare: 'cmd1 && cmd2 && cmd3',
      prepareIsSimple: false,
      dryRun: false,
      force: true,
    })

    expect(result.action).toBe('added')
    const pkg = readPkg(dir)
    expect(pkg.scripts.prepare).toBe('husky')
    expect(pkg.scripts.test).toBe('vitest')
    expect(pkg.keywords).toEqual(['test'])
  })

  it('handles prepare script using "husky" in a non-substring context (edge: "npx husky")', async () => {
    // "npx husky" contains "husky" substring → should be skipped by case 2
    const dir = createTempDir()
    const script = 'npx husky'
    writePkg(dir, { scripts: { prepare: script } })

    const result = await handlePrepare({
      consumerRoot: dir,
      consumerPackageJson: { name: 'test-pkg', scripts: { prepare: script } },
      existingPrepare: script,
      prepareIsSimple: true,
      dryRun: false,
      force: false,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('already')
  })

  it('result object always contains action and message string fields', async () => {
    const dir = createTempDir()
    writePkg(dir)

    const scenarios = [
      // No package.json
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: undefined,
        existingPrepare: undefined,
        prepareIsSimple: false,
        dryRun: false,
        force: false,
      }),
      // Already has husky
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: { name: 'test', scripts: { prepare: 'husky' } },
        existingPrepare: 'husky',
        prepareIsSimple: true,
        dryRun: false,
        force: false,
      }),
      // No prepare script
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: { name: 'test' },
        existingPrepare: undefined,
        prepareIsSimple: false,
        dryRun: false,
        force: false,
      }),
      // Simple prepare
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: { name: 'test', scripts: { prepare: 'npm run build' } },
        existingPrepare: 'npm run build',
        prepareIsSimple: true,
        dryRun: false,
        force: false,
      }),
      // Complex prepare - no force
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: { name: 'test', scripts: { prepare: 'cmd1 || cmd2' } },
        existingPrepare: 'cmd1 || cmd2',
        prepareIsSimple: false,
        dryRun: false,
        force: false,
      }),
      // Complex prepare + force
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: { name: 'test', scripts: { prepare: 'cmd1 || cmd2' } },
        existingPrepare: 'cmd1 || cmd2',
        prepareIsSimple: false,
        dryRun: false,
        force: true,
      }),
      // Dry-run
      await handlePrepare({
        consumerRoot: dir,
        consumerPackageJson: { name: 'test', scripts: { prepare: 'npm run build' } },
        existingPrepare: 'npm run build',
        prepareIsSimple: true,
        dryRun: true,
        force: false,
      }),
    ]

    for (const r of scenarios) {
      expect(r).toHaveProperty('action')
      expect(r).toHaveProperty('message')
      expect(typeof r.action).toBe('string')
      expect(typeof r.message).toBe('string')
    }
  })
})
