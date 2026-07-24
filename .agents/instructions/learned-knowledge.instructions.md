# Learned Knowledge

> Accumulated patterns, conventions, gotchas, and agent tuning notes from TDD and other pipeline sessions.

## Session: 2026-06-13

**Pipeline:** TDD Infrastructure Bootstrap
**Coverage:** N/A (infrastructure setup)
**TDD Iterations:** 0

**New knowledge:**
- Project is a template distribution package (npm), not a deployable application
- Source code is in `scripts/` (ES modules), not a traditional `src/` directory
- E2E tests use Playwright with `tests/` directory, `.spec.ts` extension
- Unit tests use Vitest with `scripts/` directory, `.test.{js,ts}` extension
- Playwright config uses `chromium` as default, `fullyParallel: true`
- Coverage threshold is 90% across all metrics (statements, branches, functions, lines)

**Agent tuning notes:**
- unit-tester: Must be told to look in `scripts/` for source and test files, not `src/`
- coder: Must be told the project uses ES module syntax (import/export, not require/module.exports)
- implementer: Plans should target `scripts/` for production code and tests

## Session: 2026-07-24

**Pipeline:** researcher → architect → implementer → coder (6 parallel batches) → unit-tester → tracker
**Coverage:** 88/88 tests passing across 4 test files (discover 21, hooks 16, prepare 27, index 24)
**TDD Iterations:** 0 (feature pipeline, not TDD)

**New knowledge:**
- **npm v12 blocks postinstall scripts from dependencies** — this is a critical ecosystem shift that affects ALL npm library distribution. Postinstall auto-sync is no longer viable; explicit setup commands are required
- **npx-based setup command pattern** (following Playwright, Prisma, Cypress convention) is the future-proof distribution mechanism for CLI tools that need to configure consumer projects
- **Husky v9 programmatic API** is dead simple: `import husky from 'husky'; husky(consumerRoot)` — no need to shell out or manually manage shim files
- **`child_process.spawn` for scripts with `process.exit()`** — importing sync.js (which calls `process.exit()`) directly into the setup process would kill the parent. Spawn as a child process to isolate exit behavior
- **Marker comment idempotency** — a first-line comment (`# Managed by @abarcenas/ai-workflow-template setup`) on hook files enables content-based detection for safe re-runs. This pattern should be used for any managed file that needs idempotent installation
- **6-batch parallel execution worked well**: Batch A (3 foundation: constants, utils, ui) → Batch B (5 core: discover, hooks, prepare, husky-init, sync-phase) → Batch C (2 orchestrator: index.js, bin/setup.js) → Batches D+E (3 config: pre-commit marker, post-merge marker, package.json) → Batch F (4 tests). Clear interface definitions were essential for parallelism
- **Duplicate-marker trap** — constants.js `TEMPLATE_HOOKS.content` must stay in sync with actual `.husky/` hook files. During T12 (post-merge marker), a mismatch was discovered between the template content in constants.js (which already had the marker via `buildHookContent()`) and the actual disk file. Solution: update constants.js template content whenever hook files are modified

**Agent tuning notes:**
- **researcher**: Should explicitly investigate npm ecosystem changes (version-specific behavior, deprecations) — the npm v12 postinstall discovery was the single most important finding that drove the architecture
- **architect**: Modular design with clear interface contracts (Context object shape, return types) paid off — all 5 Batch B modules could be implemented in parallel without coordination issues
- **implementer**: The parallel batch plan with explicit dependency edges (Batch A → B → C, D+E → F) was critical for the 6 sub-agent coder execution. Without this structure, 6 concurrent coders would have had race conditions on shared files
- **coder (parallel batches)**: Batch ordering discipline worked — foundation first, then core, then orchestrator. The truly independent batches (D: markers, F: tests) could run alongside later batches. Key lesson: define interfaces (Context shape, return types) before splitting work across parallel coders
- **unit-tester**: Using real temp directories (`mkdtempSync`) over mocking filesystem operations catches path resolution and permission issues that mocks would miss. Mock only environment-dependent utilities (CI detection, Node version), not filesystem
- **tracker**: Should capture ecosystem discoveries alongside implementation details — the npm v12 finding and marker idempotency pattern are valuable knowledge for future pipeline sessions

## Session: 2026-07-24 — Verbose Logging for ai-workflow-setup

**Pipeline:** implementer (bootstrap) → researcher → implementer (planning) → coder (4 parallel batches) → tracker
**Coverage:** 96/96 tests passing across 5 test files (discover 23, hooks 16, prepare 27, index 25, sync-phase 5)
**TDD Iterations:** 0 (feature pipeline, not TDD)

