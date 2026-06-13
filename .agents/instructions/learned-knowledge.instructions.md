# Learned Knowledge

> Accumulated patterns, conventions, gotchas, and agent tuning notes from TDD and other pipeline sessions.

## Session: 2026-06-13

**Pipeline:** TDD Infrastructure Bootstrap
**Coverage:** N/A (infrastructure setup)
**TDD Iterations:** 0

**New knowledge:**
- Project is a template distribution package (npm), not a deployable application
- Source code is in `scripts/` (ES modules), not a traditional `src/` directory
- E2E tests use Playwright with `tests/` directory, `.spec.ts` extension
- Unit tests use Vitest with `scripts/` directory, `.test.{js,ts}` extension
- Playwright config uses `chromium` as default, `fullyParallel: true`
- Coverage threshold is 90% across all metrics (statements, branches, functions, lines)

**Agent tuning notes:**
- unit-tester: Must be told to look in `scripts/` for source and test files, not `src/`
- coder: Must be told the project uses ES module syntax (import/export, not require/module.exports)
- implementer: Plans should target `scripts/` for production code and tests
