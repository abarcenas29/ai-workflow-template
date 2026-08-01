// ═════════════════════════════════════════════════════════════════════════════
// index.test.js — Unit tests for the setup orchestrator (main function)
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests the arg parsing, phase ordering, flag-based skipping, exit code
// determination, error handling, and UI interactions.
//
// All external modules (discover, hooks, prepare, husky-init, sync-phase,
// utils, ui) are mocked so tests don't touch the real filesystem or spawn
// real child processes.
//
// Covered scenarios (≥10, per plan T17 + task description):
//   1.  --help flag                          → prints help, exits 0
//   2.  -h short flag                        → same as --help
//   3.  --version flag                       → prints version, exits 0
//   4.  -v short flag                        → same as --version
//   5.  --dry-run flag                       → all phases run in dry-run mode
//   6.  --skip-hooks flag                    → hooks + husky-init skipped
//   7.  --skip-sync flag                     → sync phase skipped
//   8.  --skip-prepare flag                  → prepare phase skipped
//   9.  Unknown/unsupported flag             → handled gracefully, pipeline runs
//  10.  Full pipeline (default flags)        → all 5 phases called, exit 0
//  11.  Discovery failure                    → fatal, exit 2
//  12.  Phase failure (hooks)                → continues, exit 2
//  13.  Warning aggregation (no git)         → exit 1
//  14.  CI mode detection                    → ciModeBanner shown
//  15.  Quiet mode                           → no header/summary
//  16.  Multiple skips combined              → skip-hooks + skip-prepare + skip-sync
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ═════════════════════════════════════════════════════════════════════════════
// Module mocks — all external dependencies are fully mocked so tests are
// isolated and fast.  Each mock factory returns vi.fn() for every exported
// function that the orchestrator imports.
// ═════════════════════════════════════════════════════════════════════════════

vi.mock('./utils.js', () => ({
  parseCliArgs: vi.fn(),
  resolvePackageRoot: vi.fn(),
}))

vi.mock('./ui.js', () => ({
  ciModeBanner: vi.fn(),
  header: vi.fn(),
  help: vi.fn(),
  section: vi.fn(),
  stepError: vi.fn(),
  stepSuccess: vi.fn(),
  stepWarn: vi.fn(),
  summary: vi.fn(),
}))

vi.mock('./discover.js', () => ({
  discover: vi.fn(),
}))

vi.mock('./hooks.js', () => ({
  installHooks: vi.fn(),
}))

vi.mock('./prepare.js', () => ({
  handlePrepare: vi.fn(),
}))

vi.mock('./husky-init.js', () => ({
  initHusky: vi.fn(),
}))

vi.mock('./sync-phase.js', () => ({
  runSyncPhase: vi.fn(),
}))

vi.mock('./knowledgebase.js', () => ({
  registerKnowledgebase: vi.fn(),
}))

// ═════════════════════════════════════════════════════════════════════════════
// Imports — these resolve to the mocked modules above
// ═════════════════════════════════════════════════════════════════════════════

import { main } from './index.js'
import { parseCliArgs, resolvePackageRoot } from './utils.js'
import {
  ciModeBanner,
  header,
  help,
  section,
  stepError,
  stepSuccess,
  stepWarn,
  summary,
} from './ui.js'
import { discover } from './discover.js'
import { installHooks } from './hooks.js'
import { handlePrepare } from './prepare.js'
import { initHusky } from './husky-init.js'
import { runSyncPhase } from './sync-phase.js'
import { registerKnowledgebase } from './knowledgebase.js'
import { EXIT_CODES } from './constants.js'

// ═════════════════════════════════════════════════════════════════════════════
// Test fixtures
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Default flags object — every property is `false` so the full pipeline runs.
 * Individual tests override the specific flag they're testing.
 */
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

/**
 * Default context object returned by the mocked `discover()`.  Represents a
 * standard git-enabled consumer project with no existing hooks.
 */
const defaultContext = {
  consumerRoot: '/tmp/test-consumer',
  hasGit: true,
  hasHuskyDir: false,
  hasPackageJson: true,
  consumerPackageJson: { name: 'test-consumer' },
  existingHooks: {
    'pre-commit': { exists: false, content: null, isManaged: false },
    'post-merge': { exists: false, content: null, isManaged: false },
  },
  existingPrepare: null,
  prepareIsSimple: false,
  isCI: false,
  nodeVersion: 20,
  dryRun: false,
  verbose: false,
}

