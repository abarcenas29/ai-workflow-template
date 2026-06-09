---
name: lighthouse-cli
description: "Google Lighthouse CLI for automated performance, accessibility, SEO, best-practices, and agentic-browsing audits from the command line. Use for running page audits, analyzing JSON results, generating HTML reports, multi-viewport testing, throttled network simulation, performance budgeting, or debugging Core Web Vitals (LCP, INP, CLS). Supports custom Chrome flags, extra headers for auth, and configurable presets."
---

# Lighthouse CLI

Comprehensive reference for running Google Lighthouse audits from the command line.

**Version:** 12.x (current as of June 2026)

## Prerequisites

### Installation

```bash
# Global install
npm install -g lighthouse

# Or use npx (no install required)
npx lighthouse <url>

# Verify
lighthouse --version
```

### Chrome Requirement

Lighthouse requires a Chromium-based browser. By default it auto-discovers Chrome on your system. Override with:

```bash
export CHROME_PATH="/path/to/chromium"
```

## Agent Workflow: Default Behavior

When asked to audit a page, the agent should:

1. Run Lighthouse with `--output=json` (structured data, in-context)
2. Parse the JSON to extract scores, Core Web Vitals, and opportunities
3. Present a concise summary table
4. Only generate an HTML report (`--output=html --view`) if the user explicitly requests it

## CLI Structure

```
lighthouse <url> <options>
├── Logging
│   ├── --verbose
│   └── --quiet
├── Configuration
│   ├── --preset (perf | experimental | desktop)
│   ├── --config-path <custom-config.json>
│   ├── --chrome-flags <flags>
│   ├── --screenEmulation.*
│   ├── --throttling-method (devtools | simulate | provided)
│   └── --throttling.*
├── Audits
│   ├── --only-categories (performance | accessibility | best-practices | seo)
│   ├── --only-audits <audits>
│   └── --skip-audits <audits>
├── Output
│   ├── --output (json | html | csv)
│   ├── --output-path <path>
│   └── --view
└── Options
    ├── --extra-headers <json>
    ├── --blocked-url-patterns <patterns>
    ├── --ignore-status-code
    └── --locale <locale>
```

## Core Commands

### Basic Audit

```bash
lighthouse https://example.com
```

### Specific Categories

```bash
# Performance only
lighthouse https://example.com --only-categories=performance

# Performance + SEO + Accessibility
lighthouse https://example.com --only-categories=performance,seo,accessibility

# All categories
lighthouse https://example.com --only-categories=performance,accessibility,best-practices,seo
```

### Output Formats

```bash
# JSON to file (default for agent workflows)
lighthouse https://example.com \
  --output=json \
  --output-path=./report.json

# JSON to stdout
lighthouse https://example.com \
  --output=json \
  --output-path=stdout \
  --quiet

# HTML report
lighthouse https://example.com \
  --output=html \
  --output-path=./report.html \
  --view

# Multiple outputs
lighthouse https://example.com \
  --output=json,html,csv \
  --output-path=./reports/audit
# Produces: ./reports/audit.report.json, ./reports/audit.report.html, ./reports/audit.csv
```

### Presets

```bash
# Performance-focused (default, mobile emulation)
lighthouse https://example.com --preset=perf

# Desktop mode
lighthouse https://example.com --preset=desktop

# Experimental audits included
lighthouse https://example.com --preset=experimental
```

## Throttling & Network Simulation

### Throttling Method

Lighthouse offers three approaches. `devtools` is most accurate for local development:

| Method | Behavior | Best For |
|---|---|---|
| `devtools` | True protocol-level throttling via Chrome DevTools | Local dev (realistic simulation) |
| `simulate` | Simulated estimates (default) | Production URLs (lightweight) |
| `provided` | No throttling applied | Your own network conditions |

### Throttling Presets

#### Mobile 3G Slow (default for mobile preset)

```bash
lighthouse https://example.com --throttling-method=devtools
```

Equivalent explicit values:
- RTT: 150ms, Download: 1.6 Mbps, Upload: 750 Kbps, CPU: 4x slowdown

