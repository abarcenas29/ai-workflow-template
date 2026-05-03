# AI Workflow Template

Publishable AI workflow starter pack for GitHub Copilot. This package distributes the `.github/` experience, auto-bumps versions through Husky, and publishes to npm on merges to `main`.

## What This Package Does

This repository is designed to be installed as an npm package instead of cloned as a one-off template. When a consuming project installs it, the package can copy its `.github/` folder into the consumer project and keep that folder in sync over time.

### Included capabilities

- Copilot instructions and workspace guidance in `.github/co-pilot.instructions.md`
- Reusable skills in `.github/skills/`
- Prompt templates in `.github/prompts/`
- Custom agents in `.github/agents/`
- Language and framework instructions in `.github/instructions/`
- Version auto-bumping via Husky pre-commit hook
- npm publishing workflow on merge to `main`

## Install

Install the package in the project that should receive the shared Copilot configuration.

```bash
npm install ai-workflow-template
```

If you publish under a scoped name, use that name instead.

## Sync Behavior

The package runs `scripts/sync.js` during `postinstall`.

- New `.github` files are copied into the consumer project
- Files that have not been edited locally are refreshed from the package
- Files that were modified locally are skipped by default

### Manual sync

Use the sync script directly when you want to refresh the consumer project on demand.

```bash
npm run sync
```

Force overwrite of tracked files when you want the package version to win.

```bash
npm run sync -- --force
```

Preview the sync without writing files.

```bash
npm run sync -- --dry-run
```

## Versioning

Husky runs a pre-commit hook that bumps the package version automatically.

- Normal commits increment the minor version and reset patch to `0`
- If the major version changes, the script resets the version to `<major>.0.0`

Example:

```text
1.2.0 -> 1.3.0
2.0.0 -> 2.1.0 on the next commit
```

## Publish Flow

GitHub Actions publishes the package to npm when changes are merged into `main`.

### Required secret

Add `NPM_TOKEN` in GitHub repository settings:

1. Open your repository on GitHub
2. Go to Settings
3. Open Secrets and variables, then Actions
4. Add a new repository secret named `NPM_TOKEN`
5. Paste an npm automation token

## Local Development

Install dependencies once to activate Husky hooks.

```bash
npm install
```

Recommended checks:

```bash
npm run sync -- --dry-run
npm pack --json
```

## Updating the Shared Template

1. Edit the files in `.github/` that should be distributed to consumer projects
2. Commit your changes
3. Merge to `main` to publish the updated package
4. Consumers can run `npm install` again to pull the latest distributed files

## Notes

- The sync script uses `INIT_CWD` so installation runs against the consuming project, not the package directory
- Local changes in a consuming repo are preserved unless you explicitly use `--force`
- The publish workflow assumes the package is public on npm
