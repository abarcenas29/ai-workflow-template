/**
 * memory-index.js — Core engine for vector-based memory search.
 *
 * Manages a sqlite-vec vector index over memory-bank/ markdown files.
 * Supports content-hash incremental updates and semantic search.
 *
 * Usage:
 *   import { search, rebuildIndex, incrementalUpdate, getStats } from './memory-index.js';
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

// ── Configuration ──────────────────────────────────────────────────

const MEMORY_BANK_DIR = resolve(process.cwd(), 'memory-bank');
const DOCS_DIR = resolve(process.cwd(), 'docs');
const INDEX_DIR = resolve(MEMORY_BANK_DIR, '.index');
const DB_PATH = resolve(INDEX_DIR, 'memory.db');
const EMBEDDING_DIM = 384;

// ── Lazy-loaded dependencies ────────────────────────────────────────

/** @type {import('better-sqlite3').default|null} */
let BetterSqlite3 = null;

/** @type {import('sqlite-vec').default|null} */
let sqliteVec = null;

/** @type {import('@xenova/transformers').pipeline|null} */
let pipelineFn = null;

/** @type {Promise<any>|null} */
let embedderPromise = null;

/** @type {any|null} */
let embedder = null;

/** @type {import('better-sqlite3').Database|null} */
let _db = null;

// ── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function filenameToId(filePath) {
  return basename(filePath, extname(filePath));
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { frontmatter: object|null, body: string }
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: null, body: content };

  const raw = match[1];
  const frontmatter = {};
  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      const key = kv[1];
      let value = kv[2].trim();
      // Parse arrays: [foo, bar]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      // Unquote strings
      else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: content.slice(match[0].length) };
}

/**
 * Split markdown body into chunks by ## headings.
 * Each chunk includes its heading and content up to the next ## heading.
 */
function chunkMarkdown(body) {
  const chunks = [];
  const sections = body.split(/(?=^## )/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    // Skip if it's just the H1 title (no ## prefix)
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) continue;
    if (trimmed.length < 10) continue; // Skip tiny sections
    chunks.push(trimmed);
  }

  // If no ## sections found, treat the whole body as one chunk
  if (chunks.length === 0 && body.trim().length > 10) {
    chunks.push(body.trim());
  }

  return chunks;
}

// ── Database ─────────────────────────────────────────────────────────

async function getSQLite() {
  if (!BetterSqlite3) {
    try { BetterSqlite3 = (await import('better-sqlite3')).default; }
    catch { throw new Error('better-sqlite3 not installed. Run: npm install better-sqlite3'); }
  }
  return BetterSqlite3;
}

async function getVec() {
  if (!sqliteVec) {
    try { sqliteVec = await import('sqlite-vec'); }
    catch { throw new Error('sqlite-vec not installed. Run: npm install sqlite-vec'); }
  }
  return sqliteVec;
}

async function getDB() {
  if (_db) return _db;

  const SQLite = await getSQLite();
  const vec = await getVec();

  ensureDir(INDEX_DIR);
  _db = new SQLite(DB_PATH);
  _db.pragma('journal_mode = WAL');
  vec.load(_db);

  // Create tables if they don't exist
  _db.exec(`
    CREATE TABLE IF NOT EXISTS memory_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      vec_rowid INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_lookup
      ON memory_chunks(source_file, chunk_index);
  `);

  // Create vec0 virtual table (auto rowid — we link via memory_chunks.vec_rowid)
  const vecTableExists = _db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_memory'"
  ).get();

  if (!vecTableExists) {
    _db.exec(`CREATE VIRTUAL TABLE vec_memory USING vec0(embedding float[${EMBEDDING_DIM}])`);
  }

  // Migration: add vec_rowid column if missing (from older schema)
  const hasVecRowid = _db.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('memory_chunks') WHERE name = 'vec_rowid'"
  ).get();
  if (!hasVecRowid || hasVecRowid.cnt === 0) {
    _db.exec('ALTER TABLE memory_chunks ADD COLUMN vec_rowid INTEGER');
  }

  return _db;
}

function closeDB() {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
  }
}

// ── Embedding ────────────────────────────────────────────────────────

