---
goal: "Close knowledge-vector underutilization gaps by adding standardized knowledge-retrieval protocol (memory-bank + learned-knowledge + knowledgebase_search with graceful failure) to all agent specs, orchestrator delegation templates, and knowledgebase instructions"
version: 1
date_created: 2026-08-03
status: Completed
tags: [feature, knowledgebase, agents, orchestrator, graceful-failure, docs]
---

# Feature: Close Knowledge-Vector Gaps with Graceful-Failure KB Access v1

## Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

### Problem

A researcher audit (Pipeline 6) determined the central PG knowledgebase (Layer 3, `knowledgebase_search`/`knowledgebase_index` MCP via `scripts/mcp-knowledgebase-server.js`) is **never referenced** by any agent spec or orchestrator delegation template — despite `.agents/instructions/knowledgebase.instructions.md` declaring it a "MANDATORY REQUIREMENT." The `learned-knowledge.instructions.md` file (17 sessions) is effectively write-only for most agents. Five agents (deployer, e2e-tester, researcher, reviewer, unit-tester) have **zero** knowledge-retrieval instructions despite holding `memory-bank/*` and `knowledgebase/*` permissions. Orchestrator knowledge injection is highly asymmetric — the main orchestrator injects only memory-bank (no learned-knowledge, no architecture-context, no knowledgebase), and TDD Phase 5 (reviewer) gets zero knowledge injection at all.

### Scope

This plan closes all gaps with **graceful failure** as the governing constraint. The PG knowledgebase is **mandatory to attempt** but **graceful to fail** — agents must explicitly report whether knowledgebase_search was executed or skipped due to unavailability. No pipeline step may fail due to knowledgebase unavailability.

The plan covers:
1. A new shared protocol file (single source of truth for the 3-layer retrieval + graceful-failure reporting)
2. All 10 pipeline agent specs (excluding `plan.agent.md` — see ALT-01)
3. All 3 orchestrator delegation templates (main, feature-pipeline, TDD)
4. `knowledgebase.instructions.md` — reconcile "MANDATORY" with graceful failure
5. Tracker — pre-append read of learned-knowledge before recording new sessions
6. Grep-based spec integrity verification tests

---

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1, T2 | Yes — 2 tasks | — |
| B | T3, T4, T5, T6, T7, T8, T9, T10, T11, T12 | Yes — 10 tasks | T1 |
| C | T13, T14, T15 | Yes — 3 tasks | T1 |
| D | T16, T17, T18 | Yes — 3 tasks | T3–T15 |

**Total: 18 tasks across 4 batches.** Batches B and C can be merged to run 13 tasks in parallel (all depend only on T1). Batch D is validation-only (read + grep, no file edits).

---

## 1. Requirements & Constraints

### Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| REQ-01 | Every pipeline agent spec MUST include a knowledge-retrieval step that covers memory-bank (Layer 1), learned-knowledge (Layer 2), and knowledgebase_search (Layer 3) with graceful failure | Researcher audit findings |
| REQ-02 | Every orchestrator delegation template (standard, parallel-coder, ALL TDD phases) MUST inject the same standardized knowledge-retrieval instruction | Orchestrator asymmetry findings |
| REQ-03 | `knowledgebase_search` calls MUST be wrapped in graceful failure: on error/unavailability, note "knowledgebase_search NOT executed (PG vector unavailable)" and continue; on success, note "knowledgebase_search executed — N results" | User requirement |
| REQ-04 | Every agent's final output summary MUST state whether the knowledgebase was accessed or skipped | User requirement |
| REQ-05 | `knowledgebase.instructions.md` language MUST be reconciled: "MANDATORY to attempt, graceful to fail" — not "MANDATORY to succeed" | Contradiction in current doc (line 11 vs lines 163-177) |
| REQ-06 | Tracker MUST read `.agents/instructions/learned-knowledge.instructions.md` (and optionally `knowledgebase_search`) BEFORE appending a new Session to avoid duplicate/contradictory entries | Learned knowledge from tracker sessions |
| REQ-07 | The shared knowledge-retrieval protocol MUST live in a single `.agents/instructions/knowledge-retrieval.instructions.md` file to prevent duplication drift across 14 files | Design decision (shared-snippet vs inline) |

### Constraints

| ID | Constraint |
|----|------------|
| CON-01 | The PG knowledgebase is an external service — it MUST NOT be a hard dependency (pipeline must not fail if unavailable) |
| CON-02 | All agent spec files (`*.agent.md`) are in `.opencode/agents/` — standard opencode agent format with YAML frontmatter |
| CON-03 | All orchestrator templates are in `.opencode/agents/orchestrator/` — same format |
| CON-04 | `plan.agent.md` is a standalone pre-pipeline agent with a different structure — out of scope (see ALT-01) |
| CON-05 | No production code changes — this is docs/spec wiring only |
| CON-06 | Agent specs must remain self-contained (the shared-file reference is a single-line pointer, not a complete delegation of the retrieval protocol) |

