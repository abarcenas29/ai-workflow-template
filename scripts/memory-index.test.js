// ═════════════════════════════════════════════════════════════════════════════
// memory-index.test.js — Unit tests for the sqlite-vec memory index engine
// ═════════════════════════════════════════════════════════════════════════════
//
// The engine keeps module-level state (the sqlite handle, the embedder cache)
// and resolves memory-bank/ + docs/ from process.cwd() at import time, so each
// scenario:
//   1. creates a temp consumer root with its own SQLite DB under
//      memory-bank/.index/ (never the repository's real DB),
//   2. chdir()s into it,
//   3. vi.resetModules() + dynamic import so paths and caches are fresh.
//
// better-sqlite3 and sqlite-vec are REAL dependencies and load in this
// environment (verified before writing the tests), so the DB layer is
// exercised end-to-end. Only @xenova/transformers is mocked: the real model is
// a ~90 MB download, and a deterministic bag-of-words embedding lets us assert
// ranking sanity without the network. The mock is wired through the same
// dynamic `import('@xenova/transformers')` the production code performs.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

// ── Deterministic embedding mock ────────────────────────────────────────────

const embedMocks = vi.hoisted(() => {
  const DIM = 384
  const FAIL_MARKER = '@@EMBED_FAIL@@'

  /** FNV-1a bag-of-words embedding, L2-normalised, 384 dims. */
  function embeddingFor(text) {
    if (String(text).includes(FAIL_MARKER)) {
      throw new Error('synthetic embedding failure')
    }
    const vector = new Array(DIM).fill(0)
    const tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) || []
    for (const token of tokens) {
      let hash = 2166136261
      for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      vector[Math.abs(hash) % DIM] += 1
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
    return vector.map((value) => value / norm)
  }

  const pipeline = vi.fn(async () => async (text) => ({ data: embeddingFor(text) }))

  return { pipeline, embeddingFor, FAIL_MARKER, DIM }
})

vi.mock('@xenova/transformers', () => ({ pipeline: embedMocks.pipeline }))

// ── Fixture helpers ─────────────────────────────────────────────────────────

const ORIGINAL_CWD = process.cwd()
const ORIGINAL_ARGV = [...process.argv]
const ORIGINAL_INIT_CWD = process.env.INIT_CWD
const tempDirs = new Set()
const loadedModules = new Set()

function createRoot(prefix = 'memory-index-test-') {
  // realpathSync keeps fixture paths identical to the module's resolve()d
  // constants on macOS, where /var is a symlink to /private/var.
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  tempDirs.add(root)
  mkdirSync(join(root, 'memory-bank'), { recursive: true })
  return root
}

