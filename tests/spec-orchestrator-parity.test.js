// ═════════════════════════════════════════════════════════════════════════════
// spec-orchestrator-parity.test.js — Orchestrator delegation template parity
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/feature-knowledge-vector-gaps-1.md T17 (TEST-07..10) — verifies
// that the three orchestrator delegation templates are symmetric with respect to
// the knowledge-retrieval protocol injection:
//
//   (a) orchestrator.agent.md   — BOTH standard and parallel-coder delegation
//       prompt templates contain the `knowledge-retrieval` reference.
//   (b) feature-pipeline.agent.md — BOTH standard AND parallel-coder delegation
//       contain `learned-knowledge` AND `architecture-context` AND `knowledgebase`
//       (the parallel-coder delegation was previously asymmetric — it only had
//       memory-bank; T14 made it match the standard).
//   (c) tdd-orchestrator.agent.md — ALL SIX Phase delegation blocks contain the
//       `knowledge-retrieval` reference (including Phase 5 reviewer, which
//       previously had ZERO knowledge injection).
//
// The delegation prompt templates are fenced markdown blocks (``` ... ```) inside
// the agent files.  The tests extract those fences from disk (fs.readFileSync),
// classify each block by stable content markers (placeholder strings like
// `Work on "{work_unit}"` / `Implement task {TASK_ID}`), and assert on the
// block CONTENT — so they are robust to the exact surrounding formatting
// (indentation, bullet style, line wrapping).
//
// No external test dependencies; portable to any test runner (T16/T17 use the
// same fs + String.includes approach).
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

const ORCHESTRATOR_PATH = '.opencode/agents/orchestrator/orchestrator.agent.md'
const FEATURE_PIPELINE_PATH = '.opencode/agents/orchestrator/feature-pipeline.agent.md'
const TDD_ORCHESTRATOR_PATH = '.opencode/agents/orchestrator/tdd-orchestrator.agent.md'

// ── Fenced-block extraction (robust to indented fences) ─────────────────────

/**
 * Extract all fenced markdown blocks (``` ... ```) from a file's content.
 * Fences may be indented (nested inside ordered lists in the agent specs), so
 * each line is trimmed before checking for the fence marker.  Returns blocks
 * with 1-based startLine/endLine (inclusive of the fence lines) and the raw
 * content BETWEEN the fences.
 */
function extractFencedBlocks(content) {
  const lines = content.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (!trimmed.startsWith('```')) continue
    const startLine = i + 1 // 1-based, opening fence line
    const buf = []
    i += 1
    while (i < lines.length && !lines[i].trim().startsWith('```')) {
      buf.push(lines[i])
      i += 1
    }
    blocks.push({
      startLine,
      endLine: i + 1, // 1-based, closing fence line (or last line if unterminated)
      content: buf.join('\n'),
    })
  }
  return blocks
}

/**
 * Filter fenced blocks down to delegation prompt templates — the blocks whose
 * content starts with the "This phase must be performed as the agent" line.
 */
function findDelegationBlocks(blocks) {
  return blocks.filter((block) =>
    block.content.includes('This phase must be performed as the agent')
  )
}

/**
 * Locate the delegation block that matches a predicate, or null.
 * @param {Array<{startLine:number,endLine:number,content:string}>} blocks
 */
function findDelegationBlock(blocks, predicate) {
  return blocks.find(predicate) ?? null
}

