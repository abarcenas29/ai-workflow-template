// ═════════════════════════════════════════════════════════════════════════════
// validate-memory-schema.test.js — Unit tests for the pre-commit validator
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/feature-vocab-sync-1.md T10 (TEST-01..05) — the T3
// entity_patterns awareness fix: `entity_patterns` keys (npm, vitest, …) count
// as known tags, so they no longer produce false-positive "Unknown tags"
// warnings; genuinely unknown tags still warn; and the validator keeps the
// warn-don't-block contract (exit code stays 0 on warnings).
//
// The validator is exercised through its exported functions (testability seam
// added in T10: `export { validateFile, main }` + `isDirectRun` guard, matching
// scripts/vocab-sync.js / scripts/mcp-knowledgebase-server.js convention).
// child_process.execSync (staged-file detection) and node:fs.readFileSync
// (file + vocab content) are mocked hermetically so no git/FS side effects occur.
// ═════════════════════════════════════════════════════════════════════════════

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Module-level mocks — the validator imports execSync from node:child_process
// and readFileSync/existsSync from node:fs. vi.mock is hoisted above imports,
// so the validator under test receives these mocked implementations.
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process')
  return { ...actual, execSync: vi.fn() }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
  }
})

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { validateFile, main } from './validate-memory-schema.js'

// ── Fixtures ─────────────────────────────────────────────────────────

const FILE_PATH = 'memory-bank/sample.md'

function makeFileContent({
  id = 'sample',
  title = 'Sample',
  updated = '2026-08-03',
  tags = [],
  category = 'memory_ops',
} = {}) {
  return [
    '---',
    `id: ${id}`,
    `title: "${title}"`,
    `updated: ${updated}`,
    `tags: [${tags.join(', ')}]`,
    'entities: [sample]',
    `category: ${category}`,
    '---',
    '',
    '# Sample',
    '',
    'Body.',
    '',
  ].join('\n')
}

// Mirrors the real memory-bank/.vocabulary.json shape: tags.* groups hold
// known concept tags; entity_patterns keys hold component/tool names.
const VOCAB = {
  categories: { memory_ops: 'Memory operations', context: 'Context files' },
  tags: {
    agent_roles: ['architect', 'implementer'],
    workflow: ['planning', 'review'],
    memory_ops: ['indexing'],
    topic: ['mcp', 'graphify'],
  },
  entity_patterns: {
    npm: { patterns: ['\\bnpm\\b'] },
    vitest: { patterns: ['\\bvitest\\b'] },
    playwright: { patterns: ['\\bplaywright\\b'] },
  },
}

// ── Test harness ─────────────────────────────────────────────────────

let warnSpy

