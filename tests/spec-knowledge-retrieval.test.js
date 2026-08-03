// ═════════════════════════════════════════════════════════════════════════════
// spec-knowledge-retrieval.test.js — Grep-based spec integrity verification
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan/feature-knowledge-vector-gaps-1.md T16 (TEST-01..06) — verifies
// that every pipeline agent spec and orchestrator delegation template actually
// references the knowledge-retrieval protocol (memory-bank + learned-knowledge
// + knowledgebase_search with graceful failure), that the shared protocol file
// `.agents/instructions/knowledge-retrieval.instructions.md` exists with the
// graceful-failure + explicit-report phrases, and that
// `knowledgebase.instructions.md` no longer uses the reconciled-away
// "NOT BEST EFFORT" wording.
//
// Unlike the mocked unit tests in scripts/, this test reads the real spec files
// from disk (fs.readFileSync + String.includes) so it can assert the actual
// wiring state of the repo — no external test dependencies, portable to any
// test runner.
//
// Case-sensitivity note (T1): the shared protocol file writes the required
// action as "Explicitly note" (capital E). TEST-04 therefore matches
// "explicitly note" case-insensitively to avoid a false failure.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Path helpers (repo-root relative, robust to any cwd) ─────────────────

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function readRepoFile(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8')
}

// Every pipeline agent spec under .opencode/agents/*.agent.md EXCEPT
// plan.agent.md (out of scope — see ALT-01 in the plan).
const PIPELINE_AGENT_DIR = join(REPO_ROOT, '.opencode/agents')
const ORCHESTRATOR_DIR = join(REPO_ROOT, '.opencode/agents/orchestrator')

const pipelineAgentSpecs = readdirSync(PIPELINE_AGENT_DIR)
  .filter((file) => file.endsWith('.agent.md') && file !== 'plan.agent.md')
  .sort()

const orchestratorTemplates = readdirSync(ORCHESTRATOR_DIR)
  .filter((file) => file.endsWith('.agent.md'))
  .sort()

const EXPECTED_PIPELINE_AGENTS = [
  'architect.agent.md',
  'coder.agent.md',
  'deployer.agent.md',
  'designer.agent.md',
  'e2e-tester.agent.md',
  'implementer.agent.md',
  'researcher.agent.md',
  'reviewer.agent.md',
  'tracker.agent.md',
  'unit-tester.agent.md',
]

// ═════════════════════════════════════════════════════════════════════════════
// Agent specs — knowledge-retrieval protocol reference (TEST-01, TEST-02, TEST-06)
// ═════════════════════════════════════════════════════════════════════════════

describe('pipeline agent specs reference the knowledge-retrieval protocol (plan T16)', () => {
  it('TEST-01: every pipeline agent spec contains knowledge-retrieval or knowledgebase_search', () => {
    const missing = pipelineAgentSpecs.filter((file) => {
      const content = readRepoFile(join('.opencode/agents', file))
      return (
        !content.includes('knowledge-retrieval') &&
        !content.includes('knowledgebase_search')
      )
    })

    expect(
      missing,
      `agent specs missing a knowledge-retrieval/knowledgebase_search reference: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('TEST-02: every pipeline agent spec contains learned-knowledge or knowledge-retrieval', () => {
    const missing = pipelineAgentSpecs.filter((file) => {
      const content = readRepoFile(join('.opencode/agents', file))
      return (
        !content.includes('learned-knowledge') &&
        !content.includes('knowledge-retrieval')
      )
    })

    expect(
      missing,
      `agent specs missing a learned-knowledge/knowledge-retrieval reference: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('TEST-06: plan.agent.md is correctly excluded from the pipeline agent list (no false positive)', () => {
    // The pipeline list must be exactly the 10 in-scope agents — plan.agent.md
    // is a standalone pre-pipeline agent and must never be checked (ALT-01).
    expect(pipelineAgentSpecs).toHaveLength(10)
    expect(pipelineAgentSpecs).not.toContain('plan.agent.md')
    expect(pipelineAgentSpecs).toEqual(EXPECTED_PIPELINE_AGENTS)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Orchestrator templates — protocol reference (TEST-03)
// ═════════════════════════════════════════════════════════════════════════════

describe('orchestrator delegation templates reference the protocol (plan T16)', () => {
  it('TEST-03: every orchestrator template contains knowledge-retrieval or knowledgebase_search', () => {
    const missing = orchestratorTemplates.filter((file) => {
      const content = readRepoFile(join('.opencode/agents/orchestrator', file))
      return (
        !content.includes('knowledge-retrieval') &&
        !content.includes('knowledgebase_search')
      )
    })

    expect(
      missing,
      `orchestrator templates missing a knowledge-retrieval/knowledgebase_search reference: ${missing.join(', ')}`
    ).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Shared protocol file + knowledgebase instructions reconciliation (TEST-04, TEST-05)
// ═════════════════════════════════════════════════════════════════════════════

describe('shared protocol file and reconciled knowledgebase instructions (plan T16)', () => {
  const SHARED_PROTOCOL_PATH = '.agents/instructions/knowledge-retrieval.instructions.md'
  const KNOWLEDGEBASE_INSTRUCTIONS_PATH = '.agents/instructions/knowledgebase.instructions.md'

  it('TEST-04: the shared protocol file exists, contains graceful, and contains explicitly note', () => {
    expect(
      existsSync(join(REPO_ROOT, SHARED_PROTOCOL_PATH)),
      `${SHARED_PROTOCOL_PATH} must exist (created by T1)`
    ).toBe(true)

    const content = readRepoFile(SHARED_PROTOCOL_PATH)

    expect(content).toContain('graceful')
    // The protocol writes "Explicitly note" (capital E) — match case-insensitively
    // so the test is robust to the exact casing used in FILE-01.
    expect(content.toLowerCase()).toContain('explicitly note')
  })

  it('TEST-05: knowledgebase.instructions.md no longer contains "NOT BEST EFFORT"', () => {
    const content = readRepoFile(KNOWLEDGEBASE_INSTRUCTIONS_PATH)

    // T2 replaced the hard-dependency wording with "MANDATORY TO ATTEMPT,
    // GRACEFUL TO FAIL" — the old phrase must be gone.
    expect(content).not.toContain('NOT BEST EFFORT')
  })
})
