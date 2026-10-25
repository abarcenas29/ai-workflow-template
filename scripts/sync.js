import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const defaultPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const excludedRelativePaths = new Set([
  'instructions/learned-knowledge.instructions.md',
])

// Files the consumer owns outright. Sync never copies, overwrites, or prunes
// them — not even with --force — because local edits are the point, not drift.
// Matching is channel-agnostic: every copy pass compares its own relative path
// against this set, so a root entry such as "opencode.json" also protects
// ".opencode/opencode.json" and ".agents/opencode.json". That over-match is
// intentional and conservative. The original learned-knowledge exclusion is
// spread in so there is one rule, not two parallel checks.
export const projectOwnedPaths = new Set([
  'AGENTS.project.md',
  'opencode.json',
  '.prettierignore',
  // Reserved: sync protects this file from overwrite and prune, but it does
  // NOT read or honour its globs yet. Do not present it as functional.
  '.agents-sync-ignore',
  ...excludedRelativePaths,
])

export function isProjectOwnedPath(relativePath) {
  return projectOwnedPaths.has(relativePath)
}

export const openCodeExcluded = new Set([
  'node_modules',
  'package.json',
  'package-lock.json',
  'bun.lock',
  '.gitignore',
])

// Never add a project-owned file here (AGENTS.project.md, opencode.json,
// .prettierignore): those are scaffolded create-if-absent and must not ship
// from the package. opencode.json is governed solely by projectOwnedPaths.
export const rootFiles = ['AGENTS.md', 'skills-lock.json']

export const scriptsToSync = [
  'memory-cli.js',
  'memory-index.js',
  'bump-version.js',
  'validate-memory-schema.js',
  'vocab-sync.js',
  'mcp-memory-server.js',
  'mcp/playwright-mcp-launcher.js',
  // Knowledgebase scripts
  'knowledgebase-cli.js',
  'knowledgebase-index.js',
  'mcp-knowledgebase-server.js',
  'knowledgebase-init.sql',
]

// The hash-managed paths a consumer's .prettierignore must cover so a format
// pass cannot freeze a sync. Directories carry a trailing slash so a pattern
// can cover their subtree. AGENTS.project.md is deliberately absent: it is
// project-owned, so formatting it cannot freeze a sync.
export const requiredPrettierIgnorePatterns = [
  '.agents/',
  '.opencode/agents/',
  '.opencode/commands/',
  ...rootFiles,
  ...scriptsToSync.map((script) => `scripts/${script}`),
]

const prettierIgnoreWarning =
  '[ai-workflow-template] Existing .prettierignore does not protect managed files; merge the patterns from node_modules/@abarcenas/ai-workflow-template/.prettierignore'

const ignoreAllPatterns = new Set(['', '.', '*', '**', '/'])

function normalizeIgnorePattern(pattern) {
  const trimmed = pattern.trim()
  return trimmed === '/'
    ? '/'
    : trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

// Gitignore lines, preserving negation and treating an inline "# ..." literally.
// Escaped leading "#" or "!" are literals, not comments/negations.
export function parsePrettierIgnoreRules(contents) {
  const rules = []

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    if (line.startsWith('\\#') || line.startsWith('\\!')) {
      rules.push({
        negated: false,
        pattern: normalizeIgnorePattern(line.slice(1)),
      })
      continue
    }

    const negated = line.startsWith('!')
    const pattern = normalizeIgnorePattern(negated ? line.slice(1) : line)
    if (pattern) {
      rules.push({ negated, pattern })
    }
  }

  return rules
}

// True when a pattern ignores targetPath or one of its ancestors. A "base/**"
// pattern ignores strict descendants only, so it never covers the file "base".
function patternAppliesTo(pattern, targetPath) {
  if (ignoreAllPatterns.has(pattern)) {
    return true
  }
  if (pattern.endsWith('/**')) {
    return targetPath.startsWith(`${pattern.slice(0, -3)}/`)
  }
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3)
    return targetPath === suffix || targetPath.endsWith(`/${suffix}`)
  }
  if (/[*?[]/.test(pattern)) {
    return false
  }
  return targetPath === pattern || targetPath.startsWith(`${pattern}/`)
}