beforeEach(() => {
  vi.clearAllMocks()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// T10 scenarios — entity_patterns awareness (plan TEST-01..05)
// ═════════════════════════════════════════════════════════════════════════════

describe('validateFile — entity_patterns awareness (plan T10)', () => {
  it('TEST-01: does NOT warn when a tag is an entity_patterns key (npm)', () => {
    readFileSync.mockReturnValue(makeFileContent({ tags: ['npm'] }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(errors).toEqual([])
  })

  it('TEST-02: does NOT warn when a tag is in a tags.* group (mcp in tags.topic)', () => {
    readFileSync.mockReturnValue(makeFileContent({ tags: ['mcp'] }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(errors).toEqual([])
  })

  it('TEST-03: warns when a tag is genuinely unknown (some-random-tag)', () => {
    readFileSync.mockReturnValue(makeFileContent({ tags: ['some-random-tag'] }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('some-random-tag'))
    // warn-don't-block: a warning is NOT a validation error
    expect(errors).toEqual([])
  })

  it('TEST-04: warns ONLY for truly unknown tags when mixed with entity_patterns keys', () => {
    readFileSync.mockReturnValue(
      makeFileContent({ tags: ['npm', 'vitest', 'some-random-tag'] })
    )

    const errors = validateFile(FILE_PATH, VOCAB)

    const warnText = warnSpy.mock.calls.map((call) => String(call[0])).join(' ')
    expect(warnText).toContain('Unknown tags')
    expect(warnText).toContain('some-random-tag')
    expect(warnText).not.toContain('npm')
    expect(warnText).not.toContain('vitest')
    expect(errors).toEqual([])
  })

  it('TEST-05: handles a vocab with no entity_patterns key gracefully (no crash)', () => {
    const vocabNoEntityPatterns = {
      categories: { memory_ops: 'Memory operations' },
      tags: { topic: ['mcp'] },
      // deliberately NO entity_patterns key
    }
    readFileSync.mockReturnValue(makeFileContent({ tags: ['npm'] }))

    // `Object.keys(vocab.entity_patterns || {})` must not throw on undefined
    expect(() => validateFile(FILE_PATH, vocabNoEntityPatterns)).not.toThrow()
    // without entity_patterns, 'npm' is genuinely unknown → degrades to a warning
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('npm'))
  })

  it('TEST-05b: does not crash with a completely empty vocab object ({})', () => {
    readFileSync.mockReturnValue(makeFileContent({ tags: ['whatever'] }))

    expect(() => validateFile(FILE_PATH, {})).not.toThrow()
    // no tags.* groups and no entity_patterns → tag check skipped, no warning
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Reviewer M1 — normalization parity with vocab-sync
// ═════════════════════════════════════════════════════════════════════════════
// vocab-sync.js normalizes tags (lowercase, kebab-case) before comparing and
// appending, so after it appends `my-tag` a staged file whose frontmatter still
// says `My Tag` must NOT warn. The validator therefore normalizes both sides
// before the unknown-tag filter (reviewer finding M1). The three scenarios below
// lock in: (a) normalized-known no-warn, (b) genuinely unknown still warns,
// (c) mixed-case genuinely unknown still warns.

describe('validateFile — tag normalization parity with vocab-sync (reviewer M1)', () => {
  it('M1-a: does NOT warn when a mixed-case staged tag normalizes to a known tag (My Tag → my-tag)', () => {
    const vocabWithNormalized = {
      ...VOCAB,
      tags: { ...VOCAB.tags, topic: [...VOCAB.tags.topic, 'my-tag'] },
    }
    readFileSync.mockReturnValue(makeFileContent({ tags: ['My Tag'] }))

    const errors = validateFile(FILE_PATH, vocabWithNormalized)

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(errors).toEqual([])
  })

  it('M1-b: still warns when a tag is genuinely unknown after normalization (some-random-tag)', () => {
    readFileSync.mockReturnValue(makeFileContent({ tags: ['some-random-tag'] }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('some-random-tag'))
    // warn-don't-block: a warning is NOT a validation error
    expect(errors).toEqual([])
  })

  it('M1-c: still warns for a mixed-case tag that is NOT in the vocabulary', () => {
    readFileSync.mockReturnValue(makeFileContent({ tags: ['Random Tag'] }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Random Tag'))
    // warn-don't-block: a warning is NOT a validation error
    expect(errors).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// main() — exit-code contract (warn-don't-block, REQ-05 / CON-02)
// ═════════════════════════════════════════════════════════════════════════════

describe('main() — exit code behavior', () => {
  it('exits 0 when unknown-tag warnings occur (warnings do NOT block the commit)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    execSync.mockReturnValue(`${FILE_PATH}\n`)
    readFileSync.mockImplementation((filePath) => {
      if (String(filePath).includes('.vocabulary.json')) return JSON.stringify(VOCAB)
      return makeFileContent({ tags: ['some-random-tag'] })
    })

    main()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown tags'))
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('exits 0 when no memory-bank files are staged', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    execSync.mockReturnValue('')

    main()

    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('exits 1 when validation errors are found', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    execSync.mockReturnValue(`${FILE_PATH}\n`)
    readFileSync.mockImplementation((filePath) => {
      if (String(filePath).includes('.vocabulary.json')) return JSON.stringify(VOCAB)
      // id does not match the filename → real validation error
      return makeFileContent({ id: 'mismatched-id', tags: ['mcp'] })
    })

    main()

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// validateFile — error branches (robustness / coverage support)
// ═════════════════════════════════════════════════════════════════════════════

describe('validateFile — error branches', () => {
  it('returns a "Cannot read file" error when the file is unreadable', () => {
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(errors).toEqual([`Cannot read file: ${FILE_PATH}`])
  })

  it('reports missing YAML frontmatter', () => {
    readFileSync.mockReturnValue('# No frontmatter here\n')

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(errors).toEqual(['Missing YAML frontmatter (file must start with ---...---)'])
  })

  it('reports missing required fields', () => {
    readFileSync.mockReturnValue('---\nid: sample\n---\n')

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(errors).toEqual([
      "Missing required field: 'title'",
      "Missing required field: 'updated'",
      "Missing required field: 'tags'",
      "Missing required field: 'category'",
    ])
  })

  it('reports an id/filename mismatch', () => {
    readFileSync.mockReturnValue(makeFileContent({ id: 'mismatched-id' }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(errors).toContain(
      `Field 'id' (mismatched-id) does not match filename (sample)`
    )
  })

  it('reports an invalid updated date', () => {
    readFileSync.mockReturnValue(makeFileContent({ updated: 'yesterday' }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(errors).toContain(
      `Field 'updated' (yesterday) is not a valid date. Use YYYY-MM-DD format.`
    )
  })

  it('reports an invalid category', () => {
    readFileSync.mockReturnValue(makeFileContent({ category: 'not-a-category' }))

    const errors = validateFile(FILE_PATH, VOCAB)

    expect(errors).toContain(
      `Invalid category 'not-a-category'. Allowed: memory_ops, context`
    )
  })
})
