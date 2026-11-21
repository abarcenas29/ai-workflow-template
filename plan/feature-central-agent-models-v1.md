---
goal: "Introduce a single managed, deployable model map for every agent via .opencode/opencode.json, mirrored into opencode.mcp.example.json, documented, and covered by vitest"
version: 1
date_created: 2026-11-17
status: Planned
tags: [feature, opencode, config, sync, agents, models, vitest]
---

# Central Agent Models — Single Managed Model Map

## Introduction

Status: **Planned**

Today no agent declares a model, and OpenCode has no `extends`/`include` mechanism for arbitrary JSON files — a standalone `.opencode/agents-models.json` would be inert. The design therefore uses the one carrier OpenCode already auto-discovers and this repo's sync already ships: `.opencode/opencode.json`. It is synced through the `__opencode__` channel, and OpenCode merges `.opencode` config **over** the project-root `opencode.json`, so a consumer's own root settings stay theirs while the managed model map always wins on `agents.<id>.model`.

This plan adds an `agents` map to that file assigning `model: "deepseek/deepseek-flash"` to every agent ID (15 IDs: 12 top-level agent files plus the three `orchestrator/*` IDs), mirrors the map into `opencode.mcp.example.json` so fresh consumers who scaffold `opencode.json` also get models, documents the change in `.agents/config/README.md` and `README.md`, and adds vitest coverage that the map reaches consumers via the `__opencode__` channel while the project-owned root `opencode.json` is never overwritten.

Scope: config data, example mirror, docs, tests, plus one sync-engine amendment. The `__opencode__` copy pass treats `opencode.json` as project-owned by channel-agnostic over-match, so `.opencode/opencode.json` was being skipped entirely; `scripts/sync.js` gained a `managedOpenCodePaths` exemption in that pass so the managed map actually ships. Pruning stays channel-scoped to `__opencode__` only, and the root `opencode.json` stays project-owned.

### Requirements & Constraints

| ID | Type | Statement |
|----|------|-----------|
| REQ-01 | Requirement | `.opencode/opencode.json` contains an `agents` map with `model: "deepseek/deepseek-flash"` for all 15 agent IDs, keeping `"$schema": "https://opencode.ai/config.json"`. |
| REQ-02 | Requirement | `opencode.mcp.example.json` carries the identical `agents` map so a scaffolded root `opencode.json` also has models. |
| REQ-03 | Requirement | A short doc section states where the map lives, how to change a model in one place, and the precedence between root `opencode.json` and `.opencode/opencode.json`. |
| REQ-04 | Requirement | vitest asserts a fresh consumer receives `.opencode/opencode.json` with the `agents` model map via `__opencode__`, and that the project-owned root `opencode.json` is never overwritten by it. |
| CON-01 | Constraint | Root `opencode.json` stays in `projectOwnedPaths` and is never overwritten. `scripts/sync.js` changes in exactly one place: a `managedOpenCodePaths` exemption scoped to the `__opencode__` channel, for both the copy pass and `resolvePruneEntry`. |
| CON-02 | Constraint | No `extends`/`include`/manifest-reader mechanism is invented; `.opencode/opencode.json` is the sole carrier. |
| CON-03 | Constraint | Agent IDs are filename stems relative to `.opencode/agents/` — `orchestrator/orchestrator`, `orchestrator/feature-pipeline`, `orchestrator/tdd-orchestrator` keep their slash. |
| SEC-01 | Constraint | No new secret or endpoint is introduced; the map is plain model identifiers. |

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2, T3 | Yes | — |
| B | T4, T5 | Yes | T1, T2 |
| C | T6 | No (single) | T1, T2, T3, T4, T5 |

