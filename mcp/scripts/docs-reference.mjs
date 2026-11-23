#!/usr/bin/env node
// The MCP tools reference of the documentation site (/docs/api/mcp/reference/, docs/docs-site.md): every tool of the
// server with its parameters, read from the tools' own definitions. The server's register functions run against a
// recorder instead of an MCP server – nothing is started, no API is asked – and each tool's zod schema becomes the
// parameter table.
//
// It also writes the content model reference (/docs/api/content/, docs-model.mjs) from the same read.
//
//   node scripts/docs-reference.mjs            writes client/public/docs/api/mcp/reference/index.html and api/content/index.html
//   node scripts/docs-reference.mjs --check    fails when a committed page differs (the Checks workflow runs it)
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { esc, inline, page, write } from "../../editor/tools/docs-reference/page.mjs";
import { MODEL_OUTPUT, generateModel } from "./docs-model.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT = "api/mcp/reference/index.html";

/** The tools grouped as the guide page groups them; a tool no group names lands in "Other" (and the test says so) */
export const GROUPS = [
  ["start", "Start", "Who the agent is, the server's own update, and the sign-in for people without a token.", ["whoami", "update_server", "sign_in_request", "sign_in_verify", "describe_content_model"]],
  ["reading", "Reading", "Nothing here changes anything.", ["list_experiences", "get_experience", "list_scenes", "get_scene", "get_entries", "get_entity", "get_draft"]],
  ["scenes", "Scenes, surfaces and groups", "", ["add_scene", "put_scene", "put_surface", "set_surface_reference", "move_scenes", "delete_scene", "group_scenes", "rename_group", "ungroup"]],
  ["content", "Targets and AR content", "", ["add_entry", "put_target", "put_entity"]],
  ["texts", "Texts", "", ["update_entry", "delete_entry", "update_experience"]],
  ["look", "Look", "", ["put_experience_passes", "put_experience_appearance", "put_environment"]],
  ["landing", "The landing page", "", ["put_experience_landing", "put_experience_landing_texts"]],
  ["files", "Files", "", ["list_assets", "upload_asset", "rename_asset", "delete_asset", "set_asset_credits", "plan_asset_names", "apply_asset_names"]],
  ["plugins", "Plugins", "", ["list_plugins", "get_plugin", "put_plugin", "upload_plugin", "plugin_usages", "delete_plugin"]],
  ["import", "New experiences, import and deliveries", "", ["create_experience", "preview_import", "import_experience", "preview_delivery", "import_delivery", "list_deliveries"]],
  ["history", "History", "", ["list_changes", "list_versions", "revert_change", "revert_to"]],
  ["seeing", "Seeing and publishing", "", ["render_scene", "publish", "publish_status", "activate_version"]],
];

/** The entry esbuild bundles: the register functions against a recorder, the tools as JSON on the module's default export */
const ENTRY = `
import { z } from "zod";
import { registerContentTools } from "./src/content.ts";
import { registerCodeTools } from "./src/code.ts";
import { registerDeliveryTools } from "./src/deliveries.ts";
import { registerRenderTool } from "./src/render-tool.ts";
import { createUserServer } from "./src/user.ts";

const tools = [];
const record = (name, config) => {
  const schema = config.inputSchema ?? z.object({});
  tools.push({ name, description: config.description ?? "", annotations: config.annotations ?? {}, input: z.toJSONSchema(schema instanceof z.ZodType ? schema : z.object(schema), { unrepresentable: "any" }) });
};
const server = { registerTool: record, registerPrompt() {}, registerResource() {}, sendToolListChanged() {}, sendPromptListChanged() {}, sendResourceListChanged() {} };
const links = { editor: "", experience: () => "", scene: () => "" };
const api = { hasToken: false, call: async () => ({}) };
const config = { api: "", editor: "", local: false, token: "", tokenSource: null };
registerContentTools(server, api, links);
registerCodeTools(server, api, links);
registerDeliveryTools(server, api, links);
registerRenderTool(server, api, config, links);
// whoami and the sign-in pair are the user server's own: read them off a server made for nobody
const own = createUserServer(config, api, null);
for (const [name, tool] of Object.entries(own._registeredTools ?? {})) {
  if (!tools.some(t => t.name === name)) record(name, { description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations });
}
import { describeContentModel } from "./src/model.ts";
export default { tools, model: describeContentModel() };
`;

/** The server's tools (name, description, annotations, the input's JSON schema) and its content model */
export const readServer = async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "osct-mcp-docs-"));
  const outfile = resolve(dir, "tools.mjs");
  try {
    await build({
      stdin: { contents: ENTRY, resolveDir: PKG, loader: "ts" },
      outfile, bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning",
      banner: { js: `import { createRequire as __osctRequire } from "node:module"; const require = __osctRequire(import.meta.url);` },
      define: { OSCT_BUNDLED_DOCS: JSON.stringify({ "docs/plugins.md": "" }) },
    });
    return (await import(pathToFileURL(outfile).href)).default;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** A schema's type in a few words */
const typeOf = schema => {
  if (!schema || typeof schema !== "object") return "any";
  if (schema.enum) return schema.enum.map(value => JSON.stringify(value)).join(" | ");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.anyOf ?? schema.oneOf) return [...new Set((schema.anyOf ?? schema.oneOf).map(typeOf))].join(" | ");
  if (schema.type === "array") return `${typeOf(schema.items)}[]`;
  if (schema.type === "object") return schema.properties ? `{ ${Object.keys(schema.properties).join(", ")} }` : "object";
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return schema.type ?? "any";
};

