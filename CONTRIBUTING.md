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

Normal release — push a tag that matches `package.json`:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Or dispatch the workflow manually (the input must equal `package.json`'s
`version`, without the leading `v`):

```bash
gh workflow run npm-publish.yml -f version=X.Y.Z
```

`package.json` sets `publishConfig.provenance: true`, so a local `npm publish`
is intentionally impossible: provenance requires the GitHub OIDC identity that
only Actions can mint.

Emergency escape hatch (only when Actions is unavailable):

```bash
npm publish --no-provenance --access public
```

That release ships without an attestation, and pushing its tag afterwards
fails with `E403` because the version is already on the registry.

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
