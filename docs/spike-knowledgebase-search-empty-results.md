---
id: "spike-knowledgebase-search-empty-results"
title: "Spike: Debug Empty Knowledgebase Search Results Despite 9 Chunks Indexed"
updated: "2026-08-02"
tags: [researcher, research, spike, knowledgebase, pgvector, embeddings, bug, threshold]
doc_type: "spike"
status: "✅ Complete"
---

# Spike: Debug Empty Knowledgebase Search Results

**Status:** ✅ Complete
**Date:** 2026-08-02
**Researcher:** AI Agent (Researcher — Technical Investigation)

---

## Research Questions

1. **How does the knowledgebase search work?** Trace the search code path, embedding model, similarity computation.
2. **Why would search return empty while stats show 9 chunks?** Possible causes: NULL embeddings, model loading failure, threshold too strict, dimension mismatch.
3. **Check @xenova/transformers availability** — is the optional dependency installed and functional?
4. **Check the last index run's behavior** — did it compute embeddings?

---

## Investigation Results

### 1. Code Path Analysis

#### Architecture

The knowledgebase is a **three-tier system**:

| Layer | Technology | File |
|-------|-----------|------|
| MCP Server | `@modelcontextprotocol/sdk` + stdio transport | `scripts/mcp-knowledgebase-server.js` |
| Core Engine | PostgreSQL + pgvector + @xenova/transformers | `scripts/knowledgebase-index.js` |
| CLI | Node.js CLI | `scripts/knowledgebase-cli.js` |

#### Search Code Path (file/line)

1. **MCP tool handler** (`mcp-knowledgebase-server.js:140-143`):
   ```js
   const results = await search(args.query, {
     project_id: args.projectId || undefined,
     threshold: args.threshold || 0.6,  // ← DEFAULT 0.6
     limit: args.limit || 5,
   });
   ```

2. **Core search** (`knowledgebase-index.js:488-535`):
   ```js
   async function search(query, options = {}) {
     const pool = await getPool();
     if (!pool) return [];
     const { project_id, threshold = 0.0, limit = 5 } = options;  // ← CORE DEFAULT 0.0
     try {
       const queryEmbedding = await embed(query);
       // SQL: SELECT ... FROM knowledge_chunks
       // WHERE embedding IS NOT NULL
       //   AND 1 - (embedding <=> $1) >= $2
       // ORDER BY similarity DESC LIMIT $3
       const params = [_toSql(Array.from(queryEmbedding)), threshold];
       const result = await pool.query(sql, params);
       return result.rows.map(...);
     } catch (err) {
       return [];  // Silently swallows errors
     }
   }
   ```

3. **Embedding generation** (`knowledgebase-index.js:303-314`):
   ```js
   async function embed(text) {
     const model = await getEmbedder();
     // Uses @xenova/transformers pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
     const result = await model(text, { pooling: 'mean', normalize: true });
     return new Float32Array(result.data);  // 384 dimensions
   }
   ```

4. **Embedder singleton** (`knowledgebase-index.js:260-286`):
   ```js
   async function getEmbedder() {
     if (_embedder) return _embedder;
     if (_embedderPromise) return _embedderPromise;
     _embedderPromise = (async () => {
       const mod = await import('@xenova/transformers');
       _pipelineFn = mod.pipeline;
       _embedder = await _pipelineFn('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
       return _embedder;
     })();
     return _embedderPromise;
   }
   ```

#### Chunk Upsert with Silent Embedding Failure (`knowledgebase-index.js:398-410`):

```js
let embeddingSql = null;
try {
  const vec = await embed(contextText);
  embeddingSql = _toSql(Array.from(vec));  // Array.from() needed: pgvector rejects Float32Array
} catch (embedErr) {
  console.warn('[knowledgebase] Embedding failed for chunk, ' +
    'inserting without vector:', embedErr.message);
  // ← Chunk inserted with NULL embedding, CLI still reports success!
}
```

#### Database Schema

- **PostgreSQL + pgvector** at `192.168.31.200:5432/postgres` (DATABASE_URL)
- Table `knowledge_chunks` with `VECTOR(384)` embedding column
- HNSW index for cosine similarity (`<=>` operator)
- `WHERE embedding IS NOT NULL` filter in search query

---

### 2. Root Cause: Threshold Mismatch

#### The Bug

**The MCP server uses a default similarity threshold of `0.6`, but the all-MiniLM-L6-v2 embedding model produces cosine similarities in the range of `~0.01–0.41` for this corpus.**

