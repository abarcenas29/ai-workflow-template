# Changelog

## 2.3.0 — 2026-11-04

### Fixed

- **The graphify plugin now uses the V2 default-definition API.**
  `.opencode/plugins/graphify.js` default-exports a definition with a stable
  `id` and a `setup` function, instead of the V1 named-export factory that
  OpenCode rejected at load with a `PluginModule.LoadError` logged only at WARN
  level — which is why the plugin never fired and nothing complained. The
  2.2.0 tarball still carried the V1 shape; run `npx ai-workflow-setup` to
  receive the corrected file.

## 2.0.0 — 2026-10-31

### Breaking changes

- **Removed the `postinstall` hook.** Installing the package no longer syncs
  files into your project — run `npx ai-workflow-setup` once after upgrading.
- **Removed the dangling `main: index.js` entry.** This package is a scaffold
  CLI (`ai-workflow-setup`), not an importable library; `require`/`import` was
  never supported.
- **Dropped Node 20.** `engines.node` is now `>=22`.

### Other changes

- **Publishing is now triggered by merging to `main`** with npm provenance
  (`.github/workflows/npm-publish.yml`). The version comes from `package.json`,
  not from a git tag or workflow input, and each release carries a signed
  attestation. A version that is already on the registry fails the run rather
  than being republished.
- The published tarball no longer ships test files (`*.test.*` / `*.spec.*`
  under `scripts/`).
