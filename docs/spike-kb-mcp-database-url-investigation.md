# Spike: Knowledgebase MCP — DATABASE_URL Investigation

**Date:** 2026-08-01
**Status:** ✅ COMPLETE (Root Cause Found, Fix Identified)
**Researcher:** Researcher - Technical Investigation

---

## Research Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | How is the central knowledgebase configured? | `opencode.json` MCP `"knowledgebase"` entry runs `node scripts/mcp-knowledgebase-server.js` via stdio — **but with NO `env` block** |
| 2 | Where does DATABASE_URL come from? | `.env` file at project root (line 27) — `postgresql://...` to `192.168.31.200:5432/postgres` |
| 3 | Why did the MCP stats check fail? | MCP server starts without `DATABASE_URL` in its process env (no env block in opencode.json + server doesn't load dotenv) |
| 4 | Is central knowledge usable? | **YES** — if the MCP server gets `DATABASE_URL`. The `.env` is configured, Postgres is accessible, and `learned-knowledge.instructions.md` has 6 sessions |
| 5 | What's the discrepancy? | The user is correct that the knowledgebase IS configured — the MCP server process just never sees the env var |

---

## Investigation Results

### 1. MCP Server Configuration

**File:** `opencode.json` (project root), lines 59–63

```json
"knowledgebase": {
  "type": "local",
  "command": ["node", "scripts/mcp-knowledgebase-server.js"],
  "enabled": true
}
```

**CRITICAL FINDING:** No `env` block. Compare with the `github` MCP server (lines 19–27) which explicitly passes `GITHUB_PERSONAL_ACCESS_TOKEN`:

```json
"github": {
  "type": "local",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "$GITHUB_PERSONAL_ACCESS_TOKEN"
  },
  "enabled": true
}
```

The knowledgebase MCP server entry is the only one in `opencode.json` that requires environment variables but has no `env` block.

### 2. DATABASE_URL Source

**File:** `.env` (project root), line 27

```
DATABASE_URL=postgresql://postgres:[REDACTED]@192.168.31.200:5432/postgres
```

- **Format:** `postgresql://` connection string
- **Target:** PostgreSQL at `192.168.31.200:5432/postgres`
- **Status:** ✅ Present and correctly formatted

**Shell environment:** `DATABASE_URL` is NOT defined in any of:
- `~/.zshrc` — No matches
- `~/.bashrc` — No matches
- `~/.bash_profile` — No matches

It exists **only** in the project's `.env` file.

### 3. Root Cause: Why the MCP Stats Check Failed

The failure chain has three links:

#### Link A: MCP server has no `env` block in `opencode.json`
The opencode process reads `opencode.json` and spawns `node scripts/mcp-knowledgebase-server.js` as a child process. Without an `env` block, the child inherits only the parent's environment — which does NOT include `DATABASE_URL` (since it's only in `.env`, not the shell).

#### Link B: MCP server does NOT load `.env` with dotenv
**File:** `scripts/mcp-knowledgebase-server.js` — **zero dotenv imports.**

```javascript
// The MCP server's imports (lines 17–33):
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ... } from '@modelcontextprotocol/sdk/types.js';
import { search, upsertChunks, ..., getPool, closePool } from './knowledgebase-index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// ⬆️ NO dotenv import!
```

Contrast with `scripts/knowledgebase-cli.js` (line 22):
```javascript
import 'dotenv/config';  // ✅ CLI loads .env — works from project root
```

#### Link C: getPool() reads process.env.DATABASE_URL
**File:** `scripts/knowledgebase-index.js`, lines 88–98

```javascript
async function getPool() {
  if (_poolInitialised) return _pool;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[knowledgebase] DATABASE_URL not set...');
    _poolInitialised = true;
    _pool = null;
    return null;  // ← Returns null → all tools fail
  }
  // ...
}
```

When `getPool()` returns `null`, the MCP server's tool handlers return:
```
"Knowledgebase not available: DATABASE_URL is not configured."
```

### 4. Central Knowledge Availability

**Is the knowledgebase genuinely usable?** **YES** — once the MCP server receives `DATABASE_URL`:

| Evidence | Status |
|----------|--------|
| `.env` has `DATABASE_URL` | ✅ Present (line 27) |
| `pg` module installed | ✅ In `optionalDependencies` |
| `pgvector` module installed | ✅ In `optionalDependencies` |
| `learned-knowledge.instructions.md` has content | ✅ 186 lines, 6 sessions |
| PostgreSQL server reachable | ✅ `192.168.31.200:5432` |
| CLI works from project root | ✅ `knowledgebase-cli.js` loads `dotenv/config` |
| MCP server works | ❌ Just needs `DATABASE_URL` passed |

The `learned-knowledge.instructions.md` contains 6 sessions with substantial learned knowledge, including one session about the knowledgebase itself (2026-07-29 — "Centralized Knowledgebase (pgvector MCP)").

### 5. Historical Context: Same Bug Class Already Discovered

**File:** `.agents/instructions/learned-knowledge.instructions.md`, lines 139 (Session: 2026-07-30)

