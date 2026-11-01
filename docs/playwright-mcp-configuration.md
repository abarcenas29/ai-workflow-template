---
id: "playwright-mcp-configuration"
title: "Playwright MCP Configuration"
updated: "2026-10-31"
tags: [configuration]
doc_type: "configuration"
---


# Playwright MCP Configuration

## Overview

The Playwright MCP (Model Context Protocol) server is configured to work seamlessly with the existing Playwright test configuration. This document explains how the browser automation works in both headed (visible) and headless modes, and how to choose the browser (Google Chrome by default, Firefox via a second server).

## Default Behavior

By default, **Playwright MCP runs in headed mode** (browser window is visible). This is ideal for debugging and visual verification of automated browser actions.

The default browser is **Google Chrome** (the `chrome` channel), not Playwright's bundled Chromium. With no `--browser` flag, `@playwright/mcp` sets `launchOptions.channel` to `chrome`, which drives whatever Google Chrome installation is on the machine. The `playwright` server in this repo runs exactly that (`npx @playwright/mcp@latest` with no flags), so **Google Chrome must be installed**; without it the server fails at browser launch with a channel-not-found error (`Chromium distribution 'chrome' is not found`).

To drive Playwright's bundled Chromium instead, put `{"browser": {"browserName": "chromium"}}` in a config file and pass it with `--config <path>` — there is no `--browser chromium` value. The server only fills in the `chrome` channel when `browserName` is unset, so an explicit `"chromium"` keeps the bundled build. (Mechanism verified against the `@playwright/mcp@0.0.83` config schema and its `validateBrowserConfig()`; the default channel was not exercised on a machine without Google Chrome.)

## Browser selection

The browser is chosen **when the MCP server starts** — there is no runtime browser switch. A second server entry is therefore needed for a second browser.

**Upgrading an existing project:** sync never rewrites an existing `opencode.json` — it is project-owned and only created when absent — so the `playwright-firefox` block and the `playwright-firefox_*` permission do not appear on their own. Add both to your `opencode.json` by hand; the launcher change (the other half of this feature) does arrive via sync.

### Servers shipped in this repo

| Server | Browser | Definition |
| --- | --- | --- |
| `playwright` | Google Chrome (`chrome` channel — the default) | `npx @playwright/mcp@latest` |
| `playwright-firefox` | Firefox | `npx @playwright/mcp@latest --browser firefox --isolated` |

Both servers may run at the same time. Note that each one injects its own copy of the Playwright tool schema (~25 tools), so running both roughly doubles the tool definitions your agent receives — worth disabling one if you do not need browser parity.

### `--browser` values

`@playwright/mcp` accepts `--browser <browser>` with these values:

- `chrome` (the default — your installed Google Chrome, not the bundled Chromium)
- `firefox`
- `webkit`
- `msedge`

The equivalent environment variable is `PLAYWRIGHT_MCP_BROWSER` (e.g. `PLAYWRIGHT_MCP_BROWSER=firefox`). The launcher in this repo uses the `BROWSER` environment variable and translates it to `--browser` — see **MCP Configuration** below. The launcher rejects any other value with an error naming the four accepted ones.

### Why the Firefox server uses `--isolated`

`@playwright/mcp` keeps a persistent browser profile on disk by default, in a directory scoped by both channel and workspace: `mcp-{channel}-{workspace-hash}` (for example `~/Library/Caches/ms-playwright/mcp-firefox-1a2b3c4d` on macOS). Because the directory name includes the channel, the Chrome and Firefox servers never share a profile — the genuine conflict is a **second instance of the same channel in the same workspace**, since one persistent profile can only be opened by one browser at a time.

The Firefox server therefore passes `--isolated` (recommended, not required): the profile lives in memory and nothing is written to disk, so a second Firefox client in the same workspace cannot collide with it. The Chrome server deliberately keeps its persistent profile, so logins and cookies survive there — but not in Firefox, whose state is discarded at the end of each session.

To give Firefox a persistent profile instead, give it its own directory:

```bash
npx @playwright/mcp@latest --browser firefox --user-data-dir /path/to/firefox-profile
```

Do not point two concurrently running servers at the same `--user-data-dir`. Through the launcher, the same opt-out is a two-line edit to the `playwright-firefox` `environment` block in `opencode.json`: add `"USER_DATA_DIR": "/path/to/firefox-profile"` and delete the `"ISOLATED": "true"` line. If both are set the launcher keeps `--isolated` and skips `--user-data-dir`, because the CLI rejects the combination (`Browser userDataDir is not supported in isolated mode`).

### Permission namespace

opencode permission globs are namespace-prefixed, so `playwright_*` does **not** match the `playwright-firefox` namespace. Each server needs its own entry in the `permission` block of `opencode.json`:

```json
"permission": {
  "playwright_*": "allow",
  "playwright-firefox_*": "allow"
}
```

The grant lives in that global `permission` block — not in per-agent tool lists. Without `playwright-firefox_*` there, Firefox tool calls are denied even though the `playwright` (Chrome) ones are allowed.

## Installing the Firefox browser

Firefox is usually already present: a bare `npx playwright install` downloads Chromium, Firefox **and** WebKit. It is absent only when that step was narrowed — e.g. `npx playwright install chromium`, which is what CI workflows commonly do. Install it once per machine before enabling the `playwright-firefox` server:

```bash
npx playwright install firefox
```

`@playwright/mcp` bundles its own `playwright-core`, whose required Firefox build can differ from the one your project's `@playwright/test` expects. If the server reports a missing executable (e.g. `Browser "firefox" is not installed; expected executable at .../firefox-XXXX/...`), install the build the server actually wants:

