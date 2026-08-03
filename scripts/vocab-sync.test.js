// ═════════════════════════════════════════════════════════════════════════════
// vocab-sync.test.js — Unit tests for scripts/vocab-sync.js
// ═════════════════════════════════════════════════════════════════════════════
//
// Tests the pre-commit vocabulary sync hook (plan/feature-vocab-sync-1.md T2).
// Fixtures use REAL temp directories with a real `git init` repo (matches the
// sync.test.js / hooks.test.js conventions) rather than heavy fs/child_process
// mocking. Because the module resolves `memory-bank/` from `process.cwd()` at
// import time (module-level MEMORY_BANK_DIR / VOCAB_PATH), each test:
//   1. creates a temp dir,
//   2. process.chdir() into it,
//   3. vi.resetModules() + dynamic import so the paths point at the fixture.
// A small set of CLI-level tests spawn the real script (`spawnSync`) to verify
// the actual exit-code contract (exit 0 for graceful paths, exit 1 for
// unhandled errors) through the isDirectRun guard.
//
// Covered scenarios (plan T2 TEST-01..14 → 54 tests implemented):
//   1.  parseFrontmatter: array tags, quoted values, quoted array entries,
//       non-kv lines skipped, none
//   2.  normalizeTag: lowercase/kebab, underscores→hyphens, whitespace runs,
//       trims, whitespace-only/empty → '', kebab preserved
//   3.  buildKnownTags: tags.* values + entity_patterns keys, normalization,
//       empty/undefined vocab, null entity_patterns
//   4.  loadVocabulary: present, missing (warn + null), malformed (warn + null)
//   5.  getStagedMemoryFiles: memory-bank .md filter, /.index/ exclusion,
//       non-git → []
//   6.  collectNewTags: new tags, known-tag skip, entity_patterns skip,
//       normalize + dedupe + sort across files, blank drop, unreadable file,
//       no frontmatter, non-array tags
//   7.  syncVocabulary: append + write + stage + warn, dedupe, existing-entry
//       normalization, no-op (no write / no stage), git-add-failure warns only,
//       missing tags object / missing topic group
//   8.  main(): TEST-01 new tag staged; TEST-02 tags.workflow skip;
//       TEST-03 entity_patterns skip (npm); TEST-04 "My Tag" → my-tag;
//       TEST-05 "my_tag" → my-tag; TEST-06/07 whitespace/empty drop;
//       TEST-08 dedupe; TEST-09 multi-file sort; TEST-10 all-known no-op;
//       TEST-11 idempotency; TEST-12 missing vocab; TEST-13 no staged files
//   9.  CLI spawned: add → exit 0; missing vocab → exit 0 warn;
//       malformed vocab → exit 0 warn; TEST-14 write failure → exit 1
//  10.  Direct-run guard (isDirectRun true): main() runs on import, unhandled
//       error → console.error + process.exit(1)
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// ── Fixture helpers ────────────────────────────────────────────────────────

const ORIGINAL_CWD = process.cwd()
const ORIG_ARGV1 = process.argv[1]
const SCRIPT_PATH = fileURLToPath(new URL('./vocab-sync.js', import.meta.url))
const tempDirs = new Set()

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'vocab-sync-test-'))
  tempDirs.add(dir)
  return dir
}

/** Write memory-bank/.vocabulary.json using the repo's canonical format. */
function writeVocab(dir, vocab) {
  const mbDir = join(dir, 'memory-bank')
  mkdirSync(mbDir, { recursive: true })
  writeFileSync(join(mbDir, '.vocabulary.json'), `${JSON.stringify(vocab, null, 2)}\n`, 'utf8')
}

/** Read and parse memory-bank/.vocabulary.json from a fixture dir. */
function readVocab(dir) {
  return JSON.parse(readFileSync(join(dir, 'memory-bank', '.vocabulary.json'), 'utf8'))
}

