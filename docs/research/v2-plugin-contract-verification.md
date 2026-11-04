---
id: "research-v2-plugin-contract-verification"
title: "V2 Plugin Contract Verification (OpenCode 2.2.5)"
updated: "2026-11-04"
tags: [research, opencode, plugin, v2, verification, contract]
doc_type: "research"
---

# V2 Plugin Contract Verification (OpenCode 2.2.5)

**Date:** 2026-11-04
**Runtime under study:** OpenCode 2.2.5
**Status:** ✅ Complete — every fact used by T5 is established from a primary source
**Scope:** Plugin identity, definition type, `ctx.tool.hook("execute.before")`, event shape, the `shell` tool input, cleanup semantics, and setup-failure isolation
**Out of scope:** TUI/GUI/RPC plugin parts, the `effect` variant beyond the type comparison needed for question 2, and runtime behaviour of V1 plugins

---

## 0. Bottom line

| # | Question | Verdict | Answer |
|---|----------|---------|--------|
| 1 | Package identity for the V2 SDK | **VERIFIED** | `@opencode/plugin@2.2.5` exists and is `latest`. `@opencode-ai/plugin` has **no 2.x release** (latest `1.19.5`). This is a rename **and** a major bump, not a rename alone. |
| 2 | `Plugin` definition type | **VERIFIED** | Promise variant: `{ id: string; setup(context) => Promise<Cleanup \| void> \| Cleanup \| void }`. `effect` belongs to the separate `@opencode/plugin/effect` variant; the two are mutually exclusive per variant and the loader accepts either on a default export. |
| 3 | `ctx.tool.hook("execute.before")` | **VERIFIED** | `hook(name, callback) => Promise<Registration>`; callback is `(event) => Promise<void> \| void`; the return value is ignored and the **event is mutated**. The runtime re-reads `event.tool` and `event.input` after the hook runs. |
| 4 | `shell` tool name and input field | **VERIFIED** | The built-in tool's `name` is `"shell"` and its schema is `{ command: string, workdir?: string, timeout?: int, background?: boolean }`. **`event.input.command` is correct — `ASSUMPTION-001` is CONFIRMED.** |
| 5 | Must `setup` return a cleanup function? | **VERIFIED** | No. `setup` **may** return a cleanup; returning nothing is valid (`Cleanup \| void`). **`ASSUMPTION-002` is CONFIRMED**, with a wording correction: registrations live for the *plugin's* lifetime, not the process's. |
| 6 | Does a `setup` throw crash the host? | **VERIFIED for setup** | Failure is recorded per plugin as `state.status: "failed"` with an `error` string; the host continues and lists the plugin as failed. |

**Two assumptions resolved:** `ASSUMPTION-001` → **CONFIRMED**; `ASSUMPTION-002` → **CONFIRMED** (with the lifetime nuance above).

---

## 1. Method and source policy

Primary sources only, all pinned to **2.2.5**. No blog posts, no memory, no inference from the V1 API.

- **npm registry metadata** — `https://registry.npmjs.org/@opencode/plugin/2.2.5` and the full packument at `https://registry.npmjs.org/@opencode/plugin`; same for `https://registry.npmjs.org/@opencode-ai/plugin`.
- **Published package contents** — the files inside the published tarball, served by jsDelivr at `https://cdn.jsdelivr.net/npm/<pkg>@2.2.5/<path>`. The `plugin.d.ts` file was cross-checked against unpkg (`https://unpkg.com/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts`) and the two responses were identical.
- **Official V2 documentation** — `https://opencode.ai/v2/docs/build/plugins`, its `/server`, `/migrate-v1`, and `/effect` sub-pages, plus `https://opencode.ai/v2/docs/tools`.

**Runtime probe not performed.** T1 offered an optional probe (a temporary `.opencode/plugins/zz-contract-probe.js` plus an OpenCode restart) for the case where the payload field could not be proven statically. It was unnecessary: `@opencode/core@2.2.5` publishes the built-in shell tool's decoded input schema as a `.d.ts` file, and the runtime chunk that invokes `execute.before` is readable in the same published tarball. Static evidence is stronger than a probe here because it names the field **and** shows the runtime consuming the mutated event. No probe file was created, so `.opencode/plugins/` still contains only `graphify.js`.

