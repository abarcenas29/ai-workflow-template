---
name: graphify-framework-aware
description: Prepares framework-aware exclusions before graphify knowledge graph generation. Invoke alongside /graphify. Automatically detects Angular, Hugo, Next.js, Svelte, Jekyll, Flutter, WordPress, and Docusaurus projects and excludes their boilerplate files so the graph focuses on your custom code. Triggers on: /graphify, graphify, knowledge graph, codebase graph.
license: MIT
allowed-tools: Bash
---

# graphify-framework-aware

Automatically detects your project's framework and configures `.graphifyignore` to exclude framework boilerplate so graphify's knowledge graph focuses on your custom code.

## When to Use

Invoke this skill BEFORE running the standard `/graphify` pipeline. The skill is idempotent — running it multiple times is safe, and it will not duplicate patterns.

Use when:
- Running `/graphify` on a project for the first time
- Running `/graphify --update` to rebuild an existing graph
- After adding a new framework to a project
- After changing build tooling or project structure

Skip when:
- The project has no supported framework markers
- The `.graphifyignore` was already generated and the project structure hasn't changed
- Graph is already built and framework exclusions were already applied

## Workflow

### Step 1: Apply framework exclusions

Run the detection and apply script:

```bash
python3 <skill-base>/scripts/fw-exclude.py apply <project-path>
```

This script:
1. Scans the project root for framework marker files (e.g., `angular.json`, `hugo.toml`)
2. Generates appropriate `.graphifyignore` patterns for each detected framework
3. Idempotently writes/updates `.graphifyignore` between marker comments

The script outputs a one-line summary:
```
graphify-framework-aware: detected angular, nextjs — wrote 8 exclusion patterns to .graphifyignore
```

If no frameworks are detected, the script exits with code 2 and prints:
```
No supported frameworks detected.
```

### Step 2: Inspect the result (optional)

To preview what will be excluded without modifying files:

```bash
python3 <skill-base>/scripts/fw-exclude.py show <project-path>
```

To see detected frameworks as JSON:

```bash
python3 <skill-base>/scripts/fw-exclude.py detect <project-path>
```

### Step 3: Proceed with graphify

After exclusions are applied, invoke the standard graphify pipeline:

```
invoke skill: "graphify"
```

The `.graphifyignore` file will be read by graphify's detection step, and framework boilerplate files will be excluded from the knowledge graph.

### Step 4: Verify (optional)

Check the generated `.graphifyignore` at the project root. The framework patterns are in a clearly delimited section:

```
# ===== graphify-framework-aware (auto-generated) =====
# auto-detected framework: angular
**/*.spec.ts
**/*.harness.ts
e2e/
...
# ===== end graphify-framework-aware =====
```

User-added patterns outside this block are never modified. To re-include a framework-excluded path, add a `!` negation pattern anywhere *after* the marker block (graphify reads `.graphifyignore` with last-match-wins semantics).

## Supported Frameworks

| Framework | Marker |
|-----------|--------|
| Angular | `angular.json` |
| Next.js | `next.config.{js,ts,mjs}` |
| Svelte | `svelte.config.js` |
| Hugo | `hugo.{toml,yaml,json}` |
| Jekyll | `_config.yml` |
| Docusaurus | `docusaurus.config.{js,ts}` |
| Flutter | `pubspec.yaml` (content-verified) |
| WordPress | `wp-config.php` |

See [Framework Registry](./references/framework-registry.md) for the full list of exclusion patterns per framework and instructions for adding new frameworks.

## Script Reference

[`scripts/fw-exclude.py`](./scripts/fw-exclude.py) — Python 3.10+, no dependencies beyond stdlib.

```
usage: fw-exclude.py <detect|show|apply> <project-path>

detect  Print JSON of detected frameworks and their markers.
show    Print FW exclusion patterns (dry-run, no files written).
apply   Idempotently write/update .graphifyignore with FW patterns.
```

## Interaction with graphify

- graphify reads `.graphifyignore` (and falls back to `.gitignore`) during its `detect()` step
- Framework patterns are appended with last-match-wins semantics — user `!` patterns override them
- Directories already skipped by graphify's built-in `_SKIP_DIRS` (`node_modules/`, `.next/`, `.angular/`, `dist/`, `build/`, etc.) are NOT duplicated in the generated patterns
- This skill must run **before** invoking the graphify skill so the `.graphifyignore` is in place when graphify scans files

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No supported frameworks detected" | Project may use an unsupported framework. Add markers to `fw-exclude.py` or create `.graphifyignore` manually. |
| Too many files excluded | Check `.graphifyignore` marker block. Add `!` negation patterns after the block to re-include. |
| `pubspec.yaml` falsely detected as Flutter | Script checks for `flutter` keyword in the file content. Add `!` patterns if needed. |
| Hugo `config.toml` not detected | Script verifies content for Hugo-specific keys (`baseURL`, `title`). Rename to `hugo.toml` or add patterns manually. |
