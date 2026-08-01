# Spike Report: Knowledgebase Phase Cannot Find DATABASE_URL from Consumer .env

**Date:** 2026-08-01
**Status:** Investigation Complete — Root Cause Identified

---

## Executive Summary

The setup pipeline's Phase 6 (`registerKnowledgebase()` in `scripts/setup/knowledgebase.js`) checks
`process.env.DATABASE_URL` **without first loading the consumer's `.env` file**. The consumer (apmc-cms)
has a valid `.env` with `DATABASE_URL=postgresql://...` at its project root, but the orchestrator
never reads it. The phase bails early with a warning before spawning the child process
(`knowledgebase-cli.js`), which **does** load dotenv but is never reached.

Additionally, the warning message `"npx ai-workflow-template setup --knowledgebase"` is **broken in two ways**:
1. `--knowledgebase` is not a recognized flag (only `--skip-knowledgebase` exists)
2. Even if it worked, the pipeline would still fail to find `.env` for the same reason

---

## Investigation Results

### 1. Exact Code Path for DATABASE_URL Detection

**File:** `scripts/setup/knowledgebase.js`

```
Line 52: export async function registerKnowledgebase(context) {
Line 63:   // ── DATABASE_URL check ───────────────────────────────────────────────
Line 64:   if (!process.env.DATABASE_URL) {                          ← THE CHECK
Line 65:     const message =
Line 66:       'DATABASE_URL not configured. Set up later with: ' +
Line 67:       'npx ai-workflow-template setup --knowledgebase'
Line 68:     logWarn(
Line 69:       `[knowledgebase] Skipping Phase 6 — ${message}`,
Line 70:     )
Line 71:     return { action: 'skipped', message }                   ← EARLY RETURN
Line 72:   }
```

**No `.env` loading occurs anywhere in the setup pipeline.** The entire `scripts/setup/` directory
has zero references to `dotenv`, `.env`, or `loadEnv` (confirmed by grep — 0 matches for `dotenv|\.env` pattern
except for the `process.env.DATABASE_URL` check itself).

The only file that loads dotenv is the **child process**:

**File:** `scripts/knowledgebase-cli.js`
```
Line 22: import 'dotenv/config';
```

This file is spawned by `registerKnowledgebase()` at line 92-98, but only **after** the DATABASE_URL
check on line 64 passes. Since the check fails, the child process is never spawned, so dotenv is
never loaded.

### 2. Does the Setup Pipeline Load .env At All?

**No.** Proven by code audit of the entire pipeline:

| File | .env/Dotenv Reference? |
|------|----------------------|
| `scripts/setup/index.js` (orchestrator) | No |
| `scripts/setup/knowledgebase.js` (Phase 6) | No — only reads `process.env.DATABASE_URL` |
| `scripts/setup/discover.js` (Phase 1) | No |
| `scripts/setup/utils.js` | No — only reads `INIT_CWD`, CI vars, `NODE_ENV` |
| `scripts/setup/constants.js` | No |
| `scripts/setup/sync-phase.js` | No |

**Confirmed:** `grep -rn "dotenv\|\.env\|loadEnv" scripts/setup/` returns zero hits for `.env` loading.

The **only** dotenv usage in the entire codebase is in `scripts/knowledgebase-cli.js` (line 22),
which is the child process that the orchestrator **never spawns** when DATABASE_URL is missing.

### 3. Where Does the Consumer's .env Need to Live?

**Consumer project:** `/Users/aldrichallenbarcenas/develop/apmc-cms`

The `.env` file **exists** at the consumer project root:

```
/Users/aldrichallenbarcenas/develop/apmc-cms/.env
```

Contents (credentials redacted):
```
DATABASE_URL=postgresql://postgres:<REDACTED>@192.168.31.200:5432/postgres
```

This location is correct for `dotenv/config` (which loads `.env` from `process.cwd()`), and the
child process `knowledgebase-cli.js` spawns with `INIT_CWD` set to the consumer root (line 170 of
knowledgebase.js: `env: { ...process.env, INIT_CWD: cwd }`).

**Why it's not being found:**
1. The parent orchestrator process runs from the template package's install directory
2. `process.env.DATABASE_URL` is checked in the parent process context
3. No code loads `.env` from the consumer root in the parent process
4. The check fails → returns early → child process never spawned

**Template `.env.example`** (at `/Users/aldrichallenbarcenas/develop/ai-workflow-template/.env.example`):

Lines 23-27 document DATABASE_URL:
```
# Knowledgebase (pgvector)
# PostgreSQL connection string for centralized knowledgebase
# These settings are OPTIONAL — all features gracefully degrade when not configured.
# DATABASE_URL=postgresql://user:password@localhost:5432/knowledgebase
```

