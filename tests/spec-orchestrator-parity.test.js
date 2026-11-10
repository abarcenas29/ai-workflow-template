// ═════════════════════════════════════════════════════════════════════════════
// spec-orchestrator-parity.test.js — Orchestrator delegation template parity
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/refactor-orchestrator-token-cost-v1.md T14 (TEST-11) — the parity
// spec for the three orchestrator delegation templates AFTER the R1 rewrite
// (T3–T8). The contract this file pins is the NEW one:
//
//   (a) Every delegation fence carries a `CONTEXT DIGEST` block and exactly one
//       five-line `RETURN:` rule. The old `Work on "..."` / `knowledge-retrieval
//       .instructions.md` anchors are gone from the templates T14's finders
//       select; the finders anchor on `CONTEXT DIGEST` + the `read:` field
//       (generic standard template) and `TASK SLICE` + `"Coder - Implementation"`
//       (parallel-coder template).
//   (b) `KNOWLEDGE-RETRIEVAL:` is the marker that replaced the removed file
//       path. It is counted ACROSS DELEGATION FENCES, not the whole file, and
//       the whole-file count must equal the fence count so a stray uppercase
//       copy outside a fence fails here (the marker appears only in templates).
//   (c) The three read triggers the rewrite deleted are asserted absent from
//       every delegation fence — the assertions that would have caught the
//       original cost defect.
//   (d) Each file's doctrine intro names exactly three permitted self-writes:
//       the Step 0 existence probe, transcription of a `### Documentation
//       handoff`, and one plan read per run.
//
// Measured on 2026-11-08 against the rewritten files (T3–T8 complete):
//
//   file                  fences   KNOWLEDGE-RETRIEVAL:   lowercase occurrence
//   orchestrator.md          5            5                     1
//   feature-pipeline.md      5            4                     1
//   tdd-orchestrator.md      8            7                     1
//
// The TDD count is 7 (the Step 3b template plus six Phase fences), not the 6
// the plan's pre-implementation table guessed; `feature-pipeline.md` is 4, not
// the whole-file 7 the Step-3b/Phase shape would suggest elsewhere.
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

const ORCHESTRATOR_PATH = '.opencode/agents/orchestrator/orchestrator.md'
const FEATURE_PIPELINE_PATH = '.opencode/agents/orchestrator/feature-pipeline.md'
const TDD_ORCHESTRATOR_PATH = '.opencode/agents/orchestrator/tdd-orchestrator.md'

// ── Pinned counts — measured, not inherited from the pre-rewrite spec ──────
//
// `fences`      — delegation prompt templates (fenced blocks whose content
//                 carries the "This phase must be performed as the agent" line).
// `markers`     — `KNOWLEDGE-RETRIEVAL:` occurrences across those fences.
// `lowercase`   — lowercase `knowledge-retrieval` occurrences in the file (one
//                 closing rule per file; `spec-knowledge-retrieval.test.js`
//                 TEST-03 is case-sensitive and depends on it).
//
// Re-measure before changing any of these numbers.

const FILES = [
  {
    label: 'orchestrator.md',
    path: ORCHESTRATOR_PATH,
    fences: 5,
    markers: 5,
    lowercase: 1,
  },
  {
    label: 'feature-pipeline.md',
    path: FEATURE_PIPELINE_PATH,
    fences: 5,
    markers: 4,
    lowercase: 1,
  },
  {
    label: 'tdd-orchestrator.md',
    path: TDD_ORCHESTRATOR_PATH,
    fences: 8,
    markers: 7,
    lowercase: 1,
  },
]

const FILE_ROWS = FILES.map((file) => [file.label, file])

// Read triggers the rewrite deleted. None may survive inside a delegation
// fence: each one either names a file the spawn must not read or re-states the
// old "apply the block verbatim" file-read contract.
const REMOVED_READ_TRIGGERS = [
  'knowledge-retrieval.instructions.md',
  'documentation-handoff.instructions.md',
  'carry the Step 3b block verbatim',
  'carry the Step 2b block verbatim',
  'from plan /plan/',
  'read the plan file',
]

const TRIGGER_ROWS = FILES.flatMap((file) =>
  REMOVED_READ_TRIGGERS.map((needle) => [file.label, needle, file])
)