---

## 2. Question 1 — Package identity

**Verdict: VERIFIED.** The V2 SDK is a different package name **and** a new major line.

Registry evidence (`https://registry.npmjs.org/@opencode/plugin`, fetched 2026-11-04):

```json
{
  "name": "@opencode/plugin",
  "dist-tags": { "latest": "2.2.5", "beta": "0.0.0-beta-19507", "dev": "0.0.0-dev-562" }
}
```

The version list for `@opencode/plugin` contains `2.0.0`, `2.0.1` … through `2.2.5` (1,462 total versions, most of them `0.0.0-dev-*` snapshots). The version document at `https://registry.npmjs.org/@opencode/plugin/2.2.5` reports:

```json
{
  "version": "2.2.5",
  "description": "Authoring interfaces and runtime loader support for OpenCode V2 plugins:",
  "type": "module",
  "dependencies": { "effect": "4.0.6", "@opencode/ai": "2.2.5", "@opencode/schema": "2.2.5", "...": "..." }
}
```

Registry evidence for the V1 package (`https://registry.npmjs.org/@opencode-ai/plugin`, fetched 2026-11-04):

```json
{
  "name": "@opencode-ai/plugin",
  "dist-tags": { "latest": "1.19.5", "v1": "0.0.0-v1-202510310553", "...": "..." }
}
```

Its version list has **zero 2.x entries**; the newest releases are `1.19.4` and `1.19.5`. So `@opencode-ai/plugin` is still maintained on the 1.x line, while the V2 plugin API started fresh at `@opencode/plugin@2.0.0`.

**Consequence for the plan:** REQ-004 is correctly stated — depend on `@opencode/plugin@2.2.5` and remove `@opencode-ai/plugin`. A semver bump of the old package cannot reach the V2 API.

---

## 3. Question 2 — The `Plugin` definition type

**Verdict: VERIFIED.**

Source: `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts` (identical at `https://unpkg.com/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts`).

```ts
export type Cleanup = () => Promise<void> | void;

export interface Plugin {
    readonly id: string;
    readonly setup: (context: Context) => Promise<Cleanup | void> | Cleanup | void;
}

export declare function define(plugin: Plugin): Plugin;
```

`define` is an identity function, confirmed in the shipped JavaScript (`https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/plugin.js`):

```js
export function define(plugin) {
    return plugin;
}
```

**Required keys:** `id` (a `string`) and `setup` — for the promise variant. `setup` is required by the interface, but a plugin may instead define an `effect` if it targets the Effect variant.

**`setup` vs `effect` are mutually exclusive per variant, and both are accepted by the loader.** The Effect variant has its own `Plugin` interface (`https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/effect/plugin.d.ts`):

```ts
export interface Plugin<R = Scope.Scope> {
    readonly id: string;
    readonly effect: (context: Context) => Effect.Effect<void, never, R>;
}
```

The two shapes live in two different entry points (`@opencode/plugin` → `dist/promise/*`, `@opencode/plugin/effect` → `dist/effect/*`; see `exports` in `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/package.json`). One default export carries one or the other. The V2 migration guide states the loader-facing rule directly: *"A V2 plugin default-exports a definition with an `id` and `setup(ctx)`"* (`https://opencode.ai/v2/docs/build/plugins/migrate-v1`), and the runtime loader's own error text quoted in the diagnosis names *"an id and an effect or setup function"*.

**`setup(ctx)` signature:** `(context: Context) => Promise<Cleanup | void> | Cleanup | void`. `Context` is a large server-client surface (`https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts`):

```ts
export interface Context {
    readonly app: App;
    readonly location: Location.Info;
    readonly options: PluginOptions;
    readonly agent: AgentDomain;
    // ... event, integration, mcp, model, permission, plugin, provider,
    //     reference, rpc, session, shell, skill, storage, tool, vcs,
    //     websearch, worktree
    readonly shell: ShellDomain;
    readonly tool: ToolDomain;
}
```