/** Count (non-overlapping) occurrences of a substring in a string. */
function countOccurrences(content, substring) {
  return content.split(substring).length - 1
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST-07 / TEST-08 — main orchestrator: standard + parallel-coder delegations
// ═════════════════════════════════════════════════════════════════════════════

describe('orchestrator.agent.md delegation parity (plan T17 / TEST-07, TEST-08)', () => {
  const content = readRepoFile(ORCHESTRATOR_PATH)
  const delegationBlocks = findDelegationBlocks(extractFencedBlocks(content))

  // Standard delegation: uses the {agent_name}/{agent_file}/{work_unit}
  // placeholders (the generic "Otherwise" branch of Step 4).
  const standardDelegation = findDelegationBlock(delegationBlocks, (block) =>
    block.content.includes('Work on "{work_unit}"')
  )
  // Parallel-coder delegation: launches per-task "coder" invocations with the
  // {TASK_ID} placeholder and the concrete "Coder - Implementation" agent.
  const parallelCoderDelegation = findDelegationBlock(delegationBlocks, (block) =>
    block.content.includes('Work on "Implement task {TASK_ID}')
  )

  it('TEST-07: standard delegation prompt contains knowledge-retrieval', () => {
    expect(standardDelegation, 'standard delegation block not found (Work on "{work_unit}")').not.toBeNull()
    expect(
      standardDelegation.content.includes('knowledge-retrieval'),
      `standard delegation (lines ${standardDelegation.startLine}-${standardDelegation.endLine}) must contain 'knowledge-retrieval'`
    ).toBe(true)
  })

  it('TEST-08: parallel-coder delegation prompt contains knowledge-retrieval', () => {
    expect(
      parallelCoderDelegation,
      'parallel-coder delegation block not found (Work on "Implement task {TASK_ID})'
    ).not.toBeNull()
    expect(
      parallelCoderDelegation.content.includes('knowledge-retrieval'),
      `parallel-coder delegation (lines ${parallelCoderDelegation.startLine}-${parallelCoderDelegation.endLine}) must contain 'knowledge-retrieval'`
    ).toBe(true)
  })

  it('occurrence count: exactly 2 knowledge-retrieval references (one per delegation type)', () => {
    // Both delegation prompt templates must carry the injection and no extra
    // stray copies should exist elsewhere in the file.
    expect(
      countOccurrences(content, 'knowledge-retrieval.instructions.md'),
      'orchestrator.agent.md must reference the shared protocol exactly twice (standard + parallel-coder)'
    ).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-09 — feature-pipeline: BOTH delegations carry the full context set
// ═════════════════════════════════════════════════════════════════════════════

describe('feature-pipeline.agent.md delegation parity (plan T17 / TEST-09)', () => {
  const content = readRepoFile(FEATURE_PIPELINE_PATH)
  const delegationBlocks = findDelegationBlocks(extractFencedBlocks(content))

  const standardDelegation = findDelegationBlock(delegationBlocks, (block) =>
    block.content.includes('Work on "{work_unit}"')
  )
  const parallelCoderDelegation = findDelegationBlock(delegationBlocks, (block) =>
    block.content.includes('Work on "Implement task {TASK_ID}')
  )

  const CONTEXT_STRINGS = ['learned-knowledge', 'architecture-context', 'knowledgebase']

  function assertFullContext(block, label) {
    expect(block, `${label} delegation block not found`).not.toBeNull()
    for (const needle of CONTEXT_STRINGS) {
      expect(
        block.content.includes(needle),
        `${label} delegation (lines ${block.startLine}-${block.endLine}) must contain '${needle}'`
      ).toBe(true)
    }
  }

  it('TEST-09: standard delegation contains learned-knowledge AND architecture-context AND knowledgebase', () => {
    assertFullContext(standardDelegation, 'standard')
  })

  it('TEST-09: parallel-coder delegation contains learned-knowledge AND architecture-context AND knowledgebase (was asymmetric)', () => {
    assertFullContext(parallelCoderDelegation, 'parallel-coder')
  })

  it('occurrence count: exactly 2 knowledgebase references (one per delegation type)', () => {
    // The knowledgebase injection marker appears once per delegation template.
    expect(
      countOccurrences(content, 'knowledgebase_knowledgebase_search'),
      'feature-pipeline.agent.md must call knowledgebase_knowledgebase_search exactly twice (standard + parallel-coder)'
    ).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-10 — TDD orchestrator: all SIX Phase delegation blocks carry the protocol
// ═════════════════════════════════════════════════════════════════════════════

describe('tdd-orchestrator.agent.md phase delegation parity (plan T17 / TEST-10)', () => {
  const content = readRepoFile(TDD_ORCHESTRATOR_PATH)
  const delegationBlocks = findDelegationBlocks(extractFencedBlocks(content))

  /**
   * Map each `#### Phase N:` heading to the delegation block that lives within
   * its section (startLine after the heading, before the next Phase heading).
   */
  function mapPhaseDelegationBlocks() {
    const lines = content.split('\n')
    const headings = []
    const headingRe = /^#{2,6}\s+Phase\s+(\d+):/i
    lines.forEach((line, idx) => {
      const match = line.match(headingRe)
      if (match) headings.push({ phase: Number(match[1]), line: idx + 1 })
    })

    const result = []
    for (let h = 0; h < headings.length; h += 1) {
      const heading = headings[h]
      const nextHeadingLine = h + 1 < headings.length ? headings[h + 1].line : Infinity
      const block = delegationBlocks.find(
        (b) => b.startLine > heading.line && b.startLine < nextHeadingLine
      )
      if (block) result.push({ ...heading, block })
    }
    return result
  }

  const phaseDelegations = mapPhaseDelegationBlocks()

  it('all six Phase delegation blocks exist (Phase 1..6) and contain knowledge-retrieval', () => {
    const phaseNumbers = phaseDelegations.map((p) => p.phase).sort((a, b) => a - b)
    expect(
      phaseNumbers,
      `expected one delegation block per Phase 1..6, found phases: ${phaseNumbers.join(', ')}`
    ).toEqual([1, 2, 3, 4, 5, 6])

    const failures = phaseDelegations
      .filter(({ block }) => !block.content.includes('knowledge-retrieval'))
      .map(
        ({ phase, block }) =>
          `Phase ${phase} delegation (lines ${block.startLine}-${block.endLine}) missing 'knowledge-retrieval'`
      )

    expect(
      failures,
      failures.length > 0 ? `phases failing parity: ${failures.join('; ')}` : undefined
    ).toEqual([])
  })

  it('occurrence count: exactly 6 knowledge-retrieval references (one per phase)', () => {
    expect(
      countOccurrences(content, 'knowledge-retrieval.instructions.md'),
      'tdd-orchestrator.agent.md must reference the shared protocol exactly six times (one per Phase delegation)'
    ).toBe(6)
  })
})