// The five-line return rule every delegation fence must carry, exactly once.
const RETURN_RULE =
  '- RETURN: the five lines — STATUS / ARTIFACTS / QUESTIONS / HANDOFF / TOKENS.'

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
 * This line survives the rewrite; the old `Work on "..."` line did not.
 */
function findDelegationBlocks(blocks) {
  return blocks.filter((block) =>
    block.content.includes('This phase must be performed as the agent')
  )
}

/** Delegation fences for one file. */
function delegationFencesOf(path) {
  return findDelegationBlocks(extractFencedBlocks(readRepoFile(path)))
}

/**
 * The generic standard delegation template (Step 3b/2b sample and Step 4/3
 * prompt): a `{agent_name}` placeholder, a `CONTEXT DIGEST` block, and a
 * `read:` line. Anchored on content that survives the rewrite — never on the
 * removed `Work on "..."` prefix.
 */
function isStandardTemplate(block) {
  return (
    block.content.includes('{agent_name}') &&
    block.content.includes('CONTEXT DIGEST') &&
    /^-\s+read:/m.test(block.content)
  )
}

/**
 * The parallel-coder delegation template: a `TASK SLICE` block plus the
 * concrete coder identity line.
 */
function isParallelCoderTemplate(block) {
  return (
    block.content.includes('TASK SLICE') &&
    block.content.includes('"Coder - Implementation"')
  )
}

/** Last non-empty line of a block, trimmed. */
function lastNonEmptyLine(block) {
  const nonEmpty = block.content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return nonEmpty[nonEmpty.length - 1] ?? ''
}

/** Count (non-overlapping) occurrences of a substring in a string. */
function countOccurrences(content, substring) {
  return content.split(substring).length - 1
}

/** One-line description of the blocks that matched, for failure messages. */
function describeBlocks(blocks) {
  return blocks.map((block) => `${block.startLine}-${block.endLine}`).join(', ')
}

// ═════════════════════════════════════════════════════════════════════════════
// Fence structure — CONTEXT DIGEST, the five-line RETURN, and the new finders
// ═════════════════════════════════════════════════════════════════════════════