**New knowledge:**
- **Dead code infrastructure is a valuable find** — the `--verbose` flag already existed in `constants.js` and was correctly parsed by `parseCliArgs()`, but was never checked anywhere. Always check for existing-but-unused infrastructure before building new mechanisms
- **`spawnScript()` in `sync-phase.js` was the root cause of silent hangs** — child process stdout/stderr was captured into a string but that string was never displayed or logged. The fix: use `stdio: 'inherit'` when verbose, `'pipe'` for normal mode
- **Child process communication requires env vars** — parent and child processes share no context object. `sync.js` reads `AI_WORKFLOW_VERBOSE` from `process.env` set by `sync-phase.js` before spawning
- **`console.error` (stderr) is correct for verbose output in child processes** — stdout is captured by the parent for result parsing, but stderr streams to terminal in `stdio: 'inherit'` mode. Diagnostic messages go to stderr
- **`index.js` needed ZERO changes** — the Context `verbose` field flows from `discover(flags)` through all phase modules automatically via the existing orchestration pattern. This validates the Context enrichment architecture
- **Parallel batching with 4 batches and 10 tasks worked cleanly**: Batch A (T1–T2 foundation) → Batch B (T3–T6 core fixes) → Batch C (T7 single) → Batch D (T8–T10 tests). 0 collisions, clean interface boundaries. The explicit dependency graph (Batch A → B → C, B → D) prevented race conditions
- **`normalize-memory.js` already has good internal logging** — when verbose mode streams child stdout in real-time, this existing logging becomes visible to the user for free, with no code changes needed
- **Dim ANSI style (` … prefix`) for verbose output** — visually distinguishes verbose progress from normal output. Uses existing color infrastructure with TTY guard

**Agent tuning notes:**
- **researcher**: Should examine existing flag/configuration infrastructure for dead code — the `--verbose` flag was fully defined and parsed but never checked. This was the single most impactful finding because it revealed both the root cause (spawnScript capture) and the solution path (activate existing flag)
- **implementer (planning)**: The "index.js needs zero changes" insight should be explicitly validated before including in plans — it's easy to miss that context flows automatically. Read the orchestrator code to verify before committing to "no changes" claims
- **coder**: When fixing child process output capture, consider both stdout and stderr channels independently — they serve different purposes (results vs diagnostics). `stdio: 'inherit'` is clean for real-time streaming but means stdout is no longer capturable programmatically
- **unit-tester**: When testing child process spawn behavior, mock `child_process` spawn module rather than using real subprocesses — this avoids side effects and keeps tests fast. Use `vi.mock` with factory functions to control `stdio` arg and `env` values
- **tracker**: Record dead-code discoveries alongside implementation details — the "existing but unused infrastructure" finding is a recurring pattern worth tracking across sessions

## Session: 2026-07-24 — Fix Hook Script References for Consumer Projects

**Pipeline:** researcher → implementer → coder (5 parallel tasks T1–T5) → tracker
**Coverage:** 7/7 unit tests passing (2 existing + 5 new), 52/52 integration assertions, 13/13 MCP references verified
**TDD Iterations:** 0 (feature pipeline, not TDD)

**New knowledge:**
- **Hash-based manifest namespace pattern** — `__scripts__/<relPath>` extends the proven `.agents/` (bare path) and `__opencode__/` namespace pattern. The 3-case sync logic (new → copy, untouched → overwrite, locally modified → skip with warning) applies identically across all sync sections. No manifest version schema change needed for adding new namespace keys.
- **Co-location constraint for imported dependencies** — `memory-cli.js` imports `'./memory-index.js'` and `mcp-memory-server.js` also imports `'./memory-index.js'`. Both the consumer-facing script AND its co-located dependency must be in the same sync array. This is an architectural constraint: if you sync one, you must sync all of its relative-import dependencies.
- **`ensureParentDirectory()` handles nested paths automatically** — `mcp/playwright-mcp-launcher.js` lives in a subdirectory, and the existing `ensureParentDirectory()` helper (which calls `mkdirSync(dirname(filePath), { recursive: true })`) creates it without any special handling.
- **`spawnSync` for testing modules with `process.exit()`** — `sync.js` calls `process.exit()` and cannot be imported as a module. The proven pattern: use `child_process.spawnSync` to invoke it as a child process, with `INIT_CWD` pointing to an isolated temp directory (created via `mkdtempSync`), and clean up in `afterAll`. This is the same pattern used by `sync-phase.js` in production.
- **Two Playwright MCP patterns coexist by design** — The template's own root `opencode.json` uses `npx @playwright/mcp@latest` (modern, no file dependency), while `opencode.mcp.example.json` uses the launcher script wrapper with env var configuration (`HEADLESS`, `SLOW_MO`, `VIEWPORT`). Both serve different audiences: the template itself vs. consumer projects that may need launcher configuration.
- **Marker comment for managed-file detection** — The `HOOK_MARKER` (`# Managed by @abarcenas/ai-workflow-template setup`) is the first line of hook files. This enables `discover.js` `isManaged` detection by reading the first line. The marker must be on line 1 for detection to work — the shebang (`#!/bin/sh`) moves to line 2, which is safe because husky sources hook files rather than executing them directly.
- **Relative paths in hooks become valid after script sync — no hook content changes needed** — The key architectural insight: `constants.js` `TEMPLATE_HOOKS` content uses `node scripts/memory-cli.js update` which resolves correctly from the consumer root once `scripts/` exists there. Zero modifications to `constants.js`, `hooks.js`, `.husky/post-merge`, or `.husky/pre-commit` are needed.
- **Content integrity via SHA-256 manifest tracking** — Every synced file is hashed with SHA-256. The manifest tracks `__scripts__/<relPath>` → hash. This enables idempotent re-runs (hash match → no warning), local modification detection (on-disk hash ≠ manifest hash → skip with warning), and force overwrite (`--force` ignores local modifications).
- **Cross-file MCP reference auditing is essential** — 13 reference points across 7 files needed verification (`opencode.mcp.example.json`, `opencode.mcp.json`, `opencode.json` root, `scripts/mcp-memory-server.js`, `scripts/sync.js`, `scripts/sync.test.js`, `.agents-sync-manifest.json`, `docs/playwright-mcp-configuration.md`). Every reference from MCP configs, sync arrays, test assertions, manifest entries, and documentation must be cross-checked to ensure path resolution after sync changes — this is easy to miss.
- **`--force` flag consistency across all sync sections** — The `--force` flag semantics are identical for `.agents/`, `.opencode/`, `__scripts__/`, and root files: it bypasses local modification protection and overwrites. This consistency should be preserved for any future sync sections.