function writeRepoFile(root, relPath, content) {
  const filePath = join(root, relPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

/** Load a fresh copy of the engine rooted at `root`. */
async function loadIndex(root) {
  process.chdir(root)
  delete process.env.INIT_CWD
  process.argv = [ORIGINAL_ARGV[0], 'memory-index.js']
  vi.resetModules()
  const mod = await import('./memory-index.js')
  loadedModules.add(mod)
  return mod
}

/** Open the fixture DB on a second connection (sqlite-vec loaded for vec0). */
function openDb(root, { readonly = false } = {}) {
  const db = new Database(join(root, 'memory-bank/.index/memory.db'), { readonly })
  sqliteVec.load(db)
  return db
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`
}

const FILE_TWO_SECTIONS = ['# Doc', '', section('Alpha', 'alpha alpha content'), section('Beta', 'beta beta content')].join('\n')

/** Seed memory-bank/doc.md with two ## sections. */
function writeTwoSectionFile(root) {
  return writeRepoFile(root, 'memory-bank/doc.md', FILE_TWO_SECTIONS)
}

/**
 * The vector invariant: vec0 has no foreign keys, so every vec_memory row must
 * be referenced by exactly one memory_chunks row, and every non-null
 * memory_chunks.vec_rowid must resolve. Chunks with a NULL vec_rowid are
 * allowed only when embedding legitimately failed (`expectWithoutVector`).
 */
function assertVectorIntegrity(db, { expectWithoutVector = 0 } = {}) {
  const count = (sql) => db.prepare(sql).get().count
  const vectors = count('SELECT COUNT(*) AS count FROM vec_memory')
  const linked = count('SELECT COUNT(*) AS count FROM memory_chunks WHERE vec_rowid IS NOT NULL')
  const distinctLinked = count(
    'SELECT COUNT(DISTINCT vec_rowid) AS count FROM memory_chunks WHERE vec_rowid IS NOT NULL',
  )
  const unlinked = count('SELECT COUNT(*) AS count FROM memory_chunks WHERE vec_rowid IS NULL')
  const orphaned = count(`
    SELECT COUNT(*) AS count FROM vec_memory v
    LEFT JOIN memory_chunks mc ON mc.vec_rowid = v.rowid
    WHERE mc.id IS NULL
  `)
  const dangling = count(`
    SELECT COUNT(*) AS count FROM memory_chunks mc
    LEFT JOIN vec_memory v ON v.rowid = mc.vec_rowid
    WHERE mc.vec_rowid IS NOT NULL AND v.rowid IS NULL
  `)

  expect(
    unlinked,
    `expected ${expectWithoutVector} chunk(s) without a vector, found ${unlinked}`,
  ).toBe(expectWithoutVector)
  expect(distinctLinked).toBe(linked)
  expect(vectors, 'vec_memory must hold exactly one row per linked chunk').toBe(linked)
  expect(orphaned, 'vec_memory contains row(s) no chunk references').toBe(0)
  expect(dangling, 'memory_chunks.vec_rowid points at a missing vec_memory row').toBe(0)

  return { vectors, linked, distinctLinked, unlinked, orphaned, dangling }
}

// ── Test lifecycle ─────────────────────────────────────────────────────────

let mod
let root
let logSpy
let warnSpy

beforeEach(async () => {
  embedMocks.pipeline.mockReset()
  embedMocks.pipeline.mockImplementation(
    async () => async (text) => ({ data: embedMocks.embeddingFor(text) }),
  )
  root = createRoot()
  mod = await loadIndex(root)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const loaded of loadedModules) {
    try {
      loaded.closeDB()
    } catch {
      /* already closed */
    }
  }
  loadedModules.clear()
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

// ── hashContent ────────────────────────────────────────────────────────────

describe('hashContent', () => {
  it('returns a stable 64-character sha256 hex digest', () => {
    const first = mod.hashContent('same text')
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(mod.hashContent('same text')).toBe(first)
  })

  it('changes when a single byte changes', () => {
    expect(mod.hashContent('a')).not.toBe(mod.hashContent('b'))
  })

  it('hashes unicode content as utf8', () => {
    expect(mod.hashContent('héllo ✅')).toBe(mod.hashContent('héllo ✅'))
    expect(mod.hashContent('héllo ✅')).not.toBe(mod.hashContent('hello'))
  })
})

// ── parseFrontmatter ───────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('returns null frontmatter and the untouched body when absent', () => {
    const content = '# Title\n\nBody'
    expect(mod.parseFrontmatter(content)).toEqual({ frontmatter: null, body: content })
  })

  it('parses scalars, quoted strings and inline arrays', () => {
    const content = [
      '---',
      'id: doc',
      'title: "Quoted Title"',
      'tags: [alpha, "beta", \'gamma\', ]',
      'category: context',
      '---',
      '# Body',
    ].join('\n')

    const { frontmatter, body } = mod.parseFrontmatter(content)

    expect(frontmatter).toEqual({
      id: 'doc',
      title: 'Quoted Title',
      tags: ['alpha', 'beta', 'gamma'],
      category: 'context',
    })
    expect(body).toBe('# Body')
  })

  it('keeps unquoted arrays and single-quoted scalars', () => {
    const { frontmatter } = mod.parseFrontmatter("---\ntags: [a, b]\nnote: 'single'\n---\nbody")
    expect(frontmatter.tags).toEqual(['a', 'b'])
    expect(frontmatter.note).toBe('single')
  })

  it('skips non key/value lines and supports dashed keys', () => {
    const { frontmatter } = mod.parseFrontmatter('---\nupdated-at: 2024-01-01\n- not a pair\n---\nbody')
    expect(frontmatter).toEqual({ 'updated-at': '2024-01-01' })
  })

  it('tolerates a closing fence without a trailing newline', () => {
    const { frontmatter, body } = mod.parseFrontmatter('---\nid: x\n---')
    expect(frontmatter).toEqual({ id: 'x' })
    expect(body).toBe('')
  })
})

// ── chunkMarkdown ──────────────────────────────────────────────────────────

describe('chunkMarkdown', () => {
  it('returns [] for an empty body', () => {
    expect(mod.chunkMarkdown('')).toEqual([])
    expect(mod.chunkMarkdown('   \n\n ')).toEqual([])
  })

  it('skips a standalone H1 whose section is too small to index', () => {
    expect(mod.chunkMarkdown('# Hi')).toEqual([])
  })

  it('splits on ## headings and drops the H1 preamble', () => {
    const chunks = mod.chunkMarkdown('# Title\n\nintro text\n\n## One\n\nfirst body\n\n## Two\n\nsecond body')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe('## One\n\nfirst body')
    expect(chunks[1]).toBe('## Two\n\nsecond body')
  })

  it('skips sections shorter than 10 characters', () => {
    const chunks = mod.chunkMarkdown('## A\n\nx\n\n## Real Section\n\nhas enough content')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('Real Section')
  })

  it('falls back to the whole body when no usable section is found', () => {
    const body = 'Just a paragraph with no headings at all.'
    expect(mod.chunkMarkdown(body)).toEqual([body])
  })

  it('returns one chunk for a long heading-less body', () => {
    const body = 'word '.repeat(500).trim()
    expect(mod.chunkMarkdown(body)).toEqual([body])
  })

  it('preserves every section of a very long file in order', () => {
    const sections = Array.from({ length: 40 }, (_, i) => section(`S${i}`, `content number ${i}`))
    const chunks = mod.chunkMarkdown(sections.join('\n\n'))
    expect(chunks).toHaveLength(40)
    expect(chunks[0]).toContain('S0')
    expect(chunks[39]).toContain('S39')
  })
})

// ── getStats / closeDB before any DB exists ────────────────────────────────

describe('getStats before the DB is opened', () => {
  it('returns the empty shape without touching the filesystem', () => {
    expect(mod.getStats()).toEqual({ totalVectors: 0, totalFiles: 0, dbSize: 'N/A' })
  })

  it('closeDB is a no-op when no connection exists', () => {
    expect(() => mod.closeDB()).not.toThrow()
    expect(mod.getStats().totalVectors).toBe(0)
  })
})

// ── getDB schema creation and migration ────────────────────────────────────

describe('getDB', () => {
  it('creates the schema, the unique index and the vec0 table on first use', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    const db = openDb(root)
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((row) => row.name)
      expect(tables).toContain('memory_chunks')
      expect(tables).toContain('vec_memory')

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((row) => row.name)
      expect(indexes).toContain('idx_chunk_lookup')

      const columns = db
        .prepare("SELECT name FROM pragma_table_info('memory_chunks')")
        .all()
        .map((row) => row.name)
      expect(columns).toEqual(
        expect.arrayContaining([
          'id',
          'source_file',
          'chunk_index',
          'content',
          'content_hash',
          'vec_rowid',
          'updated_at',
        ]),
      )
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    } finally {
      db.close()
    }
  })

  it('is idempotent across re-opens (schema already present)', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))
    mod.closeDB()

    const second = await loadIndex(root)
    const result = await second.indexFile(join(root, 'memory-bank/doc.md'))

    expect(result).toEqual({ indexed: 0, skipped: 2 })
  })

  it('migrates a legacy DB by adding vec_rowid and creating the vec table', async () => {
    const legacyRoot = createRoot()
    const indexPath = join(legacyRoot, 'memory-bank/.index')
    mkdirSync(indexPath, { recursive: true })
    const legacy = new Database(join(indexPath, 'memory.db'))
    legacy.exec(`
      CREATE TABLE memory_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)
    legacy.close()

    const legacyMod = await loadIndex(legacyRoot)
    writeRepoFile(legacyRoot, 'memory-bank/doc.md', FILE_TWO_SECTIONS)
    const result = await legacyMod.indexFile(join(legacyRoot, 'memory-bank/doc.md'))

    expect(result.indexed).toBe(2)
    const db = openDb(legacyRoot)
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('memory_chunks')")
        .all()
        .map((row) => row.name)
      expect(columns).toContain('vec_rowid')
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='vec_memory'").get()).toBeTruthy()
    } finally {
      db.close()
    }
  })

  it('rejects when the DB file path is not usable', async () => {
    mkdirSync(join(root, 'memory-bank/.index/memory.db'), { recursive: true })
    writeTwoSectionFile(root)

    await expect(mod.indexFile(join(root, 'memory-bank/doc.md'))).rejects.toThrow()
  })

  it('reports a helpful error when better-sqlite3 cannot be loaded', async () => {
    vi.doMock('better-sqlite3', () => {
      throw new Error('simulated missing dependency')
    })
    try {
      const broken = await loadIndex(root)
      await expect(broken.rebuildIndex()).rejects.toThrow(
        'better-sqlite3 not installed. Run: npm install better-sqlite3',
      )
    } finally {
      vi.doUnmock('better-sqlite3')
      vi.resetModules()
    }
  })

  it('reports a helpful error when sqlite-vec cannot be loaded', async () => {
    vi.doMock('sqlite-vec', () => {
      throw new Error('simulated missing dependency')
    })
    try {
      const broken = await loadIndex(root)
      writeTwoSectionFile(root)
      await expect(broken.indexFile(join(root, 'memory-bank/doc.md'))).rejects.toThrow(
        'sqlite-vec not installed. Run: npm install sqlite-vec',
      )
    } finally {
      vi.doUnmock('sqlite-vec')
      vi.resetModules()
    }
  })
})