`ctx.location.directory` is verified: `Location.Info` is a schema class whose struct includes `directory: Schema.brand<Schema.String, "AbsolutePath">` plus optional `workspaceID` and a `project` object (`https://cdn.jsdelivr.net/npm/@opencode/schema@2.2.5/dist/location.d.ts`).

---

## 4. Question 3 — `ctx.tool.hook("execute.before")`

**Verdict: VERIFIED.** Hook name, callback signature, mutation semantics, and return-value handling are all established.

### 4.1 Registration and callback signature

Source: `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/tool.d.ts`

```ts
interface ToolHooks {
    readonly "execute.before": {
        tool: string;
        readonly sessionID: Session.ID;
        readonly agent: Agent.ID;
        readonly messageID: SessionMessage.ID;
        readonly id: Tool.CallID;
        input: unknown;
    };
    readonly "execute.after": {
        readonly tool: string;
        readonly sessionID: Session.ID;
        readonly agent: Agent.ID;
        readonly messageID: SessionMessage.ID;
        readonly id: Tool.CallID;
        readonly input: unknown;
    } & ({ readonly status: "completed"; result: Tool.Result }
       | { readonly status: "error"; error: Tool.Error });
}

export interface ToolDomain {
    readonly transform: Transform<ToolEditor>;
    readonly reload: () => Promise<void>;
    readonly list: () => Promise<readonly (Info & { readonly id: string })[]>;
    readonly hook: Hooks<ToolHooks>;
}
```

`Hooks` is defined in `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/registration.d.ts`:

```ts
export interface Registration {
    readonly dispose: () => Promise<void>;
}

export type Hooks<Spec> = <Name extends keyof Spec>(
    name: Name,
    callback: (input: Spec[Name]) => Promise<void> | void
) => Promise<Registration>;
```

So the exact registration is:

```js
await ctx.tool.hook("execute.before", (event) => { /* mutate or inspect event */ });
```

- **Hook name:** `"execute.before"` (the only pre-execution tool hook; `"execute.after"` is the post-execution one).
- **Callback parameter:** one event object, not the V1 `(input, output)` pair.
- **Return type:** `Promise<void> | void`. A return value is **ignored**; there is no "return the new input" contract. Mutation is the mechanism.

### 4.2 Mutation is honoured by the runtime

Source: the published runtime chunk, `https://cdn.jsdelivr.net/npm/@opencode/core@2.2.5/dist/chunks/location-fc5n2123.js`.

The hook trigger constructs one event object around the original `input`:

```js
const beforeExecute = (name, input, context) => hooks.trigger("tool", "execute.before", {
    tool: name,
    sessionID: context.sessionID,
    agent: context.agent,
    messageID: context.messageID,
    id: context.id,
    input
});
```

The caller then **reads the event back** and feeds the event's fields into execution:

```js
const event = yield* beforeExecute(input.call.name, input.call.input, context);
// ...
const name = requested?.name ?? event.tool;
// ...
const tool = direct.get(name);
if (tool)
    return yield* executeTool(tool, name, event.input, context);
```

That proves three things the port depends on:

1. `event.input` is the object the tool will execute with — mutating `event.input.command` changes the executed command.
2. Replacing the whole object (`event.input = { command: … }`) also works, because the runtime re-reads `event.input` rather than closing over the original variable.
3. `event.tool` is likewise re-read, which is why the hook can switch on it, and why the field is non-`readonly` in the type.

Documentation agrees: *"The callback receives one mutable event instead of separate input and output objects"* (`https://opencode.ai/v2/docs/build/plugins/migrate-v1`), and the Tools section is headed *"Inspect or replace tool input before execution"* (`https://opencode.ai/v2/docs/build/plugins/server`).

**Note on typing:** `input` is declared `unknown`, so a TypeScript author must narrow or cast it. The plain-JavaScript port does not need a cast, but it still needs a runtime guard (see §8).

---

## 5. Question 4 — The `shell` tool name and payload (settles `ASSUMPTION-001`)