**Agent tuning notes:**
- **researcher**: Must conduct a 6-tier script inventory with dependency chain analysis when determining sync scope. The co-location constraint (`memory-cli.js` imports `'./memory-index.js'`) was discovered by tracing `import` chains — always follow relative imports to find all files that must be co-located. Also check MCP config files (`opencode.mcp.json`, `opencode.json`) for script path references that create additional sync requirements.
- **implementer (planning)**: When parallel batches share a dependency (Phase 2 and 3 both depend on Phase 1), verify that batch-independent tasks truly have no shared-file dependencies. T2 (test code), T3 (integration verification), T4 (audit), and T5 (documentation) all depended on T1 but were fully independent of each other — this enabled parallel execution without conflicts. The plan's explicit dependency table with "Can run in parallel?" and "Depends on" columns is essential for coder batch scheduling.
- **coder (T1 — sync.js core logic)**: When adding a new sync section that mirrors an existing one (`.opencode/` block), copy-paste with careful variable renaming is correct and efficient. The 3-case hash logic is proven and consistent. Only 3 things need to change: (1) the tracked key namespace (`__scripts__/` instead of `__opencode__/`), (2) source/target directory paths, (3) the log prefix in verbose messages. The accumulator pattern (`scriptsCopied`/`scriptsSkipped` feeding into global `copied`/`skipped`) should also be mirrored.
- **coder (T2 — unit tests)**: Test infrastructure for `process.exit()` modules is reusable across all sync test files — create a `createTempDir()` helper with `mkdtempSync`, a `runSync(tempDir, args)` helper using `spawnSync`, and cleanup in `afterAll`. Assertion patterns to reuse: file existence (`expect(existsSync(path)).toBe(true)`), content match (`readFileSync(path) === sourceContent`), mtime invariance for skip tests, manifest key presence, and SHA-256 hash format validation (`/^[a-f0-9]{64}$/`).
- **coder (T3 — integration verification)**: Integration verification in a simulated consumer project requires a comprehensive test harness. The pattern: create temp consumer dir with minimal `package.json`, run sync with `INIT_CWD`, then assert on filesystem state and script execution. Content integrity via SHA-256 comparison is more reliable than byte-by-byte comparison. Test groups should cover: first-run sync, idempotent re-run, locally modified preservation, `--force` overwrite, `--dry-run`, hook path resolution, post-merge hook path, syntax validation for all synced scripts, and script execution from consumer root.
- **coder (T4 — MCP audit)**: MCP reference auditing requires structured cross-referencing. Create a table with columns: File, Lines, Reference text, and Status. Track every reference point across ALL files, not just obvious ones (documentation references are the ones most often missed). Note architectural nuances like the two Playwright patterns (npx vs launcher script) — these are design decisions worth documenting, not bugs.
- **tracker**: The feature-specific documentation (`docs/hook-script-references/tracker.md`) should include a "Total Results" summary section at the end with unit tests, integration assertions, MCP references, and files modified. This gives readers an executive-summary view without reading the full multi-step pipeline.
