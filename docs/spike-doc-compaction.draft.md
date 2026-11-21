> **SUPERSEDED** — replaced by docs/spike-doc-compaction.md on 2026-11-10.

---
id: "spike-doc-compaction.draft"
title: "Spike draft: Documentation Compaction Prompt"
updated: "2026-11-10"
status: "complete"
doc_type: "spike-draft"
tags: [scope, spike, doc-compaction]
---

# Spike Draft: Documentation Compaction Prompt

## Problem Statement

The requester wants a reusable **prompt** (not an agent, not a script) that compacts and consolidates the Markdown documentation of a project. The motivating case is `apmc-cms`, which has "a lot of documentation" — but per the round-1 Q5 correction, `apmc-cms` is only an illustration of a documentation *layout*, not a target repo. **Portability across the requester's other repositories is a first-class requirement**: the prompt must be dropped into any project and work with no per-repo edits.

Settled shape after round 1: a human-run prompt at `.agents/prompts/doc-compaction.prompt.md` that is **read-only by default** and emits a scored proposal; writes only under an explicit apply flag; never deletes anything without printing the exact `rm`/`git rm` manifest first; and **never rewrites historical/audit-trail documents** (spikes, tracker logs, completed plans) — those may only be marked, archived, or indexed.

Open after round 2: dependency posture and whether v1 integrates with any index/embedding layer; the scan budget before the prompt must stop and report partial results; and the rewrite-fidelity fence that keeps a merge from silently breaking links or dropping content. Rounds 1–2 also confirmed the non-goals (no special-casing `apmc-cms`, no non-Markdown assets) and settled input, reporting, and archive mechanics.

Round 3 closed the remaining frontier: v1 is Markdown-only with no index integration, the scan soft-caps at ~200 files with a `PARTIAL SCAN` banner, and merges carry inline source attribution, link/anchor verification that halts a breaking merge, and a per-merge before/after diff summary. The frontier is empty; remaining unknowns are explicitly deferred.

## Evidence

- Deliverable convention: `.agents/instructions/prompt.instructions.md:35` — kebab-case filenames ending `.prompt.md` under `.agents/prompts/`. Body baseline sections at `:41` — Mission, Scope & Preconditions, Inputs, Workflow, Output Expectations, Quality Assurance.
- Frontmatter precedent is inconsistent in-tree: `documentation-writer.prompt.md:1-5` carries legacy `agent:` and `tools:` keys; `prompt.instructions.md:31` forbids tool/model/agent fields ("opencode prompts have a simpler frontmatter model"). Only `description` is recommended, `name` optional.
- Destructive-operation guard rails are mandated: `prompt.instructions.md:55` — "Warn about destructive operations (file creation, edits, terminal commands) and include guard rails or confirmation steps in the workflow."
- **Direct precedent against rewriting history**: `.agents/instructions/learned-knowledge.instructions.md:158` — "Spike docs, archived plans, and historical tracker entries document past state and should NOT be updated… changing them would erase the audit trail." Live docs (README, activeContext, progress, docs guides) are the category that *is* updated. This splits the target corpus into at least two classes with opposite rules.
- This repo's own `docs/` is already a mixed corpus of exactly those classes: live-ish guides (`playwright-mcp-configuration.md`, `design-setup-command-v1.md`), historical spikes (`spike-*.md`, 12 of them), tracker records (`tracker-log.md`, `TRACKER-INDEX.md`), and per-feature folders (`docs/setup-command/`, `docs/communication-standard/`, etc.).
- No existing compaction, prune, or archive prompt exists in `.agents/prompts/` or `.agents/instructions/` (grep for `compaction|compact|prune|pruning|archive` over `.agents/` returns only `sync.js` prune logic, licensing boilerplate, and the historical-freeze note above).
- `apmc-cms` is not present in this workspace (it is a different repo on disk), so the prompt must locate and classify documents from the target repo at run time rather than encode `apmc-cms` paths.
- Prompt frontmatter precedent (`documentation-writer.prompt.md:1-5`) shows the older `agent:`/`tools:` form is present in-tree but is superseded by `prompt.instructions.md:31`; the new prompt should follow the instructions file, not the legacy exemplar.
- `prompt.instructions.md:66-68` already requires explicit output format/location plus "success criteria and failure triggers so the assistant knows when to halt"—this maps directly onto the deletion-manifest and no-op/warn gates.
- Round 1 answers superseded the round-1 framing: safety is *not* "report vs apply" alone — it is "read-only by default, writes only behind an explicit flag, and never a removal without a printed manifest first".
- **Q5 correction has a mechanical consequence**: nothing in the prompt may name `apmc-cms`, and any directory enumeration must be derived at run time. Hard-coded root lists would violate portability.
- Memory bank (`memory_search`, 339 vectors / 41 files) returned no prior compaction decisions — the only related prior knowledge is the historical-freeze note already cited above.
- `memory-bank/memory_stats` confirms the memory layer is live in this repo, so memory bank files are a real, readable documentation corpus for the target set.
- `docs/spike-*.md` currently holds 16 files (12 complete + 4 drafts) — an immediately available test corpus of historical documents that must be classified-but-never-rewritten.
- `.agents/config/issue-tracker.md` declares GitHub Issues, so the final recommendation section follows that.
- Knowledgebase search executed and **skipped** (PG vector unavailable — `DATABASE_URL` not configured).

