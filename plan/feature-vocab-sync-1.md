---
goal: "Auto-update memory-bank/.vocabulary.json from staged frontmatter tags, fix validator entity_patterns awareness, add agent instructions, and wire into pre-commit hook with consumer distribution"
version: 1
date_created: 2026-08-03
status: Completed
tags: [feature, bootstrap, tooling, pre-commit, vocabulary, memory-bank, sync]
---

# Feature: Auto-Update Vocabulary JSON (vocab-sync) + Validator Fix + Distribution

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

## Introduction

This plan implements a pre-commit workflow that automatically keeps `memory-bank/.vocabulary.json` in sync with frontmatter tags used across memory-bank files. When a developer adds a new tag to a memory-bank file's frontmatter, the pre-commit hook auto-appends it to `.vocabulary.json` under the `topic` group (or skips it if already known via `entity_patterns`), then stages the file so the vocab update commits alongside the content change.

The trigger was pre-commit warnings like `⚠ Unknown tags: [float32array, learned-knowledge, npm, package-structure, readme]` — the validator only checked `tags.*` groups against frontmatter tags, ignoring `entity_patterns` keys (so `npm` produced a false positive). The plan also fixes that validator gap, adds agent instructions for vocabulary maintenance, and adds a reviewer hygiene checklist.

All changes distribute to consumer projects via the existing sync mechanism (`scripts/sync.js`) and the setup tool's hook templates (`scripts/setup/constants.js`).

## Distribution Mechanism: How Changes Reach Consumers

| Asset | Distribution Channel |
|-------|---------------------|
| `scripts/vocab-sync.js` | **npm tarball** (`scripts/` is in `package.json` `files` array) + **`sync.js` `scriptsToSync`** array (explicit list, must add entry) |
| `.husky/pre-commit` content (consumer) | **Setup tool** (`scripts/setup/constants.js` → `TEMPLATE_HOOKS['pre-commit'].content`) — hardcoded template string written to consumer's `.husky/pre-commit` during `npx ai-workflow-setup` |
| `.husky/pre-commit` (this repo) | **Direct edit** — the file at repo root |
| `.opencode/agents/reviewer.agent.md` | **`sync.js`** `.opencode/**` sync section (lines 134–174) — copies all `.opencode/` files except excluded (`node_modules`, `package.json`, etc.) |
| `.agents/instructions/memory-schema.instructions.md` | **`sync.js`** `.agents/**` sync section (lines 97–130) — copies all `.agents/` files except `learned-knowledge.instructions.md` |
| `memory-bank/.vocabulary.json` | **npm tarball** (explicitly in `package.json` `files`) + **`vocab-sync.js`** writes to it in the consumer's own repo during pre-commit (so each consumer maintains its own vocabulary) |

## Requirements & Constraints

| ID | Type | Description |
|----|------|-------------|
| REQ-01 | Functional | Auto-append unknown frontmatter tags from staged memory-bank files to `.vocabulary.json` under `topic` group |
| REQ-02 | Functional | Consider `entity_patterns` keys as known tags — do NOT auto-append tags already present as entity_pattern keys |
| REQ-03 | Functional | Normalize tags: lowercase kebab-case, drop empty/whitespace-only, deduplicate (idempotent) |
| REQ-04 | Functional | `git add` the updated `.vocabulary.json` so it commits with the same change |
| REQ-05 | Functional | Warn only — never block the commit (exit 0 always, unless a real unhandled error) |
| REQ-06 | Functional | Wire `vocab-sync.js` into `.husky/pre-commit` (this repo) |
| REQ-07 | Functional | Wire `vocab-sync.js` into the setup tool's pre-commit hook template (`constants.js`) |
| REQ-08 | Functional | Add `vocab-sync.js` to `sync.js`'s `scriptsToSync` array for consumer distribution |
| REQ-09 | Functional | Fix validator to count `entity_patterns` keys as known tags (eliminate `npm`-style false positives) |
| REQ-10 | Documentation | Add "Maintaining the Vocabulary" section to `memory-schema.instructions.md` |
| REQ-11 | Documentation | Add memory-bank hygiene checklist item to `reviewer.agent.md` |
| REQ-12 | Testing | Unit test `vocab-sync.js`: new tags, dedupe, normalization, entity_patterns skip, no-op, staging |
| REQ-13 | Testing | Update `hooks.test.js` expectations for new pre-commit content |
| REQ-14 | Testing | Add validator test for entity_patterns fix |
| SEC-01 | Security | Reuse existing frontmatter parsing patterns — no new dependencies |
| CON-01 | Constraint | Do NOT extract shared frontmatter parsing into a new module (simplest maintainable approach: keep scripts self-contained) |
| CON-02 | Constraint | Keep all exit codes consistent: warn-don't-block (0), real error (!0) |
| CON-03 | Constraint | Vitest test coverage: maintain 90% threshold on changed files |

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T3, T4, T5, T6, T8, T9 | Yes | — |
| B | T2, T7, T10 | Yes | A |