### Security Constraints

| ID | Constraint |
|----|------------|
| SEC-01 | The shared protocol file must NOT contain any credentials, connection strings, or environment-specific configuration |

---

## 2. Implementation Steps

### Phase 1 — Foundation: Shared Protocol + knowledgebase.instructions.md Reconciliation (Batch A — Parallel)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Create `.agents/instructions/knowledge-retrieval.instructions.md` — the shared 3-layer knowledge-retrieval protocol file with graceful-failure wrapping and explicit-report requirement (exact content specified in FILE-04) | `.agents/instructions/knowledge-retrieval.instructions.md` (NEW) | A | — | 2026-08-03 |
| T2 | Update `.agents/instructions/knowledgebase.instructions.md` — reconcile "MANDATORY REQUIREMENT — NOT BEST EFFORT" (line 11) with graceful degradation (lines 163-177). Change "MANDATORY" paragraph to "MANDATORY TO ATTEMPT, GRACEFUL TO FAIL." Add cross-reference to the new `knowledge-retrieval.instructions.md` protocol file. Update the "When you start a session" order (lines 218-221) to reference the shared protocol. | `.agents/instructions/knowledgebase.instructions.md` | A | — | 2026-08-03 |

**T2 specific changes to `knowledgebase.instructions.md`:**

- **Line 11**: Replace "**MANDATORY REQUIREMENT — NOT BEST EFFORT:** You MUST query the knowledgebase before planning any task…" with "**MANDATORY TO ATTEMPT, GRACEFUL TO FAIL:** You MUST attempt to query the knowledgebase before planning any task. If the knowledgebase is unavailable, explicitly note the skip and continue — never block or fail. See `.agents/instructions/knowledge-retrieval.instructions.md` for the full protocol including required explicit reporting."
- **Lines 218-221**: Replace the session-start order list with a reference: "Follow the protocol in `.agents/instructions/knowledge-retrieval.instructions.md` for the complete 3-layer retrieval order (memory-bank → learned-knowledge → knowledgebase_search → project files)."

---

### Phase 2 — Agent Specs: Add Knowledge-Retrieval Step (Batch B — Parallel, depends on T1)

