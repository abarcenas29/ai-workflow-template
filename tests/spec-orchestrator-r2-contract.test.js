// ═════════════════════════════════════════════════════════════════════════════
// spec-orchestrator-r2-contract.test.js — R2 behaviour contract (T24 / TEST-13)
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/refactor-orchestrator-token-cost-v1.md T24 — the BEHAVIOUR
// contract for the six R2 additions (A1–A6).
//
// T29 RE-SCOPED THIS FILE. R2 is a property of the DYNAMIC orchestrator only:
//
//   .opencode/agents/orchestrator/orchestrator.md      ← in scope
//   .opencode/agents/orchestrator/feature-pipeline.md  ← OUT OF SCOPE (fixed pipeline)
//   .opencode/agents/orchestrator/tdd-orchestrator.md  ← OUT OF SCOPE (fixed pipeline)
//
// The two fixed pipelines are deterministic four-step / TDD cycles: they have no
// dynamic agent selection, so stepKey idempotence, pipelineMode, digest caps,
// deferred status and spec drift have nothing to attach to. Rewriting them with
// R2 text grew both files for no behavioural gain, and both reverted to R1.
//
// The scope decision is encoded as a NEGATIVE test, not just a comment: a later
// edit that silently re-adds R2 to a fixed pipeline fails here.
//
// This file deliberately asserts NO byte ceiling and NO block size.
// `tests/spec-delegation-budget.test.js` owns those numbers (T25 re-pins them);
// two specs pinning the same bytes would fight. Behaviour only.
//
// Section order is load-bearing: A2 (TEST-14) comes first, because it is the
// highest-priority behaviour and was proved before the rest of the contract
// was written (see the A2 block's own note).
//
// The fence extractor and the delegation finder are copied locally from
// `tests/spec-orchestrator-parity.test.js` per DEP-07 — no shared helper file.
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

// R2 is scoped to exactly one file (T29). Every A1–A6 row below runs against
// this single entry; the fixed pipelines are asserted NEGATIVE instead.
const FILES = [
  {
    label: 'orchestrator.md',
    path: ORCHESTRATOR_PATH,
    // Measured 2026-11-08 — delegation fences (blocks carrying the
    // "This phase must be performed as the agent" line).
    fences: 5,
  },
]

const FILE_ROWS = FILES.map((file) => [file.label, file])

/** The two fixed-pipeline orchestrators R2 must never touch again. */
const OUT_OF_SCOPE_FILES = [
  {
    label: 'feature-pipeline.md',
    path: '.opencode/agents/orchestrator/feature-pipeline.md',
  },
  {
    label: 'tdd-orchestrator.md',
    path: '.opencode/agents/orchestrator/tdd-orchestrator.md',
  },
]

/**
 * Every token an R2 addition introduced. A fixed pipeline carrying any one of
 * these has been re-scoped into the dynamic contract by accident.
 */
const R2_ONLY_MARKERS = [
  'stepKey',
  'IDEMPOTENCE',
  'pipelineMode',
  'SPEC DRIFT',
  'session=',
  'deferred',
  'CAPPED:',
]

// ── Fenced-block extraction (same shape as the parity spec) ─────────────────

/**
 * Extract every fenced markdown block. Fences may be indented (nested inside
 * ordered lists), so each line is trimmed before the fence marker is checked.
 */
function extractFencedBlocks(content) {
  const lines = content.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (!trimmed.startsWith('```')) continue
    const startLine = i + 1
    const buf = []
    i += 1
    while (i < lines.length && !lines[i].trim().startsWith('```')) {
      buf.push(lines[i])
      i += 1
    }
    blocks.push({ startLine, endLine: i + 1, content: buf.join('\n') })
  }
  return blocks
}

/** Delegation prompt templates: the blocks whose content is a spawn prompt. */
function findDelegationBlocks(blocks) {
  return blocks.filter((block) =>
    block.content.includes('This phase must be performed as the agent')
  )
}

function delegationFencesOf(path) {
  return findDelegationBlocks(extractFencedBlocks(readRepoFile(path)))
}

function describeBlocks(blocks) {
  return blocks.map((block) => `${block.startLine}-${block.endLine}`).join(', ')
}

/** Count non-overlapping occurrences of a substring. */
function countOccurrences(content, substring) {
  return content.split(substring).length - 1
}