**Verdict: VERIFIED. `ASSUMPTION-001` is CONFIRMED: the field is `event.input.command`.**

### 5.1 Tool name

Source: `https://cdn.jsdelivr.net/npm/@opencode/core@2.2.5/dist/types/tool/plugin/shell.d.ts` — the built-in shell tool's own module:

```ts
export * as ShellTool from "./shell.js";

export declare const name = "shell";
export declare const DEFAULT_TIMEOUT_MS: number;

export declare const Input: Schema.Struct<{
    readonly command: Schema.String;
    readonly workdir: Schema.optionalKey<Schema.String>;
    readonly timeout: Schema.optionalKey<Schema.Int>;
    readonly background: Schema.optionalKey<Schema.Boolean>;
}>;
```

The V2 tools documentation lists the tool as **`shell`** and describes the same arguments: *"shell executes a command in the host user's shell. Set `workdir` instead of putting `cd` in the command, and set `timeout` in milliseconds … Set `background` to true …"* (`https://opencode.ai/v2/docs/tools`). The V1 name `bash` does not appear in the built-in tool inventory; there is no `bash` module beside `shell` in `@opencode/core@2.2.5/dist/tool/plugin/`.

### 5.2 Payload field

The schema above is the decoded input object. The `execute.before` event embeds exactly that object as `input`, so:

```js
event.input.command // string — the command the shell tool will run
```

This is the direct, primary-source answer to `ASSUMPTION-001`. It is not inferred from prose and not inferred from the reference port.

**Do not confuse this with `ctx.shell.hook("create.before", …)`.** That is a different hook on a different domain, with a different event (`https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/shell.d.ts`):

```ts
export interface ShellCreateBefore {
    command: string;
    cwd: string;
    timeout: number;
    shell: string;
    env: Record<string, string | undefined>;
}
export interface ShellHooks {
    readonly "create.before": ShellCreateBefore;
}
export interface ShellDomain {
    readonly hook: Hooks<ShellHooks>;
}
```

That hook fires when a shell *session* is created through the plugin API, not when the model calls the `shell` tool. The graphify reminder belongs on `ctx.tool.hook("execute.before")`, because it must intercept the model's tool call.

### 5.3 The `unknown` problem and the defensible guard

`ToolHooks["execute.before"]["input"]` is `unknown` at the SDK boundary, even though the concrete tool's schema is known. The published types therefore **do not** let a TypeScript author write `event.input.command` without narrowing. For the plain-JavaScript port, the correct runtime guard is:

```js
const input = event.input;
if (input === null || typeof input !== "object") return;
if (typeof input.command !== "string") return;
```

This is defensible for three reasons: it is exactly the shape the shell tool's schema declares; it turns any future shape change into a no-op rather than a crash; and it satisfies the T4 test case for a missing or non-string `command`.

---

## 6. Question 5 — Cleanup semantics (settles `ASSUMPTION-002`)

**Verdict: VERIFIED. `ASSUMPTION-002` is CONFIRMED, with one wording correction.**

The type permits `void` (`https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts`):

```ts
export type Cleanup = () => Promise<void> | void;
export interface Plugin {
    readonly id: string;
    readonly setup: (context: Context) => Promise<Cleanup | void> | Cleanup | void;
}
```

The lifecycle documentation states it plainly (`https://opencode.ai/v2/docs/build/plugins/server`):

> *"setup runs when the plugin loads. It may return a cleanup function that runs when the plugin unloads."*

And for registrations specifically (`https://opencode.ai/v2/docs/build/plugins/migrate-v1`):

> *"Registrations stay active for the plugin's lifetime and are disposed when it unloads."*

**Resolution:** returning nothing from `setup` is valid, and no cleanup is required for a hook that should live as long as the plugin. The plan's phrase "process lifetime" should be understood as **plugin lifetime**: registrations are disposed on plugin unload or reload, which is the same observable behaviour for the graphify use case but is the more accurate contract. `Registration.dispose()` exists (`registration.d.ts`) and is idempotent according to the docs, but the port does not need to call it.