## Phase 1 — Core Scripts & Wiring (Batch A — Parallel)

All tasks touch different files. No interdependencies.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Create `scripts/vocab-sync.js` — new script that scans staged memory-bank files, finds unknown frontmatter tags, appends to `.vocabulary.json` | `scripts/vocab-sync.js` (NEW) | A | — | 2026-08-03 |
| T3 | Fix validator entity_patterns awareness: count `entity_patterns` keys as known tags in `scripts/validate-memory-schema.js` | `scripts/validate-memory-schema.js` (line ~131) | A | — | 2026-08-03 |
| T4 | Add `node scripts/vocab-sync.js` line to the pre-commit hook template in `scripts/setup/constants.js` | `scripts/setup/constants.js` (lines 44–51) | A | — | 2026-08-03 |
| T5 | Add `node scripts/vocab-sync.js` line to `.husky/pre-commit` (this repo) | `.husky/pre-commit` (line 4) | A | — | 2026-08-03 |
| T6 | Add `'vocab-sync.js'` to `scriptsToSync` array in `scripts/sync.js` | `scripts/sync.js` (lines 178–191) | A | — | 2026-08-03 |
| T8 | Add "Maintaining the Vocabulary" section to `.agents/instructions/memory-schema.instructions.md` | `.agents/instructions/memory-schema.instructions.md` (after line 75) | A | — | 2026-08-03 |
| T9 | Add memory-bank hygiene checklist item to `.opencode/agents/reviewer.agent.md` | `.opencode/agents/reviewer.agent.md` (after line 46) | A | — | 2026-08-03 |

### T1 — Create `scripts/vocab-sync.js`

**Purpose:** Automatically sync new frontmatter tags from staged memory-bank files into `memory-bank/.vocabulary.json`.

**File:** `scripts/vocab-sync.js` (new, create at repo root `scripts/`)

**Implementation details:**

1. Use `#!/usr/bin/env node` shebang (matches `validate-memory-schema.js` convention).
2. Use ES module `import` syntax (matches other scripts; `package.json` has `"type": "module"`).
3. Re-use the same staged-file detection as `validate-memory-schema.js`:
   - `git diff --cached --name-only --diff-filter=ACM`
   - Filter to `memory-bank/` prefix, `.md` extension, exclude `.index/` directory
4. Re-use the same `parseFrontmatter()` function from `validate-memory-schema.js` (self-contained copy — see CON-01).
5. Load `memory-bank/.vocabulary.json` (fail gracefully if missing — exit 0).
6. Build a "known tags" set from:
   - All values across all `tags.*` groups (`Object.values(vocab.tags).flat()`)
   - All keys of `entity_patterns` (`Object.keys(vocab.entity_patterns || {})`)
7. For each staged file, parse frontmatter and extract `tags` array.
8. **Normalize** each candidate tag:
   - Convert to lowercase
   - Replace spaces/underscores with hyphens → kebab-case
   - Strip leading/trailing whitespace
   - Drop empty/whitespace-only entries