This is commented out by default (as expected for an example file). Consumers must uncomment
and configure it in their own `.env`.

### 4. Is `setup --knowledgebase` a Real Subcommand?

**No. It does not work.** Here's the evidence:

**`SUPPORTED_FLAGS` in `scripts/setup/constants.js` (lines 133-150):**
```js
export const SUPPORTED_FLAGS = {
  '--force': 'force',
  '--dry-run': 'dryRun',
  '--yes': 'yes',
  '-y': 'yes',
  '--skip-hooks': 'skipHooks',
  '--skip-prepare': 'skipPrepare',
  '--skip-sync': 'skipSync',
  '--skip-knowledgebase': 'skipKnowledgebase',  // ← only "knowledgebase" flag exists
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--quiet': 'quiet',
  '-q': 'quiet',
  '--verbose': 'verbose',
  '-V': 'verbose',
}
```

There is **no** `--knowledgebase` flag. Only `--skip-knowledgebase` exists.

**The `setup` positional argument is silently ignored.** The `parseCliArgs()` function in
`utils.js` (line 305-339) only maps known flags. Any unrecognized argument (including `setup`)
falls through without error or effect:

```js
// Line 331-336:
const mapped = SUPPORTED_FLAGS[arg]
if (mapped) {
  flags[mapped] = true
}
// else: silently ignored
```

**What happens if a user runs `npx ai-workflow-template setup --knowledgebase`?**
1. `process.argv` = `['node', '/path/to/bin/setup.js', 'setup', '--knowledgebase']`
2. `process.argv.slice(2)` = `['setup', '--knowledgebase']`
3. `parseCliArgs` maps neither `setup` nor `--knowledgebase` → both silently ignored
4. The full pipeline runs with all defaults (including Phase 6)
5. Phase 6 still can't find DATABASE_URL → same warning → same failure

**What a consumer would need to run to re-trigger just the knowledgebase phase:**
There is **no way** to run only the knowledgebase phase through the setup pipeline CLI. The only
option is to run the child script directly:

```bash
node ./node_modules/@abarcenas/ai-workflow-template/scripts/knowledgebase-cli.js sync --project <project-id>
```

This normally works from the consumer's project root (where `dotenv/config` loads `.env` from cwd)
and is what the git `post-commit` hook invokes.

### 5. Expected DATABASE_URL Format

**The knowledgebase requires PostgreSQL.** There is NO sqlite fallback for the knowledgebase.

| Dependency | Purpose | Package Type |
|-----------|---------|-------------|
| `pg` (`^8.22.0`) | PostgreSQL driver | `optionalDependencies` |
| `pgvector` (`^0.3.0`) | pgvector extension support | `optionalDependencies` |
| `better-sqlite3` (`^12.11.0`) | SQLite driver | `dependencies` (for memory-bank, NOT knowledgebase) |
| `sqlite-vec` (`^0.1.9`) | Vector search for SQLite | `dependencies` (for memory-bank, NOT knowledgebase) |

**Evidence from `scripts/knowledgebase-index.js`:**
- Line 91: `const dbUrl = process.env.DATABASE_URL;` — reads from env
- Lines 100-110: Dynamically imports `pg` (optional dep) for Postgres connection
- Lines 113-123: Dynamically imports `pgvector` (optional dep) for vector operations
- Lines 126-131: Creates `new Pool({ connectionString: dbUrl })` — **PostgreSQL only**
- The `sqlite-vec` library is used only by `scripts/memory-index.js` (the memory-bank vector index),
  not by the knowledgebase

**Expected format (from `scripts/knowledgebase-init.sql` and `.env.example`):**
```
DATABASE_URL=postgresql://user:password@host:5432/database
```

**Minimum working config for a consumer:**
1. A PostgreSQL server with the `pgvector` extension installed
2. A `.env` file at the project root with `DATABASE_URL=postgresql://...`
3. Run `psql $DATABASE_URL -f node_modules/@abarcenas/ai-workflow-template/scripts/knowledgebase-init.sql` for manual schema creation
4. Then the post-commit hook (or manual `kb:sync`) will work

**If a consumer only wants local knowledgebase without Postgres: Currently not possible.**
The knowledgebase is PostgreSQL-only. The local `better-sqlite3` + `sqlite-vec` stack is
used exclusively for the memory-bank vector index, not the cross-project knowledgebase.

---

## Technical Constraints

