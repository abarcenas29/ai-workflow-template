import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const sourceGithubDir = resolve(packageRoot, '.github')
const consumerRoot = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : process.cwd()
const targetGithubDir = resolve(consumerRoot, '.github')
const manifestPath = resolve(consumerRoot, '.github-sync-manifest.json')
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

if (!existsSync(sourceGithubDir)) {
  console.warn('[ai-workflow-template] No .github directory found to sync.')
  process.exit(0)
}

const manifest = readManifest()
const sourceFiles = collectFiles(sourceGithubDir)
let copied = 0
let skipped = 0
let added = 0

for (const sourceFile of sourceFiles) {
  const relativePath = relative(sourceGithubDir, sourceFile)
  const targetFile = resolve(targetGithubDir, relativePath)
  const sourceHash = hashFile(sourceFile)
  const existingHash = existsSync(targetFile) ? hashFile(targetFile) : null
  const recordedHash = manifest.files[relativePath] ?? null

  if (!existsSync(targetFile)) {
    syncFile(sourceFile, targetFile)
    manifest.files[relativePath] = sourceHash
    copied += 1
    added += 1
    continue
  }

  const isUntouched = recordedHash !== null && existingHash === recordedHash

  if (forceOverwrite || isUntouched) {
    syncFile(sourceFile, targetFile)
    manifest.files[relativePath] = sourceHash
    copied += 1
    continue
  }

  skipped += 1
  console.warn(`[ai-workflow-template] Skipped locally modified file: ${relativePath}`)
}

if (!dryRun) {
  writeManifest(manifest)
}

const modeLabel = forceOverwrite ? 'force' : dryRun ? 'dry-run' : 'safe'
console.log(`[ai-workflow-template] Synced ${copied} files (${added} new), skipped ${skipped} modified files. Mode: ${modeLabel}.`)
