# Contributing

Thanks for improving `@abarcenas/ai-workflow-template`. This package is a
scaffold/CLI, not a runtime library — please keep that shape in mind when
proposing changes.

## Development

```bash
npm install
npm run test:unit
npm test
```

## Releasing

Releases happen on merge. When a PR lands on `main`,
`.github/workflows/npm-publish.yml` publishes the version currently in
`package.json`, with a provenance attestation attached.

`package.json` is bumped locally by the Husky pre-commit hook
(`scripts/bump-version.js`), which raises the minor version on every commit. So
whatever version is in `package.json` at merge time is the version that ships.
For commits that are not releases — CI tweaks, docs-only changes — hold the
version still with `SKIP_BUMP=1`:

```bash
SKIP_BUMP=1 git commit -m "docs: ..."
```

To retry a run that failed after the merge (transient registry error, expired
token), dispatch against `main`. There are no inputs — the version always comes
from `package.json`:

```bash
gh workflow run npm-publish.yml --ref main
```

Manual dispatch is rejected on any other ref.

`v*` tags are **not** a release mechanism any more; pushing one triggers
nothing. A version that is already on the registry fails the run by design
rather than silently republishing or skipping, so bump `package.json` instead of
re-running against the same version.

`package.json` sets `publishConfig.provenance: true`, so a local `npm publish`
is intentionally impossible: provenance requires the GitHub OIDC identity that
only Actions can mint.

Emergency escape hatch (only when Actions is unavailable):

```bash
npm publish --no-provenance --access public
```

That release ships without an attestation, and any later publish of the same
version — including the normal run after a merge — fails because the version is
already on the registry.

After 2.0.0 ships, deprecate the last pre-2.0.0 release so existing consumers
see the migration note:

```bash
npm deprecate @abarcenas/ai-workflow-template@1.49.0 "2.0.0 removed postinstall; run npx ai-workflow-setup after upgrading"
```

## Packaging rules

Never add AGENTS.project.md or opencode.json to files: both are scaffolded create-if-absent at the consumer root and must not ship from the package.

Additional notes:

- `main`, `exports`, and `types` are intentionally absent. The package exposes
  exactly one entry point: the `ai-workflow-setup` bin.
- `scripts/.npmignore` keeps `*.test.*` and `*.spec.*` files out of the
  tarball even though `scripts/` is in the `files` allowlist; do not move tests
  outside `scripts/` without updating that file.
- `CONTRIBUTING.md` is not shipped, so maintainer notes belong here rather than
  in a `"//"` key in `package.json`.