| Component | Default Threshold | Result |
|-----------|-------------------|--------|
| **MCP Server** (`mcp-knowledgebase-server.js:143`) | `0.6` | Returns 0 results |
| **CLI** (`knowledgebase-cli.js:148`) | `0.0` (via undefined → 0.0) | Returns results |
| **Core Engine** (`knowledgebase-index.js:492`) | `0.0` | N/A (overridden by callers) |

#### Empirical Similarity Distribution

Queries tested against the 9-chunk corpus:

| Query | Highest Similarity | All Results at 0.0 Threshold |
|-------|-------------------|------------------------------|
| "DATABASE_URL env loading dotenv MCP server" | **0.396** | 5 results (0.125–0.396) |
| "setup verbose logging pattern" | **0.373** | 9 results (0.06–0.373) |
| "Float32Array pgvector toSql typed array embedding NULL" | **0.410** | 7 results (0.009–0.410) |
| "npm publish workflow trigger" | below 0.4 | 0 at threshold 0.6 |

**No query came anywhere near 0.6.** The all-MiniLM-L6-v2 model (384-dimensional) typically produces cosine similarities in the 0.2–0.5 range for moderately related text. This is well-documented behavior — see the SynaBun benchmark (same model, same tech stack) which reports recall@5 at 78% with this model.

#### Verification

```bash
# CLI with threshold 0.0 — WORKS (5 results)
node scripts/knowledgebase-cli.js search "DATABASE_URL env loading dotenv MCP server"
# → Highest similarity: 0.396

# CLI with threshold 0.6 — EMPTY (reproduces MCP behavior)
node scripts/knowledgebase-cli.js search "DATABASE_URL env loading dotenv MCP server" --threshold 0.6
# → "No results found."
```

---

### 3. What's NOT the Problem

The following were investigated and ruled out:

| Hypothesis | Finding | Evidence |
|-----------|---------|----------|
| `@xenova/transformers` not installed | **FALSE** | `node_modules/@xenova/transformers` v2.17.2 exists; model cache complete with `model_quantized.onnx` (22 MB) |
| Model loading fails | **FALSE** | Direct test confirmed pipeline loads and generates valid 384-dim embeddings |
| `pg`/`pgvector` not installed | **FALSE** | Both packages exist in `node_modules` |
| DATABASE_URL not configured | **FALSE** | Stats return 9 chunks, CLI search succeeds |
| Float32Array bug (NULL embeddings) | **FALSE (now)** | Code has `Array.from()` at pgvector boundary; CLI search returns results confirming embeddings exist |
| Chunks have NULL embeddings | **FALSE** | CLI search with threshold 0.0 returns ranked results with valid similarities |
| pgvector extension not installed | **FALSE** | Search queries execute successfully (would throw if `<=>` operator missing) |
| Model cache path resolution | **WORKS** | `path.dirname(path.dirname(url.fileURLToPath(import.meta.url)))` resolves to `node_modules/@xenova/transformers/.cache/Xenova/` correctly |
| ESM static import issues | **FALSE** | Dynamic imports work for all optional deps |

---

### 4. Secondary Code Quality Issue: JavaScript Falsy Coercion

In `mcp-knowledgebase-server.js:143`:

```js
threshold: args.threshold || 0.6,
```

If the AI agent passes `threshold: 0` explicitly (intending "no minimum"), JavaScript evaluates `0 || 0.6` as `0.6` because `0` is falsy. The fix should use:

```js
threshold: args.threshold ?? 0.1,  // or
threshold: args.threshold != null ? args.threshold : 0.1,
```

---

## Decision / Recommendation

### Root Cause Summary

| Question | Answer |
|----------|--------|
| **Root cause** | MCP server default threshold `0.6` is too strict for all-MiniLM-L6-v2 embeddings |
| **Evidence** | CLI search (threshold 0.0) returns results up to similarity 0.410; CLI with threshold 0.6 returns empty |
| **Code location** | `scripts/mcp-knowledgebase-server.js` line 143: `threshold: args.threshold \|\| 0.6` |
| **Why 0.6 was chosen** | Arbitrary high default, probably copied from a different embedding model or use case |
| **Expected threshold range for MiniLM** | 0.1–0.2 for "somewhat related", 0.25–0.4 for "moderately related", 0.4+ for "strongly related" |

### Fix

**Change the MCP server's default threshold from `0.6` to `0.1`:**

**File:** `scripts/mcp-knowledgebase-server.js`
**Line:** 143
**Current:**
```js
threshold: args.threshold || 0.6,
```
**Recommended:**
```js
threshold: args.threshold ?? 0.1,
```

This:
- Fixes the empty results issue (lowest similarity seen is ~0.06)
- Uses `??` (nullish coalescing) instead of `||` to allow explicit `threshold: 0`
- Matches the semantics that the CLI already uses (effectively 0.0 default)
- Still allows callers to set stricter thresholds for precision-oriented queries