// ── indexFile ──────────────────────────────────────────────────────────────

describe('indexFile', () => {
  it('indexes every ## section and links vectors to chunks', async () => {
    writeTwoSectionFile(root)

    const result = await mod.indexFile(join(root, 'memory-bank/doc.md'))

    expect(result).toEqual({ indexed: 2, skipped: 0 })

    const db = openDb(root)
    try {
      const chunks = db
        .prepare('SELECT source_file, chunk_index, content, content_hash, vec_rowid FROM memory_chunks ORDER BY chunk_index')
        .all()
      expect(chunks).toHaveLength(2)
      expect(chunks[0].source_file).toBe('doc.md')
      expect(chunks[0].content).toContain('Alpha')
      expect(chunks[0].content_hash).toBe(mod.hashContent(chunks[0].content))
      expect(chunks[0].vec_rowid).not.toBeNull()
      expect(chunks[1].vec_rowid).not.toBeNull()

      const vectors = db.prepare('SELECT COUNT(*) AS count FROM vec_memory').get()
      expect(vectors.count).toBe(2)
    } finally {
      db.close()
    }
  })

  it('skips unchanged chunks on re-index', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    const second = await mod.indexFile(join(root, 'memory-bank/doc.md'))

    expect(second).toEqual({ indexed: 0, skipped: 2 })
    expect(mod.getStats().totalVectors).toBe(2)
  })

  it('updates changed chunks in place and points them at the new vector', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    const db = openDb(root)
    const before = db
      .prepare('SELECT id, content, content_hash, vec_rowid FROM memory_chunks ORDER BY chunk_index')
      .all()
    db.close()

    writeRepoFile(
      root,
      'memory-bank/doc.md',
      ['# Doc', '', section('Alpha', 'alpha REWRITTEN content'), section('Beta', 'beta beta content')].join('\n'),
    )
    const result = await mod.indexFile(join(root, 'memory-bank/doc.md'))

    expect(result).toEqual({ indexed: 1, skipped: 1 })

    const after = openDb(root)
    try {
      const rows = after
        .prepare('SELECT id, content, content_hash, vec_rowid FROM memory_chunks ORDER BY chunk_index')
        .all()
      expect(rows[0].id).toBe(before[0].id)
      expect(rows[0].content).toContain('REWRITTEN')
      expect(rows[0].content_hash).not.toBe(before[0].content_hash)
      expect(rows[0].vec_rowid).not.toBe(before[0].vec_rowid)
      expect(rows[1].content_hash).toBe(before[1].content_hash)
    } finally {
      after.close()
    }
  })

  it('inserts a new chunk when a section is appended', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    writeRepoFile(
      root,
      'memory-bank/doc.md',
      [FILE_TWO_SECTIONS, section('Gamma', 'gamma gamma content')].join('\n\n'),
    )
    const result = await mod.indexFile(join(root, 'memory-bank/doc.md'))

    expect(result).toEqual({ indexed: 1, skipped: 2 })
    expect(mod.getStats().totalVectors).toBe(3)
  })

  it('keeps indexing after a single chunk fails to embed', async () => {
    const content = [
      '# Doc',
      '',
      section('Good', 'alpha alpha content'),
      section('Bad', `${embedMocks.FAIL_MARKER} broken chunk`),
      section('Also Good', 'gamma gamma content'),
    ].join('\n\n')
    writeRepoFile(root, 'memory-bank/doc.md', content)

    const result = await mod.indexFile(join(root, 'memory-bank/doc.md'))

    expect(result).toEqual({ indexed: 2, skipped: 0 })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to embed chunk 1 of doc.md: synthetic embedding failure'),
    )

    const db = openDb(root)
    try {
      const rows = db
        .prepare('SELECT chunk_index, vec_rowid FROM memory_chunks ORDER BY chunk_index')
        .all()
      expect(rows.map((row) => row.vec_rowid === null)).toEqual([false, true, false])
      expect(db.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(2)
    } finally {
      db.close()
    }
  })

  it('treats an empty file as zero chunks', async () => {
    writeRepoFile(root, 'memory-bank/empty.md', '')
    expect(await mod.indexFile(join(root, 'memory-bank/empty.md'))).toEqual({ indexed: 0, skipped: 0 })
  })

  it('treats a frontmatter-only file as zero chunks', async () => {
    writeRepoFile(root, 'memory-bank/meta.md', '---\nid: meta\ntitle: "Meta"\n---\n')
    expect(await mod.indexFile(join(root, 'memory-bank/meta.md'))).toEqual({ indexed: 0, skipped: 0 })
  })

  it('indexes a heading-less file as a single chunk', async () => {
    writeRepoFile(root, 'memory-bank/flat.md', 'A long paragraph without headings but with enough text.')
    expect(await mod.indexFile(join(root, 'memory-bank/flat.md'))).toEqual({ indexed: 1, skipped: 0 })
  })

  it('rejects for a missing markdown file', async () => {
    await expect(mod.indexFile(join(root, 'memory-bank/missing.md'))).rejects.toThrow(/ENOENT/)
  })

  it('reopens the DB after closeDB and reuses the cached driver modules', async () => {
    writeRepoFile(root, 'memory-bank/one.md', '# One\n\nfirst document content')
    writeRepoFile(root, 'memory-bank/two.md', '# Two\n\nsecond document content')

    await mod.indexFile(join(root, 'memory-bank/one.md'))
    mod.closeDB()
    expect(mod.getStats().totalVectors).toBe(0)

    // Re-opening exercises the "dependency already cached" arms of
    // getSQLite()/getVec() while the embedder stays cached too.
    const result = await mod.indexFile(join(root, 'memory-bank/two.md'))

    expect(result).toEqual({ indexed: 1, skipped: 0 })
    expect(mod.getStats().totalVectors).toBe(2)
  })

  it('reuses the cached embedder across files', async () => {
    writeRepoFile(root, 'memory-bank/one.md', '# One\n\nfirst document content')
    writeRepoFile(root, 'memory-bank/two.md', '# Two\n\nsecond document content')

    await mod.indexFile(join(root, 'memory-bank/one.md'))
    await mod.indexFile(join(root, 'memory-bank/two.md'))

    expect(embedMocks.pipeline).toHaveBeenCalledTimes(1)
  })
})