All 10 agent spec edits are independent (disjoint files). Each task adds/modifies the "Approach" section to include the knowledge-retrieval protocol reference.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T3 | Update `architect.agent.md` — extend existing "Check Memory Bank" (step 3, line 28) to include knowledgebase_search. Add after the existing memory-bank line: "**Query Knowledgebase**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the knowledge-retrieval protocol. Call `knowledgebase_knowledgebase_search` with a task-relevant query wrapped in graceful failure. State the result in your final summary." | `.opencode/agents/architect.agent.md` | B | T1 | 2026-08-03 |
| T4 | Update `coder.agent.md` — extend existing "Check Memory Bank" (step 3, line 33) to include knowledgebase_search. Add: "**Query Knowledgebase**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the knowledge-retrieval protocol. Call `knowledgebase_knowledgebase_search` with a task-relevant query wrapped in graceful failure. State the result in your final summary." | `.opencode/agents/coder.agent.md` | B | T1 | 2026-08-03 |
| T5 | Update `deployer.agent.md` — add new "Check Knowledge" step (insert before existing "Implement/Configure" at line 31). The deployer currently has ZERO knowledge retrieval. Add step 3: "**Check Knowledge**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol. Use `memory_bank_memory_search`/`memory_bank_memory_get` for project context. Skim `.agents/instructions/learned-knowledge.instructions.md` for deploy/release patterns. Call `knowledgebase_knowledgebase_search` with a deployment-relevant query wrapped in graceful failure. State the result in your final summary." Renumber existing steps 3→4, 4→5. | `.opencode/agents/deployer.agent.md` | B | T1 | 2026-08-03 |
| T6 | Update `designer.agent.md` — extend existing "Check Memory Bank" (step 3, line 34) to include knowledgebase_search. Add after the existing memory-bank line: "**Query Knowledgebase**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the knowledge-retrieval protocol. Call `knowledgebase_knowledgebase_search` with a design/UI-relevant query wrapped in graceful failure. State the result in your final summary." Renumber steps 4→5, 5→6, 6→7. | `.opencode/agents/designer.agent.md` | B | T1 | 2026-08-03 |
| T7 | Update `e2e-tester.agent.md` — add new "Check Knowledge" step (insert before "Open Page" at line 29). The e2e-tester currently has ZERO knowledge retrieval. Add step 3: "**Check Knowledge**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol. Use `memory_bank_memory_search`/`memory_bank_memory_get` for project context. Skim `.agents/instructions/learned-knowledge.instructions.md` for browser/debugging patterns. Call `knowledgebase_knowledgebase_search` with a debugging/exploration-relevant query wrapped in graceful failure. State the result in your final summary." Renumber existing steps 3→4, 4→5, 5→6. | `.opencode/agents/e2e-tester.agent.md` | B | T1 | 2026-08-03 |
| T8 | Update `implementer.agent.md` — extend existing "Check Memory Bank" (step 3, line 30) to include knowledgebase_search. Add after the existing memory-bank line: "**Query Knowledgebase**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the knowledge-retrieval protocol. Call `knowledgebase_knowledgebase_search` with a planning-relevant query wrapped in graceful failure. State the result in your final summary." | `.opencode/agents/implementer.agent.md` | B | T1 | 2026-08-03 |
| T9 | Update `researcher.agent.md` — add new "Check Knowledge" step (insert at the start of the "Research Process" section, before step 0 "Investigation Planning" at line 77). The researcher currently has ZERO knowledge retrieval. Add step: "**0a. Check Knowledge**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol. Use `memory_bank_memory_search`/`memory_bank_memory_get` for project context. Skim `.agents/instructions/learned-knowledge.instructions.md` for relevant research patterns and ecosystem findings. Call `knowledgebase_knowledgebase_search` with queries relevant to the spike's technology domains, past patterns, and known gotchas. State the result in your final summary." Renumber existing "0. Investigation Planning" → "0b. Investigation Planning". | `.opencode/agents/researcher.agent.md` | B | T1 | 2026-08-03 |
| T10 | Update `reviewer.agent.md` — add new "Check Knowledge" step (insert before "Understand Scope" at line 28). The reviewer currently has ZERO knowledge retrieval. Add step: "**0. Check Knowledge**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol. Use `memory_bank_memory_search`/`memory_bank_memory_get` for project context and known issues. Skim `.agents/instructions/learned-knowledge.instructions.md` for review patterns, known bug classes, and security gotchas. Call `knowledgebase_knowledgebase_search` with review-relevant queries (common vulnerability patterns, recurring code-quality issues). State the result in your final summary." Renumber existing steps 1→1, 2→2, etc. (the new step 0 shifts all). | `.opencode/agents/reviewer.agent.md` | B | T1 | 2026-08-03 |
| T11 | Update `tracker.agent.md` — add "Check Knowledge" step that includes reading learned-knowledge BEFORE appending. Insert before "Read Context" (line 29): "**Check Knowledge**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol. Use `memory_bank_memory_search`/`memory_bank_memory_get` for project context. **Critically**: read `.agents/instructions/learned-knowledge.instructions.md` BEFORE appending a new Session entry — review existing sessions for related patterns to avoid duplicate or contradictory entries. Call `knowledgebase_knowledgebase_search` with queries matching the pipeline type and agent roles to surface relevant cross-project patterns. State the result in your final summary." Update line 25 to reference this step's pre-read requirement. Renumber existing steps 1→2, 2→3, etc. | `.opencode/agents/tracker.agent.md` | B | T1 | 2026-08-03 |
| T12 | Update `unit-tester.agent.md` — add new "Check Knowledge" step (insert before "Understand the Code" at line 28). The unit-tester currently has ZERO knowledge retrieval. Add step: "**Check Knowledge**: Read `.agents/instructions/knowledge-retrieval.instructions.md` and follow the 3-layer knowledge-retrieval protocol. Use `memory_bank_memory_search`/`memory_bank_memory_get` for project context. Skim `.agents/instructions/learned-knowledge.instructions.md` for test patterns, mock conventions, and testing gotchas. Call `knowledgebase_knowledgebase_search` with testing-relevant queries (test patterns, mock strategies, coverage approaches). State the result in your final summary." Renumber existing steps 1→2, 2→3, etc. | `.opencode/agents/unit-tester.agent.md` | B | T1 | 2026-08-03 |

**Validation per task**: After editing, verify the agent spec still has valid YAML frontmatter, all approach steps are sequentially numbered, and both `knowledgebase_search` and `learned-knowledge` are referenced in the added text.

---

### Phase 3 — Orchestrator Templates: Inject Standardized Knowledge-Retrieval into ALL Delegation Types (Batch C — Parallel, depends on T1)