```
- `knowledgebase-cli.js` never called `dotenv.config()` — `DATABASE_URL` appeared unset
  even when `.env` had it. All CLI scripts that read `process.env` MUST import
  `dotenv/config`. This is a universal pattern: any Node.js script that depends on
  `.env` variables must explicitly load them; `process.env` does not auto-load `.env` files.
```

The fix was applied to `knowledgebase-cli.js` (it now has `import 'dotenv/config'`) but the same was **never applied to `mcp-knowledgebase-server.js`**.

### 6. Why the User Believes Knowledge Is Available

The user is correct that "central knowledge IS available in this project" — the infrastructure IS configured:

- `.env` has a valid `DATABASE_URL`
- The CLI works from the project root (`npm run kb:stats`, `npm run kb:sync`)
- The `memory-bank` MCP tools work fine (SQLite — no env var needed)
- The `learned-knowledge.instructions.md` has been actively maintained

The disconnect is ONLY in the MCP server process not receiving the env var.

---

## Technical Fix

### Option A: Add `env` block to opencode.json (Recommended — one-line change)

Add an `env` block to the knowledgebase MCP server entry in `opencode.json` (project root):

```json
"knowledgebase": {
  "type": "local",
  "command": ["node", "scripts/mcp-knowledgebase-server.js"],
  "env": {
    "DATABASE_URL": "$DATABASE_URL"
  },
  "enabled": true
}
```

This follows the exact same pattern as the `github` MCP server (lines 23–25). The `"$DATABASE_URL"` syntax tells opencode to resolve the env var from the parent process.

**Prerequisite:** The parent process (opencode/the user's terminal) must have `DATABASE_URL` set. Since the `.env` file is not automatically loaded by the shell, the user should ensure `DATABASE_URL` is available either:
- By sourcing the `.env`: `export $(grep -v '^#' .env | xargs)` before launching opencode
- Or by adding it to their shell profile (`~/.zshrc`)

### Option B: Add dotenv to the MCP server (Alternative)

Add `import 'dotenv/config'` at the top of `scripts/mcp-knowledgebase-server.js` (after the shebang comment block, before other imports). This makes the server self-sufficient — it loads `.env` from `process.cwd()` (which opencode sets to the project root).

```javascript
// Add after line 15, before line 17:
import 'dotenv/config';
```

**Trade-off:** This requires `dotenv` to be in `dependencies` (which it already is — `package.json` line 67: `"dotenv": "^17.4.2"`). The downside is that `process.cwd()` must be the project root for this to work, which depends on how opencode spawns the process.

### Recommendation

**Apply BOTH fixes** for belt-and-suspenders reliability:

1. **Add `env` block to `opencode.json`** (ensures the MCP server gets `DATABASE_URL` regardless of cwd)
2. **Add `import 'dotenv/config'` to `mcp-knowledgebase-server.js`** (gives the server a fallback if opencode somehow doesn't pass the env)

This is the same pattern the `bin/setup.js` CLI now uses (both `dotenv/config` AND env passthrough for spawned child processes).

---

## Verification Steps

After applying the fix, verify with:

1. Restart opencode (or reload MCP servers)
2. Call `knowledgebase_knowledgebase_stats` — should return stats, NOT "not configured"
3. Call `knowledgebase_knowledgebase_list` — should list indexed projects
4. Call `knowledgebase_knowledgebase_search` with a query — should return results

---

## Files Examined

| File | Purpose |
|------|---------|
| `opencode.json` (root) | MCP server registration — knowledgebase has NO env block |
| `opencode.mcp.example.json` | Example config — knowledgebase NOT present |
| `.opencode/opencode.json` | Nested config — graphify plugin only, no MCP |
| `~/.config/opencode/opencode.json` | Global config — provider settings only, no MCP |
| `.env` | DATABASE_URL present (line 27) |
| `.env.example` | DATABASE_URL documented as optional |
| `scripts/mcp-knowledgebase-server.js` | MCP server — NO dotenv import |
| `scripts/knowledgebase-cli.js` | CLI — HAS `import 'dotenv/config'` (line 22) |
| `scripts/knowledgebase-index.js` | Core engine — `getPool()` reads `process.env.DATABASE_URL` |
| `package.json` | Dependencies — `dotenv`, `pg`, `pgvector` |
| `.agents/instructions/learned-knowledge.instructions.md` | 6 sessions, 186 lines of learned knowledge |
| `memory-bank/activeContext.md` | Confirms knowledgebase feature completion |

---

## Decision Trail

1. **Initial hypothesis:** OpenCode might not be spawning the MCP server at all → **FALSE** — the server IS registered and enabled
2. **Second hypothesis:** `.env` might be missing or wrong → **FALSE** — `DATABASE_URL` is correctly set
3. **Third hypothesis:** Shell environment might be missing `DATABASE_URL` → **TRUE** — it's only in `.env`, not shell
4. **Fourth hypothesis:** MCP server loads dotenv itself → **FALSE** — no dotenv import found
5. **Root cause confirmed:** MCP config has no `env` block AND MCP server doesn't load dotenv → `process.env.DATABASE_URL` is `undefined` in the MCP server process

