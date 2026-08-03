#!/usr/bin/env node

/**
 * validate-memory-schema.js — Pre-commit hook validator.
 *
 * Checks staged memory-bank/*.md files for valid YAML frontmatter.
 * Rejects commits with missing/invalid fields.
 *
 * Reads allowed values from memory-bank/.vocabulary.json at validation time.
 *
 * Usage (in .husky/pre-commit):
 *   node scripts/validate-memory-schema.js
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEMORY_BANK_DIR = resolve(process.cwd(), 'memory-bank');
const VOCAB_PATH = resolve(MEMORY_BANK_DIR, '.vocabulary.json');

// ── Load vocabulary ──────────────────────────────────────────────────

function loadVocabulary() {
  if (!existsSync(VOCAB_PATH)) {
    console.error('[validate-memory] ⚠ No .vocabulary.json found at memory-bank/.vocabulary.json');
    console.error('[validate-memory]   Schema validation skipped — vocabulary is required for validation.');
    process.exit(0); // Don't block commits if vocab is missing (e.g., template not yet installed)
  }

  try {
    return JSON.parse(readFileSync(VOCAB_PATH, 'utf8'));
  } catch (err) {
    console.error(`[validate-memory] ⚠ Failed to parse .vocabulary.json: ${err.message}`);
    process.exit(0);
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

// ── Validate ─────────────────────────────────────────────────────────

function validateFile(filePath, vocab) {
  const errors = [];
  let content;

  try {
    content = readFileSync(resolve(process.cwd(), filePath), 'utf8');
  } catch {
    return [`Cannot read file: ${filePath}`];
  }

  const fm = parseFrontmatter(content);
  if (!fm) {
    errors.push(`Missing YAML frontmatter (file must start with ---...---)`);
    return errors;
  }

  const fileName = basename(filePath);
  const fileId = basename(filePath, extname(filePath));

  // Required fields for memory-bank files
  const requiredFields = ['id', 'title', 'updated', 'tags', 'category'];
  for (const field of requiredFields) {
    if (!fm[field]) {
      errors.push(`Missing required field: '${field}'`);
    }
  }

  // id must match filename
  if (fm.id && fm.id !== fileId) {
    errors.push(`Field 'id' (${fm.id}) does not match filename (${fileId})`);
  }

  // updated must be ISO date
  if (fm.updated && !/^\d{4}-\d{2}-\d{2}$/.test(fm.updated)) {
    errors.push(`Field 'updated' (${fm.updated}) is not a valid date. Use YYYY-MM-DD format.`);
  }

  // category must be in allowed list
  if (fm.category && vocab?.categories) {
    const allowed = Object.keys(vocab.categories);
    if (!allowed.includes(fm.category)) {
      errors.push(
        `Invalid category '${fm.category}'. Allowed: ${allowed.join(', ')}`
      );
    }
  }

  // tags must be from vocabulary (warn only — don't block for new user-defined tags)
  if (fm.tags && Array.isArray(fm.tags) && vocab?.tags) {
    // Known tags = all tags.* group values PLUS entity_patterns keys (e.g. npm, vitest, playwright)
    const allTags = [
      ...Object.values(vocab.tags).flat(),
      ...Object.keys(vocab.entity_patterns || {}),
    ];
    // Normalize BOTH sides before the unknown-tag filter for parity with
    // vocab-sync.js (which lowercases/kebab-cases tags before comparing and
    // appending). Without this, a staged `My Tag` still warns "Unknown tags:
    // [My Tag]" on every commit even after vocab-sync appends `my-tag`.
    const normalizeTag = (tag) => String(tag).toLowerCase().trim().replace(/[\s_]+/g, '-');
    const knownTags = new Set(allTags.map(normalizeTag).filter(Boolean));
    const unknown = fm.tags.filter((t) => {
      const normalized = normalizeTag(t);
      return normalized && !knownTags.has(normalized);
    });
    if (unknown.length > 0) {
      console.warn(
        `[validate-memory] ⚠ ${filePath}: Unknown tags: [${unknown.join(', ')}]. ` +
        `Consider adding them to memory-bank/.vocabulary.json.`
      );
    }
  }

  return errors;
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const stagedFiles = getStagedMemoryFiles();

  if (stagedFiles.length === 0) {
    process.exit(0); // No memory-bank files staged — nothing to validate
  }

  const vocab = loadVocabulary();
  let hasErrors = false;

  for (const file of stagedFiles) {
    const errors = validateFile(file, vocab);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${file}:`);
      for (const err of errors) {
        console.error(`   - ${err}`);
      }
      console.error('');
      console.error('   Fix: Add valid YAML frontmatter at the top of the file:');
      console.error('   ---');
      console.error('   id: <filename-slug>');
      console.error('   title: "<H1 heading>"');
      console.error('   updated: YYYY-MM-DD');
      console.error('   tags: [<from vocabulary>]');
      console.error('   entities: [<components>]');
      console.error('   category: <from list>');
      console.error('   ---');
      console.error('');
    }
  }

  if (hasErrors) {
    console.error(
      `[validate-memory] ${stagedFiles.length} file(s) checked, errors found. ` +
      `Run 'node scripts/normalize-memory.js' to auto-fix, or fix manually.`
    );
    process.exit(1);
  }

  console.log(`[validate-memory] ✓ ${stagedFiles.length} memory file(s) validated`);
  process.exit(0);
}

// Only run when executed directly (node scripts/validate-memory-schema.js).
// When the module is imported — e.g. by unit tests exercising validateFile —
// no side effects are triggered (main() calls process.exit(), which would
// terminate the test runner).
const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

export { validateFile, main };
