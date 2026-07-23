---
description: "Valid frontmatter schema and controlled vocabulary for memory-bank and docs files"
name: "memory-schema"
---

# Memory Schema

When writing or updating files in `memory-bank/` or `docs/`, apply the following frontmatter schema. The controlled vocabulary lives in `memory-bank/.vocabulary.json` — extend it there as new concepts enter the project.

## Required Frontmatter (memory-bank/)

Every `memory-bank/**/*.md` file must have:

```yaml
---
id: <filename-slug>       # e.g., "activeContext" from "activeContext.md"
title: "<H1 heading>"     # e.g., "Active Context"
updated: YYYY-MM-DD       # ISO date of last content change
tags: [<1-5 tags>]        # From controlled vocabulary in .vocabulary.json
entities: [<0-n entries>] # Components/tools referenced; free-form but use entity_patterns as guide
category: <from list>     # One of: brief, product, architecture, tech, context, progress, task, decision
---
```

### Field Rules

- **id**: Stable slug matching the filename (lowercase, no extension). Never change after creation.
- **title**: Must match the `# H1` heading in the file body.
- **updated**: Update on every content change. Use `YYYY-MM-DD` format.
- **tags**: Pick 1–5 from `memory-bank/.vocabulary.json` → `tags.*`. New tags added by editing that file.
- **entities**: Free-form list of components, tools, or systems referenced in the file. Use the `entity_patterns` from `.vocabulary.json` as a suggestion guide.
- **category**: Exactly one from the `categories` map in `.vocabulary.json`.

### Heading Structure

Every memory-bank file must have:
- Exactly one `# Title` (H1) — matches frontmatter `title`
- Content organized under `## Sections` (H2)
- No flat text outside sections
- Each `## Section` is a searchable chunk

## Lighter Schema (docs/)

`docs/*.md` files use a lighter schema:

```yaml
---
id: <filename-slug>
title: "<H1 heading>"
updated: YYYY-MM-DD
tags: [<1-5 tags>]
doc_type: <from list>     # spike, architecture, configuration, orchestrator-log, tracker-log, decision
---
```

Docs files do not require `category`, `entities`, or strict heading structure. Hidden files (`.architecture-context.md`, `.orchestrator-log.md`) keep their leading dot.

## Auto-Suggest on Normalization

When `scripts/normalize-memory.js` runs (postinstall or manual), it:
- Adds missing frontmatter using filename, H1 title, and git modification date
- Auto-suggests `tags` by scanning content for vocabulary keywords
- Auto-suggests `entities` using regex patterns from `.vocabulary.json`
- Does NOT overwrite existing frontmatter fields
- Logs all auto-applied suggestions

## Pre-Commit Validation

The husky pre-commit hook (`scripts/validate-memory-schema.js`) rejects commits where:
- Staged memory-bank files have missing or invalid frontmatter
- `updated` field is missing or not ISO date format
- `category` is not in the allowed list
- `id` does not match the filename

The hook reads `.vocabulary.json` at validation time, so new tags/categories are picked up automatically.
