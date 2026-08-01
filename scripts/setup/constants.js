// ═════════════════════════════════════════════════════════════════════════════
// constants.js — Shared constants for the setup command pipeline
// ═════════════════════════════════════════════════════════════════════════════

// ── Package identity ──────────────────────────────────────────────────────────

/** npm package name */
export const PACKAGE_NAME = '@abarcenas/ai-workflow-template'

/** CLI binary name (npm "bin" entry) */
export const BIN_NAME = 'ai-workflow-setup'

// ── Idempotency markers ───────────────────────────────────────────────────────

/**
 * First-line comment injected into every template hook file.
 * Used to detect whether an existing consumer hook was installed by us
 * (idempotency check in hooks.js, CASE C). Must be the first line of
 * each template hook file.
 */
export const HOOK_MARKER = '# Managed by @abarcenas/ai-workflow-template setup'

/**
 * Separator inserted between a consumer's existing hook content and our
 * appended content during hook merging (hooks.js, CASE D).
 */
export const HOOK_MERGE_SEPARATOR = '# --- @abarcenas/ai-workflow-template ---'

// ── Template hook definitions ─────────────────────────────────────────────────

/**
 * Map of hook names → metadata for every git hook the setup command manages.
 *
 * Each entry carries:
 *   `source`      — Relative path from the package root to the template file.
 *                   Resolved at runtime by hooks.js.
 *   `content`     — Exact content that will be written (or appended) to the
 *                   consumer's hook file. This mirrors the actual file on disk.
 *   `description` — Human-readable purpose, shown in output messages.
 */
export const TEMPLATE_HOOKS = {
  'pre-commit': {
    source: '.husky/pre-commit',
    content: [
      '# Managed by @abarcenas/ai-workflow-template setup',
      '#!/bin/sh',
      '',
      'node scripts/bump-version.js',
      'node scripts/validate-memory-schema.js',
      '',
    ].join('\n'),
    description:
      'Auto-bump version + validate memory-bank schema before commits',
  },
  'post-merge': {
    source: '.husky/post-merge',
    content: [
      '# Managed by @abarcenas/ai-workflow-template setup',
      '#!/bin/sh',
      '',
      '# After git pull/merge, check if memory-bank files changed',
      '# and update the vector index incrementally',
      '',
      'if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "^memory-bank\\|^docs/"; then',
      '  echo "[memory-bank] Memory bank files changed. Updating vector index..."',
      '  node scripts/memory-cli.js update 2>/dev/null || echo "[memory-bank] Index update skipped (service not installed)"',
      'fi',
      '',
    ].join('\n'),
    description:
      'Auto-update memory bank vector index after pull/merge',
  },
  'post-commit': {
    source: '.husky/post-commit',
    content: [
      '# Managed by @abarcenas/ai-workflow-template setup',
      '#!/bin/sh',
      '',
      '# After commit, check if learned knowledge file changed',
      '# and sync to the centralized knowledgebase',
      '',
      'CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | grep ".agents/instructions/learned-knowledge.instructions.md")',
      '',
      'if [ -n "$CHANGED" ]; then',
      '  echo "[knowledgebase] Learned knowledge file changed. Syncing to knowledgebase..."',
      '  node scripts/knowledgebase-cli.js sync 2>/dev/null || echo "[knowledgebase] Sync skipped (DATABASE_URL not configured or service unavailable)"',
      'fi',
      '',
    ].join('\n'),
    description:
      'Auto-sync learned knowledge to centralized knowledgebase after commits',
  },
}

// ── CI/CD environment detection ───────────────────────────────────────────────

/**
 * Environment variable names checked to determine if the command is running
 * inside a CI/CD pipeline.
 *
 * When `isCI()` from utils.js returns true, the setup command skips git hook
 * installation entirely (REQ-07) and only performs file sync + memory-bank
 * scaffolding.
 *
 * @note `NODE_ENV` is included here but is evaluated as
 *       `process.env.NODE_ENV === 'production'` (equality check), whereas
 *       all other entries are evaluated as simple truthiness checks.
 */
export const CI_ENV_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'JENKINS_URL',
  'BITBUCKET_BUILD_NUMBER',
  'APPVEYOR',
  'CODEBUILD_BUILD_ID',
  'AZURE_HTTP_USER_AGENT',
  'NODE_ENV',
]

