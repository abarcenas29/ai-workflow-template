# Framework Exclusion Registry

This document defines the framework detection markers and exclusion patterns used by `graphify-framework-aware`. Each framework entry includes its detection markers, default exclusions, and any special heuristics applied.

## Adding a New Framework

1. Add detection marker(s) to `FRAMEWORK_MARKERS` in `scripts/fw-exclude.py`.
2. Add exclusion patterns to `FRAMEWORK_EXCLUDES`.
3. If complex detection logic is needed (e.g., Hugo theme detection), add it to the `_post_process_excludes()` function.
4. Update this document with the new framework's entry.

## Supported Frameworks

### Angular

| Attribute | Value |
|-----------|-------|
| **Marker file** | `angular.json` |
| **Excluded** | `**/*.spec.ts`, `**/*.harness.ts`, `e2e/`, `src/environments/`, `karma.conf.js`, `src/test.ts` |
| **Kept** | `src/app/` (user components, services, modules), `src/assets/` |
| **Already handled by graphify** | `.angular/`, `node_modules/`, `dist/` |

### Next.js

| Attribute | Value |
|-----------|-------|
| **Marker file** | `next.config.js`, `next.config.ts`, `next.config.mjs` |
| **Excluded** | `next-env.d.ts`, `out/` |
| **Kept** | `src/app/`, `src/pages/`, `src/components/` |
| **Already handled by graphify** | `.next/`, `node_modules/` |

### Svelte / SvelteKit

| Attribute | Value |
|-----------|-------|
| **Marker file** | `svelte.config.js` |
| **Excluded** | `build/`, `**/*.test.ts` |
| **Kept** | `src/` (all user code) |
| **Already handled by graphify** | `.svelte-kit/`, `node_modules/` |

### Hugo

| Attribute | Value |
|-----------|-------|
| **Marker file** | `hugo.toml`, `hugo.yaml`, `hugo.json` |
| **Excluded (always)** | `public/`, `resources/` |
| **Excluded (conditional)** | `archetypes/` (unless modified by user), `layouts/` (unless user has custom layouts at root), theme-internal dirs (when theme is vendored via git submodule) |
| **Kept** | `content/`, `data/`, `static/`, `assets/`, user `layouts/` with custom templates |
| **Heuristics** | Detects git submodules in `themes/` to exclude theme boilerplate. Detects `layouts/` structure at project root to determine if user has custom templates. |

### Jekyll

| Attribute | Value |
|-----------|-------|
| **Marker file** | `_config.yml` |
| **Excluded** | `_site/`, `.jekyll-cache/`, `.jekyll-metadata` |
| **Kept** | `_posts/`, `_pages/`, `_data/`, `_includes/`, `_layouts/`, `_sass/`, `assets/` |
| **Already handled by graphify** | `node_modules/` |

### Docusaurus

| Attribute | Value |
|-----------|-------|
| **Marker file** | `docusaurus.config.js`, `docusaurus.config.ts` |
| **Excluded** | `.docusaurus/`, `build/` |
| **Kept** | `docs/`, `src/`, `blog/`, `static/`, `sidebars.js` |
| **Already handled by graphify** | `node_modules/` |

### Flutter

| Attribute | Value |
|-----------|-------|
| **Marker file** | `pubspec.yaml` (content-verified for `flutter` keyword) |
| **Excluded** | `.dart_tool/`, `build/`, `.flutter-plugins`, `.flutter-plugins-dependencies` |
| **Kept** | `lib/` (user code), `test/` (user tests) |
| **Already handled by graphify** | — |

### WordPress

| Attribute | Value |
|-----------|-------|
| **Marker file** | `wp-config.php` |
| **Excluded** | `wp-admin/`, `wp-includes/`, `wp-content/languages/`, `wp-content/upgrade/` |
| **Kept** | `wp-content/themes/` (custom themes), `wp-content/plugins/` (custom plugins) |
| **Already handled by graphify** | `node_modules/` |

## Noise Directories Handled by graphify (not duplicated)

The following directories are already excluded by graphify's built-in `_SKIP_DIRS` list. The framework-aware skill does NOT duplicate these patterns:

`.angular/`, `.cache/`, `.dart_tool/`, `.graphify/`, `.idea/`, `.next/`, `.nuxt/`, `.parcel-cache/`, `.pytest_cache/`, `.ruff_cache/`, `.serverless/`, `.svelte-kit/`, `.terraform/`, `.tox/`, `.turbo/`, `.venv/`, `__.pycache__/`, `build/`, `coverage/`, `dist/`, `dist-protected/`, `env/`, `graphify-out/`, `lib64/`, `node_modules/`, `out/`, `site-packages/`, `snapshots/`, `storybook-static/`, `target/`, `venv/`, `visual-tests/`

## Noise Files Handled by graphify (not duplicated)

`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `go.sum`, `go.work.sum`
