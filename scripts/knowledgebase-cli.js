#!/usr/bin/env node

/**
 * knowledgebase-cli.js — CLI for knowledgebase operations.
 *
 * Supports sync (index learned knowledge), search (semantic search),
 * list (indexed projects), and stats (knowledgebase summary).
 *
 * Usage:
 *   node scripts/knowledgebase-cli.js sync
 *   node scripts/knowledgebase-cli.js search "<query>" [--project <id>] [--threshold <n>] [--topK <n>]
 *
 * Default threshold is 0.0 (no minimum), relying on --topK to limit results.
 *   node scripts/knowledgebase-cli.js list
 *   node scripts/knowledgebase-cli.js stats
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env file into process.env before any configuration reads
import 'dotenv/config';

import {
  chunkLearnedKnowledge,
  closePool,
  getStats,
  listProjects,
  registerProject,
  search,
  upsertChunks,
} from './knowledgebase-index.js';

const args = process.argv.slice(2);
const command = args[0];

/**
 * Parse --flags from argv, returning { flags, positional }.
 * @param {string[]} argv
 * @returns {{ flags: Record<string, any>, positional: string[] }}
 */
function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && i + 1 < argv.length) {
      flags.projectId = argv[++i];
    } else if (argv[i] === '--threshold' && i + 1 < argv.length) {
      flags.threshold = parseFloat(argv[++i]);
    } else if (argv[i] === '--topK' && i + 1 < argv.length) {
      flags.topK = parseInt(argv[++i], 10);
    } else {
      positional.push(argv[i]);
    }
  }

  // Validate threshold range
  if (flags.threshold != null && (isNaN(flags.threshold) || flags.threshold < 0 || flags.threshold > 1)) {
    console.error('[knowledgebase] --threshold must be a number between 0.0 and 1.0');
    process.exit(1);
  }

  return { flags, positional };
}

/**
 * Resolve project ID from --project flag or package.json name field.
 * @param {{ projectId?: string }} flags
 * @returns {string|null}
 */
function resolveProjectId(flags) {
  if (flags.projectId) return flags.projectId;
  try {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    return pkg.name || null;
  } catch {
    return null;
  }
}

async function main() {
  try {
    switch (command) {
      // ── sync ──────────────────────────────────────────────────
      case 'sync': {
        const { flags } = parseFlags(args.slice(1));

        // Graceful degradation when DATABASE_URL is not configured
        if (!process.env.DATABASE_URL) {
          console.log('[knowledgebase] Skipping sync — DATABASE_URL not configured');
          return;
        }

        // Resolve project identifier
        const projectId = resolveProjectId(flags);
        if (!projectId) {
          console.error(
            '[knowledgebase] Could not determine project ID. ' +
            'Provide --project <id> or ensure package.json has a "name" field.'
          );
          process.exit(1);
        }

        // Read learned-knowledge file
        const kbPath = resolve('.agents/instructions/learned-knowledge.instructions.md');
        let markdown;
        try {
          markdown = readFileSync(kbPath, 'utf8');
        } catch {
          console.error(`[knowledgebase] Could not read file: ${kbPath}`);
          process.exit(1);
        }

        // Parse into structured chunks
        const chunks = chunkLearnedKnowledge(markdown, projectId);
        if (chunks.length === 0) {
          console.log('[knowledgebase] No new knowledge chunks found — nothing to index');
          return;
        }

        // Register/update the project in the projects table
        await registerProject(projectId, projectId);

        // Upsert all chunks (idempotent — duplicates skipped)
        const result = await upsertChunks(chunks);

        console.log(
          `[knowledgebase] Indexed ${result.inserted} new, ` +
          `updated ${result.updated}, skipped ${result.skipped} chunks ` +
          `from project ${projectId}`
        );
        break;
      }

      // ── search ────────────────────────────────────────────────
      case 'search': {
        const { flags, positional } = parseFlags(args.slice(1));
        const query = positional.join(' ');
        if (!query) {
          console.error(
            'Usage: node scripts/knowledgebase-cli.js search "<query>" [--project <id>] [--threshold <n>] [--topK <n>]'
          );
          process.exit(1);
        }

        const results = await search(query, {
          project_id: flags.projectId,
          threshold: flags.threshold != null ? flags.threshold : undefined,
          limit: flags.topK || 5,
        });

        if (results.length === 0) {
          const hint = flags.projectId
            ? `No results for project "${flags.projectId}".`
            : 'No results found. The knowledgebase may be empty or DATABASE_URL may not be configured.';
          console.log(`[knowledgebase] ${hint}`);
        } else {
          console.log(`[knowledgebase] Found ${results.length} result(s):\n`);
          for (const r of results) {
            const excerpt = r.content.length > 100
              ? r.content.slice(0, 100) + '...'
              : r.content;
            console.log(
              `  Project:    ${r.project_id}\n` +
              `  Similarity: ${r.similarity}\n` +
              `  Date:       ${r.session_date}\n` +
              `  ${excerpt}\n`
            );
          }
        }
        break;
      }

      // ── list ──────────────────────────────────────────────────
      case 'list': {
        const projects = await listProjects();

        if (projects.length === 0) {
          console.log('[knowledgebase] No projects indexed yet.');
        } else {
          console.log(`[knowledgebase] Indexed projects (${projects.length}):\n`);
          for (const p of projects) {
            console.log(
              `  ${p.project_id}\n` +
              `    Name:         ${p.name}\n` +
              `    Chunks:       ${p.chunk_count}\n` +
              `    Last Indexed: ${p.last_indexed || 'never'}\n`
            );
          }
        }
        break;
      }

      // ── stats ─────────────────────────────────────────────────
      case 'stats': {
        const s = await getStats();
        console.log(
          `[knowledgebase] Knowledgebase statistics:\n` +
          `  Total projects: ${s.total_projects}\n` +
          `  Total chunks:   ${s.total_chunks}\n` +
          `  Database size:  ${s.db_size}\n` +
          `  Last sync:      ${s.last_sync || 'never'}`
        );
        break;
      }

      // ── default — show usage ──────────────────────────────────
      default:
        console.error('Usage: node scripts/knowledgebase-cli.js <sync|search|list|stats> [args...]\n');
        console.error('Commands:');
        console.error('  sync                                      Index learned knowledge from');
        console.error('                                            .agents/instructions/learned-knowledge.instructions.md');
        console.error('  search "<query>" [--project <id>]         Semantic search across indexed knowledge');
        console.error('                    [--threshold <n>]       Minimum similarity threshold (0.0–1.0, default 0.0)');
        console.error('                    [--topK <n>]            Maximum results (default 5)');
        console.error('  list                                      List all indexed projects with chunk counts');
        console.error('  stats                                     Knowledgebase statistics summary');
        process.exit(1);
    }
  } catch (err) {
    console.error(`[knowledgebase] Error: ${err.message}`);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