// A negation below a managed directory punches a hole in that directory's
// subtree, so it removes coverage until a later positive restores the subtree.
function ignorePatternBase(pattern) {
  return normalizeIgnorePattern(
    pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern,
  )
}

function patternAppliesBelow(pattern, directoryPath) {
  if (ignoreAllPatterns.has(pattern)) {
    return true
  }

  const base = ignorePatternBase(pattern)
  return (
    !/[*?[]/.test(base) &&
    base.startsWith(directoryPath) &&
    base !== normalizeIgnorePattern(directoryPath)
  )
}

// Last-match-wins over the rule list, matching gitignore semantics. Required
// directories also track negated subtrees so a later positive can restore them.
function isCovered(requiredPath, rules) {
  const isDirectory = requiredPath.endsWith('/')
  let covered = false
  const holes = new Set()

  for (const { negated, pattern } of rules) {
    if (!isDirectory) {
      if (patternAppliesTo(pattern, requiredPath)) {
        covered = !negated
      }
      continue
    }

    if (negated) {
      if (patternAppliesTo(pattern, requiredPath)) {
        covered = false
        holes.clear()
      } else if (patternAppliesBelow(pattern, requiredPath)) {
        holes.add(ignorePatternBase(pattern))
      }
      continue
    }

    if (patternAppliesTo(pattern, requiredPath)) {
      covered = true
      holes.clear()
      continue
    }

    if (patternAppliesBelow(pattern, requiredPath)) {
      const base = ignorePatternBase(pattern)
      for (const hole of holes) {
        if (hole === base || hole.startsWith(`${base}/`)) {
          holes.delete(hole)
        }
      }
    }
  }

  return covered && holes.size === 0
}

export function missingPrettierIgnorePatterns(
  contents,
  requiredPatterns = requiredPrettierIgnorePatterns,
) {
  const rules = parsePrettierIgnoreRules(contents)
  return requiredPatterns.filter(
    (requiredPath) => !isCovered(requiredPath, rules),
  )
}

export const memoryBankStubs = {
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
}

export const agentInstructionsStubs = {
  'learned-knowledge.instructions.md': `# Learned Knowledge

Cross-session knowledge accumulated by agent pipelines. Each session records discoveries, patterns, gotchas, and agent tuning notes for future reference.

---

`,
}

// Project-owned files are scaffolded create-if-absent and then left alone for
// the lifetime of the consumer project (deleting one recreates it on the next
// sync). The .prettierignore text here must stay byte-identical to the
// repository's shipped .prettierignore (asserted in sync-unit.test.js) so the
// tarball copy and the scaffold cannot drift.
export const projectOwnedStubs = {
  'AGENTS.project.md': `# Project Rules

> Project-owned. This file is never overwritten or pruned by sync — edit it freely.

## Project-specific agent rules

- {{add project-specific rules here}}
`,
  '.prettierignore': `# Project-owned. Sync never overwrites this file.
# Keep formatters away from files managed by @abarcenas/ai-workflow-template:
# a formatting pass over managed files makes every future sync skip them.

# Managed agent configuration
.agents/
.opencode/agents/
.opencode/commands/

# Managed root files
AGENTS.md
AGENTS.project.md
skills-lock.json

# Managed scripts (scripts/sync.js scriptsToSync)
scripts/memory-cli.js
scripts/memory-index.js
scripts/bump-version.js
scripts/validate-memory-schema.js
scripts/vocab-sync.js
scripts/mcp-memory-server.js
scripts/mcp/playwright-mcp-launcher.js
scripts/knowledgebase-cli.js
scripts/knowledgebase-index.js
scripts/mcp-knowledgebase-server.js
scripts/knowledgebase-init.sql
`,
}

// Parses the flags supported by the sync entry point. Unknown flags are ignored
// so that consumer tooling can pass extra arguments without breaking a sync.
export function parseArgs(argv = [], env = process.env) {
  const args = new Set(argv)

  return {
    forceOverwrite: args.has('--force'),
    dryRun: args.has('--dry-run'),
    // Pruning is opt-in and off by default: syncing never deletes anything unless
    // the caller explicitly passes --prune. Even then, only manifest-tracked files
    // whose package source has disappeared AND whose content is unmodified are removed.
    prune: args.has('--prune'),
    isVerbose: env.AI_WORKFLOW_VERBOSE === '1',
  }
}

// Resolves every directory and flag the sync pass works with. Tests pass an
// explicit packageRoot/consumerRoot; production derives the package root from
// this module's location and the consumer root from INIT_CWD (npm) or cwd.
export function createSyncContext(options = {}) {
  const {
    packageRoot,
    consumerRoot,
    manifestPath,
    argv = process.argv.slice(2),
    env = process.env,
  } = options

  const resolvedPackageRoot = packageRoot
    ? resolve(packageRoot)
    : defaultPackageRoot
  const resolvedConsumerRoot = consumerRoot
    ? resolve(consumerRoot)
    : env.INIT_CWD
      ? resolve(env.INIT_CWD)
      : process.cwd()

  const sourceAgentsDir = resolve(resolvedPackageRoot, '.agents')
  const targetAgentsDir = resolve(resolvedConsumerRoot, '.agents')
  const sourceOpenCodeDir = resolve(resolvedPackageRoot, '.opencode')
  const sourceScriptsDir = resolve(resolvedPackageRoot, 'scripts')
  const targetScriptsDir = resolve(resolvedConsumerRoot, 'scripts')

  return {
    packageRoot: resolvedPackageRoot,
    consumerRoot: resolvedConsumerRoot,
    sourceAgentsDir,
    targetAgentsDir,
    sourceOpenCodeDir,
    sourceScriptsDir,
    targetScriptsDir,
    manifestPath: manifestPath
      ? resolve(manifestPath)
      : resolve(resolvedConsumerRoot, '.agents-sync-manifest.json'),
    ...parseArgs(argv, env),
    pruneChannels: {
      agents: {
        prefix: '',
        packageDir: sourceAgentsDir,
        consumerDir: targetAgentsDir,
      },
      opencode: {
        prefix: '__opencode__/',
        packageDir: sourceOpenCodeDir,
        consumerDir: resolve(resolvedConsumerRoot, '.opencode'),
      },
      scripts: {
        prefix: '__scripts__/',
        packageDir: sourceScriptsDir,
        consumerDir: targetScriptsDir,
      },
      root: {
        prefix: '__root__/',
        packageDir: resolvedPackageRoot,
        consumerDir: resolvedConsumerRoot,
      },
    },
  }
}

export function hashFile(filePath) {
  const contents = readFileSync(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

export function collectFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath))
      continue
    }

    if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