All 3 orchestrator template edits are independent (disjoint files). Each task adds the knowledge-retrieval line to every delegation prompt type within that orchestrator.

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T13 | Update `orchestrator.agent.md` (main) — add the knowledge-retrieval line to BOTH delegation prompt templates: (a) standard delegation (line 123, after the existing memory-bank line) and (b) parallel-coder delegation (line 155, after the existing memory-bank line). Add: `- Knowledge retrieval: read \`.agents/instructions/knowledge-retrieval.instructions.md\` for the mandatory 3-layer knowledge-retrieval protocol. Call \`knowledgebase_knowledgebase_search\` with a task-relevant query (graceful failure — report whether executed or skipped). Skim \`.agents/instructions/learned-knowledge.instructions.md\` for role-relevant patterns. State the retrieval outcome in your final summary.` Also add architecture-context to standard delegation (it's currently missing — feature-pipeline has it but main orchestrator doesn't): `- Architecture context: read docs/.architecture-context.md for tech stack, layer structure, and dependency rules.` | `.opencode/agents/orchestrator/orchestrator.agent.md` | C | T1 | 2026-08-03 |
| T14 | Update `feature-pipeline.agent.md` — add the knowledge-retrieval line to BOTH delegation prompt templates: (a) standard delegation (line 106, after existing learned-knowledge line) and (b) parallel-coder delegation (line 139, after existing memory-bank line — this delegation currently MISSES learned-knowledge and architecture-context, add both). Add to standard: `- Knowledgebase: call \`knowledgebase_knowledgebase_search\` with a task-relevant query using the graceful-failure protocol defined in \`.agents/instructions/knowledge-retrieval.instructions.md\`. Report whether executed or skipped in your final summary.` Add to parallel-coder: `- Learned knowledge: read .agents/instructions/learned-knowledge.instructions.md for patterns and conventions.` and `- Architecture context: read docs/.architecture-context.md for tech stack, layer structure, and dependency rules.` and `- Knowledgebase: call \`knowledgebase_knowledgebase_search\` with a task-relevant query using the graceful-failure protocol defined in \`.agents/instructions/knowledge-retrieval.instructions.md\`. Report whether executed or skipped in your final summary.` | `.opencode/agents/orchestrator/feature-pipeline.agent.md` | C | T1 | 2026-08-03 |
| T15 | Update `tdd-orchestrator.agent.md` — add the knowledge-retrieval line to ALL SIX delegation prompt templates (Phase 1 implementer, Phase 2 unit-tester RED, Phase 3 coder GREEN, Phase 4 unit-tester VERIFY, Phase 5 reviewer, Phase 6 tracker). For each phase, determine the appropriate insertion point and add: `- Knowledge retrieval: read \`.agents/instructions/knowledge-retrieval.instructions.md\` for the mandatory 3-layer protocol (memory-bank + learned-knowledge + knowledgebase_search with graceful failure). Report whether knowledgebase_search was executed or skipped in your final summary.` Specific insertion points:
- **Phase 1 implementer** (line 135): After existing learned-knowledge line; add knowledgebase
- **Phase 2 unit-tester RED** (line 174): After TDD CONTEXT line (line 160); add full retrieval paragraph
- **Phase 3 coder GREEN** (line 217): After TDD CONTEXT line (line 202); add full retrieval paragraph
- **Phase 4 unit-tester VERIFY** (line 256): After TDD CONTEXT line (line 241); add full retrieval paragraph
- **Phase 5 reviewer** (line 289): Before "Base path:" line (line 286); add full retrieval paragraph (this phase currently has ZERO knowledge injection)
- **Phase 6 tracker** (line 314): After "Read any artifact files" line (line 309); add retrieval paragraph | `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` | C | T1 | 2026-08-03 |

**Validation per task**: After editing, verify the file still parses as valid markdown with `---` frontmatter, all code-fenced prompt templates are syntactically intact, and no duplicate lines were created.

---

### Phase 4 — Verification & Tests (Batch D — Parallel, depends on T3–T15)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T16 | Create `tests/spec-knowledge-retrieval.test.js` — a grep-based spec integrity verification script using Vitest. Tests: (a) Every pipeline agent spec in `.opencode/agents/*.agent.md` (excluding `plan.agent.md`) contains `knowledge-retrieval` or `knowledgebase_search` in a context that indicates the protocol is referenced. (b) Every pipeline agent spec contains `learned-knowledge` or `knowledge-retrieval`. (c) Every orchestrator template in `.opencode/agents/orchestrator/*.agent.md` contains `knowledge-retrieval` or `knowledgebase_search`. (d) The new shared file `.agents/instructions/knowledge-retrieval.instructions.md` exists and contains `graceful` and `explicitly note`. (e) `knowledgebase.instructions.md` no longer contains the phrase "NOT BEST EFFORT" (replaced by "GRACEFUL TO FAIL"). Use `fs.readFileSync` + `String.includes()` for portability; no external test dependencies. | `tests/spec-knowledge-retrieval.test.js` (NEW) | D | T3–T15 | 2026-08-03 |
| T17 | Create `tests/spec-orchestrator-parity.test.js` — verify orchestrator delegation template parity. Tests: (a) In `orchestrator.agent.md`: both standard and parallel-coder delegation prompt templates contain `knowledge-retrieval`. (b) In `feature-pipeline.agent.md`: standard delegation contains `learned-knowledge` AND `architecture-context` AND `knowledgebase`; parallel-coder delegation also contains all three (was asymmetric — only memory-bank). (c) In `tdd-orchestrator.agent.md`: all 6 Phase delegation blocks contain `knowledge-retrieval`. Use `fs.readFileSync` + substring extraction between known markers; report which phases pass/fail with line-range context. | `tests/spec-orchestrator-parity.test.js` (NEW) | D | T3–T15 | 2026-08-03 |
| T18 | Verify graceful-failure self-consistency — read the final versions of `knowledge-retrieval.instructions.md`, `knowledgebase.instructions.md`, and `tdd-orchestrator.agent.md`. Confirm: (a) No file uses language implying the knowledgebase is a hard dependency (grep for "must succeed", "must be available", "required to function"). (b) The explicit-report requirement (state whether accessed or skipped) appears in the shared protocol file AND in at least one orchestrator delegation template. (c) The tracker's pre-append read requirement is present. Manual grep + read verification — no automated test needed for this one; record results in the plan's completion notes. | N/A (manual verification) | D | T3–T15 | 2026-08-03 |

