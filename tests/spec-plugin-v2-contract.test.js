// ═════════════════════════════════════════════════════════════════════════════
// spec-plugin-v2-contract.test.js — OpenCode V2 plugin contract + behaviour
// ═════════════════════════════════════════════════════════════════════════════
//
// Covers plan T4 (TEST-01..07) of plan/refactor-opencode-plugin-v2-v1.md, and
// guards the two findings that made this test necessary:
//
//   • PLUG-001 — `.opencode/plugins/graphify.js` exported a V1 *named* factory
//     returning a `{ "tool.execute.before": fn }` hook map. OpenCode 2 requires
//     a **default export** object with a stable `id` and a callable `setup` or
//     `effect`; it rejects the V1 module at load with a WARN-level
//     `PluginModule.LoadError: Plugin must export a default definition with an
//     id and an effect or setup function`. Nothing in `tests/` read the plugin,
//     so the failure was silent in CI.
//
//   • PLUG-005 — the V1 hook body matched `input.tool === "bash"` and mutated
//     `output.args.command`. OpenCode 2 names the built-in command tool
//     `"shell"` and passes ONE mutable event whose payload is `event.input`.
//     A shape-only port would load cleanly and then never fire, because
//     `"bash"` is dead under V2. This file drives the registered callback with
//     a synthetic `execute.before` event to prove the plugin reacts to
//     `"shell"` and ignores `"bash"`.
//
// Contract facts are verified against OpenCode 2.2.5 primary sources; see
// docs/research/v2-plugin-contract-verification.md §3-§5 and
// https://opencode.ai/v2/docs/build/plugins/migrate-v1.
//
// Discovery is dynamic on purpose: every file in `.opencode/plugins/` is
// imported, so a new plugin is covered without editing this list. Only `node:`
// built-ins are used, and temp fixtures are created with `mkdtempSync` so the
// spec is hermetic (no network, no live OpenCode runtime, no repo fixture).
// ═════════════════════════════════════════════════════════════════════════════

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_DIR = join(REPO_ROOT, '.opencode', 'plugins')

// `.js` is what the plan targets today; `.mjs`/`.ts` are accepted so a future
// plugin in either ESM flavour is discovered automatically rather than
// silently skipped.
const PLUGIN_FILE_PATTERN = /\.(?:js|mjs|ts)$/

const V1_TO_V2_SHAPE_HINT = [
  'OpenCode V1 plugins exported a NAMED factory returning a hook map',
  '(`export const X = async ({ directory }) => ({ "tool.execute.before": fn })`)',
  'or a `server()` hook. OpenCode 2 does not run V1 implementations: it requires',
  '`export default { id: string, setup(ctx) { … } }` (Promise API) or',
  '`export default { id: string, effect: (ctx) => … }` (Effect API).',
  'Migration: https://opencode.ai/v2/docs/build/plugins/migrate-v1',
  'Evidence: docs/research/v2-plugin-contract-verification.md §3 (PLUG-001).',
].join('\n')

// The exact reminder rendered into `event.input.command`, including the shell
// escaping. Backticks and double quotes are backslash-escaped so the shell
// echoes the reminder literally; V1 shipped raw backticks, which the shell
// executed as command substitution. Pinning the literal string makes both a
// copy change and an escaping regression fail this spec.
const EXPECTED_REMINDER =
  'echo "[graphify] knowledge graph at graphify-out/. For focused questions, run \\`graphify query \\"<question>\\"\\` (scoped subgraph, usually much smaller than GRAPH_REPORT.md) instead of grepping raw files. Read GRAPH_REPORT.md only for broad architecture context."'

/**
 * Lists every plugin module under `.opencode/plugins/`.
 *
 * @returns {string[]} Absolute paths, sorted for stable test names.
 */
function listPluginFiles() {
  if (!existsSync(PLUGINS_DIR)) return []

  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && PLUGIN_FILE_PATTERN.test(entry.name))
    .map((entry) => join(PLUGINS_DIR, entry.name))
    .sort()
}

