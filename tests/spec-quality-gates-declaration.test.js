// ═════════════════════════════════════════════════════════════════════════════
// spec-quality-gates-declaration.test.js — the empty declaration is a real state
// ═════════════════════════════════════════════════════════════════════════════
//
// The shipped declaration has a gate table with zero data rows. That is the only
// state a fresh consumer is ever in, and it must not be reported as an empty
// table ("nothing to run"). It must be reported as `GATES: NOT DECLARED` — one
// row, with the same consequence as an absent declaration.
//
// These assertions pin the reporting contract in every place that defines it:
//   (a) the declaration itself (.agents/config/quality-gates.md)
//   (b) the reader that runs the gates (.opencode/agents/unit-tester.md)
//   (c) the reader that cites them (.opencode/agents/reviewer.md)
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DECLARATION_PATH = '.agents/config/quality-gates.md'
const UNIT_TESTER_PATH = '.opencode/agents/unit-tester.md'
const REVIEWER_PATH = '.opencode/agents/reviewer.md'

function readRepoFile(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8')
}

/**
 * Return the data rows of the first gate table (the one under `## Gate table`).
 * The header is the `| ID | Command | ...` line, the separator is skipped, and
 * the first line that is not a `|` row ends the table — so the fenced
 * `EXAMPLE ONLY` block below it is never counted.
 */
function gateTableRows(content) {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => /^\|\s*ID\s*\|\s*Command\s*\|/.test(line))
  if (start === -1) {
    return null
  }

  const rows = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) {
      break
    }
    if (/^\|\s*-+/.test(line)) {
      continue
    }
    rows.push(line)
  }
  return rows
}

describe('quality-gate declaration: zero declared gates is a first-class state', () => {
  it('the shipped declaration has a gate table with zero data rows', () => {
    const rows = gateTableRows(readRepoFile(DECLARATION_PATH))

    expect(rows, 'the `| ID | Command |` gate table was not found').not.toBeNull()
    expect(rows, 'the shipped declaration must ship no runnable gate rows').toEqual([])
  })

  it('the declaration reports a present-but-empty set as one GATES: NOT DECLARED row', () => {
    const content = readRepoFile(DECLARATION_PATH)

    expect(content).toContain('GATES: NOT DECLARED')
    expect(content).toMatch(/zero declared gates/i)
    expect(content).toMatch(/never an empty table/i)
  })

  it('the unit-tester reports a present-but-empty set as one GATES: NOT DECLARED row', () => {
    const content = readRepoFile(UNIT_TESTER_PATH)

    expect(content).toContain('GATES: NOT DECLARED')
    expect(content).toMatch(/zero declared gates/i)
    expect(content).toMatch(/never reported as an\s+empty table/i)
  })

  it('the reviewer maps a present-but-empty set to one GATES: NOT DECLARED row', () => {
    const content = readRepoFile(REVIEWER_PATH)

    // The reviewer may only emit `GATES: NOT DECLARED` when the set is absent OR
    // present with zero declared gates; an absent-only rule leaves a reviewer free
    // to print an empty table, which is the shape this contract forbids.
    expect(content).toContain('GATES: NOT DECLARED')
    expect(content).toMatch(/present with zero declared gates/i)
    expect(content).toMatch(/never an empty table/i)
  })
})