// ── CLI flags ─────────────────────────────────────────────────────────────────

/**
 * Map of CLI argument strings (long and short forms) to their canonical
 * camelCase property names on the flags object.
 *
 * Usage: `parseCliArgs()` in utils.js iterates over argv, looks up each
 * element in this map, and sets the corresponding property to `true` on
 * the returned flags object.
 */
export const SUPPORTED_FLAGS = {
  '--force': 'force',
  '--dry-run': 'dryRun',
  '--yes': 'yes',
  '-y': 'yes',
  '--skip-hooks': 'skipHooks',
  '--skip-prepare': 'skipPrepare',
  '--skip-sync': 'skipSync',
  '--skip-knowledgebase': 'skipKnowledgebase',
  '--knowledgebase': 'knowledgebase',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--quiet': 'quiet',
  '-q': 'quiet',
  '--verbose': 'verbose',
  '-V': 'verbose',
}

// ── Exit codes ────────────────────────────────────────────────────────────────

/**
 * Numeric exit codes returned by the setup command.
 *
 *   SUCCESS  → All phases completed without errors or warnings
 *   WARNINGS → One or more phases had non-fatal warnings (exit code 1)
 *   FATAL    → A required phase encountered an unrecoverable error (exit code 2)
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  WARNINGS: 1,
  FATAL: 2,
}

// ── Required directories ──────────────────────────────────────────────────────

/**
 * Relative paths (from the consumer project root) of directories that the
 * setup command must ensure exist before running its pipeline.
 */
export const REQUIRED_DIRS = [
  '.husky',
  'memory-bank',
]

// ── Output symbols ────────────────────────────────────────────────────────────

/**
 * Unicode characters used as status indicators in the CLI output.
 * Referenced by the ui.js module.
 */
export const UNICODE_CHARS = {
  CHECK: '\u2713',  // ✓
  WARN: '\u26A0',   // ⚠
  CROSS: '\u2717',  // ✗
  BULLET: '\u2022', // •
  ARROW: '\u2192',  // →
}

// ── Memory bank stubs ─────────────────────────────────────────────────────────

/**
 * Template content for scaffolding a fresh memory-bank/ directory.
 * Exact mirror of the `memoryBankStubs` object in `scripts/sync.js`
 * (lines 204–254). Each key is a filename; each value is the file content.
 *
 * Used by the setup command's sync-phase when the consumer project lacks
 * a memory-bank/ directory.
 */
export const MEMORY_BANK_STUBS = {
  'projectbrief.md': `# projectbrief

> Foundation document — defines core requirements and goals.

- **Purpose**: {{describe project purpose}}
- **Goals**: {{list project goals}}
- **Scope**: {{define scope}}
`,
  'productContext.md': `# productContext

> Why this project exists and what problems it solves.

- **Problem**: {{describe the problem}}
- **Solution**: {{describe the solution}}
- **User Experience**: {{describe UX goals}}
`,
  'activeContext.md': `# activeContext

> Current work focus, recent changes, next steps.

- **Current Focus**: {{current task or goal}}
- **Recent Changes**: {{list of recent changes}}
- **Next Steps**: {{next actions}}
`,
  'systemPatterns.md': `# systemPatterns

> Architecture, key decisions, design patterns.

- **Architecture**: {{describe architecture}}
- **Key Decisions**: {{list key technical decisions}}
- **Patterns**: {{list design patterns in use}}
`,
  'techContext.md': `# techContext

> Technologies, setup, constraints, dependencies.

- **Stack**: {{list technologies}}
- **Setup**: {{describe dev setup}}
- **Constraints**: {{list technical constraints}}
`,
  'progress.md': `# progress

> What works, what's left, current status.

- **Working**: {{what's implemented and working}}
- **To Build**: {{what remains}}
- **Status**: {{overall project status}}
- **Known Issues**: {{list known issues}}
`,
  'learned-knowledge.instructions.md': `# Learned Knowledge

Cross-session knowledge accumulated by agent pipelines. Each session records discoveries, patterns, gotchas, and agent tuning notes for future reference.

---

`,
}