/** Write a file at a repo-relative path, creating parent directories. */
function writeRepoFile(dir, relPath, content) {
  const filePath = join(dir, relPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

/** Build a markdown file with YAML frontmatter containing the given tags. */
function frontmatterWithTags(tags) {
  return [
    '---',
    'id: fixture',
    'title: Fixture',
    `tags: [${tags.join(', ')}]`,
    'entities: []',
    'category: context',
    '---',
    '',
    '# Fixture',
    'body',
  ].join('\n')
}

/** Initialize a fresh git repo in dir (staged diff works before any commit). */
function gitInitRepo(dir) {
  execSync('git init -q', { cwd: dir })
}

/** Stage files by repo-relative path. */
function gitAdd(dir, paths) {
  for (const p of paths) {
    execSync(`git add -- "${p}"`, { cwd: dir })
  }
}

/** Return the list of staged file paths via git diff --cached. */
function gitStagedFiles(dir) {
  return execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

/**
 * Load vocab-sync.js with its module-level paths resolved against `dir`.
 * Chdir must happen BEFORE import because MEMORY_BANK_DIR / VOCAB_PATH are
 * computed from process.cwd() at module evaluation time.
 */
async function loadVocabSyncIn(dir) {
  process.chdir(dir)
  vi.resetModules()
  return await import('./vocab-sync.js')
}

/** Load the module in a fresh throwaway temp dir (for pure-function tests). */
function loadFresh() {
  return loadVocabSyncIn(createTempDir())
}

/** Run the real script as a child process from dir; returns spawnSync result. */
function runScript(dir) {
  return spawnSync('node', [SCRIPT_PATH], {
    cwd: dir,
    encoding: 'utf8',
  })
}

// ── Test lifecycle ─────────────────────────────────────────────────────────

let warnSpy

beforeEach(() => {
  process.chdir(ORIGINAL_CWD)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  process.chdir(ORIGINAL_CWD)
  process.argv[1] = ORIG_ARGV1
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
  it('parses an array-valued tags field', async () => {
    const vs = await loadFresh()
    const fm = vs.parseFrontmatter(frontmatterWithTags(['alpha', 'beta']))
    expect(fm.tags).toEqual(['alpha', 'beta'])
  })

  it('strips surrounding quotes from array entries', async () => {
    const vs = await loadFresh()
    const content = '---\ntags: ["one", "two"]\n---\nBody'
    expect(vs.parseFrontmatter(content).tags).toEqual(['one', 'two'])
  })

  it('parses quoted scalar values', async () => {
    const vs = await loadFresh()
    const content = '---\ntitle: "My Title"\n---\nBody'
    expect(vs.parseFrontmatter(content).title).toBe('My Title')
  })

  it('skips lines that are not key: value pairs', async () => {
    const vs = await loadFresh()
    const content = '---\nid: x\n- list item\ntags: [alpha]\n---\nBody'
    const fm = vs.parseFrontmatter(content)
    expect(fm.id).toBe('x')
    expect(fm.tags).toEqual(['alpha'])
  })

  it('returns null when there is no frontmatter block', async () => {
    const vs = await loadFresh()
    expect(vs.parseFrontmatter('# Just a heading')).toBeNull()
  })
})

// ── normalizeTag ───────────────────────────────────────────────────────────

describe('normalizeTag', () => {
  it('lowercases and converts spaces to kebab-case', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('My Tag')).toBe('my-tag')
  })

  it('converts underscores to hyphens', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('my_tag')).toBe('my-tag')
  })

  it('collapses runs of whitespace into a single hyphen', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('  Multi   Word  ')).toBe('multi-word')
  })

  it('trims surrounding whitespace', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('  padded  ')).toBe('padded')
  })

  it('returns an empty string for whitespace-only input', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('   ')).toBe('')
  })

  it('returns an empty string for empty input', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('')).toBe('')
  })

  it('preserves already-normalized kebab-case tags', async () => {
    const vs = await loadFresh()
    expect(vs.normalizeTag('already-kebab')).toBe('already-kebab')
  })
})

// ── buildKnownTags ─────────────────────────────────────────────────────────