// ── embedder failure modes ─────────────────────────────────────────────────

describe('embedding dependency failures', () => {
  it('warns and skips chunks when @xenova/transformers is unavailable', async () => {
    vi.doMock('@xenova/transformers', () => {
      throw new Error('simulated missing dependency')
    })
    try {
      const broken = await loadIndex(root)
      writeTwoSectionFile(root)

      const result = await broken.indexFile(join(root, 'memory-bank/doc.md'))

      expect(result).toEqual({ indexed: 0, skipped: 0 })
      expect(warnSpy).toHaveBeenCalledWith(
        '[memory-index] @xenova/transformers not installed. Embedding unavailable.',
      )
      expect(warnSpy).toHaveBeenCalledWith(
        '[memory-index] Failed to embed chunk 0 of doc.md: Embedding model not available',
      )
    } finally {
      // vi.doUnmock() removes the hoisted mock registration for this id too,
      // so re-arm it explicitly for the rest of the file.
      vi.doMock('@xenova/transformers', () => ({ pipeline: embedMocks.pipeline }))
      vi.resetModules()
    }
  })

  it('warns and skips chunks when the model fails to load', async () => {
    embedMocks.pipeline.mockRejectedValueOnce(new Error('model download failed'))
    const failing = await loadIndex(root)
    writeTwoSectionFile(root)

    const result = await failing.indexFile(join(root, 'memory-bank/doc.md'))

    expect(result.indexed).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(
      '[memory-index] Failed to load embedding model:',
      'model download failed',
    )
  })

  it('surfaces a wrapped error when search cannot embed the query', async () => {
    const failing = await loadIndex(root)
    embedMocks.pipeline.mockRejectedValueOnce(new Error('model download failed'))

    await expect(failing.search('anything')).rejects.toThrow(
      'Embedding failed: Embedding model not available. Is @xenova/transformers installed?',
    )
  })
})