/**
 * Imports a plugin module.
 *
 * `fresh` appends a unique query string so Node treats the import as a distinct
 * module instance. That matters because the plugin keeps a `reminded` latch:
 * without a fresh instance, a mutation in one scenario would silently mask the
 * "must ignore bash" and "must not double-prefix" assertions in another.
 *
 * @param {string} filePath - Absolute path to the plugin module.
 * @param {{ fresh?: boolean }} [options] - Force a distinct module instance.
 * @returns {Promise<Record<string, unknown>>} ESM namespace object.
 */
let importSequence = 0
function importPlugin(filePath, { fresh = false } = {}) {
  const url = pathToFileURL(filePath).href
  if (!fresh) return import(url)

  importSequence += 1
  return import(`${url}?contract-run=${importSequence}`)
}

/**
 * Asserts the module default-exports a V2 definition object and returns it.
 *
 * `expect(...)` throws on failure, so callers can use the return value safely:
 * the function never returns a non-object.
 *
 * @param {Record<string, unknown>} mod - ESM namespace object.
 * @param {string} label - Repo-relative file label for failure messages.
 * @returns {Record<string, unknown>} The default-exported definition.
 */
function requireDefaultDefinition(mod, label) {
  const definition = mod && mod.default
  const isObject =
    definition !== null && typeof definition === 'object' && !Array.isArray(definition)

  expect(
    isObject,
    [
      `${label} must default-export a V2 plugin definition object.`,
      `Found: ${definition === undefined ? 'no default export at all' : typeof definition}.`,
      V1_TO_V2_SHAPE_HINT,
    ].join('\n'),
  ).toBe(true)

  return definition
}

/**
 * Builds a stand-in for the V2 `Context` surface used by `setup(ctx)`. It records
 * every `ctx.tool.hook(name, callback)` call so the test can drive the callback
 * without an OpenCode runtime.
 *
 * @param {string} directory - Stand-in for `ctx.location.directory`.
 * @returns {{ ctx: object, registrations: Array<{ name: string, callback: Function }> }}
 */
function makeFakeContext(directory) {
  const registrations = []

  const ctx = {
    location: { directory },
    tool: {
      hook: async (name, callback) => {
        registrations.push({ name, callback })
        return { dispose: async () => {} }
      },
    },
  }

  return { ctx, registrations }
}

/**
 * Imports a plugin, runs `setup(fakeCtx)` and returns the single
 * `execute.before` callback.
 *
 * Every guard uses an `expect`, which throws, so a plugin that never registers
 * a hook fails with an actionable message instead of a `TypeError` on
 * `callback(event)`.
 *
 * @param {string} filePath - Absolute plugin path.
 * @param {string} label - Repo-relative file label.
 * @param {string} directory - Stand-in for `ctx.location.directory`.
 * @returns {Promise<Function>} The registered `execute.before` callback.
 */
async function registerExecuteBefore(filePath, label, directory) {
  const mod = await importPlugin(filePath, { fresh: true })
  const definition = requireDefaultDefinition(mod, label)

  expect(
    typeof definition.setup,
    [
      `${label} must expose a callable \`setup(ctx)\` so the hook can be driven.`,
      'V2 registers hooks THROUGH the context:',
      '  await ctx.tool.hook("execute.before", (event) => { … })',
      'Returning a `{ "tool.execute.before": fn }` map is the V1 contract and is',
      'never invoked by OpenCode 2 (PLUG-001).',
    ].join('\n'),
  ).toBe('function')

  const { ctx, registrations } = makeFakeContext(directory)
  await definition.setup(ctx)

  expect(
    registrations.length,
    [
      `${label} setup(ctx) registered no hook at all.`,
      'The fake ctx records every `ctx.tool.hook(name, callback)` call, so an empty',
      'capture means the plugin never wired its hook. V2 requires:',
      '  await ctx.tool.hook("execute.before", (event) => { … })',
    ].join('\n'),
  ).toBeGreaterThan(0)

  const beforeHooks = registrations.filter((registration) => registration.name === 'execute.before')

  expect(
    beforeHooks.length,
    [
      `${label} must register exactly one "execute.before" hook.`,
      `Captured hook names: ${registrations.map((registration) => registration.name).join(', ') || '(none)'}.`,
      'V2 tool hooks are registered as `ctx.tool.hook("execute.before", callback)`;',
      'the V1 hook-map key `"tool.execute.before"` is not read by OpenCode 2.',
    ].join('\n'),
  ).toBe(1)

  expect(
    typeof beforeHooks[0].callback,
    `${label} must pass a callable callback to ctx.tool.hook("execute.before", callback).`,
  ).toBe('function')

  return beforeHooks[0].callback
}

