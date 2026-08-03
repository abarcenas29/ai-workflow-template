// ═════════════════════════════════════════════════════════════════════════════
// spec-kb-consolidation.test.js — Grep-based spec integrity verification
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/process-kb-consolidation-1.md T9 (TEST-05..09) — verifies that the
// KB consolidation standardization points are all wired into the agent specs and
// instruction files:
//
//   (a) tracker.agent.md derives `knowledgebase_index` projectId from
//       `package.json` `name` (the canonical scoped name) — TEST-05.
//   (b) knowledge-retrieval.instructions.md carries the "Canonical projectId"
//       subsection with a package.json mention — TEST-06.
//   (c) knowledgebase.instructions.md marks `knowledgebase_index` projectId as
//       "required" (NOT "optional") — TEST-07.
//   (d) All 3 orchestrator templates mention "package.json" in the `projectName`
//       parameter description — TEST-08.
//   (e) knowledgebase.instructions.md contains the "MCP Server Restart After
//       Configuration Changes" restart-note section — TEST-09.
//   (f) No regression on the graceful-failure contract — "MANDATORY TO ATTEMPT,
//       GRACEFUL TO FAIL" must still be present.
//   (g) Negative assertion (TEST-05 hardening): no hardcoded unscoped
//       `projectId: 'ai-workflow-template'` literal may appear in the agent
//       specs, instruction files, or scripts — the canonical projectId is the
//       scoped `package.json` `name` (`@abarcenas/ai-workflow-template`).
//
// Like the sibling spec-wiring tests, this file reads the REAL spec files from
// disk (fs.readFileSync + String.includes) so it asserts the actual wiring state
// of the repo — no external test dependencies, no Vitest mocks, portable to any
// test runner.
//
// Matching note: the `knowledgebase_search` tool row legitimately documents
// `projectId` (optional) — TEST-07 therefore scopes the "required / not optional"
// assertion to the `knowledgebase_index` table row only, avoiding a false failure
// from the search row.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Path helpers (repo-root relative, robust to any cwd) ─────────────────

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function readRepoFile(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8')
}

const TRACKER_PATH = '.opencode/agents/tracker.agent.md'
const KNOWLEDGE_RETRIEVAL_PATH = '.agents/instructions/knowledge-retrieval.instructions.md'
const KNOWLEDGEBASE_INSTRUCTIONS_PATH = '.agents/instructions/knowledgebase.instructions.md'

const ORCHESTRATOR_PATHS = [
  '.opencode/agents/orchestrator/orchestrator.agent.md',
  '.opencode/agents/orchestrator/feature-pipeline.agent.md',
  '.opencode/agents/orchestrator/tdd-orchestrator.agent.md',
]

// ── Line helpers (scoped, case-tolerant matching) ────────────────────────

/** Find the index of the first occurrence of `needle`, or -1. */
function indexOf(content, needle) {
  return content.indexOf(needle)
}