## Round 1 — Answers (2026-11-10)

- **Q1** — What "compaction" means: report-only is the default; merge-and-delete is an explicit opt-in flag. → **Settled:** the prompt's default output is a report/proposal. Destructive merging happens only when the operator passes an explicit apply/merge flag.
- **Q2** — Whether historical/audit-trail documents are in or out of scope: historical docs (spikes, tracker logs, completed plans) are never content-rewritten. → **Settled:** historical documents are excluded from content rewriting; they may be marked, moved to an archive location, or indexed.
- **Q3** — Whether the prompt writes changes or only proposes them: writes only in explicit apply mode, and apply mode never deletes without first printing the exact `rm` / `git rm` list. → **Settled:** two modes — report (default, read-only) and apply (writes, with a mandatory deletion manifest printed before any removal).
- **Q4** — How the prompt decides a document is "noise": scored checklist, every candidate deletion must cite at least one mechanically checkable reason; "old and unused" alone is insufficient. → **Settled:** a scored, evidence-backed checklist gates every deletion; each deletion cites ≥1 mechanically checkable reason.
- **Q5** — Which repos/document roots the prompt targets and where it ships: **user correction** — `apmc-cms` is only an example of how documents are laid out; the prompt must be reusable in the requester's other projects. Do not special-case `apmc-cms`. → **Settled:** portability across arbitrary repositories is a first-class requirement. The layout observation informs a generic default; no repo-specific paths or names may be hardcoded.
- **Q6** — Who executes it: a human-run prompt. → **Settled:** deliverable is a human-invoked prompt at `.agents/prompts/doc-compaction.prompt.md` for v1; no agent or orchestrator step.

## Round 2 — Answers (2026-11-10)

- **Q7** — Input/trigger shape: no-arg run auto-discovers roots from a precedence chain; a path argument narrows scope. → **Settled:** the prompt runs with zero required arguments, auto-discovers documentation roots using an explicit precedence chain, and accepts an optional path/glob argument to narrow the scan.
- **Q8** — Machine-readable sidecar report: emit `.doc-compaction/report.json` alongside the human report. → **Settled:** every run (report and apply) writes a JSON manifest to `.doc-compaction/report.json` plus the human-readable report; exact schema to be specified in the prompt.
- **Q9** — Archive mechanics: `git mv` into an archive directory, preserving relative paths; fall back to listing the move list when the target is not a git repo. → **Settled:** archival is a path-preserving `git mv` into a single archive root; non-git targets get a printed move list instead of moves.
- **Q10** — Safety exclusion of agent-instruction surfaces: never rewrite or delete `.agents/instructions/`, `.agents/skills/`, `.agents/config/`, `AGENTS.md`, `opencode.json`, `memory-bank/**`. → **Settled:** these are hard-excluded from any rewrite, merge, or deletion; they may only appear as informational findings.

## Round 3 — Answers (2026-11-10)

- **Q11** — Dependency posture and index integration: Markdown-only, no index/embedding integration in v1. The prompt is portable across arbitrary repositories. An optional index hook is deferred to a later version. → **Settled:** v1 is Markdown-only with zero external dependencies and no index/embedding integration; the prompt works with no per-repo setup.
- **Q12** — Scale limits before partial results: a soft cap of ~200 Markdown files per run, an explicit `PARTIAL SCAN` banner in both the human report and `report.json`, plus a narrowing instruction. → **Settled:** the scan stops at a ~200-file soft cap and reports partial results, marked `PARTIAL SCAN` in both outputs, with guidance to narrow scope via the optional path/glob argument.
- **Q13** — Rewrite fidelity fence for merges: all three requirements — inline source attribution per consolidated section, link/anchor verification that halts a merge which breaks a reference, and a per-merge before/after diff summary in the report. → **Settled:** merges must (a) attribute each consolidated section to its source document inline, (b) verify links/anchors and halt any merge that would break a reference, and (c) include a per-merge before/after diff summary in the report.

## Frontier (open)

_Empty — all branches settled or explicitly deferred._

## Deferred

- Repository size threshold below which the prompt should refuse to run (i.e. "docs are already compact") — deferred; revisit if users complain about noise in small repos.
- Non-Markdown documentation assets (PDFs, images, generated HTML) — deferred; out of scope for v1.
- Integration with the knowledgebase index (`knowledgebase_search`) — deferred; v1 emits a sidecar manifest that a future step could ingest.
- Optional index hook for the compaction prompt (`report.json` ingestion) — deferred to a later version, gated on Q11's Markdown-only v1 landing first.

## Deferred

- Repository size threshold below which the prompt should refuse to run (i.e. "docs are already compact") — deferred; revisit if users complain about noise in small repos.
- Non-Markdown documentation assets (PDFs, images, generated HTML) — deferred; out of scope for v1.
- Integration with the knowledgebase index (`knowledgebase_search`) — deferred; v1 emits a sidecar manifest that a future step could ingest.

## Prototype Requests

_(none)_