export function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    return { version: 1, files: {} }
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest || typeof manifest !== 'object') {
      return { version: 1, files: {} }
    }

    if (!manifest.files || typeof manifest.files !== 'object') {
      manifest.files = {}
    }

    return manifest
  } catch {
    return { version: 1, files: {} }
  }
}

export function writeManifest(manifestPath, manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function ensureParentDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function syncFile(sourceFile, targetFile, dryRun) {
  if (dryRun) {
    return
  }

  ensureParentDirectory(targetFile)
  copyFileSync(sourceFile, targetFile)
}

// A file is safe to overwrite when the manifest recorded a hash for it and the
// consumer copy still matches that hash. Missing recorded hashes mean the file
// is not tracked, so local edits are assumed and the copy is skipped.
export function isUntouched(recordedHash, existingHash) {
  return recordedHash !== null && existingHash === recordedHash
}

export function isPathInside(baseDir, candidatePath) {
  const rel = relative(baseDir, candidatePath)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

// Resolves a manifest key to its package path (for the "still shipped?" check)
// and its consumer path (the prune candidate). Returns null for keys that the
// sync layer does not own, and for paths that escape their channel root.
export function resolvePruneEntry(manifestKey, { pruneChannels }) {
  let channel
  let relativePath

  // Scaffold-only namespace for project-owned files. There is no package source
  // to compare against and nothing here may ever be deleted.
  if (manifestKey.startsWith('__project__/')) {
    return null
  }

  if (manifestKey.startsWith('__opencode__/')) {
    channel = pruneChannels.opencode
    relativePath = manifestKey.slice(channel.prefix.length)
    // Never touch paths the .opencode copy pass deliberately ignores (e.g. node_modules).
    if (
      openCodeExcluded.has(relativePath) ||
      openCodeExcluded.has(relativePath.split('/')[0])
    ) {
      return null
    }
  } else if (manifestKey.startsWith('__scripts__/')) {
    channel = pruneChannels.scripts
    relativePath = manifestKey.slice(channel.prefix.length)
  } else if (manifestKey.startsWith('__root__/')) {
    channel = pruneChannels.root
    relativePath = manifestKey.slice(channel.prefix.length)
  } else if (manifestKey.startsWith('__')) {
    // Unknown internal namespace — never prune (scaffold-only or future keys).
    return null
  } else {
    channel = pruneChannels.agents
    relativePath = manifestKey
  }

  if (!relativePath) {
    return null
  }

  // Project-owned files survive every prune, even when the package no longer
  // ships a same-named path. This is the single check for all four channels.
  if (isProjectOwnedPath(relativePath)) {
    return null
  }

  const packagePaths = [resolve(channel.packageDir, relativePath)]

  const consumerPath = resolve(channel.consumerDir, relativePath)
  if (!isPathInside(channel.packageDir, packagePaths[0])) {
    return null
  }
  if (!isPathInside(channel.consumerDir, consumerPath)) {
    return null
  }

  return { packagePaths, consumerPath }
}

export function isRegularFile(filePath) {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function syncProject(context) {
  const {
    packageRoot,
    consumerRoot,
    sourceAgentsDir,
    targetAgentsDir,
    sourceOpenCodeDir,
    sourceScriptsDir,
    targetScriptsDir,
    manifestPath,
    forceOverwrite,
    dryRun,
    prune,
    isVerbose,
  } = context

  if (!existsSync(sourceAgentsDir)) {
    console.warn('[ai-workflow-template] No .agents directory found to sync.')
    return { exitCode: 0, copied: 0, added: 0, scaffolded: 0, skipped: 0 }
  }

  const manifest = readManifest(manifestPath)
  // Snapshot before syncing: prune only considers entries that existed at the start
  // of this run, so files scaffolded/copied now are never candidates in the same run.
  const preexistingManifestKeys = Object.keys(manifest.files)
  const sourceFiles = collectFiles(sourceAgentsDir)
  let copied = 0
  let skipped = 0
  let added = 0

  /* ──  Sync .agents/ directory ────────────────────────────────── */

  // Project ownership outranks every flag: these paths are skipped before the
  // --force branch below, so --force can never replace consumer-owned content.
  for (const sourceFile of sourceFiles) {
    const relativePath = relative(sourceAgentsDir, sourceFile)
    if (isProjectOwnedPath(relativePath)) {
      continue
    }

    const targetFile = resolve(targetAgentsDir, relativePath)
    const sourceHash = hashFile(sourceFile)
    const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
    const trackedKey = relativePath
    const recordedHash = manifest.files[trackedKey] ?? null

    if (!existsSync(targetFile)) {
      if (isVerbose) console.error(`  … syncing: .agents/${relativePath}`)
      syncFile(sourceFile, targetFile, dryRun)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      added += 1
      continue
    }

    if (forceOverwrite || isUntouched(recordedHash, existingHash)) {
      if (isVerbose) console.error(`  … syncing: .agents/${relativePath}`)
      syncFile(sourceFile, targetFile, dryRun)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      continue
    }

    skipped += 1
    console.warn(`[ai-workflow-template] Skipped locally modified file: ${relativePath}`)
  }

  /* ──  Sync .opencode/ directory ────────────────────────────── */

  if (existsSync(sourceOpenCodeDir)) {
    const openCodeFiles = collectFiles(sourceOpenCodeDir)

    for (const sourceFile of openCodeFiles) {
      const relativePath = relative(sourceOpenCodeDir, sourceFile)
      if (
        isProjectOwnedPath(relativePath) ||
        openCodeExcluded.has(relativePath) ||
        openCodeExcluded.has(relativePath.split('/')[0])
      ) {
        continue
      }

      const targetFile = resolve(consumerRoot, '.opencode', relativePath)
      const sourceHash = hashFile(sourceFile)
      const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
      const trackedKey = `__opencode__/${relativePath}`
      const recordedHash = manifest.files[trackedKey] ?? null

      if (!existsSync(targetFile)) {
        if (isVerbose) console.error(`  … syncing: .opencode/${relativePath}`)
        syncFile(sourceFile, targetFile, dryRun)
        manifest.files[trackedKey] = sourceHash
        copied += 1
        added += 1
        continue
      }

      if (forceOverwrite || isUntouched(recordedHash, existingHash)) {
        if (isVerbose) console.error(`  … syncing: .opencode/${relativePath}`)
        syncFile(sourceFile, targetFile, dryRun)
        manifest.files[trackedKey] = sourceHash
        copied += 1
        continue
      }

      skipped += 1
      console.warn(`[ai-workflow-template] Skipped locally modified opencode file: ${relativePath}`)
    }
  }

  /* ──  Sync scripts/ directory ──────────────────────────────── */

  let scriptsCopied = 0
  let scriptsSkipped = 0

  for (const scriptRelPath of scriptsToSync) {
    if (isProjectOwnedPath(scriptRelPath)) {
      continue
    }

    const sourceFile = resolve(sourceScriptsDir, scriptRelPath)
    const targetFile = resolve(targetScriptsDir, scriptRelPath)

    if (!existsSync(sourceFile)) {
      continue
    }

    const sourceHash = hashFile(sourceFile)
    const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
    const trackedKey = `__scripts__/${scriptRelPath}`
    const recordedHash = manifest.files[trackedKey] ?? null

    if (!existsSync(targetFile)) {
      if (isVerbose) console.error(`  … syncing: scripts/${scriptRelPath}`)
      syncFile(sourceFile, targetFile, dryRun)
      manifest.files[trackedKey] = sourceHash
      scriptsCopied += 1
      copied += 1
      added += 1
      continue
    }

    if (forceOverwrite || isUntouched(recordedHash, existingHash)) {
      if (isVerbose) console.error(`  … syncing: scripts/${scriptRelPath}`)
      syncFile(sourceFile, targetFile, dryRun)
      manifest.files[trackedKey] = sourceHash
      scriptsCopied += 1
      copied += 1
      continue
    }

    scriptsSkipped += 1
    skipped += 1
    console.warn(`[ai-workflow-template] Skipped locally modified script file: scripts/${scriptRelPath}`)
  }

  /* ──  Sync root files ────────────────────────────────────────── */

  for (const rootFile of rootFiles) {
    // Defense in depth: projectOwnedPaths wins if a project-owned name is ever
    // added to rootFiles. opencode.json is no longer in this allowlist at all.
    if (isProjectOwnedPath(rootFile)) {
      continue
    }

    const sourceFile = resolve(packageRoot, rootFile)
    if (!existsSync(sourceFile)) {
      continue
    }

    const targetFile = resolve(consumerRoot, rootFile)
    const sourceHash = hashFile(sourceFile)
    const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
    const trackedKey = `__root__/${rootFile}`
    const recordedHash = manifest.files[trackedKey] ?? null

    if (!existsSync(targetFile)) {
      if (isVerbose) console.error(`  … syncing: ${rootFile}`)
      syncFile(sourceFile, targetFile, dryRun)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      added += 1
      continue
    }

    if (forceOverwrite || isUntouched(recordedHash, existingHash)) {
      if (isVerbose) console.error(`  … syncing: ${rootFile}`)
      syncFile(sourceFile, targetFile, dryRun)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      continue
    }

    skipped += 1
    console.warn(`[ai-workflow-template] Skipped locally modified root file: ${rootFile}`)
  }

  /* ──  Scaffold memory-bank/ directory ──────────────────────────── */

  const memoryBankDir = resolve(consumerRoot, 'memory-bank')
  let scaffolded = 0

  for (const [fileName, fileContent] of Object.entries(memoryBankStubs)) {
    const targetFile = resolve(memoryBankDir, fileName)
    const trackedKey = `__memory-bank__/${fileName}`

    if (existsSync(targetFile)) {
      continue
    }

    ensureParentDirectory(targetFile)
    if (isVerbose) console.error(`  … scaffolding: memory-bank/${fileName}`)
    writeFileSync(targetFile, fileContent, 'utf8')
    manifest.files[trackedKey] = hashFile(targetFile)
    scaffolded += 1
  }

  /* ──  Scaffold .agents/instructions/ directory ───────────────── */

  for (const [fileName, fileContent] of Object.entries(agentInstructionsStubs)) {
    const targetFile = resolve(targetAgentsDir, 'instructions', fileName)
    const trackedKey = `__agents-instructions__/${fileName}`

    if (existsSync(targetFile)) {
      continue
    }

    ensureParentDirectory(targetFile)
    if (isVerbose) console.error(`  … scaffolding: .agents/instructions/${fileName}`)
    writeFileSync(targetFile, fileContent, 'utf8')
    manifest.files[trackedKey] = hashFile(targetFile)
    scaffolded += 1
  }

  /* ──  Scaffold project-owned files ───────────────────────────── */

  // Create-if-absent only. The __project__ namespace is reporting metadata
  // written when a file is first created by sync; pre-existing consumer files
  // are intentionally absent, because there is no managed baseline to report.
  // It is never resolved by the copy or prune passes and never drives an
  // overwrite. Not refreshing it on later runs keeps a consumer-owned file from
  // producing manifest churn on every install.
  const targetPrettierIgnore = resolve(consumerRoot, '.prettierignore')
  const prettierIgnoreExisted = existsSync(targetPrettierIgnore)

  for (const [fileName, fileContent] of Object.entries(projectOwnedStubs)) {
    const targetFile = resolve(consumerRoot, fileName)
    const trackedKey = `__project__/${fileName}`
    let didScaffold = false

    if (!existsSync(targetFile)) {
      ensureParentDirectory(targetFile)
      if (isVerbose) console.error(`  … scaffolding: ${fileName}`)
      writeFileSync(targetFile, fileContent, 'utf8')
      scaffolded += 1
      didScaffold = true
    }

    // Only hash what this run created, and only if it is a regular file: a
    // directory or unreadable path at this location must not abort the run.
    if (didScaffold && isRegularFile(targetFile)) {
      manifest.files[trackedKey] = hashFile(targetFile)
    }
  }

  // An existing .prettierignore is project-owned and is never edited. Tell the
  // consumer when it leaves managed files exposed, once and deterministically.
  if (prettierIgnoreExisted) {
    try {
      const missingPatterns = missingPrettierIgnorePatterns(
        readFileSync(targetPrettierIgnore, 'utf8'),
      )
      if (missingPatterns.length > 0) {
        console.warn(prettierIgnoreWarning)
      }
    } catch {
      // A directory or unreadable path at .prettierignore is project-owned
      // state we cannot inspect. Skip the advisory rather than abort the run.
    }
  }

  /* ──  Auto-copy opencode.mcp.example.json → opencode.json ────── */

  // Existing consumer configs are never rewritten. The example carries the
  // `instructions` entry that loads AGENTS.project.md for fresh consumers.
  const exampleMcpFile = resolve(packageRoot, 'opencode.mcp.example.json')
  const targetMcpFile = resolve(consumerRoot, 'opencode.json')
  const mcpTrackedKey = '__project__/opencode.json'

  if (existsSync(exampleMcpFile) && !existsSync(targetMcpFile)) {
    if (isVerbose) console.error('  … scaffolding: opencode.json from example')
    copyFileSync(exampleMcpFile, targetMcpFile)
    manifest.files[mcpTrackedKey] = hashFile(targetMcpFile)
    scaffolded += 1
  }

  /* ──  Prune stale files (opt-in via --prune) ─────────────────── */

  // Every prunable manifest namespace maps onto the same package/consumer roots
  // used by the copy passes above. Scaffold-only namespaces (__memory-bank__,
  // __agents-instructions__) have no package source and are therefore never
  // prunable — their keys fall through to the "unknown namespace" guard below.
  let pruned = 0
  let pruneSkipped = 0

  if (prune) {
    for (const manifestKey of preexistingManifestKeys) {
      const entry = resolvePruneEntry(manifestKey, context)
      if (!entry) {
        continue
      }

      // Still shipped by the package? Package-owned — never prunable (CON-05, D-10).
      if (entry.packagePaths.some((packagePath) => existsSync(packagePath))) {
        continue
      }

      const displayPath = relative(consumerRoot, entry.consumerPath)

      // Consumer file is already gone: drop the stale bookkeeping entry, delete nothing.
      if (!existsSync(entry.consumerPath)) {
        if (!dryRun) {
          delete manifest.files[manifestKey]
        }
        continue
      }

      // Files only — never delete a directory, symlink target, or unreadable path.
      if (!isRegularFile(entry.consumerPath)) {
        continue
      }

      const recordedHash = manifest.files[manifestKey]
      if (typeof recordedHash !== 'string' || recordedHash.length === 0) {
        pruneSkipped += 1
        console.warn(`[ai-workflow-template] Skipped pruning untracked file: ${displayPath}`)
        continue
      }

      // Locally modified (or unverifiable): keep the file AND its manifest entry so
      // a later run can still see it. Deleting here would destroy user work.
      if (hashFile(entry.consumerPath) !== recordedHash) {
        pruneSkipped += 1
        console.warn(`[ai-workflow-template] Skipped pruning locally modified file: ${displayPath}`)
        continue
      }

      pruned += 1
      if (dryRun) {
        console.log(`[ai-workflow-template] Would prune: ${displayPath}`)
        continue
      }

      rmSync(entry.consumerPath, { force: true })
      delete manifest.files[manifestKey]

      // Directories are never deleted. Report an emptied one and leave it in place.
      const parentDir = dirname(entry.consumerPath)
      if (existsSync(parentDir) && readdirSync(parentDir).length === 0) {
        console.log(
          `[ai-workflow-template] Left empty directory in place: ${relative(consumerRoot, parentDir)}`,
        )
      }
    }

    const summaryVerb = dryRun ? 'Would prune' : 'Pruned'
    console.log(
      `[ai-workflow-template] ${summaryVerb} ${pruned} stale file(s); skipped ${pruneSkipped} locally modified.`,
    )
  }

  if (!dryRun) {
    writeManifest(manifestPath, manifest)
  }

  const modeLabel = forceOverwrite ? 'force' : dryRun ? 'dry-run' : 'safe'
  console.log(`[ai-workflow-template] Synced ${copied} files (${added} new), scaffolded ${scaffolded} files, skipped ${skipped} modified files. Mode: ${modeLabel}.`)

  return {
    exitCode: 0,
    copied,
    added,
    skipped,
    scaffolded,
    pruned,
    pruneSkipped,
    scriptsCopied,
    scriptsSkipped,
  }
}

// Runs a complete sync pass. Accepts explicit roots/argv/env so the module can
// be exercised in-process by tests without touching the real repository.
export function runSync(options = {}) {
  return syncProject(createSyncContext(options))
}

// True only when this module is the script Node was asked to execute. This keeps
// `node scripts/sync.js` working while making the module safe to import in tests.
// Compares symlink-resolved paths because macOS reports /var scripts as
// /private/var through import.meta.url.
export function isEntryPoint(moduleUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) {
    return false
  }

  const modulePath = fileURLToPath(moduleUrl)
  const argvPath = resolve(argv1)
  if (modulePath === argvPath) {
    return true
  }

  try {
    return realpathSync(modulePath) === realpathSync(argvPath)
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  runSync()
}