#### Fast 3G

```bash
lighthouse https://example.com \
  --throttling.rttMs=150 \
  --throttling.throughputKbps=1638 \
  --throttling.downloadThroughputKbps=1638 \
  --throttling.uploadThroughputKbps=768 \
  --throttling.cpuSlowdownMultiplier=4
```

#### 4G

```bash
lighthouse https://example.com \
  --throttling.rttMs=70 \
  --throttling.throughputKbps=9000 \
  --throttling.downloadThroughputKbps=9000 \
  --throttling.uploadThroughputKbps=9000 \
  --throttling.cpuSlowdownMultiplier=1
```

#### Desktop Wifi (--preset=desktop)

```bash
lighthouse https://example.com --preset=desktop
```

Equivalent explicit values:
- RTT: 40ms, Download: 10 Mbps, Upload: 10 Mbps, CPU: 1x slowdown

#### Custom — No Throttling (raw machine speed)

```bash
lighthouse https://example.com \
  --throttling-method=provided \
  --throttling.cpuSlowdownMultiplier=1
```

### Disabling Screen Emulation

```bash
lighthouse https://example.com \
  --screenEmulation.disabled \
  --throttling-method=provided \
  --no-emulated-user-agent
```

### Chrome Flags for Headless

```bash
lighthouse https://example.com \
  --chrome-flags="--headless --no-sandbox --disable-gpu --window-size=412,915"
```

## Multi-Viewport Audits

Run a batch of audits across mobile, tablet, and desktop breakpoints:

```bash
mkdir -p reports

# Mobile (iPhone SE)
lighthouse https://example.com \
  --screenEmulation.mobile \
  --screenEmulation.width=375 \
  --screenEmulation.height=812 \
  --screenEmulation.deviceScaleFactor=3 \
  --throttling-method=devtools \
  --output=json \
  --output-path=./reports/mobile.json \
  --quiet

# Tablet (iPad Mini)
lighthouse https://example.com \
  --screenEmulation.mobile \
  --screenEmulation.width=768 \
  --screenEmulation.height=1024 \
  --screenEmulation.deviceScaleFactor=2 \
  --throttling.rttMs=70 \
  --throttling.throughputKbps=5000 \
  --throttling.cpuSlowdownMultiplier=2 \
  --output=json \
  --output-path=./reports/tablet.json \
  --quiet

# Desktop
lighthouse https://example.com \
  --preset=desktop \
  --output=json \
  --output-path=./reports/desktop.json \
  --quiet
```

### Scripted Workflow

```bash
#!/bin/bash
URL="${1:-https://example.com}"
DIR="reports/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"

declare -A VIEWPORTS=(
  ["mobile-375x812"]="--screenEmulation.mobile --screenEmulation.width=375 --screenEmulation.height=812 --throttling-method=devtools"
  ["tablet-768x1024"]="--screenEmulation.mobile --screenEmulation.width=768 --screenEmulation.height=1024 --throttling.rttMs=70 --throttling.throughputKbps=5000 --throttling.cpuSlowdownMultiplier=2"
  ["desktop-1440x900"]="--preset=desktop"
)

echo "{ \"url\": \"$URL\", \"results\": {" > "$DIR/summary.json"
for name in "${!VIEWPORTS[@]}"; do
  echo "Auditing $name..."
  lighthouse "$URL" ${VIEWPORTS[$name]} \
    --only-categories=performance,accessibility,seo \
    --output=json \
    --output-path="$DIR/$name.json" \
    --quiet
  perf=$(jq '.categories.performance.score' "$DIR/$name.json")
  a11y=$(jq '.categories.accessibility.score' "$DIR/$name.json")
  seo=$(jq '.categories.seo.score' "$DIR/$name.json")
  echo "  \"$name\": { \"performance\": $perf, \"accessibility\": $a11y, \"seo\": $seo }," >> "$DIR/summary.json"
done
# Remove trailing comma, close JSON
sed -i '' '$ s/,$//' "$DIR/summary.json"
echo "}}" >> "$DIR/summary.json"
```

