// ═════════════════════════════════════════════════════════════════════════════
// spec-skills-lock.test.js — Lock-file integrity against vendored bytes
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan T18 (TEST-01..03):
//   - every pinned lock entry declares a usable `files[]`
//   - every `files[].sha256` equals the vendored file's sha256 on disk
//   - every `computedHash` equals that skill's `SKILL.md` sha256
//   - every `mattpocock/skills` entry carries the same `ref` (a split pin fails)
//   - `to-pr` and `close-out` exist on disk but have no lock entry
//   - the ten vendored skills and the ten pinned lock entries are the same set
//
// Uses only `fs` + `crypto`, with the repo root resolved from `import.meta.url`
// so the test is independent of the working directory.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'skills-lock.json'), 'utf8'))
const entries = Object.entries(lock.skills)

const pinnedEntries = entries.filter(
  ([, entry]) => typeof entry.ref === 'string' && entry.ref.trim() !== '',
)

/** The ten skills vendored from `mattpocock/skills`. */
const VENDORED_SKILLS = [
  'domain-modeling',
  'grill-me',
  'grill-with-docs',
  'grilling',
  'pr',
  'prototype',
  'research',
  'to-spec',
  'to-tickets',
  'wayfinder',
]

/**
 * Computes the sha256 of a file.
 *
 * @param {string} path - Absolute file path.
 * @returns {string} Lowercase hex digest.
 */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Resolves a skill's directory inside `.agents/skills/`.
 *
 * @param {string} name - Skill directory name.
 * @returns {string} Absolute path.
 */
function skillDir(name) {
  return join(REPO_ROOT, '.agents', 'skills', name)
}

/**
 * Returns whether a lock record can safely be used to fetch a file.
 *
 * @param {object} file - A `files[]` record.
 * @returns {boolean} `true` when path, sha256, and upstreamPath are usable.
 */
function isUsableFile(file) {
  return (
    file != null &&
    typeof file.path === 'string' &&
    file.path.length > 0 &&
    typeof file.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(file.sha256) &&
    typeof file.upstreamPath === 'string' &&
    file.upstreamPath.length > 0
  )
}

describe('skills-lock.json — pinned entry shape', () => {
  it('has ten pinned entries', () => {
    expect(pinnedEntries.map(([name]) => name).sort()).toEqual([...VENDORED_SKILLS].sort())
  })

  it('every pinned entry carries a usable files[]', () => {
    const broken = pinnedEntries
      .filter(([, entry]) => !Array.isArray(entry.files) || entry.files.length === 0)
      .map(([name]) => name)

    expect(broken, `pinned entries without a non-empty files[]: ${broken.join(', ')}`).toEqual([])

    for (const [name, entry] of pinnedEntries) {
      for (const file of entry.files) {
        expect(isUsableFile(file), `${name}: unusable files[] record ${JSON.stringify(file)}`).toBe(
          true,
        )
      }
    }
  })

  it('every pinned entry uses the same ref', () => {
    const refs = [...new Set(pinnedEntries.map(([, entry]) => entry.ref))]

    expect(refs, `split pin detected: ${refs.join(', ')}`).toHaveLength(1)
    expect(refs[0]).toBe('v1.3.2')
  })
})

describe('skills-lock.json — hashes match the vendored bytes', () => {
  it('every files[].sha256 equals the file on disk', () => {
    const mismatches = []

    for (const [name, entry] of pinnedEntries) {
      for (const file of entry.files) {
        const diskPath = join(skillDir(name), file.path)
        if (!existsSync(diskPath)) {
          mismatches.push(`${name}/${file.path}: missing on disk`)
          continue
        }
        const actual = sha256(diskPath)
        if (actual !== file.sha256) {
          mismatches.push(`${name}/${file.path}: ${actual} !== ${file.sha256}`)
        }
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([])
  })

  it('every computedHash equals that skill\'s SKILL.md hash', () => {
    const mismatches = []

    for (const [name, entry] of pinnedEntries) {
      const skillMd = join(skillDir(name), 'SKILL.md')
      if (!existsSync(skillMd)) {
        mismatches.push(`${name}/SKILL.md: missing on disk`)
        continue
      }
      const actual = sha256(skillMd)
      if (actual !== entry.computedHash) {
        mismatches.push(`${name}: computedHash ${entry.computedHash} !== disk ${actual}`)
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([])
  })
})

describe('skills-lock.json — repo-local skills are not pinned', () => {
  it('to-pr and close-out exist on disk with no lock entry', () => {
    for (const name of ['to-pr', 'close-out']) {
      expect(existsSync(join(skillDir(name), 'SKILL.md')), `${name}/SKILL.md missing`).toBe(true)
      expect(lock.skills[name], `${name} must not have a lock entry`).toBeUndefined()
    }
  })

  it('the vendored set and the pinned lock set are the same', () => {
    for (const name of VENDORED_SKILLS) {
      expect(pinnedEntries.some(([entryName]) => entryName === name), `${name} not pinned`).toBe(
        true,
      )
    }
    expect(pinnedEntries).toHaveLength(VENDORED_SKILLS.length)
  })
})