// ── rebuildIndex ───────────────────────────────────────────────────────────

describe('rebuildIndex', () => {
  it('indexes memory-bank and docs recursively and reports stats', async () => {
    writeRepoFile(root, 'memory-bank/a.md', '# A\n\nalpha alpha content')
    writeRepoFile(root, 'memory-bank/nested/b.md', '# B\n\nbeta beta content')
    writeRepoFile(root, 'docs/c.md', '# C\n\ngamma gamma content')
    writeRepoFile(root, 'docs/nested/d.md', '# D\n\ndelta delta content')
    writeRepoFile(root, 'docs/notes.txt', 'not markdown')

    const result = await mod.rebuildIndex()

    expect(result.indexed).toBe(4)
    expect(result.skipped).toBe(0)
    expect(result.stats.totalFiles).toBe(4)
    expect(result.stats.totalVectors).toBe(4)
    expect(result.stats.dbSize).toMatch(/^\d+\.\d MB$/)
  })

  it('skips .index and node_modules directories', async () => {
    writeRepoFile(root, 'memory-bank/a.md', '# A\n\nalpha alpha content')
    writeRepoFile(root, 'memory-bank/.index/hidden.md', '# Hidden\n\nhidden hidden content')
    writeRepoFile(root, 'memory-bank/node_modules/dep.md', '# Dep\n\ndep dep content')

    const result = await mod.rebuildIndex()

    expect(result.stats.totalFiles).toBe(1)
  })

  it('prunes chunks and vectors of deleted files', async () => {
    writeRepoFile(root, 'memory-bank/a.md', '# A\n\nalpha alpha content')
    await mod.rebuildIndex()

    rmSync(join(root, 'memory-bank/a.md'))
    writeRepoFile(root, 'memory-bank/b.md', '# B\n\nbeta beta content')
    const result = await mod.rebuildIndex()

    expect(result.stats.totalFiles).toBe(1)
    const db = openDb(root)
    try {
      expect(db.prepare('SELECT DISTINCT source_file FROM memory_chunks').all()).toEqual([
        { source_file: 'b.md' },
      ])
      expect(db.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(1)
    } finally {
      db.close()
    }
  })

  it('handles absent memory-bank and docs directories', async () => {
    const emptyRoot = createRoot()
    rmSync(join(emptyRoot, 'memory-bank'), { recursive: true, force: true })
    const empty = await loadIndex(emptyRoot)

    const result = await empty.rebuildIndex()

    expect(result).toEqual({
      indexed: 0,
      skipped: 0,
      stats: { totalVectors: 0, totalFiles: 0, dbSize: expect.stringMatching(/^\d+\.\d MB$/) },
    })
  })

  it('does not log a per-file line for files that yield no chunks', async () => {
    writeRepoFile(root, 'memory-bank/a.md', FILE_TWO_SECTIONS)
    writeRepoFile(root, 'memory-bank/empty.md', '')

    const result = await mod.rebuildIndex()

    expect(result.indexed).toBe(2)
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Indexed: empty.md'))
  })

  it('logs per-file and summary lines', async () => {
    writeRepoFile(root, 'memory-bank/a.md', FILE_TWO_SECTIONS)

    await mod.rebuildIndex()

    expect(logSpy).toHaveBeenCalledWith('[memory-index] Full rebuild started...')
    expect(logSpy).toHaveBeenCalledWith('[memory-index]   Indexed: a.md (2 chunks)')
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[memory-index] Rebuild complete: 2 chunks indexed, 0 skipped.'),
    )
  })
})

