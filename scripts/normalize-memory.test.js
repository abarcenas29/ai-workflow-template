// ═════════════════════════════════════════════════════════════════════════════
// normalize-memory.test.js — Unit tests for the memory-bank normalization script
// ═════════════════════════════════════════════════════════════════════════════
//
// The script is exercised through the testability seam added alongside the
// isDirectRun guard (matching scripts/vocab-sync.js): every cohesive unit is
// exported and `main()` only runs when the file is executed directly.
//
// Because the module resolves memory-bank/, docs/, plan/ and the vocabulary
// path from INIT_CWD (or process.cwd()) at import time, each scenario:
//   1. creates a temp consumer root,
//   2. chdir()s into it (and/or sets INIT_CWD),
//   3. vi.resetModules() + dynamic import so the paths point at the fixture.
// No test touches the repository's real memory-bank/ or docs/.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// ── Fixture helpers ─────────────────────────────────────────────────────────

const ORIGINAL_CWD = process.cwd()
const ORIGINAL_ARGV = [...process.argv]
const ORIGINAL_INIT_CWD = process.env.INIT_CWD
const SCRIPT_PATH = fileURLToPath(new URL('./normalize-memory.js', import.meta.url))
const tempDirs = new Set()

function createTempDir(prefix = 'normalize-memory-test-') {
  // realpathSync keeps fixture paths identical to the module's resolve()d
  // constants on macOS, where /var is a symlink to /private/var.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  tempDirs.add(dir)
  return dir
}

/** Write a repo-relative file, creating parent directories. */
function writeRepoFile(root, relPath, content) {
  const filePath = join(root, relPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

function readRepoFile(root, relPath) {
  return readFileSync(join(root, relPath), 'utf8')
}

const VOCAB = {
  categories: { context: 'Context files', task: 'Task files' },
  tags: {
    workflow: ['planning', 'review'],
    memory_ops: ['indexing'],
  },
  entity_patterns: {
    vitest: ['\\bvitest\\b'],
    npm: ['npm'],
    broken: ['([', '\\bbroken\\b'],
  },
  file_category_map: {
    activeContext: 'memory_ops',
    progress: 'status',
  },
}

function writeVocab(root, vocab = VOCAB) {
  writeRepoFile(root, 'memory-bank/.vocabulary.json', `${JSON.stringify(vocab, null, 2)}\n`)
}

/**
 * Import a fresh copy of the script with its module-level paths resolved
 * against `root`. `initCwd` is either a path (sets INIT_CWD) or 'unset'
 * (deletes it so process.cwd() is used).
 */
async function loadModule({ root, argv = [], initCwd = 'unset' } = {}) {
  process.chdir(root)
  if (initCwd === 'unset') delete process.env.INIT_CWD
  else process.env.INIT_CWD = initCwd
  process.argv = [ORIGINAL_ARGV[0], 'normalize-memory.js', ...argv]
  vi.resetModules()
  return await import('./normalize-memory.js')
}

/** Fresh temp consumer root with the standard vocabulary installed. */
function createFixtureRoot() {
  const root = createTempDir()
  writeVocab(root)
  return root
}

const MEMORY_FILE = [
  '# My Title',
  '',
  'Planning and indexing content lives here.',
  '',
  '## Details',
  '',
  'Vitest and npm are referenced in this section.',
  '',
].join('\n')

const DOC_FILE = ['# Architecture Context', '', 'A decision record for the project.', ''].join('\n')

function expectFrontmatter(content, expected) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  expect(match).not.toBeNull()
  for (const line of expected) {
    expect(match[1]).toContain(line)
  }
}

function bodyAfterFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n/)
  return match ? content.slice(match[0].length) : content
}

// ── Test lifecycle ──────────────────────────────────────────────────────────

let mod
let root
let logSpy
let warnSpy

beforeEach(async () => {
  root = createFixtureRoot()
  mod = await loadModule({ root })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  process.chdir(ORIGINAL_CWD)
  process.argv = [...ORIGINAL_ARGV]
  if (ORIGINAL_INIT_CWD === undefined) delete process.env.INIT_CWD
  else process.env.INIT_CWD = ORIGINAL_INIT_CWD
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
  tempDirs.clear()
  vi.restoreAllMocks()
})

