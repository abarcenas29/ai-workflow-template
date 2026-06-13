# System Patterns

## Architecture

Agent-based workflow distribution system organized in layers:

```
Instructions Layer → Skills Layer → Agents Layer → Orchestrators Layer
                                    ↓
                              Memory Bank (cross-cutting)
```

## Key Design Patterns

### Agent Delegation Pattern
Orchestrators delegate work to specialized sub-agents using `subagent_type` parameter. Each agent has a defined role, permissions, and output format. Orchestrators coordinate but never execute work themselves.

### RED → GREEN → REFACTOR/VERIFY (TDD)
The TDD orchestrator enforces:
1. **RED** — Write failing tests first (unit-tester)
2. **GREEN** — Write minimal code to pass (coder)
3. **VERIFY** — Run tests, check coverage ≥ 90% (unit-tester)
4. **REFACTOR/REVIEW** — Audit quality (reviewer)
5. **DOCUMENT** — Record results (tracker)

### Memory Bank Hierarchy
```
projectbrief.md → productContext.md / systemPatterns.md / techContext.md → activeContext.md → progress.md / tasks/
```

### Knowledge Graph Integration
graphify extracts AST-level relationships automatically. Queries (`graphify explain`, `graphify path`, `graphify query`) provide focused subgraphs (~200-800 tokens) vs. raw grep (3000+ tokens).

### Standalone vs Orchestrated Mode
Agents detect invocation mode by checking if prompt starts with "This phase must be performed as the agent". Orchestrated mode skips self-documentation (orchestrator handles it). Standalone mode self-documents to `docs/tracker-log.md`.

## Component Relationships

- Agents → read `.agents/instructions/` for coding standards
- Agents → read `memory-bank/` for project context
- Orchestrators → delegate to agents via Task tool with `subagent_type`
- Skills → loaded via Skill tool, inject workflow instructions
- Scripts → sync configuration from npm package to project
- graphify → auto-updates on code changes, queried for context retrieval