## Authentication-Guarded Pages

Lighthouse cannot perform interactive logins. Pass pre-obtained credentials via `--extra-headers`:

### Cookies

```bash
lighthouse https://app.example.com/dashboard \
  --extra-headers "{\"Cookie\":\"session=abc123; csrf=xyz789\"}"
```

### Bearer Token

```bash
lighthouse https://app.example.com/api/admin \
  --extra-headers "{\"Authorization\":\"Bearer eyJhbGciOiJSUzI1NiIs...\"}"
```

### From a File (CI-safe)

```bash
# auth-headers.json
{ "Cookie": "session=abc123" }

lighthouse https://app.example.com --extra-headers=./auth-headers.json
```

### Login-then-Audit Pattern

```bash
# Step 1: Authenticate and capture the session cookie
COOKIE=$(curl -s -c - https://app.example.com/login \
  -d "user=admin&pass=$PASSWORD" \
  | grep session | awk '{print $NF}')

# Step 2: Run Lighthouse with captured cookie
lighthouse https://app.example.com/dashboard \
  --extra-headers "{\"Cookie\":\"session=$COOKIE\"}" \
  --output=json \
  --output-path=./report.json
```

### Custom HTTP Headers

```bash
# JSON string
lighthouse https://example.com \
  --extra-headers '{"x-api-key":"sk-1234","x-environment":"staging"}'

# JSON file
lighthouse https://example.com --extra-headers=./headers.json
```

## Parsing JSON Results

Key fields from the JSON output the agent should extract:

| Path | Description |
|---|---|
| `.categories.performance.score` | 0.0–1.0 performance score |
| `.categories.accessibility.score` | 0.0–1.0 accessibility score |
| `.categories['best-practices'].score` | 0.0–1.0 best-practices score |
| `.categories.seo.score` | 0.0–1.0 SEO score |
| `.audits['largest-contentful-paint'].numericValue` | LCP in ms |
| `.audits['interaction-to-next-paint'].numericValue` | INP in ms |
| `.audits['cumulative-layout-shift'].numericValue` | CLS score |
| `.audits['total-blocking-time'].numericValue` | TBT in ms |
| `.audits['speed-index'].numericValue` | Speed Index in ms |
| `.audits['first-contentful-paint'].numericValue` | FCP in ms |
| `.audits['render-blocking-resources'].details.items[]` | Render-blocking requests |
| `.audits['unused-javascript'].details.items[]` | Unused JS bundles |
| `.audits['unused-css-rules'].details.items[]` | Unused CSS rules |
| `.audits['offscreen-images'].details.items[]` | Images not lazy-loaded |

### Quick Score Extraction

```bash
# Get all category scores
lighthouse https://example.com --output=json --output-path=stdout --quiet \
  | jq '{
    performance: .categories.performance.score,
    accessibility: .categories.accessibility.score,
    "best-practices": .categories."best-practices".score,
    seo: .categories.seo.score
  }'

# Get Core Web Vitals
lighthouse https://example.com --output=json --output-path=stdout --quiet \
  | jq '{
    LCP: .audits["largest-contentful-paint"].numericValue,
    TBT: .audits["total-blocking-time"].numericValue,
    CLS: .audits["cumulative-layout-shift"].numericValue,
    FCP: .audits["first-contentful-paint"].numericValue,
    SI: .audits["speed-index"].numericValue
  }'

# Get opportunities (top improvements)
lighthouse https://example.com --output=json --output-path=stdout --quiet \
  | jq '[.audits | to_entries[] | select(.value.details.type == "opportunity" and .value.score != 1) | {
    audit: .key,
    title: .value.title,
    savings: .value.numericValue
  }] | sort_by(.savings) | reverse'
```

## Custom Configuration

### Example: Custom Config File

```json
{
  "extends": "lighthouse:default",
  "settings": {
    "onlyCategories": ["performance", "accessibility"],
    "formFactor": "desktop",
    "throttling": {
      "rttMs": 40,
      "throughputKbps": 10240,
      "cpuSlowdownMultiplier": 1
    },
    "screenEmulation": {
      "width": 1440,
      "height": 900,
      "deviceScaleFactor": 1,
      "mobile": false
    }
  }
}
```

