# Changelog

## 2.0.0 — 2026-10-31

### Breaking changes

- **Removed the `postinstall` hook.** Installing the package no longer syncs
  files into your project — run `npx ai-workflow-setup` once after upgrading.
- **Removed the dangling `main: index.js` entry.** This package is a scaffold
  CLI (`ai-workflow-setup`), not an importable library; `require`/`import` was
  never supported.
- **Dropped Node 20.** `engines.node` is now `>=22`.

### Other changes

- Publishing is now tag-triggered with npm provenance
  (`.github/workflows/npm-publish.yml`). A tag/`package.json` version mismatch
  fails the workflow, and each release carries a signed attestation.
- The published tarball no longer ships test files (`*.test.*` / `*.spec.*`
  under `scripts/`).
