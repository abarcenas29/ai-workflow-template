# Progress

## What Works

- Playwright E2E testing (2 spec files in `tests/`)
- npm package distribution (`@abarcenas/ai-workflow-template` v1.22.0)
- Husky git hooks
- Sync script (`npm run sync`) for template distribution
- All agent definitions present and valid (implementer, coder, unit-tester, reviewer, tracker)
- Orchestrator agents defined (tdd-orchestrator, feature-pipeline, orchestrator)
- 20+ skills in `.agents/skills/`
- 15+ instruction files in `.agents/instructions/`
- graphify knowledge graph generated (1328 nodes, 1299 edges)
- Architecture context documented in `docs/.architecture-context.md`
- Memory bank fully populated with project context

## What's Left

- **TDD Orchestrator**: Infrastructure ready, needs first real task/feature to run through pipeline
- **Unit tests**: Vitest framework installed but no test files exist yet
- **Coverage baseline**: No coverage data until first test run
- **Feature pipeline**: Haven't been exercised since bootstrap
- **Remaining instruction files**: Some may still contain Copilot references needing porting to opencode

## Recently Completed

### 2026-06-25: Rewrote agent.instructions.md for opencode

Rewrote `.agents/instructions/agent.instructions.md` (1068→609 lines):
- Simplified frontmatter — removed `model`, `target`, `infer`, `metadata`, `mcp-servers`, `handoffs`
- Removed ~300 lines of Copilot-only content (Handoffs, MCP Server Config, Processing/Behavior, Version Compatibility)
- Replaced tool aliases with opencode's case-sensitive tool names
- Updated all paths from `.github/agents/` to `.agents/agents/`
- Kept generic sections: orchestration, prompt structure, variables, checklist, patterns, testing
- This was the third and largest instruction file ported (after `prompt.instructions.md` and `instructions.instructions.md`)

## Current Status

**Phase:** TDD Infrastructure Bootstrap — Complete

All prerequisites for the TDD orchestrator are in place:
- ✅ Unit test framework (Vitest + coverage)
- ✅ Knowledge graph (graphify)
- ✅ Architecture context
- ✅ Memory bank populated
- ✅ Supporting directories created

## Known Issues

- No unit test files exist yet — Vitest validation pending
- The project has no `src/` directory — unit tests target `scripts/` instead
- Memory bank was manually populated (not through normal pipeline flow)
