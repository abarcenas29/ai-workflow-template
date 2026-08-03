#!/usr/bin/env node

/**
 * vocab-sync.js — Pre-commit hook vocabulary sync.
 *
 * Scans STAGED memory-bank/*.md files for YAML frontmatter tags and appends
 * any genuinely-new tags to memory-bank/.vocabulary.json under the `topic`
 * group (the default catch-all). A tag is considered "known" when it exists
 * in any `tags.*` group or as an `entity_patterns` key.
 *
 * Warning-only hook — never blocks the commit. Exits 0 unless an unexpected
 * error occurs (then exits 1 with an error message).
 *
 * Usage (in .husky/pre-commit, BEFORE validate-memory-schema.js):
 *   node scripts/vocab-sync.js
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEMORY_BANK_DIR = resolve(process.cwd(), 'memory-bank');
const VOCAB_PATH = resolve(MEMORY_BANK_DIR, '.vocabulary.json');

// ── Load vocabulary ──────────────────────────────────────────────────

function loadVocabulary() {
  if (!existsSync(VOCAB_PATH)) {
    console.warn('[vocab-sync] ⚠ No .vocabulary.json found at memory-bank/.vocabulary.json');
    console.warn('[vocab-sync]   Vocabulary sync skipped.');
    return null;
  }

  try {
    return JSON.parse(readFileSync(VOCAB_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[vocab-sync] ⚠ Failed to parse .vocabulary.json: ${err.message}`);
    console.warn('[vocab-sync]   Vocabulary sync skipped.');
    return null;
  }
}

// ── Get staged memory-bank files ─────────────────────────────────────

function getStagedMemoryFiles() {
  try {
    const output = execSync(
      'git diff --cached --name-only --diff-filter=ACM',
      { encoding: 'utf8', cwd: process.cwd() }
    );
    return output
      .split('\n')
      .filter(f => f.startsWith('memory-bank/') && f.endsWith('.md') && !f.includes('/.index/'));
  } catch {
    return [];
  }
}

// ── Parse frontmatter ────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const raw = match[1];
  const fm = {};
  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      const key = kv[1];
      let value = kv[2].trim();
      // Parse arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fm[key] = value;
    }
  }
  return fm;
}

// ── Tag normalization ────────────────────────────────────────────────

function normalizeTag(tag) {
  return String(tag)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-');
}

// ── Known tag collection ─────────────────────────────────────────────

function buildKnownTags(vocab) {
  const known = new Set();

  // All values across all tags.* groups
  for (const group of Object.values(vocab?.tags || {})) {
    // Guard against malformed vocab shapes (consumer-controlled input): if
    // `vocab.tags` is an array or a group is a plain string, iterating the
    // group directly would walk CHARACTERS instead of tags. Skip non-arrays.
    if (!Array.isArray(group)) continue;
    for (const tag of group) {
      const normalized = normalizeTag(tag);
      if (normalized) known.add(normalized);
    }
  }

  // All entity_patterns keys (component/tool names)
  for (const key of Object.keys(vocab?.entity_patterns || {})) {
    const normalized = normalizeTag(key);
    if (normalized) known.add(normalized);
  }

  return known;
}

// ── Collect new tags ─────────────────────────────────────────────────

function collectNewTags(stagedFiles, vocab) {
  const known = buildKnownTags(vocab);
  const newTags = new Set();

  for (const file of stagedFiles) {
    let content;
    try {
      content = readFileSync(resolve(process.cwd(), file), 'utf8');
    } catch {
      continue; // unreadable file — skip
    }

    const fm = parseFrontmatter(content);
    if (!fm || !Array.isArray(fm.tags)) continue;

    for (const rawTag of fm.tags) {
      const tag = normalizeTag(rawTag);
      if (!tag) continue; // empty / whitespace-only
      if (known.has(tag)) continue; // already in vocabulary
      newTags.add(tag);
    }
  }

  return [...newTags].sort();
}

// ── Sync ─────────────────────────────────────────────────────────────

function syncVocabulary(stagedFiles, vocab) {
  const newTags = collectNewTags(stagedFiles, vocab);
  if (newTags.length === 0) return false; // nothing to do — no-op

  // Default placement: the `topic` catch-all group
  if (!vocab.tags) vocab.tags = {};
  if (!Array.isArray(vocab.tags.topic)) vocab.tags.topic = [];

  // Append, normalize existing entries, dedupe, sort alphabetically
  const merged = new Set([
    ...vocab.tags.topic.map(normalizeTag).filter(Boolean),
    ...newTags,
  ]);
  vocab.tags.topic = [...merged].sort();

  // Write back with 2-space indent + trailing newline (matches existing format)
  writeFileSync(VOCAB_PATH, `${JSON.stringify(vocab, null, 2)}\n`, 'utf8');

  // Stage the updated vocabulary so it commits with the same change
  try {
    execSync('git add memory-bank/.vocabulary.json', { cwd: process.cwd() });
  } catch (err) {
    console.warn(`[vocab-sync] ⚠ Could not stage memory-bank/.vocabulary.json: ${err.message}`);
  }

  console.warn(
    `[vocab-sync] Added ${newTags.length} tag(s) to memory-bank/.vocabulary.json: [${newTags.join(', ')}]`
  );
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const stagedFiles = getStagedMemoryFiles();
  if (stagedFiles.length === 0) return; // no memory-bank files staged — silent no-op

  const vocab = loadVocabulary();
  if (!vocab) return; // graceful skip when vocabulary is unavailable

  syncVocabulary(stagedFiles, vocab);
}

// Only run when executed directly (node scripts/vocab-sync.js). When the
// module is imported — e.g. by unit tests — no side effects are triggered.
const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error(`[vocab-sync] ❌ Unhandled error: ${err.message}`);
    process.exit(1);
  }
}

export {
  loadVocabulary,
  getStagedMemoryFiles,
  parseFrontmatter,
  normalizeTag,
  buildKnownTags,
  collectNewTags,
  syncVocabulary,
  main,
};
