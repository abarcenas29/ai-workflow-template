// ═════════════════════════════════════════════════════════════════════════════
// spec-delegation-budget.test.js — deterministic per-spawn byte budget
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/refactor-orchestrator-token-cost-v1.md T15 (TEST-05) and the T25
// extension (TEST-12), re-pinned by T29 after R2 was re-scoped to
// `orchestrator.md` only:
//
//   * extract the delegation fences from the orchestrator agent files with the
//     same line-trimming extractor the parity spec uses (copied locally per
//     DEP-07 — no shared-helper refactor);
//   * substitute a PINNED digest so every byte count is reproducible. R1
//     published 643 / 714 / 807 B without pinning the values it filled in,
//     which is why those numbers could not be reproduced;
//   * assert an absolute per-spawn ceiling for the binding block kinds. The
//     CEILINGS are the contract; the byte counts are measurements;
//   * assert the recorded targets: single-spawn ≥60% cut, wayfinding ≥40%,
//     six-coder batch ≥60%;
//   * assert the R2 iteration delta of +188 B per delegation orchestration
//     block, separable as 37 (stepKey|attempt) + 103 (IDEMPOTENCE) + 48
//     (RETURN rewrite);
//   * assert the break-even spawn count: static per-run growth (spec growth +
//     measured run-prose growth) divided by the per-spawn saving, and evaluate
//     the quick-fix and wayfinding fixtures against it.
//
// T29 scope change. R2 lives in `orchestrator.md` only. `feature-pipeline.md`
// and `tdd-orchestrator.md` reverted to R1, so:
//   * `r2` pins the four orchestrator blocks only;
//   * `featureR1Live` pins the four feature blocks at the SAME pinned digest,
//     labelled as R1 text — the historical 680 / 857 R1 pins were taken at an
//     unpinned digest and do not reproduce (uniform +57 B, asserted);
//   * no TDD block is pinned or measured: `null` means "not measured", never
//     zero, and no ceiling is invented for it.
//
// T25: tests/fixtures/delegation-budget.json is the SINGLE pinned source. The
// spec reads it from disk and carries no embedded copy; a missing file is a
// red run, not a silent fallback.
//
// The six-coder target is asserted at ≥60%. The plan's original ≥70% is
// RETIRED: A2's idempotence line cannot fit in the remaining headroom (see
// "R2 Net Byte Accounting" in the plan).
//
// No network, no runtime, no API. fs + Buffer only.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
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
const STEP_REPORT_PATH = '.agents/config/step-report.md'
const COMMUNICATION_PATH = '.agents/instructions/communication.instructions.md'
const FIXTURE_PATH = join(REPO_ROOT, 'tests/fixtures/delegation-budget.json')

// ═════════════════════════════════════════════════════════════════════════════
// The pinned fixture — read from disk, never embedded
// ═════════════════════════════════════════════════════════════════════════════
//
// `measuredR1` is the historical R1 pin measured on the R1 fences at digest
// values nobody recorded. `r2` is the LIVE rendering of the four orchestrator
// blocks after the R2 text landed, and `r2 - measuredR1 === 188` for each.
// `featureR1Live` is the live rendering of the R1 fences in
// feature-pipeline.md at the pinned digest — the file carries no R2 marker, so
// its distance from the historical R1 pin is a digest shift, not R2 text.

if (!existsSync(FIXTURE_PATH)) {
  throw new Error(
    `pinned fixture missing: ${FIXTURE_PATH}. It is the single pinned source; ` +
      'the spec carries no embedded fallback.'
  )
}

const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))

/** Every live pin, orchestrator and feature, keyed by block. */
const LIVE_PINS = { ...FIXTURE.r2, ...FIXTURE.featureR1Live }

// ═════════════════════════════════════════════════════════════════════════════
// Fenced-block extraction (copied from tests/spec-orchestrator-parity.test.js)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extract all fenced markdown blocks (``` ... ```) from a file's content.
 * Fences may be indented, so each line is trimmed before checking for the
 * marker. Returns 1-based startLine/endLine and the raw content BETWEEN the
 * fences.
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

