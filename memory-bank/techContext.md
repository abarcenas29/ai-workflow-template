# Tech Context

## Technologies

| Technology | Purpose |
|---|---|
| Node.js | Runtime (ES modules) |
| npm | Package management, distribution |
| TypeScript | Configuration typing (vitest.config.ts, playwright.config.ts) |
| JavaScript (ESM) | Scripts in `scripts/` |
| Playwright | E2E testing (browser automation) |
| Vitest | Unit testing |
| @vitest/coverage-v8 | Code coverage |
| Husky | Git hooks |
| graphify CLI | Knowledge graph generation and querying |
| OpenCode | AI agent framework and orchestrator runtime |

## Development Setup

```bash
npm install          # Install dependencies + run sync script
npm test             # Run Playwright E2E tests
npm run test:unit    # Run Vitest unit tests
npm run test:unit:coverage  # Run unit tests with coverage
npm run prepare      # Setup husky git hooks
npm run sync         # Sync template files to project
```

## Technical Constraints

- ES module syntax only (`"type": "module"` in package.json)
- Source code lives in `scripts/` (not `src/`)
- E2E tests in `tests/` with `.spec.ts` extension (Playwright)
- Unit tests in `scripts/` with `.test.{js,ts}` extension (Vitest)
- Coverage threshold: 90% across all metrics
- graphify graph must be kept current via `graphify update .`
- git hooks managed by husky

## Dependencies

### Production
None (template distribution — all config files)

### Development
- `@playwright/test: ^1.59.1` — E2E testing
- `vitest` — Unit testing
- `@vitest/coverage-v8` — Coverage reporting
- `dotenv: ^17.4.2` — Environment variables
- `husky: ^9.0.0` — Git hooks
