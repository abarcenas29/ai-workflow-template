---
goal: "Integrate Matt Pocock's scoping skills (grilling, prototype) into ai-workflow-template via a new orchestrator-driven scope agent, with pinned upstream distribution, backward-compatible sync, and no changes to existing consumers"
version: 1
date_created: 2026-10-23
status: Completed
tags: [feature, skills, integration, agent, grilling, prototype, sync, npm, backward-compat, scope]
---

# Feature: Matt Pocock Skills Integration + Scope Agent

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

## Introduction

**Status:** Completed — implemented 2026-10-24; all 17 tasks verified (331/331 tests passing).

This plan integrates a narrow subset of Matt Pocock's engineering skills into `ai-workflow-template`, and adds one new agent — `scope` — that uses them to narrow feature scope *before* implementation begins. The scope agent's terminal artifact is a spike document, which is exactly the input `researcher.agent.md` already demands, so the two agents compose without translation.

**Motivation:** The template already owns execution (orchestrator → 10 pipeline agents, TDD orchestrator with a 90% coverage gate, `plan/` conventions). What it lacks is a disciplined front door for underspecified requests: today the orchestrator either guesses at scope or jumps straight to `researcher`. Matt's `grilling` provides that discipline — rounds of questions, a recomputed frontier, and a written outcome.

**Deliberately out of scope.** Matt's execution-side skills (`tdd`, `implement`, `implement-spec`, `code-review`, `to-spec`, `to-tickets`, `triage`, `wayfinder`, `research`) duplicate the template's existing spine. `wayfinder` was explicitly considered and dropped: it is `disable-model-invocation` (human-only) and built for efforts larger than one session, whereas this feature targets narrowing a single feature. `ask-matt` is excluded because it is a router that advertises the excluded skills.

**Scope:**

- Vendor 5 skills into `.agents/skills/` (flat)
- Add `.agents/config/` (domain doc + discovery pointer)
- Add `.opencode/agents/scope.agent.md` and wire it into the orchestrator
- Extend `skills-lock.json` with upstream pin data; teach setup to install from upstream with a committed fallback
- Add opt-in `--prune` to sync
- Rewrite AGENTS.md documentation; keep `plan.agent.md` on disk untouched
- **Zero deletions, zero renames**

## Distribution Mechanism: How Changes Reach Consumers

| Asset | Distribution Channel |
|-------|---------------------|
| `.agents/skills/{grilling,grill-me,grill-with-docs,domain-modeling,prototype}/` | **`sync.js`** `.agents/**` recursive copy (lines ~95–130). `package.json` `files` already includes `.agents/` — no packaging change |
| `.agents/config/domain.md`, `.agents/config/README.md` | Same `.agents/**` channel — new directory is picked up automatically |
| `.opencode/agents/scope.agent.md` | **`sync.js`** `.opencode/**` copy (lines ~132–174). New files are copied automatically |
| `AGENTS.md` (new section) | **Root-file sync** (line ~82). **Skipped with a warning if the consumer edited it** — see CON-04 |
| `skills-lock.json` (pin fields) | **Root-file sync** (line ~82) |
| `bin/setup.js` (upstream fetch phase) | **npm tarball** — `bin/` is in `files`. Runs via `npx ai-workflow-setup` |
| `scripts/sync.js` (`--prune`) | **npm tarball** — `scripts/` is in `files`; executed as the consumer's sync step |
| `tests/spec-knowledge-retrieval.test.js` | Template repo only (tests are not distributed) |

Confirmed from `scripts/sync.js`: nothing is ever deleted, and each channel overwrites only files whose recorded hash still matches. Root files and `.opencode/` follow the same skip-if-modified rule as `.agents/`.

## Backward Compatibility Contract

Existing consumers of the published package must not break. Derived from the sync implementation, not assumed:

| ID | Invariant |
|----|-----------|
| CON-01 | **No deletions or renames** of any existing skill, agent, instruction, or prompt. The sync layer has no delete path, so a deletion leaves stale files behind *and* violates the compat promise |
| CON-02 | `plan.agent.md` stays on disk, byte-compatible. Only `AGENTS.md` documentation changes; the file itself is untouched |
| CON-03 | Additions only. New skills, new agent file, new `.agents/config/` directory — all reach consumers without touching files they own |
| CON-04 | A consumer who edited `AGENTS.md` will **never** receive the new section (root-file sync skips modified files). Mitigated by an install-time warning plus `.agents/config/README.md` as a discovery pointer |
| CON-05 | Prune must be **opt-in** and must never remove a path that still exists in the published package |
| CON-06 | Version bump is **minor**, not major |

## Requirements & Constraints

### Requirements

| ID | Type | Description |
|----|------|-------------|
| REQ-01 | Functional | Vendor 5 skills flat into `.agents/skills/<name>/`: `grilling`, `grill-me`, `grill-with-docs`, `domain-modeling` (+ `GLOSSARY-FORMAT.md`, `ADR-FORMAT.md`), `prototype` (+ `LOGIC.md`, `UI.md`) |
| REQ-02 | Functional | Add `.agents/config/domain.md` — instructs the `domain-modeling` skill where `GLOSSARY.md` and `docs/adr/` live, and to proceed silently when absent |
| REQ-03 | Functional | Add `.agents/config/README.md` — discovery pointer listing the available skills and the scope agent, so discovery survives an edited `AGENTS.md` |
| REQ-04 | Functional | Add `.opencode/agents/scope.agent.md` with permissions `read, search, edit, skill, question` — **no `execute`** |
| REQ-05 | Functional | Scope agent runs grilling in **rounds**: each delegation reads a draft, emits the current frontier as numbered questions with recommended answers, or terminates |
| REQ-06 | Functional | Between rounds the scope agent persists state in a single draft file; the orchestrator passes **only the path** |
| REQ-07 | Functional | Terminal output of the scope agent is a spike document at `docs/spike-<feature>.md`, matching the existing 6-doc convention and `researcher`'s required input |
| REQ-08 | Functional | Orchestrator registry gains a `scope` row; `Step 2` pipeline patterns gain a foggy-request pattern |
| REQ-09 | Functional | Orchestrator inserts `scope` **only when the request is underspecified** — no clear spec, vague success criteria, or an explicit request to narrow scope |
| REQ-10 | Functional | Scope step is **always interactive**. `autoConfirm: true` must not skip it and must not let the agent answer its own questions |
| REQ-11 | Functional | Prototypes are **never** built by the scope agent. It emits "prototype needed: *question*"; the orchestrator delegates to `coder` (logic branch) or `designer` (UI branch) |
| REQ-12 | Functional | `skills-lock.json` gains per-skill `ref` (tag, `v1.3.1`) and per-file `sha256` entries, preserving the existing `source`/`sourceType`/`computedHash` shape |
| REQ-13 | Functional | `bin/setup.js` gains a skills phase: fetch pinned upstream files, verify hashes, write to `.agents/skills/`; on any failure fall back to the copies shipped in the npm package |
| REQ-14 | Functional | Before overwriting a skill file that has local edits, log a warning naming the file, then overwrite (pinned content is authoritative) |
| REQ-15 | Functional | `scripts/sync.js` gains opt-in `--prune`: remove manifest-tracked paths absent from the package, only when the consumer file is unmodified |
| REQ-16 | Functional | Scope agent receives the same knowledge-retrieval protocol as the other pipeline agents |
| REQ-17 | Documentation | `AGENTS.md` gains a `## Agent skills` section; the Plan Mode section is rewritten to present `scope` first and `plan.agent.md` as an optional deep-planning mode |
| REQ-18 | Documentation | `README.md` updated: skill count, scope agent mention |
| REQ-19 | Testing | `tests/spec-knowledge-retrieval.test.js` parity assertion covers `scope.agent.md` |
| REQ-20 | Testing | `scripts/sync.test.js` covers `--prune`: unmodified-only removal, opt-in default off, package-owned only |

### Constraints