/**
 * Writes a minimal `graphify-out/graph.json` fixture into a temp directory.
 *
 * @param {string} directory - Temp project root.
 */
function writeGraphFixture(directory) {
  mkdirSync(join(directory, 'graphify-out'), { recursive: true })
  writeFileSync(
    join(directory, 'graphify-out', 'graph.json'),
    '{"nodes":[],"edges":[]}\n',
    'utf8',
  )
}

/**
 * Creates a temp project root for one behavioural scenario.
 *
 * @returns {string} Absolute temp directory.
 */
function makeTempProject() {
  return mkdtempSync(join(tmpdir(), 'graphify-contract-'))
}

const pluginFiles = listPluginFiles()

// ═════════════════════════════════════════════════════════════════════════════
// Group 0 — discovery (REQ-005 / PLUG-001 detection gap: "nothing reads the dir")
// ═════════════════════════════════════════════════════════════════════════════

describe('plugin discovery', () => {
  it('finds at least one plugin file so the contract cannot pass vacuously', () => {
    expect(
      existsSync(PLUGINS_DIR),
      `Expected the plugin directory at ${PLUGINS_DIR}. ` +
        'The V2 contract test must never pass by discovering zero plugins.',
    ).toBe(true)

    expect(
      pluginFiles.length,
      `No plugin modules matched ${PLUGIN_FILE_PATTERN} in ${PLUGINS_DIR}. ` +
        'An empty discovery set would make every contract assertion vacuous.',
    ).toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Groups 1-6 — module contract + behaviour, one describe per discovered plugin
// ═════════════════════════════════════════════════════════════════════════════

for (const pluginFile of pluginFiles) {
  const label = relative(REPO_ROOT, pluginFile)
  const isGraphify = basename(pluginFile, extname(pluginFile)) === 'graphify'

  describe(`${label} — V2 plugin contract`, () => {
    let mod

    beforeAll(async () => {
      mod = await importPlugin(pluginFile)
    })

    // ── Group 2 — default export shape (PLUG-001) ───────────────────────────

    it('default-exports a definition object (PLUG-001)', () => {
      requireDefaultDefinition(mod, label)
    })

    // ── Group 5 — no V1 fallback (PLUG-001) ─────────────────────────────────

    it('does not fall back to the V1 named export / server() shape (PLUG-001)', () => {
      const namedExports = Object.keys(mod ?? {}).filter((name) => name !== 'default')
      const definition = mod && mod.default
      const hasDefaultDefinition =
        definition !== null && typeof definition === 'object' && !Array.isArray(definition)

      expect(
        hasDefaultDefinition,
        [
          `${label} still looks like a V1 plugin module.`,
          `Named export(s) found: ${namedExports.join(', ') || '(none)'}.`,
          'OpenCode 2 loads ONLY the default definition; a named export is never called.',
          V1_TO_V2_SHAPE_HINT,
        ].join('\n'),
      ).toBe(true)

      expect(
        typeof mod.server,
        [
          `${label} exports a V1 \`server()\` hook.`,
          'V2 calls `setup()` (or `effect`) and never calls `server()`; a plugin that',
          'keeps its logic on `server` loads but registers nothing (the herdr pattern,',
          'PLUG-004). Move the registrations into `setup(ctx)`.',
        ].join('\n'),
      ).not.toBe('function')
    })

    // ── Group 3 — id (PLUG-001) ─────────────────────────────────────────────

    it('declares a non-empty string id (PLUG-001)', () => {
      const definition = requireDefaultDefinition(mod, label)

      expect(
        typeof definition.id,
        [
          `${label} default export must carry a string \`id\`.`,
          'The V2 loader rejects a definition without one:',
          '"Plugin must export a default definition with an id and an effect or setup function".',
        ].join('\n'),
      ).toBe('string')

      expect(
        definition.id.trim().length,
        `${label} default export must carry a non-empty \`id\` (whitespace is not an id).`,
      ).toBeGreaterThan(0)
    })

    // ── Group 4 — exactly one of setup / effect (PLUG-001) ──────────────────

    it('provides exactly one of setup() or effect() (PLUG-001)', () => {
      const definition = requireDefaultDefinition(mod, label)
      const hasSetup = typeof definition.setup === 'function'
      const hasEffect = typeof definition.effect === 'function'

      expect(
        hasSetup || hasEffect,
        [
          `${label} must provide a callable \`setup\` (Promise API) or \`effect\` (Effect API).`,
          `Found setup: ${typeof definition.setup}; effect: ${typeof definition.effect}.`,
          V1_TO_V2_SHAPE_HINT,
        ].join('\n'),
      ).toBe(true)

      expect(
        hasSetup && hasEffect,
        [
          `${label} exports BOTH setup() and effect().`,
          'The V2 SDK variants are separate entry points (@opencode/plugin and',
          '@opencode/plugin/effect); a definition must carry exactly one. Exporting both',
          'leaves the loader choice undefined (see contract note §9).',
        ].join('\n'),
      ).toBe(false)
    })

    if (isGraphify) {
    // ── Group 4b — graphify uses the promise variant (REQ-001) ──────────────

    it('graphify specifically provides setup(), not only effect() (REQ-001)', () => {
      const definition = requireDefaultDefinition(mod, label)

      expect(
        typeof definition.setup,
        [
          `${label} must provide a callable \`setup(ctx)\` — REQ-001 pins the promise variant.`,
          'The shipped graphify hook is async and registers through ctx.tool.hook, which',
          'is the promise API (`@opencode/plugin`), not the Effect API.',
        ].join('\n'),
      ).toBe('function')
    })

    // ── Group 5b — execute.before registration (REQ-002) ────────────────────

    it('registers exactly one execute.before hook through ctx.tool.hook (REQ-002)', async () => {
      const directory = makeTempProject()

      try {
        writeGraphFixture(directory)
        const callback = await registerExecuteBefore(pluginFile, label, directory)
        expect(typeof callback).toBe('function')
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })

    // ── Group 6 — behaviour: no graph file means no mutation (TEST-06) ──────

    it('does not mutate a shell command when graphify-out/graph.json is absent (REQ-002)', async () => {
      const directory = makeTempProject()

      try {
        // Deliberately no graph fixture. Declared before the mutating scenario so
        // the plugin's `reminded` latch is still false even if module caching
        // ignores the fresh-import query.
        const callback = await registerExecuteBefore(pluginFile, label, directory)
        const event = { tool: 'shell', input: { command: 'echo hi' } }

        await callback(event)

        expect(
          event.input.command,
          [
            `${label} mutated a command although ${join(directory, 'graphify-out', 'graph.json')} does not exist.`,
            'The hook must early-return when the knowledge graph is absent, so projects',
            'without graphify get untouched commands.',
          ].join('\n'),
        ).toBe('echo hi')
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })

    // ── Group 6b — behaviour: shell vs bash, guards, latch (PLUG-005) ───────

    it('reacts to the V2 "shell" tool and ignores the dead V1 "bash" name (PLUG-005)', async () => {
      const directory = makeTempProject()

      try {
        writeGraphFixture(directory)
        const callback = await registerExecuteBefore(pluginFile, label, directory)

        // Non-mutating cases run FIRST, while the `reminded` latch is still false,
        // so each one proves the tool/input filter itself — not the latch.

        // PLUG-005: "bash" is the V1 tool name. It does not exist under V2, so a
        // plugin that matches it is a silent no-op. If this assertion fails, the
        // port still carries the V1 name and the reminder will never fire.
        const bashEvent = { tool: 'bash', input: { command: 'echo hi' } }
        await callback(bashEvent)
        expect(
          bashEvent.input.command,
          [
            `${label} reacted to tool "bash".`,
            'OpenCode 2 names the built-in command tool "shell"; "bash" is the V1 name and',
            'is never emitted (verified at @opencode/core@2.2.5/dist/types/tool/plugin/shell.d.ts).',
            'Matching "bash" is dead code and was the PLUG-005 regression.',
          ].join('\n'),
        ).toBe('echo hi')

        // A different non-shell tool must also be ignored.
        const readEvent = { tool: 'read', input: { path: 'README.md' } }
        await callback(readEvent)
        expect(
          readEvent.input,
          `${label} mutated a non-shell tool event. Only tool "shell" carries input.command.`,
        ).toEqual({ path: 'README.md' })

        // The event payload is `unknown` at the SDK boundary, so the hook must
        // narrow before reading `.command`; malformed input must be a no-op, not a throw.
        const malformedEvents = [
          { tool: 'shell', input: {} },
          { tool: 'shell', input: { command: 42 } },
          { tool: 'shell', input: null },
        ]
        for (const malformed of malformedEvents) {
          const snapshot = structuredClone(malformed.input)
          // `await` covers both shapes: a synchronous throw and a rejected
          // promise fail the test; a synchronous `undefined` return is valid.
          await callback(malformed)
          expect(
            malformed.input,
            [
              `${label} must not throw or mutate when event.input.command is missing or not a string.`,
              `Offending input: ${JSON.stringify(snapshot)}.`,
              'Guard with: if (input === null || typeof input !== "object") return;',
              'if (typeof input.command !== "string") return;',
            ].join('\n'),
          ).toEqual(snapshot)
        }

        // PLUG-005 (positive half): the V2 tool name must be handled. The hook
        // mutates the event in place — `event.input.command` is re-read by the
        // runtime after the hook, so assignment is the mechanism (not a return value).
        const shellEvent = { tool: 'shell', input: { command: 'echo hi' } }
        await callback(shellEvent)

        // Pin the exact rendered prefix: the reminder text AND its shell
        // escaping. A regression to V1's raw backticks (which the shell ran as
        // command substitution) or any copy edit must fail here.
        expect(
          shellEvent.input.command,
          [
            `${label} rendered a different reminder than the pinned contract.`,
            'The reminder text is product copy and the escaping is a security property:',
            'un-escaped backticks are executed by the shell as command substitution (V1 bug).',
            `Expected: ${JSON.stringify(`${EXPECTED_REMINDER} && echo hi`)}`,
            `Got:      ${JSON.stringify(shellEvent.input.command)}`,
            'Change EXPECTED_REMINDER only for a deliberate copy/escaping update.',
          ].join('\n'),
        ).toBe(`${EXPECTED_REMINDER} && echo hi`)

        expect(
          shellEvent.input.command,
          [
            `${label} did not react to tool "shell" with input { command: "echo hi" }.`,
            'OpenCode 2 emits the built-in command tool as "shell" and passes one mutable',
            'event whose payload is `event.input`. A V2 hook must set',
            '`event.input.command = `${REMINDER} && ${event.input.command}`` (PLUG-005).',
            'A port that only changes the export shape but keeps the V1 "bash" filter loads',
            'cleanly and silently never fires — this assertion is the gate for that trap.',
          ].join('\n'),
        ).not.toBe('echo hi')

        expect(
          shellEvent.input.command.endsWith('echo hi'),
          [
            `${label} must append the original command verbatim after the reminder.`,
            `Got: ${JSON.stringify(shellEvent.input.command)}.`,
            'The reminder is product copy and the original command must survive unchanged;',
            'the plugin must not parse, quote, or re-interpret it (SEC-002).',
          ].join('\n'),
        ).toBe(true)

        expect(
          shellEvent.input.command.toLowerCase(),
          `${label} must prefix the graphify reminder; the mutated command contains no "graphify".`,
        ).toContain('graphify')

        // The `reminded` latch must stop a second shell call being prefixed again.
        const secondShellEvent = { tool: 'shell', input: { command: 'ls' } }
        await callback(secondShellEvent)
        expect(
          secondShellEvent.input.command,
          [
            `${label} double-prefixed a second shell command ("reminded" latch missing).`,
            `Got: ${JSON.stringify(secondShellEvent.input.command)}.`,
            'The reminder should fire at most once per setup; keep a `let reminded = false`',
            'latch and early-return when it is set.',
          ].join('\n'),
        ).toBe('ls')
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 7 — config regression (PLUG-002) and local SDK pin (PLUG-003)
// ═════════════════════════════════════════════════════════════════════════════
//
// Both files are git-ignored and absent from a clean checkout, so these groups
// skip in CI: the committed layer that protects consumers is the plugin module
// contract above. Where the files do exist (developer worktree), the checks catch
// the deprecated singular `plugin` key and the stale V1 SDK pin.

const LOCAL_CONFIG_PATH = join(REPO_ROOT, '.opencode', 'opencode.json')
const LOCAL_PACKAGE_PATH = join(REPO_ROOT, '.opencode', 'package.json')

describe.skipIf(!existsSync(LOCAL_CONFIG_PATH))(
  '.opencode/opencode.json — no configured plugin load path (PLUG-002)',
  () => {
    it('declares neither `plugin` nor `plugins`', () => {
      const config = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf8'))

      expect(
        config.plugin,
        [
          '`.opencode/opencode.json` still declares the deprecated singular `plugin` key.',
          'V2 treats a configured single-file path as an npm package name, producing a',
          'per-activation NpmInstallFailedError (PLUG-002), and duplicates the auto-',
          'discovered directory load (PLUG-007). Delete the key.',
        ].join('\n'),
      ).toBeUndefined()

      expect(
        config.plugins,
        [
          '`.opencode/opencode.json` declares `plugins`.',
          '`.opencode/plugins/` is auto-discovered, so an explicit path recreates the',
          'duplicate-load surface (PLUG-007). Leave auto-discovery as the only load path.',
        ].join('\n'),
      ).toBeUndefined()
    })
  },
)

describe.skipIf(!existsSync(LOCAL_PACKAGE_PATH))(
  '.opencode/package.json — V2 SDK pin, no V1 SDK (PLUG-003)',
  () => {
    it('does not declare the V1 @opencode-ai/plugin package', () => {
      const pkg = JSON.parse(readFileSync(LOCAL_PACKAGE_PATH, 'utf8'))
      const declared = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
      }

      expect(
        declared['@opencode-ai/plugin'],
        [
          '`.opencode/package.json` still pins the V1 SDK `@opencode-ai/plugin`.',
          'The V2 SDK is a DIFFERENT package name: `@opencode/plugin` (V2), at the',
          'runtime major.minor (2.2.5 for OpenCode 2.2.5). A version bump of the old',
          'package cannot reach the V2 API (PLUG-003).',
        ].join('\n'),
      ).toBeUndefined()
    })
  },
)