## Phase 1 — Author the Model Map and Mirror It (Batch A — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Replace the body of `.opencode/opencode.json` (currently only `{"$schema": "https://opencode.ai/config.json"}`, 3 lines) with a two-key object: keep `$schema`, add a top-level `agents` object. Each of the 15 keys maps to `{ "model": "deepseek/deepseek-flash" }`: `architect`, `coder`, `deployer`, `designer`, `e2e-tester`, `implementer`, `orchestrator/feature-pipeline`, `orchestrator/orchestrator`, `orchestrator/tdd-orchestrator`, `planner`, `researcher`, `reviewer`, `scope`, `tracker`, `unit-tester`. Two-space indent, trailing newline, matching the formatting style of `opencode.mcp.example.json`. **Validation:** `node -e "const c=require('./.opencode/opencode.json'); const n=Object.keys(c.agents); if(n.length!==15) throw new Error(n.length); for (const [k,v] of Object.entries(c.agents)) if (v.model!=='deepseek/deepseek-flash') throw new Error(k)"` exits 0; `git diff` touches only this file. | `.opencode/opencode.json` | A | — | |
| T2 | Add the same `agents` object to `opencode.mcp.example.json` (repo root) as a top-level key, identical keys and values to T1 — byte-equal JSON shape. Place it adjacent to `"instructions"` near the top of the object; preserve all existing `mcp`, `plugins`, and `permission` keys unchanged. **Validation:** `node -e "const a=require('./.opencode/opencode.json').agents, b=require('./opencode.mcp.example.json').agents; if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error('mismatch')"` exits 0; `npm run test:unit` still passes. | `opencode.mcp.example.json` | A | — | |
| T3 | Add a `## Agent models` section to `.agents/config/README.md` (this file already documents `.opencode/agents/`, config discovery, and quality gates — the natural home). Content: the map lives in `.opencode/opencode.json` under `agents`; change a model there once and every sync carries it; OpenCode merges discovered `.opencode` config **over** project-root `opencode.json`, so a consumer keeps root `opencode.json` for local settings (MCP, permissions) while the managed map controls models; `opencode.mcp.example.json` carries the same map for fresh scaffolds; an existing consumer's root `opencode.json` is never rewritten. 8–14 lines, matching the file's existing heading and paragraph style (see `## Quality gates` and `## Step report`). **Validation:** section present; `npx prettier --check .agents/config/README.md` passes. | `.agents/config/README.md` | A | — | |

## Phase 2 — Consumer-Facing Docs and Tests (Batch B — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T4 | In `README.md`, (a) add `.opencode/opencode.json` to the `## Core Structure` tree at line ~130 with the comment `# Managed agent model map (synced; overrides root opencode.json)`, and (b) add one bullet under the `### Agents` table at line ~166 (after the table, before `### How to Use`) explaining that per-agent models are set in `.opencode/opencode.json` and that changing a model there is the single edit point. Keep prose to 2–3 sentences and reuse wording from T3 for consistency. **Validation:** both additions present; `npx prettier --check README.md` passes; no existing bullet removed. | `README.md` | B | T1, T3 | |
| T5 | Add vitest coverage in `scripts/sync-unit.test.js`. Extend the `OPENCODE_FILES` fixture (lines ~652–659) with `'opencode.json': '{\n  "agents": { "coder": { "model": "deepseek/deepseek-flash" } }\n}\n'` and add a new `it` inside `describe('runSync copy passes')` (after the `never adopts a package-shipped opencode.json` case at line ~902): assert (i) the consumer file `.opencode/opencode.json` exists and its parsed `agents` object carries the sentinel model value, (ii) `manifest.files['__opencode__/opencode.json']` equals its sha256, and (iii) the consumer's root `opencode.json` byte-equals `MCP_EXAMPLE` (the scaffold), proving the managed map never overwrote it. Also add a repo-integrity `describe('central agent models')` block that reads the two real repo files (`.opencode/opencode.json`, `opencode.mcp.example.json`) relative to the test file's `import.meta.dirname` parent root: assert both parse, both `agents` objects are deep-equal, every value is `{ model: 'deepseek/deepseek-flash' }`, and — using `readdirSync` over `.opencode/agents/` plus a one-level recursion into `orchestrator/` — every `*.md` stem appears as a key, i.e. set equality between discovered agent IDs and `Object.keys(agents)`. **Validation:** `npm run test:unit` green; temporarily deleting one key from `.opencode/opencode.json` makes the new integrity test fail (mutation check), then revert. | `scripts/sync-unit.test.js` | B | T1, T2 | |

## Phase 3 — Verification (sequential, single task)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T6 | Run the full gate set: `npm run test:unit`, `npx prettier --check .opencode/opencode.json opencode.mcp.example.json .agents/config/README.md README.md scripts/sync-unit.test.js`, and a `--dry-run` sync (`node scripts/sync.js --dry-run --verbose`) confirming `.opencode/opencode.json` is reported in the `__opencode__` channel. Confirm `scripts/sync.js` is unmodified (`git diff --stat scripts/sync.js` empty) — proving CON-01 holds without a code change. Record results in `memory-bank/activeContext.md` and `memory-bank/progress.md`. **Validation:** all commands exit 0; diff stat shows exactly the five planned files changed. | — | — | T1, T2, T3, T4, T5 | |