```bash
npx @playwright/mcp install-browser firefox
```

`install-browser` is an **undocumented passthrough**, not a documented option: in `@playwright/mcp@0.0.83` the CLI rewrites `install-browser` to Playwright's own `install` before delegating to it, and the published README/`--help` do not list it. Verified against that version only — treat it as a convenience that may change. When it works, it downloads the revision pinned by the MCP server itself and is the most reliable option when the two version lines drift.

## Configuration Options

### Environment Variables

The following environment variables control the Playwright MCP behavior (read by the launcher script at server start):

```bash
# Run in headed mode (default: false → headed)
HEADLESS=false

# Browser to launch: chrome | firefox | webkit | msedge (default: chrome)
BROWSER=firefox

# Recommended for the Firefox server: keep the profile in memory so nothing is
# written to disk and a second Firefox client in the same workspace cannot
# collide with it (default: unset → persistent profile)
ISOLATED=true

# Persistent profile path instead of isolation (skipped when ISOLATED=true)
# USER_DATA_DIR=/path/to/firefox-profile

# Set viewport size (default: 1280x720)
VIEWPORT=1920x1080
```

`SLOW_MO` is **not** an MCP setting. `@playwright/mcp` has no `--slow-mo` flag, so the variable only affects the Playwright **test runner** (`playwright.config.ts` → `launchOptions.slowMo`). `.env.example` mentions it as a commented-out test-runner line, and the example MCP config forwards it, but the launcher ignores it.

Likewise, `VIEWPORT` is an MCP-only setting: `playwright.config.ts` hardcodes `viewport: { width: 1280, height: 720 }` and does not read `VIEWPORT`.

### MCP Configuration

The MCP configuration is located in `opencode.json` (the shipped template is `opencode.mcp.example.json`, copied to `opencode.json` at the consumer root when no config exists yet). The snippet below is **as shipped in `opencode.mcp.example.json`** — both servers routed through the launcher:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["node", "scripts/mcp/playwright-mcp-launcher.js"],
      "environment": {
        "HEADLESS": "{env:HEADLESS}",
        "SLOW_MO": "{env:SLOW_MO}",
        "VIEWPORT": "{env:VIEWPORT}"
      },
      "timeout": 120000,
      "enabled": true
    },
    "playwright-firefox": {
      "type": "local",
      "command": ["node", "scripts/mcp/playwright-mcp-launcher.js"],
      "environment": {
        "BROWSER": "firefox",
        "ISOLATED": "true",
        "HEADLESS": "{env:HEADLESS}",
        "VIEWPORT": "{env:VIEWPORT}"
      },
      "timeout": 120000,
      "enabled": true
    }
  }
}
```

> This repository's own `opencode.json` differs: it uses the raw `npx` form for both servers (`["npx", "@playwright/mcp@latest"]` and `["npx", "@playwright/mcp@latest", "--browser", "firefox", "--isolated"]`), so it reads none of `HEADLESS`, `VIEWPORT`, `BROWSER` or `ISOLATED`. Fresh consumers get the launcher form above.

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

MCP servers start with your MCP host (opencode). With no environment overrides the launcher starts Google Chrome **headed**:

```bash
# Nothing to set — headed Google Chrome is the default
opencode
```

### Running MCP in Headless Mode

```bash
# Set the variable before starting the host
HEADLESS=true opencode
```

Or create a `.env` file:

```bash
# .env
HEADLESS=true
VIEWPORT=1920x1080
```

The values are read once, when the MCP server is spawned — restart the host (or reconnect the MCP server) after changing them.

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

### Firefox Server Fails to Start

Check:
1. **Executable missing** — run `npx playwright install firefox` (a bare `npx playwright install` already includes Firefox; it is missing only if that step was narrowed to Chromium).
2. **Profile lock** — two Firefox servers sharing one profile. The shipped `playwright-firefox` entry uses `--isolated`; if you removed it, either restore it or give each Firefox client a distinct `--user-data-dir`.
3. **Permission denied** — `playwright-firefox_*` is missing from the `permission` block; `playwright_*` does not cover it.
4. **Sandboxed shell** — on macOS, launching Firefox from inside a sandboxed process can fail with `sandbox_extension_issue_file_to_process failed ... (Operation not permitted)` or, once the browser process starts, `Could not find profile folder` (the profile directory cannot be initialised). Chromium-family browsers are unaffected. Run the host outside that sandbox.

### Slow Performance

If browser interactions are too fast to see, use the **test runner**:

```bash
# Add slow motion delay (tests only — MCP has no --slow-mo flag)
SLOW_MO=500 npm test
# or in .env: SLOW_MO=500
```

### Inconsistent Behavior Between Tests and MCP

Both should use the same environment variables. The configuration ensures:
- `playwright.config.ts` reads from `process.env.HEADLESS`
- MCP launcher reads from `process.env.HEADLESS`
- VSCode settings pass `HEADLESS` to both contexts

`SLOW_MO` and `VIEWPORT` are **not** shared: `SLOW_MO` applies to tests only, `VIEWPORT` to MCP only.

## Files Summary

- **playwright.config.ts** - Test runner configuration
- **opencode.json** - MCP server configuration (template: `opencode.mcp.example.json`)
- **scripts/mcp/playwright-mcp-launcher.js** - MCP launcher wrapper (`buildArgs` translates env → CLI flags)
- **scripts/mcp/playwright-mcp-launcher.test.js** - Unit tests for the launcher
- **.vscode/settings.json** - VSCode extension settings
- **.vscode/launch.json** - Debug configurations
- **.env.example** - Environment variables template

All configurations are synchronized to provide consistent headed/headless behavior across Playwright tests and MCP browser automation.
