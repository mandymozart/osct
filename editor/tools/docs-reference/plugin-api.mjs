import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { esc, inline, page, slug, write } from "./page.mjs";

/**
 * The plugin API reference of the documentation site (`/docs/api/plugins/reference/`): every member of the plugin API
 * with its signature and its documentation, read from `plugin-api.d.ts` – the declaration file the Code tab gives its
 * editor (`tools/plugin-api/generate.mjs` writes that one from the engine). So the page lists exactly what a plugin can
 * call, in the words of the code's own comments.
 *
 * `node tools/docs-reference/plugin-api.mjs` writes it (`npm run docs-reference` in editor/); `--check` fails when the
 * committed page differs (a test runs it: the page never drifts from the API).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, "../../src/lib/plugins/plugin-api.d.ts");
export const OUTPUT = "api/plugins/reference/index.html";

/**
 * The page's sections in reading order: a heading, a line on it, and the declarations it lists. `as` names how a
 * plugin reaches the members (`api.events.on`), so the entry – and the search – show what is typed.
 * @typedef {[name: string, as?: string | null, heading?: string]} Listed a declaration, how it is reached, its heading
 * @type {{ id: string, title: string, intro: string, types: Listed[] }[]}
 */
const SECTIONS = [
  { id: "api", title: "api", intro: "What `register(api)` gets. Everything else on this page hangs off it.", types: [["PluginApi", "api"]] },
  { id: "events", title: "api.events", intro: "The stage's event bus. Core events are listened to, never emitted.", types: [["PluginEvents", "api.events"], ["CoreEvents", null, "Core events and their payloads"]] },
  { id: "vars", title: "api.vars", intro: "Variables in the four scopes: `scene`, `stage`, `session`, `experience`.", types: [["PluginVars", "api.vars"]] },
  { id: "progress", title: "api.progress", intro: "The reader's progress, read-only.", types: [["PluginProgress", "api.progress"]] },
  { id: "scene", title: "api.scene", intro: "The open scene and the others.", types: [["PluginScene", "api.scene"]] },
  { id: "params", title: "Parameters: api.p", intro: "The builders write a spec's parameters and type the values your code gets.", types: [["PARAM_BUILDERS", "api.p"], ["NumberOptions", null, "A number's options"], ["ParamTextOptions", null, "Every parameter's texts"], ["ComponentParamSpec", null, "A parameter written by hand"]] },
  { id: "specs", title: "Specs", intro: "What a register function takes as its second argument.", types: [["ComponentSpec"], ["NodeTypeSpec"], ["MaterialSpec"], ["TextureSpec"], ["PassSpec"], ["AppearanceSpec"], ["SpecLogic", null, "SpecLogic – what every spec may declare for the Logic view"], ["SpecUses"]] },
  { id: "component", title: "A component", intro: "`registerComponent(type, spec, apply)`: `apply` gets the context and returns the instance.", types: [["ComponentContext"], ["ComponentInstance"], ["LayerDefinition", null, "LayerDefinition – registerLayer's third argument"]] },
  { id: "node-type", title: "A node type", intro: "`registerNodeType(type, spec, build)`.", types: [["NodeTypeContext"], ["NodeTypeInstance"]] },
  { id: "material", title: "A material and a texture", intro: "`registerMaterial(type, spec, build)` and `registerTexture(type, spec, draw)`.", types: [["MaterialContext"], ["MaterialInstance"], ["TextureContext"], ["TextureInstance"]] },
  { id: "pass", title: "A pass", intro: "`registerPass(type, spec, factory)`.", types: [["PassContext"], ["PostPass"]] },
  { id: "appearance", title: "A look", intro: "`registerAppearance(type, spec, factory)`.", types: [["AppearanceContext"], ["AppearanceRun"]] },
  { id: "card-look", title: "A card look", intro: "`registerCardLook(type, spec, factory)` (API 4.1): how the marginalia card is picked up.", types: [["CardLookContext"], ["CardLookRun"]] },
  { id: "feedback", title: "Feedback buffers", intro: "`api.feedback(options)` returns the handle.", types: [["FeedbackOptions"], ["Feedback"]] },
  { id: "files", title: "Files and the module", intro: "What `api.loadModel` resolves to, and what a plugin file exports.", types: [["PluginModel"], ["PluginModule"]] },
];

const source = () => ts.createSourceFile(SOURCE, fs.readFileSync(SOURCE, "utf8"), ts.ScriptTarget.Latest, true);

/**
 * A node's documentation: its JSDoc comment as one paragraph
 * @param {ts.Node} node
 */
const docOf = node => (ts.getJSDocCommentsAndTags(node) ?? []).filter(ts.isJSDoc).map(doc => ts.getTextOfJSDocComment(doc.comment) ?? "").join(" ").trim();

/**
 * A node's own text without its comment, on one line, tabs gone
 * @param {ts.Node} node
 * @param {ts.SourceFile} file
 */
const textOf = (node, file) => node.getText(file).replace(/\s+/g, " ").replace(/;$/, "").trim();