## Alternatives

| ID | Alternative | Rationale for rejection |
|----|-------------|------------------------|
| ALT-01 | Per-agent `model:` in each `.opencode/agents/*.md` front matter | Rejected by user intent — 15 edit points, not centralized, and does not travel through a single managed file. |
| ALT-02 | Standalone `.opencode/agents-models.json` read via an invented include mechanism | OpenCode V2 has no `extends`/`include`; the file would be inert (CON-02). |
| ALT-03 | Add `agents` only to root `opencode.json` | Root file is project-owned and never rewritten, so existing consumers would never receive the map. |

## Dependencies

| ID | Dependency |
|----|------------|
| DEP-01 | OpenCode V2 `agents.<id>.model` config key and `.opencode`-over-root precedence (verified fact in digest). |
| DEP-02 | `scripts/sync.js` `__opencode__` copy pass already carries `.opencode/opencode.json`; no code change required. |
| DEP-03 | vitest via `npm run test:unit`; existing helpers `createPackage`, `createTempDir`, `sha256`, `readFileSync` in `scripts/sync-unit.test.js`. |

## Files

| ID | File | Change |
|----|------|--------|
| FILE-01 | `.opencode/opencode.json` | Add the 15-entry `agents` model map; keep `$schema`. |
| FILE-02 | `opencode.mcp.example.json` | Mirror the same `agents` map. |
| FILE-03 | `.agents/config/README.md` | New `## Agent models` section. |
| FILE-04 | `README.md` | Core-structure tree entry plus one Agents bullet. |
| FILE-05 | `scripts/sync-unit.test.js` | Fixture entry, copy-pass assertion, repo-integrity block. |
| FILE-06 | `memory-bank/activeContext.md`, `memory-bank/progress.md` | Verification record (T6). |
| — | `scripts/sync.js` | **Unchanged.** |

## Testing

| ID | Test |
|----|------|
| TEST-01 | T1 validation one-liner: 15 keys, all `deepseek/deepseek-flash`. |
| TEST-02 | T2 validation one-liner: `.opencode/opencode.json` `agents` deep-equals example `agents`. |
| TEST-03 | New `runSync` case: consumer `.opencode/opencode.json` carries the fixture model map and is manifest-tracked under `__opencode__/opencode.json`. |
| TEST-04 | New `runSync` case: consumer root `opencode.json` byte-equals the scaffolded `MCP_EXAMPLE`. |
| TEST-05 | New repo-integrity block: both files parse, maps deep-equal, all values are the default model. |
| TEST-06 | New repo-integrity block: set of agent IDs discovered under `.opencode/agents/` equals `Object.keys(agents)`; mutation check proves it discriminates. |
| TEST-07 | `npm run test:unit` green; prettier check green; `--dry-run` shows `.opencode/opencode.json`. |

## Risks & Assumptions

| ID | Type | Statement |
|----|------|-----------|
| RISK-01 | Risk | Adding a new agent file without a map entry silently leaves it on OpenCode's default. TEST-06 catches this only for the repo itself, not for downstream forks — the doc section (T3) must state the one-edit rule. |
| RISK-02 | Risk | `.opencode/opencode.json` is sync-managed, so a consumer editing it locally causes later syncs to skip it. Mitigation: the doc points consumers at the map as the managed file and at root `opencode.json` for local overrides (root wins today only for non-`agents` keys since `.opencode` takes precedence — state this plainly). |
| RISK-03 | Risk | Copy-pass counts in `scripts/sync-unit.test.js` (`copied`/`added` assertions at lines ~689–691) shift if the fixture gains a file. T5 must bump `copied` and `added` by 1 (9→10) after adding `opencode.json` to `OPENCODE_FILES`. |
| ASSUMPTION-01 | Assumption | `.opencode/opencode.json` is not in `openCodeExcluded`, so it syncs and is manifest-tracked (verified: excluded set is node_modules, package.json, package-lock.json, bun.lock, .gitignore). |
| ASSUMPTION-02 | Assumption | The default model for every agent is `deepseek/deepseek-flash`; variants (`#...`) are not required by this change. |

## Related Specifications

| ID | Document |
|----|----------|
| REL-01 | `AGENTS.md` — plan template, memory bank, agent workflow sections |
| REL-02 | `.agents/config/README.md` — existing config-discovery pattern |
| REL-03 | `.agents/instructions/nodejs-vitest.instructions.md` — test conventions |
| REL-04 | `.agents/instructions/markdown.instructions.md` — doc formatting |
