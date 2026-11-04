// graphify OpenCode plugin
// Injects a knowledge graph reminder before shell tool calls when the graph exists.
//
// V2 module contract: the default export is a plain definition object whose
// `setup(ctx)` registers the hook through the context. V1 exported a named
// factory returning a `{ "tool.execute.before": fn }` hook map, which OpenCode 2
// rejects at load (PluginModule.LoadError).
import { existsSync } from "fs";
import { join } from "path";

// Escaped backticks and quotes keep the reminder literal when the shell parses
// the echo. The wording itself is product copy and must not change.
const REMINDER =
  'echo "[graphify] knowledge graph at graphify-out/. For focused questions, run \\`graphify query \\"<question>\\"\\` (scoped subgraph, usually much smaller than GRAPH_REPORT.md) instead of grepping raw files. Read GRAPH_REPORT.md only for broad architecture context."';

export default {
  id: "graphify",
  async setup(ctx) {
    // Latch scoped to this plugin instance: the reminder is noise on every
    // later call, so it fires at most once per setup.
    let reminded = false;

    await ctx.tool.hook("execute.before", (event) => {
      if (reminded) return;

      // Only the V2 tool name is matched. The V1 name is dead code under
      // OpenCode 2, so a fallback for it would silently never fire (PLUG-005).
      // Check this before the filesystem probe: every non-shell tool call in a
      // project without a graph should not pay a `stat`.
      if (event.tool !== "shell") return;

      // ctx.location.directory is the absolute project root.
      if (!existsSync(join(ctx.location.directory, "graphify-out", "graph.json"))) return;

      // ToolHooks["execute.before"]["input"] is `unknown` at the SDK boundary,
      // so narrow it before use. A malformed payload is a no-op, never a throw.
      const input = event.input;
      if (input === null || typeof input !== "object") return;
      if (typeof input.command !== "string") return;

      // Mutation is the mechanism: the runtime re-reads event.input after the
      // hook, and the return value is ignored.
      input.command = `${REMINDER} && ${input.command}`;
      reminded = true;
    });

    // No cleanup returned: the registration lives for the plugin's lifetime.
  },
};
