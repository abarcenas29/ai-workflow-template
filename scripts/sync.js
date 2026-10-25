import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const sourceAgentsDir = resolve(packageRoot, '.agents')
const consumerRoot = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : process.cwd()
const targetAgentsDir = resolve(consumerRoot, '.agents')
const manifestPath = resolve(consumerRoot, '.agents-sync-manifest.json')
const excludedRelativePaths = new Set([
  'instructions/learned-knowledge.instructions.md',
])
const args = new Set(process.argv.slice(2))
const forceOverwrite = args.has('--force')
const dryRun = args.has('--dry-run')
// Pruning is opt-in and off by default: syncing never deletes anything unless the
// caller explicitly passes --prune. Even then, only manifest-tracked files whose
// package source has disappeared AND whose content is unmodified are removed.
const prune = args.has('--prune')
const isVerbose = process.env.AI_WORKFLOW_VERBOSE === '1'

function hashFile(filePath) {
  const contents = readFileSync(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

function collectFiles(directory) {
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

function readManifest() {
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

function writeManifest(manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function ensureParentDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function syncFile(sourceFile, targetFile) {
  if (dryRun) {
    return
  }

  ensureParentDirectory(targetFile)
  copyFileSync(sourceFile, targetFile)
}

const rootFiles = ['AGENTS.md', 'opencode.json', 'skills-lock.json']

if (!existsSync(sourceAgentsDir)) {
  console.warn('[ai-workflow-template] No .agents directory found to sync.')
  process.exit(0)
}

const manifest = readManifest()
// Snapshot before syncing: prune only considers entries that existed at the start
// of this run, so files scaffolded/copied now are never candidates in the same run.
const preexistingManifestKeys = Object.keys(manifest.files)
const sourceFiles = collectFiles(sourceAgentsDir)
let copied = 0
let skipped = 0
let added = 0

/* ──  Sync .agents/ directory ────────────────────────────────── */

for (const sourceFile of sourceFiles) {
  const relativePath = relative(sourceAgentsDir, sourceFile)
  if (excludedRelativePaths.has(relativePath)) {
    continue
  }

  const targetFile = resolve(targetAgentsDir, relativePath)
  const sourceHash = hashFile(sourceFile)
  const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
  const trackedKey = relativePath
  const recordedHash = manifest.files[trackedKey] ?? null

  if (!existsSync(targetFile)) {
    if (isVerbose) console.error(`  … syncing: .agents/${relativePath}`)
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    copied += 1
    added += 1
    continue
  }

  const isUntouched = recordedHash !== null && existingHash === recordedHash

  if (forceOverwrite || isUntouched) {
    if (isVerbose) console.error(`  … syncing: .agents/${relativePath}`)
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    copied += 1
    continue
  }

  skipped += 1
  console.warn(`[ai-workflow-template] Skipped locally modified file: ${relativePath}`)
}

/* ──  Sync .opencode/ directory ────────────────────────────── */

const sourceOpenCodeDir = resolve(packageRoot, '.opencode')
const openCodeExcluded = new Set(['node_modules', 'package.json', 'package-lock.json', 'bun.lock', '.gitignore'])

if (existsSync(sourceOpenCodeDir)) {
  const openCodeFiles = collectFiles(sourceOpenCodeDir)

  for (const sourceFile of openCodeFiles) {
    const relativePath = relative(sourceOpenCodeDir, sourceFile)
    if (openCodeExcluded.has(relativePath) || openCodeExcluded.has(relativePath.split('/')[0])) {
      continue
    }

    const targetFile = resolve(consumerRoot, '.opencode', relativePath)
    const sourceHash = hashFile(sourceFile)
    const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
    const trackedKey = `__opencode__/${relativePath}`
    const recordedHash = manifest.files[trackedKey] ?? null

    if (!existsSync(targetFile)) {
      if (isVerbose) console.error(`  … syncing: .opencode/${relativePath}`)
      syncFile(sourceFile, targetFile)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      added += 1
      continue
    }

    const isUntouched = recordedHash !== null && existingHash === recordedHash

    if (forceOverwrite || isUntouched) {
      if (isVerbose) console.error(`  … syncing: .opencode/${relativePath}`)
      syncFile(sourceFile, targetFile)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      continue
    }

    skipped += 1
    console.warn(`[ai-workflow-template] Skipped locally modified opencode file: ${relativePath}`)
  }
}

/* ──  Sync scripts/ directory ──────────────────────────────── */

const scriptsToSync = [
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

const sourceScriptsDir = resolve(packageRoot, 'scripts')
const targetScriptsDir = resolve(consumerRoot, 'scripts')
let scriptsCopied = 0
let scriptsSkipped = 0

for (const scriptRelPath of scriptsToSync) {
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
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    scriptsCopied += 1
    copied += 1
    added += 1
    continue
  }

  const isUntouched = recordedHash !== null && existingHash === recordedHash

  if (forceOverwrite || isUntouched) {
    if (isVerbose) console.error(`  … syncing: scripts/${scriptRelPath}`)
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    scriptsCopied += 1
    copied += 1
    continue
  }

  scriptsSkipped += 1
  skipped += 1
  console.warn(`[ai-workflow-template] Skipped locally modified script file: scripts/${scriptRelPath}`)
}

for (const rootFile of rootFiles) {
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
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    copied += 1
    added += 1
    continue
  }

  const isUntouched = recordedHash !== null && existingHash === recordedHash

  if (forceOverwrite || isUntouched) {
    if (isVerbose) console.error(`  … syncing: ${rootFile}`)
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    copied += 1
    continue
  }

  skipped += 1
  console.warn(`[ai-workflow-template] Skipped locally modified root file: ${rootFile}`)
}

/* ──  Scaffold memory-bank/ directory ──────────────────────────── */

const memoryBankStubs = {
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

const agentInstructionsStubs = {
  'learned-knowledge.instructions.md': `# Learned Knowledge

Cross-session knowledge accumulated by agent pipelines. Each session records discoveries, patterns, gotchas, and agent tuning notes for future reference.

---

`,
}

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

/* ──  Auto-copy opencode.mcp.example.json → opencode.json ────── */

const exampleMcpFile = resolve(packageRoot, 'opencode.mcp.example.json')
const targetMcpFile = resolve(consumerRoot, 'opencode.json')
const mcpTrackedKey = '__root__/opencode.json'

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
const pruneChannels = {
  agents: {
    prefix: '',
    packageDir: sourceAgentsDir,
    consumerDir: targetAgentsDir,
  },
  opencode: {
    prefix: '__opencode__/',
    packageDir: sourceOpenCodeDir,
    consumerDir: resolve(consumerRoot, '.opencode'),
  },
  scripts: {
    prefix: '__scripts__/',
    packageDir: resolve(packageRoot, 'scripts'),
    consumerDir: resolve(consumerRoot, 'scripts'),
  },
  root: {
    prefix: '__root__/',
    packageDir: packageRoot,
    consumerDir: consumerRoot,
  },
}

function isPathInside(baseDir, candidatePath) {
  const rel = relative(baseDir, candidatePath)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

// Resolves a manifest key to its package path (for the "still shipped?" check)
// and its consumer path (the prune candidate). Returns null for keys that the
// sync layer does not own, and for paths that escape their channel root.
function resolvePruneEntry(manifestKey) {
  let channel
  let relativePath

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
    if (excludedRelativePaths.has(relativePath)) {
      return null
    }
  }

  if (!relativePath) {
    return null
  }

  const packagePaths = [resolve(channel.packageDir, relativePath)]
  if (channel === pruneChannels.root && relativePath === 'opencode.json') {
    // opencode.json is scaffolded from the example when the package does not ship
    // it directly (auto-copy pass above). Either source keeps the file alive.
    packagePaths.push(resolve(packageRoot, 'opencode.mcp.example.json'))
  }

  const consumerPath = resolve(channel.consumerDir, relativePath)
  if (!isPathInside(channel.packageDir, packagePaths[0])) {
    return null
  }
  if (!isPathInside(channel.consumerDir, consumerPath)) {
    return null
  }

  return { packagePaths, consumerPath }
}

let pruned = 0
let pruneSkipped = 0

if (prune) {
  for (const manifestKey of preexistingManifestKeys) {
    const entry = resolvePruneEntry(manifestKey)
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

    let isRegularFile = false
    try {
      isRegularFile = statSync(entry.consumerPath).isFile()
    } catch {
      isRegularFile = false
    }

    // Files only — never delete a directory, symlink target, or unreadable path.
    if (!isRegularFile) {
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
  writeManifest(manifest)
}

const modeLabel = forceOverwrite ? 'force' : dryRun ? 'dry-run' : 'safe'
console.log(`[ai-workflow-template] Synced ${copied} files (${added} new), scaffolded ${scaffolded} files, skipped ${skipped} modified files. Mode: ${modeLabel}.`)
