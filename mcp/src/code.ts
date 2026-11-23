// The Code tab's plugin sources over the API (`/api/editor/experiences/{id}/plugins`, docs/server.md "Plugin sources"): the
// experience's own TypeScript, kept per plugin id. They are the editor's sandbox – Run shows them on the stage; readers get a
// plugin through the content build only – so this file never runs a source: it reads what a source registers from its text.
// The editor's Library lists the same sources as its scripts (#186): a script file becomes one with upload_plugin.
// A plugin is a folder of files (#352): index.ts and the TypeScript and shader files next to it – get_plugin answers them
// all, put_plugin takes them all (or one `source` as index.ts).
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import { fail, guard, text } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import { PLUGIN_ENTRY, PLUGIN_ID_PATTERN, pluginText, type PluginFile } from "../../shared/types/plugins";
import type { PluginSource, PluginSummary, PluginUsages } from "../../shared/api/editor";
import { ID_PATTERN, pluginTypes } from "../../shared/api/rules";

const EXPERIENCE = z.string().regex(ID_PATTERN).describe("the experience's id (list_experiences)");
const PLUGIN = z.string().regex(PLUGIN_ID_PATTERN, "1–40 lower-case letters, digits or -, starting with a letter").describe("the plugin's id, e.g. tint");

export function registerCodeTools(server: McpServer, api: OsctApi, links: AppLinks): void {
  const path = (experience: string, plugin?: string) => `/editor/experiences/${encodeURIComponent(experience)}/plugins${plugin ? `/${encodeURIComponent(plugin)}` : ""}`;

  server.registerTool(
    "list_plugins",
    { description: "The experience's plugins (the Code tab, the Library's scripts): id, size and fileCount (a plugin is a folder of files), origin (linked: the folder `osct plugin push` sends it from), usages (the draft's rows that use a type it registers), who saved it, when – without the files (get_plugin).", inputSchema: z.object({ experience: EXPERIENCE }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ experience }) => text(await api.call<{ plugins: PluginSummary[] }>("GET", path(experience)))),
  );

  server.registerTool(
    "get_plugin",
    { description: "One plugin with its files ([{ name, text }], index.ts first – TypeScript and shader files) and the component, layer, node and pass types it registers (read from its files).", inputSchema: z.object({ experience: EXPERIENCE, plugin: PLUGIN }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ experience, plugin }) => {
      const { plugin: row } = await api.call<{ plugin: PluginSource }>("GET", path(experience, plugin));
      return text({ plugin: row, registers: pluginTypes(pluginText(row.files)) });
    }),
  );

  server.registerTool(
    "put_plugin",
    {
      description:
        "Saves a plugin (new or changed; a change is recorded). A plugin is a folder of files (#352): `files` = all of them [{ name, text }] – index.ts (it exports register(api)), TypeScript it imports by ./name, shader files (.frag, .vert, .glsl, .wgsl) it imports as strings (import WATER from \"./water.frag\") – a file left out is deleted; or `source` = a plugin of one file (index.ts). At most 256 KB a file, 1 MB together, 32 files. See osct://guides/plugins: api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.registerNodeType(type, spec, build) for a node type of its own, api.three for three.js (never import it), api.loadText(url) for a shader file of the Library several plugins share (upload_asset, kind shader), api.feedback({ width, height, fragment }) for a GPU feedback buffer and api.shadertoy(source) for a Shadertoy pass as its fragment (plugin API 1.6). Nothing runs here: the person presses Run in the Code tab to see it on the stage; readers get the saved files with the person's next Publish in the editor (type-checked and bundled there).",
      inputSchema: z.object({
        experience: EXPERIENCE,
        plugin: PLUGIN,
        files: z.array(z.object({ name: z.string().describe("index.ts, fluid.ts, water.frag – a name, no folder"), text: z.string() })).optional().describe("every file of the plugin; one left out is deleted"),
        source: z.string().optional().describe("a plugin of one file: its index.ts"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, plugin, files: given, source: one }) => {
      if (!given === (one === undefined)) return fail({ error: { code: "mcp", message: "send files (every file of the plugin) or source (a plugin of one file)" } });
      const files: PluginFile[] = given ?? [{ name: PLUGIN_ENTRY, text: one! }];
      const source = files.find(f => f.name === PLUGIN_ENTRY)?.text ?? "";
      const registers = pluginTypes(pluginText(files));
      const warnings: string[] = [];
      if (!/export\s+(const|function|default)\s+register\b|export\s+default\b|export\s*\{[^}]*\bregister\b/.test(source)) warnings.push("the source exports no register(api) – the engine refuses such a module");
      for (const file of files.filter(f => f.name.endsWith(".ts"))) {
        if (/^\s*import\s+(?!type\b)(?:[\w*{}\s,]+\s+from\s+)?["'](?!\.\/)/m.test(file.text)) warnings.push(`${file.name} imports a module – a plugin imports nothing but its own files (./name) and types (three.js is api.three)`);
      }
      if (Object.values(registers).every(types => types.length === 0)) warnings.push("no registerComponent / registerLayer / registerNodeType / registerPass call found");
      const { plugin: row } = await api.call<{ plugin: PluginSource }>("PUT", path(experience, plugin), { files });
      return text({ plugin: { ...row, files: row.files.map(f => f.name) }, registers, ...(warnings.length ? { warnings } : {}), open: editorHref(links, experience), next: "Open a scene in the editor → Code → the plugin → Run shows it on the stage; the next Publish in the editor takes it to readers." });
    }),
  );

  server.registerTool(
    "upload_plugin",
    {
      description:
        "Uploads a script file from this computer (.ts or .js, at most 256 KB, UTF-8 text) as a plugin of one file (its index.ts) – what the editor's Library does with a dropped script; `replace: true` makes it an existing plugin's index.ts (its other files stay). For a plugin of several files: put_plugin with files. The id is `plugin` or the file's name (`Wobble Effect.ts` → wobble-effect); an id that exists is refused (409 plugin-exists) unless `replace: true`, which makes the file that plugin's new source. A change is recorded. Answers the plugin and the types it registers (read from its text).",
      inputSchema: z.object({
        experience: EXPERIENCE,
        file: z.string().describe("a local file path (.ts or .js)"),
        plugin: PLUGIN.optional().describe("the plugin's id (default: from the file's name)"),
        replace: z.boolean().optional().describe("true: the file replaces the source of an existing plugin"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, file, plugin, replace }) => {
      if (replace && !plugin) return fail({ error: { code: "mcp", message: "replace: true goes with the plugin's id" } });
      const bytes = new Uint8Array(await readFile(file));
      const name = basename(file);
      const { plugin: row } = replace
        ? await api.upload<{ plugin: PluginSource }>("PUT", `${path(experience, plugin)}/file`, bytes, name)
        : await api.upload<{ plugin: PluginSource }>("POST", `${path(experience)}${plugin ? `?id=${encodeURIComponent(plugin)}` : ""}`, bytes, name);
      return text({ plugin: { ...row, files: row.files.map(f => f.name) }, registers: pluginTypes(pluginText(row.files)), open: editorHref(links, experience), next: "Open a scene in the editor → Library → code (or Code) → the plugin → Run shows it on the stage." });
    }),
  );

  server.registerTool(
    "plugin_usages",
    { description: "Where the draft uses what a plugin source registers – the experience's passes, scenes, targets, shared entities and entries that name one of its types – and those types.", inputSchema: z.object({ experience: EXPERIENCE, plugin: PLUGIN }), annotations: { readOnlyHint: true, openWorldHint: false } },
    guard(async ({ experience, plugin }) => text(await api.call<PluginUsages>("GET", `${path(experience, plugin)}/usages`))),
  );

  server.registerTool(
    "delete_plugin",
    { description: "Removes a plugin source from the Code tab. Refused while the draft uses a type it registers (409 plugin-in-use with the usages) unless `force`.", inputSchema: z.object({ experience: EXPERIENCE, plugin: PLUGIN, force: z.boolean().optional() }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    guard(async ({ experience, plugin, force }) => {
      await api.call<void>("DELETE", `${path(experience, plugin)}${force ? "?force=1" : ""}`);
      return text({ deleted: plugin });
    }),
  );
}