### Optional: Align MCP and CLI defaults

Consider extracting the default threshold to a shared constant in `knowledgebase-index.js`:

```js
// In knowledgebase-index.js
export const DEFAULT_SEARCH_THRESHOLD = 0.1;
```

Then both CLI and MCP server import this constant. Currently the CLI uses `undefined` (→ `0.0` in core engine), the MCP uses `0.6`. Standardizing on `0.1` gives sensible filtering without being too strict.

---

## Technical Constraints

1. **all-MiniLM-L6-v2 similarity ranges** — This 384-dim model naturally produces lower cosine similarities than larger models (e.g., OpenAI text-embedding-3-small at 1536d). Threshold tuning is model-specific.
2. **Silent error swallowing** — Both `upsertChunks()` (lines 406-409) and `search()` (lines 531-533) silently catch errors. While this provides graceful degradation, it makes debugging opaque — no error is surfaced to the AI agent.
3. **MCP stdout/stderr separation** — `console.warn` and `console.error` output goes to stderr of the MCP child process, invisible to the AI agent using the tools.

---

## Prototype/Testing Notes

### Validation Commands (run by coder)

```bash
# 1. Verify embeddings exist and search works (CLI, threshold 0.0)
node scripts/knowledgebase-cli.js search "DATABASE_URL env loading" --threshold 0.0

# 2. Reproduce the bug (CLI, threshold 0.6)
node scripts/knowledgebase-cli.js search "DATABASE_URL env loading" --threshold 0.6

# 3. After fix, verify MCP server returns results via opencode knowledgebase_search tool
```

### Required Code Change

**File:** `scripts/mcp-knowledgebase-server.js`
**Change:** Line 143
```diff
-   threshold: args.threshold || 0.6,
+   threshold: args.threshold ?? 0.1,
```

---

## External Resources

| Resource | URL | Relevance |
|----------|-----|-----------|
| Knowledgebase core engine | `scripts/knowledgebase-index.js` (this repo) | Source of truth for embedding + search logic |
| MCP server implementation | `scripts/mcp-knowledgebase-server.js` (this repo) | Where the buggy threshold lives |
| CLI implementation | `scripts/knowledgebase-cli.js` (this repo) | Working reference with correct defaults |
| SynaBun all-MiniLM-L6-v2 benchmark | https://synabun.ai/blog/all-minilm-l6-v2-mcp-vector-memory | 12k dev memories; validates recall@5 ~78% for this model |
| pgvector npm (v0.3.0) source | `node_modules/pgvector/src/index.js` (this repo) | Confirmed: `toSql()` rejects Float32Array; requires plain Array |
| @xenova/transformers (v2.17.2) env.js | `node_modules/@xenova/transformers/src/env.js` | Cache dir resolution: `path.join(__dirname, '.cache')` |
| ADR: Knowledgebase Architecture | `docs/adr-knowledgebase-pgvector.md` (this repo) | Full design rationale |
| Prior spike: Float32Array investigation | `learned-knowledge.instructions.md` Session 2026-08-01 | Documents identical failure mode (null embeddings from Float32Array bug) |

---

## Decision Trail

1. **Initial hypothesis: Float32Array bug** (Session 2026-08-01 in learned-knowledge) — The Float32Array/pgvector boundary issue had previously caused all chunks to have NULL embeddings. This was fixed with `Array.from()` at the pgvector boundary.

2. **Checked: is the fix actually in the current code?** — Yes, `knowledgebase-index.js` lines 406 and 511 both use `Array.from(vec)` before `_toSql()`. Confirmed via source read.

3. **Checked: does the embedding pipeline work?** — Yes, ran `node --input-type=module -e "..."` invoking the Xenova pipeline directly. Model loads, generates 384-dim Float32Array. `Array.from()` converts correctly.

4. **Checked: do chunks have valid embeddings?** — Yes, CLI search with threshold 0.0 returns ranked results with non-zero similarities (0.06–0.41). This confirms embeddings are NOT NULL.

5. **Checked: is the threshold filtering them out?** — Yes, CLI search with `--threshold 0.6` returns empty, matching the MCP server's behavior exactly.

6. **Root cause: MCP server default threshold 0.6 is too high** — No similarity in the corpus exceeds ~0.41. The threshold of 0.6 filters out all results.

7. **Fix: Change single line in `mcp-knowledgebase-server.js`** from `args.threshold || 0.6` to `args.threshold ?? 0.1`.

---

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-08-02 | ✅ Complete | Root cause identified: threshold mismatch. Single-line fix. All evidence verified empirically. |
