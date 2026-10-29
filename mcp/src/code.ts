// The Code tab's plugin sources over the API (`/api/editor/books/{id}/plugins`, docs/server.md "Plugin sources"): the
// book's own TypeScript, kept per plugin id. They are the editor's sandbox – Run shows them on the stage; readers get a
// plugin through the content build only – so this file never runs a source: it reads what a source registers from its text.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import { pluginTypes } from "./model.ts";
import { guard, text } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import { PLUGIN_ID_PATTERN } from "../../shared/types/plugins";

const BOOK = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).describe("the book's id (list_books)");
const PLUGIN = z.string().regex(PLUGIN_ID_PATTERN, "1–40 lower-case letters, digits or -, starting with a letter").describe("the plugin's id, e.g. tint");

interface PluginRow {
  id: string;
  source?: string;
  size: number;
  updatedAt: string;
  updatedBy: string | null;
}

export function registerCodeTools(server: McpServer, api: OsctApi, links: AppLinks): void {
  const path = (book: string, plugin?: string) => `/editor/books/${encodeURIComponent(book)}/plugins${plugin ? `/${encodeURIComponent(plugin)}` : ""}`;

  server.registerTool(
    "list_plugins",
    { description: "The book's plugin sources (the Code tab): id, size, who saved it, when – without the source (get_plugin).", inputSchema: z.object({ book: BOOK }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ book }) => text(await api.call<{ plugins: PluginRow[] }>("GET", path(book)))),
  );

  server.registerTool(
    "get_plugin",
    { description: "One plugin source with the component and layer types it registers (read from the text).", inputSchema: z.object({ book: BOOK, plugin: PLUGIN }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ book, plugin }) => {
      const { plugin: row } = await api.call<{ plugin: PluginRow & { source: string } }>("GET", path(book, plugin));
      return text({ plugin: row, registers: pluginTypes(row.source) });
    }),
  );

  server.registerTool(
    "put_plugin",
    {
      description:
        "Saves a plugin source (new or changed; at most 256 KB; a change is recorded). TypeScript that exports register(api) – see osct://guides/plugins: api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.three for three.js (never import it). Nothing runs here: the person presses Run in the Code tab to see it on the stage; readers get it through the content build.",
      inputSchema: z.object({ book: BOOK, plugin: PLUGIN, source: z.string().describe("the TypeScript source") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ book, plugin, source }) => {
      const registers = pluginTypes(source);
      const warnings: string[] = [];
      if (!/export\s+(const|function|default)\s+register\b|export\s+default\b|export\s*\{[^}]*\bregister\b/.test(source)) warnings.push("the source exports no register(api) – the engine refuses such a module");
      if (/^\s*import\s+(?!type\b)/m.test(source)) warnings.push("the source imports a module – plugins import nothing but types (three.js is api.three)");
      if (registers.components.length + registers.layers.length === 0) warnings.push("no registerComponent / registerLayer call found");
      const { plugin: row } = await api.call<{ plugin: PluginRow }>("PUT", path(book, plugin), { source });
      return text({ plugin: { ...row, source: undefined }, registers, ...(warnings.length ? { warnings } : {}), open: editorHref(links, book), next: "Open a spread in the editor → Code → the plugin → Run shows it on the stage; the content build ships it to readers." });
    }),
  );

  server.registerTool(
    "delete_plugin",
    { description: "Removes a plugin source from the Code tab.", inputSchema: z.object({ book: BOOK, plugin: PLUGIN }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    guard(async ({ book, plugin }) => {
      await api.call<void>("DELETE", path(book, plugin));
      return text({ deleted: plugin });
    }),
  );
}
