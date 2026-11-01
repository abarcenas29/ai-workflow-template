# Research: Where do OpenCode and DeepSeek store conversation transcripts?

**Date:** 2026-11-01
**Status:** ✅ Complete (read-only investigation)
**Scope:** Local machine `/Users/aldrichallenbarcenas` (macOS), repo `ai-workflow-template`, runtime `provider=opencode-go`, `model=deepseek-v4.1-flash`
**Constraints:** No shell execution, no config changes. All findings derived from filesystem reads, in-repo evidence, and official vendor documentation.
**Secrets:** Every key, token, password and connection string encountered is redacted in this document. No secret value is reproduced.

---

## 0. Bottom line

| Party | Does it store your transcript in *its* cloud? | Confidence |
|---|---|---|
| **OpenCode CLI/TUI (open-source, local)** | **No.** Sessions are written to a local SQLite database on this Mac. No first-party upload path found in the source tree, no telemetry module, no telemetry config key. | High |
| **`opencode serve` local daemon (127.0.0.1:49374)** | **No.** Loopback HTTP server; the server process *is* the thing that talks to the model provider, and it persists to the same local DB. | High |
| **OpenCode Go gateway (`opencode.ai/inference/go/...`)** | **Partially / unavoidably.** The gateway receives the **full prompt as request content** — it is the inference proxy. It publishes *upstream* training/retention per model but **no retention statement for its own gateway request bodies**. | High for "it sees them"; **ambiguous** for "it stores them" |
| **DeepSeek (as the upstream model behind OpenCode Go, and as your separately-configured `deepseek` provider)** | **Yes — inbound prompt content leaves your machine to infrastructure controlled by Hangzhou DeepSeek Artificial Intelligence Co., Ltd. in the People's Republic of China.** Published retention is open-ended ("as long as necessary"), not a fixed window. | High |

**Practical implication for the leaked GitHub token:** it is on disk locally (SQLite + WAL + tool-output + prompt history), it was transmitted as request content to `opencode.ai`'s inference gateway, and it was very likely forwarded to DeepSeek upstream. Local deletion is necessary but **not sufficient** — the token must be treated as compromised and rotated.

---

## A. OpenCode — local and cloud

### A1. Where transcripts live on this machine

The v1 JSON-file layout (`storage/session/`, `storage/message/`, `storage/part/`) is **gone on this machine**. `~/.local/share/opencode/storage/` now contains only:

```
~/.local/share/opencode/storage/session_diff/   # per-session file-diff JSON (no prompt text)
~/.local/share/opencode/storage/migration        # contains "2" → v2 data-migration marker
```

Sessions live in **SQLite**:

| Path | Role | Evidence |
|---|---|---|
| `~/.local/share/opencode/opencode.db` | **Primary transcript store** (sessions, messages, parts, credentials) | Docs: "The shared server registers itself at: `~/.local/share/opencode/opencode.db`"; "Saved API keys and OAuth tokens live in the server's SQLite database" ([v2 CLI › Providers › Storage](https://opencode.ai/v2/docs/cli/providers), [v2 Troubleshooting](https://opencode.ai/v2/docs/troubleshooting/)) |
| `~/.local/share/opencode/opencode.db-wal` | Write-ahead log; **also contains live transcript bytes** | Binary scan matched this session's prompt text |
| `~/.local/share/opencode/opencode.db-shm` | SQLite shared-memory index | present |
| `~/.local/share/opencode/opencode-.db` (+ `-wal`, `-shm`) | Separate channel DB (empty channel name in filename) | `packages/cli/src/database-path.ts` builds `opencode-${channel}.db`, and `opencode.db` only for channels `latest/dev/beta/next/prod` — an empty channel string yields `opencode-.db` |

**Direct confirmation that *this* session is in `opencode.db`:** a binary-content scan for the unique string `transcript-storage` (present only in this session's task prompt) matched inside `opencode.db` and `opencode.db-wal`. The same string does **not** appear in `~/.local/share/opencode-v1/...`.

Other local artefacts that hold conversation-adjacent data:

| Path | Contents |
|---|---|
| `~/.local/share/opencode/log/opencode.log` | Structured server log; contains **full shell command lines and their arguments**, plus `providerID`/`modelID` and token-usage diagnostics. Docs warn heap snapshots "contain prompts, file contents, and credentials. Do not share it publicly." |
| `~/.local/share/opencode/tool-output/tool_*` | Raw tool/MCP outputs (truncation overflow) |
| `~/.local/share/opencode/snapshot/`, `worktree/`, `repos/` | Git snapshot objects and linked worktrees |
| `~/.local/state/opencode/` | `model.json` (recent models — **`opencode-go/deepseek-v4.1-flash` is first/recent**), `session.json`, `kv.json`, `prompt-history.jsonl`, `service.json`, `locks/` |
| `~/.local/state/opencode/latest/tui/highlights.json` | TUI highlights |
| `~/.local/share/opencode-v1/data/opencode/{opencode.db,log/opencode.log}` | A second, isolated v1 data directory (separate DB + log) |

**Size:** not measurable in this read-only session (no `stat`/shell). The DB is large — a binary scan walked past ~159 million line-break offsets before matching this session's text, which is consistent with a multi-hundred-megabyte database holding the whole session history.

**Version note:** runtime is the **v2** line — evidence: `storage/migration` = `2`, the channel-based DB filename `opencode-.db` (a v2-only naming function), `~/.local/state/opencode/model.json` (v2 state dir), and the documented default local port `127.0.0.1:49374` ([v2 Intro](https://opencode.ai/v2/docs/), which shows `http://127.0.0.1:49374/auth/connect/...`). A v1 install (`@opencode-ai/plugin 1.14.39`, `~/.local/share/opencode-v1/`) is also present and keeps its own DB.

### A2. Does OpenCode itself send transcripts to an OpenCode cloud service?

Five distinct channels, treated separately:

**(a) Open-source CLI/TUI — no upload path.**
The repo (`github.com/anomalyco/opencode`, MIT) contains no telemetry/analytics module and no session-upload module outside the (now disabled) share feature. Docs: *"OpenCode does not store any of your code or context data. All processing happens locally or through direct API calls to your AI provider."* ([Enterprise](https://opencode.ai/docs/enterprise/), accessed 2026-11-01).

**(b) `opencode serve` / shared background daemon — loopback only.**
*"The `opencode serve` command runs a headless HTTP server… `--hostname` … default `127.0.0.1`"* ([Server](https://opencode.ai/docs/server/)). Optional basic auth via `OPENCODE_SERVER_PASSWORD`; a password is present locally in `~/.config/opencode/service.json` (value **redacted**). The daemon is what performs model calls (`role=server` in the log) and what writes `opencode.db`. It is local.

**(c) Hosted offerings — OpenCode Go / Console.**
When `providerID=opencode-go`, the request body (your entire prompt/context window) is sent to `https://opencode.ai/inference/go/openai/v1` (see A4). This is OpenCode-operated infrastructure. **This is the one place where transcript content does leave the machine.**

**(d) Session sharing — discontinued.**
The share worker in the current source returns HTTP **410** and explicitly does not persist:

> `// V1 clients still create, sync, and remove shares on this host, and the V1 GitHub Action fails its run when share creation fails. Accept those requests without storing anything so existing clients keep working.`
> — [`packages/function/src/share.ts`, branch `dev`](https://github.com/anomalyco/opencode/blob/dev/packages/function/src/share.ts) (accessed 2026-11-01)

Rendered page text: *"Session sharing has been discontinued — opencode no longer hosts shared sessions. This link and its content are no longer available."*
Config key still exists (`share: "manual" | "auto" | "disabled"`), but the endpoint it targets is a no-op. This machine has **no** `share` key set in `opencode.json` (repo root), `~/.config/opencode/opencode.json`, or `~/.config/opencode/cli.json`.

**(e) Ancillary outbound calls (metadata, not transcripts).**
Observed in `opencode.log` on 2026-10-30: `GET https://opencode.ai/console/api/v2/config` ("failed to load OpenCode provider config", `ENOTFOUND` when offline) and update checks against `opencode.ai`. These carry account/workspace identity and version info, not conversation text.

**Verdict:** OpenCode-the-software does not sync transcripts to an OpenCode cloud. **OpenCode-the-gateway necessarily receives them** when you use `opencode-go`.

### A3. Telemetry, analytics, crash reporting

| Question | Finding |
|---|---|
| Telemetry config key in the current schema? | **None.** `https://opencode.ai/config.json` (fetched 2026-11-01) has no `telemetry`/`analytics`/`crashReport` key. The only related property is `experimental.openTelemetry` — *"Enable OpenTelemetry spans for AI SDK calls"* — which is **off unless you set it and supply your own OTLP endpoint**. |
| Same in the installed v1 line? | Yes — `packages/opencode/src/config/config.ts` @ tag `v1.14.39` has only `experimental.openTelemetry`. No opt-out key exists because there is no on-by-default first-party telemetry to opt out of. |
| Any telemetry/analytics/Sentry/PostHog module? | **None.** Full git-tree scan of `anomalyco/opencode@dev` for paths matching `telemetr|analytics|posthog|sentry` returns zero source files. Same for `v1.14.39`. |
| Docs statement? | Docs are **silent** — no telemetry page, no privacy/telemetry FAQ. (Pages scanned: all 30 v2 doc pages; only hit was an unrelated Sentry **MCP server example**.) |
| `username` config field | Description says *"Username displayed in conversations and used for telemetry identity"* — **inconsistent with the absence of any telemetry code**. Treat as a stale schema description, but note the discrepancy rather than asserting it is inert. |
| Website analytics | The legal privacy policy does cover analytics **for the website/hosted Services**: *"We may use analytics providers to analyze how you interact and engage with the Services"*, plus Google Analytics performance cookies ([Privacy Policy, effective 2026-03-06](https://opencode.ai/legal/privacy-policy)). This is web-side, not the CLI. |

**Verdict:** no evidence of on-by-default CLI telemetry. The absence of a documented opt-out is consistent with "there is nothing to opt out of", **not** proof — the MIT repo is the only auditable surface and a proprietary server component could behave differently.

### A4. What `opencode-go` is

`opencode-go` is a **first-class provider registered in the models.dev catalogue** that OpenCode ships — not a user-defined provider in this repo's config.

| Property | Value | Source |
|---|---|---|
| Display name | **"OpenCode Go"** | `https://models.dev/api.json` → `opencode-go` |
| API base URL | **`https://opencode.ai/inference/go/openai/v1`** | same |
| Env var | `OPENCODE_API_KEY` | same |
| AI SDK package | `@ai-sdk/openai-compatible` | same |
| Docs | `https://opencode.ai/v2/docs/console/go/` | same |
| Model used here | `deepseek-v4.1-flash` → "DeepSeek V4.1 Flash", released 2026-09-10, 1,000,000 ctx, $0.15/$0.60 per 1M (off-peak) | same |

It is the **$10/month subscription tier of the OpenCode Console** (OpenCode Go / Go Plus / Go Teams) — i.e. **operated by OpenCode** (ANOMALY INNOVATIONS, INC. per the ToS):

> *"Go works like any other provider in OpenCode. You subscribe to OpenCode Go and get your API key."* … *"OpenCode Go gives you reliable access to popular open coding models"* — [Console › Go](https://opencode.ai/v2/docs/console/go/)

Local corroboration that this provider is actually in use right now, from `~/.local/share/opencode/log/opencode.log`:

```
message="sending session generation request" ... providerID=opencode-go modelID=deepseek-v4.1-flash
message="session generation usage diagnostic" usage=... "providerMetadata":{"opencode-go":{... "opencode":{"billing_source":"go","list_cost":...,"allowance":...}}}
```

`billing_source: "go"` + `allowance` confirms OpenCode-side metering, and `~/.local/state/opencode/model.json` lists `{"providerID":"opencode-go","modelID":"deepseek-v4.1-flash"}` as the most recent model.

**What the gateway can see:** the full request body (system prompt, instructions files, every message, every tool result), plus metadata — `x-opencode-session` (a stable session ID it asks clients to send "so we can optimize routing and prompt caching"), user-agent, token counts. It also states *"Traffic is monitored for abuse"*.

**Region wrinkle (material for you):** OpenCode classifies DeepSeek as a **restricted model**:

> *"Workspace privacy settings apply to Go. By default, paid endpoints that train on request data are blocked, and allowed regions are Europe & United States. Workspaces without saved privacy settings also allow Global for requests from China. In Settings › Privacy, an owner or admin can enable: **DeepSeek V4.1 Flash and V4 Pro: select Global under Regions**."*
> — [Console › Go](https://opencode.ai/v2/docs/console/go/)

So DeepSeek traffic is served from a region OpenCode groups with "Global … requests from China" and requires explicit admin enablement. Since this session is successfully using `deepseek-v4.1-flash`, that enablement exists on this workspace. **The docs do not name the actual serving country** — treat "China-routed" as strongly implied, not proven.

---

## B. DeepSeek — API data handling

### B5. What the official documents actually say

Two documents are relevant, and neither gives a clean API-specific retention number.

**(i) DeepSeek Privacy Policy — Last Update: Feb 10, 2026**
<https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html> (accessed 2026-11-01)

- Controller/geography:
  > *"The Services are provided and controlled by Hangzhou DeepSeek Artificial Intelligence Co., Ltd., with its registered address in China"*
  > *"To provide you with our services, we directly collect, process and store your Personal Data in People's Republic of China."*
- Training:
  > *"To improve and develop the Services and to train and improve our technology, such as our machine learning models and algorithms. Including by monitoring interactions and usage across your devices, analyzing how people are using it, and training and improving our technology."*
- Opt-out (consumer-facing right):
  > *"the right to opt-out of using your Personal Data for training our models or optimizing our technologies."*
- Retention — **no fixed period**:
  > *"We retain Personal Data for as long as necessary to provide our Services and for the other purposes set out in this Privacy Policy… The retention periods will be different depending on the amount, type and sensitivity of Personal Data… For example, when we process your Personal Data to provide you with the Services, we keep this Personal Data for as long as you have an account."*
- Scope caveat:
  > *"the processing rules for Personal Data collected from end users when accessing downstream systems or applications developed by developers using our open platform services are not covered by this privacy policy."*

**(ii) DeepSeek Open Platform Terms of Service — Release 2026-04-22, Effective 2026-04-29**
<https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html>

- Data handling is delegated, not specified:
  > §5.5 *"We will collect and process the personal information you provide as the data subject in accordance with the 'DeepSeek Privacy Policy'."*
- Ownership, not retention:
  > §4.2 *"(1) You retain any rights, title, and interests—if any—in the Inputs you submit; (2) We assign any rights… in the Outputs of the Services to you"*
- The ToS contains **no retention window, no storage-location clause, and no express "we do not train on API inputs" promise**.

**Honest reading:** DeepSeek does **not** publish a concrete API retention period. The only concrete, dated retention claim in the whole ecosystem is OpenCode's own table (below). Anything else would be a guess.

**Third-party-but-authoritative claim — OpenCode Go privacy table** ([Console › Go › Privacy](https://opencode.ai/v2/docs/console/go/), accessed 2026-11-01):

| Model | Model training | Data retention |
|---|---|---|
| **DeepSeek V4.1 Flash** | **Not used** | **0 days\*** |
| DeepSeek V4 Pro | Not used | 0 days\* |
| Claude Haiku 5.5 | Not used | 30 days |
| GPT 6 Luna / GPT 5.6 Luna | Not used | 30 days |
| Gemini 4 Argon, GLM-5.x, Kimi K2.7/K3, Qwen3.x, MiniMax, MiMo… | Not used | 0 days |
| Muse Spark 1.3/1.2 Contributor, Iceman Contributor Free | **Yes** | Not ZDR |

> \* *"DeepSeek: ZDR agreement is renewed monthly. The current agreement is valid through October 31, 2026."*

⚠️ **Time-sensitive:** this footnote cites a ZDR (zero-data-retention) agreement valid through **2026-10-31** — i.e. it expired *yesterday* relative to this report (2026-11-01). The docs were not updated with a renewal date. **Do not represent DeepSeek as zero-retention today without re-checking that page.**

### B6. Opt-out / zero-retention / enterprise options for the DeepSeek API

| Option | Documented? |
|---|---|
| Public API zero-retention tier | **No.** Nothing in `api-docs.deepseek.com` (29 pages scanned via sitemap) or the Open Platform ToS advertises ZDR for ordinary API customers. |
| Training opt-out | **Only as a data-subject right** in the Privacy Policy ("the right to opt-out…"). No documented API-level toggle/endpoint. |
| Enterprise / on-prem / private deployment | **Not documented on the public API site.** No enterprise page, no self-host offer. (DeepSeek publishes open weights, but that is a different thing from a contracted on-prem API.) |
| Contractual ZDR | **Exists only via a reseller:** OpenCode's footnote is evidence that *OpenCode* holds a monthly-renewed ZDR agreement with DeepSeek. It is not available to you directly. |

**Verdict:** for a direct `deepseek` API key (which this machine also has configured — key redacted), there is **no published mechanism** to guarantee zero retention. Say "not documented", not "impossible".

### B7. 2025–2026 policy changes touching data handling

| Date | Document | Change relevant to retention/training |
|---|---|---|
| **2026-02-10** | DeepSeek Privacy Policy | Current published version ("Last Update: Feb 10, 2026"). China storage + training-use language above. |
| **2026-04-22 / 2026-04-29** | DeepSeek Open Platform Terms of Service | Released / effective. New developer terms; §5.5 delegates data handling to the Privacy Policy; no retention window. |
| **2026-10-17** | DeepSeek API Change Log | Model + in-house search API release — **no data-policy entry** in `https://api-docs.deepseek.com/updates`. |
| **2026-10-31** | OpenCode Go docs | ZDR agreement renewal date stated; **expired 2026-10-31**, no successor date published. |
| **2026-03-06** | OpenCode Privacy Policy | Current effective date; prompt content purpose limited to *"Passing through to upstream provider to provide services"*, but retention described only qualitatively. |
| **2026-08-15** | OpenCode Terms of Service | Current effective date; "Services" now explicitly includes the **inference product**. |

Note: the API changelog contains **no** retention-policy announcements for 2025–2026 — silence, not reassurance.

---

## C. What this means for the leaked GitHub token

### C8. Every place the transcript exists today

| # | Location | Type | Contains the token? |
|---|---|---|---|
| 1 | `~/.local/share/opencode/opencode.db` | Local SQLite (sessions/messages/parts) | **Yes** — confirmed to hold this session's prompt text verbatim |
| 2 | `~/.local/share/opencode/opencode.db-wal` | Local WAL | **Yes** — same text matched |
| 3 | `~/.local/share/opencode/opencode.db-shm` | SQLite index | Metadata only |
| 4 | `~/.local/share/opencode/tool-output/tool_*` | Raw tool/MCP outputs | **Likely**, if the token was echoed by a tool result (e.g. a `cat`/`env`/`gh` output). Not inspected (would require printing the secret). |
| 5 | `~/.local/share/opencode/log/opencode.log` | Server log with full command lines | **Likely**, if the token appeared on a command line |
| 6 | `~/.local/share/opencode/storage/session_diff/*.json` | File diffs only | Only if written into a tracked file |
| 7 | `~/.local/state/opencode/prompt-history.jsonl` | Prompt history | **Yes**, if the token was typed into a prompt |
| 8 | `~/.local/share/opencode-v1/data/opencode/opencode.db`, `.../log/opencode.log` | Second (v1) data dir | If the leak happened in a v1 session |
| 9 | `~/.zsh_history` | Shell history | If typed into a shell |
| 10 | `~/.config/opencode/auth.json`, `~/.local/share/opencode/account.json` | Provider credentials | **No** (these are your key store, not the transcript) |
| 11 | **`https://opencode.ai/inference/go/openai/v1` (OpenCode Go gateway)** | **Remote — request content** | **Yes.** Every model call ships the whole context window. This is not hypothetical: `providerID=opencode-go` request logging is present for 2026-10-30 and 2026-10-31 sessions, and this session is on the same provider. |
| 12 | **DeepSeek upstream (via OpenCode Go)** | **Remote — request content** | **Very likely.** OpenCode's own privacy table says the DeepSeek path is a 0-day-retention ("ZDR") agreement **valid only through 2026-10-31**. That is a contractual claim about the upstream, and it has now lapsed in the published record. |
| 13 | DeepSeek direct API (`api.deepseek.com`) | Remote | **Only if** you also used the `deepseek` provider for that session. A `deepseek` credential is configured in `auth.json`/`account.json` (key redacted), and `model.json` shows recent `deepseek/*` usage — so this is plausible, not established. |
| 14 | OpenCode Console workspace | Account/usage metadata | Token counts, model, workspace, `x-opencode-session` ID. **Not** prompt text per the privacy policy's stated purpose, but the policy permits aggregated/de-identified retention. |
| 15 | macOS Time Machine / any local backup | Backup | Unknown; if it backs up `~/.local/share/opencode`, the deleted rows survive there too. |

**Plainly:** the model provider *did* receive the token as request content — twice over (OpenCode's gateway, then DeepSeek). It is not merely a local file problem.

### Secondary observation (relevant, not proof)

The `github` MCP server on this machine currently fails every call with **`Authentication Failed: Bad credentials`**. That is consistent with the leaked token having already been revoked/rotated — but it could equally be a stale or malformed token. It does **not** prove the leak was contained, and it does not clean up any of locations 1–15.

### Recommended actions (for the coder/user, not executed here)

1. **Revoke the GitHub token now** and issue a replacement. Assume disclosure; do not rely on the ZDR footnote, which expired 2026-10-31.
2. Scrub local copies: `VACUUM` the SQLite DB after deleting the session (`opencode` session delete) — deleting rows alone leaves the text in `-wal` and in free pages. Then remove `tool-output/tool_*`, the matching `opencode.log` spans, `prompt-history.jsonl` entries, and `~/.zsh_history` lines.
3. Add `share: "disabled"` to `~/.config/opencode/opencode.json` — currently unset; the endpoint is a 410 no-op, but the key documents intent and survives a future re-enable.
4. Put the token behind a secret manager, never in prompts, and prefer scoped short-lived tokens (`gh auth token` → fine-grained PAT).
5. Audit whether the token ever appeared on a command line — that replicates it into `opencode.log`.

---

## D. Ambiguities and limitations (stated, not papered over)

| # | Ambiguity | Why it matters |
|---|---|---|
| 1 | **No published cold-storage/retention statement for the OpenCode Go gateway itself.** The Go privacy table lists *upstream model* retention only. | You cannot cite a retention period for `opencode.ai`'s own request logs. |
| 2 | **Enterprise page vs Privacy Policy tension.** Enterprise: *"OpenCode does not store any of your code or context data."* Policy: prompts are collected personal data, retained "as long as necessary", and may be aggregated/anonymized for improvement. | Marketing copy ≠ legal instrument. Prefer the policy text for any decision. |
| 3 | **`username` field says "used for telemetry identity"** while no telemetry code exists in the repo. | Unresolved; possibly dead schema text, possibly server-side. |
| 4 | **"Global" region for DeepSeek is not explicitly labelled as China** in the Go docs. | Region routing is implied, not documented by name. |
| 5 | **DeepSeek publishes no API-specific retention number.** | Any "N days" claim about the DeepSeek API would be invented. |
| 6 | **No exact file sizes / hashes measured** — this session had no shell. | Size figures are qualitative. |
| 7 | **Log coverage gap:** `opencode.log` has no entries dated 2026-11-01, so this session's own model call could not be traced in-log; provider usage is inferred from `model.json` + today's provider config, and confirmed structurally (the DB holds this session). | "Provider received it" rests on the gateway architecture, not on a captured packet. |
| 8 | **Third-party plugin present:** `~/.config/opencode/cli.json` loads `./herdr-opencode`; `herdr-tui-session.js` reports `agent_session_id` + state over a **local** Unix socket (`HERDR_SOCKET_PATH`). It sends IDs/state, not transcript text, but `herdr` itself is third-party and out of scope. | Not an OpenCode cloud path; still a trust boundary you chose. |

---

## E. Sources (all accessed 2026-11-01)

| # | Source | URL | Used for |
|---|---|---|---|
| 1 | OpenCode config JSON Schema (live) | https://opencode.ai/config.json | `share` enum, `username`, `experimental.openTelemetry`, absence of telemetry key |
| 2 | OpenCode v2 Troubleshooting | https://opencode.ai/v2/docs/troubleshooting/ | `~/.local/share/opencode/opencode.db`, `log/opencode.log`, heap-snapshot warning |
| 3 | OpenCode v2 CLI › Providers (Storage) | https://opencode.ai/v2/docs/cli/providers | Credentials in SQLite; `OPENCODE_DB`, XDG path; v1 `auth.json` migration |
| 4 | OpenCode v1 Enterprise docs | https://opencode.ai/docs/enterprise/ | "does not store any of your code or context data"; share-page caution |
| 5 | OpenCode v1 Server docs | https://opencode.ai/docs/server/ | `127.0.0.1` default host, `OPENCODE_SERVER_PASSWORD` |
| 6 | OpenCode v2 Intro | https://opencode.ai/v2/docs/ | `127.0.0.1:49374` default, install/version |
| 7 | OpenCode v2 Console › Intro | https://opencode.ai/v2/docs/console/ | Workspaces, usage tracking, provider gateway |
| 8 | OpenCode v2 Console › Models | https://opencode.ai/v2/docs/console/models/ | Console endpoints `opencode.ai/inference/...` |
| 9 | **OpenCode v2 Console › Go** | https://opencode.ai/v2/docs/console/go/ | Go plans, `opencode-go/<model>` id, **privacy table**, DeepSeek ZDR footnote, restricted-model/region policy, `x-opencode-session` header, abuse monitoring |
| 10 | OpenCode Privacy Policy (eff. 2026-03-06) | https://opencode.ai/legal/privacy-policy | Prompt purpose "passing through to upstream provider"; retention "as long as necessary"; analytics vendors; anonymized reuse |
| 11 | OpenCode Terms of Service (eff. 2026-08-15) | https://opencode.ai/legal/terms-of-service | "Services" = website + **inference product** + hosted software; ANOMALY INNOVATIONS, INC. |
| 12 | OpenCode source — share worker | https://github.com/anomalyco/opencode/blob/dev/packages/function/src/share.ts | Sharing discontinued; "Accept those requests without storing anything"; 410 |
| 13 | OpenCode source — `database-path.ts` | https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/database-path.ts | `opencode.db` vs `opencode-${channel}.db` (explains `opencode-.db`) |
| 14 | OpenCode source — v1 `share-next.ts` | https://github.com/anomalyco/opencode/blob/v1.14.39/packages/opencode/src/share/share-next.ts | Upload shape (session/messages/parts/diffs), `OPENCODE_DISABLE_SHARE`, explicit `create()` |
| 15 | OpenCode source — schema `config.ts` | https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/config.ts | `share` optional (no default), `username` telemetry description |
| 16 | models.dev catalogue | https://models.dev/api.json | `opencode-go`: name, `api` base URL, `OPENCODE_API_KEY`, model metadata; `deepseek` entry |
| 17 | **DeepSeek Privacy Policy** (Last Update 2026-02-10) | https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html | China controller/storage, training purposes + opt-out right, open-ended retention |
| 18 | **DeepSeek Open Platform ToS** (rel. 2026-04-22, eff. 2026-04-29) | https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html | §4.2 input/output ownership, §5.5 delegates data handling to Privacy Policy; no retention clause |
| 19 | DeepSeek Terms of Use (Last Update 2026-03-27) | https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html | Consumer terms context |
| 20 | DeepSeek API Change Log | https://api-docs.deepseek.com/updates | 2026 model releases; **no data-policy entries** |
| 21 | DeepSeek API docs (sitemap, 29 pages) | https://api-docs.deepseek.com/sitemap.xml | Confirms no ZDR/enterprise/on-prem page exists |
| 22 | DeepSeek ↔ OpenCode integration | https://api-docs.deepseek.com/quick_start/agent_integrations/opencode | Direct `deepseek` provider path (separate from OpenCode Go) |

---

## F. Local evidence index (reproducible, no secrets)

| Claim | How verified |
|---|---|
| This session is in `opencode.db` | Binary scan of `~/.local/share/opencode/opencode.db` for the unique string `transcript-storage` → match at the current prompt text |
| Also in the WAL | Same scan on `opencode.db-wal` → match |
| Not in the v1 data dir | Same scan on `~/.local/share/opencode-v1/data/opencode/opencode.db` → no match for `transcript-storage` |
| `opencode-.db` is a different/empty channel DB | No match for `ses_` in `~/.local/share/opencode/opencode-.db` |
| v2 format migration done | `~/.local/share/opencode/storage/migration` contains `2`; `storage/` holds only `session_diff/` + `migration` |
| Provider actually in use | `~/.local/state/opencode/model.json` first `recent` entry = `opencode-go/deepseek-v4.1-flash` |
| Gateway metering | `opencode.log` (`2026-10-30`, `2026-10-31`): `providerID=opencode-go`, `"billing_source":"go"`, `"allowance"`, `"list_cost"` |
| Console config endpoint | `opencode.log`: `GET https://opencode.ai/console/api/v2/config` |
| No `share` configured | repo `opencode.json`, `~/.config/opencode/opencode.json`, `~/.config/opencode/cli.json`, `~/.config/opencode/opencode.jsonc` |
| No `OPENCODE_*` env exports | `.zshrc`, `.zprofile`, `.bash_profile` scanned → none |
| Provider credentials present (redacted) | `~/.local/share/opencode/auth.json` → `openrouter`, `deepseek`, `my-local-mlx`; `account.json` mirrors `openrouter` + `deepseek`. **All key values redacted.** |
| GitHub MCP auth failing | `tools.github.search_code` → `Authentication Failed: Bad credentials` |