// ── parseFrontmatter ───────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('returns null frontmatter and the untouched body when absent', () => {
    const content = '# Title\n\nBody text'
    expect(mod.parseFrontmatter(content)).toEqual({ frontmatter: null, body: content })
  })

  it('parses scalar key/value pairs and strips the block from the body', () => {
    const content = '---\nid: sample\ntitle: "My Title"\ncategory: context\n---\n# Body\n'
    const { frontmatter, body } = mod.parseFrontmatter(content)

    expect(frontmatter).toEqual({ id: 'sample', title: '"My Title"', category: 'context' })
    expect(body).toBe('# Body\n')
  })

  it('keeps array-looking values verbatim (normalization script does no array parsing)', () => {
    const { frontmatter } = mod.parseFrontmatter('---\ntags: [a, b]\n---\nbody')
    expect(frontmatter.tags).toBe('[a, b]')
  })

  it('skips non key/value lines', () => {
    const { frontmatter } = mod.parseFrontmatter('---\nid: x\n- a list item\n---\nbody')
    expect(frontmatter).toEqual({ id: 'x' })
  })

  it('preserves an empty value', () => {
    const { frontmatter } = mod.parseFrontmatter('---\ntags:\n---\nbody')
    expect(frontmatter.tags).toBe('')
  })

  it('tolerates a closing fence without a trailing newline', () => {
    const { frontmatter, body } = mod.parseFrontmatter('---\nid: x\n---')
    expect(frontmatter).toEqual({ id: 'x' })
    expect(body).toBe('')
  })
})

// ── extractTitle ───────────────────────────────────────────────────────────

describe('extractTitle', () => {
  it('returns the trimmed H1 text', () => {
    expect(mod.extractTitle('#   Spaced Title   \nbody')).toBe('Spaced Title')
  })

  it('falls back to the basename when no H1 exists', () => {
    expect(mod.extractTitle('just a body with no heading')).toBe('just a body with no heading')
  })
})

// ── getAllTags / suggestTags / suggestEntities ─────────────────────────────

describe('getAllTags', () => {
  it('returns [] for missing vocabulary or missing tags group', () => {
    expect(mod.getAllTags(null)).toEqual([])
    expect(mod.getAllTags({})).toEqual([])
    expect(mod.getAllTags({ tags: undefined })).toEqual([])
  })

  it('flattens every tag group in declaration order', () => {
    expect(mod.getAllTags(VOCAB)).toEqual(['planning', 'review', 'indexing'])
  })
})

describe('suggestTags', () => {
  it('matches tags case-insensitively against the body', () => {
    expect(mod.suggestTags('We do PLANNING here', ['planning', 'review'])).toEqual(['planning'])
  })

  it('returns [] when nothing matches or no tags are known', () => {
    expect(mod.suggestTags('body', ['planning'])).toEqual([])
    expect(mod.suggestTags('planning', [])).toEqual([])
  })
})

describe('suggestEntities', () => {
  it('returns [] without vocabulary or entity_patterns', () => {
    expect(mod.suggestEntities('vitest', null)).toEqual([])
    expect(mod.suggestEntities('vitest', {})).toEqual([])
  })

  it('matches entity regexes case-insensitively', () => {
    expect(mod.suggestEntities('We use VITEST and npm.', VOCAB)).toEqual(['vitest', 'npm'])
  })

  it('skips invalid regexes and still matches later patterns', () => {
    expect(mod.suggestEntities('this is broken', VOCAB)).toEqual(['broken'])
  })
})

// ── inferCategory / inferDocType ───────────────────────────────────────────

describe('inferCategory', () => {
  it('returns context when no vocabulary or category map is available', () => {
    expect(mod.inferCategory('progress.md', null)).toBe('context')
    expect(mod.inferCategory('progress.md', {})).toBe('context')
  })

  it('uses the file_category_map entry by basename', () => {
    expect(mod.inferCategory('activeContext.md', VOCAB)).toBe('memory_ops')
    expect(mod.inferCategory('.activeContext.md', VOCAB)).toBe('memory_ops')
  })

  it('falls back to task for /tasks/ paths, decision for docs, else context', () => {
    expect(mod.inferCategory('memory-bank/tasks/T1.md', VOCAB)).toBe('task')
    expect(mod.inferCategory('docs/guide.md', VOCAB)).toBe('decision')
    expect(mod.inferCategory('memory-bank/other.md', VOCAB)).toBe('context')
  })
})

