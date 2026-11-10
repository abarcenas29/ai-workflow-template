---
id: "spike-doc-compaction"
title: "Spike: Documentation Compaction Prompt"
updated: "2026-11-10"
tags: [scope, spike, doc-compaction]
doc_type: "spike"
---

# Spike: Documentation Compaction Prompt

**Date:** 2026-11-10
**Status:** ✅ COMPLETE
**Produced by:** Scope - Feature Scoping

## 1. Problem Statement

The requester wants a reusable **prompt** — not an agent, not a script — that compacts and consolidates the Markdown documentation of a project, because repositories accumulate many overlapping or stale docs. The motivating illustration was `apmc-cms`, which has "a lot of documentation," but per the round-1 correction that repo is only an example of a documentation *layout*: the deliverable must be portable across the requester's other repositories and work with no per-repo edits.

**In scope (v1):**

- A single human-run prompt at `.agents/prompts/doc-compaction.prompt.md`.
- Markdown corpus discovery, classification, and a scored proposal (read-only by default).
- Opt-in apply mode that merges/consolidates, archives, and removes — with mandatory printed manifests.
- Classification that separates *live* documentation (may be rewritten) from *historical/audit-trail* documentation (never content-rewritten).
- A human-readable report plus a machine-readable `report.json` sidecar.

**Out of scope (v1):**

- Any index/embedding/knowledgebase integration.
- Non-Markdown assets (PDFs, images, generated HTML).
- Rewriting agent-instruction surfaces, memory bank, or framework config.
- Hardcoding any repository name or path (including `apmc-cms`).
- Automatic deletion without a printed manifest.

## 2. Investigation Results — Decisions Settled

| # | Decision | Rationale | Round |
|---|----------|-----------|-------|
| D-1 | Default output is a read-only report/proposal; destructive merging requires an explicit apply/merge flag. | Q1 — humans see the proposal before anything changes. | 1 |
| D-2 | Historical/audit-trail documents (spikes, tracker logs, completed plans) are never content-rewritten; they may only be marked, archived, or indexed. | Q2 — matches `learned-knowledge.instructions.md:158`: rewriting them erases the audit trail. | 1 |
| D-3 | Two modes: report (default, read-only) and apply (writes, with the exact `rm`/`git rm` manifest printed before any removal). | Q3 — `prompt.instructions.md:55` mandates destructive-op guard rails. | 1 |
| D-4 | Deletions are gated by a scored checklist; every deletion must cite ≥1 mechanically checkable reason. | Q4 — "old and unused" alone is not evidence. | 1 |
| D-5 | Portability is a first-class requirement: no repo-specific paths or names may be hardcoded; roots are discovered at run time. | Q5 (user correction) — `apmc-cms` is an illustration only. | 1 |
| D-6 | Deliverable is a human-invoked prompt at `.agents/prompts/doc-compaction.prompt.md`; no agent or orchestrator step in v1. | Q6 — `prompt.instructions.md:35` sets the `.prompt.md` convention. | 1 |
| D-7 | Zero required arguments; documentation roots are auto-discovered via an explicit precedence chain; an optional path/glob argument narrows the scan. | Q7 — portable default with an escape hatch. | 2 |
| D-8 | Every run (report and apply) emits both the human report and `.doc-compaction/report.json`; the exact schema is specified in the prompt. | Q8 — machine-readable sidecar enables future tooling without a dependency. | 2 |
| D-9 | Archival is a path-preserving `git mv` into a single archive root; non-git targets get a printed move list instead. | Q9 — preserves relative links and degrades safely. | 2 |
| D-10 | Hard-excluded from any rewrite/merge/deletion: `.agents/instructions/`, `.agents/skills/`, `.agents/config/`, `AGENTS.md`, `opencode.json`, `memory-bank/**`; they may appear only as informational findings. | Q10 — these surfaces govern agent behavior; editing them is a governance change, not doc hygiene. | 2 |
| D-11 | v1 is Markdown-only with zero external dependencies and no index/embedding integration; it works with no per-repo setup. | Q11 — portability holds only if nothing must be installed or configured. | 3 |
| D-12 | Scan stops at a ~200-Markdown-file soft cap and reports partial results, marked `PARTIAL SCAN` in both the human report and `report.json`, with guidance to narrow via the path/glob argument. | Q12 — bounds run time and token cost while never silently pretending the scan was complete. | 3 |
| D-13 | Every merge must: (a) attribute each consolidated section inline to its source document, (b) verify links/anchors and halt any merge that would break a reference, (c) include a per-merge before/after diff summary in the report. | Q13 — a silent merge that drops content or breaks a link is worse than no compaction. | 3 |