---

## 7. Question 6 — Failure isolation

**Verdict: VERIFIED for a `setup` throw.**

The plugin registry models failure as a **per-plugin state**, not a fatal host condition. Source: `https://cdn.jsdelivr.net/npm/@opencode/schema@2.2.5/dist/plugin.d.ts`:

```ts
export declare const State: Schema.Union<readonly [
    Schema.Struct<{ readonly status: Schema.Literal<"active"> }>,
    Schema.Struct<{
        readonly status: Schema.Literal<"failed">;
        readonly error: Schema.String;
        readonly ref: Schema.decodeTo<Schema.optional<Schema.toType<Schema.String>>, ...>;
    }>
]>;
```

`Plugin.Info` embeds that `state`, and the docs describe the list as *"active, failed, and resolved plugins at the current location"* (`https://opencode.ai/v2/docs/build/plugins/effect`). A plugin that throws during `setup` is therefore recorded as `status: "failed"` with an error string; the host keeps running and the other plugins remain listed. This matches the observed symptom that the current V1 module produces a WARN, not a crash.

**Limit of this finding:** the schema proves failure is *captured*, not that every failure mode is swallowed. A throw **inside a registered hook** is a separate question. The migration guide's own example throws from `execute.before` to block a tool call (`https://opencode.ai/v2/docs/build/plugins/migrate-v1`), which shows the intended containment is "fail that tool call", but no primary source states a host-level guarantee for hook throws. Treat that as **UNVERIFIED** and do not design around it; the port should avoid throwing in the hook anyway (its guards return early).

---

## 8. Coding guidance for T5

The port must use exactly these names and this control flow.

**Module shape** — a plain default object, not a named export, not a call to `Plugin.define` (the call is optional and would add no value; an import of `@opencode/plugin` would be a runtime dependency the distributed file cannot rely on):

```js
import { existsSync } from "node:fs";
import { join } from "node:path";

const REMINDER = 'echo "[graphify] …"';

let reminded = false;

export default {
  id: "graphify",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", (event) => {
      if (reminded) return;

      // ctx.location.directory is an absolute path (Location.Info)
      if (!existsSync(join(ctx.location.directory, "graphify-out", "graph.json"))) return;

      // V2 built-in tool name is "shell" (V1 called it "bash")
      if (event.tool !== "shell") return;

      // ToolHooks["execute.before"]["input"] is `unknown`; narrow before use
      const input = event.input;
      if (input === null || typeof input !== "object") return;
      if (typeof input.command !== "string") return;

      input.command = `${REMINDER} && ${input.command}`;
      reminded = true;
    });
    // no cleanup returned: registrations are disposed when the plugin unloads
  },
};
```

| Requirement | Exact form |
|---|---|
| Default export | `export default { id: "graphify", async setup(ctx) { … } }` |
| Hook registration | `await ctx.tool.hook("execute.before", (event) => { … })` |
| Hook name | `"execute.before"` |
| Tool match | `event.tool === "shell"` |
| Payload | `event.input` |
| Command field | `event.input.command` (string) |
| Mutation | Build `` `${REMINDER} && ${input.command}` `` and assign it to `input.command` — assignment, not a return |
| Graph path | `join(ctx.location.directory, "graphify-out", "graph.json")` |
| Return value from callback | none; it is ignored |
| Return value from `setup` | none required |
| Needs `ctx.location.directory`? | Yes — it is the absolute load location |

**On accepting `"bash"` as well:** the plan's T5 text allows matching either `"shell"` or `"bash"`. Under OpenCode 2.2.5 only `"shell"` exists, so a `"bash"` branch is dead code. Keeping it is harmless and documents the rename; matching only `"shell"` is the tighter choice. Either passes T4, which sends `tool: "shell"`. Do not let the `"bash"` branch carry any logic the `"shell"` branch lacks.

**On the reminder text:** the exact user-facing copy is preserved byte-for-byte from the current file; only the JS/shell escaping wrapper may change (CON-008 in the plan).

---

## 9. Facts not established