function findDelegationBlocks(content) {
  return extractFencedBlocks(content).filter((block) =>
    block.content.includes('This phase must be performed as the agent')
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Rendering: pin the fixture, fill the template, count UTF-8 bytes
// ═════════════════════════════════════════════════════════════════════════════

const DIGEST = FIXTURE.digestValues
const SLICE = FIXTURE.taskSlice

const DOC_TEXT = {
  write: 'write to memory-bank/** or docs/** and run memory_bank_memory_update.',
  handoff:
    'do not write; return `### Documentation handoff` last — `**Target:**` path, `**Operation:** append`, `**Reason:**`, then the exact markdown.',
}

// Every placeholder the delegation templates carry. Substitution is asserted
// below (a leftover `{...}` fails the self-check), so a new placeholder cannot
// silently inflate or deflate the count.
const REPLACEMENTS = [
  ['{agent_name}', DIGEST.agentName],
  ['{agent_file}', DIGEST.agentFile],
  ['{projectName}', DIGEST.projectName],
  ['{basePath}', DIGEST.basePath],
  ['{N} of {M} — {role} ({purpose})', `${DIGEST.step} — ${DIGEST.role} (${DIGEST.purpose})`],
  ['{N} of {M} — coder ({purpose})', `${DIGEST.step} — coder (${DIGEST.purpose})`],
  ['{status} — {one line; no plan path}', `${DIGEST.status} — ${DIGEST.previous}`],
  ['{paths this step may write}', DIGEST.owned],
  ['{none|architecture-context|quality-gates|memory-bank|learned-knowledge}', DIGEST.read],
  ['{N} total, {N/M} this step', DIGEST.budget],
  ['{TASK_ID}', SLICE.taskId],
  ['{task description, one line}', SLICE.description],
  ['{files this task owns, comma-separated}', SLICE.files],
  ['{task IDs, or —}', SLICE.dependsOn],
  ['{other task IDs in this batch, or none}', SLICE.siblings],
]

/** Remove the common leading indentation a fence inherits from its list item. */
function dedent(text) {
  const lines = text.split('\n')
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)[0].length)
  const common = indents.length ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(common)).join('\n')
}

/**
 * Render a delegation fence at the pinned fixture.
 * @param {string} raw fence content
 * @param {'write'|'handoff'} docVariant which `DOC:` line to resolve
 * @param {boolean} withBudget keep the digest's `budget:` line
 */
function renderBlock(raw, docVariant, withBudget) {
  let rendered = dedent(raw)
  for (const [needle, value] of REPLACEMENTS) {
    rendered = rendered.replaceAll(needle, value)
  }
  rendered = rendered.replaceAll('{write|handoff}', DOC_TEXT[docVariant])
  if (!withBudget) {
    // Omitted entirely when tokenBudget is unset — never rendered as "unset".
    rendered = rendered.replace(/\n- budget: [^\n]*/, '')
  }
  return rendered
}

function byteLength(text) {
  return Buffer.byteLength(text, 'utf8')
}

// ═════════════════════════════════════════════════════════════════════════════
// Locate the measured delegation blocks
// ═════════════════════════════════════════════════════════════════════════════

const ORCHESTRATOR_BLOCKS = findDelegationBlocks(readRepoFile(ORCHESTRATOR_PATH))
const FEATURE_BLOCKS = findDelegationBlocks(readRepoFile(FEATURE_PIPELINE_PATH))

function standardBlock(blocks, source) {
  const block = blocks.find(
    (candidate) =>
      candidate.content.includes('{agent_name}') &&
      candidate.content.includes('- owned: {paths this step may write}')
  )
  expect(block, `${source} standard delegation fence not found`).not.toBeUndefined()
  return block
}

function coderBlock(blocks, source) {
  const block = blocks.find(
    (candidate) =>
      candidate.content.includes('TASK SLICE') && candidate.content.includes('{TASK_ID}')
  )
  expect(block, `${source} parallel-coder delegation fence not found`).not.toBeUndefined()
  return block
}

