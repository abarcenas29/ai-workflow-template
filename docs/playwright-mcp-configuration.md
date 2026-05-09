# Playwright MCP Configuration

## Overview

The Playwright MCP (Model Context Protocol) server is configured to work seamlessly with the existing Playwright test configuration. This document explains how the browser automation works in both headed (visible) and headless modes.

## Default Behavior

By default, **Playwright MCP runs in headed mode** (browser window is visible). This is ideal for debugging and visual verification of automated browser actions.

## Configuration Options

### Environment Variables

The following environment variables control the Playwright MCP behavior:

```bash
# Run in headed mode (default: false)
HEADLESS=false

# Add delay between actions in milliseconds (default: 0)
SLOW_MO=100

# Set viewport size (default: 1280x720)
VIEWPORT=1920x1080
```

### MCP Configuration

The MCP configuration is located in `opencode.mcp.json`:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": "node",
      "args": ["scripts/mcp/playwright-mcp-launcher.js"],
      "env": {
        "HEADLESS": "$HEADLESS",
        "SLOW_MO": "$SLOW_MO",
        "VIEWPORT": "$VIEWPORT"
      },
      "enabled": true
    }
  }
}
```

### VSCode Settings

The VSCode settings in `.vscode/settings.json` configure the Playwright extension:

```json
{
  "playwright.reuseBrowser": true,
  "playwright.showTrace": true,
  "playwright.env": {
    "HEADLESS": "false",
    "SLOW_MO": "0"
  },
  "playwright.headed": true
}
```

## Usage Examples

### Running MCP in Headed Mode (Default)

```bash
# No additional flags needed - headed mode is default
npm start
```

### Running MCP in Headless Mode

```bash
# Set environment variable before starting
HEADLESS=true npm start
```

Or create a `.env` file:

```bash
# .env
HEADLESS=true
SLOW_MO=100
```

### Running Tests with MCP

The test configuration in `playwright.config.ts` also respects these environment variables:

```bash
# Run tests in headed mode
npm test

# Run tests in headless mode
HEADLESS=true npm test

# Run tests with slow motion
SLOW_MO=500 npm test
```

## Debugging Workflow

### With Playwright MCP

1. **MCP starts in headed mode by default** - you'll see browser windows open
2. **VSCode extension shows trace** - set `"playwright.showTrace": true`
3. **Browser reuses across sessions** - set `"playwright.reuseBrowser": true`
4. **Environment variables control behavior** - use `.env` file or inline variables

### With VSCode Debugger

Use the pre-configured launch configurations:

1. **"Playwright Test - Current File"** - Runs current test file in headed mode
2. **"Playwright Test - Debug Mode"** - Enables step-through debugging
3. **"Playwright Test - All Tests"** - Runs all tests in headed mode

All launch configurations respect the `HEADLESS` environment variable.

## Common Issues

### Browser Not Visible with MCP

Make sure:
1. `HEADLESS=false` or not set (default is headed)
2. MCP server is using the launcher script in `scripts/mcp/playwright-mcp-launcher.js`
3. No conflicting VSCode settings override the behavior

### Slow Performance

If browser interactions are too fast to see:

```bash
# Add slow motion delay
SLOW_MO=500 npm start
# or in .env: SLOW_MO=500
```

### Inconsistent Behavior Between Tests and MCP

Both should use the same environment variables. The configuration ensures:
- `playwright.config.ts` reads from `process.env.HEADLESS`
- MCP launcher reads from `process.env.HEADLESS`
- VSCode settings pass `HEADLESS` to both contexts

## Files Summary

- **playwright.config.ts** - Test runner configuration
- **opencode.mcp.json** - MCP server configuration
- **scripts/mcp/playwright-mcp-launcher.js** - MCP launcher wrapper
- **.vscode/settings.json** - VSCode extension settings
- **.vscode/launch.json** - Debug configurations
- **.env.example** - Environment variables template

All configurations are synchronized to provide consistent headed/headless behavior across Playwright tests and MCP browser automation.