| Item | Status | What would establish it | Safest choice for the port |
|---|---|---|---|
| Host-level guarantee for a throw **inside** `execute.before` | **UNVERIFIED** | Runtime source showing the hook trigger's error channel, or a documented statement | Never throw from the hook; all guards return early. Do not rely on a throw being contained. |
| Whether the decoded `input` object is ever frozen | **UNVERIFIED** | Runtime source for the schema decode/`freeze` step | Assign normally. ESM strict mode would throw on a frozen object, but the runtime builds the event from a mutable decoded object and the docs describe the event as mutable. |
| `@opencode/plugin` 2.2.5's behaviour on a plugin that exports `both` `setup` and `effect` | **UNVERIFIED** | A loader source read or a probe | Do not export both. The promise-variant port exports `setup` only. |

No fact used by T5 is in this table.

---

## 10. Sources

| # | Source | Version | Used for |
|---|--------|---------|----------|
| S1 | `https://registry.npmjs.org/@opencode/plugin` | 2.2.5 (`latest`) | Package exists; 2.x version list; dist-tags |
| S2 | `https://registry.npmjs.org/@opencode/plugin/2.2.5` | 2.2.5 | Version metadata, dependencies, `type: module` |
| S3 | `https://registry.npmjs.org/@opencode-ai/plugin` | 1.19.5 (`latest`) | Confirms no 2.x line on the V1 package |
| S4 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts` (identical at `https://unpkg.com/@opencode/plugin@2.2.5/dist/promise/plugin.d.ts`) | 2.2.5 | `Plugin`, `Context`, `Cleanup`, `define` |
| S5 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/tool.d.ts` | 2.2.5 | `ToolHooks`, `execute.before` event, `ToolDomain.hook` |
| S6 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/registration.d.ts` | 2.2.5 | `Hooks` callback signature, `Registration` |
| S7 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/shell.d.ts` | 2.2.5 | `ShellDomain` / `create.before` (the distinct shell-session hook) |
| S8 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/effect/plugin.d.ts` | 2.2.5 | `effect` variant of `Plugin` |
| S9 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/dist/promise/plugin.js` | 2.2.5 | `define` is identity |
| S10 | `https://cdn.jsdelivr.net/npm/@opencode/plugin@2.2.5/package.json` | 2.2.5 | `exports` map, `type: module`, dependencies |
| S11 | `https://cdn.jsdelivr.net/npm/@opencode/core@2.2.5/dist/types/tool/plugin/shell.d.ts` | 2.2.5 | Built-in `shell` tool: `name` and `Input` schema |
| S12 | `https://cdn.jsdelivr.net/npm/@opencode/core@2.2.5/dist/chunks/location-fc5n2123.js` | 2.2.5 | Runtime proof that `event.tool` / `event.input` are re-read after the hook |
| S13 | `https://cdn.jsdelivr.net/npm/@opencode/schema@2.2.5/dist/plugin.d.ts` | 2.2.5 | `Plugin.State` = `active` \| `failed` (failure isolation) |
| S14 | `https://cdn.jsdelivr.net/npm/@opencode/schema@2.2.5/dist/location.d.ts` | 2.2.5 | `Location.Info.directory` is an absolute path |
| S15 | `https://opencode.ai/v2/docs/build/plugins` | V2 docs (2026-11-04) | Default export shape, auto-discovery under `.opencode/plugins/` |
| S16 | `https://opencode.ai/v2/docs/build/plugins/server` | V2 docs (2026-11-04) | Lifecycle, `ctx.location`, tool hook example, `Registration` |
| S17 | `https://opencode.ai/v2/docs/build/plugins/migrate-v1` | V2 docs (2026-11-04) | "one mutable event"; registration lifetime; V1→V2 hook map |
| S18 | `https://opencode.ai/v2/docs/build/plugins/effect` | V2 docs (2026-11-04) | `effect` variant; `plugin.list()` reports active/failed |
| S19 | `https://opencode.ai/v2/docs/tools` | V2 docs (2026-11-04) | Tool name `shell`; `command`/`workdir`/`timeout`/`background` |