1. **dotenv is a devDependency** (`"dotenv": "^17.4.2"` in `package.json`). DevDependencies are
   NOT installed when a consumer runs `npx @abarcenas/ai-workflow-template`. However, when the
   package is installed as a dependency in the consumer's `node_modules/`, the hook scripts
   can access dotenv via the package's own installation. The crucial distinction:

   - **Setup at `npx` time**: Package is downloaded to a temp cache → `devDependencies` not installed → `dotenv` unavailable
   - **Post-install hooks**: Package is in `node_modules/` → `devDependencies` available

   This means `dotenv` is **available** when `knowledgebase-cli.js` runs from the package's
   `node_modules/`, but may NOT be available when the setup orchestrator runs.

2. **`dotenv` should be moved from `devDependencies` to `dependencies`** if the orchestrator
   needs to use it. Alternatively, a manual `.env` file reader (no dependency) could be used.

---

## Recommended Fix

### Root Cause
The orchestrator (`scripts/setup/knowledgebase.js`, line 64) checks `process.env.DATABASE_URL`
without loading the consumer's `.env` file, so it never detects the user's configuration.

### Proposed Changes (for coder agent)

**1. Load `.env` from consumer project root before the DATABASE_URL check**

In `scripts/setup/knowledgebase.js`, add `.env` loading before line 64:

```js
// ADD: Load consumer's .env file before checking DATABASE_URL
import { existsSync } from 'fs'
import { resolve } from 'path'

// Inside registerKnowledgebase(), before the DATABASE_URL check:
const consumerRoot = context.consumerRoot || process.cwd()
const envPath = resolve(consumerRoot, '.env')
if (existsSync(envPath)) {
  // Use manual .env parsing to avoid dotenv dependency issues
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key && !process.env[key]) {
      process.env[key] = value
    }
  }
}
```

**Alternative (simpler but adds dependency):** Move `dotenv` from `devDependencies` → `dependencies`
and add `import 'dotenv/config'` to the orchestrator, configuring it to look at `consumerRoot`.

**2. Fix the warning message**

Line 66-67 currently says:
```
'npx ai-workflow-template setup --knowledgebase'
```

This should be:
```
'npx ai-workflow-setup'
```
or simply removed since re-running setup will fix itself once fix #1 is applied.

**3. Add `--knowledgebase` flag (optional enhancement)**

If the user wants to re-run just the knowledgebase phase, add `'--knowledgebase': 'knowledgebaseOnly'`
to `SUPPORTED_FLAGS` in `constants.js`, then check for it in the orchestrator's Phase 6 logic.

---

## External Resources

| Source | Relevance |
|--------|-----------|
| `scripts/setup/knowledgebase.js` (lines 63-71) | The DATABASE_URL check that blocks the phase |
| `scripts/setup/index.js` (lines 337-358) | How Phase 6 is orchestrated |
| `scripts/knowledgebase-cli.js` (line 22) | The child process that DOES load dotenv |
| `scripts/knowledgebase-index.js` (lines 88-144) | Database pool creation — PostgreSQL only |
| `scripts/setup/constants.js` (lines 133-150) | SUPPORTED_FLAGS — no --knowledgebase flag |
| `scripts/setup/utils.js` (lines 286-339) | parseCliArgs — unrecognized args silently ignored |
| `scripts/setup/discover.js` (lines 148-261) | Discovery — does NOT read .env |
| `.env.example` (lines 23-27) | Template docs for DATABASE_URL |
| `/Users/aldrichallenbarcenas/develop/apmc-cms/.env` | Consumer's .env — exists, has DATABASE_URL |
| `package.json` (line 60) | dotenv is a devDependency |

---

## Decision Trail

1. **2016-08-01 00:01** — Read `bin/setup.js` → delegates to `scripts/setup/index.js`
2. **2016-08-01 00:02** — Read `scripts/setup/index.js` → Phase 6 calls `registerKnowledgebase()`
3. **2016-08-01 00:03** — Read `scripts/setup/knowledgebase.js` → Found `process.env.DATABASE_URL` check at line 64, no dotenv loading
4. **2016-08-01 00:04** — Read `scripts/knowledgebase-cli.js` → Found `import 'dotenv/config'` at line 22 in child process
5. **2016-08-01 00:05** — Grepped entire `scripts/setup/` → Zero dotenv references → confirmed no .env loading in pipeline
6. **2016-08-01 00:06** — Read `constants.js` SUPPORTED_FLAGS → No `--knowledgebase` flag → warning message is misleading
7. **2016-08-01 00:07** — Read consumer `.env` → Exists with valid DATABASE_URL → user configuration is correct
8. **2016-08-01 00:08** — Read `knowledgebase-index.js` → PostgreSQL only, no sqlite fallback for knowledgebase
9. **2016-08-01 00:09** — Compiled report with root cause, evidence, and fix recommendations

---

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-08-01 | ✅ Complete | Root cause identified with full code trace evidence |
