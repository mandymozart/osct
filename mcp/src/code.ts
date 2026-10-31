// The Code tab's plugin sources over the API (`/api/editor/books/{id}/plugins`, docs/server.md "Plugin sources"): the
// book's own TypeScript, kept per plugin id. They are the editor's sandbox – Run shows them on the stage; readers get a
// plugin through the content build only – so this file never runs a source: it reads what a source registers from its text.
// The editor's Library lists the same sources as its scripts (#186): a script file becomes one with upload_plugin.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import { fail, guard, text } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import { PLUGIN_ID_PATTERN } from "../../shared/types/plugins";
import type { PluginSource, PluginSummary, PluginUsages } from "../../shared/api/editor";
import { ID_PATTERN, pluginTypes } from "../../shared/api/rules";

const BOOK = z.string().regex(ID_PATTERN).describe("the book's id (list_books)");
const PLUGIN = z.string().regex(PLUGIN_ID_PATTERN, "1–40 lower-case letters, digits or -, starting with a letter").describe("the plugin's id, e.g. tint");

export function registerCodeTools(server: McpServer, api: OsctApi, links: AppLinks): void {
  const path = (book: string, plugin?: string) => `/editor/books/${encodeURIComponent(book)}/plugins${plugin ? `/${encodeURIComponent(plugin)}` : ""}`;

  server.registerTool(
    "list_plugins",
    { description: "The book's plugin sources (the Code tab, the Library's scripts): id, size, usages (the draft's rows that use a type it registers), who saved it, when – without the source (get_plugin).", inputSchema: z.object({ book: BOOK }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ book }) => text(await api.call<{ plugins: PluginSummary[] }>("GET", path(book)))),
  );

  server.registerTool(
    "get_plugin",
    { description: "One plugin source with the component, layer, node and pass types it registers (read from the text).", inputSchema: z.object({ book: BOOK, plugin: PLUGIN }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ book, plugin }) => {
      const { plugin: row } = await api.call<{ plugin: PluginSource }>("GET", path(book, plugin));
      return text({ plugin: row, registers: pluginTypes(row.source) });
    }),
  );

  server.registerTool(
    "put_plugin",
    {
      description:
        "Saves a plugin source (new or changed; at most 256 KB; a change is recorded). TypeScript that exports register(api) – see osct://guides/plugins: api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.registerNodeType(type, spec, build) for a node type of its own, api.three for three.js (never import it), api.loadText(url) for a shader file of the Library (upload_asset, kind shader – in a material's or pass's build, never a layer's glsl), api.feedback({ width, height, fragment }) for a GPU feedback buffer and api.shadertoy(source) for a Shadertoy pass as its fragment (plugin API 1.6). Nothing runs here: the person presses Run in the Code tab to see it on the stage; readers get it through the content build.",
      inputSchema: z.object({ book: BOOK, plugin: PLUGIN, source: z.string().describe("the TypeScript source") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ book, plugin, source }) => {
      const registers = pluginTypes(source);
      const warnings: string[] = [];
      if (!/export\s+(const|function|default)\s+register\b|export\s+default\b|export\s*\{[^}]*\bregister\b/.test(source)) warnings.push("the source exports no register(api) – the engine refuses such a module");
      if (/^\s*import\s+(?!type\b)/m.test(source)) warnings.push("the source imports a module – plugins import nothing but types (three.js is api.three)");
      if (Object.values(registers).every(types => types.length === 0)) warnings.push("no registerComponent / registerLayer / registerNodeType / registerPass call found");
      const { plugin: row } = await api.call<{ plugin: PluginSource }>("PUT", path(book, plugin), { source });
      return text({ plugin: { ...row, source: undefined }, registers, ...(warnings.length ? { warnings } : {}), open: editorHref(links, book), next: "Open a spread in the editor → Code → the plugin → Run shows it on the stage; the content build ships it to readers." });
    }),
  );

  server.registerTool(
    "upload_plugin",
    {
      description:
        "Uploads a script file from this computer (.ts or .js, at most 256 KB, UTF-8 text) as a plugin source – what the editor's Library does with a dropped script. The id is `plugin` or the file's name (`Wobble Effect.ts` → wobble-effect); an id that exists is refused (409 plugin-exists) unless `replace: true`, which makes the file that plugin's new source. A change is recorded. Answers the plugin and the types it registers (read from its text).",
      inputSchema: z.object({
        book: BOOK,
        file: z.string().describe("a local file path (.ts or .js)"),
        plugin: PLUGIN.optional().describe("the plugin's id (default: from the file's name)"),
        replace: z.boolean().optional().describe("true: the file replaces the source of an existing plugin"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ book, file, plugin, replace }) => {
      if (replace && !plugin) return fail({ error: { code: "mcp", message: "replace: true goes with the plugin's id" } });
      const bytes = new Uint8Array(await readFile(file));
      const name = basename(file);
      const { plugin: row } = replace
        ? await api.upload<{ plugin: PluginSource }>("PUT", `${path(book, plugin)}/file`, bytes, name)
        : await api.upload<{ plugin: PluginSource }>("POST", `${path(book)}${plugin ? `?id=${encodeURIComponent(plugin)}` : ""}`, bytes, name);
      return text({ plugin: { ...row, source: undefined }, registers: pluginTypes(row.source), open: editorHref(links, book), next: "Open a spread in the editor → Library → code (or Code) → the plugin → Run shows it on the stage." });
    }),
  );

  server.registerTool(
    "plugin_usages",
    { description: "Where the draft uses what a plugin source registers – the book's passes, spreads, targets, shared entities and entries that name one of its types – and those types.", inputSchema: z.object({ book: BOOK, plugin: PLUGIN }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ book, plugin }) => text(await api.call<PluginUsages>("GET", `${path(book, plugin)}/usages`))),
  );

  server.registerTool(
    "delete_plugin",
    { description: "Removes a plugin source from the Code tab. Refused while the draft uses a type it registers (409 plugin-in-use with the usages) unless `force`.", inputSchema: z.object({ book: BOOK, plugin: PLUGIN, force: z.boolean().optional() }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    guard(async ({ book, plugin, force }) => {
      await api.call<void>("DELETE", `${path(book, plugin)}${force ? "?force=1" : ""}`);
      return text({ deleted: plugin });
    }),
  );
}