/**
 * Default successful results from each phase module.
 */
const defaultHookResults = [
  {
    hook: 'pre-commit',
    action: 'created',
    message: 'pre-commit hook created',
  },
  {
    hook: 'post-merge',
    action: 'created',
    message: 'post-merge hook created',
  },
]

const defaultPrepareResult = {
  action: 'added',
  message: 'Added "prepare": "husky" to package.json',
}

const defaultHuskyResult = {
  action: 'initialized',
  message: 'Husky initialized successfully',
}

const defaultSyncResult = {
  action: 'completed',
  message: 'Sync phase completed',
  results: [
    { script: 'sync.js', success: true, exitCode: 0, output: '' },
    { script: 'normalize-memory.js', success: true, exitCode: 0, output: '' },
  ],
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('main() — setup orchestrator', () => {
  let logSpy

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    parseCliArgs.mockReturnValue({ ...defaultFlags })
    discover.mockResolvedValue({ ...defaultContext })
    installHooks.mockResolvedValue(defaultHookResults)
    handlePrepare.mockResolvedValue(defaultPrepareResult)
    initHusky.mockResolvedValue(defaultHuskyResult)
    runSyncPhase.mockResolvedValue(defaultSyncResult)
    registerKnowledgebase.mockResolvedValue({
      action: 'indexed',
      message: 'Registered "test-consumer" — 5 chunks indexed, 0 skipped',
      chunks_indexed: 5,
      chunks_skipped: 0,
    })

    // Spy on console.log for --version tests
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy?.mockRestore()
  })

  // ── 1. --help flag ───────────────────────────────────────────────────────

  it('--help: prints help text and exits with code 0', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, help: true })

    const code = await main(['--help'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(help).toHaveBeenCalledTimes(1)
    // Early exit means no pipeline phases run
    expect(discover).not.toHaveBeenCalled()
    expect(installHooks).not.toHaveBeenCalled()
    expect(handlePrepare).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    expect(runSyncPhase).not.toHaveBeenCalled()
    expect(registerKnowledgebase).not.toHaveBeenCalled()
    // No header or summary for early-exit flags
    expect(header).not.toHaveBeenCalled()
    expect(summary).not.toHaveBeenCalled()
  })

  // ── 2. -h short flag ─────────────────────────────────────────────────────

  it('-h: short help flag prints help text and exits with code 0', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, help: true })

    const code = await main(['-h'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(help).toHaveBeenCalledTimes(1)
    expect(discover).not.toHaveBeenCalled()
    expect(installHooks).not.toHaveBeenCalled()
    expect(header).not.toHaveBeenCalled()
    expect(registerKnowledgebase).not.toHaveBeenCalled()
  })

  // ── 3. --version flag ────────────────────────────────────────────────────

  it('--version: prints version string and exits with code 0', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, version: true })

    const code = await main(['--version'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(logSpy).toHaveBeenCalled()
    expect(logSpy.mock.calls[0][0]).toEqual(expect.any(String))
    // Early exit means no pipeline phases run
    expect(discover).not.toHaveBeenCalled()
    expect(help).not.toHaveBeenCalled()
    expect(registerKnowledgebase).not.toHaveBeenCalled()
  })

  // ── 4. -v short flag ─────────────────────────────────────────────────────

  it('-v: short version flag prints version string and exits with code 0', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, version: true })

    const code = await main(['-v'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(logSpy).toHaveBeenCalled()
    expect(logSpy.mock.calls[0][0]).toEqual(expect.any(String))
    expect(discover).not.toHaveBeenCalled()
    expect(registerKnowledgebase).not.toHaveBeenCalled()
  })

  // ── 5. --dry-run flag ────────────────────────────────────────────────────

  it('--dry-run: all phases run in dry-run mode, exits 0', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, dryRun: true })
    const ctx = { ...defaultContext, dryRun: true }
    discover.mockResolvedValue(ctx)
    // Phase mocks return dry-run results
    installHooks.mockResolvedValue([
      { hook: 'pre-commit', action: 'dry-run', message: 'Would create pre-commit' },
      { hook: 'post-merge', action: 'dry-run', message: 'Would create post-merge' },
    ])
    handlePrepare.mockResolvedValue({ action: 'dry-run', message: 'Would add husky' })
    initHusky.mockResolvedValue({ action: 'dry-run', message: 'Would initialize husky' })
    runSyncPhase.mockResolvedValue({ action: 'dry-run', message: 'Would run sync scripts' })

    const code = await main(['--dry-run'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    // Verify parseCliArgs received the actual argv
    expect(parseCliArgs).toHaveBeenCalledWith(['--dry-run'])
    // Verify all phases were called
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
    // Header and summary shown (not quiet)
    expect(header).toHaveBeenCalledTimes(1)
    expect(summary).toHaveBeenCalledTimes(1)
  })

  // ── 6. --skip-hooks flag ─────────────────────────────────────────────────

  it('--skip-hooks: hooks and husky-init phases are skipped', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, skipHooks: true })

    const code = await main(['--skip-hooks'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    // Hooks and husky-init should NOT be called
    expect(installHooks).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    // But other phases still run
    expect(discover).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 7. --skip-sync flag ──────────────────────────────────────────────────

  it('--skip-sync: sync phase is skipped', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, skipSync: true })

    const code = await main(['--skip-sync'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(runSyncPhase).not.toHaveBeenCalled()
    // All other phases still run
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 8. --skip-prepare flag ───────────────────────────────────────────────

  it('--skip-prepare: prepare phase is skipped', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, skipPrepare: true })

    const code = await main(['--skip-prepare'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(handlePrepare).not.toHaveBeenCalled()
    // All other phases still run
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 9. Unknown flag ──────────────────────────────────────────────────────

  it('unknown flag: handled gracefully, full pipeline runs with defaults', async () => {
    // parseCliArgs silently ignores unknown flags and returns all-defaults
    parseCliArgs.mockReturnValue({ ...defaultFlags })

    const code = await main(['--bogus-flag'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    // Full pipeline runs as if no flags were passed
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(header).toHaveBeenCalledTimes(1)
    expect(summary).toHaveBeenCalledTimes(1)
  })

  // ── 10. Full pipeline (default flags) ────────────────────────────────────

  it('full pipeline: all 6 phases called in order, exits 0', async () => {
    const code = await main([])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    // All phases called exactly once
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
    // Header displayed
    expect(header).toHaveBeenCalledTimes(1)
    // Summary displayed
    expect(summary).toHaveBeenCalledTimes(1)
    // Section headers called for each phase
    expect(section).toHaveBeenCalled()
    // stepSuccess called for discovery (hasGit = true)
    expect(stepSuccess).toHaveBeenCalled()
  })

  // ── 11. Discovery failure ────────────────────────────────────────────────

  it('discovery failure: fatal error, exits with FATAL (2)', async () => {
    discover.mockRejectedValue(new Error('Git not found'))

    const code = await main([])

    expect(code).toBe(EXIT_CODES.FATAL)
    expect(stepError).toHaveBeenCalledWith(
      expect.stringContaining('Git not found'),
    )
    // No subsequent phases should run
    expect(installHooks).not.toHaveBeenCalled()
    expect(handlePrepare).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    expect(runSyncPhase).not.toHaveBeenCalled()
    expect(registerKnowledgebase).not.toHaveBeenCalled()
    // Summary is shown even on fatal (not quiet mode)
    expect(summary).toHaveBeenCalledTimes(1)
  })

  // ── 12. Phase failure (hooks) → continues, but exits 2 ──────────────────

  it('phase failure: hooks phase fails, other phases continue, exits FATAL (2)', async () => {
    installHooks.mockRejectedValue(new Error('Permission denied'))

    const code = await main([])

    expect(code).toBe(EXIT_CODES.FATAL)
    // Error logged for hooks
    expect(stepError).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied'),
    )
    // Other phases still run
    expect(discover).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
    // Summary is shown
    expect(summary).toHaveBeenCalledTimes(1)
  })

  // ── 13. Non-git repo → hooks skipped, exit 1 ────────────────────────────

  it('no git repository: hooks and husky-init skipped with warnings, exits WARNINGS (1)', async () => {
    discover.mockResolvedValue({
      ...defaultContext,
      hasGit: false,
      hasHuskyDir: false,
      consumerRoot: '/tmp/non-git-project',
    })

    const code = await main([])

    expect(code).toBe(EXIT_CODES.WARNINGS)
    // Hooks and husky-init were NOT called
    expect(installHooks).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    // stepWarn was called for the git-related skip messages
    expect(stepWarn).toHaveBeenCalled()
    // Other phases still run
    expect(discover).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
    // Summary shown
    expect(summary).toHaveBeenCalledTimes(1)
  })

  // ── 14. CI mode detection ────────────────────────────────────────────────

  it('CI mode: ciModeBanner shown when context.isCI is true', async () => {
    discover.mockResolvedValue({
      ...defaultContext,
      isCI: true,
    })

    const code = await main([])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(ciModeBanner).toHaveBeenCalledTimes(1)
    // CI mode doesn't skip phases (that's done by --skip-hooks)
    expect(discover).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  it('CI mode: ciModeBanner NOT shown in quiet mode even when isCI is true', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, quiet: true })
    discover.mockResolvedValue({
      ...defaultContext,
      isCI: true,
    })

    const code = await main(['--quiet'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(ciModeBanner).not.toHaveBeenCalled()
    expect(header).not.toHaveBeenCalled()
    expect(summary).not.toHaveBeenCalled()
  })

  // ── 15. Quiet mode ──────────────────────────────────────────────────────

  it('--quiet: header and summary are suppressed, phases still run', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, quiet: true })

    const code = await main(['--quiet'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(header).not.toHaveBeenCalled()
    expect(summary).not.toHaveBeenCalled()
    // All phases still execute
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 16. Multiple skips combined ─────────────────────────────────────────

  it('--skip-hooks --skip-prepare --skip-sync: only discovery runs', async () => {
    parseCliArgs.mockReturnValue({
      ...defaultFlags,
      skipHooks: true,
      skipPrepare: true,
      skipSync: true,
    })

    const code = await main([
      '--skip-hooks',
      '--skip-prepare',
      '--skip-sync',
    ])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).not.toHaveBeenCalled()
    expect(handlePrepare).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    expect(runSyncPhase).not.toHaveBeenCalled()
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 16b. --knowledgebase flag (T6: run ONLY the knowledgebase phase) ─────

  it('--knowledgebase: runs only discovery + knowledgebase phases, exits 0', async () => {
    parseCliArgs.mockReturnValue({ ...defaultFlags, knowledgebase: true })

    const code = await main(['--knowledgebase'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(parseCliArgs).toHaveBeenCalledWith(['--knowledgebase'])
    // Discovery always runs
    expect(discover).toHaveBeenCalledTimes(1)
    // All other phases are skipped by the --knowledgebase shortcut
    expect(installHooks).not.toHaveBeenCalled()
    expect(handlePrepare).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    expect(runSyncPhase).not.toHaveBeenCalled()
    // Knowledgebase phase runs
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
    // Header and summary shown (not quiet)
    expect(header).toHaveBeenCalledTimes(1)
    expect(summary).toHaveBeenCalledTimes(1)
  })

  it('--knowledgebase: still runs knowledgebase phase when skipKnowledgebase was also passed', async () => {
    // --knowledgebase forces skipKnowledgebase back to false so the phase runs
    parseCliArgs.mockReturnValue({
      ...defaultFlags,
      knowledgebase: true,
      skipKnowledgebase: true,
    })

    const code = await main(['--knowledgebase', '--skip-knowledgebase'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).not.toHaveBeenCalled()
    expect(handlePrepare).not.toHaveBeenCalled()
    expect(initHusky).not.toHaveBeenCalled()
    expect(runSyncPhase).not.toHaveBeenCalled()
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 17. Verify parseCliArgs receives the argv ───────────────────────────

  it('passes argv array to parseCliArgs unchanged', async () => {
    const argv = ['--force', '--dry-run', '--verbose']
    parseCliArgs.mockReturnValue({
      ...defaultFlags,
      force: true,
      dryRun: true,
      verbose: true,
    })

    await main(argv)

    expect(parseCliArgs).toHaveBeenCalledWith(argv)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 18. Discovery context is passed to each phase ───────────────────────

  it('passes the discovery context object to each phase function', async () => {
    const ctx = {
      ...defaultContext,
      consumerRoot: '/tmp/custom-path',
      hasGit: true,
      dryRun: false,
    }
    discover.mockResolvedValue(ctx)

    await main([])

    // Each phase receives the context (or extended version)
    expect(installHooks).toHaveBeenCalledWith(ctx)
    expect(handlePrepare).toHaveBeenCalledWith(ctx)
    expect(initHusky).toHaveBeenCalledWith(ctx)
    expect(runSyncPhase).toHaveBeenCalledWith(ctx)
    expect(registerKnowledgebase).toHaveBeenCalledWith(ctx)
  })

  // ── 19a. --verbose flag passthrough to Context ──────────────────────────

  it('--verbose: passes verbose flag through to Context', async () => {
    const flags = { ...defaultFlags, verbose: true }
    parseCliArgs.mockReturnValue(flags)
    const ctx = { ...defaultContext, verbose: true }
    discover.mockResolvedValue(ctx)

    await main(['--verbose'])

    // parseCliArgs was called with the expected argv
    expect(parseCliArgs).toHaveBeenCalledWith(['--verbose'])
    // discover received the flags with verbose: true
    expect(discover).toHaveBeenCalledWith(flags)
    // Every phase receives the context with verbose: true preserved
    expect(installHooks).toHaveBeenCalledWith(ctx)
    expect(handlePrepare).toHaveBeenCalledWith(ctx)
    expect(initHusky).toHaveBeenCalledWith(ctx)
    expect(runSyncPhase).toHaveBeenCalledWith(ctx)
    expect(registerKnowledgebase).toHaveBeenCalledWith(ctx)
    // Normal pipeline — header and summary shown
    expect(header).toHaveBeenCalledTimes(1)
    expect(summary).toHaveBeenCalledTimes(1)
  })

  // ── 20. Flags object passed to discover ─────────────────────────────────

  it('passes the flags object to discover()', async () => {
    const flags = { ...defaultFlags, dryRun: true }
    parseCliArgs.mockReturnValue(flags)

    await main(['--dry-run'])

    expect(discover).toHaveBeenCalledWith(flags)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 20. Verify --help takes priority over --version ─────────────────────

  it('--help takes priority over --version when both are set', async () => {
    parseCliArgs.mockReturnValue({
      ...defaultFlags,
      help: true,
      version: true,
    })

    const code = await main(['--help', '--version'])

    expect(code).toBe(EXIT_CODES.SUCCESS)
    expect(help).toHaveBeenCalledTimes(1)
    expect(logSpy).not.toHaveBeenCalled() // console.log NOT called for version
    expect(discover).not.toHaveBeenCalled()
    expect(registerKnowledgebase).not.toHaveBeenCalled()
  })

  // ── 21. Error in prepare phase → continues ──────────────────────────────

  it('prepare phase failure: error logged, other phases continue, exits FATAL (2)', async () => {
    handlePrepare.mockRejectedValue(new Error('Write failed'))

    const code = await main([])

    expect(code).toBe(EXIT_CODES.FATAL)
    expect(stepError).toHaveBeenCalledWith(
      expect.stringContaining('Write failed'),
    )
    // Other phases still ran
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 22. Error in husky-init → continues ────────────────────────────────

  it('husky-init phase failure: error logged, other phases continue, exits FATAL (2)', async () => {
    initHusky.mockRejectedValue(new Error('Husky v10 not supported'))

    const code = await main([])

    expect(code).toBe(EXIT_CODES.FATAL)
    expect(stepError).toHaveBeenCalledWith(
      expect.stringContaining('Husky v10'),
    )
    // Other phases still ran
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(runSyncPhase).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })

  // ── 23. Error in sync phase → continues ────────────────────────────────

  it('sync phase failure: error logged, other phases continue, exits FATAL (2)', async () => {
    runSyncPhase.mockRejectedValue(new Error('Script crashed'))

    const code = await main([])

    expect(code).toBe(EXIT_CODES.FATAL)
    expect(stepError).toHaveBeenCalledWith(expect.stringContaining('Script crashed'))
    // Other phases still ran
    expect(discover).toHaveBeenCalledTimes(1)
    expect(installHooks).toHaveBeenCalledTimes(1)
    expect(handlePrepare).toHaveBeenCalledTimes(1)
    expect(initHusky).toHaveBeenCalledTimes(1)
    expect(registerKnowledgebase).toHaveBeenCalledTimes(1)
  })
})
