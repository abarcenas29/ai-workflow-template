#!/usr/bin/env node

/**
 * Playwright MCP Launcher
 * This script launches the Playwright MCP server with the correct configuration
 * based on environment variables and project settings.
 */

const { spawn } = require('child_process');
const path = require('path');

// Get environment variables
const headless = process.env.HEADLESS === 'true';
const slowMo = process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0;

// Build command arguments
const args = ['@playwright/mcp@latest'];

// Add headless flag if needed
if (headless) {
  args.push('--headless');
}

// Add viewport size if specified
if (process.env.VIEWPORT) {
  args.push('--viewport', process.env.VIEWPORT);
}

// Launch the MCP server
const child = spawn('npx', args, {
  stdio: 'inherit',
  shell: true
});

// Handle process signals
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