// ═════════════════════════════════════════════════════════════════════════════
// Scope (T29) — R2 is orchestrator.md only, asserted negatively
// ═════════════════════════════════════════════════════════════════════════════
//
// This block is the decision, executable. Before T29 the matrix held three
// files and the fixed pipelines were asserted POSITIVE for six R2 behaviours —
// which is why their revert showed up as 36 red tests instead of a scoped
// contract. Asserting absence makes a re-add fail instead.

describe('scope (T29) — R2 covers orchestrator.md and nothing else', () => {
  it('the behaviour matrix is exactly one file', () => {
    expect(FILES.map((file) => file.path)).toEqual([ORCHESTRATOR_PATH])
  })

  it.each(OUT_OF_SCOPE_FILES.map((file) => [file.label, file]))(
    '%s is not in the behaviour matrix',
    (_label, file) => {
      expect(
        FILES.some((candidate) => candidate.path === file.path),
        `${file.path} must stay out of the R2 matrix — the fixed pipelines are R1`
      ).toBe(false)
    }
  )

  it.each(
    OUT_OF_SCOPE_FILES.flatMap((file) =>
      R2_ONLY_MARKERS.map((marker) => [`${file.label} — ${marker}`, file, marker])
    )
  )('%s is absent', (_name, file, marker) => {
    const content = readRepoFile(file.path)
    const hits = content
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.includes(marker))
      .map(({ number }) => number)

    expect(
      hits,
      `${file.path}: R2 marker '${marker}' must not appear here (lines ${hits.join(', ')}). ` +
        'R2 is scoped to orchestrator.md; re-adding it to a fixed pipeline is a scope regression'
    ).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// A2 — stepKey + attempt idempotence (TEST-14, proved FIRST)
// ═════════════════════════════════════════════════════════════════════════════
//
// TEST-14 is the A2 proof and this block is its static contract. The canonical
// instruction is the one that makes a re-run cheap without skipping half-landed
// work: "continue from them; do not redo landed work" — continue, not skip
// (RISK-09). A fence that carries only `stepKey` and no instruction, or an
// instruction reworded to "skip if the file exists", fails here.
//
// The negative matters as much as the positive: a fence that tells the spawn to
// read the plan pays for the plan and re-opens the read the R1 rewrite removed.

/** The exact A2 lines every delegation fence must carry. */
const STEP_KEY_LINE = '- stepKey: <key> | attempt: <n> ≥1'
const IDEMPOTENCE_LINE =
  "- IDEMPOTENCE: if this stepKey's artifacts already exist, continue from them; do not redo landed work."

/**
 * Affirmative plan-read instructions. Anchored on an imperative at the start of
 * a line (after an optional bullet or list number) so a prohibition such as
 * "the coder never reads the plan" does not match, while the exact removed line
 * "Read the plan file to understand the full spec…" does.
 */
const PLAN_READ_INSTRUCTION =
  /^\s*(?:[-*+]|\d+[.)])?\s*(?:you\s+)?(?:must\s+|should\s+|always\s+)?(?:read|open|consult|load)\s+(?:the\s+)?(?:plan|`?\/plan\/`?)/im

describe('A2 (TEST-14) — every delegation carries stepKey + attempt and the idempotence rule', () => {
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
    '%s: every delegation fence carries the stepKey + attempt line',
    (_label, file) => {
      const offenders = delegationFencesOf(file.path)
        .filter((block) => countOccurrences(block.content, STEP_KEY_LINE) !== 1)
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path}: every delegation fence must carry '${STEP_KEY_LINE}' exactly once`
      ).toEqual([])
    }
  )

  it.each(FILE_ROWS)(
    '%s: every delegation fence carries the stepKey + attempt line fields',
    (_label, file) => {
      // Independent of the canonical spelling: the two field names must both be
      // present in the fence's stepKey line, so a rewrite that drops `attempt`
      // fails even if it keeps a differently worded stepKey line.
      const offenders = delegationFencesOf(file.path)
        .filter((block) => {
          const line = block.content
            .split('\n')
            .find((candidate) => /stepKey/i.test(candidate) && /attempt/i.test(candidate))
          return !line
        })
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path}: a fence's stepKey line must also carry 'attempt'`
      ).toEqual([])
    }
  )

  it.each(FILE_ROWS)(
    '%s: every delegation fence carries the IDEMPOTENCE instruction exactly once',
    (_label, file) => {
      const fences = delegationFencesOf(file.path)
      const offenders = fences
        .map((block) => ({
          block,
          count: countOccurrences(block.content, 'IDEMPOTENCE:'),
        }))
        .filter((entry) => entry.count !== 1)
        .map((entry) => `${entry.block.startLine}-${entry.block.endLine}: ${entry.count}`)
      expect(
        offenders,
        `${file.path}: each delegation fence must carry one IDEMPOTENCE: instruction`
      ).toEqual([])
    }
  )

  it.each(FILE_ROWS)(
    '%s: the IDEMPOTENCE instruction says CONTINUE from landed artifacts, not skip',
    (_label, file) => {
      const offenders = delegationFencesOf(file.path)
        .filter((block) => !block.content.includes(IDEMPOTENCE_LINE))
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path}: the canonical wording 'continue from them; do not redo landed work' ` +
          'is the A2 contract — a "skip" rewrite re-opens RISK-09'
      ).toEqual([])
    }
  )

  it.each(FILE_ROWS)(
    '%s (negative): no delegation fence instructs the spawn to read the plan',
    (_label, file) => {
      const offenders = delegationFencesOf(file.path)
        .filter((block) => PLAN_READ_INSTRUCTION.test(block.content))
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path}: a delegation fence must not tell the spawn to read the plan — ` +
          'the TASK SLICE / CONTEXT DIGEST is the whole input'
      ).toEqual([])
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// Region helpers — sections, paragraphs, and the failure-taxonomy extent
// ═════════════════════════════════════════════════════════════════════════════

/** A `## Heading` section: heading to the next `##`/`###` heading. */
function sectionOf(content, heading) {
  const index = content.indexOf(heading)
  if (index === -1) return ''
  const rest = content.slice(index + heading.length)
  const next = rest.search(/\n#{2,3} /)
  return next === -1 ? rest : rest.slice(0, next)
}

/** The blank-line-delimited paragraph that contains `needle`. */
function paragraphContaining(content, needle) {
  const index = content.indexOf(needle)
  if (index === -1) return ''
  const previousBreak = content.lastIndexOf('\n\n', index)
  const nextBreak = content.indexOf('\n\n', index)
  return content.slice(
    previousBreak === -1 ? 0 : previousBreak + 2,
    nextBreak === -1 ? content.length : nextBreak
  )
}

/** All lines that contain `needle`. */
function linesContaining(content, needle) {
  return content
    .split('\n')
    .filter((line) => line.toLowerCase().includes(needle.toLowerCase()))
}

/**
 * The failure-taxonomy extent: from "Classify a step whose" to the first
 * following numbered item that closes it (`8b.` or `9.`). `null` when the
 * opener is absent, so the caller fails with a useful message.
 */
function taxonomyRegion(content) {
  const start = content.indexOf('Classify a step whose')
  if (start === -1) return null
  const rest = content.slice(start)
  const endMarkers = [/^\s*8b[.)]/m, /^\s*9[.)]/m]
  let end = rest.length
  for (const marker of endMarkers) {
    const match = rest.match(marker)
    if (match && match.index < end) end = match.index
  }
  return rest.slice(0, end)
}

