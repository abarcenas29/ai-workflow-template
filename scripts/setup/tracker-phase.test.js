// ═════════════════════════════════════════════════════════════════════════════
// tracker-phase.test.js — Unit tests for the GitHub tracker label phase
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers scripts/setup/tracker-phase.js (plan T16, TEST-04..06, TEST-15/16):
//   - parseLabels reads the real `.agents/config/issue-tracker.md`
//   - malformed tables degrade to a skipped phase
//   - only missing labels are created, and a second run creates nothing
//   - --dry-run creates nothing and reports the count
//   - absent `gh`, unauthenticated `gh`, no GitHub remote, and a rejected
//     executor all report `not-applicable` or `skipped` instead of throwing
//   - the auth pre-flight is a two-element argv (`auth`, `status`)
//   - the label list requests `--limit 200`
//   - `options.docUrl` overrides the packaged document
//
// Every command goes through an injected fake `execImpl`; zero network and
// zero real `gh` invocations.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseLabels, runTrackerPhase } from './tracker-phase.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SETUP_DIR = dirname(fileURLToPath(import.meta.url))
const REAL_DOC = join(SETUP_DIR, '..', '..', '.agents', 'config', 'issue-tracker.md')

/** Temp directories created by a test, removed in afterEach. */
const tempDirs = []

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

/**
 * Writes a tracker-document fixture into a fresh temp directory.
 *
 * @param {string} markdown - Document body to write.
 * @returns {string} Absolute path to the fixture file.
 */
function writeFixture(markdown) {
  const dir = mkdtempSync(join(tmpdir(), 'tracker-phase-'))
  tempDirs.push(dir)
  const file = join(dir, 'issue-tracker.md')
  writeFileSync(file, markdown, 'utf8')
  return file
}

/**
 * Builds a fake command runner that simulates git and `gh` state.
 *
 * @param {object} [options]
 * @param {boolean} [options.authOk=true] - Whether `gh auth status` succeeds.
 * @param {boolean} [options.ghPresent=true] - Whether `gh` resolves on PATH.
 * @param {string|null} [options.remote='git@github.com:acme/repo.git'] - `origin` URL; `null` makes the command fail.
 * @param {string[]} [options.labels=[]] - Labels that already exist.
 * @param {string[]} [options.alreadyExists=[]] - Labels whose creation fails with `already exists`.
 * @param {Record<string,string>} [options.createFailures={}] - Label → stderr for a hard creation failure.
 * @param {string} [options.listJson] - Override the `gh label list` JSON payload.
 * @param {boolean} [options.listFails=false] - Make `gh label list` fail.
 * @returns {{exec: Function, state: {labels: Set<string>}, calls: string[][]}}
 */
function makeFakeGh(options = {}) {
  const {
    authOk = true,
    ghPresent = true,
    remote = 'git@github.com:acme/repo.git',
    labels = [],
    alreadyExists = [],
    createFailures = {},
    listJson,
    listFails = false,
  } = options

  const state = { labels: new Set(labels) }
  const calls = []

  /** Builds an Error carrying child-process-like output fields. */
  function failure(message, stderr = '') {
    return Object.assign(new Error(message), { stderr })
  }

  async function exec(command, args) {
    calls.push([command, ...args])

    if (command === 'git') {
      if (args[0] === 'remote' && args[1] === 'get-url') {
        if (remote === null) throw failure('no such remote', 'error: No such remote')
        return { stdout: `${remote}\n`, stderr: '' }
      }
      throw failure(`unexpected git command: ${args.join(' ')}`)
    }

    if (command !== 'gh') {
      throw failure(`unexpected command: ${command}`)
    }

    if (!ghPresent) {
      throw Object.assign(failure('spawn gh ENOENT'), { code: 'ENOENT' })
    }

    const key = args.join(' ')

    if (args[0] === '--version') {
      return { stdout: 'gh version 2.98.0\n', stderr: '' }
    }
    if (args[0] === 'auth' && args[1] === 'status') {
      if (!authOk) throw failure('not logged in', 'not logged in to any hosts')
      return { stdout: 'Logged in to github.com\n', stderr: '' }
    }
    if (args[0] === 'label' && args[1] === 'list') {
      if (listFails) throw failure('HTTP 500', 'HTTP 500: server error')
      const payload =
        listJson ?? JSON.stringify([...state.labels].map((name) => ({ name })))
      return { stdout: payload, stderr: '' }
    }
    if (args[0] === 'label' && args[1] === 'create') {
      const name = args[2]
      if (createFailures[name]) throw failure('create failed', createFailures[name])
      if (alreadyExists.includes(name) || state.labels.has(name)) {
        throw failure('label already exists', 'HTTP 422: already exists')
      }
      state.labels.add(name)
      return { stdout: '', stderr: '' }
    }

    throw failure(`unexpected gh command: ${key}`)
  }

  return { exec, state, calls }
}