const MEASURED_BLOCKS = [
  {
    key: 'orchestrator.standard.write',
    scope: 'r2',
    source: ORCHESTRATOR_PATH,
    raw: standardBlock(ORCHESTRATOR_BLOCKS, ORCHESTRATOR_PATH).content,
    docVariant: 'write',
    withBudget: false,
  },
  {
    key: 'orchestrator.standard.handoff',
    scope: 'r2',
    source: ORCHESTRATOR_PATH,
    raw: standardBlock(ORCHESTRATOR_BLOCKS, ORCHESTRATOR_PATH).content,
    docVariant: 'handoff',
    withBudget: false,
  },
  {
    key: 'orchestrator.standard.write+budget',
    scope: 'r2',
    source: ORCHESTRATOR_PATH,
    raw: standardBlock(ORCHESTRATOR_BLOCKS, ORCHESTRATOR_PATH).content,
    docVariant: 'write',
    withBudget: true,
  },
  {
    key: 'orchestrator.parallelCoder',
    scope: 'r2',
    source: ORCHESTRATOR_PATH,
    raw: coderBlock(ORCHESTRATOR_BLOCKS, ORCHESTRATOR_PATH).content,
    docVariant: 'write',
    withBudget: true,
  },
  {
    key: 'feature.standard',
    scope: 'featureR1',
    source: FEATURE_PIPELINE_PATH,
    raw: standardBlock(FEATURE_BLOCKS, FEATURE_PIPELINE_PATH).content,
    docVariant: 'write',
    withBudget: false,
  },
  {
    key: 'feature.standard.handoff',
    scope: 'featureR1',
    source: FEATURE_PIPELINE_PATH,
    raw: standardBlock(FEATURE_BLOCKS, FEATURE_PIPELINE_PATH).content,
    docVariant: 'handoff',
    withBudget: false,
  },
  {
    key: 'feature.standard.write+budget',
    scope: 'featureR1',
    source: FEATURE_PIPELINE_PATH,
    raw: standardBlock(FEATURE_BLOCKS, FEATURE_PIPELINE_PATH).content,
    docVariant: 'write',
    withBudget: true,
  },
  {
    key: 'feature.parallelCoder',
    scope: 'featureR1',
    source: FEATURE_PIPELINE_PATH,
    raw: coderBlock(FEATURE_BLOCKS, FEATURE_PIPELINE_PATH).content,
    docVariant: 'write',
    withBudget: true,
  },
].map((entry) => ({ ...entry, rendered: renderBlock(entry.raw, entry.docVariant, entry.withBudget) }))

/** Rendered blocks by key. */
const RENDERED = Object.fromEntries(MEASURED_BLOCKS.map((entry) => [entry.key, entry]))
/** Live byte counts by key. */
const LIVE_BYTES = Object.fromEntries(
  MEASURED_BLOCKS.map((entry) => [entry.key, byteLength(entry.rendered)])
)

/** Map a variant key back to its baseline key. */
function baselineKey(key) {
  if (key.startsWith('orchestrator.standard')) return 'orchestrator.standard'
  if (key.startsWith('orchestrator.parallelCoder')) return 'orchestrator.parallelCoder'
  if (key.startsWith('feature.standard')) return 'feature.standard'
  if (key.startsWith('feature.parallelCoder')) return 'feature.parallelCoder'
  throw new Error(`no baseline for ${key}`)
}

function percentCut(measured, baseline) {
  return ((1 - measured / baseline) * 100).toFixed(1)
}

const PRIMARY_STANDARD = 'orchestrator.standard.write+budget'
const PRIMARY_HANDOFF = 'orchestrator.standard.handoff'
const PRIMARY_CODER = 'orchestrator.parallelCoder'

// ═════════════════════════════════════════════════════════════════════════════
// Fixture pinning and reproducibility
// ═════════════════════════════════════════════════════════════════════════════

