# Active Context

## Current Focus

**TDD Orchestrator Infrastructure Bootstrap** — Setting up all prerequisites for the TDD orchestrator to run properly.

## Recent Changes

- Added Vitest + @vitest/coverage-v8 as devDependencies
- Created `vitest.config.ts` with 90% coverage thresholds targeting `scripts/`
- Updated `package.json` with `test:unit`, `test:unit:coverage`, `test:unit:watch` scripts
- Generated graphify knowledge graph (`graphify-out/`) — 1328 nodes, 1299 edges, 131 communities
- Created `/plan/` directory for implementation plans
- Created `memory-bank/tasks/` directory with `_index.md`
- Populated `docs/.architecture-context.md` with real project architecture
- Created `docs/.orchestrator-log.md` with bootstrap log
- Created `.agents/instructions/learned-knowledge.instructions.md`
- Populated all 6 memory bank core files with real project context

## Recent Changes (continued)

- Rewrote `.agents/instructions/agent.instructions.md` (1068→609 lines) — replaced all GitHub Copilot references with opencode equivalents:
  - Simplified frontmatter to `description`, `name`, `tools` only
  - Removed Copilot-only sections: Handoffs, MCP Server Config, Agent Processing/Behavior, Version Compatibility
  - Updated tool configuration with opencode tool set (`Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Task`, `TodoWrite`, `Skill`, `WebFetch`, `WebSearch`)
  - Updated sub-agent orchestration to use `Task` tool and `.agents/agents/` paths
  - Replaced `${variableName}` syntax with plain-language descriptions

## Next Actions

1. Create a minimal unit test to verify Vitest setup works end-to-end
2. Run `npm run test:unit` to confirm the test framework is functional
3. TDD orchestrator is now ready for its first real feature/task
4. Consider creating a sample unit test in `scripts/` to validate the pipeline
5. Review remaining instruction files for any lingering Copilot references