9. Collect tags NOT in the "known tags" set → these are "new" tags.
10. If no new tags: exit 0 silently (no-op).
11. Append new tags to `vocab.tags.topic` array (default placement), deduplicate, sort alphabetically.
12. Write back to `memory-bank/.vocabulary.json` (pretty-print JSON with 2-space indent, trailing newline — match existing format exactly).
13. Run `git add memory-bank/.vocabulary.json` to stage the updated file.
14. Print a concise summary: `[vocab-sync] Added X tag(s) to memory-bank/.vocabulary.json: [tag1, tag2]` using `console.warn`.
15. Always exit 0 (unless an unhandled exception occurs — then exit 1 with error message).

**Key design decisions:**
- **Staged files only** (not all memory-bank): Running in pre-commit context, only the staged diff matters. Scanning all files would produce noisy results for tags from files not being committed.
- **Staging the vocab file**: Pre-commit runs before the commit is finalized, so `git add` seamlessly includes the vocab update in the same commit. This ensures the vocabulary is always consistent with the committed content.
- **Default to `topic` group**: `topic` is the catch-all group; agent maintainers can manually recategorize later. Auto-detecting the correct group (workflow vs. memory_ops vs. topic) is too heuristic-prone for a pre-commit hook.
- **No shared module extraction**: The ~20-line `parseFrontmatter` function is simple enough to duplicate. Extracting a shared module would require tracking it in `sync.js` and `scriptsToSync`, adding complexity disproportionate to the benefit.

### T3 — Fix validator entity_patterns awareness

**Purpose:** Stop the pre-commit validator from warning about tags that exist as `entity_patterns` keys (e.g., `npm`, `vitest`, `playwright`).

**File:** `scripts/validate-memory-schema.js`, line 131 (the `allTags` computation in `validateFile`)

**Change:** In `validateFile()`, change:
```js
// Before (line ~131):
const allTags = Object.values(vocab.tags).flat();

// After:
const allTags = [
  ...Object.values(vocab.tags).flat(),
  ...Object.keys(vocab.entity_patterns || {}),
];
```

This ensures `entity_patterns` keys (e.g., `npm`, `vitest`, `playwright`, `graphify`, `husky`, `opencode`, `sqlite-vec`, `transformers.js`, `memory-bank`, `tdd-orchestrator`, `mcp-server`) are treated as valid, known tags and do not produce false-positive "Unknown tags" warnings.

**Validation:** After the change, committing a file with `tags: [npm, vitest]` should NOT produce "Unknown tags: [npm, vitest]" warnings.

### T4 — Update setup tool pre-commit template

**Purpose:** Ensure `node scripts/vocab-sync.js` is included in the pre-commit hook content written to consumer projects by `npx ai-workflow-setup`.

**File:** `scripts/setup/constants.js`, lines 42–53 (`TEMPLATE_HOOKS['pre-commit'].content`)

**Change:** Add `'node scripts/vocab-sync.js',` after the existing `'node scripts/validate-memory-schema.js',` line in the pre-commit content array. The resulting content should be:

```js
content: [
  '# Managed by @abarcenas/ai-workflow-template setup',
  '#!/bin/sh',
  '',
  'node scripts/bump-version.js',
  'node scripts/vocab-sync.js',
  'node scripts/validate-memory-schema.js',
  '',
].join('\n'),
```

**Rationale for ordering:** `vocab-sync.js` runs BEFORE `validate-memory-schema.js` so that any new tags are added to `.vocabulary.json` before the validator checks for unknown tags. This eliminates the chicken-and-egg problem where a first-time tag would warn even though `vocab-sync.js` would add it.

### T5 — Update `.husky/pre-commit` (this repo)

**Purpose:** Add `vocab-sync.js` to the actual pre-commit hook file in this repository.

**File:** `.husky/pre-commit`

**Change:** Add `node scripts/vocab-sync.js` line after `node scripts/bump-version.js` and before `node scripts/validate-memory-schema.js`. Result:

```
# Managed by @abarcenas/ai-workflow-template setup

node scripts/bump-version.js
node scripts/vocab-sync.js
node scripts/validate-memory-schema.js
```

### T6 — Add `vocab-sync.js` to `sync.js` `scriptsToSync`

**Purpose:** Ensure `vocab-sync.js` is copied to consumer projects by `sync.js` (which runs on `npm install` / `npm run sync`).

**File:** `scripts/sync.js`, lines 178–191 (`scriptsToSync` array)

**Change:** Add `'vocab-sync.js',` to the `scriptsToSync` array. Insert it adjacent to `'validate-memory-schema.js'` (the related script). The updated list should read:

```js
const scriptsToSync = [
  'memory-cli.js',
  'memory-index.js',
  'bump-version.js',
  'validate-memory-schema.js',
  'vocab-sync.js',
  'mcp-memory-server.js',
  // ...
];
```

### T8 — Update `memory-schema.instructions.md`

**Purpose:** Add explicit, actionable guidance for agents and developers on how to maintain the controlled vocabulary.

**File:** `.agents/instructions/memory-schema.instructions.md` — append new section after line 75 (end of current content)

**New section to add:**

```markdown
## Maintaining the Vocabulary

When adding a new tag to a memory-bank file's frontmatter:

1. **Check if it already exists** in `memory-bank/.vocabulary.json`:
   - Search `tags.*` groups (all values across `agent_roles`, `workflow`, `memory_ops`, `topic`)
   - Search `entity_patterns` keys (component/tool names like `npm`, `vitest`, `playwright`)
2. **If it's a tool, framework, or component:** add it to `entity_patterns` as a new key with at least one regex pattern.
3. **If it's a concept or topic:** add it to the appropriate `tags.*` group:
   - `topic` — general concepts, technologies, domains (default catch-all)
   - `workflow` — processes, pipelines, ceremonies
   - `memory_ops` — memory-bank operations
   - `agent_roles` — agent role identifiers
4. **Tag format rules:**
   - Lowercase only
   - Kebab-case (hyphens for spaces, no underscores)
   - Maximum 5 tags per file
   - No whitespace-only or empty tags
5. **Rationale:** Add a one-line comment in the JSON explaining what the tag represents, or document it in the entity_patterns description.

The pre-commit hook (`vocab-sync.js`) auto-appends genuinely new tags to the `topic` group as a safety net, but manual categorization is preferred for accuracy.
```

### T9 — Update `reviewer.agent.md`

**Purpose:** Add a memory-bank vocabulary hygiene checklist item to the reviewer's responsibilities so that code reviews catch unknown/missing vocabulary entries.

**File:** `.opencode/agents/reviewer.agent.md` — add to the Guidelines section or after the existing checklist patterns (after line 46)

**New checklist item to add:**

Add a new bullet under the Guidelines list (after the existing bullets at line 38):

```markdown
- **Memory-bank hygiene**: In any diff touching `memory-bank/**/*.md` frontmatter tags, verify no tags are unknown to `memory-bank/.vocabulary.json` (check BOTH `tags.*` groups and `entity_patterns` keys). If unknown tags are found, flag them and recommend either: (a) add to the appropriate `tags.*` group (default: `topic`) with a one-line rationale, or (b) add to `entity_patterns` if the tag is a tool/component name. Report any unaddressed unknown tags as 🔵 minor findings.
```

---

## Phase 2 — Tests & Validation (Batch B — depends on A)

These tasks depend on Batch A files being complete, but touch different files from each other — they can run in parallel.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T2 | Create `scripts/vocab-sync.test.js` — unit tests for vocab-sync.js | `scripts/vocab-sync.test.js` (NEW) | B | T1 | 2026-08-03 |
| T7 | Update `scripts/setup/hooks.test.js` expectations for new pre-commit content | `scripts/setup/hooks.test.js` | B | T4 | 2026-08-03 |
| T10 | Create `scripts/validate-memory-schema.test.js` — unit tests for the entity_patterns fix | `scripts/validate-memory-schema.test.js` (NEW) | B | T3 | 2026-08-03 |