describe('buildKnownTags', () => {
  it('collects every value across tags.* groups and entity_patterns keys', async () => {
    const vs = await loadFresh()
    const vocab = {
      tags: { topic: ['alpha', 'Beta Tag'], workflow: ['gamma'] },
      entity_patterns: { npm: ['npm'], vitest: ['vitest'] },
    }
    const known = vs.buildKnownTags(vocab)
    expect(known.has('alpha')).toBe(true)
    expect(known.has('beta-tag')).toBe(true)
    expect(known.has('gamma')).toBe(true)
    expect(known.has('npm')).toBe(true)
    expect(known.has('vitest')).toBe(true)
  })

  it('returns an empty set when vocab has no tags or entity_patterns', async () => {
    const vs = await loadFresh()
    expect(vs.buildKnownTags({}).size).toBe(0)
  })

  it('handles an undefined vocab gracefully', async () => {
    const vs = await loadFresh()
    expect(vs.buildKnownTags(undefined).size).toBe(0)
  })

  it('handles a null entity_patterns object', async () => {
    const vs = await loadFresh()
    const known = vs.buildKnownTags({
      tags: { topic: ['alpha'] },
      entity_patterns: null,
    })
    expect(known.has('alpha')).toBe(true)
  })

  it('skips non-array groups without iterating characters when tags is an array (wrong shape)', async () => {
    const vs = await loadFresh()
    const known = vs.buildKnownTags({ tags: ['alpha', 'beta'] })
    // If the guard were missing, iterating the string 'alpha' would add
    // per-character entries ('a', 'l', 'p', ...) to the known set.
    expect(known.size).toBe(0)
  })

  it('skips a string group while still collecting valid array groups (wrong shape)', async () => {
    const vs = await loadFresh()
    const known = vs.buildKnownTags({
      tags: { topic: 'alpha', workflow: ['beta'] },
    })
    expect(known.has('alpha')).toBe(false)
    expect(known.has('beta')).toBe(true)
  })
})

// ── loadVocabulary ─────────────────────────────────────────────────────────

