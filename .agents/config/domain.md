---
description: "Domain artifact paths for domain-modeling and grill-with-docs"
applyTo: "**"
---

# Domain Documentation

Read this file to locate the project's domain artifacts before exploring the
codebase or changing the domain model.

## Layout

This repository uses a single-context layout:

- `GLOSSARY.md` at the repository root — the project's domain vocabulary.
- `docs/adr/` — Architecture Decision Records, numbered `0001-slug.md`,
  `0002-slug.md`, and so on.

Read only the ADRs that touch the area you are about to work in.

## When a file or directory is absent

Proceed silently. Do not report the absence, do not treat it as an error, and
do not scaffold `GLOSSARY.md` or `docs/adr/` unprompted. Create them lazily,
only when a term or decision has actually been resolved.

## Use the glossary's vocabulary

Name domain concepts exactly as `GLOSSARY.md` defines them. Do not drift to
synonyms the glossary avoids. If a concept is missing, treat it as a gap to
resolve with the user rather than inventing new language.

## Flag ADR conflicts

If your output contradicts an existing ADR, state the conflict explicitly and
cite the ADR number. Never silently override or quietly reinterpret a recorded
decision.
