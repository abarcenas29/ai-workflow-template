import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '../package.json')

// Opt-out: SKIP_BUMP=1 keeps the current version (e.g. when a batch of commits
// is one logical change set and should yield a single bump).
if (process.env.SKIP_BUMP) {
  console.log('SKIP_BUMP set — version bump skipped')
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = pkg.version
const [curMajor, curMinor] = current.split('.').map(Number)

let prevMajor = curMajor
try {
  const prevPkg = JSON.parse(execSync('git show HEAD:package.json', { encoding: 'utf8' }))
  prevMajor = Number(prevPkg.version.split('.')[0])
} catch {
  // First commit — no HEAD yet, keep prevMajor === curMajor so minor bumps normally
}

const newVersion =
  curMajor !== prevMajor
    ? `${curMajor}.0.0`                    // Major changed: normalize, reset minor + patch
    : `${curMajor}.${curMinor + 1}.0`      // Normal commit: bump minor, reset patch

pkg.version = newVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
execSync('git add package.json')
console.log(`Version bumped: ${current} → ${newVersion}`)