describe('loadVocabulary', () => {
  it('returns the parsed vocabulary when present', async () => {
    const dir = createTempDir()
    const vocab = { tags: { topic: ['alpha'] } }
    writeVocab(dir, vocab)
    const vs = await loadVocabSyncIn(dir)
    expect(vs.loadVocabulary()).toEqual(vocab)
  })

  it('warns and returns null when .vocabulary.json is missing', async () => {
    const dir = createTempDir()
    mkdirSync(join(dir, 'memory-bank'), { recursive: true })
    const vs = await loadVocabSyncIn(dir)
    expect(vs.loadVocabulary()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No .vocabulary.json'))
  })

  it('warns and returns null when .vocabulary.json is malformed JSON', async () => {
    const dir = createTempDir()
    const mbDir = join(dir, 'memory-bank')
    mkdirSync(mbDir, { recursive: true })
    writeFileSync(join(mbDir, '.vocabulary.json'), '{ not valid json', 'utf8')
    const vs = await loadVocabSyncIn(dir)
    expect(vs.loadVocabulary()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'))
  })
})

// ── getStagedMemoryFiles ───────────────────────────────────────────────────

describe('getStagedMemoryFiles', () => {
  it('returns only staged memory-bank markdown files, excluding /.index/', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/activeContext.md', frontmatterWithTags(['a']))
    writeRepoFile(dir, 'memory-bank/tasks/task.md', frontmatterWithTags(['b']))
    writeRepoFile(dir, 'memory-bank/.index/cache.md', 'cache')
    writeRepoFile(dir, 'docs/readme.md', '# readme')
    gitAdd(dir, [
      'memory-bank/activeContext.md',
      'memory-bank/tasks/task.md',
      'memory-bank/.index/cache.md',
      'docs/readme.md',
    ])
    const vs = await loadVocabSyncIn(dir)
    const files = vs.getStagedMemoryFiles()
    expect(files).toContain('memory-bank/activeContext.md')
    expect(files).toContain('memory-bank/tasks/task.md')
    expect(files).not.toContain('memory-bank/.index/cache.md')
    expect(files).not.toContain('docs/readme.md')
  })

  it('returns an empty array when the directory is not a git repo', async () => {
    const dir = createTempDir()
    const vs = await loadVocabSyncIn(dir)
    expect(vs.getStagedMemoryFiles()).toEqual([])
  })
})

// ── collectNewTags ─────────────────────────────────────────────────────────

describe('collectNewTags', () => {
  it('returns tags not present in the vocabulary', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag', 'known-tag']))
    const vs = await loadVocabSyncIn(dir)
    const vocab = { tags: { topic: ['known-tag'] }, entity_patterns: {} }
    expect(vs.collectNewTags(['memory-bank/a.md'], vocab)).toEqual(['new-tag'])
  })

  it('does not collect tags that are entity_patterns keys', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['npm']))
    const vs = await loadVocabSyncIn(dir)
    const vocab = { tags: { topic: [] }, entity_patterns: { npm: ['npm'] } }
    expect(vs.collectNewTags(['memory-bank/a.md'], vocab)).toEqual([])
  })

  it('normalizes candidates, dedupes, and sorts across multiple files', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['Zeta Tag', 'alpha_tag', 'beta', 'beta']))
    writeRepoFile(dir, 'memory-bank/b.md', frontmatterWithTags(['alpha_tag', 'gamma']))
    const vs = await loadVocabSyncIn(dir)
    const vocab = { tags: { topic: [] } }
    expect(
      vs.collectNewTags(['memory-bank/a.md', 'memory-bank/b.md'], vocab),
    ).toEqual(['alpha-tag', 'beta', 'gamma', 'zeta-tag'])
  })

  it('drops empty and whitespace-only candidates', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['', '   ', 'real-tag']))
    const vs = await loadVocabSyncIn(dir)
    expect(
      vs.collectNewTags(['memory-bank/a.md'], { tags: { topic: [] } }),
    ).toEqual(['real-tag'])
  })

  it('skips unreadable files without crashing', async () => {
    const dir = createTempDir()
    const vs = await loadVocabSyncIn(dir)
    expect(
      vs.collectNewTags(['memory-bank/missing.md'], { tags: { topic: [] } }),
    ).toEqual([])
  })

  it('returns no tags when a file has no frontmatter', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', '# No frontmatter here\n\nbody')
    const vs = await loadVocabSyncIn(dir)
    expect(
      vs.collectNewTags(['memory-bank/a.md'], { tags: { topic: [] } }),
    ).toEqual([])
  })

  it('skips a tags field that is not an array', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', '---\ntags: solo-tag\n---\nBody')
    const vs = await loadVocabSyncIn(dir)
    expect(
      vs.collectNewTags(['memory-bank/a.md'], { tags: { topic: [] } }),
    ).toEqual([])
  })
})

// ── syncVocabulary ─────────────────────────────────────────────────────────