| ID | Constraint |
|----|-----------|
| CON-07 | No forking of upstream `SKILL.md` content. Vendored files must be byte-identical to `v1.3.1`; the pin is enforced by hash |
| CON-08 | No new runtime dependencies. Upstream install must use Node built-ins plus `fetch` (Node 18+) |
| CON-09 | `docs/` must **not** be added to `package.json` `files` or the sync root-file list — it contains this repo's spikes and tracker logs |
| CON-10 | Zero config for triage labels — no skill in the set applies labels |
| CON-11 | Zero issue-tracker config — `wayfinder` was dropped, so nothing in the set touches a tracker |
| CON-12 | Skill files are flat under `.agents/skills/<name>/`; upstream's category directories are flattened on install |

## Design Decisions

Settled by grilling; recorded here so the rationale survives without the transcript.

| # | Decision | Rationale |
|---|----------|-----------|
| D-01 | **Vocabulary layer only**, not a second execution spine | The template's orchestrator/TDD/plan pipeline stays authoritative. Overlapping skills would fight it: e.g. Matt's `implement` says "commit to the current branch" while the husky `post-commit` hook auto-bumps versions |
| D-02 | Skills live in `.agents/skills/` (flat) | Proven layout; the current install already produces it. No name collisions with the existing 29 |
| D-03 | Config lives in `.agents/config/`, not `docs/agents/` | `docs/` is neither synced nor packaged, so Matt's conventional path would never reach consumers. `.agents/**` syncs for free |
| D-04 | A separate `scope` agent; `plan.agent.md` demoted, not deleted | `plan.agent.md` is already excluded from the pipeline by an explicit test (ALT-01). Keeping the file satisfies CON-02. A separate agent keeps "narrow the problem" and "design the solution" as distinct seams |
| D-05 | Prototypes run in `coder` / `designer`, not `scope` | `prototype` has LOGIC and UI branches that map onto agents that already exist; this keeps `scope` free of `execute` |
| D-06 | Scope always interactive, regardless of `autoConfirm` | A grilling agent that answers its own questions is broken by definition (wayfinder's own text says so) |
| D-07 | Terminal artifact is a spike doc | `researcher.agent.md` stops without a spike document path. A shared artifact removes a handoff translation step |
| D-08 | Upstream pin + committed fallback (hybrid install) | Pinning to `v1.3.1` gives one version everywhere; the committed copies keep offline installs and CI working. Fetch failure degrades to the fallback instead of failing |
| D-09 | Fetched skills are overwritten on refresh, with a warning | A pin that can be silently edited is not a pin. Warning preserves information without weakening the guarantee |
| D-10 | Prune is opt-in and package-owned only | The sync layer has no delete path today; including one by default across 5 live consumer repos risks deleting user work. Fetched skills always exist in the package (they are the fallback), so they are never pruned |

## Requirements Traceability

| Decision | Requirements |
|----------|--------------|
| D-01 | REQ-01, scope exclusions |
| D-02 | REQ-01, CON-12 |
| D-03 | REQ-02, REQ-03, CON-09 |
| D-04 | REQ-04, REQ-17, CON-02 |
| D-05 | REQ-11 |
| D-06 | REQ-10 |
| D-07 | REQ-07 |
| D-08 | REQ-12, REQ-13, CON-07, CON-08 |
| D-09 | REQ-14 |
| D-10 | REQ-15, CON-05 |

## Parallel Execution Summary

| Phase | Tasks | Batch | Depends On |
|-------|-------|-------|------------|
| Phase 1 — Vendor skills and config | T1–T3 | A (parallel) | — |
| Phase 2 — Scope agent | T4–T5 | B (T5 depends on T4) | — |
| Phase 3 — Orchestrator wiring | T6 | C | T4 |
| Phase 4 — Lock and install | T7–T9 | D (T8, T9 depend on T7) | Phase 1 |
| Phase 5 — Sync prune | T10–T11 | E (T11 depends on T10) | — |
| Phase 6 — Documentation | T12–T14 | F (parallel) | Phases 1–5 |
| Phase 7 — Verification | T15–T17 | G (T16, T17 depend on T15) | All |

## Phase 1 — Vendor Skills and Config (Batch A — Parallel)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T1 | Copy 5 skill directories from `mattpocock/skills@v1.3.1` into `.agents/skills/`, preserving sub-files: `domain-modeling/{GLOSSARY-FORMAT.md,ADR-FORMAT.md}`, `prototype/{LOGIC.md,UI.md}`. Byte-identical (CON-07) | ✅ | 2026-10-23 |
| T2 | Create `.agents/config/domain.md` — single-context layout (`GLOSSARY.md` at root, ADRs in `docs/adr/`), proceed silently when absent, flag ADR conflicts explicitly | ✅ | 2026-10-23 |
| T3 | Create `.agents/config/README.md` — lists the 5 skills, one line each, plus a pointer to `scope.agent.md`; states that this file is the discovery path when `AGENTS.md` is locally edited | ✅ | 2026-10-23 |

## Phase 2 — Scope Agent (Batch B)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T4 | Create `.opencode/agents/scope.agent.md`. Frontmatter: `description`, `name`, `permission: {read, search, edit, skill, question}` — no `execute`, no `agent`. Body must specify: the round protocol (read draft → emit frontier → wait), the question format (numbered, recommended answer, "yes"-accepting wording), state persistence via draft path passed by the orchestrator, terminal spike-doc output at `docs/spike-<feature>.md`, the prototype hand-off message, and the rule that it never builds or runs code | ✅ | 2026-10-23 |
| T5 | Add the knowledge-retrieval step to `scope.agent.md`, matching the other 10 pipeline agents (REQ-16) — `depends on T4` | ✅ | 2026-10-23 |

## Phase 3 — Orchestrator Wiring (Batch C)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T6 | Edit `.opencode/agents/orchestrator/orchestrator.agent.md`: add the `scope` row to the Sub-Agent Registry (subagent_type `scope`, typical tools `read, search, edit, skill, question`, "when to deploy" = underspecified request); add a pipeline pattern to Step 2 (e.g. `Foggy feature: scope ⏸️ → researcher ⏸️ → implementer ⏸️ → …`); add the insertion rule (REQ-09) and the always-interactive rule that overrides `autoConfirm` (REQ-10) | ✅ | 2026-10-23 |

## Phase 4 — Lock and Install (Batch D)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T7 | Extend `skills-lock.json`: for each vendored skill add `ref: "v1.3.1"` and a `files` array of `{ path, sha256 }` covering every file in the skill directory. Keep existing `source`, `sourceType`, `computedHash` fields intact so the caveman entries are unaffected. Also records per-file `upstreamPath` (upstream categories are asymmetric — `skills/productivity/` for `grilling`/`grill-me`, `skills/engineering/` for the other three) so the install phase can build pinned raw URLs from the lock alone | ✅ | 2026-10-23 |
| T8 | Add the skills phase to `bin/setup.js`: read pinned entries, fetch each recorded file from a pinned raw URL, verify `sha256`, write into `.agents/skills/<name>/`. Warn (do not prompt) on local-edit overwrite (REQ-14). On any network/hash failure, fall back to the shipped copies and print one notice (REQ-13). `depends on T7` — **Deviation:** implemented in `scripts/setup/skills-phase.js` (phase module) + `scripts/setup/index.js` (Phase 6 wiring), not `bin/setup.js`, which is a 26-line shim that only imports `main()`. Test file `scripts/setup/skills-phase.test.js` added (not in the original task table; required by the `scripts/**` coverage threshold). | ✅ | 2026-10-23 |
| T9 | Ensure the fetch phase is skipped under `--skip-sync` and is a no-op when the consumer has no pinned entries; confirm it does not run when `CI` skips hooks. `depends on T7` — Gated by the existing `flags.skipSync` check in `scripts/setup/index.js`; **no new CI guard added** — CI already skips only hooks/husky-init (`isCI` in `hooks.js`/`husky-init.js`) while still running file-sync phases, and the skills phase follows the sync convention. | ✅ | 2026-10-23 |

## Phase 5 — Sync Prune (Batch E)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T10 | Add `--prune` to `scripts/sync.js`. For each manifest key: resolve the corresponding package path; if the package no longer ships it **and** the consumer file's hash matches the recorded hash, delete the consumer file and drop the entry. Never prune when hashes differ (locally modified). Off by default (CON-05) | ✅ | 2026-10-24 |
| T11 | Extend `scripts/sync.test.js`: default keeps files; `--prune` removes only unmodified, package-absent paths; modified files survive; paths still present in the package are never removed. `depends on T10` | ✅ | 2026-10-24 |

## Phase 6 — Documentation (Batch F — Parallel)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T12 | `AGENTS.md`: add `## Agent skills` with `### Skills` (5 entries), `### Scope agent`, and `### Domain docs` (pointer to `.agents/config/domain.md`). Rewrite the Plan Mode section: `scope` is the default front door for underspecified work; `plan.agent.md` remains available as an optional deep-planning mode (CON-02, REQ-17) — **Delivered:** new `## Agent skills` section between `## Available Prompts` and `## Available Agent Workflows` (3 subsections, 5-row skill table grounded in SKILL.md frontmatter, `disable-model-invocation` router note); `## Available Skills` reconciled by completing the inventory to all 34 installed skills (+8 bullets, 5 new + 3 pre-existing omissions) with a one-line pointer to `### Skills`; Plan Mode body rewritten (scope first, `plan.agent.md` optional deep planning, 9-step sequence kept); `## Core Workflow` step 2 now names `scope` first. `plan.agent.md` untouched | ✅ | 2026-10-24 |
| T13 | `README.md`: update both skill-count references (currently "29 specialized AI skills" at lines 55 and 87 → 34) and add the scope agent to the agent table / flow description (REQ-18). **Also performed the orphaned FILE-18 version bump** (`package.json` 1.45.0 → 1.46.0, minor only per CON-06; `package-lock.json` root version synced) | ✅ | 2026-10-24 |
| T14 | Update `.agents/instructions/memory-bank.instructions.md` "Plan Mode" section to mention the scope-first ordering — **Delivered:** 4-step scope-first ordering + task-tracking note added ahead of the existing mermaid diagram in `### Plan Mode` (lines 137–147): `scope` front door → spike → `researcher` → `implementer`/`architect`/`coder`; `plan.agent.md` kept as optional deep planning (demoted, not deprecated). Targeted edit (+11 lines), no heading changes | ✅ | 2026-10-24 |

## Phase 7 — Verification (Batch G)

| Task ID | Description | Completed | Date |
|---------|-------------|-----------|------|
| T15 | Update `tests/spec-knowledge-retrieval.test.js` so `scope.agent.md` is part of the parity assertion rather than the exclusion list; keep `plan.agent.md` excluded (REQ-19) — **Delivered:** added `scope.agent.md` to `EXPECTED_PIPELINE_AGENTS` between `reviewer.agent.md` and `tracker.agent.md` (alphabetical, matching the array's existing convention) and raised the TEST-06 length assertion `toHaveLength(10)` → `11` (comment "10 in-scope agents" → "11"); `plan.agent.md` still filtered out by name and still asserted absent — exclusion tightened, not weakened. No `scope.agent.md` wording change needed: it already satisfies TEST-01/TEST-02 via T5's `## Check Knowledge` section (`knowledge-retrieval`, `knowledgebase_search`, `learned-knowledge` all present) | ✅ | 2026-10-24 |
| T16 | Run `npx vitest run` — full suite green. `depends on T15` — **Delivered:** `npx vitest run` → **exit 0, 16 test files / 331 tests / 0 failures** (1.11s; no skipped/todo); `node scripts/validate-memory-schema.js` → exit 0; `npm run test:unit:coverage` → 16/331 pass, **per-file `scripts/setup/skills-phase.js` = 99.42% stmts / 97.34% branch / 100% funcs / 100% lines**. `TEST-09`'s "gate maintained" is recorded **honestly**: the repo-wide 90% threshold still fails at **50.69% stmts / 50.51% branch / 51.1% funcs / 51.18% lines** — a **pre-existing repo condition** (measured **48.05% at HEAD**, before this feature work; CI `pr-test.yml` runs `test:unit`, not coverage), **not a regression** from this feature. `vitest.config.ts` thresholds and exclusions deliberately unchanged; no test skipped, `.todo`ed, or weakened; no source file needed repair | ✅ | 2026-10-24 |
| T17 | Manual dry-run against a scratch consumer: `npm pack`, install in a temp dir, `npx ai-workflow-setup --dry-run`, then real sync. Verify: 5 skills + config appear; `plan.agent.md` untouched; scope agent present; edited `AGENTS.md` produces a warning; `--prune` leaves everything alone (nothing is stale yet). `depends on T15` — **Delivered:** scratch-consumer E2E under `/private/var/.../opencode/t17-verify` (repo untouched, tarball + scratch dir deleted after). **Step 2:** `npm pack` → **`abarcenas-ai-workflow-template-1.46.0.tgz`** (156 files; scoped package name, version **1.46.0** ✅). Tar listing has all **9** Matt skill files (grilling, grill-me, grill-with-docs, domain-modeling ×3, prototype ×3), `.agents/config/{domain.md,README.md}`, `.opencode/agents/{scope,plan}.agent.md`, `skills-lock.json`, `AGENTS.md`, `opencode.mcp.example.json`; **zero `docs/` entries and zero `tests/`/`plan/` entries** (CON-09). `opencode.json` is correctly absent — sync scaffolds it from `opencode.mcp.example.json`. **No `package.json` `files` change was needed.** **Steps 3–5:** consumer seeded with `package.json` (`scratch-consumer`), a locally edited `AGENTS.md` (LOCAL EDIT marker), no `.agents/`/`.opencode/`; dry-run (`--dry-run --skip-hooks --skip-prepare --skip-knowledgebase`) wrote nothing (tree unchanged) and reported `Would fetch 5 pinned skill(s) from upstream`. **Step 6–7 (real run):** 34 skills, **11** in-scope `*.agent.md` (+ `plan.agent.md` = 12 top-level, `orchestrator/` present), all 9 Matt files, both config files, `scope.agent.md`, `skills-lock.json`; `plan.agent.md` **byte-identical** to the packaged copy (CON-02); edited `AGENTS.md` unchanged. **DEFECT FOUND + FIXED (CON-04):** the first real run **swallowed the skip warning** — `scripts/setup/sync-phase.js` captured child stderr into `result.output` and never printed it in non-verbose mode, so `AGENTS.md` was correctly skipped but the consumer only saw "Sync phase completed". Fixed by also forwarding each stderr chunk to `process.stderr` (stdout remains capture-only); re-packed, fresh consumer, re-ran → `[ai-workflow-template] Skipped locally modified root file: AGENTS.md` now appears, file still unchanged. **Step 8:** `node …/scripts/sync.js --prune` → `Pruned 0 stale file(s); skipped 0 locally modified.`; 125-file sha256 snapshot identical before/after — nothing deleted, no file modified. **Step 9:** network outcome = **upstream fetch succeeded** (a fresh consumer reports `5 already up to date` because sync has just copied the vendored copies, so no fetch is required; after injecting drift into `grilling/SKILL.md` the phase fetched from GitHub and reported `Fetched 1 pinned skill(s) from upstream; 4 already up to date`); **9/9** pinned files then hash-matched `skills-lock.json`. Fallback also exercised with a throwing `fetchImpl`: exactly **one** `upstream fetch unavailable` notice, restore from shipped copies, no throw (REQ-13). **Step 10:** drift in `grilling/SKILL.md` → `Local edits in …/grilling/SKILL.md — overwriting with the pinned version`, pinned hash `10ff989e…` restored (REQ-14). **Verification:** `npx vitest run scripts/setup/` → **7 files / 142 tests / 0 failures**. **Cleanup:** tarball + scratch consumer removed; `git status` shows no `.tgz` and no new untracked scratch artifacts. ASSUMPTION-01 confirmed: no `.claude/` symlink layer created | ✅ | 2026-10-24 |

## Files

| ID | File | Change |
|----|------|--------|
| FILE-01 | `.agents/skills/grilling/` | New (SKILL.md) |
| FILE-02 | `.agents/skills/grill-me/` | New (SKILL.md) |
| FILE-03 | `.agents/skills/grill-with-docs/` | New (SKILL.md) |
| FILE-04 | `.agents/skills/domain-modeling/` | New (SKILL.md + GLOSSARY-FORMAT.md + ADR-FORMAT.md) |
| FILE-05 | `.agents/skills/prototype/` | New (SKILL.md + LOGIC.md + UI.md) |
| FILE-06 | `.agents/config/domain.md` | New |
| FILE-07 | `.agents/config/README.md` | New |
| FILE-08 | `.opencode/agents/scope.agent.md` | New |
| FILE-09 | `.opencode/agents/orchestrator/orchestrator.agent.md` | Edit (registry, pipeline pattern, insertion + interactivity rules) |
| FILE-10 | `skills-lock.json` | Edit (add `ref` + per-file hashes for 5 skills) |
| FILE-11 | `scripts/setup/skills-phase.js` + `scripts/setup/index.js` | New phase module (upstream fetch with shipped fallback) + Phase 6 wiring in the setup pipeline. Deviation from the original `bin/setup.js` target — that file stays a 26-line shim |
| FILE-12 | `scripts/sync.js` | Edit (`--prune`) |
| FILE-13 | `scripts/sync.test.js` | Edit (prune coverage) |
| FILE-14 | `AGENTS.md` | Edit (new section; Plan Mode rewrite) |
| FILE-15 | `README.md` | Edit (counts, scope agent) |
| FILE-16 | `.agents/instructions/memory-bank.instructions.md` | Edit (Plan Mode ordering) |
| FILE-17 | `tests/spec-knowledge-retrieval.test.js` | Edit (parity includes scope) |
| FILE-18 | `package.json` | Edit (minor version bump) — ✅ completed 2026-10-24: `1.45.0` → `1.46.0` (minor only, CON-06), with `package-lock.json` root `version` synced from stale `1.34.0`. Edited directly, no bump script (DEP-03) |
| FILE-19 | `scripts/setup/skills-phase.test.js` | New (unit + wiring tests for the pinned-skills phase; not in the original task table) |

**Explicitly unchanged:** `.opencode/agents/plan.agent.md`, every existing skill directory, `.agents/prompts/`, all of `docs/` distribution behavior.

## Testing

| ID | Test | Covers |
|----|------|--------|
| TEST-01 | Every vendored file's `sha256` matches its `skills-lock.json` entry | CON-07, REQ-12 |
| TEST-02 | `--prune` off by default leaves the tree unchanged | CON-05 |
| TEST-03 | `--prune` removes only unmodified, package-absent paths | REQ-15, D-10 |
| TEST-04 | `--prune` never removes a locally modified file | CON-05 |
| TEST-05 | `--prune` never removes a path still shipped in the package | D-10 |
| TEST-06 | Knowledge-retrieval parity includes `scope.agent.md`, excludes `plan.agent.md` | REQ-19 |
| TEST-07 | Upstream fetch failure falls back to shipped copies without throwing | REQ-13 |
| TEST-08 | Scope agent frontmatter has no `execute` permission | REQ-04, D-05 |
| TEST-09 | Full suite green; existing 90% coverage gate maintained | Regression guard (no new requirement) |

## Risks & Assumptions

| ID | Risk / Assumption | Mitigation |
|----|-------------------|------------|
| RISK-01 | Upstream `mattpocock/skills` reorganises paths at a future tag, breaking the pinned file list | The pin is a **tag**, not a branch; files are addressed by recorded path + hash. Bumping is a deliberate dev task, not an install-time surprise |
| RISK-02 | Fetching upstream at install adds a network dependency to `postinstall`, a class of failure already documented in `docs/spikes/npm-e404-consumption-investigation.md` | Committed fallback (D-08); fetch is best-effort and never fatal |
| RISK-03 | `autoConfirm: true` users expect fully automatic pipelines and will hit the interactive scope step | The step only appears when the request is underspecified (REQ-09); documentation states the exception |
| RISK-04 | A 12th agent increases the setup's surface, which is the complexity this feature was meant to reduce | Compensated by demoting `plan.agent.md` in docs; the file is not deleted so the net addition is one entry |
| RISK-05 | The scope agent could drift into building prototypes, blurring the seam | REQ-11 + TEST-08 (no `execute`) enforce the boundary mechanically |
| ASSUMPTION-01 | Consumers use opencode, so no `.claude/skills/` symlink layer is needed (the dev workspace has one; the template does not) | Verify during T17 |
| ASSUMPTION-02 | Node 18+ in consumers, so global `fetch` is available | `package.json` engines, or a `node:` https fallback if a consumer is older |
| ASSUMPTION-03 | Consumers may have edited `AGENTS.md`; they will get the warning rather than the content | Accepted per CON-04; `.agents/config/README.md` provides the backstop |

## Alternatives Considered

| ID | Alternative | Rejected Because |
|----|-------------|------------------|
| ALT-01 | Vendor all 28 skills (full coexist) | Two competing execution spines: Matt's `tdd` vs the TDD orchestrator, `implement` vs implementer+coder, conflicting commit/version-bump behavior |
| ALT-02 | Replace the orchestration spine with Matt's flow | Restructures all 5 consumers and discards the existing 90%-coverage TDD pipeline |
| ALT-03 | Integrate the skills *into* `researcher.agent.md` | Blocked by that agent's own constraints: `read/search/web` only, no code, no execute. Both `prototype` and `wayfinder` violate its contract; `grilling` needs a human |
| ALT-04 | Put config in `docs/agents/` (Matt's convention) | `docs/` is neither synced nor packaged, so it would never reach consumers (CON-09) |
| ALT-05 | Lock-tracked install with no vendored copy | Makes consumer installs network-dependent with no offline path |
| ALT-06 | Namespaced install at `.agents/skills/matt/<name>/` | Nested skill discovery is unproven in this setup; flat is the layout the current install already proves |
| ALT-07 | `wayfinder` as an orchestrator step | `disable-model-invocation: true` — only a human can start it. Enabling it would require forking the skill, violating CON-07 |
| ALT-08 | Delete `plan.agent.md` outright | Strands the file in every existing consumer (sync has no delete) and breaks spec tests that reference it |

## Dependencies

| ID | Dependency | Notes |
|----|------------|-------|
| DEP-01 | `mattpocock/skills@v1.3.1` (SHA `24fe0ef7737efae15c87225755e9f6f5965e4888`) | Tag + commit for the pin. Category paths: `skills/engineering/`, `skills/productivity/` |
| DEP-02 | Node 18+ (global `fetch`) | For the upstream install phase, if implemented with `fetch` rather than `https` |
| DEP-03 | Existing husky `post-commit` version bump | Batch commits may each trigger a bump; use `SKIP_BUMP` to settle the version once per PR |
| DEP-04 | Existing `sync.js` manifest semantics | Prune builds on the recorded-hash model; no schema change needed |

## Implementation Notes

- **Lock schema shape.** `skills-lock.json` currently records one `computedHash` per skill (its `SKILL.md`). Multi-file skills (`domain-modeling`, `prototype`) need per-file hashes, hence the `files: [{path, sha256}]` array. Existing caveman entries keep their current shape and are not migrated.
- **Why per-file fetch, not a tarball.** Node has no built-in tar reader, and CON-08 forbids new dependencies. Fetching each recorded file from a pinned raw URL is dependency-free, hash-verifiable per file, and only ~12 requests across the 5 skills.
- **Prune is inert at first.** With additions only, nothing is stale. It ships now because the compat rules make it safe to introduce, and it earns its keep the first time something genuinely retires.
- **`grill-me` is vendored but unused.** It is 294 bytes and stateless; with a repo present, `grill-with-docs` is strictly better. Kept because it was named explicitly.

## Related Specifications

- `plan/config-opencode-mcp-rename-v1.md` — prior example of root-file sync + packaging change; same distribution channel
- `docs/spikes/npm-e404-consumption-investigation.md` — install-time fragility that the fallback design (D-08) mitigates
- `plan/feature-vocab-sync-1.md` — reference for the compile-check + distribution-table conventions used here
- `tests/spec-knowledge-retrieval.test.js` — ALT-01 precedent for excluding `plan.agent.md` from parity assertions