### T2 — Create `scripts/vocab-sync.test.js`

**Purpose:** Comprehensive unit test coverage for `vocab-sync.js`.

**File:** `scripts/vocab-sync.test.js` (new)

**Test framework:** Vitest (matches project convention — `vitest.config.ts` includes `scripts/**/*.test.{js,ts}`)

**Test fixture approach:** Use real temp directories via `mkdtempSync` (same pattern as `hooks.test.js`). Create a minimal git repo in the temp dir with `git init`, then stage files via `git add` to exercise the actual `git diff --cached` flow. OR use mocks (`vi.mock` for `child_process.execSync` and `fs`) for unit-level isolation.

**Recommended approach:** Use fs mocks for unit-level isolation (matches `index.test.js` and `prepare.test.js` patterns), with one integration test using a real temp dir + git init. This keeps tests fast while still validating the git integration path.

**Covered scenarios (≥9):**

| Test | Scenario | Expected Behavior |
|------|----------|-------------------|
| TEST-01 | New tag not in any `tags.*` group or `entity_patterns` | Appended to `topic`, `git add` called, exit 0 |
| TEST-02 | Tag already in `tags.workflow` | Not appended (no-op), exit 0 |
| TEST-03 | Tag is an `entity_patterns` key (e.g., `npm`) | Not appended (entity_patterns-aware skip), exit 0 |
| TEST-04 | Tag with spaces and mixed case (e.g., `"My Tag"`) | Normalized to `my-tag` (lowercase kebab-case), appended |
| TEST-05 | Tag with underscores (e.g., `"my_tag"`) | Normalized to `my-tag`, appended |
| TEST-06 | Whitespace-only tag (`"   "`) | Dropped (not appended), exit 0 |
| TEST-07 | Empty string tag (`""`) | Dropped (not appended), exit 0 |
| TEST-08 | Duplicate tag already in staged file | Deduplicated — only one entry added to `topic` |
| TEST-09 | Multiple new tags across multiple staged files | All appended, sorted alphabetically |
| TEST-10 | No new tags (all known) | No-op, no `git add` called, exit 0 |
| TEST-11 | Same tag run twice (idempotency) | Second run is no-op (tag already in `topic`) |
| TEST-12 | No `.vocabulary.json` exists | Graceful exit 0 with warning |
| TEST-13 | No staged memory-bank files | Silent exit 0 |
| TEST-14 | Unhandled error (e.g., write failure) | Exit 1 with error message on stderr |

### T7 — Update `scripts/setup/hooks.test.js`

**Purpose:** Update test expectations to match the new pre-commit hook content (now includes `vocab-sync.js` line).

**File:** `scripts/setup/hooks.test.js`

**Impact analysis:** The test file uses `expectedContent(hookName)` (line 77) which returns `TEMPLATE_HOOKS[hookName].content`. Since T4 changes `TEMPLATE_HOOKS['pre-commit'].content`, all tests that compare written hook content against `expectedContent()` will automatically use the updated template content — NO explicit test changes needed for the content comparison.

**However**, the following tests may need review:
- **Test §1 (Case A)**: Verifies each hook file's content matches `expectedContent()`. The updated pre-commit template will now include `vocab-sync.js` — this test PASSES automatically (it uses `expectedContent()`).
- **Test §2 (Case B)**: Same — PASSES automatically.
- **Test §3 (Case C)**: Same — PASSES automatically.
- **Test §4 (Case D)**: Checks `.bak` file preserves original then new content matches — PASSES automatically.
- **Test §5 (Case E)**: Merges content — the merge will include `vocab-sync.js` in the appended template. PASSES automatically.
- **Test §11 (flags.force)**: Same — PASSES automatically.

**Verdict:** No test assertions need manual changes. The `expectedContent()` helper dynamically returns the template content, so all 16 tests automatically pass with the updated template.