describe('syncVocabulary', () => {
  it('appends new tags to topic, writes the file, stages it, and warns', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['fresh-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: ['existing'] } })
    const vs = await loadVocabSyncIn(dir)

    const changed = vs.syncVocabulary(['memory-bank/a.md'], readVocab(dir))

    expect(changed).toBe(true)
    expect(readVocab(dir).tags.topic).toEqual(['existing', 'fresh-tag'])
    expect(gitStagedFiles(dir)).toContain('memory-bank/.vocabulary.json')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Added 1 tag(s)'))
  })

  it('deduplicates duplicate candidates into a single topic entry', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['dup-tag', 'dup-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.syncVocabulary(['memory-bank/a.md'], readVocab(dir))

    expect(readVocab(dir).tags.topic).toEqual(['dup-tag'])
  })

  it('normalizes existing topic entries when merging new tags', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['brand-new']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: ['Mixed Case'] } })
    const vs = await loadVocabSyncIn(dir)

    vs.syncVocabulary(['memory-bank/a.md'], readVocab(dir))

    expect(readVocab(dir).tags.topic).toEqual(['brand-new', 'mixed-case'])
  })

  it('returns false and writes nothing when there are no new tags', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['known']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: ['known'] } })
    const vs = await loadVocabSyncIn(dir)
    const before = readVocab(dir)

    const changed = vs.syncVocabulary(['memory-bank/a.md'], before)

    expect(changed).toBe(false)
    expect(readVocab(dir)).toEqual(before)
    expect(gitStagedFiles(dir)).not.toContain('memory-bank/.vocabulary.json')
  })

  it('warns but still succeeds when git add fails (never blocks)', async () => {
    const dir = createTempDir()
    // NOT a git repo — the git add call throws and is caught
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    const changed = vs.syncVocabulary(['memory-bank/a.md'], readVocab(dir))

    expect(changed).toBe(true)
    expect(readVocab(dir).tags.topic).toEqual(['new-tag'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not stage'))
  })

  it('creates the tags object and topic group when both are missing', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    writeVocab(dir, { entity_patterns: { npm: ['npm'] } })
    const vs = await loadVocabSyncIn(dir)

    vs.syncVocabulary(['memory-bank/a.md'], readVocab(dir))

    const vocab = readVocab(dir)
    expect(vocab.tags.topic).toEqual(['new-tag'])
    expect(vocab.entity_patterns).toEqual({ npm: ['npm'] })
  })

  it('creates the topic group when tags exists without it', async () => {
    const dir = createTempDir()
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    writeVocab(dir, { tags: { topic: null } })
    const vs = await loadVocabSyncIn(dir)

    vs.syncVocabulary(['memory-bank/a.md'], readVocab(dir))

    expect(readVocab(dir).tags.topic).toEqual(['new-tag'])
  })
})

// ── main (end-to-end with a real temp git repo) ───────────────────────────

describe('main (end-to-end with real temp git repo)', () => {
  it('TEST-01: new tag is appended to topic and staged', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/activeContext.md', frontmatterWithTags(['brand-new-tag']))
    gitAdd(dir, ['memory-bank/activeContext.md'])
    writeVocab(dir, { tags: { topic: ['existing'] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    expect(readVocab(dir).tags.topic).toEqual(['brand-new-tag', 'existing'])
    expect(gitStagedFiles(dir)).toContain('memory-bank/.vocabulary.json')
  })

  it('TEST-02: tag already in tags.workflow is not appended', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['migration']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { workflow: ['migration'], topic: [] } })
    const vs = await loadVocabSyncIn(dir)
    const before = readVocab(dir)

    vs.main()

    expect(readVocab(dir)).toEqual(before)
  })

  it('TEST-03: entity_patterns key (npm) is not appended', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['npm']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] }, entity_patterns: { npm: ['npm'] } })
    const vs = await loadVocabSyncIn(dir)
    const before = readVocab(dir)

    vs.main()

    expect(readVocab(dir)).toEqual(before)
  })

  it('TEST-04: "My Tag" is normalized to my-tag and appended', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['My Tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    expect(readVocab(dir).tags.topic).toContain('my-tag')
  })

  it('TEST-05: "my_tag" is normalized to my-tag and appended', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['my_tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    expect(readVocab(dir).tags.topic).toContain('my-tag')
  })

  it('TEST-06/07: whitespace-only and empty tags are dropped (no-op)', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['', '   ']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)
    const before = readVocab(dir)

    vs.main()

    expect(readVocab(dir)).toEqual(before)
  })

  it('TEST-08: duplicate tags in a file are deduplicated to one entry', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['dup-tag', 'dup-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    const topic = readVocab(dir).tags.topic
    expect(topic).toEqual(['dup-tag'])
    expect(topic.filter((t) => t === 'dup-tag')).toHaveLength(1)
  })

  it('TEST-09: multiple new tags across files are appended sorted alphabetically', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['zebra', 'alpha']))
    writeRepoFile(dir, 'memory-bank/b.md', frontmatterWithTags(['mid-tag']))
    gitAdd(dir, ['memory-bank/a.md', 'memory-bank/b.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    expect(readVocab(dir).tags.topic).toEqual(['alpha', 'mid-tag', 'zebra'])
  })

  it('TEST-10: all-known tags → no write and no git add', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['existing']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: ['existing'] } })
    const vs = await loadVocabSyncIn(dir)
    const before = readVocab(dir)

    vs.main()

    expect(readVocab(dir)).toEqual(before)
    expect(gitStagedFiles(dir)).not.toContain('memory-bank/.vocabulary.json')
  })

  it('TEST-11: second run is a no-op (idempotency)', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()
    const afterFirst = readVocab(dir)
    expect(afterFirst.tags.topic).toEqual(['new-tag'])

    vs.main()
    expect(readVocab(dir)).toEqual(afterFirst)
    expect(readVocab(dir).tags.topic.filter((t) => t === 'new-tag')).toHaveLength(1)
  })

  it('TEST-12: missing .vocabulary.json warns gracefully without crashing', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    const vs = await loadVocabSyncIn(dir)

    expect(() => vs.main()).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No .vocabulary.json'))
  })

  it('TEST-13: no staged memory-bank files is a silent no-op', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'docs/readme.md', '# readme')
    gitAdd(dir, ['docs/readme.md'])
    writeVocab(dir, { tags: { topic: [] } })
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('TEST-13b: no staged files at all is a silent no-op', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    const vs = await loadVocabSyncIn(dir)

    vs.main()

    expect(warnSpy).not.toHaveBeenCalled()
  })
})