/** A minimal valid two-label tracker document. */
const TWO_LABEL_DOC = `# Issue Tracker

## Labels

| Label | Colour | Description |
|---|---|---|
| \`alpha\` | \`#112233\` | First label. |
| \`beta\` | \`#AABBCC\` | Second label. |

## Next
`

// ═════════════════════════════════════════════════════════════════════════════
// parseLabels
// ═════════════════════════════════════════════════════════════════════════════

describe('parseLabels', () => {
  it('reads exactly the six expected name/colour pairs from the real document', () => {
    const labels = parseLabels(readFileSync(REAL_DOC, 'utf8'))

    expect(labels.map(({ name, color }) => [name, color])).toEqual([
      ['wayfinder:map', '#5319E7'],
      ['wayfinder:research', '#1D76DB'],
      ['wayfinder:prototype', '#0E8A16'],
      ['wayfinder:grilling', '#FBCA04'],
      ['wayfinder:task', '#C2E0C6'],
      ['ready-for-agent', '#B60205'],
    ])
    for (const label of labels) {
      expect(label.description.length).toBeGreaterThan(0)
    }
  })

  it('returns an empty list when the ## Labels section is missing', () => {
    expect(parseLabels('# No tracker here\n\n## Other\n\n| a | b | c |\n')).toEqual([])
  })

  it('throws for a malformed colour', () => {
    const doc = '## Labels\n\n| Label | Colour | Description |\n|---|---|---|\n| `x` | `blue` | Bad. |\n'
    expect(() => parseLabels(doc)).toThrow(/invalid colour/i)
  })

  it('throws for a four-cell row', () => {
    const doc = '## Labels\n\n| Label | Colour | Description |\n|---|---|---|\n| `x` | `#112233` | One | Two |\n'
    expect(() => parseLabels(doc)).toThrow(/expected 3 cells/i)
  })

  it('throws for an empty cell', () => {
    const doc = '## Labels\n\n| Label | Colour | Description |\n|---|---|---|\n| `x` | `#112233` |  |\n'
    expect(() => parseLabels(doc)).toThrow(/empty cell/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// runTrackerPhase — creation and idempotency
// ═════════════════════════════════════════════════════════════════════════════

describe('runTrackerPhase — label creation', () => {
  it('creates every label when none exist', async () => {
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('completed')
    expect(result.created).toHaveLength(6)
    expect(result.present).toHaveLength(0)
    expect(fake.state.labels.size).toBe(6)
    expect(fake.calls.filter((call) => call[1] === 'label' && call[2] === 'create')).toHaveLength(6)
  })

  it('invokes gh auth status as two argv elements, not one joined element', async () => {
    const fake = makeFakeGh()

    await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(fake.calls).toContainEqual(['gh', 'auth', 'status'])
    expect(fake.calls.some((call) => call.includes('auth status'))).toBe(false)
  })

  it('proceeds to label creation after a successful auth pre-flight', async () => {
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('completed')
    expect(fake.calls).toContainEqual(['gh', 'auth', 'status'])
    expect(
      fake.calls.filter((call) => call[1] === 'label' && call[2] === 'create'),
    ).toHaveLength(6)
  })

  it('requests a large label page with --limit so the 30-row default cannot truncate', async () => {
    const fake = makeFakeGh()

    await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(fake.calls).toContainEqual([
      'gh',
      'label',
      'list',
      '--json',
      'name',
      '--limit',
      '200',
    ])
  })

  it('creates only the labels that are missing', async () => {
    const fake = makeFakeGh({ labels: ['wayfinder:map', 'ready-for-agent'] })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('completed')
    expect(result.created).toHaveLength(4)
    expect(result.present).toEqual(['wayfinder:map', 'ready-for-agent'])
    expect(fake.state.labels.size).toBe(6)
  })

  it('is idempotent: a second run against the same state creates nothing', async () => {
    const fake = makeFakeGh()
    const context = { hasGit: true, consumerRoot: process.cwd() }

    const first = await runTrackerPhase(context, { execImpl: fake.exec })
    const second = await runTrackerPhase(context, { execImpl: fake.exec })

    expect(first.created).toHaveLength(6)
    expect(second.action).toBe('completed')
    expect(second.created).toHaveLength(0)
    expect(second.present).toHaveLength(6)
    expect(fake.state.labels.size).toBe(6)
  })

  it('treats an "already exists" creation error as present', async () => {
    const fake = makeFakeGh({ alreadyExists: ['wayfinder:map'] })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('completed')
    expect(result.present).toContain('wayfinder:map')
    expect(result.created).toHaveLength(5)
  })

  it('reports partial when a label creation fails for another reason', async () => {
    const fake = makeFakeGh({ createFailures: { 'wayfinder:map': 'HTTP 500: boom' } })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('partial')
    expect(result.created).toHaveLength(5)
    expect(result.message).toContain('failed: wayfinder:map')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// runTrackerPhase — dry-run and graceful skips
// ═════════════════════════════════════════════════════════════════════════════

describe('runTrackerPhase — dry-run and skips', () => {
  it('--dry-run creates nothing and reports the missing count', async () => {
    const fake = makeFakeGh({ labels: ['wayfinder:map'] })

    const result = await runTrackerPhase(
      { hasGit: true, consumerRoot: process.cwd(), flags: { dryRun: true } },
      { execImpl: fake.exec },
    )

    expect(result.action).toBe('dry-run')
    expect(result.message).toContain('Would create 5 label(s)')
    expect(result.created).toHaveLength(0)
    expect(fake.state.labels.size).toBe(1)
    expect(fake.calls.filter((call) => call[2] === 'create')).toHaveLength(0)
  })

  it('reports not-applicable when the consumer is not a git repository', async () => {
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: false }, { execImpl: fake.exec })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('not a git repository')
    expect(fake.calls).toHaveLength(0)
  })

  it('reports not-applicable when origin is not a GitHub remote', async () => {
    const fake = makeFakeGh({ remote: 'git@gitlab.com:acme/repo.git' })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('no GitHub')
  })

  it('reports not-applicable when origin cannot be read', async () => {
    const fake = makeFakeGh({ remote: null })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('no GitHub')
  })

  it('reports not-applicable when gh is not on PATH', async () => {
    const fake = makeFakeGh({ ghPresent: false })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('not installed')
  })

  it('reports not-applicable with a login hint when gh is unauthenticated', async () => {
    const fake = makeFakeGh({ authOk: false })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('gh auth login')
  })

  it('skips when listing labels fails', async () => {
    const fake = makeFakeGh({ listFails: true })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('could not list labels')
  })

  it('skips when gh returns invalid JSON', async () => {
    const fake = makeFakeGh({ listJson: 'not-json' })

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('invalid JSON')
  })

  it('never rejects when the executor rejects every command', async () => {
    const exec = async () => {
      throw new Error('everything is down')
    }

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, { execImpl: exec })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('no GitHub')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// runTrackerPhase — document resolution
// ═════════════════════════════════════════════════════════════════════════════

describe('runTrackerPhase — document resolution', () => {
  it('uses options.docUrl instead of the packaged document', async () => {
    const docUrl = writeFixture(TWO_LABEL_DOC)
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
      docUrl,
    })

    expect(result.action).toBe('completed')
    expect(result.labels).toBe(2)
    expect(result.created).toEqual(['alpha', 'beta'])
  })

  it('skips when the document cannot be read', async () => {
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
      docUrl: join(tmpdir(), 'definitely-missing-issue-tracker.md'),
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('.agents/config/issue-tracker.md')
  })

  it('skips when the parsed table is malformed', async () => {
    const docUrl = writeFixture(
      '## Labels\n\n| Label | Colour | Description |\n|---|---|---|\n| `x` | `nope` | Bad. |\n',
    )
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
      docUrl,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('invalid')
  })

  it('skips when the document has no usable label table', async () => {
    const docUrl = writeFixture('# Issue Tracker\n\nNo labels here.\n')
    const fake = makeFakeGh()

    const result = await runTrackerPhase({ hasGit: true, consumerRoot: process.cwd() }, {
      execImpl: fake.exec,
      docUrl,
    })

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('no usable')
  })

  it('uses the real executor when none is injected (degrades, never throws)', async () => {
    const result = await runTrackerPhase({
      hasGit: true,
      consumerRoot: join(tmpdir(), 'tracker-phase-no-git-here'),
    })

    expect(result.action).toBe('not-applicable')
    expect(result.message).toContain('no GitHub')
  })
})