**Validation step:** Run `npx vitest run scripts/setup/hooks.test.js` after T4 to confirm 16/16 pass.

**Verification result (2026-08-03):** ✅ CONFIRMED — no test assertions needed manual changes. Ran `npx vitest run scripts/setup/` → **104/104 passed across 6 files** (hooks.test.js 16/16). The `expectedContent()` helper (line 77-79) returns `TEMPLATE_HOOKS[hookName].content` directly, so all content comparisons auto-derive from the updated template. Grep confirmed no hardcoded `bump-version`/`validate-memory-schema`/`vocab-sync` strings exist in any `scripts/setup/*.test.js` file. Installed-hook idempotency (marker matching) unaffected: `discover.js` (lines 111-112) detects managed hooks by comparing only the FIRST line against `HOOK_MARKER`; the new template content still starts with `# Managed by @abarcenas/ai-workflow-template setup` (verified via node introspection), so Case C idempotent overwrite detection still works with the added `vocab-sync.js` line. No files modified — T7 was verify-only.

### T10 — Create `scripts/validate-memory-schema.test.js`

**Purpose:** Add unit test coverage for the validator, specifically the entity_patterns fix.

**File:** `scripts/validate-memory-schema.test.js` (new)

**Test framework:** Vitest

**Covered scenarios (≥5):**

| Test | Scenario | Expected Behavior |
|------|----------|-------------------|
| TEST-01 | Tag is an `entity_patterns` key (e.g., `npm`) | No "Unknown tags" warning |
| TEST-02 | Tag is in `tags.topic` (e.g., `mcp`) | No "Unknown tags" warning |
| TEST-03 | Tag is truly unknown (e.g., `some-random-tag`) | "Unknown tags" warning issued |
| TEST-04 | Mixed: some entity_patterns keys + some truly unknown | Warning only for truly unknown |
| TEST-05 | Empty vocab (no entity_patterns) | Does not crash — graceful handling |

**Test approach:** Mock `execSync` (for `git diff --cached`) and `readFileSync` (for file content and vocab). Test the `validateFile()` function by importing it if exported, or test `main()` with controlled mocks.

**Note:** The current `validate-memory-schema.js` does not export `validateFile` or `main`. To enable testing without spawning a child process, either:
- **Option A**: Export `validateFile` and `main` from the script (add `export { validateFile, main }`), guarded so direct execution still works.
- **Option B**: Mock `execSync` and `readFileSync` at the module level and test via the exit code of `main()`.

**Recommended:** Option A — export `validateFile` with an `isDirectRun` guard pattern (matching the knowledgebase MCP server pattern). This is the cleanest approach and follows existing project convention.

