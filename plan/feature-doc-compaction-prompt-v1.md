---
goal: "Author one portable, human-invoked opencode prompt at .agents/prompts/doc-compaction.prompt.md that classes a Markdown corpus into live and historical documents, emits a scored report plus .doc-compaction/report.json by default, and applies merges, archives, and removals only behind an explicit apply gate with printed manifests and link/anchor verification"
version: 1
date_created: 2026-11-10
status: Planned
tags: [feature, prompt, doc-compaction, documentation-hygiene, portability, report-only-default, historical-freeze, merge-fidelity, partial-scan, git-mv-archive]
---

# Feature: Documentation Compaction Prompt

![Status: Planned](https://img.shields.io/badge/status-Planned-yellow)

## Introduction

**Status:** Planned 2026-11-10 — 7 tasks across 3 batches: T1 (A, single), T2–T3 (B, both
reference T1, run sequentially because they are one file), T4 (C, single gate).

`docs/spike-doc-compaction.md` settles this work in 13 decisions (D-1…D-13) and defers four
items (O-1…O-4). This plan does not reopen a single one of them. It encodes them.

The deliverable is **one file**: `.agents/prompts/doc-compaction.prompt.md`. That file does not
exist today (`ls .agents/prompts/doc-compaction.prompt.md` → absent) and no prompt, agent, or
script in the tree performs compaction (spike §2, "no existing competing prompt"). `docs/spike-doc-compaction.draft.md`
is superseded; it is cited here only as the framing source, never as authority.

**How this plan treats the one-file problem.** A single Markdown deliverable cannot be split
across concurrently running writers — two agents editing one prompt body collide on every
heading. So the batches here are **write phases separated by verification, not workstreams**:
T1 drafts and stages the eight body blocks, T2 makes one pass that assembles the whole file
from the staged blocks, T3 verifies and finalises against the D-1…D-13 checklist, T4 runs the
gate. T2 and T3 both live in Batch B because neither depends on the other *as a task*, but they
**must execute sequentially in ID order** — they touch the same file. This is stated in
DR-01 below and restated in each task. A coder executing this plan runs it top to bottom,
one agent, no fan-out.

**What "portable" means mechanically.** Nothing in the prompt may name a repository, an
absolute path, or a project-specific layout. The only constants permitted are the generic
defaults: the `docs/` directory and root-level `*.md`. Every other root is discovered at run
time (REQ-03, CON-02). A grep for a literal consumer repo name in the finished file returns `0`
(TEST-02).

**What "safe by default" means mechanically.** The default invocation writes exactly two
artefacts — the human report on stdout and `.doc-compaction/report.json` — and modifies **no
existing file**. Merges, archives, and removals require an explicit apply flag, and removals
additionally require the exact `rm`/`git rm` manifest to be printed *before* any removal
(D-1, D-3, REQ-01, TEST-04).

**Out of scope (unchanged from the spike):** `.agents/instructions/`, `.agents/skills/`,
`.agents/config/`, `AGENTS.md`, `opencode.json`, and `memory-bank/**` are hard-excluded from any
rewrite, merge, or deletion and appear only as informational findings (D-10); no non-Markdown
assets (O-2); no index or embedding integration (D-11, O-3, O-4); no "docs already compact"
refusal threshold (O-1); no hardcoded repository name or path (D-5).

**Authority:** D-1…D-13 in `docs/spike-doc-compaction.md`. Where this plan adds detail the spike
left to the prompt author — the JSON schema field names, the six classification classes, the
scoring arithmetic, the root-discovery precedence order, the archive root name — it is recorded
as DR-n (a plan-level choice inside the spike's bounds, reasoned in the table below) or as an
ALT-, and it never contradicts a decision.

**Prior state this plan does not disturb.** `git status` at planning time shows unrelated
in-flight work (modified `memory-bank/`, `docs/tracker-log.md`, `docs/TRACKER-INDEX.md`, and
three other uncommitted spikes). T4's TEST-09 must therefore be read as *"no new modification
attributable to this work"*, not as *"a clean tree"*: it asserts the absence of changes to
`package.json`, `scripts/`, `.agents/instructions/`, and `docs/spike-*`, and the presence of
FILE-01. It does not assert an otherwise-empty `git status`.

## Parallel Execution Summary

| Batch | Tasks | Can run in parallel? | Depends on |
|-------|-------|---------------------|------------|
| A | T1 | No (single) — stages the eight body blocks | — |
| B | T2, T3 | No — both edit the one deliverable; run T2 then T3 | A (T2←T1, T3←T1, T3←T2) |
| C | T4 | No (single) — whole-file verification gate | B |

This plan covers a **one-file deliverable**. There is no honest parallel fan-out: T2 and T3
both write `.agents/prompts/doc-compaction.prompt.md`. The batches above exist so that the
verification gate (T4) cannot run before the file is assembled, and so that the drafting of the
eight body blocks (T1) is a separate, reviewable act. See DR-01.

## Decision Record — plan-level choices inside the spike's bounds

| ID | Choice | Source | Consequence |
|----|--------|--------|-------------|
| DR-01 | Batches are write phases, not workstreams; T2→T3 are sequential within Batch B. | The deliverable is one file. | A coder executes top to bottom with one agent; no subagent fan-out. |
| DR-02 | Body blocks are staged in T1 as an ordered checklist of required content, then assembled in one pass in T2. | Avoids eight partial rewrites of one file. | T1 produces a reviewed outline; T2 produces the file; T3 verifies against the checklist. |
| DR-03 | The JSON schema fields are fixed in T1 and copied verbatim into T2. | D-8 leaves schema authorship to the prompt; a plan-time-locked schema makes TEST-06 checkable. | Field names in T2 must match the T1 list byte for byte. |
| DR-04 | Six classification classes are adopted, not the spike's two. | D-2 and D-10 are two rules; a report needs per-document outcomes, and a document can be both historical and hard-excluded. | REPORTED-ONLY precedence resolves overlaps (see Phase 1 staging, block 4). |
| DR-05 | Archive root defaults to `.doc-compaction/archive/`, overridable by an explicit apply argument. | D-9 mandates a single archive root but does not name it. | One constant is added beyond docs/ and root *.md; it is a *write* target, never a scan root. |
| DR-06 | The prompt ships in the package with no `package.json` or `scripts/sync.js` edit. | `.agents/` is already in `files` and in the sync copy loop; sync copies every file under `.agents/`. | T4 asserts no packaging edit was made. |

## Requirements & Constraints

### Requirements

| ID | Description |
|----|-------------|
| REQ-01 | The default invocation is read-only with respect to existing files. It writes only `.doc-compaction/report.json` and the human report. |
| REQ-02 | The prompt has two named modes — `report` (default) and `apply` (opt-in) — and the apply mode is gated behind both the flag and a printed-manifest step. |
| REQ-03 | No repository name, no project-specific path, and no absolute path appears in the prompt. Roots are discovered at run time through an explicit precedence chain; the generic defaults `docs/` and root `*.md` are the only permitted constants. |
| REQ-04 | Every deletion candidate cites at least one mechanically checkable reason drawn from the scored checklist. "Old" or "unused" alone is not a reason. |
| REQ-05 | Historical documents (`docs/spike-*.md`, tracker logs, completed plans, archived records) are classified but never content-rewritten. They may be marked, archived, or indexed. |
| REQ-06 | `.agents/instructions/`, `.agents/skills/`, `.agents/config/`, `AGENTS.md`, `opencode.json`, and `memory-bank/**` are hard-excluded from rewrite, merge, and deletion; they appear only as informational findings. |
| REQ-07 | The scan soft-caps at ~200 Markdown files and prints a `PARTIAL SCAN` banner in **both** the human report and `report.json`, with narrowing guidance naming the optional path/glob argument. |
| REQ-08 | Every merge attributes each consolidated section inline to its source document. |
| REQ-09 | Every merge verifies links and anchors; a merge that would break a reference halts rather than proceeding. |
| REQ-10 | Every merge records a per-merge before/after diff summary in the report. |
| REQ-11 | Archival is a path-preserving `git mv` into a single archive root; a non-git target gets a printed move list instead of moves. |
| REQ-12 | The frontmatter carries `description` (recommended) and may carry `name`; it carries **no** `agent:`, `tools:`, `model:`, or any other tool/model/agent field. |
| REQ-13 | The body contains the six baseline sections in the mandated order: `Mission` (or `Primary Directive`), `Scope & Preconditions`, `Inputs`, `Workflow`, `Output Expectations`, `Quality Assurance`. |
| REQ-14 | The prompt declares its required tools (`Read`, `Grep`, `Glob`, `Bash`, `Write`) and names `Bash` explicitly, per the instructions file. |

### Constraints

| ID | Description |
|----|-------------|
| CON-01 | The only file created by this plan is `.agents/prompts/doc-compaction.prompt.md`. No source code, no scripts, no tests, no workflows, no `package.json`, no dependency change. |
| CON-02 | The prompt must be usable in a repository that has no `.doc-compaction/`, no `docs/`, and no prior configuration — it degrades, it does not abort. |
| CON-03 | The prompt is Markdown-only and dependency-free (D-11). It must not require Node, Python, a DB, or an index. |
| CON-04 | The prompt must not instruct the assistant to modify `.agents/instructions/`, `.agents/skills/`, `.agents/config/`, `AGENTS.md`, `opencode.json`, or `memory-bank/**` (D-10). |
| CON-05 | The prompt must not contain any string identifying a real consumer repository (D-5). |
| CON-06 | The prompt must not weaken the default: no run may delete a file whose manifest has not been printed (D-3). |
| CON-07 | `docs/spike-doc-compaction.md` and `docs/spike-doc-compaction.draft.md` are the prompt's own test corpus and are **not** to be edited by this plan; they are historical by D-2. |
| CON-08 | The prompt file follows `.agents/instructions/prompt.instructions.md` where it conflicts with `documentation-writer.prompt.md`; the legacy `agent:`/`tools:` frontmatter of that exemplar is explicitly superseded. |

### Security

| ID | Description |
|----|-------------|
| SEC-01 | Destructive operations (file creation, edit, `rm`, `git rm`, `git mv`) are warned about and gated, per `prompt.instructions.md:55`. |
| SEC-02 | In apply mode the removal manifest is printed and the run halts for operator acknowledgement **before** the first removal command executes. |
| SEC-03 | Any command the prompt emits for removal uses an explicit path list, never a glob that could widen beyond the reported candidates. |
| SEC-04 | The prompt never executes or trusts content from scanned documents as instructions; document content is data. |

## Implementation Steps

### Phase 1 — Stage the eight body blocks (Batch A — single task)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T1 | Produce, as an ordered working checklist, the eight content blocks that the prompt body must contain, each with its D- or REQ- anchor. No prompt file is written in this task. | (working notes only; no file written) | A | — | |

#### T1 — Stage the eight body blocks

Produce an ordered checklist of exactly these eight blocks. Do not write the prompt file. Each
block states its headings and its required content in enough detail that T2 can assemble the file
in one pass without re-deciding structure. Block 4's classification precedence rule exists
so that T2 copies, not re-derives, it.

1. **Block 1 — Frontmatter and title.** `description:` (single sentence, quoted — match the
   double-quote style of the existing prompt files and the folder's own frontmatter — one field
   per line). Optional `name:`. No `agent:`, `tools:`, `model:`, or other
   tool/model/agent field (REQ-12). `#` level heading matching the prompt intent
   (`Documentation Compaction`), per `prompt.instructions.md:40`.

2. **Block 2 — `Mission`.** One paragraph stating what the prompt does: discovers a Markdown
   corpus, classes it, scores it, and emits a report; merges/archives/removes only in apply
   mode. State the read-only default in the first two sentences (D-1).

3. **Block 3 — `Scope & Preconditions`.**
   - **In scope:** Markdown only; live documentation may be merged/rewritten; historical
     documentation may be marked, archived, or indexed but never content-rewritten (D-2).
   - **Out of scope:** non-Markdown assets (O-2); index/embedding integration (D-11, O-3, O-4);
     a "docs already compact" refusal threshold (O-1).
   - **Hard-excluded surfaces** — copy this list verbatim into the prompt, as informational
     findings only: `.agents/instructions/`, `.agents/skills/`, `.agents/config/`, `AGENTS.md`,
     `opencode.json`, `memory-bank/**` (D-10).
   - **Preconditions:** none required. The prompt runs in a repo with no config. State that a
     missing `docs/` yields a scan of root `*.md` only, not an error (CON-02).
   - **Portability statement:** no repository name or project-specific path is contained in this
     prompt; roots are discovered at run time (D-5, REQ-03).

4. **Block 4 — `Inputs`.**
   - **Zero required arguments** (D-7). One optional argument: a path or glob that narrows the
     scan. Document the narrowing semantics: an argument replaces the discovery chain's result
     with its own match set, and the scan reports that narrowing in both outputs.
   - **Root-discovery precedence chain** (D-7), stated as an ordered list. Adopt this order:
     (a) the optional path/glob argument if present; else (b) `docs/` recursively if it exists;
     else (c) root-level `*.md`; else (d) a repository-wide `**/*.md` sweep, excluding
     `node_modules/`, `.git/`, and the hard-excluded surfaces. State that (a) overrides (b)–(d)
     entirely, and that (b) and (c) are cumulative when both exist.
   - **Six classification classes** (DR-04), with the report's outcome for each:
     1. `LIVE` — current documentation; merge/rewrite permitted in apply mode.
     2. `HISTORICAL` — spikes, tracker logs, completed plans, archived records; never
        content-rewritten; may be marked, archived, indexed (D-2).
     3. `HARD-EXCLUDED` — the six surfaces above; informational finding only (D-10).
     4. `ARCHIVE` — already under the archive root; reported, never re-processed.
     5. `CORPUS-GENERATED` — `.doc-compaction/report.json` and the human report itself; excluded
        from the scan by definition.
     6. `AMBIGUOUS` — classification could not be established from content and path alone;
        reported for human decision, never merged or deleted automatically.
   - **Precedence rule, stated explicitly** so classes never conflict: `HARD-EXCLUDED` >
     `ARCHIVE` > `CORPUS-GENERATED` > `HISTORICAL` > `LIVE`; `AMBIGUOUS` is assigned only when
     no other class matches. A document under both a hard-excluded prefix and a historical
     pattern is `HARD-EXCLUDED`.
   - **Scored deletion checklist** (D-4). Adopt a point table with mechanically checkable rows,
     for example: superseded by a named document (3), zero inbound links from the scanned corpus
     (2), content fully contained in another scanned document (2), not referenced by any
     `AGENTS.md`/`README.md`/`docs/` index (1), last git modification older than the corpus
     median (1). State the arithmetic and the threshold that makes a candidate. State the hard
     rule in its own sentence: **a candidate with a score of 0, or with no cited reason row, is
     not a deletion candidate** — `old and unused` is not a reason (D-4, REQ-04).
   - **The `PARTIAL SCAN` cap** (D-12): soft cap ~200 Markdown files. State the cap value as a
     named constant used in both outputs.
   - **The `report.json` schema** (D-8, DR-03). Fix these fields at plan time; T2 copies them
     verbatim and T4 greps for them:

     ```json
     {
       "schema_version": 1,
       "generated_at": "<ISO-8601>",
       "mode": "report | apply",
       "partial_scan": false,
       "scan_roots": ["<discovered root>"],
       "narrowed_by": "<optional argument or null>",
       "file_count": 0,
       "cap": 200,
       "documents": [
         {
           "path": "<repo-relative>",
           "class": "LIVE | HISTORICAL | HARD-EXCLUDED | ARCHIVE | CORPUS-GENERATED | AMBIGUOUS",
           "score": 0,
           "reasons": ["<checklist row id>"],
           "action": "KEEP | MERGE | ARCHIVE | DELETE | MARK | INFORMATIONAL | DEFER"
         }
       ],
       "merges": [
         {
           "target": "<path>",
           "sources": ["<path>"],
           "diff_summary": "<before/after>",
           "links_verified": true
         }
       ],
       "deletions": ["<path>"],
       "archives": [{ "from": "<path>", "to": "<path>" }],
       "halted": [{ "merge": "<path>", "reason": "<broken reference>" }]
     }
     ```

5. **Block 5 — `Workflow`.** Numbered steps, each with its halt condition:
   1. **Mode resolution.** Read the optional argument. `report` is the default and modifies no
      existing file. `apply` is entered only when the flag is present **and** the operator has
      confirmed. State that an unrecognised flag stops the run (D-1, D-3).
   2. **Root discovery.** Apply the Block 4 precedence chain. Print the resolved roots and
      whether the scan was narrowed.
   3. **Enumeration and cap.** Enumerate Markdown files under the roots, excluding the
      hard-excluded surfaces and the archive root. If the count exceeds the cap, keep the cap,
      set `partial_scan: true`, and print the `PARTIAL SCAN` banner plus narrowing guidance
      (D-12, REQ-07).
   4. **Classification.** Assign one class per document using the Block 4 precedence rule.
   5. **Scoring.** Apply the checklist to `LIVE` and `AMBIGUOUS` documents. Record the rows that
      fired; a document with no rows keeps score 0 and action `KEEP`.
   6. **Proposal assembly.** Build the merge set (candidate consolidations among `LIVE`
      documents), the archive set (`HISTORICAL` documents proposed for archival), and the
      deletion set (scored candidates). State that a proposal is a proposal: in `report` mode
      nothing is executed.
   7. **Merge fidelity gate** (D-13, REQ-08–10). For each proposed merge, before writing
      anything: (a) plan inline attribution for every consolidated section naming its source
      document; (b) extract and verify every link and anchor that the merge would affect, both
      inbound and outbound; a reference that would break **halts that merge**, records it under
      `halted` in `report.json`, and prints it in the human report — the run does not proceed
      with that merge and does not silently drop it; (c) produce a before/after diff summary.
   8. **Report emission.** Write the human report to the terminal and `.doc-compaction/report.json`.
      This step runs in **both** modes. State that `.doc-compaction/` is created if absent and
      that both artefacts are named explicitly.
   9. **Apply gate.** Only in `apply` mode: print the complete change manifest — merges with
      their diff summaries, archives with `from`/`to`, and removals as an explicit path list —
      then **halt for operator acknowledgement**. Name `Bash` as required here. State that no
      `rm`, `git rm`, or `git mv` is emitted before the acknowledgement (SEC-02).
   10. **Execution.** After acknowledgement: perform merges (attributing each section), archive
        with path-preserving `git mv` — or print the move list and skip if the target is not a
        git work tree (D-9) — and remove only the acknowledged removal paths, with explicit
        paths and no globs (SEC-03).
   11. **Post-run.** Re-report the final state and state that re-running in `report` mode is the
        verification path.

6. **Block 6 — `Output Expectations`.** Two artefacts, both always:
   - **Human report** on the terminal, with these sections in order: run header (mode, roots,
     narrowing, cap, `PARTIAL SCAN` banner when set); classification summary table; scored
     candidates table with the cited reasons; proposed merges with per-merge diff summaries;
     proposed archives; proposed removals with their reasons; halted merges with their broken
     references; informational findings for hard-excluded surfaces.
   - **`.doc-compaction/report.json`** matching the Block 4 schema exactly (D-8).
   - State the success criteria (a report was produced and every candidate carries a reason) and
     the failure triggers that halt the run (unrecognised argument; `apply` requested without
     acknowledgement; a merge with a broken reference — that merge halts, not the run).

7. **Block 7 — `Quality Assurance`.** A checklist the assistant runs before emitting output:
   frontmatter has no tool/model/agent field; zero repository-specific names; default mode
   touched no existing file; every deletion candidate cites ≥1 checklist row; no hard-excluded
   surface was edited; `PARTIAL SCAN` present in both outputs when the cap was hit; every merge
   carries attribution, verification result, and a diff summary; `report.json` parses and
   contains the fixed field names. Each item maps to a REQ- identifier.

8. **Block 8 — `Guard rails`.** State, in its own subsection (SEC-01):
   - default mode is read-only; writes happen only in `apply`;
   - removals require the printed manifest and acknowledgement first;
   - historical and hard-excluded documents are never content-rewritten;
   - a merge that breaks a reference halts;
   - explicit paths, never globs, in removal commands.

- **Completion criterion:** the checklist names all eight blocks, and Block 4 carries the fixed
  JSON schema (DR-03), the six classes with the precedence rule (DR-04), the precedence-chain
  order, the checklist points and threshold, and the cap constant.
- **Validation:** read the checklist back against REQ-01…REQ-14 and confirm every requirement is
  covered by at least one block; record the mapping.

### Phase 2 — Assemble the prompt file (Batch B — T2 then T3, one file)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T2 | Create the prompt file in one pass from the T1 checklist: exact filename, conforming frontmatter, six baseline sections in order, and the eight blocks placed inside them. | `.agents/prompts/doc-compaction.prompt.md` | B | T1 | |
| T3 | Verify and finalise the assembled file against the D-1…D-13 and REQ coverage tables; correct any drift from the T1 checklist including the JSON schema field names, the six-class precedence rule, and the `PARTIAL SCAN` placement. | `.agents/prompts/doc-compaction.prompt.md` | B | T1, T2 | |

#### T2 — Create the prompt file

- **File:** `.agents/prompts/doc-compaction.prompt.md` (create; confirmed absent at planning time)
- **Name and placement:** kebab-case, `.prompt.md`, under `.agents/prompts/` —
  `prompt.instructions.md:35`. No other filename is acceptable.
- **Structure:** `#` heading first (Block 1), then the six baseline sections in this exact order —
  `## Mission`, `## Scope & Preconditions`, `## Inputs`, `## Workflow`, `## Output Expectations`,
  `## Quality Assurance` — followed by `## Guard rails` (Block 8). Blocks 3 and 4 live inside
  `Scope & Preconditions` and `Inputs`; blocks 5–7 are the last three of the six. The guard rails
  subsection comes last so the assistant reads the fence after the workflow (REQ-13).
- **Frontmatter:** exactly `description` and, optionally, `name`, single-quoted, one per line.
  Reasoning: `prompt.instructions.md:31` forbids tool/model/agent fields; `documentation-writer.prompt.md`
  is the superseded precedent (CON-08).
- **Style:** imperative sentences to the assistant ("Analyse", "Enumerate", "Halt"), short and
  unambiguous; no idioms (`prompt.instructions.md:58-62`). Tool names appear by their exact
  opencode names: `Read`, `Grep`, `Glob`, `Bash`, `Write`.
- **Markdown produced by the prompt** must follow `.agents/instructions/markdown.instructions.md`:
  H2/H3 hierarchy, no H4+, `-` bullets, fenced blocks with a language, no line over 400
  characters. Note in the prompt that the document frontmatter fields listed in
  `markdown.instructions.md` apply to published content; the reports this prompt emits carry only
  `schema_version`/provenance, and the prompt must say so rather than emit publishing metadata.
- **Portability:** no consumer repository name, no absolute path. The only constants are `docs/`,
  root `*.md`, the hard-excluded surface list (D-10), and the archive root `.doc-compaction/archive/`
  (DR-05). Grep-check before handing to T3.
- **Completion criterion:** the file exists at the exact path, contains all six baseline headings
  in order plus `## Guard rails`, and contains the literal `PARTIAL SCAN`.
- **Validation:** `grep -c '^## '` returns 7; `grep -n '^## '` shows the order above.

#### T3 — Verify and finalise

- **File:** `.agents/prompts/doc-compaction.prompt.md`
- **Method:** read the file top to bottom against the T1 checklist and the two coverage tables
  below. Correct drift; do not restructure. Every correction is a text change inside an existing
  heading.
- **Decision coverage** — each row must be visibly satisfied in the file:

  | Decision | Where the file must satisfy it |
  |---|---|
  | D-1 | Mission (first two sentences) and Workflow step 1 and 9 |
  | D-2 | Scope & Preconditions, Block 4 class `HISTORICAL`, and Guard rails |
  | D-3 | Workflow steps 1, 9, 10; Guard rails |
  | D-4 | Block 4 scored checklist and its hard rule |
  | D-5 | Scope & Preconditions portability statement; zero repo names |
  | D-6 | The file path and name itself |
  | D-7 | Inputs, precedence chain |
  | D-8 | Workflow step 8 and the fixed schema |
  | D-9 | Workflow step 10, `git mv`, non-git move list |
  | D-10 | Scope & Preconditions hard-excluded list, verbatim |
  | D-11 | Scope & Preconditions out-of-scope; zero dependencies |
  | D-12 | Inputs cap constant; Workflow step 3; both outputs |
  | D-13 | Workflow step 7 and the `merges`/`halted` schema fields |

- **Requirement coverage:** confirm REQ-01…REQ-14 each map to at least one heading; record the
  mapping in the task comment. A requirement with no home is a defect, not a judgement call.
- **Deferral fence:** confirm the file does **not** implement O-1 (no refusal threshold), O-2
  (no asset handling), O-3/O-4 (no index integration). Stating them as out of scope is correct;
  implementing them is a defect.
- **Completion criterion:** the decision table has no empty "where" cell, the requirement map
  is complete, and no deferral is implemented.
- **Validation:** the greps in TEST-01 and TEST-02 return the stated counts.

### Phase 3 — Verification gate (Batch C — single task)

| Task ID | Description | File(s) | Batch | Dependencies | Completed |
|---------|-------------|---------|-------|--------------|-----------|
| T4 | Run the full gate: file-shape greps, portability scan, destructive-op guard presence, packaging untouched, and a dry read of the prompt against the spike. Record every result. | `.agents/prompts/doc-compaction.prompt.md` (read-only), plus `git status --short` | C | T2, T3 | |

#### T4 — Verification gate

- **Change:** no edits. Run each check in the Testing table and record the outcome.
- **Completion criterion:** every TEST row passes; `git status --short -- package.json scripts .agents/instructions docs/spike-doc-compaction.md docs/spike-doc-compaction.draft.md`
  is empty, and FILE-01 exists. Unrelated in-flight changes elsewhere in the tree (memory bank,
  tracker logs, other spikes) are not attributable to this work and do not fail the gate. No
  `package.json`, no `scripts/sync.js`, no `.agents/instructions/**`, no `docs/spike-*` change.
- **Failure trigger:** any TEST row failing sends the work back to T3 (text correction only); a
  packaging change sends it back to T2 as a scope violation.

## Alternatives

| ID | Option | Why rejected |
|----|--------|--------------|
| ALT-01 | Split the prompt into a prompt plus a companion instruction file under `.agents/instructions/`. | The spike fixes the deliverable as one human-invoked prompt (D-6), and an instruction file would be scanned as documentation by this very prompt and possibly classified `LIVE` — a circular hazard. |
| ALT-02 | Implement the classification and scoring as a script under `scripts/`. | D-6 and D-11: a prompt, Markdown-only, zero dependencies, no per-repo setup. A script would require Node and a sync path. |
| ALT-03 | Two classification classes (`LIVE`, `HISTORICAL`) only. | Two source rules (D-2, D-10) do not produce disjoint classes when a document is both historical and hard-excluded; the report needs one outcome per document. Six classes plus a precedence rule (DR-04) keeps the report total and the overlap deterministic. |
| ALT-04 | Make `apply` mode the default with a confirmation prompt. | D-1 is explicit: the default is read-only. A confirmation prompt still means a default run can begin a destructive path, which the spike's safety frame excludes. |
| ALT-05 | Archive root at repository root (`_archive/`). | Root real estate is sync-managed and user-visible; `.doc-compaction/archive/` keeps both report artefacts and archives under one already-namespaced directory (DR-05). |
| ALT-06 | Parallelise T2 across two agents splitting the file by section. | A single Markdown file has one heading order and one prose voice; two writers collide on overlapping context and produce an incoherent body. DR-01 records this as the reason the plan is sequential. |

## Dependencies

| ID | Dependency | Why it matters |
|----|-----------|----------------|
| DEP-01 | `.agents/instructions/prompt.instructions.md` must be read before T2. | It is the authority for filename, frontmatter, section order, and the destructive-op mandate (CON-08). |
| DEP-02 | `.agents/instructions/markdown.instructions.md` must be read before T2. | It governs the Markdown the prompt tells the assistant to produce (style, heading levels, fence languages). |
| DEP-03 | `docs/spike-doc-compaction.md` must be read before T1. | It is the only authority for D-1…D-13 and O-1…O-4; the draft is superseded and must not be used to re-derive a decision. |
| DEP-04 | T3 depends on T2's file existing. | Verification of absent text is vacuous. |
| DEP-05 | T4 depends on T3's finalisation. | The gate must run on the final text. |
| DEP-06 | No packaging change is required. | `.agents/` is in `package.json` `files` and in the sync copy loop (`scripts/sync.js` copies every file under `.agents/`); `.agents/prompts/` therefore ships without an edit (DR-06). |

## Files

| ID | Path | Action |
|----|------|--------|
| FILE-01 | `.agents/prompts/doc-compaction.prompt.md` | Create (T2; finalised in T3) |
| FILE-02 | `plan/feature-doc-compaction-prompt-v1.md` | Create (this plan) |

Untouched by design: `package.json`, `scripts/sync.js`, `.agents/instructions/**`,
`.agents/skills/**`, `.agents/config/**`, `AGENTS.md`, `opencode.json`, `memory-bank/**`,
`docs/spike-doc-compaction.md`, `docs/spike-doc-compaction.draft.md`.

## Testing

| ID | What | Command (run from repository root) | Pass condition |
|----|------|-----------------------------------|----------------|
| TEST-01 | File exists; six baseline headings in order plus guard rails | `grep -n '^## ' .agents/prompts/doc-compaction.prompt.md` | exactly 7 `##` headings, in order: Mission, Scope & Preconditions, Inputs, Workflow, Output Expectations, Quality Assurance, Guard rails |
| TEST-02 | Portability — no consumer repository name, no absolute path | `grep -nE 'apmc-cms\|/Users/\|/home/\|C:\\\\' .agents/prompts/doc-compaction.prompt.md` | no output (exit 1) |
| TEST-03 | Frontmatter carries no tool/model/agent field | `grep -nE '^(agent\|tools\|model\|temperature):' .agents/prompts/doc-compaction.prompt.md` | no output (exit 1) |
| TEST-04 | Destructive-op guard present | `grep -c 'PARTIAL SCAN' .agents/prompts/doc-compaction.prompt.md` and `grep -nE 'rm \|git rm\|git mv\|manifest\|acknowledg' .agents/prompts/doc-compaction.prompt.md` | `PARTIAL SCAN` count ≥ 2 (both outputs described); the guard grep returns ≥ 4 matching lines |
| TEST-05 | Hard-excluded surfaces stated verbatim | `grep -cE '\.agents/instructions/\|\.agents/skills/\|\.agents/config/\|AGENTS\.md\|opencode\.json\|memory-bank/' .agents/prompts/doc-compaction.prompt.md` | count ≥ 6 (one per surface) |
| TEST-06 | `report.json` schema fields present | `for f in schema_version generated_at mode partial_scan scan_roots narrowed_by file_count cap documents merges deletions archives halted; do grep -q "\"$f\"" .agents/prompts/doc-compaction.prompt.md \|\| echo "MISSING $f"; done` | no `MISSING` line |
| TEST-07 | Six classes and the precedence rule present | `grep -cE 'LIVE\|HISTORICAL\|HARD-EXCLUDED\|ARCHIVE\|CORPUS-GENERATED\|AMBIGUOUS' .agents/prompts/doc-compaction.prompt.md` | count ≥ 6 and the file contains a stated precedence order among them |
| TEST-08 | Merge fidelity trio present | `grep -nE 'attribut\|anchor\|diff summary\|halt' .agents/prompts/doc-compaction.prompt.md` | lines covering each of D-13 (a), (b), (c) |
| TEST-09 | Packaging untouched (scoped) | `git status --short --` + the four protected path groups (`package.json scripts .agents/instructions docs/spike-doc-compaction.md docs/spike-doc-compaction.draft.md`), then `test -f` the deliverable | the `git status` call prints nothing; `test -f` exits 0. Unrelated in-flight changes elsewhere are out of scope. |
| TEST-10 | Non-vacuity of TEST-02 | append the string `example-real-repo` to a temporary copy of the file, run TEST-02 against the copy, delete the copy | TEST-02 must fail on the seeded string; a portability scan that cannot fail is not evidence |
| TEST-11 | Repo unit gate stays green | `npm run test:unit` | 0 failed (no test should be affected; this proves the new prompt did not disturb a parity spec) |

## Risks & Assumptions

| ID | Type | Description | Mitigation |
|----|------|-------------|------------|
| RISK-01 | Risk | **The prompt is a write-capable artefact and a careless `apply` run could delete live documentation.** | D-1/D-3 are encoded twice (Workflow and Guard rails), the removal manifest prints and halts before execution, and SEC-03 forbids globs. TEST-04 checks the guard text survives. |
| RISK-02 | Risk | A merge silently breaks a relative link, and the report looks clean. | D-13(b) is a halt condition, not a warning; the merge lands in `halted` in `report.json` (Block 4 schema) and in the human report. T3's coverage table requires D-13 in both. |
| RISK-03 | Risk | A repo name leaks into the prompt during authoring (e.g. from the spike's motivating example). | TEST-02 greps for it; TEST-10 proves that grep can fail. The spike itself names the example in its text; the prompt must not. |
| RISK-04 | Risk | The six-class precedence rule is ambiguous for a document that is both `HISTORICAL` and under a hard-excluded path. | Precedence is stated as `HARD-EXCLUDED` > `ARCHIVE` > `CORPUS-GENERATED` > `HISTORICAL` > `LIVE`, with `AMBIGUOUS` as the fallback for a no-match. A document cannot receive two classes. |
| RISK-05 | Risk | `.doc-compaction/` is left untracked and reappears in `git status` for consumers. | Not a defect of this plan: the directory is a run artefact, and D-8 mandates it. The prompt states the path explicitly so an operator can ignore or commit it knowingly. Adding a `.gitignore` entry would be a packaging change outside CON-01. |
| RISK-06 | Risk | The fixed JSON schema (DR-03) over-constrains a future consumer. | It is `schema_version: 1`; O-3/O-4 are exactly the future consumer path, and a schema change is a prompt edit, not a break. |
| RISK-07 | Risk | The prompt duplicates guidance that lives in `markdown.instructions.md` and drifts from it. | The prompt references the instructions file by relative link (`prompt.instructions.md:43`) rather than restating it, and T3 checks the reference is present. |
| ASSUMPTION-01 | Assumption | `.agents/prompts/` ships to consumers without a `package.json` or `scripts/sync.js` edit. | Verified: `.agents/` is in `files` and in the sync copy loop; `scripts/sync.js` has no `prompts` special case. DEP-06, DR-06. Re-check if the sync loop gains a subdirectory allowlist. |
| ASSUMPTION-02 | Assumption | opencode prompt frontmatter accepts `description` and `name` only for this use. | `prompt.instructions.md:22-31` states this. If a consumer adds `language`/`tags`, the prompt's frontmatter is not the place to invent them. |
| ASSUMPTION-03 | Assumption | A ~200-file cap is a reasonable v1 bound for the repositories in question. | D-12 fixed it. The cap is a named constant, so revisiting is a one-line change; O-1 remains deferred. |
| ASSUMPTION-04 | Assumption | The six baseline section names are fixed, with `Mission` acceptable as the first. | `prompt.instructions.md:41` allows `Mission or Primary Directive`; this plan fixes `Mission` and fixes the names so TEST-01 can assert on them. |
| ASSUMPTION-05 | Assumption | No existing test asserts on a `.agents/prompts/` file count. | `npm run test:unit` is the gate (TEST-11); no parity spec was found that enumerates prompts. Confirm at T4. |

## Related Specifications

| Document | Relationship |
|---|---|
| `docs/spike-doc-compaction.md` | The settled scope for this plan: D-1…D-13 are encoded as REQ-01…REQ-14; O-1…O-4 are fenced as out of scope. |
| `docs/spike-doc-compaction.draft.md` | Superseded framing source. Cited for background only; no decision is re-derived from it. |
| `.agents/instructions/prompt.instructions.md` | Authoritative conventions for the deliverable: filename/location, frontmatter, six baseline sections, destructive-op guard rails, tool naming, output definition. |
| `.agents/instructions/markdown.instructions.md` | Governs the Markdown style the prompt instructs the assistant to produce. |
| `.agents/instructions/learned-knowledge.instructions.md` | The historical-freeze rule that D-2 encodes as the `HISTORICAL` class. |
| `.agents/prompts/documentation-writer.prompt.md`, `.agents/prompts/editconfig.prompt.md` | House style for prompt prose. The former's legacy `agent:`/`tools:` frontmatter is explicitly superseded (CON-08). |
| `AGENTS.md` → `### Implementation Plan Generation` | Defines this plan's table shape and batch semantics. |
| `.opencode/agents/implementer.md` | The planning authority for the fields used here. |
