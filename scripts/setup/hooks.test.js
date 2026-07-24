// ═════════════════════════════════════════════════════════════════════════════
// hooks.test.js — Unit tests for the hook installation module
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests the 6-case merge algorithm implemented in hooks.js using real temp
// directories.  No mocks on fs — we create and inspect real files.
//
// Covered scenarios (≥10, per plan T15):
//   1. Case A  — No .husky/ dir                    → created
//   2. Case B  — .husky/ exists, no hook file       → created
//   3. Case C  — Managed hook present               → overwritten
//   4. Case D  — Unmanaged hook + --force           → overwritten (+ .bak)
//   5. Case E  — Unmanaged hook, no --force          → merged
//   6. Case F  — dryRun=true                        → dry-run, no writes
//   7. Partial failure                              → mixed results
//   8. .husky is a file (not a dir)                 → skipped
//   9. Executable permission (chmod)                → 0o755
//  10. Empty .husky/ dir                            → works (Case B)
//  11. flags.force alternative                      → overwritten
//  12. Partial existingHooks map                   → graceful
//  13. Result structure validation                  → all fields present
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  statSync,
  existsSync,
  rmSync,
  realpathSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { installHooks } from './hooks.js'
import { HOOK_MARKER, HOOK_MERGE_SEPARATOR, TEMPLATE_HOOKS } from './constants.js'

// ── Test helpers ──────────────────────────────────────────────────────────

const tempDirs = new Set()

/**
 * Creates and registers a temporary directory for a single test case.
 * The directory is automatically cleaned up in `afterEach`.
 *
 * @returns {string} Absolute path to the new temp directory.
 */
function createTempDir() {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'hooks-test-'))
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
 * Replicates the internal `buildHookContent()` logic so we can assert on
 * expected file content without exporting a private function.
 *
 * @param {string} hookName - Key from `TEMPLATE_HOOKS` ('pre-commit' | 'post-merge')
 * @returns {string} The full hook file content as written by hooks.js.
 */
function expectedContent(hookName) {
  const raw = TEMPLATE_HOOKS[hookName].content
  return HOOK_MARKER + '\n' + raw
}

/**
 * Builds a context object suitable for `installHooks()`.
 *
 * Always uses a fresh temp directory as `consumerRoot` unless an explicit
 * `consumerRoot` is passed in `overrides`.
 *
 * @param {object} [overrides] - Partial context properties to override.
 * @returns {object} Context object.
 */