/**
 * The declaration of a name: an interface, a type alias or a declared constant
 * @param {ts.SourceFile} file
 * @param {string} name
 * @returns {ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.VariableDeclaration}
 */
const find = (file, name) => {
  for (const statement of file.statements) {
    if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name.text === name) return statement;
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === name);
      if (declaration) return declaration;
    }
  }
  throw new Error(`plugin-api.d.ts has no ${name} – update SECTIONS in ${path.basename(fileURLToPath(import.meta.url))}`);
};

/**
 * The members a declaration lists: an interface's, or a constant's type literal's
 * @param {ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.VariableDeclaration} declaration
 * @returns {ts.TypeElement[] | null}
 */
const membersOf = declaration => {
  if (ts.isInterfaceDeclaration(declaration)) return [...declaration.members];
  const type = declaration.type;
  return type && ts.isTypeLiteralNode(type) ? [...type.members] : null;
};

/**
 * `extends A, B` of an interface
 * @param {ts.Node} declaration
 * @param {ts.SourceFile} file
 */
const parentsOf = (declaration, file) =>
  ts.isInterfaceDeclaration(declaration) ? (declaration.heritageClauses ?? []).flatMap(clause => clause.types.map(type => type.getText(file))) : [];

/** Every anchor once: a method's second overload (`api.events.on`) gets a number */
/** @type {Set<string>} */
let taken = new Set();
/** @param {string} base */
const anchor = base => {
  let id = slug(base);
  for (let n = 2; taken.has(id); n++) id = `${slug(base)}-${n}`;
  taken.add(id);
  return id;
};
/** The declarations the page lists: only those are linked to */
const LISTED = new Set(SECTIONS.flatMap(section => section.types.map(([name]) => name)));

/** @param {ts.TypeElement} member */
const memberName = member => (member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) ? member.name.text : null);

/**
 * One member as a row: its name (the anchor), its signature and its documentation
 * @param {ts.TypeElement} member
 * @param {ts.SourceFile} file
 * @param {string} owner the declaration's name
 * @param {string | null | undefined} as how a plugin reaches the declaration
 */
const row = (member, file, owner, as) => {
  const name = memberName(member);
  if (!name) return "";
  const method = ts.isMethodSignature(member);
  const optional = member.questionToken ? "?" : "";
  const label = `${as ? `${as}.` : ""}${name}${optional}${method ? "()" : ""}`;
  return `    <tr id="${anchor(`${owner}-${name}`)}"><td><code>${esc(label)}</code></td><td class="wrap"><code class="sig">${esc(textOf(member, file))}</code>${docOf(member) ? `<br>${inline(docOf(member))}` : ""}</td></tr>`;
};

/**
 * One declaration: its heading, its documentation, its members as a table (or its text)
 * @param {ts.SourceFile} file
 * @param {Listed} listed
 */
const block = (file, [name, as, heading]) => {
  const declaration = find(file, name);
  const members = membersOf(declaration);
  const doc = docOf(ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration);
  const parents = parentsOf(declaration, file);
  const lines = [`  <h3 id="${slug(name)}">${esc(heading ?? name)}</h3>`];
  if (doc) lines.push(`  <p>${inline(doc)}</p>`);
  if (parents.length) lines.push(`  <p class="muted">Also has the members of ${parents.map(parent => (LISTED.has(parent.replace(/<.*/, "")) ? `<a href="#${slug(parent.replace(/<.*/, ""))}"><code>${esc(parent)}</code></a>` : `<code>${esc(parent)}</code> (three.js)`)).join(", ")}.</p>`);
  if (members) {
    lines.push(`  <div class="table"><table>`, `    <tr><th>Member</th><th>Signature and what it does</th></tr>`, ...members.map(member => row(member, file, name, as)).filter(Boolean), `  </table></div>`);
  } else {
    lines.push(`  <pre><code>${esc(declaration.getText(file).replace(/\t/g, "  "))}</code></pre>`);
  }
  return lines.join("\n");
};

/** The page's HTML */
export const generate = () => {
  const file = source();
  taken = new Set();
  const version = /PLUGIN_API_VERSION = "([^"]+)"/.exec(file.text)?.[1] ?? "";
  const body = SECTIONS.map(section => [
    `  <h2 id="${section.id}">${esc(section.title)}</h2>`,
    `  <p>${inline(section.intro)}</p>`,
    ...section.types.map(type => block(file, type)),
  ].join("\n")).join("\n\n");
  return page({
    title: "Plugin API reference",
    desc: `Every member of the OSCT plugin API${version ? ` ${version}` : ""}: api, events, variables, progress, scene, parameter builders, specs, contexts, hooks and feedback buffers, with signatures.`,
    kicker: "API",
    lead: `Every member of the plugin API${version ? ` ${esc(version)}` : ""} with its signature, straight from the types the Code tab uses. For how the parts fit together, read the <a href="/docs/api/plugins/">Plugin API</a> guide first.`,
    body,
    generator: "editor/tools/docs-reference/plugin-api.mjs from editor/src/lib/plugins/plugin-api.d.ts",
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!write(OUTPUT, generate(), process.argv.includes("--check"))) process.exit(1);
}