// ── incrementalUpdate ──────────────────────────────────────────────────────

describe('incrementalUpdate', () => {
  it('skips unchanged files and reports no changes', async () => {
    writeRepoFile(root, 'memory-bank/a.md', FILE_TWO_SECTIONS)
    writeRepoFile(root, 'docs/b.md', '# B\n\nbeta beta content')
    await mod.rebuildIndex()

    const result = await mod.incrementalUpdate()

    expect(result).toEqual({ indexed: 0, skipped: 3, changed: [] })
  })

  it('re-indexes a modified file and lists it in changed', async () => {
    writeRepoFile(root, 'memory-bank/a.md', FILE_TWO_SECTIONS)
    await mod.rebuildIndex()

    writeRepoFile(
      root,
      'memory-bank/a.md',
      ['# Doc', '', section('Alpha', 'alpha CHANGED content'), section('Beta', 'beta beta content')].join('\n'),
    )
    const result = await mod.incrementalUpdate()

    expect(result.indexed).toBe(1)
    expect(result.changed).toEqual(['a.md'])
  })

  it('picks up brand-new files on first run', async () => {
    writeRepoFile(root, 'memory-bank/fresh.md', '# Fresh\n\nfresh fresh content')

    const result = await mod.incrementalUpdate()

    expect(result).toEqual({ indexed: 1, skipped: 0, changed: ['fresh.md'] })
  })

  it('ignores frontmatter-only and empty files', async () => {
    writeRepoFile(root, 'memory-bank/meta.md', '---\nid: meta\n---\n')

    const result = await mod.incrementalUpdate()

    expect(result).toEqual({ indexed: 0, skipped: 0, changed: [] })
  })

  it('handles a missing docs directory', async () => {
    writeRepoFile(root, 'memory-bank/a.md', FILE_TWO_SECTIONS)

    const result = await mod.incrementalUpdate()

    expect(result.changed).toEqual(['a.md'])
  })
})

// ── vec_memory integrity ───────────────────────────────────────────────────
//
// vec0 has no foreign keys: a vector row is only reachable through
// memory_chunks.vec_rowid, so any row that loses its link becomes an invisible
// storage leak. These tests pin the invariant (one vector per linked chunk, no
// orphans, no dangling links) across the update, prune and failure paths.