**Changes to `validate-memory-schema.js` (additional, part of T3):**
- Add `export { validateFile, main }` at the bottom of the file
- Guard `main()` direct-run with `isDirectRun` check (so importing doesn't call `process.exit()`):
  ```js
  const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  if (isDirectRun) main();
  ```

**Verification (T10 — 2026-08-03, ✅ DONE):** Created `scripts/validate-memory-schema.test.js` (15 tests, all passing) and added the testability seam to `validate-memory-schema.js` per Option A (export `validateFile` + `main`, `isDirectRun` guard matching `scripts/vocab-sync.js` / `scripts/mcp-knowledgebase-server.js` convention — added `fileURLToPath` import from `node:url`). All 5 plan scenarios covered (TEST-01 entity_patterns key `npm` no-warn; TEST-02 `tags.topic` member `mcp` no-warn; TEST-03 genuinely unknown tag warns; TEST-04 mixed warns only for unknown; TEST-05 no-`entity_patterns` vocab + empty `{}` graceful, no crash) plus main() exit-code contract tests (warnings → exit 0, no staged files → exit 0, validation errors → exit 1) and `validateFile` error-branch tests. Approach: hermetic module-level mocks of `node:fs`/`node:child_process` (same pattern as `mcp-knowledgebase-server.test.js`) — `validateFile` invoked directly with parsed vocab fixtures. **Verification:** `npx vitest run scripts/validate-memory-schema.test.js` → 15/15 ✅; full suite `npx vitest run` → **200/200 across 11 files, 0 failures** ✅; `node --check` ✅; direct CLI `node scripts/validate-memory-schema.js` with no staged memory files → exit 0 ✅; temp-git-repo e2e — staged file with `tags: [npm, mcp, some-random-tag]` → warns ONLY for `some-random-tag`, exit 0 ✅; import smoke test — module imports with `main`/`validateFile` exports, main NOT auto-run ✅.

## Alternatives

| ID | Alternative | Rationale for rejection |
|----|-------------|------------------------|
| ALT-01 | Extract shared frontmatter parsing into `scripts/lib/frontmatter.js` | Rejected per CON-01 — a ~20-line function duplicated across 3 scripts is simpler to maintain than a shared module that would need to be tracked in `sync.js`'s `scriptsToSync`, tested independently, and version-synced. |
| ALT-02 | Scan ALL memory-bank files (not just staged) | Rejected — pre-commit hooks only care about what's being committed. Scanning all files would produce noisy results (tags from unrelated files), and could trigger unnecessary vocab writes. |
| ALT-03 | Auto-detect the correct `tags.*` group for new tags | Rejected as too heuristic-prone — accurately categorizing a tag as `workflow` vs. `topic` vs. `memory_ops` requires semantic understanding. Defaulting to `topic` (the catch-all) with a recommendation to manually recategorize is safer and more predictable. |
| ALT-04 | Have `vocab-sync.js` import from `validate-memory-schema.js` | Rejected — the validator does NOT export its helper functions; adding exports would couple the scripts. Self-contained duplication is simpler per CON-01. |
| ALT-05 | Add `vocab-sync.js` AFTER `validate-memory-schema.js` in the hook | Rejected — if vocab-sync runs after the validator, the first commit with a new tag would still warn. Running vocab-sync first eliminates the false positive. |

## Dependencies

| ID | Type | Description |
|----|------|-------------|
| DEP-01 | External | `git` CLI must be available (already required by existing pre-commit hooks and validator) |
| DEP-02 | Internal | `scripts/vocab-sync.js` depends on `memory-bank/.vocabulary.json` existing (gracefully handles missing file) |
| DEP-03 | Internal | `vocab-sync.js` must be in `sync.js`'s `scriptsToSync` before consumer projects receive it |
| DEP-04 | Internal | Setup tool's `TEMPLATE_HOOKS['pre-commit'].content` must be updated before consumer projects get the hook line |
| DEP-05 | Test | `vocab-sync.test.js` (T2) needs `vocab-sync.js` (T1) API to be stable |
| DEP-06 | Test | `hooks.test.js` (T7) content expectations automatically update with T4 (no manual changes needed, but T4 must run first for validation) |
| DEP-07 | Test | `validate-memory-schema.test.js` (T10) depends on T3's export of `validateFile` |

## Files

| ID | Path | Action | Batch |
|----|------|--------|-------|
| FILE-01 | `scripts/vocab-sync.js` | CREATE | A |
| FILE-02 | `scripts/vocab-sync.test.js` | CREATE | B |
| FILE-03 | `scripts/validate-memory-schema.js` | MODIFY | A |
| FILE-04 | `scripts/validate-memory-schema.test.js` | CREATE | B |
| FILE-05 | `scripts/setup/constants.js` | MODIFY | A |
| FILE-06 | `.husky/pre-commit` | MODIFY | A |
| FILE-07 | `scripts/sync.js` | MODIFY | A |
| FILE-08 | `.agents/instructions/memory-schema.instructions.md` | MODIFY | A |
| FILE-09 | `.opencode/agents/reviewer.agent.md` | MODIFY | A |
| FILE-10 | `scripts/setup/hooks.test.js` | MODIFY (verify-only) | B |

**Files NOT modified:**
- `scripts/normalize-memory.js` — its `getAllTags()` + `suggestTags()` correctly use only `tags.*` groups for content-based tag suggestions; `entity_patterns` keys are entity names (not tag strings), so they wouldn't appear in content-based matching. No change needed.
- `package.json` — `scripts/` is already in `files`, `vocab-sync.js` is auto-included. No npm script changes requested.
- `memory-bank/.vocabulary.json` — updated by `vocab-sync.js` at runtime, not by this plan's implementation tasks.

## Testing

| ID | Type | Description | Batch |
|----|------|-------------|-------|
| TEST-01 | Unit | `vocab-sync.test.js` — 14 scenarios covering new tags, dedupe, normalization, entity_patterns skip, no-op, staging, error handling (see T2) | B |
| TEST-02 | Integration | `hooks.test.js` — verify 16/16 pass after T4 content change | B |
| TEST-03 | Unit | `validate-memory-schema.test.js` — 5 scenarios for entity_patterns fix (see T10) | B |
| TEST-04 | Integration | Full vitest suite: `npx vitest run` — all existing tests must pass | Post B |
| TEST-05 | Manual | Verify pre-commit in this repo: stage a memory-bank file with a new tag, commit — vocab should auto-update, validator should not warn about entity_patterns keys | Post B |
| TEST-06 | Manual | Consumer smoke test: create temp consumer project with `npx ai-workflow-setup`, stage a memory-bank file with a new tag, verify `vocab-sync.js` runs and vocab updates | Post B |
| TEST-07 | Manual | Coverage check: `npx vitest run --coverage` — changed/added files (vocab-sync.js, validate-memory-schema.js) should meet 90% threshold | Post B |

## Risks & Assumptions

| ID | Type | Description | Mitigation |
|----|------|-------------|------------|
| RISK-01 | Technical | `git add` inside a pre-commit hook could fail if `.vocabulary.json` has merge conflicts or is locked | `vocab-sync.js` wraps the `git add` in try/catch — failure logs a warning, exits 0 (never blocks commit) |
| RISK-02 | Technical | Consumer projects running old versions of the template won't have `vocab-sync.js` | Acceptable — the validator's warnings still work, just not auto-fixed. Consumers update by running `npm update @abarcenas/ai-workflow-template` then `npx ai-workflow-setup`. |
| RISK-03 | Technical | `vocab-sync.js` writes to `.vocabulary.json` while `validate-memory-schema.js` is about to read it (same hook) | Mitigated by T4 ordering: `vocab-sync.js` runs FIRST, then `validate-memory-schema.js` reads the updated file. File writes are synchronous — no race condition. |
| ASSUMPTION-01 | Process | `memory-bank/.vocabulary.json` is always valid JSON | True for this repo (it's been maintained). For consumers, `vocab-sync.js` gracefully handles missing/malformed vocab by exiting 0. |
| ASSUMPTION-02 | Process | Tags in frontmatter are comma-separated inside brackets (e.g., `[tag1, tag2]`) | Matches the existing schema documented in `memory-schema.instructions.md` and parsed correctly by `parseFrontmatter()`. |
| ASSUMPTION-03 | Process | `entity_patterns` keys are stable identifiers that can serve as tag synonyms | True for this project — keys like `npm`, `vitest`, `playwright` are already valid tag names. If a future entity_patterns key is not a valid tag name, it would still be safe (just never matched as a frontmatter tag). |

## Related Specifications

- `memory-bank/.vocabulary.json` — controlled vocabulary definition
- `.agents/instructions/memory-schema.instructions.md` — frontmatter schema documentation
- `.opencode/agents/reviewer.agent.md` — code review specialist definition
- `scripts/validate-memory-schema.js` — pre-commit validator (modified by this plan)
- `scripts/setup/constants.js` — setup tool hook templates (modified by this plan)
- `scripts/sync.js` — consumer sync script (modified by this plan)
- `.husky/pre-commit` — git hook (modified by this plan)
- `docs/.orchestrator-log.md` — Pipeline 5 record (this plan's context)