/** A description's first sentence: what the tool is, before its details */
const firstSentence = text => {
  const clean = String(text).replace(/\s+/g, " ").trim();
  const end = clean.search(/[.:](\s|$)/);
  return end < 0 || end > 240 ? clean.slice(0, 240) : clean.slice(0, end + 1).replace(/:$/, ".");
};

const kindOf = annotations => (annotations.readOnlyHint ? "reads" : annotations.destructiveHint ? "replaces or removes" : "writes");

const toolBlock = tool => {
  const properties = tool.input.properties ?? {};
  const required = new Set(tool.input.required ?? []);
  const names = Object.keys(properties);
  const call = `${tool.name} { ${names.map(name => (required.has(name) ? name : `${name}?`)).join(", ")} }`.replace("{  }", "{}");
  const rest = String(tool.description).replace(/\s+/g, " ").trim().slice(firstSentence(tool.description).length).trim();
  const lines = [
    `  <h3 id="${esc(tool.name)}"><code>${esc(tool.name)}</code> <span class="who">${esc(kindOf(tool.annotations))}</span></h3>`,
    `  <p>${inline(firstSentence(tool.description))}</p>`,
    `  <pre><code>${esc(call)}</code></pre>`,
  ];
  if (names.length) {
    lines.push(`  <div class="table"><table>`, `    <tr><th>Parameter</th><th>Type</th><th>What</th></tr>`);
    for (const name of names) {
      const schema = properties[name];
      lines.push(`    <tr id="${esc(tool.name)}-${esc(name)}"><td><code>${esc(name)}</code>${required.has(name) ? "" : ` <span class="muted">optional</span>`}</td><td class="wrap"><code>${esc(typeOf(schema))}</code></td><td class="wrap">${inline(schema.description ?? "")}</td></tr>`);
    }
    lines.push(`  </table></div>`);
  }
  if (rest) lines.push(`  <details><summary>Details</summary><p>${inline(rest)}</p></details>`);
  return lines.join("\n");
};

/** The page's HTML and the tools no group names */
export const generate = async (server) => {
  const { tools } = server ?? await readServer();
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const grouped = new Set(GROUPS.flatMap(group => group[3]));
  const other = tools.filter(tool => !grouped.has(tool.name)).map(tool => tool.name);
  const missing = [...grouped].filter(name => !byName.has(name));
  const groups = [...GROUPS, ...(other.length ? [["other", "Other", "", other]] : [])];
  const index = `  <div class="table"><table>\n    <tr><th>Area</th><th>Tools</th></tr>\n${groups.map(([id, title, , names]) => `    <tr><td><a href="#${id}">${esc(title)}</a></td><td class="wrap">${names.filter(name => byName.has(name)).map(name => `<a href="#${esc(name)}"><code>${esc(name)}</code></a>`).join(" · ")}</td></tr>`).join("\n")}\n  </table></div>`;
  const body = [index, ...groups.map(([id, title, intro, names]) => [
    `  <h2 id="${id}">${esc(title)}</h2>`,
    ...(intro ? [`  <p>${inline(intro)}</p>`] : []),
    ...names.filter(name => byName.has(name)).map(name => toolBlock(byName.get(name))),
  ].join("\n"))].join("\n\n");
  const html = page({
    title: "MCP tools reference",
    desc: `Every tool of the OSCT MCP server (${tools.length}) with its parameters: reading, scenes, targets, texts, files, plugins, import, history, render_scene, publish.`,
    kicker: "API",
    lead: `All ${tools.length} tools of the MCP server with their parameters, straight from the server's own definitions. For connecting an agent and the rules it works under, read the <a href="/docs/api/mcp/">MCP server</a> guide first.`,
    body,
    generator: "mcp/scripts/docs-reference.mjs from the tools in mcp/src/",
  });
  return { html, other, missing, count: tools.length };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await readServer();
  const check = process.argv.includes("--check");
  const { html, other, missing } = await generate(server);
  if (other.length) console.warn(`not in a group (listed under Other): ${other.join(", ")}`);
  if (missing.length) {
    console.error(`named by a group, but no such tool: ${missing.join(", ")} – update GROUPS`);
    process.exit(1);
  }
  // both pages are checked before the run fails, so one message names every stale page
  const current = [write(OUTPUT, html, check), write(MODEL_OUTPUT, generateModel(server.model), check)];
  if (current.includes(false)) process.exit(1);
}
