#!/usr/bin/env node

/**
 * mcp-knowledgebase-server.js — MCP server exposing knowledgebase tools to AI agents.
 *
 * Provides: knowledgebase_search, knowledgebase_index, knowledgebase_stats, knowledgebase_list
 * Uses stdio transport — OpenCode spawns this as a child process.
 *
 * Configuration (opencode.json):
 *   "knowledgebase": {
 *     "type": "local",
 *     "command": ["node", "scripts/mcp-knowledgebase-server.js"],
 *     "enabled": true
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Load .env file into process.env before any configuration reads
import 'dotenv/config';

import {
  search,
  upsertChunks,
  chunkLearnedKnowledge,
  getStats,
  listProjects,
  getPool,
  closePool,
} from './knowledgebase-index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const server = new Server(
  {
    name: 'knowledgebase',
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
      name: 'knowledgebase_search',
      description:
        'Semantic search across learned knowledge from all indexed projects. ' +
        'Use this when planning tasks, encountering errors, or seeking patterns from past pipeline sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Natural language query about patterns, conventions, gotchas, or agent behavior ' +
              '(e.g. "how to handle verbose logging in child processes")',
          },
          projectId: {
            type: 'string',
            description: 'Optional: filter to a specific project by its package.json name',
          },
          threshold: {
            type: 'number',
            default: 0.6,
            description: 'Minimum similarity threshold (0.0–1.0). Higher values return fewer but more relevant results.',
          },
          limit: {
            type: 'number',
            default: 5,
            description: 'Number of results to return (1–50)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'knowledgebase_index',
      description:
        'Index or re-index a project\'s learned knowledge content. ' +
        'Use after adding new sessions to learned-knowledge.instructions.md. ' +
        'Idempotent — unchanged sessions are skipped.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project identifier (from package.json "name")',
          },
          content: {
            type: 'string',
            description:
              'Optional: markdown content of learned-knowledge.instructions.md to index. ' +
              'If omitted, reads from .agents/instructions/learned-knowledge.instructions.md',
          },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'knowledgebase_stats',
      description:
        'Get statistics about the centralized knowledgebase, ' +
        'including total projects, chunks, database size, and last sync timestamp.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'knowledgebase_list',
      description:
        'List all projects currently indexed in the knowledgebase. ' +
        'Useful for discovering which projects have shared knowledge.',
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
      case 'knowledgebase_search': {
        const results = await search(args.query, {
          project_id: args.projectId || undefined,
          threshold: args.threshold || 0.6,
          limit: args.limit || 5,
        });

        if (results.length === 0) {
          const pool = await getPool();
          if (!pool) {
            return {
              content: [{
                type: 'text',
                text: 'Knowledgebase not available: DATABASE_URL is not configured. ' +
                  'Set DATABASE_URL in your .env file to enable cross-project knowledge search.',
              }],
            };
          }
          return {
            content: [{
              type: 'text',
              text: 'No results found. The knowledgebase may be empty.',
            }],
          };
        }

        const formatted = results
          .map((r, i) =>
            `### Result ${i + 1} (similarity: ${r.similarity})\n` +
            `**Project:** \`${r.project_id}\`\n` +
            `**Date:** ${r.session_date}\n` +
            `**Pipeline:** ${r.pipeline || 'N/A'}\n\n` +
            `${r.content}`
          )
          .join('\n\n---\n\n');

        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'knowledgebase_index': {
        const projectId = args.projectId;
        if (!projectId) {
          return {
            content: [{
              type: 'text',
              text: 'Error: projectId is required for knowledgebase_index.',
            }],
            isError: true,
          };
        }

        let content = args.content;
        if (!content) {
          try {
            content = readFileSync(
              resolve(
                process.cwd(),
                '.agents/instructions/learned-knowledge.instructions.md'
              ),
              'utf8'
            );
          } catch {
            return {
              content: [{
                type: 'text',
                text: 'No content provided and the default file ' +
                  '.agents/instructions/learned-knowledge.instructions.md ' +
                  'could not be read. Provide the "content" parameter or ensure the file exists.',
              }],
              isError: true,
            };
          }
        }

        const chunks = chunkLearnedKnowledge(content, projectId);
        if (chunks.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No valid knowledge chunks found for project "${projectId}". ` +
                'Ensure the content contains "## Session:" headers with ' +
                '"**New knowledge:**" sections.',
            }],
          };
        }

        const result = await upsertChunks(chunks);
        return {
          content: [{
            type: 'text',
            text:
              `Indexed ${result.inserted} chunks, updated ${result.updated}, ` +
              `skipped ${result.skipped} for project "${projectId}".`,
          }],
        };
      }

      case 'knowledgebase_stats': {
        const stats = await getStats();

        if (stats.total_chunks === 0 && stats.total_projects === 0) {
          const pool = await getPool();
          if (!pool) {
            return {
              content: [{
                type: 'text',
                text: 'Knowledgebase not available: DATABASE_URL is not configured.',
              }],
            };
          }
        }

        return {
          content: [{
            type: 'text',
            text:
              `**Knowledgebase Stats**\n` +
              `- Total projects: ${stats.total_projects}\n` +
              `- Total chunks: ${stats.total_chunks}\n` +
              `- Database size: ${stats.db_size}\n` +
              `- Last sync: ${stats.last_sync || 'Never'}`,
          }],
        };
      }

      case 'knowledgebase_list': {
        const projects = await listProjects();

        if (projects.length === 0) {
          const pool = await getPool();
          if (!pool) {
            return {
              content: [{
                type: 'text',
                text: 'Knowledgebase not available: DATABASE_URL is not configured.',
              }],
            };
          }
          return {
            content: [{
              type: 'text',
              text: 'No projects indexed yet.',
            }],
          };
        }

        const formatted = projects
          .map((p) =>
            `- ${p.name || p.project_id} (${p.chunk_count} chunks, ` +
            `last indexed: ${p.last_indexed || 'Never'})`
          )
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `**Indexed Projects:**\n${formatted}`,
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
  console.error('[knowledgebase-mcp] Server started via stdio transport');
}

process.on('SIGTERM', () => {
  console.error('[knowledgebase-mcp] SIGTERM received, closing pool');
  closePool().catch(() => {});
  process.exit(0);
});

main().catch((err) => {
  console.error('[knowledgebase-mcp] Fatal error:', err);
  process.exit(1);
});