// ── CLI behavior (spawned script — real exit codes) ───────────────────────

describe('CLI behavior (spawned script)', () => {
  it('exits 0 and adds the tag when run as a real pre-commit hook', () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })

    const res = runScript(dir)

    expect(res.status).toBe(0)
    expect(res.stderr).toContain('Added 1 tag(s)')
    expect(readVocab(dir).tags.topic).toContain('new-tag')
  })

  it('exits 0 with a warning when .vocabulary.json is missing', () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])

    const res = runScript(dir)

    expect(res.status).toBe(0)
    expect(res.stderr).toContain('No .vocabulary.json')
  })

  it('exits 0 with a warning when .vocabulary.json is malformed', () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    const mbDir = join(dir, 'memory-bank')
    mkdirSync(mbDir, { recursive: true })
    writeFileSync(join(mbDir, '.vocabulary.json'), '{ not valid json', 'utf8')

    const res = runScript(dir)

    expect(res.status).toBe(0)
    expect(res.stderr).toContain('Failed to parse')
  })

  it('TEST-14: exits 1 with an error on stderr when the write fails', () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    // Read-only vocabulary file → writeFileSync throws EACCES
    chmodSync(join(dir, 'memory-bank', '.vocabulary.json'), 0o444)

    const res = runScript(dir)

    expect(res.status).toBe(1)
    expect(res.stderr).toContain('Unhandled error')
    expect(res.stderr).toContain('EACCES')
  })
})

// ── Direct-run guard (isDirectRun true — in-process) ──────────────────────

describe('direct-run guard', () => {
  let exitSpy
  let errorSpy

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('runs main() on import and exits normally when executed directly', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })

    process.chdir(dir)
    process.argv[1] = SCRIPT_PATH
    vi.resetModules()
    await import('./vocab-sync.js')

    expect(readVocab(dir).tags.topic).toContain('new-tag')
    expect(exitSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('catches unhandled errors, logs to stderr, and exits 1', async () => {
    const dir = createTempDir()
    gitInitRepo(dir)
    writeRepoFile(dir, 'memory-bank/a.md', frontmatterWithTags(['new-tag']))
    gitAdd(dir, ['memory-bank/a.md'])
    writeVocab(dir, { tags: { topic: [] } })
    // Read-only vocabulary file → writeFileSync throws EACCES inside main()
    chmodSync(join(dir, 'memory-bank', '.vocabulary.json'), 0o444)

    process.chdir(dir)
    process.argv[1] = SCRIPT_PATH
    vi.resetModules()
    await import('./vocab-sync.js')

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled error'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
