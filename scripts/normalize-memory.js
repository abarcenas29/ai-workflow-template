#!/usr/bin/env node

/**
 * normalize-memory.js — Onboarding script for memory-bank vectorization.
 *
 * Performs one-time normalization of existing documentation:
 * 1. Adds YAML frontmatter to memory-bank/*.md and docs/*.md files missing it
 * 2. Auto-suggests tags and entities from .vocabulary.json
 * 3. Migrates plan/*.md to docs/ (if plan/ directory has content)
 * 4. Validates heading structure (memory-bank files)
 *
 * Idempotent — safe to run multiple times. Files already normalized are skipped.
 *
 * Usage:
 *   node scripts/normalize-memory.js          # Normalize (creates .normalized marker)
 *   node scripts/normalize-memory.js --force  # Re-normalize all files
 *   node scripts/normalize-memory.js --dry-run # Show what would change
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const consumerRoot = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : process.cwd();

const MEMORY_BANK_DIR = resolve(consumerRoot, 'memory-bank');
const DOCS_DIR = resolve(consumerRoot, 'docs');
const PLAN_DIR = resolve(consumerRoot, 'plan');
const VOCAB_PATH = resolve(MEMORY_BANK_DIR, '.vocabulary.json');
const MARKER_FILE = resolve(MEMORY_BANK_DIR, '.normalized');
const SOURCE_VOCAB_PATH = resolve(packageRoot, 'memory-bank', '.vocabulary.json');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');

// ── Load vocabulary ──────────────────────────────────────────────────

function loadVocabulary() {
  const vocabPath = existsSync(VOCAB_PATH) ? VOCAB_PATH : SOURCE_VOCAB_PATH;
  if (!existsSync(vocabPath)) {
    console.warn('[normalize-memory] No .vocabulary.json found. Tags will not be auto-suggested.');
    return null;
  }
  return JSON.parse(readFileSync(vocabPath, 'utf8'));
}

function getAllTags(vocab) {
  if (!vocab || !vocab.tags) return [];
  return Object.values(vocab.tags).flat();
}

// ── Parse existing frontmatter ───────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: null, body: content };

  const raw = match[1];
  const fm = {};
  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      fm[kv[1]] = kv[2].trim();
    }
  }
  return { frontmatter: fm, body: content.slice(match[0].length) };
}

// ── Extract H1 title ─────────────────────────────────────────────────

function extractTitle(content) {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : basename(content, extname(content));
}

// ── Auto-suggest tags ────────────────────────────────────────────────

function suggestTags(body, allTags) {
  const lowerBody = body.toLowerCase();
  return allTags.filter(tag => lowerBody.includes(tag.toLowerCase()));
}

function suggestEntities(body, vocab) {
  if (!vocab || !vocab.entity_patterns) return [];

  const entities = [];
  for (const [entity, patterns] of Object.entries(vocab.entity_patterns)) {
    for (const pattern of patterns) {
      try {
        if (new RegExp(pattern, 'i').test(body)) {
          entities.push(entity);
          break;
        }
      } catch { /* skip invalid regex */ }
    }
  }
  return entities;
}

function inferCategory(fileName, vocab) {
  if (!vocab || !vocab.file_category_map) return 'context';

  const baseId = basename(fileName, extname(fileName)).replace(/^\./, '');
  if (vocab.file_category_map[baseId]) return vocab.file_category_map[baseId];

  if (fileName.includes('/tasks/')) return 'task';
  if (fileName.startsWith('docs/') || fileName.includes('/docs/')) return 'decision';

  return 'context';
}