**T16/T17 validation**: Run `npx vitest run tests/spec-knowledge-retrieval.test.js tests/spec-orchestrator-parity.test.js` and confirm all tests pass (0 failures). If any test fails, the corresponding spec file needs a fix.

**T18 validation**: Manual — run the grep commands and confirm zero unexpected hits. Document findings in plan completion.

**T18 completion notes (2026-08-03)** — Graceful-failure self-consistency VERIFIED across all wiring. (a) **No hard-dependency language**: grep for `must succeed|must be available|required to function|hard requirement|must not fail|required for the pipeline|hard dependency` across `.opencode/agents/` → 0 hits; across `.agents/instructions/` → 1 hit, which is the CORRECT negation in `knowledge-retrieval.instructions.md:8` ("no layer is a hard dependency"). Additional grep for `must (query|call|search)|cannot proceed|will fail|requires the knowledgebase|depends on the knowledgebase` in `.opencode/agents/` → 0 hits. (b) **Explicit-report requirement present**: shared protocol file `knowledge-retrieval.instructions.md:48-49` ("Your final output summary MUST state which outcome occurred ('accessed' or 'skipped'). This disclosure is not optional") AND in ALL three orchestrator delegation templates — `orchestrator.agent.md:124` (standard) + `:158` (parallel-coder), `feature-pipeline.agent.md:106` + `:143`, `tdd-orchestrator.agent.md:135,162,206,249,290,315` (all 6 TDD phases). (c) **Tracker pre-append read present**: `tracker.agent.md:25` (core responsibility bullet references step 1 pre-read) + `tracker.agent.md:29` (step 1 "Check Knowledge" — "read `.agents/instructions/learned-knowledge.instructions.md` BEFORE appending a new Session entry"). **Reconciliation check**: `knowledgebase.instructions.md` no longer contains "MANDATORY REQUIREMENT" or "NOT BEST EFFORT" (0 hits); line 11 now reads "MANDATORY TO ATTEMPT, GRACEFUL TO FAIL". **Verdict**: PASS — no violations found; no source/spec file edits required by T18.

**T17 completion notes (2026-08-03)** — `tests/spec-orchestrator-parity.test.js` created (254 lines) — 8 tests, all passing. TEST-07/08: main orchestrator — standard delegation (block containing `Work on "{work_unit}"`, currently lines 115–127) AND parallel-coder delegation (block containing `Work on "Implement task {TASK_ID}`, currently lines 149–160) each contain `knowledge-retrieval`; occurrence count of `knowledge-retrieval.instructions.md` in the file = exactly 2. TEST-09: feature-pipeline — BOTH standard (block containing `Work on "{work_unit}"`, lines 96–109) and parallel-coder (block containing `Work on "Implement task {TASK_ID}`, lines 132–145) each contain `learned-knowledge` AND `architecture-context` AND `knowledgebase` (the parallel-coder was previously asymmetric — only memory-bank); occurrence count of `knowledgebase_knowledgebase_search` = exactly 2. TEST-10: TDD orchestrator — all 6 Phase delegation blocks (mapped from `#### Phase N:` headings to the fenced block in each section) contain `knowledge-retrieval` (lines 135, 162, 206, 249, 290 — incl. Phase 5 reviewer which had ZERO injection before T15, and 315); occurrence count of `knowledge-retrieval.instructions.md` = exactly 6. Delegation blocks are extracted as fenced markdown blocks (robust to indented fences) and classified by stable content markers — NOT hardcoded line numbers — so the tests are robust to surrounding formatting. **Verification**: `npx vitest run tests/spec-orchestrator-parity.test.js` → **8/8 passed**; plan T16/T17 validation `npx vitest run tests/spec-knowledge-retrieval.test.js tests/spec-orchestrator-parity.test.js` → **14/14 passed**; full suite `npx vitest run` → **14 files / 273 tests, 0 failures** (259 pre-existing + 6 T16 + 8 T17). No regressions. `vitest.config.ts` include pattern (extended by T16 to cover `tests/**/*.test.{js,ts}`) is required for collection and was already in place. Plan status → Completed (all 18 tasks done).