describe('vec_memory integrity', () => {
  it('does not orphan the previous vector when a chunk is re-embedded', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    const before = openDb(root)
    let oldVecRowid
    let beforeCount
    try {
      oldVecRowid = before
        .prepare('SELECT vec_rowid FROM memory_chunks WHERE chunk_index = 0')
        .get().vec_rowid
      beforeCount = before.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count
    } finally {
      before.close()
    }

    writeRepoFile(
      root,
      'memory-bank/doc.md',
      ['# Doc', '', section('Alpha', 'alpha REWRITTEN content'), section('Beta', 'beta beta content')].join('\n'),
    )
    expect(await mod.indexFile(join(root, 'memory-bank/doc.md'))).toEqual({ indexed: 1, skipped: 1 })

    const after = openDb(root)
    try {
      const chunk = after
        .prepare('SELECT content, vec_rowid FROM memory_chunks WHERE chunk_index = 0')
        .get()
      const vectorCount = after.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count

      expect(vectorCount, 're-embedding a chunk must not grow vec_memory').toBe(beforeCount)
      expect(
        after.prepare('SELECT rowid FROM vec_memory WHERE rowid = ?').get(oldVecRowid),
        `stale vec_memory row ${oldVecRowid} was orphaned by the update`,
      ).toBeUndefined()
      expect(chunk.content).toContain('REWRITTEN')
      expect(after.prepare('SELECT rowid FROM vec_memory WHERE rowid = ?').get(chunk.vec_rowid)).toBeTruthy()
      assertVectorIntegrity(after)
    } finally {
      after.close()
    }

    const results = await mod.search('alpha REWRITTEN', { sourceFile: 'doc.md', topK: 1 })
    expect(results[0].content).toContain('REWRITTEN')
  })

  it('prunes replaced and trailing chunks together with their vectors', async () => {
    writeRepoFile(
      root,
      'memory-bank/doc.md',
      ['# Doc', '', section('Alpha', 'alpha alpha content'), section('Beta', 'beta beta content')].join('\n'),
    )
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    const before = openDb(root)
    let oldRowids
    try {
      oldRowids = before
        .prepare('SELECT vec_rowid FROM memory_chunks ORDER BY chunk_index')
        .all()
        .map((row) => row.vec_rowid)
    } finally {
      before.close()
    }

    // Shrink two sections to one: chunk 0 is replaced (new content) and chunk 1
    // disappears entirely. Both old vectors must go.
    writeRepoFile(root, 'memory-bank/doc.md', ['# Doc', '', section('Gamma', 'gamma gamma content')].join('\n'))
    expect(await mod.indexFile(join(root, 'memory-bank/doc.md'))).toEqual({ indexed: 1, skipped: 0 })

    const after = openDb(root)
    try {
      const chunks = after.prepare('SELECT chunk_index, content, vec_rowid FROM memory_chunks').all()
      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toContain('Gamma')
      expect(after.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(1)
      for (const rowid of oldRowids) {
        expect(
          after.prepare('SELECT rowid FROM vec_memory WHERE rowid = ?').get(rowid),
          `stale vec_memory row ${rowid} survived the chunk prune`,
        ).toBeUndefined()
      }
      assertVectorIntegrity(after)
    } finally {
      after.close()
    }
  })

  it('re-embeds chunks whose vector is missing or dangling', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    const broken = openDb(root)
    try {
      const rows = broken
        .prepare('SELECT id, vec_rowid FROM memory_chunks ORDER BY chunk_index')
        .all()
      // Chunk 0: the vector never landed (legacy row / embed failure).
      broken.prepare('DELETE FROM vec_memory WHERE rowid = ?').run(rows[0].vec_rowid)
      broken.prepare('UPDATE memory_chunks SET vec_rowid = NULL WHERE id = ?').run(rows[0].id)
      // Chunk 1: the link survives but the vector row does not.
      broken.prepare('DELETE FROM vec_memory WHERE rowid = ?').run(rows[1].vec_rowid)
    } finally {
      broken.close()
    }

    expect(await mod.indexFile(join(root, 'memory-bank/doc.md'))).toEqual({ indexed: 2, skipped: 0 })

    const after = openDb(root)
    try {
      expect(after.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(2)
      assertVectorIntegrity(after)
    } finally {
      after.close()
    }
  })

  it('retries unchanged content when a chunk still needs a vector', async () => {
    writeRepoFile(root, 'memory-bank/a.md', '# A\n\nalpha alpha content')
    await mod.rebuildIndex()

    const broken = openDb(root)
    try {
      const chunk = broken.prepare('SELECT id, vec_rowid FROM memory_chunks').get()
      broken.prepare('DELETE FROM vec_memory WHERE rowid = ?').run(chunk.vec_rowid)
      broken.prepare('UPDATE memory_chunks SET vec_rowid = NULL WHERE id = ?').run(chunk.id)
    } finally {
      broken.close()
    }

    const result = await mod.incrementalUpdate()

    expect(result).toEqual({ indexed: 1, skipped: 0, changed: ['a.md'] })
    const after = openDb(root)
    try {
      expect(after.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(1)
      assertVectorIntegrity(after)
    } finally {
      after.close()
    }
  })

  it('prunes chunks and vectors of files deleted before an incremental update', async () => {
    writeRepoFile(root, 'memory-bank/keep.md', '# Keep\n\nkeep keep content')
    writeRepoFile(root, 'memory-bank/gone.md', '# Gone\n\ngone gone content')
    writeRepoFile(root, 'memory-bank/never-embedded.md', `# Bad\n\n${embedMocks.FAIL_MARKER} broken content`)
    await mod.rebuildIndex()

    rmSync(join(root, 'memory-bank/gone.md'))
    rmSync(join(root, 'memory-bank/never-embedded.md'))
    const result = await mod.incrementalUpdate()

    expect(result.changed).toEqual([])
    const db = openDb(root)
    try {
      expect(db.prepare('SELECT DISTINCT source_file FROM memory_chunks').all()).toEqual([
        { source_file: 'keep.md' },
      ])
      expect(db.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(1)
      assertVectorIntegrity(db)
    } finally {
      db.close()
    }
  })

  it('removes vec_memory rows that no chunk references', async () => {
    writeRepoFile(root, 'memory-bank/a.md', '# A\n\nalpha alpha content')
    await mod.rebuildIndex()

    const seeded = openDb(root)
    let orphanRowid
    try {
      orphanRowid = Number(
        seeded.prepare('INSERT INTO vec_memory (embedding) VALUES (?)').run(
          new Float32Array(embedMocks.DIM),
        ).lastInsertRowid,
      )
      expect(seeded.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(2)
    } finally {
      seeded.close()
    }

    await mod.incrementalUpdate()

    const after = openDb(root)
    try {
      expect(
        after.prepare('SELECT rowid FROM vec_memory WHERE rowid = ?').get(orphanRowid),
        `orphan vec_memory row ${orphanRowid} was not reclaimed`,
      ).toBeUndefined()
      expect(after.prepare('SELECT COUNT(*) AS count FROM vec_memory').get().count).toBe(1)
      assertVectorIntegrity(after)
    } finally {
      after.close()
    }
  })

  it('holds the invariant across new, edited, deleted and repeated indexing', async () => {
    writeRepoFile(root, 'memory-bank/one.md', FILE_TWO_SECTIONS)
    writeRepoFile(root, 'docs/two.md', '# Two\n\ntwo two content')
    await mod.rebuildIndex()

    writeRepoFile(root, 'memory-bank/three.md', '# Three\n\nthree three content')
    writeRepoFile(
      root,
      'memory-bank/one.md',
      ['# Doc', '', section('Alpha', 'alpha EDITED content'), section('Beta', 'beta beta content')].join('\n'),
    )
    writeRepoFile(root, 'memory-bank/bad.md', `# Bad\n\n${embedMocks.FAIL_MARKER} will never embed`)
    rmSync(join(root, 'docs/two.md'))

    await mod.incrementalUpdate()
    await mod.incrementalUpdate()

    const db = openDb(root)
    try {
      const { vectors, linked, unlinked } = assertVectorIntegrity(db, { expectWithoutVector: 1 })
      expect(linked).toBe(3) // one.md (2) + three.md (1); bad.md has no vector
      expect(vectors).toBe(3)
      expect(unlinked).toBe(1)
      expect(
        db.prepare('SELECT DISTINCT source_file FROM memory_chunks ORDER BY source_file').all(),
      ).toEqual([
        { source_file: 'bad.md' },
        { source_file: 'one.md' },
        { source_file: 'three.md' },
      ])
    } finally {
      db.close()
    }
  })
})

// ── search ─────────────────────────────────────────────────────────────────

describe('search', () => {
  async function seedRankingCorpus() {
    writeRepoFile(root, 'memory-bank/alpha.md', '# Alpha\n\nalpha wolf alpha wolf')
    writeRepoFile(root, 'memory-bank/beta.md', '# Beta\n\nbeta wolf beta wolf')
    writeRepoFile(root, 'memory-bank/gamma.md', '# Gamma\n\ngamma wolf gamma wolf')
    await mod.rebuildIndex()
  }

  it('returns the documented result shape with similarity scores', async () => {
    await seedRankingCorpus()

    const results = await mod.search('alpha wolf')

    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(['content', 'score', 'source_file'])
      expect(typeof result.source_file).toBe('string')
      expect(typeof result.content).toBe('string')
      expect(typeof result.score).toBe('number')
      expect(result.score).toBe(Math.round(result.score * 1000) / 1000)
    }
    expect(results[0].source_file).toBe('alpha.md')
    expect(results[0].content).toContain('alpha')
  })

  it('orders results by descending similarity', async () => {
    await seedRankingCorpus()

    const results = await mod.search('beta wolf', { topK: 3 })
    const scores = results.map((result) => result.score)

    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(results[0].source_file).toBe('beta.md')
  })

  it('respects topK', async () => {
    await seedRankingCorpus()

    const results = await mod.search('wolf', { topK: 1 })

    expect(results).toHaveLength(1)
  })

  it('filters by sourceFile', async () => {
    await seedRankingCorpus()

    const results = await mod.search('wolf', { topK: 5, sourceFile: 'beta.md' })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((result) => result.source_file === 'beta.md')).toBe(true)
  })

  it('returns [] when nothing is indexed', async () => {
    expect(await mod.search('anything')).toEqual([])
  })

  it('wraps embedding failures with an actionable message', async () => {
    await seedRankingCorpus()
    const broken = await loadIndex(root)
    embedMocks.pipeline.mockRejectedValueOnce(new Error('model offline'))

    await expect(broken.search('alpha')).rejects.toThrow(
      'Embedding failed: Embedding model not available. Is @xenova/transformers installed?',
    )
  })
})

// ── getFile ────────────────────────────────────────────────────────────────

describe('getFile', () => {
  it('reads from memory-bank first', () => {
    writeRepoFile(root, 'memory-bank/projectbrief.md', '# Brief\n\nmemory-bank copy')
    writeRepoFile(root, 'docs/projectbrief.md', '# Brief\n\ndocs copy')

    expect(mod.getFile('projectbrief')).toContain('memory-bank copy')
  })

  it('falls back to docs/', () => {
    writeRepoFile(root, 'docs/guide.md', '# Guide\n\ndocs guide')
    expect(mod.getFile('guide')).toContain('docs guide')
  })

  it('falls back to hidden docs files', () => {
    writeRepoFile(root, 'docs/.tracker-log.md', '# Tracker\n\nhidden doc')
    expect(mod.getFile('tracker-log')).toContain('hidden doc')
  })

  it('returns null when the file is nowhere', () => {
    expect(mod.getFile('nope')).toBeNull()
  })
})

// ── getStats ───────────────────────────────────────────────────────────────

describe('getStats', () => {
  it('reports vector/file counts and DB size after indexing', async () => {
    writeTwoSectionFile(root)
    writeRepoFile(root, 'docs/other.md', '# Other\n\nother other content')
    await mod.rebuildIndex()

    const stats = mod.getStats()

    expect(stats.totalVectors).toBe(3)
    expect(stats.totalFiles).toBe(2)
    expect(stats.dbSize).toMatch(/^\d+\.\d MB$/)
  })

  it('reports 0.0 MB when the DB file disappears', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))
    expect(existsSync(join(root, 'memory-bank/.index/memory.db'))).toBe(true)

    rmSync(join(root, 'memory-bank/.index/memory.db'))

    expect(mod.getStats().dbSize).toBe('0.0 MB')
  })

  it('returns the empty shape after closeDB', async () => {
    writeTwoSectionFile(root)
    await mod.indexFile(join(root, 'memory-bank/doc.md'))

    mod.closeDB()

    expect(mod.getStats()).toEqual({ totalVectors: 0, totalFiles: 0, dbSize: 'N/A' })
  })
})