```bash
lighthouse https://example.com --config-path=./lighthouse-custom.json
```

## Local vs. Production Accuracy

### Why Local Scores are Inflated

Running against `localhost` eliminates real network latency. Lighthouse's simulated throttling uses **observed latency** as a baseline — when local latency is ~0ms, scores skew high.

### Mitigations

| Concern | Fix |
|---|---|
| Inflated performance score | Use `--throttling-method=devtools` (protocol-level) instead of `simulate` |
| CI regression detection | Always compare against a **local baseline**, never absolute thresholds |
| Actionable insights unaffected | Diagnostics (render-blocking, unused code, oversized images, layout shifts) are **accurate on local** — use these |
| Real-world prediction | Hit a deployed staging/production URL, or use [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) |

### What's Reliable Locally

- Accessibility audits (100% accurate)
- SEO audits (100% accurate)
- Best-practices audits
- Render-blocking resources detection
- Unused JavaScript/CSS detection
- Image optimization opportunities (oversized, unoptimized formats, missing lazy loading)
- Layout shift detection (CLS)
- DOM size and structure issues

### What Requires Real Deployment

- Accurate **numeric** LCP, FCP, TBT/INP values
- Server response time (TTFB)
- CDN/caching behavior
- Absolute performance score

## Common Chrome Flags

| Flag | Purpose |
|---|---|
| `--headless` | Run without a GUI (CI mandatory) |
| `--no-sandbox` | Required in most Docker/CI environments |
| `--disable-gpu` | Disable GPU hardware acceleration |
| `--window-size=412,915` | Set viewport (mobile emulation) |
| `--disable-dev-shm-usage` | Workaround for /dev/shm issues in Docker |
| `--disable-extensions` | Prevent extensions from interfering |
| `--disable-background-networking` | Reduce noise in network metrics |

```bash
# Full CI-ready flags
lighthouse https://example.com \
  --chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-extensions"
```

## Troubleshooting

| Issue | Solution |
|---|---|
| `ChromeLauncher: No Chrome installations found` | Set `export CHROME_PATH=/path/to/chrome` or install `chromium` |
| Connection refused on port 9222 | Kill stale Chrome processes: `pkill -f chrome` |
| `PAGE_HUNG` or timeout errors | Increase timeout: `--max-wait-for-load=45000` |
| Scores too high on localhost | Use `--throttling-method=devtools` |
| `NO_FCP` / page not fully loading | Flag: `--ignore-status-code` if page returns non-200 |
| Docker: `/dev/shm` too small | Add `--disable-dev-shm-usage` to chrome-flags |
| Headless: fonts look different | Lighthouse only audits structure, not visual rendering |
| Error codes in CI | Lighthouse exits `0` on success, non-zero on failures (score thresholds should use jq + manual check) |

## Available Categories

| Category | Key | What it Measures |
|---|---|---|
| Performance | `performance` | Load speed, interactivity, visual stability (Core Web Vitals) |
| Accessibility | `accessibility` | ARIA, contrast, keyboard navigation, screen reader support |
| Best Practices | `best-practices` | HTTPS, correct image aspect ratios, no vulnerable libraries |
| SEO | `seo` | Meta tags, crawlability, mobile-friendliness, structured data |
| Agentic Browsing | `agentic-browsing` | Compatibility with AI/web agent tools (experimental) |

## Score Reference

| Score | Color | Interpretation |
|---|---|---|
| 0.90–1.00 | Green | Good |
| 0.50–0.89 | Orange | Needs improvement |
| 0.00–0.49 | Red | Poor |

## Global Flags

| Flag | Description |
|---|---|
| `--help` / `-h` | Show help |
| `--version` | Show version |
| `--quiet` | Suppress progress and debug output |
| `--verbose` | Show all logs |
| `--save-assets` | Save trace and devtools logs to disk |