describe('pinned fixture', () => {
  it('reads the fixture from disk as the single pinned source (no embedded fallback)', () => {
    expect(existsSync(FIXTURE_PATH), `${FIXTURE_PATH} must exist`).toBe(true)
    expect(FIXTURE.$comment).toContain('SINGLE pinned source')
  })

  it('pins every digest value and every task-slice field (R1 left them implicit)', () => {
    expect(FIXTURE.digestValues).toBeTypeOf('object')
    for (const field of [
      'projectName',
      'basePath',
      'step',
      'previous',
      'owned',
      'read',
      'budget',
      'stepKey',
      'attempt',
    ]) {
      expect(FIXTURE.digestValues[field], `digestValues.${field} must be pinned`).toBeTruthy()
    }
    expect(FIXTURE.taskSlice).toBeTypeOf('object')
    for (const field of ['taskId', 'description', 'files', 'dependsOn', 'siblings']) {
      expect(FIXTURE.taskSlice[field], `taskSlice.${field} must be pinned`).toBeTruthy()
    }
  })

  it('live rendering reproduces every pinned byte count', () => {
    for (const entry of MEASURED_BLOCKS) {
      expect(
        LIVE_BYTES[entry.key],
        `${entry.key} rendered at ${LIVE_BYTES[entry.key]} B but the fixture pins ` +
          `${LIVE_PINS[entry.key]} B in '${entry.scope}'; the template or the pinned digest ` +
          'changed — re-pin deliberately, never to fit a ceiling'
      ).toBe(LIVE_PINS[entry.key])
    }
  })

  it('the R2 pin holds the four orchestrator blocks and no feature block', () => {
    expect(Object.keys(FIXTURE.r2).sort()).toEqual([
      'orchestrator.parallelCoder',
      'orchestrator.standard.handoff',
      'orchestrator.standard.write',
      'orchestrator.standard.write+budget',
    ])
  })

  it('only the orchestrator blocks carry R2 text; the feature blocks carry none', () => {
    for (const entry of MEASURED_BLOCKS) {
      const hasStepKey = entry.raw.includes('stepKey')
      const hasIdempotence = entry.raw.includes('IDEMPOTENCE')
      if (entry.scope === 'r2') {
        expect(hasStepKey, `${entry.key} has no stepKey line`).toBe(true)
        expect(hasIdempotence, `${entry.key} has no IDEMPOTENCE line`).toBe(true)
      } else {
        expect(hasStepKey, `${entry.key} must be R1 text — no stepKey`).toBe(false)
        expect(hasIdempotence, `${entry.key} must be R1 text — no IDEMPOTENCE`).toBe(false)
      }
    }
  })

  it('prints every measured block byte count', () => {
    for (const entry of MEASURED_BLOCKS) {
      const baseline = FIXTURE.baseline[baselineKey(entry.key)]
      const r1 = FIXTURE.measuredR1[entry.key]
      const delta = r1 === undefined ? 'n/a' : `+${LIVE_BYTES[entry.key] - r1}`
      console.log(
        `[budget] ${entry.key} (${entry.scope}): R1 pin ${r1 ?? 'unpinned'} B → live ` +
          `${LIVE_BYTES[entry.key]} B (delta ${delta}), ceiling ${FIXTURE.ceilings[entry.key]} B, ` +
          `baseline ${baseline} B, cut ${percentCut(LIVE_BYTES[entry.key], baseline)}%`
      )
    }
    expect(Object.keys(LIVE_BYTES)).toHaveLength(8)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Non-vacuity: the substitution happens, and the ceiling comparator can fail
// ═════════════════════════════════════════════════════════════════════════════

describe('non-vacuity', () => {
  it('the rendered block contains the pinned projectName and no unresolved placeholder', () => {
    const rendered = RENDERED[PRIMARY_STANDARD].rendered
    expect(rendered).toContain(FIXTURE.digestValues.projectName)
    expect(rendered).toContain(FIXTURE.digestValues.basePath)
    expect(rendered).toContain(FIXTURE.digestValues.budget)
    expect(rendered).not.toMatch(/\{[A-Za-z][^}]*\}/)
  })

  it('a deliberately oversized block exceeds its ceiling', () => {
    const ceiling = FIXTURE.ceilings[PRIMARY_STANDARD]
    const oversized = `${RENDERED[PRIMARY_STANDARD].rendered}${'x'.repeat(ceiling)}`
    expect(byteLength(oversized)).toBeGreaterThan(ceiling)
    expect(LIVE_BYTES[PRIMARY_STANDARD]).toBeLessThanOrEqual(ceiling)
  })

  it('the extractor never returns a silent empty block', () => {
    expect(MEASURED_BLOCKS).toHaveLength(8)
    for (const entry of MEASURED_BLOCKS) {
      expect(entry.rendered.length, `${entry.key} rendered empty`).toBeGreaterThan(0)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// The binding guard: absolute per-spawn ceilings
// ═════════════════════════════════════════════════════════════════════════════

describe('per-spawn ceilings (binding guard)', () => {
  it.each(MEASURED_BLOCKS.map((entry) => [entry.key]))(
    '%s is at or below its absolute ceiling',
    (key) => {
      const measured = LIVE_BYTES[key]
      const ceiling = FIXTURE.ceilings[key]
      expect(ceiling, `${key} has no declared ceiling`).toBeTypeOf('number')
      expect(
        measured,
        `${key} measured ${measured} B > ceiling ${ceiling} B; ` +
          `source ${RENDERED[key].source} — report the block, do not raise the ceiling`
      ).toBeLessThanOrEqual(ceiling)
    }
  )

  it('keeps the four orchestrator ceilings at their binding values', () => {
    expect(FIXTURE.ceilings['orchestrator.standard.write']).toBe(950)
    expect(FIXTURE.ceilings['orchestrator.standard.handoff']).toBe(1030)
    expect(FIXTURE.ceilings['orchestrator.standard.write+budget']).toBe(950)
    expect(FIXTURE.ceilings['orchestrator.parallelCoder']).toBe(1190)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Targets, restated against measured values
// ═════════════════════════════════════════════════════════════════════════════

describe('single-spawn preamble cut ≥ 60%', () => {
  it.each([
    [PRIMARY_STANDARD, 'orchestrator.standard'],
    [PRIMARY_HANDOFF, 'orchestrator.standard'],
    ['feature.standard', 'feature.standard'],
    [PRIMARY_CODER, 'orchestrator.parallelCoder'],
    ['feature.parallelCoder', 'feature.parallelCoder'],
  ])('%s cuts at least 60%% against its baseline', (key, baseline) => {
    const measured = LIVE_BYTES[key]
    const limit = FIXTURE.baseline[baseline] * (1 - FIXTURE.targets.singleSpawn)
    console.log(
      `[budget] ${key}: ${measured} B vs 40% of ${FIXTURE.baseline[baseline]} B = ${limit.toFixed(
        1
      )} B; cut ${percentCut(measured, FIXTURE.baseline[baseline])}%`
    )
    expect(measured).toBeLessThanOrEqual(limit)
  })
})

describe('six-coder batch cut ≥ 60% (the original ≥70% is RETIRED)', () => {
  it('6 × live coder bytes fits in 40% of 6 × baseline coder bytes', () => {
    // RETIRED: the plan's original ≥70% target. A2's idempotence line (103 B)
    // plus stepKey/attempt (37 B) plus the RETURN rewrite (48 B) cannot fit in
    // the remaining headroom; the per-spawn ceiling is the binding guard.
    // Asserting ≥70% here would be dishonest — assert the restated ≥60%.
    const measured = 6 * LIVE_BYTES[PRIMARY_CODER]
    const baseline = FIXTURE.runBaseline.sixCoder
    const limit = baseline * (1 - FIXTURE.targets.sixCoder)
    console.log(
      `[budget] six-coder: 6 × ${LIVE_BYTES[PRIMARY_CODER]} = ${measured} B vs ${limit} B ` +
        `(cut ${percentCut(measured, baseline)}%; retired ≥70% target not asserted)`
    )
    expect(measured).toBeLessThanOrEqual(limit)
  })
})

describe('wayfinding run cut ≥ 40% including run-level prose', () => {
  it('six non-coder spawns at the larger handoff variant plus one coder', () => {
    const baseline = FIXTURE.runBaseline.wayfinding
    expect(6 * FIXTURE.baseline['orchestrator.standard'] + FIXTURE.baseline['orchestrator.parallelCoder']).toBe(
      baseline
    )
    expect(FIXTURE.runs.wayfinding).toHaveLength(7)

    const delegations = 6 * LIVE_BYTES[PRIMARY_HANDOFF] + LIVE_BYTES[PRIMARY_CODER]
    const withProse = delegations + FIXTURE.proseDelta.total
    const limit = baseline * (1 - FIXTURE.targets.wayfinding)
    console.log(
      `[budget] wayfinding: delegations ${delegations} B (cut ${percentCut(
        delegations,
        baseline
      )}%), plus prose ${FIXTURE.proseDelta.total} B = ${withProse} B (cut ${percentCut(
        withProse,
        baseline
      )}%) vs limit ${limit} B; margin ${limit - withProse} B`
    )
    expect(delegations).toBeLessThanOrEqual(limit)
    expect(withProse).toBeLessThanOrEqual(limit)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Recorded size facts and run-level prose (measured on disk, not estimated)
// ═════════════════════════════════════════════════════════════════════════════

describe('recorded size facts', () => {
  it('records the pre-edit spawn baselines and their fence + digest decomposition', () => {
    expect(FIXTURE.baseline).toEqual({
      'orchestrator.standard': 2941,
      'orchestrator.parallelCoder': 3056,
      'feature.standard': 3068,
      'feature.parallelCoder': 3189,
      'tdd.P1': 3771,
      'tdd.P2': 4060,
      'tdd.P3': 3985,
      'tdd.P4': 3727,
      'tdd.P5': 3194,
      'tdd.P6': 2846,
    })
    // The four headline baselines are fence + digest sums, not round numbers.
    expect(1127 + 1814).toBe(2941)
    expect(1242 + 1814).toBe(3056)
    expect(1283 + 1785).toBe(3068)
    expect(1404 + 1785).toBe(3189)
    const tdd = ['tdd.P1', 'tdd.P2', 'tdd.P3', 'tdd.P4', 'tdd.P5', 'tdd.P6'].map(
      (key) => FIXTURE.baseline[key]
    )
    expect(Math.min(...tdd)).toBe(2846)
    expect(Math.max(...tdd)).toBe(4060)
  })

  it('step-report.md is within its 1,150 B cap and measures the recorded 1,141 B', () => {
    const bytes = byteLength(readRepoFile(STEP_REPORT_PATH))
    console.log(
      `[budget] ${STEP_REPORT_PATH}: ${bytes} B (cap ${FIXTURE.stepReportMaxBytes} B, recorded ${FIXTURE.proseDelta.stepReport} B)`
    )
    expect(bytes).toBeLessThanOrEqual(FIXTURE.stepReportMaxBytes)
    expect(bytes).toBe(FIXTURE.proseDelta.stepReport)
  })

  it('communication.instructions.md measures 24,558 B and grew 2,472 B (the plan estimated 671 B)', () => {
    const bytes = byteLength(readRepoFile(COMMUNICATION_PATH))
    expect(bytes).toBe(FIXTURE.runProse.communication)
    expect(bytes - FIXTURE.runProse.communicationBaseline).toBe(FIXTURE.proseDelta.communication)
    expect(FIXTURE.proseDelta.communication).toBe(2472)
    expect(bytes).toBe(24558)
  })

  it('run prose totals 3,613 B (2,472 communication + 1,141 step report)', () => {
    const { communication, stepReport, total } = FIXTURE.proseDelta
    expect(communication + stepReport).toBe(total)
    expect(total).toBe(3613)
    // Measured growth of the two run-level files is what a run actually pays.
    expect(
      FIXTURE.runProse.stepReport -
        FIXTURE.runProse.stepReportBaseline +
        (FIXTURE.runProse.communication - FIXTURE.runProse.communicationBaseline)
    ).toBe(FIXTURE.runProse.growth)
    expect(FIXTURE.runProse.growth).toBe(3613)
  })

  it('records the static growth of each orchestrator spec against its pre-patch baseline', () => {
    const specs = {
      orchestrator: ORCHESTRATOR_PATH,
      featurePipeline: FEATURE_PIPELINE_PATH,
      tddOrchestrator: TDD_ORCHESTRATOR_PATH,
    }
    for (const [key, path] of Object.entries(specs)) {
      const bytes = byteLength(readRepoFile(path))
      console.log(
        `[budget] static growth ${key}: ${FIXTURE.staticGrowth.baseline[key]} B → ${bytes} B ` +
          `= +${bytes - FIXTURE.staticGrowth.baseline[key]} B`
      )
      expect(bytes, `${path} measured size changed`).toBe(FIXTURE.staticGrowth.current[key])
      expect(bytes - FIXTURE.staticGrowth.baseline[key]).toBe(FIXTURE.staticGrowth.growth[key])
    }
    // T29: the R2 work is now paid on orchestrator.md alone; T35 trimmed 981 B
    // of pure rationale so a three-spawn quick-fix clears break-even.
    expect(FIXTURE.staticGrowth.growth).toEqual({
      orchestrator: 2107,
      featurePipeline: 6174,
      tddOrchestrator: 10633,
    })
    expect(28316 - 26209).toBe(2107)
    expect(22824 - 16650).toBe(6174)
    expect(41538 - 30905).toBe(10633)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// R2 iteration delta — +188 B per orchestration delegation, separable
// ═════════════════════════════════════════════════════════════════════════════

describe('R2 iteration delta', () => {
  it('is exactly +188 B per orchestration delegation at the pinned fixture', () => {
    for (const key of Object.keys(FIXTURE.r2)) {
      expect(
        FIXTURE.r2[key] - FIXTURE.measuredR1[key],
        `${key}: pinned R2 ${FIXTURE.r2[key]} B − R1 ${FIXTURE.measuredR1[key]} B must be 188 B`
      ).toBe(FIXTURE.r2Delta.total)
    }
  })

  it('the live rendering carries exactly that delta over the R1 pin', () => {
    for (const key of Object.keys(FIXTURE.r2)) {
      expect(
        LIVE_BYTES[key] - FIXTURE.measuredR1[key],
        `${key}: live ${LIVE_BYTES[key]} B − R1 ${FIXTURE.measuredR1[key]} B must be 188 B`
      ).toBe(FIXTURE.r2Delta.total)
    }
  })

  it('the feature blocks are R1: their distance from the historical pin is a uniform digest shift', () => {
    // The R1 pins 680 / 857 were published at a digest nobody recorded. At the
    // pinned digest the same R1 fences render 57 B larger — both by the same
    // amount, which is the signature of a once-per-fence digest field, not of
    // template text. No R2 marker is present (asserted above), so this is not
    // an R2 delta and must not be counted as one.
    for (const key of ['feature.standard', 'feature.parallelCoder']) {
      expect(
        FIXTURE.featureR1Live[key] - FIXTURE.measuredR1[key],
        `${key}: live R1 text ${FIXTURE.featureR1Live[key]} B − historical pin ` +
          `${FIXTURE.measuredR1[key]} B must be the uniform ${FIXTURE.r1PinShift.bytes} B shift`
      ).toBe(FIXTURE.r1PinShift.bytes)
    }
    expect(FIXTURE.r1PinShift.bytes).toBe(57)
  })

  it('is separable as stepKey|attempt 37 + IDEMPOTENCE 103 + RETURN rewrite 48', () => {
    const { stepKeyAttempt, idempotence, returnRewrite, total } = FIXTURE.r2Delta
    expect(stepKeyAttempt).toBe(37)
    expect(idempotence).toBe(103)
    expect(returnRewrite).toBe(48)
    expect(stepKeyAttempt + idempotence + returnRewrite).toBe(total)
  })

  it('every pinned block still fits its ceiling', () => {
    for (const key of Object.keys(LIVE_PINS)) {
      expect(
        LIVE_PINS[key],
        `${key}: pinned ${LIVE_PINS[key]} B > ceiling ${FIXTURE.ceilings[key]} B`
      ).toBeLessThanOrEqual(FIXTURE.ceilings[key])
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Break-even: how many spawns a run needs before the static body pays for itself
// ═════════════════════════════════════════════════════════════════════════════

const roundCeil = (numerator, denominator) => Math.ceil(numerator / denominator)

describe('break-even spawn count', () => {
  it('derives the per-spawn saving from baseline minus live bytes', () => {
    expect(FIXTURE.baseline['orchestrator.standard'] - FIXTURE.r2['orchestrator.standard.write']).toBe(
      FIXTURE.perSpawnSaving['standard.write']
    )
    expect(FIXTURE.baseline['orchestrator.standard'] - FIXTURE.r2['orchestrator.standard.handoff']).toBe(
      FIXTURE.perSpawnSaving['standard.handoff']
    )
    expect(FIXTURE.baseline['orchestrator.standard'] - FIXTURE.r2['orchestrator.standard.write+budget']).toBe(
      FIXTURE.perSpawnSaving['standard.write+budget']
    )
    expect(FIXTURE.baseline['orchestrator.parallelCoder'] - FIXTURE.r2['orchestrator.parallelCoder']).toBe(
      FIXTURE.perSpawnSaving.parallelCoder
    )
    expect(FIXTURE.perSpawnSaving).toEqual({
      'standard.write': 2073,
      'standard.handoff': 2000,
      'standard.write+budget': 2035,
      parallelCoder: 2011,
    })
    // The headline saving the break-even is computed from.
    expect(2941 - 868).toBe(2073)
  })

  it('adds measured spec growth and measured run-prose growth into static per-run growth', () => {
    const b = FIXTURE.breakEven
    expect(FIXTURE.staticGrowth.growth.orchestrator).toBe(2107)
    expect(FIXTURE.runProse.growth).toBe(3613)
    expect(FIXTURE.staticGrowth.growth.orchestrator + FIXTURE.runProse.growth).toBe(
      b.staticGrowthOrchestrator
    )
    expect(b.staticGrowthOrchestrator).toBe(5720)
    expect(2107 + 3613).toBe(5720)
  })

  it('breakEvenSpawns = ceil(static growth / per-spawn saving)', () => {
    const b = FIXTURE.breakEven
    expect(roundCeil(b.staticGrowthOrchestrator, b.perSpawnSaving)).toBe(b.breakEvenSpawns)
    expect(b.perSpawnSaving).toBe(FIXTURE.perSpawnSaving['standard.write'])
    expect(b.breakEvenSpawns).toBe(3)
    // Ceiling-based worst case: pay the CEILING (950 B) rather than the live
    // 868 B. The saving shrinks but the spawn count does not move.
    const ceilingSaving = FIXTURE.baseline['orchestrator.standard'] - FIXTURE.ceilings['orchestrator.standard.write']
    expect(ceilingSaving).toBe(1991)
    expect(roundCeil(b.staticGrowthOrchestrator, ceilingSaving)).toBe(b.breakEvenSpawns)
    // R2 is orchestrator-only now, so no break-even is claimed for the two
    // fixed pipelines. null means "not claimed", never "zero".
    expect(b.byPipeline).toEqual({ orchestrator: 3, featurePipeline: null, tddOrchestrator: null })
    console.log(
      `[budget] break-even: ${b.staticGrowthOrchestrator} B / ${b.perSpawnSaving} B = ` +
        `${(b.staticGrowthOrchestrator / b.perSpawnSaving).toFixed(3)} → ${b.breakEvenSpawns} spawns` +
        ` (ceiling-based: ${b.staticGrowthOrchestrator} / ${ceilingSaving} = ` +
        `${(b.staticGrowthOrchestrator / ceilingSaving).toFixed(3)} → ${roundCeil(
          b.staticGrowthOrchestrator,
          ceilingSaving
        )})`
    )
  })

  it('quick-fix (3 spawns) is now a NET SAVING of 291 B', () => {
    const b = FIXTURE.breakEven
    const saving =
      FIXTURE.perSpawnSaving.parallelCoder + 2 * FIXTURE.perSpawnSaving['standard.handoff']
    const net = saving - b.staticGrowthOrchestrator
    console.log(
      `[budget] quick-fix: ${b.quickFix.steps} spawns save ${saving} B, static growth ` +
        `${b.staticGrowthOrchestrator} B, net ${net} B (${net < 0 ? 'NET LOSS' : 'net saving'})`
    )
    expect(b.quickFix.steps).toBe(3)
    expect(b.quickFix.steps).toBeGreaterThanOrEqual(b.breakEvenSpawns)
    expect(saving).toBe(b.quickFix.saving)
    expect(saving).toBe(6011)
    expect(net).toBe(b.quickFix.net)
    expect(net).toBe(291)
    expect(net).toBeGreaterThan(0)
  })

  it('wayfinding (7 spawns) is a net saving of 8,291 B', () => {
    const b = FIXTURE.breakEven
    const saving =
      6 * FIXTURE.perSpawnSaving['standard.handoff'] + FIXTURE.perSpawnSaving.parallelCoder
    const net = saving - b.staticGrowthOrchestrator
    console.log(
      `[budget] wayfinding: ${b.wayfinding.steps} spawns save ${saving} B, static growth ` +
        `${b.staticGrowthOrchestrator} B, net ${net} B (${net < 0 ? 'NET LOSS' : 'net saving'})`
    )
    expect(b.wayfinding.steps).toBe(7)
    expect(b.wayfinding.steps).toBeGreaterThanOrEqual(b.breakEvenSpawns)
    expect(saving).toBe(b.wayfinding.saving)
    expect(saving).toBe(14011)
    expect(net).toBe(b.wayfinding.net)
    expect(net).toBe(8291)
    expect(net).toBeGreaterThan(0)
  })

  it('a six-coder batch (6 spawns) now clears break-even by 6,346 B', () => {
    const b = FIXTURE.breakEven
    const saving = 6 * FIXTURE.perSpawnSaving.parallelCoder
    const net = saving - b.staticGrowthOrchestrator
    console.log(
      `[budget] six-coder: 6 spawns save ${saving} B, static growth ${b.staticGrowthOrchestrator} B, ` +
        `net ${net} B`
    )
    expect(saving).toBe(b.sixCoder.saving)
    expect(saving).toBe(12066)
    expect(net).toBe(b.sixCoder.net)
    expect(net).toBe(6346)
    expect(net).toBeGreaterThan(0)
    expect(b.sixCoder.steps).toBeGreaterThanOrEqual(b.breakEvenSpawns)
  })
})