async function getEmbedder() {
  if (embedder) return embedder;
  if (embedderPromise) return embedderPromise;

  embedderPromise = (async () => {
    if (!pipelineFn) {
      try {
        const mod = await import('@xenova/transformers');
        pipelineFn = mod.pipeline;
      } catch {
        console.warn('[memory-index] @xenova/transformers not installed. Embedding unavailable.');
        console.warn('[memory-index] Install with: npm install @xenova/transformers');
        return null;
      }
    }

    try {
      embedder = await pipelineFn('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      return embedder;
    } catch (err) {
      console.warn('[memory-index] Failed to load embedding model:', err.message);
      return null;
    }
  })();

  return embedderPromise;
}

async function embed(text) {
  const model = await getEmbedder();
  if (!model) throw new Error('Embedding model not available');

  const result = await model(text, { pooling: 'mean', normalize: true });
  return new Float32Array(result.data);
}

// ── Indexing ────────────────────────────────────────────────────────

/**
 * Index a single markdown file.
 * Skips if content hasn't changed (hash check).
 * Returns { indexed: number, skipped: number }
 */
async function indexFile(filePath) {
  const db = await getDB();
  const content = readFileSync(filePath, 'utf8');
  const sourceFile = basename(filePath);
  const { body } = parseFrontmatter(content);
  const chunks = chunkMarkdown(body);

  let indexed = 0;
  let skipped = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkHash = hashContent(chunks[i]);

    // Check if already indexed with same hash
    const existing = db.prepare(
      'SELECT id, content_hash FROM memory_chunks WHERE source_file = ? AND chunk_index = ?'
    ).get(sourceFile, i);

    if (existing && existing.content_hash === chunkHash) {
      skipped++;
      continue;
    }

    let rowid;
    if (existing) {
      const existingId = Number(existing.id);
      const oldVecRowid = existing.vec_rowid;

      // Update content
      db.prepare(
        'UPDATE memory_chunks SET content = ?, content_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(chunks[i], chunkHash, existingId);

      // Remove old vector
      if (oldVecRowid != null) {
        db.prepare('DELETE FROM vec_memory WHERE rowid = ?').run(Number(oldVecRowid));
      }
      rowid = existingId;
    } else {
      // Insert new chunk
      const info = db.prepare(
        'INSERT INTO memory_chunks (source_file, chunk_index, content, content_hash) VALUES (?, ?, ?, ?)'
      ).run(sourceFile, i, chunks[i], chunkHash);
      rowid = Number(info.lastInsertRowid);
    }

    try {
      const embedding = await embed(chunks[i]);
      // Insert into vec0 without explicit rowid (auto-assigned)
      const vecInfo = db.prepare('INSERT INTO vec_memory (embedding) VALUES (?)').run(embedding);
      const vecRowid = Number(vecInfo.lastInsertRowid);
      // Link vec0 rowid back to memory_chunks
      db.prepare('UPDATE memory_chunks SET vec_rowid = ? WHERE id = ?').run(vecRowid, rowid);
      indexed++;
    } catch (err) {
      console.warn(`[memory-index] Failed to embed chunk ${i} of ${sourceFile}: ${err.message}`);
    }
  }

  return { indexed, skipped };
}

/**
 * Collect all .md files from a directory recursively.
 */
function collectMdFiles(dir) {
  if (!existsSync(dir)) return [];

  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip .index and node_modules
      if (entry.name === '.index' || entry.name === 'node_modules') continue;
      files.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Full rebuild: clears index and re-indexes all markdown files.
 */
async function rebuildIndex() {
  const db = await getDB();

  console.log('[memory-index] Full rebuild started...');

  // Clear existing data
  db.exec('DELETE FROM vec_memory');
  db.exec('DELETE FROM memory_chunks');

  const memoryFiles = collectMdFiles(MEMORY_BANK_DIR);
  const docFiles = collectMdFiles(DOCS_DIR);
  const allFiles = [...memoryFiles, ...docFiles];

  let totalIndexed = 0;
  let totalSkipped = 0;

  for (const file of allFiles) {
    // Skip files in .index/
    if (file.includes('/.index/')) continue;

    const { indexed, skipped } = await indexFile(file);
    totalIndexed += indexed;
    totalSkipped += skipped;

    if (indexed > 0) {
      console.log(`[memory-index]   Indexed: ${basename(file)} (${indexed} chunks)`);
    }
  }

  const stats = getStats();
  console.log(`[memory-index] Rebuild complete: ${totalIndexed} chunks indexed, ${totalSkipped} skipped. ${stats.totalVectors} total vectors.`);

  return { indexed: totalIndexed, skipped: totalSkipped, stats };
}

/**
 * Incremental update: only re-index files whose content has changed.
 * Uses file mtime + content hash for change detection.
 */
async function incrementalUpdate() {
  const memoryFiles = collectMdFiles(MEMORY_BANK_DIR);
  const docFiles = collectMdFiles(DOCS_DIR);
  const allFiles = [...memoryFiles, ...docFiles];

  let totalIndexed = 0;
  let totalSkipped = 0;
  const changed = [];

  for (const file of allFiles) {
    if (file.includes('/.index/')) continue;

    const content = readFileSync(file, 'utf8');
    const sourceFile = basename(file);
    const { body } = parseFrontmatter(content);
    const bodyHash = hashContent(body);

    // Quick check: if the full body hash matches the last indexed state, skip
    const db = await getDB();
    const existingChunks = db.prepare(
      'SELECT content_hash FROM memory_chunks WHERE source_file = ?'
    ).all(sourceFile);

    const combinedHash = existingChunks.map(c => c.content_hash).join('|');

    if (existingChunks.length > 0) {
      // Check if any chunk's content changed by recomputing hashes
      const chunks = chunkMarkdown(body);
      const newCombinedHash = chunks.map(c => hashContent(c)).join('|');

      if (newCombinedHash === combinedHash) {
        totalSkipped += existingChunks.length;
        continue;
      }
    }

    const { indexed, skipped } = await indexFile(file);
    if (indexed > 0) {
      changed.push(sourceFile);
    }
    totalIndexed += indexed;
    totalSkipped += skipped;
  }

  return { indexed: totalIndexed, skipped: totalSkipped, changed };
}

// ── Search ──────────────────────────────────────────────────────────

/**
 * Semantic search across indexed memory.
 *
 * @param {string} query - Natural language query
 * @param {object} [opts]
 * @param {number} [opts.topK=5] - Number of results
 * @param {string} [opts.category] - Filter by frontmatter category
 * @param {string} [opts.sourceFile] - Filter by specific file
 * @returns {Promise<Array<{source_file: string, content: string, score: number}>>}
 */
async function search(query, opts = {}) {
  const { topK = 5, category, sourceFile } = opts;
  const db = await getDB();

  let queryEmbedding;
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    throw new Error(`Embedding failed: ${err.message}. Is @xenova/transformers installed?`);
  }

  // Build query with optional filters
  let sql = `
    SELECT mc.source_file, mc.content, vec_memory.distance as score
    FROM vec_memory
    JOIN memory_chunks mc ON mc.vec_rowid = vec_memory.rowid
    WHERE vec_memory.embedding MATCH ?
      AND k = ?
  `;
  const params = [queryEmbedding, topK];

  if (sourceFile) {
    sql += ' AND mc.source_file = ?';
    params.push(sourceFile);
  }

  sql += ' ORDER BY vec_memory.distance';

  const results = db.prepare(sql).all(...params);

  // Format results
  return results.map(r => ({
    source_file: r.source_file,
    content: r.content,
    score: Math.round((1 - r.score) * 1000) / 1000, // Convert distance to similarity
  }));
}

// ── Read ─────────────────────────────────────────────────────────────

/**
 * Read a specific memory file by id (filename without extension).
 */
function getFile(fileId) {
  // Try memory-bank first
  const memPath = join(MEMORY_BANK_DIR, `${fileId}.md`);
  if (existsSync(memPath)) {
    return readFileSync(memPath, 'utf8');
  }

  // Try docs
  const docPath = join(DOCS_DIR, `${fileId}.md`);
  if (existsSync(docPath)) {
    return readFileSync(docPath, 'utf8');
  }

  // Try hidden docs
  const hiddenPath = join(DOCS_DIR, `.${fileId}.md`);
  if (existsSync(hiddenPath)) {
    return readFileSync(hiddenPath, 'utf8');
  }

  return null;
}

// ── Stats ────────────────────────────────────────────────────────────

function getStats() {
  if (!_db) {
    return { totalVectors: 0, totalFiles: 0, dbSize: 'N/A' };
  }

  const vectors = _db.prepare('SELECT COUNT(*) as count FROM vec_memory').get();
  const files = _db.prepare(
    'SELECT COUNT(DISTINCT source_file) as count FROM memory_chunks'
  ).get();
  const dbSizeBytes = existsSync(DB_PATH) ? statSync(DB_PATH).size : 0;

  return {
    totalVectors: vectors.count,
    totalFiles: files.count,
    dbSize: `${(dbSizeBytes / 1024 / 1024).toFixed(1)} MB`,
  };
}

// ── Exports ──────────────────────────────────────────────────────────

export {
  search,
  rebuildIndex,
  incrementalUpdate,
  indexFile,
  getFile,
  getStats,
  closeDB,
  hashContent,
  parseFrontmatter,
  chunkMarkdown,
};
