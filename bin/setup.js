#!/usr/bin/env node

// ═════════════════════════════════════════════════════════════════════════════
// bin/setup.js — CLI entry point for `npx ai-workflow-setup`
// ═════════════════════════════════════════════════════════════════════════════
//
// Minimal shim that delegates to the orchestrator (scripts/setup/index.js).
// Uses top-level await via ESM (requires "type": "module" in package.json).
//
// Exit codes:
//   0 — All phases completed successfully
//   1 — One or more phases had warnings / were skipped
//   2 — Fatal error (discovery failure or unexpected exception)
// ═════════════════════════════════════════════════════════════════════════════

// Load consumer's .env into process.env before any phase runs
import 'dotenv/config'

try {
  const { main } = await import('../scripts/setup/index.js')
  const exitCode = await main(process.argv.slice(2))
  process.exit(exitCode)
} catch (err) {
  console.error('Fatal error:', err.message)
  process.exit(2)
}