/** Extract the markdown table row (line) whose first cell matches `cell`. */
function findTableRow(content, cell) {
  const rowPrefix = `| \`${cell}\``
  return content
    .split('\n')
    .find((line) => line.includes(rowPrefix)) ?? ''
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST-05 — tracker.agent.md projectId derivation guidance
// ═════════════════════════════════════════════════════════════════════════════

describe('tracker.agent.md projectId derivation (plan T9 / TEST-05)', () => {
  const content = readRepoFile(TRACKER_PATH)

  it('TEST-05: references knowledgebase_index with package.json name as the projectId source', () => {
    const idx = indexOf(content, 'knowledgebase_knowledgebase_index')
    expect(idx, `'knowledgebase_knowledgebase_index' must appear in ${TRACKER_PATH}`).toBeGreaterThanOrEqual(0)

    // Window the match to the surrounding sentence — the derivation guidance
    // lives on the same line as the knowledgebase_index reference.
    const windowStart = Math.max(0, idx - 100)
    const windowEnd = Math.min(content.length, idx + 700)
    const window = content.slice(windowStart, windowEnd)

    expect(window, `'package.json' must appear near the knowledgebase_index reference in ${TRACKER_PATH}`).toContain('package.json')
    expect(window, `'name' must appear near the knowledgebase_index reference in ${TRACKER_PATH}`).toContain('name')
  })

  it('TEST-05: explicitly states package.json name is the single source of truth', () => {
    expect(
      content.includes('package.json'),
      `${TRACKER_PATH} must mention package.json in the projectId guidance`
    ).toBe(true)
    expect(
      content.toLowerCase().includes('single source of truth'),
      `${TRACKER_PATH} must call package.json name the single source of truth`
    ).toBe(true)
  })

  it(`TEST-05 (negative): no hardcoded unscoped projectId 'ai-workflow-template' in source or agent spec files`, () => {
    // Flat file list (deterministic, no recursive walk) covering every place a
    // hardcoded unscoped projectId could be introduced in the live codebase:
    // agent specs, orchestrator templates, projectId-relevant instruction files,
    // and scripts. Excluded are docs/, plan/, tests/, memory-bank/ and the
    // learned-knowledge session journal — those legitimately reference the
    // historical unscoped `ai-workflow-template` (e.g., documenting the
    // Pipeline 7 duplicate or the reviewer's minor).
    const CHECK_PATHS = [
      // .opencode/ agent specs
      '.opencode/agents/architect.agent.md',
      '.opencode/agents/coder.agent.md',
      '.opencode/agents/deployer.agent.md',
      '.opencode/agents/designer.agent.md',
      '.opencode/agents/e2e-tester.agent.md',
      '.opencode/agents/implementer.agent.md',
      '.opencode/agents/plan.agent.md',
      '.opencode/agents/researcher.agent.md',
      '.opencode/agents/reviewer.agent.md',
      '.opencode/agents/tracker.agent.md',
      '.opencode/agents/unit-tester.agent.md',
      '.opencode/agents/orchestrator/orchestrator.agent.md',
      '.opencode/agents/orchestrator/feature-pipeline.agent.md',
      '.opencode/agents/orchestrator/tdd-orchestrator.agent.md',
      // .agents/ instructions (projectId convention + memory-bank operations)
      '.agents/instructions/knowledge-retrieval.instructions.md',
      '.agents/instructions/knowledgebase.instructions.md',
      '.agents/instructions/memory-bank.instructions.md',
      // scripts/ (projectId call sites)
      'scripts/knowledgebase-index.js',
      'scripts/knowledgebase-cli.js',
      'scripts/mcp-knowledgebase-server.js',
      'scripts/setup/knowledgebase.js',
      'scripts/setup/index.js',
    ]

    // Matches JS object syntax (`projectId: 'ai-workflow-template'`),
    // assignment syntax (`projectId = "ai-workflow-template"`), and markdown
    // documentation (`projectId: "ai-workflow-template"`). The canonical
    // projectId is the scoped `package.json` `name` (`@abarcenas/...`), so any
    // unscoped `ai-workflow-template` literal is a convention violation.
    const hardcodedUnscopedProjectId = /projectId\s*[:=]\s*['"]ai-workflow-template['"]/g
    const offenders = []

    for (const path of CHECK_PATHS) {
      const content = readRepoFile(path)
      const matches = content.match(hardcodedUnscopedProjectId) ?? []
      if (matches.length > 0) {
        offenders.push(`${path} (${matches.length} hit${matches.length === 1 ? '' : 's'})`)
      }
    }

    const failureMessage =
      offenders.length > 0
        ? `hardcoded unscoped projectId 'ai-workflow-template' must not appear in agent/spec/script files: ${offenders.join('; ')}`
        : undefined

    expect(offenders.length, failureMessage).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-06 — knowledge-retrieval.instructions.md canonical projectId subsection
// ═════════════════════════════════════════════════════════════════════════════

describe('knowledge-retrieval canonical projectId subsection (plan T9 / TEST-06)', () => {
  const content = readRepoFile(KNOWLEDGE_RETRIEVAL_PATH)

  it('TEST-06: contains the "Canonical projectId" heading', () => {
    expect(
      content.includes('### Canonical projectId'),
      `${KNOWLEDGE_RETRIEVAL_PATH} must contain a '### Canonical projectId' subsection`
    ).toBe(true)
  })

  it('TEST-06: the canonical rule mentions package.json as the derivation source', () => {
    expect(
      content.includes('package.json'),
      `${KNOWLEDGE_RETRIEVAL_PATH} must mention package.json in the canonical projectId rule`
    ).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-07 — knowledgebase.instructions.md required projectId (scoped to row)
// ═════════════════════════════════════════════════════════════════════════════

describe('knowledgebase.instructions.md knowledgebase_index projectId (plan T9 / TEST-07)', () => {
  const content = readRepoFile(KNOWLEDGEBASE_INSTRUCTIONS_PATH)

  it('TEST-07: the knowledgebase_index tool row marks projectId as required', () => {
    const row = findTableRow(content, 'knowledgebase_index')
    expect(
      row,
      `${KNOWLEDGEBASE_INSTRUCTIONS_PATH} must contain a 'knowledgebase_index' tool-table row`
    ).not.toBe('')

    expect(
      row.toLowerCase().includes('required'),
      `the knowledgebase_index row must mark projectId as 'required': "${row.trim()}"`
    ).toBe(true)
  })

  it('TEST-07: the knowledgebase_index tool row does NOT mark projectId as optional', () => {
    const row = findTableRow(content, 'knowledgebase_index')
    expect(
      row,
      `${KNOWLEDGEBASE_INSTRUCTIONS_PATH} must contain a 'knowledgebase_index' tool-table row`
    ).not.toBe('')

    expect(
      row.toLowerCase().includes('optional'),
      `the knowledgebase_index row must NOT mark projectId as 'optional': "${row.trim()}"`
    ).toBe(false)
  })

  it('TEST-07: the required projectId guidance names package.json as the source', () => {
    expect(
      content.includes('package.json'),
      `${KNOWLEDGEBASE_INSTRUCTIONS_PATH} must reference package.json for the projectId guidance`
    ).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-08 — all 3 orchestrator templates mention package.json in projectName
// ═════════════════════════════════════════════════════════════════════════════

describe('orchestrator projectName package.json guidance (plan T9 / TEST-08)', () => {
  it('TEST-08: every orchestrator projectName description mentions package.json', () => {
    const failures = []

    for (const path of ORCHESTRATOR_PATHS) {
      const content = readRepoFile(path)
      const projectNameLine =
        content
          .split('\n')
          .find((line) => line.includes('**projectName**')) ?? ''

      if (!projectNameLine.includes('package.json')) {
        failures.push(
          `${path} projectName description must mention package.json (line: "${projectNameLine.trim()}")`
        )
      }
    }

    expect(
      failures,
      failures.length > 0 ? failures.join('; ') : undefined
    ).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-09 — MCP restart note + graceful-failure contract regression
// ═════════════════════════════════════════════════════════════════════════════

describe('knowledgebase.instructions.md restart note and graceful-failure contract (plan T9 / TEST-09)', () => {
  const content = readRepoFile(KNOWLEDGEBASE_INSTRUCTIONS_PATH)

  it('TEST-09: contains the "MCP Server Restart After Configuration Changes" restart-note section', () => {
    expect(
      content.includes('### MCP Server Restart After Configuration Changes'),
      `${KNOWLEDGEBASE_INSTRUCTIONS_PATH} must contain the '### MCP Server Restart After Configuration Changes' section`
    ).toBe(true)
  })

  it('TEST-09: the restart note instructs restarting OpenCode after code changes', () => {
    const idx = indexOf(content, 'MCP Server Restart After Configuration Changes')
    expect(idx).toBeGreaterThanOrEqual(0)
    const window = content.slice(idx, idx + 800)
    expect(
      window.toLowerCase().includes('restart'),
      'the restart-note section must instruct restarting the MCP server / OpenCode'
    ).toBe(true)
  })

  it('TEST-09 (regression): graceful-failure contract "MANDATORY TO ATTEMPT, GRACEFUL TO FAIL" is preserved', () => {
    expect(
      content.includes('MANDATORY TO ATTEMPT, GRACEFUL TO FAIL'),
      `${KNOWLEDGEBASE_INSTRUCTIONS_PATH} must retain the 'MANDATORY TO ATTEMPT, GRACEFUL TO FAIL' contract`
    ).toBe(true)
  })
})