**Supporting evidence (paths):**

- `.agents/instructions/prompt.instructions.md:35` — kebab-case `.prompt.md` filenames under `.agents/prompts/`. `:41` — required body sections (Mission, Scope & Preconditions, Inputs, Workflow, Output Expectations, Quality Assurance). `:55` — destructive-operation warning + guard rails. `:66-68` — explicit output format/location plus success criteria and failure triggers. `:31` — no tool/model/agent frontmatter; `description` recommended.
- `.agents/instructions/learned-knowledge.instructions.md:158` — spikes, archived plans, and historical tracker entries must not be updated; this creates the live-vs-historical split in D-2.
- `documentation-writer.prompt.md:1-5` — carries legacy `agent:`/`tools:` frontmatter that is superseded by `prompt.instructions.md:31`; the new prompt follows the instructions file, not that exemplar.
- This repo's `docs/` is already a mixed corpus of live guides, historical spikes (`docs/spike-*.md`, 16 files: 12 complete + 4 drafts), tracker records, and per-feature folders — a ready test corpus for the classification rules.
- Grep for `compaction|compact|prune|pruning|archive` over `.agents/` returns only `sync.js` prune logic, licensing boilerplate, and the historical-freeze note — no existing competing prompt.
- `apmc-cms` is not in this workspace, so root discovery must be runtime-derived (reinforces D-5).
- `memory-bank/memory_stats` shows the memory layer is live; memory bank is a real corpus but is hard-excluded by D-10.

## 3. Open / Deferred Questions

| # | Question | Why deferred | Reopens when |
|---|----------|--------------|--------------|
| O-1 | Repository size threshold below which the prompt should refuse to run ("docs already compact") | Low value at v1; adds a judgement call with no evidence behind it | Users report noise on small repos |
| O-2 | Non-Markdown documentation assets (PDFs, images, generated HTML) | Different toolchain and risk profile; out of scope for a Markdown-only v1 | Requester asks for asset consolidation |
| O-3 | Integration with the `knowledgebase_search` index | v1 emits `report.json`, which a later step can ingest without changing the prompt | A follow-on effort wants index-driven dedupe |
| O-4 | Optional index hook for the compaction prompt (`report.json` ingestion) | Deferred to a later version, gated on the Markdown-only v1 landing first (consistent with Q11) | v1 ships and a consumer for `report.json` exists |

## 4. Decision / Recommendation

**Recommended next step:** `implementer`.

- `implementer` — when the scope is settled and only planning remains.

Scope is fully settled (13 decisions, frontier empty, 4 explicit deferrals). The remaining work is authoring a single prompt file to a known convention (`.agents/prompts/doc-compaction.prompt.md`) with a known set of required sections and behaviours — that is planning and authoring, not research or architecture. `researcher` is **not** required: no open question needs external evidence, and the only deferrals are scope choices, not unknowns.

## 5. External Resources

| Source | What it established |
|--------|---------------------|
| `.agents/instructions/prompt.instructions.md` | Filename/location convention, required body sections, frontmatter rules, destructive-operation guard-rail mandate, halt criteria |
| `.agents/instructions/learned-knowledge.instructions.md` | The historical-freeze rule that splits the corpus into live vs audit-trail classes |
| `.agents/prompts/documentation-writer.prompt.md` | Legacy frontmatter precedent that is explicitly superseded |
| `.agents/config/issue-tracker.md` | Declares GitHub Issues, which the next-step recommendation follows |

## 6. Decision Trail

| When | Action | Result |
|------|--------|--------|
| Round 1 | Asked Q1–Q6 | All six settled; Q5 corrected by the requester (portability, not `apmc-cms`-specific) |
| Round 2 | Asked Q7–Q10 | All four settled (input/trigger, sidecar report, archive mechanics, agent-surface exclusion) |
| Round 3 | Asked Q11–Q13 | All three settled; frontier empty; remaining unknowns explicitly deferred |

**Status history:** `drafting` → `complete` on 2026-11-10.