**Reviewer fix pass completion notes (2026-08-03)** — Applied the Pipeline 7 reviewer's 2 majors + 4 minors (all doc-only consistency/parity fixes; NO graceful-failure wording/behavior changes). **M1** `tracker.agent.md:34` — "determined in step 3" → "determined in step 4" (Determine Target Path is now step 4 after T11 renumbering). **M2** `knowledgebase.instructions.md` — storage taxonomy relabeled from "Layer N" to "Tier N" (storage Tier 1 Markdown / Tier 2 Memory Bank / Tier 3 Knowledgebase) with an explicit note that storage **tiers** are distinct from the retrieval **layers** (L1/L2/L3) in `knowledge-retrieval.instructions.md`, eliminating the L1/L2 collision between the two files; table header updated to "(storage Tier 2/3)". **B1** `knowledgebase.instructions.md:178` — "executed — N results." → "executed — N results returned." (matches shared protocol canonical phrasing). **B2** `e2e-tester.agent.md` — swapped steps so "Check Knowledge" is step 2 and "Open Page" is step 3 (matches plan T7's insert-BEFORE-Open-Page intent); subsequent steps 4–6 unchanged. **B3** `feature-pipeline.agent.md` — parallel-coder fence bullets (memory-bank/learned-knowledge/architecture-context/knowledgebase) re-indented from column 0 to 6 spaces to match surrounding bullets. **B4** `orchestrator.agent.md` — added `- Architecture context: read docs/.architecture-context.md for tech stack, layer structure, and dependency rules.` to the parallel-coder delegation (matching the standard delegation's exact line), completing cross-orchestrator parity. **Verification**: targeted `npx vitest run tests/spec-knowledge-retrieval.test.js tests/spec-orchestrator-parity.test.js` → **14/14 passed**; full suite `npx vitest run` → **14 files / 273 tests, 0 failures**; occurrence-count invariants verified unchanged (orchestrator `knowledge-retrieval.instructions.md` = 2, feature-pipeline `knowledgebase_knowledgebase_search` = 2, tdd-orchestrator `knowledge-retrieval.instructions.md` = 6) — no test updates required. Only doc files modified.

---

## 3. Alternatives Considered

| ID | Alternative | Rationale for Rejection |
|----|-------------|------------------------|
| ALT-01 | Include `plan.agent.md` in scope | `plan.agent.md` is a standalone pre-pipeline agent (not a sub-agent), invoked directly by the user for conversational planning. Its structure differs from all other agent specs (no numbered "Approach" steps, no "Check Memory Bank" pattern). Adding knowledge-retrieval there would be inconsistent with its interactive/conversational design. Recommendation: keep out of scope — it's a user-facing tool, not a pipeline worker. |
| ALT-02 | Inline the knowledge-retrieval paragraph in every agent spec (no shared file) | 14 files × ~8 lines = ~112 lines of duplicated text. Any change to the graceful-failure wording would require updating all 14 files. Duplication drift is a proven risk (the "Check Memory Bank" step already drifts between agents). A shared file is the established pattern — `memory-bank.instructions.md` is already referenced across multiple agent specs. |
| ALT-03 | Make knowledgebase_search a hard dependency (fail pipeline if unavailable) | Violates the user's explicit requirement: "Do NOT make the knowledgebase a hard dependency." The PG vector may not be set up in all environments; pipeline must not fail. |
| ALT-04 | Add knowledgebase to only the orchestrator templates, not agent specs | Agents run standalone outside pipelines too (via opencode direct invocation). If the knowledge-retrieval protocol lives only in orchestrator delegation prompts, standalone agent invocations miss it entirely. |
| ALT-05 | Use `knowledge-retrieval.instructions.md` with `applyTo: "**"` frontmatter for auto-loading | Auto-loading would inject the protocol into EVERY agent invocation regardless of whether the host opencode loads instruction files. The protocol is explicitly referenced for clarity and agent-spec self-documentation. Explicit reference is more maintainable than implicit auto-loading. |

---

## 4. Dependencies

| ID | Description | Affected Tasks |
|----|-------------|---------------|
| DEP-01 | T1 (shared protocol file) must be created before T3–T15 can reference it | T3–T15 depend on T1 |
| DEP-02 | T3–T15 must be complete before T16–T17 can verify the final state of all files | T16, T17 depend on T3–T15 |
| DEP-03 | T18 is independent of T16–T17 (different verification method) but logically follows T3–T15 | T18 depends on T3–T15 |
| DEP-04 | `knowledgebase_search` MCP tool must be available in the opencode environment for agents to actually call it — but not required for the spec wiring (graceful failure handles unavailability) | Runtime, not build-time |

---

## 5. Files

| ID | File | Status | Description |
|----|------|--------|-------------|
| FILE-01 | `.agents/instructions/knowledge-retrieval.instructions.md` | NEW | Shared 3-layer knowledge-retrieval protocol with graceful-failure wrapping and explicit-report requirement |
| FILE-02 | `.agents/instructions/knowledgebase.instructions.md` | MODIFY | Reconcile MANDATORY language, add cross-reference to FILE-01 |
| FILE-03 | `.opencode/agents/architect.agent.md` | MODIFY | Add knowledgebase_search to "Check Memory Bank" step |
| FILE-04 | `.opencode/agents/coder.agent.md` | MODIFY | Add knowledgebase_search to "Check Memory Bank" step |
| FILE-05 | `.opencode/agents/deployer.agent.md` | MODIFY | Add new "Check Knowledge" step (3-layer) |
| FILE-06 | `.opencode/agents/designer.agent.md` | MODIFY | Add knowledgebase_search to "Check Memory Bank" step |
| FILE-07 | `.opencode/agents/e2e-tester.agent.md` | MODIFY | Add new "Check Knowledge" step (3-layer) |
| FILE-08 | `.opencode/agents/implementer.agent.md` | MODIFY | Add knowledgebase_search to "Check Memory Bank" step |
| FILE-09 | `.opencode/agents/researcher.agent.md` | MODIFY | Add new "Check Knowledge" step before "Investigation Planning" |
| FILE-10 | `.opencode/agents/reviewer.agent.md` | MODIFY | Add new "Check Knowledge" step 0 |
| FILE-11 | `.opencode/agents/tracker.agent.md` | MODIFY | Add "Check Knowledge" with pre-append learned-knowledge read |
| FILE-12 | `.opencode/agents/unit-tester.agent.md` | MODIFY | Add new "Check Knowledge" step (3-layer) |
| FILE-13 | `.opencode/agents/orchestrator/orchestrator.agent.md` | MODIFY | Add knowledge-retrieval + architecture-context to standard delegation; add knowledge-retrieval to parallel-coder delegation |
| FILE-14 | `.opencode/agents/orchestrator/feature-pipeline.agent.md` | MODIFY | Add knowledgebase to standard delegation; add learned-knowledge + architecture-context + knowledgebase to parallel-coder delegation |
| FILE-15 | `.opencode/agents/orchestrator/tdd-orchestrator.agent.md` | MODIFY | Add knowledge-retrieval to all 6 Phase delegation templates |
| FILE-16 | `tests/spec-knowledge-retrieval.test.js` | NEW | Grep-based spec integrity verification |
| FILE-17 | `tests/spec-orchestrator-parity.test.js` | NEW | Orchestrator delegation template parity verification |
| FILE-18 | `.opencode/agents/plan.agent.md` | NO CHANGE | Out of scope (ALT-01) |

### FILE-01 Content (`.agents/instructions/knowledge-retrieval.instructions.md`)

```markdown
---
applyTo: "**"
---

# Knowledge Retrieval Protocol

Every agent MUST follow this 3-layer protocol before planning, deciding, or implementing.
This protocol is **mandatory to attempt** but **graceful to fail** — no layer is a hard dependency.

## Layer 1: Memory Bank (always available — embedded SQLite)

Read `.agents/instructions/memory-bank.instructions.md`. Use `memory_bank_memory_search`
for semantic context retrieval and `memory_bank_memory_get` for full file reads.

## Layer 2: Learned Knowledge (always available — git-committed markdown)

Skim `.agents/instructions/learned-knowledge.instructions.md` for patterns, conventions,
gotchas, and agent tuning notes relevant to your role and current task. Focus on sessions
that match your pipeline type and agent role.

## Layer 3: Cross-Project Knowledgebase (graceful — requires PG + pgvector)

Call `knowledgebase_knowledgebase_search` (MCP) with a task-relevant query.

**This is mandatory to ATTEMPT, but graceful to fail:**

| Outcome | Required Action |
|---------|----------------|
| **Success** | Explicitly note in your reasoning and final summary: "knowledgebase_search executed — N results returned." |
| **Error / Unavailable** | Explicitly note: "knowledgebase_search NOT executed (PG vector unavailable)." Do NOT block, fail, or retry. Proceed normally. |

### Graceful Failure Wrapper

```
try {
  const results = await knowledgebase_knowledgebase_search({
    query: "<task-relevant query>",
    topK: 5
  });
  // Note: "knowledgebase_search executed — N results returned."
  // Use results to inform your approach
} catch (err) {
  // Note: "knowledgebase_search NOT executed (PG vector unavailable)."
  // Proceed with the task using memory-bank + learned-knowledge only
}
```

**Your final output summary MUST state which outcome occurred ("accessed" or "skipped").
This disclosure is not optional — every agent response must include it.**

## Retrieval Order

1. Memory bank (`memory_bank_memory_search` + `memory_bank_memory_get`)
2. Learned knowledge (skim `.agents/instructions/learned-knowledge.instructions.md`)
3. Knowledgebase (`knowledgebase_knowledgebase_search` with graceful failure)
4. Project files (read specific source files as needed)
5. Proceed with the task
```

---

## 6. Testing

| ID | Description | Type | File |
|----|-------------|------|------|
| TEST-01 | Every pipeline agent spec (10 files in `.opencode/agents/*.agent.md`, excluding `plan.agent.md`) contains the string `knowledge-retrieval` or `knowledgebase_search` | Grep-based unit test | `tests/spec-knowledge-retrieval.test.js` |
| TEST-02 | Every pipeline agent spec contains the string `learned-knowledge` or `knowledge-retrieval` | Grep-based unit test | `tests/spec-knowledge-retrieval.test.js` |
| TEST-03 | Every orchestrator template (3 files in `.opencode/agents/orchestrator/*.agent.md`) contains the string `knowledge-retrieval` or `knowledgebase_search` | Grep-based unit test | `tests/spec-knowledge-retrieval.test.js` |
| TEST-04 | New shared file `.agents/instructions/knowledge-retrieval.instructions.md` exists, contains `graceful`, and contains `explicitly note` | Grep-based unit test | `tests/spec-knowledge-retrieval.test.js` |
| TEST-05 | `knowledgebase.instructions.md` no longer contains "NOT BEST EFFORT" (replaced by "GRACEFUL TO FAIL") | Grep-based unit test | `tests/spec-knowledge-retrieval.test.js` |
| TEST-06 | `plan.agent.md` is correctly excluded from the pipeline agent list (no false positive) | Grep-based unit test | `tests/spec-knowledge-retrieval.test.js` |
| TEST-07 | `orchestrator.agent.md` standard delegation prompt contains `knowledge-retrieval` | Substring extraction test | `tests/spec-orchestrator-parity.test.js` |
| TEST-08 | `orchestrator.agent.md` parallel-coder delegation prompt contains `knowledge-retrieval` | Substring extraction test | `tests/spec-orchestrator-parity.test.js` |
| TEST-09 | `feature-pipeline.agent.md` parallel-coder delegation contains `learned-knowledge` AND `architecture-context` AND `knowledgebase` (was asymmetric) | Substring extraction test | `tests/spec-orchestrator-parity.test.js` |
| TEST-10 | `tdd-orchestrator.agent.md` all 6 Phase delegation blocks contain `knowledge-retrieval` | Substring extraction test | `tests/spec-orchestrator-parity.test.js` |
| TEST-11 | Graceful-failure self-consistency — no file uses "must succeed" or "must be available" language about the knowledgebase | Manual grep verification | N/A (T18) |
| TEST-12 | Explicit-report requirement appears in the shared protocol file AND at least one orchestrator delegation template | Manual grep verification | N/A (T18) |
| TEST-13 | Run full existing test suite (185+ tests) to confirm zero regressions from spec-only changes | `npx vitest run` | All existing test files |

---

## 7. Risks & Assumptions

| ID | Description | Mitigation |
|----|-------------|------------|
| RISK-01 | Duplication drift — the core protocol text might diverge between the shared file and inline references in agent specs | The shared file is the single source of truth; agent specs only REFERENCE it (one line). The actual protocol text lives only in FILE-01. |
| RISK-02 | Agent still skips knowledgebase because "graceful failure" implies "optional" | The protocol is explicit: "mandatory to ATTEMPT." The explicit-report requirement (state outcome in summary) creates accountability — agents can't silently skip without reporting it. |
| RISK-03 | TDD Phase 5 (reviewer) delegation prompt grows too large with the added retrieval paragraph | The TDD reviewer prompt (lines 276-290) is currently 15 lines — adding a ~3-line retrieval reference is manageable. The prompt remains focused on review context. |
| RISK-04 | `knowledgebase_search` not available in all opencode environments (DATABASE_URL not configured) | This is BY DESIGN — graceful failure handles it. The protocol explicitly requires reporting the skip, not failing. |
| ASSUMPTION-01 | The `knowledgebase` MCP server is configured in `opencode.json` (already verified in the original knowledgebase feature pipeline) | If the MCP server entry is missing, `knowledgebase_knowledgebase_search` won't appear in available tools — agents report "NOT executed" and proceed. |
| ASSUMPTION-02 | All agent specs are in `.opencode/agents/` with `.agent.md` extension | Verified by file listing. New agents added in the future will need the same protocol reference added. |
| ASSUMPTION-03 | The codebase's existing test infrastructure (Vitest, `scripts/` convention) supports adding spec verification tests without new dependencies | Verified — T16/T17 use `fs.readFileSync` + `String.includes()`, compatible with any test runner. |

---

## 8. Related Specifications

- `.agents/instructions/knowledgebase.instructions.md` — Layer 3 knowledgebase instructions (being updated by T2)
- `.agents/instructions/memory-bank.instructions.md` — Layer 2 memory bank instructions (unchanged)
- `.agents/instructions/learned-knowledge.instructions.md` — Cross-session learned knowledge (unchanged, read-only by agents)
- `docs/adr-knowledgebase-pgvector.md` — Architecture Decision Record for the PG knowledgebase
- `plan/feature-knowledgebase-pgvector-v1.md` — Original knowledgebase implementation plan (17 tasks, 5 batches)
- Researcher audit findings — Pipeline 6 audit that identified the underutilization gaps
