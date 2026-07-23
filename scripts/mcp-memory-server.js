#!/usr/bin/env node

/**
 * mcp-memory-server.js — MCP server exposing memory-bank tools to OpenCode.
 *
 * Provides: memory_search, memory_rebuild, memory_get
 * Uses stdio transport — OpenCode spawns this as a child process.
 *
 * Configuration (opencode.json):
 *   "memory-bank": {
 *     "type": "local",
 *     "command": ["node", "scripts/mcp-memory-server.js"],
 *     "enabled": true
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { search, rebuildIndex, incrementalUpdate, getFile, getStats } from './memory-index.js';

const VALID_FILES = [
  'activeContext', 'systemPatterns', 'techContext',
  'productContext', 'progress', 'projectbrief',
  'tracker-log', 'architecture-context', 'orchestrator-log',
  'spike-vector-db-memory', 'playwright-mcp-configuration',
];

const server = new Server(
  {
    name: 'memory-bank',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── List tools ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'memory_search',
      description:
        'Semantic search across the project memory bank (activeContext, systemPatterns, progress, decisions, tasks). ' +
        'Returns ranked chunks with source file and similarity score. ' +
        'Use this instead of reading all memory files to save tokens.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query about project context, decisions, or status',
          },
          topK: {
            type: 'number',
            default: 5,
            description: 'Number of results to return (1-20)',
          },
          sourceFile: {
            type: 'string',
            description: 'Optional: filter to a specific memory file (e.g., "activeContext", "systemPatterns")',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'memory_rebuild',
      description:
        'Full rebuild of the memory vector index from memory-bank/*.md and docs/*.md files. ' +
        'Re-indexes every file regardless of change. ' +
        'Use memory_update instead for faster incremental sync (only changed files). ' +
        'The index is disposable — rebuilding is safe.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'memory_update',
      description:
        'Incremental update — only re-indexes files whose content changed (SHA-256 content hash). ' +
        'Much faster than memory_rebuild for daily use (~2 seconds vs minutes). ' +
        'Run this after completing tasks, writing to memory-bank, or after git pull.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'memory_get',
      description:
        'Read the full content of a specific memory file by name. ' +
        'Use when you need the complete file, not just search snippets.',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File ID without extension. One of: ' + VALID_FILES.join(', '),
            enum: VALID_FILES,
          },
        },
        required: ['file'],
      },
    },
    {
      name: 'memory_stats',
      description: 'Get statistics about the memory index (vector count, file count, database size).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

// ── Handle tool calls ────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'memory_search': {
        const results = await search(args.query, {
          topK: args.topK || 5,
          sourceFile: args.sourceFile || undefined,
        });

        if (results.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No results found. The index may be empty. Try running memory_rebuild first.',
            }],
          };
        }

        const formatted = results
          .map((r, i) =>
            `### Result ${i + 1} (score: ${r.score})\n` +
            `**File:** \`${r.source_file}\`\n\n${r.content}`
          )
          .join('\n\n---\n\n');

        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'memory_rebuild': {
        const result = await rebuildIndex();
        return {
          content: [{
            type: 'text',
            text: `Index rebuilt successfully.\n` +
              `- Chunks indexed: ${result.indexed}\n` +
              `- Chunks skipped (unchanged): ${result.skipped}\n` +
              `- Total vectors: ${result.stats.totalVectors}\n` +
              `- Total files: ${result.stats.totalFiles}\n` +
              `- DB size: ${result.stats.dbSize}`,
          }],
        };
      }

      case 'memory_update': {
        const result = await incrementalUpdate();
        return {
          content: [{
            type: 'text',
            text: `Index updated incrementally.\n` +
              `- Chunks re-indexed: ${result.indexed}\n` +
              `- Chunks cached (unchanged): ${result.skipped}\n` +
              (result.changed.length > 0
                ? `- Changed files: ${result.changed.join(', ')}\n`
                : '- No files changed.\n') +
              `- Total vectors: ${(await getStats()).totalVectors}`,
          }],
        };
      }

      case 'memory_get': {
        const content = getFile(args.file);
        if (!content) {
          return {
            content: [{
              type: 'text',
              text: `File not found: ${args.file}.md. Available files: ${VALID_FILES.join(', ')}`,
            }],
          };
        }
        return {
          content: [{ type: 'text', text: content }],
        };
      }

      case 'memory_stats': {
        const stats = getStats();
        return {
          content: [{
            type: 'text',
            text: `**Memory Index Stats**\n` +
              `- Total vectors: ${stats.totalVectors}\n` +
              `- Total files indexed: ${stats.totalFiles}\n` +
              `- Database size: ${stats.dbSize}`,
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${err.message}`,
      }],
      isError: true,
    };
  }
});

// ── Start server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[memory-bank-mcp] Server started via stdio transport');
}

main().catch((err) => {
  console.error('[memory-bank-mcp] Fatal error:', err);
  process.exit(1);
});