describe('inferDocType', () => {
  it('maps known document ids', () => {
    expect(mod.inferDocType('tracker-log')).toBe('tracker-log')
    expect(mod.inferDocType('orchestrator-log')).toBe('orchestrator-log')
    expect(mod.inferDocType('architecture-context')).toBe('architecture')
    expect(mod.inferDocType('playwright-mcp-configuration')).toBe('configuration')
  })

  it('strips a leading dot before the lookup', () => {
    expect(mod.inferDocType('.tracker-log')).toBe('tracker-log')
  })

  it('detects spikes and defaults to decision', () => {
    expect(mod.inferDocType('spike-memory')).toBe('spike')
    expect(mod.inferDocType('random-doc')).toBe('decision')
  })
})

// ── getGitMtime / buildFrontmatterYaml ─────────────────────────────────────

describe('getGitMtime', () => {
  it('formats the file mtime as YYYY-MM-DD', () => {
    const filePath = writeRepoFile(root, 'memory-bank/dated.md', '# Dated\n')
    utimesSync(filePath, new Date(2024, 2, 5, 12), new Date(2024, 2, 5, 12))
    expect(mod.getGitMtime(filePath)).toBe('2024-03-05')
  })

  it('falls back to today when stat fails', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(mod.getGitMtime(join(root, 'memory-bank/does-not-exist.md'))).toBe(today)
  })
})

describe('buildFrontmatterYaml', () => {
  it('renders arrays inline and scalars quoted', () => {
    const yaml = mod.buildFrontmatterYaml({ id: 'x', tags: ['a', 'b'], updated: '2024-01-01' })
    expect(yaml).toBe('---\nid: "x"\ntags: [a, b]\nupdated: "2024-01-01"\n---\n')
  })

  it('renders an empty array', () => {
    expect(mod.buildFrontmatterYaml({ tags: [] })).toBe('---\ntags: []\n---\n')
  })
})

// ── collectMdFiles ─────────────────────────────────────────────────────────

describe('collectMdFiles', () => {
  it('returns [] for a missing directory', () => {
    expect(mod.collectMdFiles(join(root, 'nope'))).toEqual([])
  })

  it('collects nested markdown files and ignores non-markdown files', () => {
    writeRepoFile(root, 'tree/a.md', 'a')
    writeRepoFile(root, 'tree/nested/b.md', 'b')
    writeRepoFile(root, 'tree/notes.txt', 'nope')

    const files = mod.collectMdFiles(join(root, 'tree'))
    expect(files).toHaveLength(2)
    expect(files.some((f) => f.endsWith('a.md'))).toBe(true)
    expect(files.some((f) => f.endsWith('b.md'))).toBe(true)
  })

  it('skips the configured skipDir and hidden directories, but keeps .index', () => {
    writeRepoFile(root, 'tree/keep.md', 'keep')
    writeRepoFile(root, 'tree/.index/indexed.md', 'indexed')
    writeRepoFile(root, 'tree/tasks/t.md', 'task')
    writeRepoFile(root, 'tree/.git/config.md', 'git')

    const withoutTasks = mod.collectMdFiles(join(root, 'tree'), 'tasks')
    expect(withoutTasks.some((f) => f.endsWith('keep.md'))).toBe(true)
    expect(withoutTasks.some((f) => f.endsWith('indexed.md'))).toBe(true)
    expect(withoutTasks.some((f) => f.endsWith('t.md'))).toBe(false)
    expect(withoutTasks.some((f) => f.endsWith('config.md'))).toBe(false)
  })

  it('ignores symbolic links (neither file nor directory entries)', () => {
    writeRepoFile(root, 'tree/real.md', 'real')
    symlinkSync(join(root, 'tree/real.md'), join(root, 'tree/link.md'))

    const files = mod.collectMdFiles(join(root, 'tree'))
    expect(files).toHaveLength(1)
    expect(files[0].endsWith('real.md')).toBe(true)
  })
})

// ── loadVocabulary ─────────────────────────────────────────────────────────

