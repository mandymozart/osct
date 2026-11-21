// The content model reference of the documentation site (/docs/api/content/): what describe_content_model answers –
// scenes, entries, targets, node types, placement, components and the rules' grammar, filters, passes, looks – as a
// page. docs-reference.mjs reads the model from the server's own code (mcp/src/model.ts, the contract in shared/) and
// hands it here; nothing on the page is typed by hand but the sections' headings.
import { esc, inline, page, slug } from "../../editor/tools/docs-reference/page.mjs";

export const MODEL_OUTPUT = "api/content/index.html";

/** The model's sections in reading order with their headings; a key the list does not name follows at the end */
const SECTIONS = [
  ["experience", "The experience"], ["scene", "Scenes, surfaces and groups"], ["entry", "An entry"], ["entryText", "An entry's text"],
  ["target", "A target"], ["entity", "An entity: the node tree"], ["placement", "Placement"], ["components", "Components"],
  ["logic", "Rules of a scene and of the experience"], ["filters", "Filters"], ["materials", "Materials"], ["passes", "Post-processing passes"],
  ["appearance", "Looks: how entities appear"], ["environment", "Environment"], ["images", "Pictures"], ["subtitles", "Subtitles"],
  ["credits", "Credits"], ["plugin", "Plugins"], ["onboarding", "Onboarding"],
];

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isSimple = value => value === null || typeof value !== "object" || (Array.isArray(value) && value.every(item => item === null || typeof item !== "object"));
const simple = value => (Array.isArray(value) ? value.map(item => `<code>${esc(String(item))}</code>`).join(" · ") : typeof value === "string" ? inline(value) : `<code>${esc(String(value))}</code>`);
/** A map of parameters: every value an object that says its kind, its unit or what it is */
const isParams = value => isObject(value) && Object.keys(value).length > 0 && Object.values(value).every(item => isObject(item) && ("kind" in item || "unit" in item || "description" in item) && !("params" in item));
/** A map of named things, each with a description (a pass, a component, a look) */
const isNamed = value => isObject(value) && Object.keys(value).length > 0 && Object.values(value).every(item => isObject(item) && "description" in item);
const json = value => `  <pre><code>${esc(JSON.stringify(value, null, 2))}</code></pre>`;

const paramRange = param => [
  param.kind,
  param.options ? param.options.map(option => JSON.stringify(option)).join(" | ") : "",
  param.min !== undefined || param.max !== undefined ? `${param.min ?? ""} … ${param.max ?? ""}` : "",
  param.unit ? `in ${param.unit}` : "",
  param.step !== undefined ? `step ${param.step}` : "",
].filter(Boolean).join(" · ");

const paramTable = (params, id) => [
  `  <div class="table"><table>`,
  `    <tr><th>Parameter</th><th>Kind</th><th>Default</th><th>What</th></tr>`,
  ...Object.entries(params).map(([name, param]) => `    <tr id="${slug(`${id}-${name}`)}"><td><code>${esc(name)}</code></td><td class="wrap">${esc(paramRange(param))}</td><td>${param.default === undefined ? "" : `<code>${esc(JSON.stringify(param.default))}</code>`}</td><td class="wrap">${inline(param.description ?? "")}${param.label ? ` <span class="muted">(shown as “${esc(param.label)}”)</span>` : ""}</td></tr>`),
  `  </table></div>`,
].join("\n");

/** Every anchor once: a second thing of the same name (the built-in `behaviour` and the rules' grammar) gets a number */
let taken = new Set();
const anchor = base => {
  let id = slug(base);
  for (let n = 2; taken.has(id); n++) id = `${slug(base)}-${n}`;
  taken.add(id);
  return id;
};

/** One object of the model: its description, its plain values as a table, its parameters, its named things, the rest as JSON */
const block = (value, id, level) => {
  const lines = [];
  if (typeof value.description === "string") lines.push(`  <p>${inline(value.description)}</p>`);
  const plain = Object.entries(value).filter(([key, item]) => key !== "description" && isSimple(item));
  if (plain.length) lines.push(`  <div class="table"><table>`, ...plain.map(([key, item]) => `    <tr id="${slug(`${id}-${key}`)}"><td><code>${esc(key)}</code></td><td class="wrap">${simple(item)}</td></tr>`), `  </table></div>`);
  const heading = `h${Math.min(level, 4)}`;
  for (const [key, item] of Object.entries(value)) {
    if (key === "description" || isSimple(item)) continue;
    if (key === "params") {
      if (Object.keys(item).length) lines.push(isParams(item) ? paramTable(item, id) : json(item));
    } else if (/^(example|examples|defaults|presetSizes)$/.test(key) || !isObject(item)) {
      lines.push(`  <p class="muted"><code>${esc(key)}</code></p>`, json(item));
    } else if (isNamed(item)) {
      for (const [name, thing] of Object.entries(item)) lines.push(`  <${heading} id="${anchor(`${id}-${name}`)}"><code>${esc(name)}</code> <span class="who">${esc(key)}</span></${heading}>`, block(thing, `${id}-${name}`, level + 1));
    } else {
      lines.push(`  <${heading} id="${anchor(`${id}-${key}`)}"><code>${esc(key)}</code></${heading}>`, block(item, `${id}-${key}`, level + 1));
    }
  }
  return lines.join("\n");
};

/** The content model page's HTML */
export const generateModel = model => {
  taken = new Set();
  const named = new Map(SECTIONS);
  const keys = [...SECTIONS.map(([key]) => key).filter(key => isObject(model[key])), ...Object.keys(model).filter(key => isObject(model[key]) && !named.has(key))];
  const body = keys.map(key => [`  <h2 id="${slug(key)}">${esc(named.get(key) ?? key)}</h2>`, block(model[key], key, 3)].join("\n")).join("\n\n");
  return page({
    title: "Content model reference",
    desc: `The OSCT content model, schema ${model.contentSchema}: scenes, entries, targets, node types, placement, components and rules, filters, passes and looks with every parameter.`,
    kicker: "API",
    lead: `What an experience is made of, content schema ${esc(String(model.contentSchema))}: every built-in type with its parameters, their ranges and defaults. It is what the tool <code>describe_content_model</code> answers an agent, and what the editor's rows are built from.`,
    body,
    generator: "mcp/scripts/docs-reference.mjs from mcp/src/model.ts (the contract in shared/)",
  });
};
