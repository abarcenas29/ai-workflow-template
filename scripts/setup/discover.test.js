// ═════════════════════════════════════════════════════════════════════════════
// discover.test.js — Unit tests for the discover module
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ── Mock utils: environment-dependent functions; keep fs helpers real ─────

/** Mutable variable so the mock factory can return different roots per test */
let mockConsumerRoot = ''

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getConsumerRoot: () => mockConsumerRoot,
    getNodeVersion: vi.fn(() => 20),
    isCI: vi.fn(() => false),
  }
})

import { discover } from './discover.js'
import { HOOK_MARKER, TEMPLATE_HOOKS } from './constants.js'
import { getNodeVersion, isCI } from './utils.js'

// ── Test helpers ──────────────────────────────────────────────────────────

const tempDirs = new Set()

/**
 * Creates a temporary project directory with a configurable structure.
 *
 * @param {object}   opts
 * @param {boolean}  [opts.git=true]        – Create a `.git/` directory
 * @param {boolean}  [opts.huskyDir=false]  – Create a `.husky/` directory
 * @param {object|boolean} [opts.packageJson=true] – `false` = skip, object = custom
 * @param {object}   [opts.hooks={}]        – Map of hook filename → content
 * @returns {string} Path to the created temp directory.
 */
function createProject(opts = {}) {
  const {
    git = true,
    huskyDir = false,
    packageJson = true,
    hooks = {},
  } = opts

  const dir = mkdtempSync(join(tmpdir(), 'discover-test-'))
  tempDirs.add(dir)

  if (git) mkdirSync(join(dir, '.git'), { recursive: true })
  if (huskyDir) mkdirSync(join(dir, '.husky'), { recursive: true })
  if (packageJson) {
    const pkg =
      typeof packageJson === 'object' ? packageJson : { name: 'test-pkg' }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  }
  for (const [name, content] of Object.entries(hooks)) {
    const hookDir = join(dir, '.husky')
    if (!existsSync(hookDir)) mkdirSync(hookDir, { recursive: true })
    writeFileSync(join(hookDir, name), content)
  }

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

// ── Tests ─────────────────────────────────────────────────────────────────

describe('discover()', () => {
  beforeEach(() => {
    vi.mocked(getNodeVersion).mockReturnValue(20)
    vi.mocked(isCI).mockReturnValue(false)
  })

  afterEach(() => {
    cleanupTempDirs()
  })

  // ── 1. Fresh project (no .husky/) ──────────────────────────────────────

  it('should detect a fresh project with git but no .husky/ directory', async () => {
    const dir = createProject({ git: true, huskyDir: false })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.consumerRoot).toBe(dir)
    expect(ctx.hasGit).toBe(true)
    expect(ctx.hasHuskyDir).toBe(false)
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      expect(ctx.existingHooks[name].exists).toBe(false)
    }
    expect(ctx.hasPackageJson).toBe(true)
    expect(ctx.isCI).toBe(false)
    expect(ctx.nodeVersion).toBe(20)
    expect(ctx.dryRun).toBe(false)
  })

  // ── 2. Project with .husky/ but no hooks ───────────────────────────────

  it('should detect .husky/ directory but no hook files inside', async () => {
    const dir = createProject({ huskyDir: true, hooks: {} })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.hasHuskyDir).toBe(true)
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      expect(ctx.existingHooks[name].exists).toBe(false)
      expect(ctx.existingHooks[name].content).toBeNull()
      expect(ctx.existingHooks[name].isManaged).toBe(false)
    }
  })

  // ── 3. Existing unmanaged hooks ────────────────────────────────────────

  it('should detect unmanaged hooks (first line is NOT the HOOK_MARKER)', async () => {
    const dir = createProject({
      huskyDir: true,
      hooks: { 'pre-commit': '#!/bin/sh\necho "custom hook"\n' },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    const h = ctx.existingHooks['pre-commit']
    expect(h.exists).toBe(true)
    expect(h.content).toBe('#!/bin/sh\necho "custom hook"\n')
    expect(h.isManaged).toBe(false)
  })

  // ── 4. Existing managed hooks ──────────────────────────────────────────

  it('should detect managed hooks (first line matches HOOK_MARKER)', async () => {
    const dir = createProject({
      huskyDir: true,
      hooks: { 'pre-commit': `${HOOK_MARKER}\n\necho "managed hook"\n` },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    const h = ctx.existingHooks['pre-commit']
    expect(h.exists).toBe(true)
    expect(h.isManaged).toBe(true)
  })

  // ── 5. No package.json ─────────────────────────────────────────────────

  it('should handle a project with no package.json', async () => {
    const dir = createProject({
      git: true,
      huskyDir: false,
      packageJson: false,
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.hasPackageJson).toBe(false)
    expect(ctx.consumerPackageJson).toBeNull()
    expect(ctx.existingPrepare).toBeNull()
  })

  // ── 6. Package.json with no prepare script ─────────────────────────────

  it('should set existingPrepare=null when prepare script is missing', async () => {
    const dir = createProject({
      packageJson: { name: 'test', scripts: {} },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.existingPrepare).toBeNull()
  })

  // ── 7. Simple prepare script ───────────────────────────────────────────

  it('should detect a simple prepare script and classify as simple', async () => {
    const dir = createProject({
      packageJson: { scripts: { prepare: 'npm run build' } },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.existingPrepare).toBe('npm run build')
    expect(ctx.prepareIsSimple).toBe(true)
  })

  // ── 8. Complex prepare (multi-line) ────────────────────────────────────

  it('should classify a multi-line prepare script as complex', async () => {
    const dir = createProject({
      packageJson: { scripts: { prepare: 'echo "line1"\necho "line2"' } },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.prepareIsSimple).toBe(false)
  })

  // ── 9. Prepare already containing "husky" ──────────────────────────────

  it('should detect prepare script set to exactly "husky"', async () => {
    const dir = createProject({
      packageJson: { scripts: { prepare: 'husky' } },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.existingPrepare).toBe('husky')
    expect(ctx.prepareIsSimple).toBe(true)
  })

  // ── 10. CI environment ─────────────────────────────────────────────────

  it('should detect CI environment when isCI() returns true', async () => {
    vi.mocked(isCI).mockReturnValue(true)
    const dir = createProject()
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.isCI).toBe(true)
  })

  // ── 11. Non-CI environment ─────────────────────────────────────────────

  it('should detect non-CI environment when isCI() returns false', async () => {
    vi.mocked(isCI).mockReturnValue(false)
    const dir = createProject()
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.isCI).toBe(false)
  })

  // ── 12. Node version detection ─────────────────────────────────────────

  it('should report the correct Node.js major version', async () => {
    vi.mocked(getNodeVersion).mockReturnValue(18)
    const dir = createProject()
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.nodeVersion).toBe(18)
  })

  // ── 13. dryRun flag passthrough ────────────────────────────────────────

  it('should set dryRun=true when the dryRun flag is passed', async () => {
    const dir = createProject()
    mockConsumerRoot = dir

    const ctx = await discover({ dryRun: true })

    expect(ctx.dryRun).toBe(true)
  })

  it('should set dryRun=false by default', async () => {
    const dir = createProject()
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.dryRun).toBe(false)
  })

  // ── 14. Complex prepare with `||` ──────────────────────────────────────

  it('should classify a prepare script containing || as complex', async () => {
    const dir = createProject({
      packageJson: { scripts: { prepare: 'cmd1 || cmd2' } },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.prepareIsSimple).toBe(false)
  })

  // ── 15. Complex prepare with `;` ───────────────────────────────────────

  it('should classify a prepare script containing ; as complex', async () => {
    const dir = createProject({
      packageJson: { scripts: { prepare: 'cmd1; cmd2' } },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.prepareIsSimple).toBe(false)
  })

  // ── 16. No git repository ──────────────────────────────────────────────

  it('should set hasGit=false when no .git/ directory exists', async () => {
    const dir = createProject({ git: false })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.hasGit).toBe(false)
  })

  // ── 17. Both hooks detected ────────────────────────────────────────────

  it('should detect both pre-commit and post-merge hooks', async () => {
    const dir = createProject({
      huskyDir: true,
      hooks: {
        'pre-commit': `${HOOK_MARKER}\n\necho "pre"\n`,
        'post-merge': `${HOOK_MARKER}\n#!/bin/sh\necho "post"\n`,
      },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.existingHooks['pre-commit'].exists).toBe(true)
    expect(ctx.existingHooks['post-merge'].exists).toBe(true)
    expect(ctx.existingHooks['post-merge'].isManaged).toBe(true)
  })

  // ── 18. Empty prepare string ───────────────────────────────────────────

  it('should treat an empty string prepare script as null', async () => {
    const dir = createProject({
      packageJson: { scripts: { prepare: '' } },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.existingPrepare).toBeNull()
  })

  // ── 19. Consumer package JSON content ──────────────────────────────────

  it('should correctly parse consumer package.json content', async () => {
    const pkg = { name: 'test-pkg', version: '1.0.0', scripts: { test: 'vitest' } }
    const dir = createProject({ packageJson: pkg })
    mockConsumerRoot = dir

    const ctx = await discover()

    expect(ctx.hasPackageJson).toBe(true)
    expect(ctx.consumerPackageJson).toEqual(pkg)
  })

  // ── 20. Post-merge hook content ────────────────────────────────────────

  it('should correctly detect post-merge hook content and managed flag', async () => {
    const content = `${HOOK_MARKER}\n#!/bin/sh\necho "custom post-merge"\n`
    const dir = createProject({
      huskyDir: true,
      hooks: { 'post-merge': content },
    })
    mockConsumerRoot = dir

    const ctx = await discover()

    const h = ctx.existingHooks['post-merge']
    expect(h.exists).toBe(true)
    expect(h.content).toBe(content)
    expect(h.isManaged).toBe(true)
  })
})