describe('loadVocabulary', () => {
  it('reads the consumer vocabulary', () => {
    expect(mod.loadVocabulary()).toEqual(VOCAB)
  })

  it('falls back to the package vocabulary when the consumer has none', async () => {
    const fallbackRoot = createTempDir()
    const fallbackMod = await loadModule({ root: fallbackRoot })

    const vocab = fallbackMod.loadVocabulary()
    expect(vocab).toBeTruthy()
    expect(vocab.tags).toBeTruthy()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('prefers INIT_CWD over process.cwd() for path resolution', async () => {
    const consumerRoot = createTempDir()
    writeVocab(consumerRoot, { tags: { topic: ['from-init-cwd'] } })

    // chdir somewhere else entirely; INIT_CWD must win.
    process.chdir(createTempDir())
    process.env.INIT_CWD = consumerRoot
    process.argv = [ORIGINAL_ARGV[0], 'normalize-memory.js']
    vi.resetModules()
    const initCwdMod = await import('./normalize-memory.js')

    expect(initCwdMod.loadVocabulary()).toEqual({ tags: { topic: ['from-init-cwd'] } })
  })

  it('throws on malformed JSON', () => {
    writeRepoFile(root, 'memory-bank/.vocabulary.json', '{ not json')
    expect(() => mod.loadVocabulary()).toThrow()
  })
})

// ── normalizeFile ──────────────────────────────────────────────────────────

describe('normalizeFile', () => {
  it('adds frontmatter to a memory-bank file and preserves the body byte-for-byte', () => {
    const filePath = writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)

    const result = mod.normalizeFile(filePath, VOCAB, mod.getAllTags(VOCAB), true)

    expect(result.action).toBe('normalized')
    expect(result.tags).toEqual(['planning', 'indexing'])
    expect(result.entities).toEqual(['vitest', 'npm'])
    expect(result.category).toBe('memory_ops')

    const content = readRepoFile(root, 'memory-bank/activeContext.md')
    expectFrontmatter(content, [
      'id: "activeContext"',
      'title: "My Title"',
      'tags: [planning, indexing]',
      'entities: [vitest, npm]',
      'category: "memory_ops"',
    ])
    expect(/^updated: "\d{4}-\d{2}-\d{2}"$/m.test(content)).toBe(true)
    // The writer joins the YAML block and the original body with one blank
    // line; everything after that separator is byte-identical to the input.
    expect(bodyAfterFrontmatter(content)).toBe(`\n${MEMORY_FILE}`)
  })

  it('writes tags: [] when nothing matches', () => {
    const filePath = writeRepoFile(root, 'memory-bank/plain.md', '# Plain\n\nNothing notable here.\n')
    mod.normalizeFile(filePath, VOCAB, mod.getAllTags(VOCAB), true)

    expect(readRepoFile(root, 'memory-bank/plain.md')).toContain('tags: []\n')
  })

  it('uses entities: [] and the default category when no patterns/files map match', () => {
    const filePath = writeRepoFile(root, 'memory-bank/misc.md', '# Misc\n\nUnrelated prose only.\n')
    const result = mod.normalizeFile(filePath, null, [], true)

    expect(result.entities).toEqual([])
    expect(result.category).toBe('context')
    expect(readRepoFile(root, 'memory-bank/misc.md')).toContain('entities: []\n')
  })

  it('adds doc_type instead of entities/category for docs files', () => {
    const filePath = writeRepoFile(root, 'docs/architecture-context.md', DOC_FILE)

    const result = mod.normalizeFile(filePath, VOCAB, mod.getAllTags(VOCAB), false)

    expect(result.category).toBe('architecture')
    const content = readRepoFile(root, 'docs/architecture-context.md')
    expect(content).toContain('doc_type: "architecture"\n')
    expect(content).not.toContain('entities:')
    expect(content).not.toContain('category:')
  })

  it('skips a file that already has frontmatter', () => {
    const original = '---\nid: old\ntitle: "Old"\n---\n# Body\n\ncontent\n'
    const filePath = writeRepoFile(root, 'memory-bank/activeContext.md', original)

    const result = mod.normalizeFile(filePath, VOCAB, mod.getAllTags(VOCAB), true)

    expect(result).toEqual({
      file: filePath,
      action: 'skipped',
      reason: 'already normalized',
    })
    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toBe(original)
  })

  it('replaces existing frontmatter and keeps the body under --force', async () => {
    const original = '---\nid: old\ntitle: "Old"\n---\n# New Title\n\nKept body.\n'
    const filePath = writeRepoFile(root, 'memory-bank/activeContext.md', original)
    const forced = await loadModule({ root, argv: ['--force'] })

    const result = forced.normalizeFile(filePath, VOCAB, forced.getAllTags(VOCAB), true)

    expect(result.action).toBe('normalized')
    const content = readRepoFile(root, 'memory-bank/activeContext.md')
    expect(content).not.toContain('id: old')
    expect(content).toContain('id: "activeContext"')
    expect(bodyAfterFrontmatter(content)).toBe('\n# New Title\n\nKept body.\n')
  })

  it('does not write files under --dry-run and reports would-normalize', async () => {
    const filePath = writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)
    const dry = await loadModule({ root, argv: ['--dry-run'] })

    const result = dry.normalizeFile(filePath, VOCAB, dry.getAllTags(VOCAB), true)

    expect(result.action).toBe('would-normalize')
    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toBe(MEMORY_FILE)
  })

  it('defaults docs files to doc_type decision when nothing else matches', () => {
    const filePath = writeRepoFile(root, 'docs/x.md', '# X\n\nbody\n')
    const result = mod.normalizeFile(filePath, VOCAB, [], false)
    expect(result.category).toBe('decision')
  })
})

