// ═════════════════════════════════════════════════════════════════════════════
// spec-local-update-notice.test.js — consumer migration notice (advisory)
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan T7 / FILE-010 of plan/refactor-opencode-plugin-v2-v1.md:
// `scripts/setup/local-update.js` detects the two git-ignored consumer files
// that a package upgrade cannot repair (`.opencode/opencode.json` with the
// deprecated singular `plugin` key, and `.opencode/package.json` pinning the V1
// SDK `@opencode-ai/plugin`) and prints copy-pasteable migration steps.
//
// The module's whole value is its CONTRACT, not its text:
//
//   • Non-fatal   — no input (missing file, malformed JSON, unreadable path)
//                   may throw or block setup. A consumer install must survive
//                   a broken notice; every entry point returns normally.
//   • Read-only   — detection and rendering never write to the consumer tree.
//   • Idempotent  — an already-correct tree produces ZERO bytes, twice.
//   • Quiet       — `--quiet` suppresses the notice entirely.
//   • Colour-safe — ANSI only when the stream is a TTY and `NO_COLOR` is unset.
//
// Tests use real temp directories (`mkdtempSync`) rather than fs mocks, matching
// the learned-knowledge note that temp dirs catch path-resolution bugs that
// mocks hide. Nothing here touches the repository's own `.opencode/` state.
// ═════════════════════════════════════════════════════════════════════════════

import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONFIG_SCHEMA,
  DEPRECATED_CONFIG_KEY,
  GRAPHIFY_PLUGIN,
  REASONS,
  V1_SDK,
  V2_SDK,
  V2_SDK_VERSION,
  detectLocalUpdate,
  printLocalUpdateNotice,
  renderLocalUpdateNotice,
  shouldUseColor,
} from '../scripts/setup/local-update.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI_SCRIPT = join(REPO_ROOT, 'scripts', 'setup', 'local-update.js')
const SETUP_BIN = join(REPO_ROOT, 'bin', 'setup.js')

/** Matches any ANSI SGR escape sequence (`ESC [ params m`). */
const ANSI_PATTERN = /\u001b\[[0-9;]*m/

/** Heading rendered at the top of every stale-state notice. */
const NOTICE_HEADING = 'Local OpenCode V2 update required'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Correct V2 config: schema only, no plugin load path. */
const UP_TO_DATE_CONFIG = { $schema: CONFIG_SCHEMA }

/** Correct V2 package: the V2 SDK pinned at the runtime version. */
const UP_TO_DATE_PACKAGE = { dependencies: { [V2_SDK]: V2_SDK_VERSION } }

// ── Temp-directory helpers ───────────────────────────────────────────────────

/** @type {string[]} */
const createdRoots = []

/**
 * Creates a temp directory that is removed in `afterEach`.
 *
 * @returns {string} Absolute path.
 */
function makeTempDir() {
  const root = mkdtempSync(join(tmpdir(), 'local-update-notice-'))
  createdRoots.push(root)
  return root
}

/**
 * Writes a simulated consumer tree.
 *
 * `configText` / `packageText` take precedence over the object forms so a test
 * can write bytes that are deliberately not valid JSON.
 *
 * @param {object} [fixture] - Tree description.
 * @param {object} [fixture.config] - Value serialised to `.opencode/opencode.json`.
 * @param {object} [fixture.pkg] - Value serialised to `.opencode/package.json`.
 * @param {string} [fixture.configText] - Raw bytes for `.opencode/opencode.json`.
 * @param {string} [fixture.packageText] - Raw bytes for `.opencode/package.json`.
 * @param {boolean} [fixture.omitConfig] - Do not create the config file.
 * @param {boolean} [fixture.omitPackage] - Do not create the package file.
 * @returns {{ root: string, configPath: string, packagePath: string }}
 */
function makeConsumerTree(fixture = {}) {
  const root = makeTempDir()
  const opencodeDir = join(root, '.opencode')
  mkdirSync(opencodeDir, { recursive: true })

  const configPath = join(opencodeDir, 'opencode.json')
  const packagePath = join(opencodeDir, 'package.json')

  if (!fixture.omitConfig) {
    const text =
      fixture.configText ??
      JSON.stringify(fixture.config ?? UP_TO_DATE_CONFIG, null, 2)
    writeFileSync(configPath, text, 'utf8')
  }

  if (!fixture.omitPackage) {
    const text =
      fixture.packageText ??
      JSON.stringify(fixture.pkg ?? UP_TO_DATE_PACKAGE, null, 2)
    writeFileSync(packagePath, text, 'utf8')
  }

  return { root, configPath, packagePath }
}

/**
 * Creates an in-memory writable stream that records every chunk.
 *
 * @param {{ isTTY?: boolean }} [options] - Stream shape.
 * @returns {{ stream: object, written: string[], output: () => string }}
 */
function makeCaptureStream({ isTTY = false } = {}) {
  const written = []
  return {
    written,
    stream: {
      isTTY,
      write(chunk) {
        written.push(String(chunk))
        return true
      },
    },
    output: () => written.join(''),
  }
}

/**
 * Runs `scripts/setup/local-update.js` as a child process with piped stdio.
 *
 * @param {string[]} args - CLI arguments.
 * @returns {import('node:child_process').SpawnSyncReturns<string>} Result.
 */
function runNoticeCli(args) {
  const env = { ...process.env }
  delete env.NO_COLOR

  return spawnSync(process.execPath, [CLI_SCRIPT, ...args], {
    encoding: 'utf8',
    env,
  })
}

/**
 * Runs the setup orchestrator against a consumer root via `INIT_CWD`.
 *
 * @param {string} consumerRoot - Temp consumer root.
 * @param {string[]} args - Setup CLI arguments.
 * @returns {import('node:child_process').SpawnSyncReturns<string>} Result.
 */
function runSetup(consumerRoot, args) {
  const env = { ...process.env, INIT_CWD: consumerRoot }
  delete env.NO_COLOR

  return spawnSync(process.execPath, [SETUP_BIN, ...args], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env,
  })
}