// ═════════════════════════════════════════════════════════════════════════════
// A1 — a failed or blocked step surfaces its session (REQ-13)
// ═════════════════════════════════════════════════════════════════════════════

describe('A1 — the step log records the session and the gate resumes it', () => {
  it.each(FILE_ROWS)(
    '%s: the step log line carries a session identifier',
    (_label, file) => {
      const content = readRepoFile(file.path)
      const logLines = linesContaining(content, '| STATUS | duration')

      expect(
        logLines.length,
        `${file.path} must define at least one per-step log line`
      ).toBeGreaterThan(0)
      expect(
        logLines.some((line) => line.includes('stepKey=') && line.includes('session=')),
        `${file.path}: the log line must key both stepKey= and session= — ` +
          'the session ID lives in the log line, there is no store'
      ).toBe(true)
    }
  )

  it.each(FILE_ROWS)(
    '%s: the gate text names resuming that session, not re-spawning',
    (_label, file) => {
      const content = readRepoFile(file.path)
      const gateLines = linesContaining(content, 'resume session')

      expect(
        gateLines.length,
        `${file.path} must print 'resume session {sessionID}'`
      ).toBeGreaterThan(0)
      expect(
        gateLines.some((line) => /gate/i.test(line)),
        `${file.path}: one 'resume session' line must sit in the gate/failure text, ` +
          'so the user resumes instead of paying for a new spawn'
      ).toBe(true)
      expect(
        /resume session \{sessionID\}/.test(content),
        `${file.path}: the resume line must interpolate {sessionID}`
      ).toBe(true)
    }
  )

  it.each(FILE_ROWS)(
    '%s (negative): no delegation fence carries the resume instruction (SEC-04)',
    (_label, file) => {
      const offenders = delegationFencesOf(file.path)
        .filter((block) => block.content.includes('resume session'))
        .map((block) => `${block.startLine}-${block.endLine}`)
      expect(
        offenders,
        `${file.path}: the resume instruction belongs to the orchestrator's gate, ` +
          'never to a spawn prompt'
      ).toEqual([])
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// A3 — pipelineMode: observe | confirm | auto (REQ-15)
// ═════════════════════════════════════════════════════════════════════════════

describe('A3 — pipelineMode is declared with observe as a non-executing preview', () => {
  it.each(FILE_ROWS)(
    '%s: Dynamic Parameters declares pipelineMode with the three values',
    (_label, file) => {
      const section = sectionOf(readRepoFile(file.path), '## Dynamic Parameters')

      expect(section.length, `${file.path} has no ## Dynamic Parameters section`).toBeGreaterThan(0)
      expect(section.includes('pipelineMode'), `${file.path}: pipelineMode is not declared`).toBe(
        true
      )
      for (const value of ['observe', 'confirm', 'auto']) {
        expect(
          section.includes(value),
          `${file.path}: the pipelineMode declaration must name '${value}'`
        ).toBe(true)
      }
    }
  )

  it.each(FILE_ROWS)(
    '%s: pipelineMode wins over autoConfirm, and confirmationGates stays orthogonal',
    (_label, file) => {
      const section = sectionOf(readRepoFile(file.path), '## Dynamic Parameters')

      expect(
        /`?pipelineMode`?\s+wins over\s+`?autoConfirm`?/i.test(section),
        `${file.path}: the precedence rule ('pipelineMode wins over autoConfirm') must be stated`
      ).toBe(true)
      expect(
        /`?confirmationGates`?\s+is\s+orthogonal/i.test(section),
        `${file.path}: confirmationGates must be stated as orthogonal — observe precedes a gate, ` +
          'it does not suppress one'
      ).toBe(true)
    }
  )

  it.each(FILE_ROWS)(
    '%s: observe is described as stopping before any delegation',
    (_label, file) => {
      const section = sectionOf(readRepoFile(file.path), '## Dynamic Parameters')

      expect(
        /observe[\s\S]{0,220}?(?:stops without delegating|stops before|then stops?)/i.test(section),
        `${file.path}: observe must print the steps and prompts, then stop before delegating`
      ).toBe(true)
      // And the Step that owns the loop repeats the stop point in its own words.
      expect(
        /observe[\s\S]{0,400}?(?:then stops?|stops before|delegates nothing)/i.test(
          readRepoFile(file.path)
        ),
        `${file.path}: the execute step must name where observe stops`
      ).toBe(true)
    }
  )

  it.each(FILE_ROWS)(
    '%s (negative): observe never authorises answering a scope question',
    (_label, file) => {
      const section = sectionOf(readRepoFile(file.path), '## Dynamic Parameters')

      expect(
        /never answers/i.test(section),
        `${file.path}: the declaration must say observe prints, it never answers`
      ).toBe(true)
      expect(
        section.includes('scope never answers its own questions'),
        `${file.path}: the scope-answers-itself prohibition must survive observe`
      ).toBe(true)
      expect(
        /observe[^.\n]{0,80}(?:may|can|is allowed to)\s+answer/i.test(section),
        `${file.path}: no sentence may authorise observe to answer a scope question`
      ).toBe(false)
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// A4 — digest caps: 40 words / 3 questions / paths only, one CAPPED: line
// ═════════════════════════════════════════════════════════════════════════════

const CAPPED_MARKER = 'CAPPED: {field} {before}->{after}'

describe('A4 — the digest caps and the single CAPPED: log marker', () => {
  it.each(FILE_ROWS)('%s: caps previous at 40 words and QUESTIONS at 3 items', (_label, file) => {
    const paragraph = paragraphContaining(readRepoFile(file.path), 'Digest caps')

    expect(paragraph.length, `${file.path} has no "Digest caps" paragraph`).toBeGreaterThan(0)
    expect(/\b40\b/.test(paragraph), `${file.path}: the previous-word cap must be 40`).toBe(true)
    expect(/words/i.test(paragraph), `${file.path}: the 40 cap must name words`).toBe(true)
    expect(/\b3\b/.test(paragraph), `${file.path}: the QUESTIONS cap must be 3`).toBe(true)
    expect(
      /QUESTIONS|numbered items/i.test(paragraph),
      `${file.path}: the 3 cap must name QUESTIONS`
    ).toBe(true)
  })

  it.each(FILE_ROWS)('%s: ARTIFACTS is paths only and every other field is one line', (_label, file) => {
    const paragraph = paragraphContaining(readRepoFile(file.path), 'Digest caps')

    expect(
      /ARTIFACTS[\s\S]{0,80}(?:prose is dropped|paths only)/i.test(paragraph),
      `${file.path}: ARTIFACTS must be paths only — prose dropped at capture`
    ).toBe(true)
    expect(
      /any field over one line is cut to its first|one line/i.test(paragraph),
      `${file.path}: every other field must be cut to one line`
    ).toBe(true)
  })

  it.each(FILE_ROWS)('%s: truncation is one CAPPED: line, not report prose', (_label, file) => {
    const content = readRepoFile(file.path)
    const paragraph = paragraphContaining(content, 'Digest caps')

    expect(
      countOccurrences(content, CAPPED_MARKER),
      `${file.path}: the log marker must be exactly '${CAPPED_MARKER}'`
    ).toBeGreaterThanOrEqual(1)
    expect(
      paragraph.includes(CAPPED_MARKER),
      `${file.path}: the caps paragraph must name the CAPPED: marker it emits`
    ).toBe(true)
    expect(
      /log gains one/i.test(paragraph),
      `${file.path}: the cut must be one log line, silent in the report`
    ).toBe(true)
    expect(
      /gate relays the captured form/i.test(paragraph),
      `${file.path}: the gate must relay the captured form — never restore cut prose`
    ).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// A5 — deferred status, isolated from the failure taxonomy (REQ-17)
// ═════════════════════════════════════════════════════════════════════════════

describe('A5 — deferred is a STATUS value outside the failure taxonomy', () => {
  it.each(FILE_ROWS)('%s: STATUS gains deferred', (_label, file) => {
    const content = readRepoFile(file.path)
    const ordering = paragraphContaining(content, 'deferred` ordering')

    expect(
      countOccurrences(content, 'STATUS: deferred'),
      `${file.path}: 'STATUS: deferred' must appear as a first-class status`
    ).toBeGreaterThanOrEqual(1)
    expect(ordering.length, `${file.path}: the deferred-ordering rule is missing`).toBeGreaterThan(0)
    expect(
      /never classified/i.test(ordering),
      `${file.path}: a deferral must be stated as never classified`
    ).toBe(true)
    expect(
      /never retried/i.test(ordering),
      `${file.path}: a deferral must be stated as never retried`
    ).toBe(true)
    expect(
      /never counted as a failure|not failed/i.test(ordering),
      `${file.path}: a deferral must be stated as not a failure`
    ).toBe(true)
  })

  it.each(FILE_ROWS)(
    '%s (negative): the failed-status taxonomy never mentions deferred',
    (_label, file) => {
      const region = taxonomyRegion(readRepoFile(file.path))

      expect(region, `${file.path}: the "Classify a step whose" opener is missing`).not.toBeNull()
      expect(
        region.includes('deferred'),
        `${file.path}: 'deferred' must not be reachable from 'failed' — the ordering rule lives ` +
          'in its own subsection (8b), never inside the taxonomy'
      ).toBe(false)
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// A6 — SPEC DRIFT: logged once, never a cancel or a restart (REQ-18)
// ═════════════════════════════════════════════════════════════════════════════

const SPEC_DRIFT_MARKER = 'SPEC DRIFT: {spec} {old7}->{new7}'

describe('A6 — spec drift is one log line, never a cancelled run', () => {
  it.each(FILE_ROWS)('%s: the SPEC DRIFT: marker is present with both hashes', (_label, file) => {
    const content = readRepoFile(file.path)

    expect(
      content.includes(SPEC_DRIFT_MARKER),
      `${file.path}: must log '${SPEC_DRIFT_MARKER}'`
    ).toBe(true)
    expect(
      /git hash-object/.test(content),
      `${file.path}: the drift check must hash the spec the step will run`
    ).toBe(true)
  })

  it.each(FILE_ROWS)('%s: drift behaviour is "log one line" and continues', (_label, file) => {
    const content = readRepoFile(file.path)
    const paragraph = paragraphContaining(content, 'SPEC DRIFT:')

    expect(paragraph.length, `${file.path}: the SPEC DRIFT: paragraph is missing`).toBeGreaterThan(0)
    expect(
      /log one line/i.test(paragraph),
      `${file.path}: drift must be one log line — never a gate, never a stop`
    ).toBe(true)
    expect(
      /\band continue\b/i.test(paragraph),
      `${file.path}: drift must continue the run`
    ).toBe(true)
  })

  it.each(FILE_ROWS)(
    '%s (negative): drift never cancels and never restarts',
    (_label, file) => {
      const paragraph = paragraphContaining(readRepoFile(file.path), 'SPEC DRIFT:')

      expect(
        /never cancel/i.test(paragraph),
        `${file.path}: the drift rule must state it never cancels`
      ).toBe(true)
      expect(
        /never restart/i.test(paragraph),
        `${file.path}: the drift rule must state it never restarts`
      ).toBe(true)
      // The positive form of either verb would be a behaviour change, not an edit.
      expect(
        /(?<!never )(?:cancel|restart)\b/i.test(paragraph.replace(/never (?:cancel|restart)/gi, '')),
        `${file.path}: no clause may authorise cancelling or restarting on drift`
      ).toBe(false)
    }
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// Structural invariants T24's row names — cheap, byte-free, and unaffected by
// T25 (which re-pins bytes only). These are tripwires, not the contract body.
// ═════════════════════════════════════════════════════════════════════════════

describe('structural invariants (plan T24 row)', () => {
  it('step-report.md defines exactly the five STATUS values', () => {
    const content = readRepoFile('.agents/config/step-report.md')
    const statusLine = content.split('\n').find((line) => line.startsWith('STATUS:'))

    expect(statusLine, 'step-report.md has no STATUS: line').toBeDefined()
    const values = statusLine
      .replace(/^STATUS:\s*/, '')
      .split('|')
      .map((value) => value.trim())
    expect(values, 'STATUS must be exactly the five R2 values').toEqual([
      'done',
      'blocked',
      'failed',
      'needs-answer',
      'deferred',
    ])
  })

  it('step-report.md ## Caps pins 40 / 3 / paths only and the CAPPED: marker', () => {
    const section = sectionOf(readRepoFile('.agents/config/step-report.md'), '## Caps')

    expect(section.length, 'step-report.md has no ## Caps section').toBeGreaterThan(0)
    expect(/\b40\b/.test(section), 'previous cap must be 40 words').toBe(true)
    expect(/\b3\b/.test(section), 'QUESTIONS cap must be 3 items').toBe(true)
    expect(/paths only/i.test(section), 'ARTIFACTS must be paths only').toBe(true)
    expect(section.includes(CAPPED_MARKER), 'the CAPPED: marker must appear literally').toBe(true)
  })

  it('communication.instructions.md keeps exactly eight ## headings', () => {
    const content = readRepoFile('.agents/instructions/communication.instructions.md')
    const headings = content.split('\n').filter((line) => line.startsWith('## '))

    expect(
      headings.length,
      `headings: ${headings.join(' | ')}`
    ).toBe(8)
  })

  it('communication.instructions.md keeps the four bold lines, once each, in order', () => {
    const content = readRepoFile('.agents/instructions/communication.instructions.md')
    const boldLines = ['**Bottom line:**', '**Files:**', '**Blocker:**', '**Next:**']

    for (const line of boldLines) {
      expect(countOccurrences(content, line), `${line} must appear exactly once`).toBe(1)
    }
    const indices = boldLines.map((line) => content.indexOf(line))
    expect(
      indices,
      `the four bold lines must be in order: Bottom line → Files → Blocker → Next`
    ).toEqual([...indices].sort((a, b) => a - b))

    const block = extractFencedBlocks(content).find((candidate) =>
      candidate.content.includes('**Bottom line:**')
    )
    expect(block, 'the four bold lines must sit inside a fenced block').toBeDefined()
    for (const line of boldLines) {
      expect(block.content.includes(line), `the normalization fence must carry ${line}`).toBe(true)
    }
  })

  it.each(FILE_ROWS)(
    '%s: R2 added no documentation-handoff receiver',
    (_label, file) => {
      const content = readRepoFile(file.path)
      expect(
        countOccurrences(content, '#### Applying documentation handoffs'),
        `${file.path} must keep exactly one receiver (CON-16)`
      ).toBe(1)
    }
  )
})