// ── migratePlanToDocs ──────────────────────────────────────────────────────

describe('migratePlanToDocs', () => {
  it('returns [] when plan/ does not exist', () => {
    expect(mod.migratePlanToDocs(VOCAB, mod.getAllTags(VOCAB))).toEqual([])
  })

  it('returns [] when plan/ contains no markdown', () => {
    writeRepoFile(root, 'plan/notes.txt', 'not markdown')
    expect(mod.migratePlanToDocs(VOCAB, mod.getAllTags(VOCAB))).toEqual([])
  })

  it('migrates markdown into docs/ and renames the source .md to .migrated', () => {
    writeRepoFile(root, 'plan/feature-x.md', '# Feature X\n\nPlanning notes.\n')

    const results = mod.migratePlanToDocs(VOCAB, mod.getAllTags(VOCAB))

    expect(results).toHaveLength(1)
    expect(results[0].action).toBe('migrated')
    expect(results[0].to).toBe(join(root, 'docs/feature-x.md'))

    const migrated = readRepoFile(root, 'docs/feature-x.md')
    expectFrontmatter(migrated, [
      'id: "feature-x"',
      'title: "Feature X"',
      'doc_type: "decision"',
      'tags: [planning]',
    ])
    expect(bodyAfterFrontmatter(migrated)).toBe('\n# Feature X\n\nPlanning notes.\n')

    expect(existsSync(join(root, 'plan/feature-x.md'))).toBe(false)
    expect(existsSync(join(root, 'plan/feature-x.md.migrated'))).toBe(true)
    // rmdirSync cannot succeed while the .migrated sources remain, so the
    // directory survives and the "Removed empty plan/" log arm stays dead.
    expect(existsSync(join(root, 'plan'))).toBe(true)
    expect(logSpy).not.toHaveBeenCalledWith(
      '[normalize-memory] Removed empty plan/ directory',
    )
  })

  it('avoids overwriting an existing docs file by suffixing .migrated', () => {
    writeRepoFile(root, 'docs/feature-x.md', '# Existing\n')
    writeRepoFile(root, 'plan/feature-x.md', '# Feature X\n\nPlanning migration body.\n')

    const results = mod.migratePlanToDocs(VOCAB, mod.getAllTags(VOCAB))

    expect(results[0].to).toBe(join(root, 'docs/feature-x.migrated.md'))
    expect(readRepoFile(root, 'docs/feature-x.md')).toBe('# Existing\n')
    const migrated = readRepoFile(root, 'docs/feature-x.migrated.md')
    expect(migrated).toContain('id: "feature-x.migrated"')
    expect(migrated).toContain('tags: [planning]')
  })

  it('preserves a note when the plan file already had frontmatter', () => {
    writeRepoFile(root, 'plan/spike-x.md', '---\nid: spike-x\n---\n# Spike X\n\nbody text\n')

    mod.migratePlanToDocs(VOCAB, mod.getAllTags(VOCAB))

    const migrated = readRepoFile(root, 'docs/spike-x.md')
    expect(migrated).toContain('note: "Migrated from plan/ directory during normalization on ')
    expect(bodyAfterFrontmatter(migrated)).toBe('\n# Spike X\n\nbody text\n')
  })

  it('falls back to the migration tag when no vocabulary tags match', () => {
    writeRepoFile(root, 'plan/feature-y.md', '# Feature Y\n\nUnmatched prose.\n')

    mod.migratePlanToDocs(null, [])

    expect(readRepoFile(root, 'docs/feature-y.md')).toContain('tags: [migration]')
    expect(readRepoFile(root, 'docs/feature-y.md')).toContain('doc_type: "decision"')
  })

  it('keeps the plan directory when non-markdown files remain', () => {
    writeRepoFile(root, 'plan/feature-z.md', '# Feature Z\n\nbody text\n')
    writeRepoFile(root, 'plan/keep.txt', 'keep me')

    mod.migratePlanToDocs(VOCAB, mod.getAllTags(VOCAB))

    expect(existsSync(join(root, 'plan'))).toBe(true)
    expect(existsSync(join(root, 'plan/keep.txt'))).toBe(true)
    expect(existsSync(join(root, 'plan/feature-z.md.migrated'))).toBe(true)
  })

  it('writes nothing under --dry-run and reports would-migrate', async () => {
    writeRepoFile(root, 'plan/feature-d.md', '# Feature D\n\nbody text\n')
    const dry = await loadModule({ root, argv: ['--dry-run'] })

    const results = dry.migratePlanToDocs(VOCAB, dry.getAllTags(VOCAB))

    expect(results[0].action).toBe('would-migrate')
    expect(existsSync(join(root, 'docs/feature-d.md'))).toBe(false)
    expect(existsSync(join(root, 'plan/feature-d.md'))).toBe(true)
  })
})

