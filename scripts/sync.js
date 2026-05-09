import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const sourceAgentsDir = resolve(packageRoot, '.agents')
const consumerRoot = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : process.cwd()
const targetAgentsDir = resolve(consumerRoot, '.agents')
const manifestPath = resolve(consumerRoot, '.agents-sync-manifest.json')
const excludedRelativePaths = new Set([])
const args = new Set(process.argv.slice(2))
const forceOverwrite = args.has('--force')
const dryRun = args.has('--dry-run')

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

const rootFiles = ['AGENTS.md', 'opencode.mcp.example.json', 'skills-lock.json']

if (!existsSync(sourceAgentsDir)) {
  console.warn('[ai-workflow-template] No .agents directory found to sync.')
  process.exit(0)
}

const manifest = readManifest()
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
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    copied += 1
    added += 1
    continue
  }

  const isUntouched = recordedHash !== null && existingHash === recordedHash

  if (forceOverwrite || isUntouched) {
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
      syncFile(sourceFile, targetFile)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      added += 1
      continue
    }

    const isUntouched = recordedHash !== null && existingHash === recordedHash

    if (forceOverwrite || isUntouched) {
      syncFile(sourceFile, targetFile)
      manifest.files[trackedKey] = sourceHash
      copied += 1
      continue
    }

    skipped += 1
    console.warn(`[ai-workflow-template] Skipped locally modified opencode file: ${relativePath}`)
  }
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
    syncFile(sourceFile, targetFile)
    manifest.files[trackedKey] = sourceHash
    copied += 1
    added += 1
    continue
  }

  const isUntouched = recordedHash !== null && existingHash === recordedHash

  if (forceOverwrite || isUntouched) {
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
  writeFileSync(targetFile, fileContent, 'utf8')
  manifest.files[trackedKey] = hashFile(targetFile)
  scaffolded += 1
}

/* ──  Auto-copy opencode.mcp.json from example ────────────────── */

const exampleMcpFile = resolve(packageRoot, 'opencode.mcp.example.json')
const targetMcpFile = resolve(consumerRoot, 'opencode.mcp.json')
const mcpTrackedKey = '__root__/opencode.mcp.json'

if (existsSync(exampleMcpFile) && !existsSync(targetMcpFile)) {
  copyFileSync(exampleMcpFile, targetMcpFile)
  manifest.files[mcpTrackedKey] = hashFile(targetMcpFile)
  scaffolded += 1
}

if (!dryRun) {
  writeManifest(manifest)
}

const modeLabel = forceOverwrite ? 'force' : dryRun ? 'dry-run' : 'safe'
console.log(`[ai-workflow-template] Synced ${copied} files (${added} new), scaffolded ${scaffolded} files, skipped ${skipped} modified files. Mode: ${modeLabel}.`)