describe('delegation fence structure (T14 / TEST-11)', () => {
  it.each(FILE_ROWS)(
    '%s defines the pinned number of delegation fences',
    (_label, file) => {
      const fences = delegationFencesOf(file.path)
      expect(
        fences.length,
        `${file.path} delegation fences at lines: ${describeBlocks(fences)}`
      ).toBe(file.fences)
    }
  )

  it.each(FILE_ROWS)(
    '%s: every delegation fence carries a CONTEXT DIGEST block',
    (_label, file) => {
      const offenders = delegationFencesOf(file.path).filter(
        (block) => !block.content.includes('CONTEXT DIGEST')
      )
      expect(
        offenders.map((block) => `${block.startLine}-${block.endLine}`),
        'every delegation fence must carry an inline CONTEXT DIGEST block'
      ).toEqual([])
    }
  )

  it.each(FILE_ROWS)(
    '%s: every delegation fence carries exactly one five-line RETURN rule',
    (_label, file) => {
      const fences = delegationFencesOf(file.path)
      const offenders = fences
        .map((block) => ({
          block,
          count: countOccurrences(block.content, RETURN_RULE),
        }))
        .filter((entry) => entry.count !== 1)
        .map(
          (entry) =>
            `${entry.block.startLine}-${entry.block.endLine}: ${entry.count} RETURN rules`
        )
      expect(
        offenders,
        'each delegation fence must carry the five-line RETURN rule exactly once'
      ).toEqual([])
    }
  )

  it.each(FILE_ROWS)(
    '%s: the standard template is findable by CONTEXT DIGEST + read: (not by a removed anchor)',
    (_label, file) => {
      const standards = delegationFencesOf(file.path).filter(isStandardTemplate)
      expect(
        standards.length,
        `${file.path} must contain at least one standard delegation template ` +
          'anchored on {agent_name} + CONTEXT DIGEST + read:'
      ).toBeGreaterThan(0)
    }
  )

  it.each(FILE_ROWS)(
    '%s: exactly one parallel-coder template is findable by TASK SLICE + "Coder - Implementation"',
    (_label, file) => {
      const coderTemplates = delegationFencesOf(file.path).filter(
        isParallelCoderTemplate
      )
      expect(
        coderTemplates.length,
        `${file.path} must contain exactly one parallel-coder delegation template`
      ).toBe(1)
    }
  )

  it.each(FILE_ROWS)(
    '%s: the parallel-coder template drops owned: and forbids the plan read',
    (_label, file) => {
      const [coderTemplate] = delegationFencesOf(file.path).filter(
        isParallelCoderTemplate
      )
      expect(coderTemplate, 'parallel-coder template not found').toBeDefined()
      expect(
        coderTemplate.content.includes('owned:'),
        `parallel-coder template (lines ${coderTemplate.startLine}-${coderTemplate.endLine}) ` +
          "must drop 'owned:' — the slice's FILES line states it"
      ).toBe(false)
      expect(
        /do not read the plan|never reads the plan|never read the plan/i.test(
          coderTemplate.content
        ),
        `parallel-coder template (lines ${coderTemplate.startLine}-${coderTemplate.endLine}) ` +
          'must state that the plan is not the coder to read'
      ).toBe(true)
    }
  )

  it.each(FILE_ROWS)(
    '%s: the standard and parallel-coder templates end with the five-line RETURN rule',
    (_label, file) => {
      const templates = delegationFencesOf(file.path).filter(
        (block) => isStandardTemplate(block) || isParallelCoderTemplate(block)
      )
      expect(templates.length).toBeGreaterThan(0)
      const offenders = templates
        .filter((block) => !lastNonEmptyLine(block).startsWith(RETURN_RULE))
        .map(
          (block) =>
            `${block.startLine}-${block.endLine} ends with ` +
            `"${lastNonEmptyLine(block).slice(0, 60)}"`
        )
      expect(
        offenders,
        'canonical templates keep the RETURN rule last (static body first, per-run values last)'
      ).toEqual([])
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// TEST-09 — every standard delegation carries the full context set
// ═════════════════════════════════════════════════════════════════════════════

const CONTEXT_STRINGS = ['learned-knowledge', 'architecture-context', 'knowledgebase']

describe('standard delegation context parity (T14 / TEST-09)', () => {
  it.each(FILE_ROWS)(
    '%s: every standard template carries learned-knowledge AND architecture-context AND knowledgebase',
    (_label, file) => {
      const standards = delegationFencesOf(file.path).filter(isStandardTemplate)
      expect(standards.length).toBeGreaterThan(0)
      for (const block of standards) {
        for (const needle of CONTEXT_STRINGS) {
          expect(
            block.content.includes(needle),
            `standard delegation (lines ${block.startLine}-${block.endLine}) must contain '${needle}'`
          ).toBe(true)
        }
      }
    }
  )

  it.each(FILE_ROWS)(
    '%s: knowledgebase_knowledgebase_search is called once per delegation fence',
    (_label, file) => {
      const content = readRepoFile(file.path)
      const fences = delegationFencesOf(file.path)
      const insideFences = fences.reduce(
        (total, block) =>
          total + countOccurrences(block.content, 'knowledgebase_knowledgebase_search'),
        0
      )
      expect(
        insideFences,
        `${file.path} must call knowledgebase_knowledgebase_search once per delegation fence`
      ).toBe(file.markers)
      expect(
        countOccurrences(content, 'knowledgebase_knowledgebase_search'),
        `${file.path} whole-file count must equal the fence count — no stray call outside a fence`
      ).toBe(insideFences)
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE-RETRIEVAL: — replaces the removed file-path counts (was 2 / 2 / 6)
// ═════════════════════════════════════════════════════════════════════════════

describe('KNOWLEDGE-RETRIEVAL marker counts (T14)', () => {
  it.each(FILE_ROWS)(
    '%s: KNOWLEDGE-RETRIEVAL: appears the pinned number of times across delegation fences',
    (_label, file) => {
      const fences = delegationFencesOf(file.path)
      const inFences = fences.reduce(
        (total, block) => total + countOccurrences(block.content, 'KNOWLEDGE-RETRIEVAL:'),
        0
      )
      expect(
        inFences,
        `${file.path} must carry ${file.markers} KNOWLEDGE-RETRIEVAL: markers across ` +
          `${fences.length} delegation fences`
      ).toBe(file.markers)
    }
  )

  it.each(FILE_ROWS)(
    '%s: no KNOWLEDGE-RETRIEVAL: marker exists outside a delegation fence',
    (_label, file) => {
      const content = readRepoFile(file.path)
      const fences = delegationFencesOf(file.path)
      const inFences = fences.reduce(
        (total, block) => total + countOccurrences(block.content, 'KNOWLEDGE-RETRIEVAL:'),
        0
      )
      expect(
        countOccurrences(content, 'KNOWLEDGE-RETRIEVAL:'),
        `${file.path} whole-file count must equal the fence count — a second uppercase ` +
          'occurrence in prose would silently move the pinned number'
      ).toBe(inFences)
    }
  )

  it.each(FILE_ROWS)(
    '%s: exactly the pinned number of lowercase knowledge-retrieval occurrences (RISK-04)',
    (_label, file) => {
      const content = readRepoFile(file.path)
      expect(
        countOccurrences(content, 'knowledge-retrieval'),
        `${file.path} keeps ${file.lowercase} lowercase occurrence (closing rule); ` +
          'spec-knowledge-retrieval.test.js TEST-03 is case-sensitive'
      ).toBe(file.lowercase)
      expect(
        countOccurrences(content, 'knowledge-retrieval.instructions.md'),
        `${file.path} must not point at the shared protocol file — the digest carries it inline`
      ).toBe(0)
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// Negative assertions — the removed read triggers must not come back
// ═════════════════════════════════════════════════════════════════════════════

describe('removed read triggers are absent from every delegation fence', () => {
  it.each(TRIGGER_ROWS)(
    '%s: no delegation fence contains %s',
    (_label, needle, file) => {
      const offenders = delegationFencesOf(file.path)
        .filter((block) => block.content.toLowerCase().includes(needle.toLowerCase()))
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path} delegation fences must not contain '${needle}'`
      ).toEqual([])
    }
  )

  it.each([FILES[0], FILES[1]].map((file) => [file.label, file]))(
    '%s: the legacy `Work on "` anchor is gone from the whole file',
    (_label, file) => {
      const content = readRepoFile(file.path)
      expect(
        countOccurrences(content, 'Work on "'),
        `${file.path} must not reintroduce the removed 'Work on "…' anchor`
      ).toBe(0)
    }
  )

  it.each(FILE_ROWS)(
    '%s: neither the standard nor the parallel-coder template carries `Work on "`',
    (_label, file) => {
      const templates = delegationFencesOf(file.path).filter(
        (block) => isStandardTemplate(block) || isParallelCoderTemplate(block)
      )
      const offenders = templates
        .filter((block) => block.content.includes('Work on "'))
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path}: the templates T14's finders select must not carry the removed anchor`
      ).toEqual([])
    }
  )

  it('tdd-orchestrator.md: the legacy `Work on "` anchor survives only in the Phase 1 static intent', () => {
    const content = readRepoFile(TDD_ORCHESTRATOR_PATH)
    const fences = findDelegationBlocks(extractFencedBlocks(content))

    // Map each `#### Phase N:` heading to the delegation fence in its section.
    const lines = content.split('\n')
    const headings = []
    const headingRe = /^#{2,6}\s+Phase\s+(\d+):/i
    lines.forEach((line, idx) => {
      const match = line.match(headingRe)
      if (match) headings.push({ phase: Number(match[1]), line: idx + 1 })
    })
    const mapped = []
    for (let h = 0; h < headings.length; h += 1) {
      const heading = headings[h]
      const nextLine = h + 1 < headings.length ? headings[h + 1].line : Infinity
      const block = fences.find(
        (b) => b.startLine > heading.line && b.startLine < nextLine
      )
      if (block) mapped.push({ phase: heading.phase, block })
    }

    expect(
      mapped.map((entry) => entry.phase).sort((a, b) => a - b),
      'expected one delegation fence per Phase 1..6'
    ).toEqual([1, 2, 3, 4, 5, 6])

    // One residual occurrence is known and reported, not fixed: Phase 1's
    // static phase intent still carries `Work on "{work_unit}"`. The assertion
    // forbids it from spreading into Phase 2–6 without pinning the residual in
    // place (so removing it later stays green).
    const offendingPhases = mapped
      .filter((entry) => entry.block.content.includes('Work on "'))
      .map((entry) => entry.phase)

    expect(
      offendingPhases.every((phase) => phase === 1),
      `phases 2–6 must not carry the removed anchor; offending phases: ${offendingPhases.join(', ')}`
    ).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Doctrine intro — exactly three permitted self-writes, named in each file
// ═════════════════════════════════════════════════════════════════════════════

describe('each orchestrator doctrine intro names exactly three permitted self-writes', () => {
  /** The prose between the H1 title and `## Dynamic Parameters`. */
  function doctrineIntro(content) {
    const h1 = content.search(/^# .+$/m)
    const dynamic = content.indexOf('## Dynamic Parameters')
    if (h1 === -1 || dynamic === -1 || dynamic <= h1) return ''
    return content.slice(h1, dynamic)
  }

  it.each(FILE_ROWS)('%s: the intro names the three exceptions', (_label, file) => {
    const intro = doctrineIntro(readRepoFile(file.path))
    expect(intro.length, `${file.path} doctrine intro not found`).toBeGreaterThan(0)

    expect(
      /exactly three exceptions/i.test(intro),
      `${file.path} intro must state that exactly three self-writes are permitted`
    ).toBe(true)
    expect(
      /existence probe/i.test(intro),
      `${file.path} intro must name the Step 0 existence probe as exception (1)`
    ).toBe(true)
    expect(
      /Documentation handoff/.test(intro),
      `${file.path} intro must name the documentation-handoff transcription as an exception`
    ).toBe(true)
    expect(
      /plan read/i.test(intro),
      `${file.path} intro must name the single plan read as exception (3)`
    ).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Documentation handoff receivers — separate from the counts above, so deleting
// a receiver fails a test without touching the pinned marker counts.
// ═════════════════════════════════════════════════════════════════════════════

describe('documentation handoff receivers exist in every orchestrator', () => {
  it.each(FILE_ROWS)(
    '%s defines exactly one "#### Applying documentation handoffs" receiver',
    (_label, file) => {
      const content = readRepoFile(file.path)

      expect(
        countOccurrences(content, '#### Applying documentation handoffs'),
        `${file.path} must define exactly one documentation-handoff receiver`
      ).toBe(1)
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// Per-spawn digest blocks — the policy must exist, not just be pointed at.
// ═════════════════════════════════════════════════════════════════════════════

const DIGEST_BLOCKS = [
  ['orchestrator.md', ORCHESTRATOR_PATH, '### Step 3b: Per-Spawn Context Digest and Read Policy'],
  ['feature-pipeline.md', FEATURE_PIPELINE_PATH, '### Step 2b: Per-Spawn Context Digest and Read Policy'],
  ['tdd-orchestrator.md', TDD_ORCHESTRATOR_PATH, '### Step 3b: Per-Spawn Context Digest and Read Policy'],
]

const DIGEST_POLICY_TERMS = ['memory_search', 'memory-bank/tasks/', 'learned-knowledge']

describe('per-spawn context digest blocks exist with the read policy', () => {
  it.each(DIGEST_BLOCKS)(
    '%s digest block is present and carries memory_search + memory-bank/tasks/ + learned-knowledge',
    (_label, path, heading) => {
      const content = readRepoFile(path)
      const headingIndex = content.indexOf(heading)

      expect(
        headingIndex,
        `${path} must contain the digest heading '${heading}'`
      ).toBeGreaterThan(-1)

      // Extent of the block: the heading up to the next ## or ### heading.
      const rest = content.slice(headingIndex + heading.length)
      const nextSection = rest.search(/\n#{2,3} /)
      const block = nextSection === -1 ? rest : rest.slice(0, nextSection)

      for (const term of DIGEST_POLICY_TERMS) {
        expect(
          block.includes(term),
          `digest block in ${path} must contain '${term}'`
        ).toBe(true)
      }
    }
  )
})