// ── ensureDir ──────────────────────────────────────────────────────────────

describe('ensureDir', () => {
  it('creates a missing directory recursively', () => {
    const target = join(root, 'a/b/c')
    mod.ensureDir(target)
    expect(existsSync(target)).toBe(true)
  })

  it('is a no-op when the directory exists', () => {
    expect(() => mod.ensureDir(join(root, 'memory-bank'))).not.toThrow()
    expect(existsSync(join(root, 'memory-bank'))).toBe(true)
  })

  it('does not create anything under --dry-run', async () => {
    const dry = await loadModule({ root, argv: ['--dry-run'] })
    const target = join(root, 'dry/new-dir')

    dry.ensureDir(target)

    expect(existsSync(target)).toBe(false)
  })
})

// ── main ───────────────────────────────────────────────────────────────────

describe('main', () => {
  function seedConsumer() {
    writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)
    writeRepoFile(root, 'memory-bank/progress.md', '# Progress\n\nplanning progress\n')
    writeRepoFile(root, 'memory-bank/tasks/T1.md', '# Task One\n\nindexing task detail\n')
    writeRepoFile(root, 'memory-bank/.index/indexed.md', '# Indexed\n\nshould stay untouched\n')
    writeRepoFile(root, 'docs/guide.md', DOC_FILE)
    writeRepoFile(root, 'docs/.hidden.md', '# Hidden\n\nhidden doc body\n')
    writeRepoFile(root, 'docs/.index/idx.md', '# Indexed Doc\n\nshould stay untouched\n')
    writeRepoFile(root, 'plan/feature-main.md', '# Feature Main\n\nplanning body\n')
    writeRepoFile(root, 'memory-bank/notes.txt', 'not markdown')
  }

  it('normalizes memory-bank and docs files, migrates plan/, and writes the marker', () => {
    seedConsumer()

    mod.main()

    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toContain('category: "memory_ops"')
    // inferCategory receives the basename in normalizeFile, so the /tasks/
    // heuristic only applies when it is called with a path (unit-tested above).
    expect(readRepoFile(root, 'memory-bank/tasks/T1.md')).toContain('category: "context"')
    expect(readRepoFile(root, 'docs/guide.md')).toContain('doc_type: "decision"')
    expect(readRepoFile(root, 'docs/.hidden.md')).toContain('id: ".hidden"')

    // .index content is skipped by both collectMdFiles (dir skip) and the docs
    // loop's explicit guard.
    expect(readRepoFile(root, 'memory-bank/.index/indexed.md')).toBe('# Indexed\n\nshould stay untouched\n')
    expect(readRepoFile(root, 'docs/.index/idx.md')).toBe('# Indexed Doc\n\nshould stay untouched\n')

    // plan migration ran before docs normalization; the source survives as
    // plan/<name>.md.migrated because plan/ is never empty afterwards.
    expect(readRepoFile(root, 'docs/feature-main.md')).toContain('id: "feature-main"')
    expect(existsSync(join(root, 'plan/feature-main.md.migrated'))).toBe(true)

    const marker = readRepoFile(root, 'memory-bank/.normalized')
    expect(marker).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Mode: normal')
    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Found 3 memory-bank files')
    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Created .normalized marker')
    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Done.')
  })

  it('logs migrated plan files and per-file normalize lines', () => {
    seedConsumer()

    mod.main()

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[normalize-memory] Migrated 1 files from plan/ to docs/'),
    )
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('normalized: activeContext.md (tags: ['))
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/normalized: guide\.md \(tags: \[/))
  })

  it('skips files that are already normalized (no per-file log line)', () => {
    writeRepoFile(root, 'memory-bank/activeContext.md', '---\nid: activeContext\n---\n# Done\n\nalready\n')

    mod.main()

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('normalized: activeContext.md'))
    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Found 1 memory-bank files')
  })

  it('exits early when the .normalized marker already exists', () => {
    writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)
    writeRepoFile(root, 'memory-bank/.normalized', 'already\n')
    const exitError = new Error('process.exit(0)')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError
    })

    expect(() => mod.main()).toThrow(exitError)
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(logSpy).toHaveBeenCalledWith(
      '[normalize-memory] Already normalized. Use --force to re-run.',
    )
    // Nothing was normalized because the early return happened first.
    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toBe(MEMORY_FILE)
  })

  it('re-normalizes when the marker exists under --force', async () => {
    writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)
    writeRepoFile(root, 'memory-bank/.normalized', 'already\n')
    const forced = await loadModule({ root, argv: ['--force'] })

    forced.main()

    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toContain('id: "activeContext"')
    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Mode: force')
  })

  it('ignores the marker under --dry-run, changes nothing and writes no marker', async () => {
    writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)
    writeRepoFile(root, 'plan/feature-dry.md', '# Feature Dry\n\nbody text\n')
    const dry = await loadModule({ root, argv: ['--dry-run'] })

    dry.main()

    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toBe(MEMORY_FILE)
    expect(existsSync(join(root, 'plan/feature-dry.md'))).toBe(true)
    expect(existsSync(join(root, 'docs/feature-dry.md'))).toBe(false)
    expect(existsSync(join(root, 'memory-bank/.normalized'))).toBe(false)
    expect(logSpy).toHaveBeenCalledWith('[normalize-memory] Mode: dry-run')
  })

  it('creates missing memory-bank/ and docs/ directories in normal mode', () => {
    const emptyRoot = createTempDir()
    return loadModule({ root: emptyRoot }).then((fresh) => {
      fresh.main()
      expect(existsSync(join(emptyRoot, 'memory-bank/.normalized'))).toBe(true)
    })
  })
})

// ── direct-run guard ───────────────────────────────────────────────────────

describe('direct-run guard', () => {
  it('does not run main() when imported', async () => {
    writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)

    const imported = await loadModule({ root })

    expect(imported.main).toBeTypeOf('function')
    expect(existsSync(join(root, 'memory-bank/.normalized'))).toBe(false)
    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toBe(MEMORY_FILE)
  })

  it('runs main() on import when executed directly', async () => {
    writeRepoFile(root, 'memory-bank/activeContext.md', MEMORY_FILE)
    process.chdir(root)
    delete process.env.INIT_CWD
    process.argv = [ORIGINAL_ARGV[0], SCRIPT_PATH]
    vi.resetModules()

    await import('./normalize-memory.js')

    expect(existsSync(join(root, 'memory-bank/.normalized'))).toBe(true)
    expect(readRepoFile(root, 'memory-bank/activeContext.md')).toContain('id: "activeContext"')
  })
})