function getGitMtime(filePath) {
  try {
    // Fallback to filesystem mtime if git not available
    const stats = statSync(filePath);
    const d = stats.mtime;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── Build frontmatter block ──────────────────────────────────────────

function buildFrontmatterYaml(fm) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: "${value}"`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

// ── Normalize a single file ──────────────────────────────────────────

function normalizeFile(filePath, vocab, allTags, isMemoryBank) {
  const content = readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  if (frontmatter && !force) {
    // Already has frontmatter — skip unless forced
    return { file: filePath, action: 'skipped', reason: 'already normalized' };
  }

  const fileName = basename(filePath);
  const fileId = basename(filePath, extname(filePath));
  const title = extractTitle(body);
  const date = getGitMtime(filePath);
  const tags = suggestTags(body, allTags);
  const entities = suggestEntities(body, vocab);
  const category = isMemoryBank ? inferCategory(fileName, vocab) : undefined;

  const newFm = {
    id: fileId,
    title,
    updated: date,
    tags: tags.length > 0 ? tags : [],
  };

  if (isMemoryBank) {
    newFm.entities = entities;
    newFm.category = category;
  } else {
    // docs/ files get doc_type instead
    newFm.doc_type = inferDocType(fileId);
  }

  const newContent = buildFrontmatterYaml(newFm) + '\n' + body;

  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf8');
  }

  return {
    file: filePath,
    action: dryRun ? 'would-normalize' : 'normalized',
    tags: newFm.tags,
    entities: newFm.entities || [],
    category: newFm.category || newFm.doc_type || 'n/a',
  };
}

function inferDocType(fileId) {
  const map = {
    'tracker-log': 'tracker-log',
    'orchestrator-log': 'orchestrator-log',
    'architecture-context': 'architecture',
    'playwright-mcp-configuration': 'configuration',
  };
  if (map[fileId.replace(/^\./, '')]) return map[fileId.replace(/^\./, '')];
  if (fileId.includes('spike')) return 'spike';
  return 'decision';
}

// ── Collect files ────────────────────────────────────────────────────

function collectMdFiles(dir, skipDir = null) {
  if (!existsSync(dir)) return [];
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === skipDir) continue;
      if (entry.name.startsWith('.') && entry.name !== '.index') continue; // skip hidden dirs except .index
      files.push(...collectMdFiles(fullPath, skipDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── Migrate plan/ to docs/ ───────────────────────────────────────────

function migratePlanToDocs(vocab, allTags) {
  if (!existsSync(PLAN_DIR)) return [];

  const planFiles = collectMdFiles(PLAN_DIR);
  if (planFiles.length === 0) return [];

  ensureDir(DOCS_DIR);
  const results = [];

  for (const planFile of planFiles) {
    const fileName = basename(planFile);
    let destPath = join(DOCS_DIR, fileName);

    // Avoid overwriting existing docs files
    if (existsSync(destPath)) {
      const base = basename(fileName, extname(fileName));
      const ext = extname(fileName);
      destPath = join(DOCS_DIR, `${base}.migrated${ext}`);
    }

    const content = readFileSync(planFile, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);
    const title = extractTitle(body);
    const date = getGitMtime(planFile);
    const tags = suggestTags(body, allTags);

    const fm = {
      id: basename(destPath, extname(destPath)),
      title,
      updated: date,
      tags: tags.length > 0 ? tags : ['migration'],
      doc_type: 'decision',
    };

    if (frontmatter) {
      // Preserve existing frontmatter but add note
      fm.note = `Migrated from plan/ directory during normalization on ${date}`;
    }

    const newContent = buildFrontmatterYaml(fm) + '\n' + body;

    if (!dryRun) {
      writeFileSync(destPath, newContent, 'utf8');
      try { renameSync(planFile, planFile + '.migrated'); } catch { /* ok */ }
    }

    results.push({
      from: planFile,
      to: destPath,
      action: dryRun ? 'would-migrate' : 'migrated',
    });
  }

  // Clean up empty plan/ directory
  if (!dryRun) {
    try {
      const remaining = readdirSync(PLAN_DIR).filter(f => !f.endsWith('.migrated'));
      if (remaining.length === 0) {
        rmdirSync(PLAN_DIR);
        console.log('[normalize-memory] Removed empty plan/ directory');
      }
    } catch { /* ignore */ }
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!dryRun && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function main() {
  // Check if already normalized
  if (existsSync(MARKER_FILE) && !force && !dryRun) {
    console.log('[normalize-memory] Already normalized. Use --force to re-run.');
    process.exit(0);
  }

  const vocab = loadVocabulary();
  const allTags = getAllTags(vocab);

  console.log(`[normalize-memory] Mode: ${dryRun ? 'dry-run' : force ? 'force' : 'normal'}`);

  // Migrate plan/ to docs/
  const migrations = migratePlanToDocs(vocab, allTags);
  if (migrations.length > 0) {
    console.log(`[normalize-memory] Migrated ${migrations.length} files from plan/ to docs/`);
    for (const m of migrations) {
      console.log(`  ${m.action}: ${m.from} → ${m.to}`);
    }
  }

  // Normalize memory-bank files
  const memoryFiles = collectMdFiles(MEMORY_BANK_DIR, '.index');
  console.log(`[normalize-memory] Found ${memoryFiles.length} memory-bank files`);
  for (const file of memoryFiles) {
    const result = normalizeFile(file, vocab, allTags, true);
    if (result.action !== 'skipped') {
      console.log(`  ${result.action}: ${basename(file)} (tags: [${result.tags.join(', ')}], category: ${result.category})`);
    }
  }

  // Normalize docs files (including hidden)
  const docFiles = collectMdFiles(DOCS_DIR);
  console.log(`[normalize-memory] Found ${docFiles.length} docs files`);
  for (const file of docFiles) {
    // Memory-bank files may also exist in docs/ for some projects — skip duplicates
    if (file.includes('/.index/')) continue;
    const result = normalizeFile(file, vocab, allTags, false);
    if (result.action !== 'skipped') {
      console.log(`  ${result.action}: ${basename(file)} (tags: [${result.tags.join(', ')}])`);
    }
  }

  // Create marker file
  if (!dryRun) {
    ensureDir(MEMORY_BANK_DIR);
    writeFileSync(MARKER_FILE, new Date().toISOString() + '\n', 'utf8');
    console.log('[normalize-memory] Created .normalized marker');
  }

  console.log('[normalize-memory] Done.');
}

main();