/** Setup flags that reduce the pipeline to discovery only (no network, no writes). */
const DISCOVERY_ONLY_FLAGS = [
  '--dry-run',
  '--skip-hooks',
  '--skip-prepare',
  '--skip-sync',
  '--skip-knowledgebase',
  '--skip-tracker',
]

afterEach(() => {
  while (createdRoots.length > 0) {
    rmSync(createdRoots.pop(), { recursive: true, force: true })
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// detectLocalUpdate — stale detection
// ═════════════════════════════════════════════════════════════════════════════

describe('detectLocalUpdate — stale detection', () => {
  it('reports stale when the config still declares the singular "plugin" key', () => {
    const { root, configPath } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })

    const state = detectLocalUpdate(root)

    expect(
      state.stale,
      [
        'A config containing the deprecated singular "plugin" key must be detected as stale.',
        'OpenCode 2 treats a configured single-file path as an npm package name, so the',
        'plugin install fails and never loads. The consumer cannot be told to fix it unless',
        'the detector reports it (PLUG-002).',
      ].join('\n'),
    ).toBe(true)

    expect(
      state.reasons,
      `Expected reason "${REASONS.CONFIG_KEY}" for the config entry; got ${JSON.stringify(state.reasons)}.`,
    ).toContain(REASONS.CONFIG_KEY)

    // The reason must be attributable to the file the user has to edit.
    expect(
      state.files.config,
      'The detector must return the config path so callers can say WHICH file is stale.',
    ).toBe(configPath)

    expect(
      state.files.config.endsWith(join('.opencode', 'opencode.json')),
      `Config path must point at .opencode/opencode.json; got ${state.files.config}.`,
    ).toBe(true)
  })

  it('reports stale when the config declares the plural "plugins" key', () => {
    // V2 auto-discovers `.opencode/plugins/`; an explicit `plugins` list recreates
    // the duplicate-load surface. The detector folds both keys into one reason.
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugins: ['./plugins/graphify.js'] },
    })

    const state = detectLocalUpdate(root)

    expect(state.stale).toBe(true)
    expect(state.reasons).toContain(REASONS.CONFIG_KEY)
  })

  it('reports stale and names the V1 SDK when the package pins @opencode-ai/plugin', () => {
    const { root, packagePath } = makeConsumerTree({
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })

    const state = detectLocalUpdate(root)

    expect(
      state.stale,
      [
        'A package.json that still pins @opencode-ai/plugin is stale.',
        'That package has no 2.x release, so no version bump can reach the V2 API.',
      ].join('\n'),
    ).toBe(true)

    expect(
      state.reasons,
      `Expected reason "${REASONS.SDK_V1}" naming the V1 package; got ${JSON.stringify(state.reasons)}.`,
    ).toContain(REASONS.SDK_V1)

    expect(
      state.files.package,
      'The detector must return the package path so the notice can name the file.',
    ).toBe(packagePath)
  })

  it('detects the V1 SDK when it is declared in devDependencies', () => {
    const { root } = makeConsumerTree({
      pkg: { devDependencies: { [V1_SDK]: '1.14.39' } },
    })

    expect(detectLocalUpdate(root).reasons).toContain(REASONS.SDK_V1)
  })

  it('reports both reasons together when config and package are both stale', () => {
    // Guards against a short-circuit: a detector that returns on the first hit
    // would tell the user to fix one file, they re-run, and only then learn
    // about the second one.
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })

    const state = detectLocalUpdate(root)

    expect(state.stale).toBe(true)
    expect(
      state.reasons,
      'Both the config key and the V1 SDK pin apply; the detector must report all reasons at once.',
    ).toEqual(
      expect.arrayContaining([
        REASONS.CONFIG_KEY,
        REASONS.SDK_V1,
        REASONS.SDK_NOT_PINNED,
      ]),
    )
    expect(
      state.reasons.length,
      `No duplicate reasons expected; got ${JSON.stringify(state.reasons)}.`,
    ).toBe(3)
  })

  it('reports a mis-versioned V2 SDK pin as not pinned', () => {
    const { root } = makeConsumerTree({
      pkg: { dependencies: { [V2_SDK]: '2.0.0' } },
    })

    const state = detectLocalUpdate(root)

    expect(state.stale).toBe(true)
    expect(
      state.reasons,
      `A pin other than ${V2_SDK_VERSION} must raise "${REASONS.SDK_NOT_PINNED}".`,
    ).toEqual([REASONS.SDK_NOT_PINNED])
    expect(state.reasons).not.toContain(REASONS.SDK_V1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// detectLocalUpdate — up to date, missing, and unreadable state
// ═════════════════════════════════════════════════════════════════════════════

describe('detectLocalUpdate — quiet cases', () => {
  it('reports nothing for a correct V2 tree', () => {
    const { root } = makeConsumerTree()

    const state = detectLocalUpdate(root)

    expect(
      state.stale,
      [
        'A tree whose config is schema-only and whose package pins @opencode/plugin@2.2.5',
        'is correct and must not be flagged.',
      ].join('\n'),
    ).toBe(false)
    expect(state.reasons).toEqual([])
  })

  it('accepts the V2 SDK pin declared in devDependencies', () => {
    const { root } = makeConsumerTree({
      pkg: { devDependencies: { [V2_SDK]: V2_SDK_VERSION } },
    })

    expect(detectLocalUpdate(root)).toMatchObject({ stale: false, reasons: [] })
  })

  it('treats a missing .opencode/opencode.json as nothing to migrate', () => {
    // Chosen behaviour: absent file = the consumer never configured a plugin
    // load path, so there is nothing to repair and nothing to nag about.
    const { root } = makeConsumerTree({ omitConfig: true })

    let state
    expect(
      () => {
        state = detectLocalUpdate(root)
      },
      'A missing config file must not throw — a clean checkout has neither file.',
    ).not.toThrow()

    expect(state.stale).toBe(false)
    expect(state.reasons).toEqual([])
  })

  it('treats a missing .opencode/package.json as nothing to migrate', () => {
    const { root } = makeConsumerTree({ omitPackage: true })

    let state
    expect(() => {
      state = detectLocalUpdate(root)
    }).not.toThrow()

    expect(state.stale).toBe(false)
    expect(state.reasons).toEqual([])
  })

  it('returns a non-stale result for an absent consumer root', () => {
    for (const root of [undefined, '', null]) {
      const state = detectLocalUpdate(root)

      expect(
        state,
        `detectLocalUpdate(${JSON.stringify(root)}) must return the empty shape, not throw.`,
      ).toEqual({ stale: false, reasons: [], files: {} })
    }
  })

  it('degrades to silent when the config file is not valid JSON', () => {
    // Chosen behaviour: an unparseable file is "not verifiable". The module
    // stays silent rather than guessing at a migration, and never throws.
    const { root } = makeConsumerTree({ configText: '{ "plugin": [ ' })

    let state
    expect(() => {
      state = detectLocalUpdate(root)
    }).not.toThrow()

    expect(
      state.stale,
      'Malformed JSON must degrade to "not stale", not throw and not block setup.',
    ).toBe(false)
    expect(state.reasons).toEqual([])
  })

  it('degrades to silent when the package file is not valid JSON', () => {
    const { root } = makeConsumerTree({ packageText: 'not json at all' })

    let state
    expect(() => {
      state = detectLocalUpdate(root)
    }).not.toThrow()

    expect(state).toMatchObject({ stale: false, reasons: [] })
  })

  it('ignores non-object JSON documents', () => {
    // `null` and arrays are valid JSON but have no dependency/config shape;
    // the object guards must keep them out of the reason list.
    for (const [configText, packageText] of [
      ['null', '[]'],
      ['[]', 'null'],
    ]) {
      const { root } = makeConsumerTree({ configText, packageText })
      const state = detectLocalUpdate(root)

      expect(
        state,
        `Non-object JSON (config=${configText}, package=${packageText}) must not be flagged.`,
      ).toMatchObject({ stale: false, reasons: [] })
    }
  })

  it('never mutates the consumer tree while detecting', () => {
    const { root, configPath, packagePath } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const configBefore = readFileSync(configPath, 'utf8')
    const packageBefore = readFileSync(packagePath, 'utf8')

    detectLocalUpdate(root)

    expect(readFileSync(configPath, 'utf8'), 'Detection must be read-only.').toBe(configBefore)
    expect(readFileSync(packagePath, 'utf8'), 'Detection must be read-only.').toBe(packageBefore)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// renderLocalUpdateNotice — text, silence, colour
// ═════════════════════════════════════════════════════════════════════════════

describe('renderLocalUpdateNotice', () => {
  it('renders the empty string when the state is not stale', () => {
    expect(renderLocalUpdateNotice({ stale: false, reasons: [] })).toBe('')
    expect(renderLocalUpdateNotice({})).toBe('')
    expect(renderLocalUpdateNotice(undefined)).toBe('')
  })

  it('names every file and package the consumer has to change', () => {
    const text = renderLocalUpdateNotice({
      stale: true,
      reasons: [REASONS.CONFIG_KEY, REASONS.SDK_V1, REASONS.SDK_NOT_PINNED],
    })

    expect(text).toContain(NOTICE_HEADING)
    // Quoted on purpose: the bare word `plugin` also appears inside
    // `@opencode/plugin` in the SDK step, so an unquoted assertion would keep
    // passing even if the step-1 guidance were deleted.
    expect(
      text,
      `The notice must name the deprecated config key as "${DEPRECATED_CONFIG_KEY}".`,
    ).toContain(`"${DEPRECATED_CONFIG_KEY}"`)
    expect(text, 'The notice must name the V1 SDK so the user knows what to remove.').toContain(
      V1_SDK,
    )
    expect(text, 'The notice must name the V2 SDK so the user knows what to add.').toContain(
      V2_SDK,
    )
    expect(text, 'The notice must state the exact V2 pin.').toContain(V2_SDK_VERSION)
    expect(
      text,
      'The package snippet must set "type": "module" so consumers do not see MODULE_TYPELESS_PACKAGE_JSON.',
    ).toContain('"type": "module"')
    expect(text, 'The notice must point at the shipped plugin file.').toContain(
      GRAPHIFY_PLUGIN,
    )
    expect(text, 'The notice must show the post-migration config schema.').toContain(
      CONFIG_SCHEMA,
    )
    expect(
      ANSI_PATTERN.test(text),
      'Colour must be off by default; ANSI belongs only to an explicit colour request.',
    ).toBe(false)
  })

  it('names only "plugins" for a plugins-only tree', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugins: ['./plugins'] },
    })
    const state = detectLocalUpdate(root)

    expect(state.reasons).toContain(REASONS.CONFIG_KEY)
    expect(
      state.configKeys,
      'The detector must report the config key it actually found, not a hard-coded guess.',
    ).toEqual(['plugins'])

    const text = renderLocalUpdateNotice(state)
    const step = text.split('\n').find((line) => line.includes('Remove the deprecated'))

    expect(
      step,
      'A plugins-only tree is stale and must still show the remove-key step.',
    ).toBeDefined()
    expect(step).toContain('"plugins"')
    expect(
      step,
      'A plugins-only tree has no "plugin" key to remove, so the step must not name one.',
    ).not.toContain('"plugin"')
    expect(
      text,
      'A plugins-only tree already pins the V2 SDK, so it must not be told to set it.',
    ).not.toContain(`Set ${V2_SDK}`)
  })

  it('names both keys when the config declares plugin and plugins', () => {
    const { root } = makeConsumerTree({
      config: {
        $schema: CONFIG_SCHEMA,
        plugin: ['./plugins/graphify.js'],
        plugins: ['./plugins'],
      },
    })
    const state = detectLocalUpdate(root)

    expect(state.configKeys).toEqual([DEPRECATED_CONFIG_KEY, 'plugins'])

    const step = renderLocalUpdateNotice(state)
      .split('\n')
      .find((line) => line.includes('Remove the deprecated'))

    expect(step).toBeDefined()
    expect(step).toContain(`"${DEPRECATED_CONFIG_KEY}" and "plugins"`)
  })

  it('omits the SDK step for a config-only tree', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })
    const state = detectLocalUpdate(root)

    expect(state.reasons).toEqual([REASONS.CONFIG_KEY])

    const text = renderLocalUpdateNotice(state)

    expect(text).toContain(`Remove the deprecated "${DEPRECATED_CONFIG_KEY}"`)
    expect(
      text,
      'A config-only tree already has the SDK; printing the SDK step tells it to redo work it has done.',
    ).not.toContain(`Set ${V2_SDK}`)
    expect(text).not.toContain('npm install --prefix .opencode')
    expect(text).not.toContain('"type": "module"')
  })

  it('omits the config-key step for an SDK-only tree', () => {
    const { root } = makeConsumerTree({
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const state = detectLocalUpdate(root)

    expect(state.reasons).toContain(REASONS.SDK_V1)

    const text = renderLocalUpdateNotice(state)

    expect(
      text,
      'An SDK-only tree must not be told to remove a config key it does not have.',
    ).not.toContain('Remove the deprecated')
    expect(text).not.toContain('.opencode/opencode.json')
    expect(text).toContain(`Set ${V2_SDK}`)
    expect(text).toContain('"type": "module"')
  })

  it('always includes the restart step when any reason is present', () => {
    for (const reasons of [
      [REASONS.CONFIG_KEY],
      [REASONS.SDK_V1],
      [REASONS.SDK_NOT_PINNED],
    ]) {
      const text = renderLocalUpdateNotice({ stale: true, reasons })

      expect(
        text,
        `Restart guidance must print for every stale state; reasons: ${JSON.stringify(reasons)}.`,
      ).toContain('Restart OpenCode')
    }
  })

  it('wraps the notice in ANSI when colour is requested', () => {
    const text = renderLocalUpdateNotice(
      { stale: true, reasons: [REASONS.CONFIG_KEY] },
      { color: true },
    )

    expect(ANSI_PATTERN.test(text)).toBe(true)
    expect(
      text.replace(ANSI_PATTERN, ''),
      'Stripping the ANSI sequences must leave the same plain-text notice.',
    ).toContain(NOTICE_HEADING)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// shouldUseColor — TTY + NO_COLOR guard
// ═════════════════════════════════════════════════════════════════════════════

describe('shouldUseColor', () => {
  const originalNoColor = process.env.NO_COLOR

  afterEach(() => {
    // Restore the developer's environment exactly; other specs in the same
    // worker must not inherit a mutated NO_COLOR.
    if (originalNoColor === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = originalNoColor
  })

  it('returns false for a non-TTY stream', () => {
    expect(shouldUseColor({ isTTY: false })).toBe(false)
    expect(shouldUseColor(undefined)).toBe(false)
    expect(shouldUseColor({})).toBe(false)
  })

  it('returns true for a TTY stream when NO_COLOR is unset', () => {
    delete process.env.NO_COLOR
    expect(shouldUseColor({ isTTY: true })).toBe(true)
  })

  it('returns false for a TTY stream when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1'
    expect(
      shouldUseColor({ isTTY: true }),
      'NO_COLOR is a cross-tool contract: set means no escape sequences, TTY or not.',
    ).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// printLocalUpdateNotice — the non-fatal entry point
// ═════════════════════════════════════════════════════════════════════════════

describe('printLocalUpdateNotice', () => {
  it('emits ZERO bytes on an up-to-date tree', () => {
    const { root } = makeConsumerTree()
    const capture = makeCaptureStream()

    const result = printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })

    expect(result).toEqual({ printed: false, reasons: [] })
    expect(
      capture.written.length,
      'An up-to-date consumer must see no output at all — not an empty line, not a newline.',
    ).toBe(0)
    expect(capture.output()).toBe('')
  })

  it('prints the notice for a stale tree and reports why', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })
    const capture = makeCaptureStream()

    const result = printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })

    expect(result.printed).toBe(true)
    expect(result.reasons).toEqual([REASONS.CONFIG_KEY])
    expect(capture.output()).toContain(NOTICE_HEADING)
  })

  it('emits no ANSI escape sequences when the stream is not a TTY', () => {
    const { root } = makeConsumerTree({
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const capture = makeCaptureStream({ isTTY: false })

    printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })

    expect(
      ANSI_PATTERN.test(capture.output()),
      [
        'A piped / redirected stream must receive plain text.',
        'Otherwise the notice pollutes logs, CI output, and snapshot diffs.',
      ].join('\n'),
    ).toBe(false)
  })

  it('emits ANSI when the stream is a TTY', () => {
    const { root } = makeConsumerTree({
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const capture = makeCaptureStream({ isTTY: true })

    printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })

    expect(ANSI_PATTERN.test(capture.output())).toBe(true)
  })

  it('honours an explicit color: false even on a TTY', () => {
    const { root } = makeConsumerTree({
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const capture = makeCaptureStream({ isTTY: true })

    printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream, color: false })

    expect(ANSI_PATTERN.test(capture.output())).toBe(false)
  })

  it('suppresses the notice when --quiet is set', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const capture = makeCaptureStream()

    const result = printLocalUpdateNotice({
      consumerRoot: root,
      stream: capture.stream,
      quiet: true,
    })

    expect(result).toEqual({ printed: false, reasons: [] })
    expect(
      capture.written.length,
      '--quiet is an unconditional suppression: a stale tree must still print nothing.',
    ).toBe(0)
  })

  it('stays silent and does not throw when a path is unreadable', () => {
    // `.opencode/opencode.json` is a DIRECTORY here, so readFileSync throws
    // EISDIR. The advisory module must swallow it.
    const root = makeTempDir()
    mkdirSync(join(root, '.opencode', 'opencode.json'), { recursive: true })
    const capture = makeCaptureStream()

    let result
    expect(
      () => {
        result = printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })
      },
      'An unreadable path is an fs error, not a migration signal — never throw.',
    ).not.toThrow()

    expect(result).toEqual({ printed: false, reasons: [] })
    expect(capture.output()).toBe('')
  })

  it('is idempotent and quiet across repeated runs on an up-to-date tree', () => {
    const { root } = makeConsumerTree()
    const capture = makeCaptureStream()

    const first = printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })
    expect(capture.written.length, 'First run wrote bytes on an up-to-date tree.').toBe(0)

    const second = printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })
    expect(capture.written.length, 'Second run wrote bytes on an up-to-date tree.').toBe(0)

    expect(first).toEqual({ printed: false, reasons: [] })
    expect(second).toEqual({ printed: false, reasons: [] })
  })

  it('swallows a broken output stream (EPIPE) instead of failing setup', () => {
    // `npx ai-workflow-setup | head -n 1` closes stdout early; Node surfaces
    // EPIPE from write(). The advisory notice must never turn that into a
    // failed install.
    const { root } = makeConsumerTree({
      pkg: { dependencies: { [V1_SDK]: '1.14.39' } },
    })
    const brokenStream = {
      isTTY: false,
      write() {
        const error = new Error('write EPIPE')
        error.code = 'EPIPE'
        throw error
      },
    }

    let result
    expect(
      () => {
        result = printLocalUpdateNotice({ consumerRoot: root, stream: brokenStream })
      },
      'A throwing stream must be swallowed by the advisory entry point.',
    ).not.toThrow()

    expect(result).toEqual({ printed: false, reasons: [] })
  })

  it('never throws for any fixture in the failure-mode matrix', () => {
    const fixtures = [
      ['up to date', makeConsumerTree()],
      [
        'config key',
        makeConsumerTree({
          config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
        }),
      ],
      ['V1 SDK', makeConsumerTree({ pkg: { dependencies: { [V1_SDK]: '1.14.39' } } })],
      ['invalid config', makeConsumerTree({ configText: '{ oops' })],
      ['invalid package', makeConsumerTree({ packageText: 'oops' })],
      ['missing config', makeConsumerTree({ omitConfig: true })],
      ['missing package', makeConsumerTree({ omitPackage: true })],
      ['empty dir', makeTempDir()],
    ]

    for (const [label, tree] of fixtures) {
      const root = typeof tree === 'string' ? tree : tree.root
      const capture = makeCaptureStream()

      expect(
        () => printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream }),
        `printLocalUpdateNotice threw for fixture "${label}". The advisory notice must never fail setup.`,
      ).not.toThrow()

      const result = printLocalUpdateNotice({ consumerRoot: root, stream: capture.stream })
      expect(
        typeof result.printed,
        `Fixture "${label}" must still return the documented result shape.`,
      ).toBe('boolean')
      expect(Array.isArray(result.reasons)).toBe(true)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Standalone CLI — always exit 0
// ═════════════════════════════════════════════════════════════════════════════

describe('local-update.js CLI', () => {
  it('exits 0 and prints the notice for a stale tree', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })

    const result = runNoticeCli([root])

    expect(
      result.status,
      `CLI must exit 0 for stale state; stderr: ${result.stderr}`,
    ).toBe(0)
    expect(result.stdout).toContain(NOTICE_HEADING)
    expect(
      ANSI_PATTERN.test(result.stdout),
      'Piped stdout is not a TTY, so the CLI output must be plain text.',
    ).toBe(false)
  })

  it('exits 0 and prints nothing for an up-to-date tree', () => {
    const { root } = makeConsumerTree()

    const result = runNoticeCli([root])

    expect(result.status, `CLI must exit 0; stderr: ${result.stderr}`).toBe(0)
    expect(result.stdout, 'Up-to-date state must produce zero bytes.').toBe('')
  })

  it('exits 0 and prints nothing for malformed JSON', () => {
    const { root } = makeConsumerTree({ configText: '{ "plugin": ' })

    const result = runNoticeCli([root])

    expect(
      result.status,
      `Malformed JSON must not change the exit code; stderr: ${result.stderr}`,
    ).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('exits 0 for a non-existent consumer root', () => {
    const missingRoot = join(makeTempDir(), 'does-not-exist')

    const result = runNoticeCli([missingRoot])

    expect(existsSync(missingRoot)).toBe(false)
    expect(result.status, `CLI must exit 0; stderr: ${result.stderr}`).toBe(0)
    expect(result.stdout).toBe('')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Wiring into the setup pipeline (scripts/setup/index.js)
// ═════════════════════════════════════════════════════════════════════════════

describe('setup pipeline wiring', () => {
  it('prints the notice during setup for a stale consumer tree', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })

    const result = runSetup(root, DISCOVERY_ONLY_FLAGS)

    expect(
      result.error,
      `Spawning bin/setup.js failed outright: ${result.error?.message}.`,
    ).toBeUndefined()

    expect(
      result.stdout,
      [
        'Setup discovery must run the advisory notice for a stale consumer tree.',
        'If this fails, the module is not wired into scripts/setup/index.js and no',
        'consumer will ever see the migration steps.',
        `stderr: ${result.stderr}`,
      ].join('\n'),
    ).toContain(NOTICE_HEADING)
  })

  it('suppresses the notice when setup runs with --quiet', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })

    const result = runSetup(root, [...DISCOVERY_ONLY_FLAGS, '--quiet'])

    expect(
      result.error,
      `Spawning bin/setup.js failed outright: ${result.error?.message}.`,
    ).toBeUndefined()

    expect(
      result.stdout,
      '`--quiet` must suppress the advisory notice, not just the banner and summary.',
    ).not.toContain(NOTICE_HEADING)
  })

  it('does not change the setup exit code for a stale tree', () => {
    const { root } = makeConsumerTree({
      config: { $schema: CONFIG_SCHEMA, plugin: ['./plugins/graphify.js'] },
    })

    const stale = runSetup(root, DISCOVERY_ONLY_FLAGS)
    const quiet = runSetup(root, [...DISCOVERY_ONLY_FLAGS, '--quiet'])

    expect(
      stale.status,
      `Advisory output must not alter the exit code; stderr: ${stale.stderr}`,
    ).toBe(quiet.status)
  })
})
