#!/usr/bin/env node

/**
 * memory-cli.js — CLI for manual memory index operations.
 *
 * Usage:
 *   node scripts/memory-cli.js search "<query>" [--topK 5] [--file activeContext]
 *   node scripts/memory-cli.js rebuild
 *   node scripts/memory-cli.js update          (incremental)
 *   node scripts/memory-cli.js get <fileId>
 *   node scripts/memory-cli.js stats
 */

import { search, rebuildIndex, incrementalUpdate, getFile, getStats, closeDB } from './memory-index.js';

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--topK' && i + 1 < argv.length) {
      flags.topK = parseInt(argv[++i], 10);
    } else if (argv[i] === '--file' && i + 1 < argv.length) {
      flags.sourceFile = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  return { flags, positional };
}

async function main() {
  try {
    switch (command) {
      case 'search': {
        const { flags, positional } = parseFlags(args.slice(1));
        const query = positional.join(' ');
        if (!query) {
          console.error('Usage: node scripts/memory-cli.js search "<query>" [--topK 5] [--file name]');
          process.exit(1);
        }

        const results = await search(query, {
          topK: flags.topK || 5,
          sourceFile: flags.sourceFile,
        });

        if (results.length === 0) {
          console.log(JSON.stringify({ results: [], hint: 'No results. Try running "rebuild" first.' }));
        } else {
          console.log(JSON.stringify({ results }, null, 2));
        }
        break;
      }

      case 'rebuild': {
        const result = await rebuildIndex();
        console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
        break;
      }

      case 'update': {
        const result = await incrementalUpdate();
        console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
        break;
      }

      case 'get': {
        const fileId = args[1];
        if (!fileId) {
          console.error('Usage: node scripts/memory-cli.js get <fileId>');
          process.exit(1);
        }
        const content = getFile(fileId);
        if (content) {
          console.log(content);
        } else {
          console.error(`File not found: ${fileId}`);
          process.exit(1);
        }
        break;
      }

      case 'stats': {
        console.log(JSON.stringify(getStats(), null, 2));
        break;
      }

      default:
        console.error(`Usage: node scripts/memory-cli.js <search|rebuild|update|get|stats> [args...]`);
        console.error('');
        console.error('Commands:');
        console.error('  search "<query>" [--topK N] [--file name]  Semantic search');
        console.error('  rebuild                                      Full index rebuild');
        console.error('  update                                       Incremental update');
        console.error('  get <fileId>                                 Read a memory file');
        console.error('  stats                                        Index statistics');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    closeDB();
  }
}

main();