function makeContext(overrides = {}) {
  const dir = overrides.consumerRoot || createTempDir()
  return {
    consumerRoot: dir,
    hasHuskyDir: false,
    dryRun: false,
    force: false,
    existingHooks: { /* empty by default */ },
    flags: {},
    ...overrides,
    consumerRoot: dir, // enforce temp dir regardless of overrides
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('installHooks', () => {
  afterEach(() => {
    cleanupTempDirs()
  })

  // ── 1. Case A: No .husky/ directory ───────────────────────────────────

  it('Case A: no .husky/ dir → creates dir + hook files, returns action="created"', async () => {
    const ctx = makeContext({ hasHuskyDir: false })

    const results = await installHooks(ctx)

    // .husky/ directory was created
    const huskyDir = join(ctx.consumerRoot, '.husky')
    expect(existsSync(huskyDir)).toBe(true)
    expect(statSync(huskyDir).isDirectory()).toBe(true)

    // Every template hook file is present with correct content and permissions
    for (const hookName of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, hookName)
      expect(existsSync(fp)).toBe(true)
      expect(readFileSync(fp, 'utf-8')).toBe(expectedContent(hookName))
      expect(statSync(fp).mode & 0o111).not.toBe(0)
    }

    // Results match the expected count and action
    expect(results).toHaveLength(Object.keys(TEMPLATE_HOOKS).length)
    for (const r of results) {
      expect(r.action).toBe('created')
    }
  })

  // ── 2. Case B: .husky/ exists, no existing hook file ──────────────────

  it('Case B: .husky/ exists, no existing hook → creates hook file, returns action="created"', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      existingHooks: {
        'pre-commit': { exists: false, isManaged: false },
        'post-merge': { exists: false, isManaged: false },
      },
    })
    mkdirSync(join(ctx.consumerRoot, '.husky'))

    const results = await installHooks(ctx)

    const huskyDir = join(ctx.consumerRoot, '.husky')
    for (const hookName of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, hookName)
      expect(existsSync(fp)).toBe(true)
      expect(readFileSync(fp, 'utf-8')).toBe(expectedContent(hookName))
      expect(statSync(fp).mode & 0o111).not.toBe(0)
    }

    for (const r of results) {
      expect(r.action).toBe('created')
    }
  })

  // ── 3. Case C: Managed hook present → idempotent overwrite ────────────

  it('Case C: .husky/ exists, managed hook present → overwrites, returns action="overwritten"', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: true },
        'post-merge': { exists: true, isManaged: true },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      writeFileSync(join(huskyDir, name), '# old content\n')
    }

    const results = await installHooks(ctx)

    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, name)
      // Content was updated
      expect(readFileSync(fp, 'utf-8')).toBe(expectedContent(name))
      // Executable
      expect(statSync(fp).mode & 0o111).not.toBe(0)
      // No .bak created (idempotent overwrite)
      expect(existsSync(fp + '.bak')).toBe(false)
    }

    for (const r of results) {
      expect(r.action).toBe('overwritten')
    }
  })

  // ── 4. Case D: Unmanaged + --force → backup + overwrite ───────────────

  it('Case D: .husky/ exists, unmanaged hook, --force → backups to .bak, overwrites', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      force: true,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: false },
        'post-merge': { exists: true, isManaged: false },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      writeFileSync(join(huskyDir, name), `# ${name} original\n`)
    }

    const results = await installHooks(ctx)

    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, name)

      // .bak exists with original content
      expect(existsSync(fp + '.bak')).toBe(true)
      expect(readFileSync(fp + '.bak', 'utf-8')).toBe(`# ${name} original\n`)

      // Hook file has new content + executable
      expect(readFileSync(fp, 'utf-8')).toBe(expectedContent(name))
      expect(statSync(fp).mode & 0o111).not.toBe(0)
    }

    for (const r of results) {
      expect(r.action).toBe('overwritten')
      expect(r.message).toContain('.bak')
    }
  })

  // ── 5. Case E: Unmanaged, no --force → append ─────────────────────────

  it('Case E: .husky/ exists, unmanaged hook, no --force → appends separator+content', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      force: false,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: false },
        'post-merge': { exists: true, isManaged: false },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      writeFileSync(join(huskyDir, name), `# ${name} original\n`)
    }

    const results = await installHooks(ctx)

    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, name)
      const content = readFileSync(fp, 'utf-8')

      // Original content preserved
      expect(content).toContain(`# ${name} original`)
      // Separator inserted between original and new content
      expect(content).toContain(HOOK_MERGE_SEPARATOR)
      // New content appended
      expect(content).toContain(expectedContent(name))
      // File is executable
      expect(statSync(fp).mode & 0o111).not.toBe(0)
      // No .bak in merge mode
      expect(existsSync(fp + '.bak')).toBe(false)
    }

    for (const r of results) {
      expect(r.action).toBe('merged')
    }
  })

  // ── 6. Case F: dry-run ────────────────────────────────────────────────

  it('Case F: dryRun=true → returns action="dry-run", no files written', async () => {
    const ctx = makeContext({
      hasHuskyDir: false,
      dryRun: true,
    })

    const results = await installHooks(ctx)

    // No files or directories were created
    expect(existsSync(join(ctx.consumerRoot, '.husky'))).toBe(false)

    for (const r of results) {
      expect(r.action).toBe('dry-run')
    }
  })

  // ── 7. Partial failure: one hook succeeds, the other fails ────────────

  it('partial failure: one hook succeeds, other fails → mixed results, errors do not block', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: true },
        'post-merge': { exists: true, isManaged: true },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)

    // Make post-merge a directory → writeFileSync fails (EISDIR)
    mkdirSync(join(huskyDir, 'post-merge'), { recursive: true })
    writeFileSync(join(huskyDir, 'pre-commit'), '# old\n')

    const results = await installHooks(ctx)

    expect(results).toHaveLength(Object.keys(TEMPLATE_HOOKS).length)

    const preCommitResult = results.find((r) => r.hook === 'pre-commit')
    const postMergeResult = results.find((r) => r.hook === 'post-merge')

    expect(preCommitResult.action).toBe('overwritten')
    expect(postMergeResult.action).toBe('skipped')

    // Successful hook's file was updated
    expect(readFileSync(join(huskyDir, 'pre-commit'), 'utf-8')).toBe(
      expectedContent('pre-commit'),
    )
  })

  // ── 8. .husky is a file, not a directory ──────────────────────────────

  it('.husky is a file, not a directory → graceful error, returns action="skipped"', async () => {
    const ctx = makeContext({
      hasHuskyDir: false,
      existingHooks: {},
    })

    // Create .husky as a regular file — ensureDir will fail
    writeFileSync(join(ctx.consumerRoot, '.husky'), '# i am a file\n', 'utf-8')

    const results = await installHooks(ctx)

    for (const r of results) {
      expect(r.action).toBe('skipped')
    }

    // The .husky "file" is still a file
    expect(statSync(join(ctx.consumerRoot, '.husky')).isFile()).toBe(true)
  })

  // ── 9. Executable permission check ────────────────────────────────────

  it('created hook files are made executable (chmod 755)', async () => {
    const ctx = makeContext({ hasHuskyDir: false })
    await installHooks(ctx)

    const huskyDir = join(ctx.consumerRoot, '.husky')
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, name)
      const mode = statSync(fp).mode

      // Owner execute (0o100)
      expect(mode & 0o100).not.toBe(0)
      // Group execute (0o010)
      expect(mode & 0o010).not.toBe(0)
      // Other execute (0o001)
      expect(mode & 0o001).not.toBe(0)
    }
  })

  // ── 10. Empty .husky/ dir → works correctly (Case B) ──────────────────

  it('empty .husky/ dir (no files at all) → works correctly', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      existingHooks: {
        'pre-commit': { exists: false, isManaged: false },
        'post-merge': { exists: false, isManaged: false },
      },
    })
    mkdirSync(join(ctx.consumerRoot, '.husky'))

    const results = await installHooks(ctx)

    const huskyDir = join(ctx.consumerRoot, '.husky')
    for (const name of Object.keys(TEMPLATE_HOOKS)) {
      const fp = join(huskyDir, name)
      expect(existsSync(fp)).toBe(true)
      expect(readFileSync(fp, 'utf-8')).toBe(expectedContent(name))
      expect(statSync(fp).mode & 0o111).not.toBe(0)
    }

    for (const r of results) {
      expect(r.action).toBe('created')
    }
  })

  // ── 11. flags.force alternative path ───────────────────────────────────

  it('flags.force is respected as alternative to direct context.force', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      force: false,            // context-level force is false
      flags: { force: true },  // but flags object has force=true
      existingHooks: {
        'pre-commit': { exists: true, isManaged: false },
        'post-merge': { exists: true, isManaged: false },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    writeFileSync(join(huskyDir, 'pre-commit'), '# orig\n')
    writeFileSync(join(huskyDir, 'post-merge'), '# orig\n')

    const results = await installHooks(ctx)

    for (const r of results) {
      expect(r.action).toBe('overwritten')
    }
    expect(existsSync(join(huskyDir, 'pre-commit.bak'))).toBe(true)
    expect(existsSync(join(huskyDir, 'post-merge.bak'))).toBe(true)
  })

  // ── 12. Partial existingHooks map ─────────────────────────────────────

  it('handles partial existingHooks (one hook missing from map)', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: true },
        // post-merge absent → treated as exists=false, isManaged=false
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    writeFileSync(join(huskyDir, 'pre-commit'), '# old\n')

    const results = await installHooks(ctx)

    const preCommitResult = results.find((r) => r.hook === 'pre-commit')
    const postMergeResult = results.find((r) => r.hook === 'post-merge')

    expect(preCommitResult.action).toBe('overwritten')
    expect(postMergeResult.action).toBe('created')

    // Post-merge was created from scratch
    expect(existsSync(join(huskyDir, 'post-merge'))).toBe(true)
  })

  // ── 13. Result structure validation ───────────────────────────────────

  it('each result entry has hook, action, and message fields with correct types', async () => {
    const ctx = makeContext({ hasHuskyDir: false })
    const results = await installHooks(ctx)

    for (const r of results) {
      expect(r).toHaveProperty('hook')
      expect(r).toHaveProperty('action')
      expect(r).toHaveProperty('message')
      expect(typeof r.hook).toBe('string')
      expect(typeof r.action).toBe('string')
      expect(typeof r.message).toBe('string')
    }

    // All expected hook names are present
    const hookNames = results.map((r) => r.hook).sort()
    expect(hookNames).toEqual(Object.keys(TEMPLATE_HOOKS).sort())
  })

  // ── 14. Dry-run with existing unmanaged hooks + force ─────────────────

  it('dry-run with existing unmanaged hooks + force flag → no .bak files created', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      dryRun: true,
      force: true,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: false },
        'post-merge': { exists: true, isManaged: false },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    writeFileSync(join(huskyDir, 'pre-commit'), '# original\n')
    writeFileSync(join(huskyDir, 'post-merge'), '# original\n')

    const results = await installHooks(ctx)

    // Files are completely unchanged
    expect(readFileSync(join(huskyDir, 'pre-commit'), 'utf-8')).toBe('# original\n')
    expect(readFileSync(join(huskyDir, 'post-merge'), 'utf-8')).toBe('# original\n')
    // No .bak files created
    expect(existsSync(join(huskyDir, 'pre-commit.bak'))).toBe(false)
    expect(existsSync(join(huskyDir, 'post-merge.bak'))).toBe(false)

    for (const r of results) {
      expect(r.action).toBe('dry-run')
    }
  })

  // ── 15. Idempotent overwrite does NOT create .bak ─────────────────────

  it('no .bak file created for idempotent overwrite (Case C, isManaged=true)', async () => {
    const ctx = makeContext({
      hasHuskyDir: true,
      existingHooks: {
        'pre-commit': { exists: true, isManaged: true },
        'post-merge': { exists: true, isManaged: true },
      },
    })
    const huskyDir = join(ctx.consumerRoot, '.husky')
    mkdirSync(huskyDir)
    writeFileSync(join(huskyDir, 'pre-commit'), '# managed content\n')
    writeFileSync(join(huskyDir, 'post-merge'), '# managed content\n')

    await installHooks(ctx)

    expect(existsSync(join(huskyDir, 'pre-commit.bak'))).toBe(false)
    expect(existsSync(join(huskyDir, 'post-merge.bak'))).toBe(false)
  })

  // ── 16. Result messages contain hook name and description ─────────────

  it('result messages contain the hook name for traceability', async () => {
    const ctx = makeContext({ hasHuskyDir: false })
    const results = await installHooks(ctx)

    for (const r of results) {
      expect(r.message).toContain(r.hook)
    }
  })
})
