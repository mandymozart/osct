// The content model an agent may write, from the shared content contract (`shared/`): node types, placement, filters,
// components (built in, and what a book's plugins register), printed placement, spread formats, entry categories –
// and the contract's own guard run over one entity before it is sent, so a wrong body never reaches the API.
import { assertGameConfiguration, GameConfigurationError, MAX_NODE_DEPTH } from "../../shared/guards/game-config";
import {
  ASSET_TYPES,
  COMPONENT_TYPE_PATTERN,
  COMPONENTS,
  componentTypes,
  CONTENT_SCHEMA_VERSION,
  ENTITY_TYPES,
  FILTERS,
  PLACEMENT_DEFAULTS,
  PLACEMENT_PARAMS,
  PLUGIN_API_VERSION,
  PLUGIN_ID_PATTERN,
  PRINT_SURFACES,
  SPREAD_FORMATS,
  type PluginData,
} from "../../shared/types/game-config";
import { ENTRY_CATEGORIES } from "../../shared/types/entry";

/** The checks of one entity (a node tree): the guard's problems, and the component types nobody built in */
export interface EntityCheck {
  problems: string[];
  /** component types the shared registry does not know – a plugin must provide them; the publish checks */
  unknownComponents: string[];
}

/**
 * Runs the content contract's guard over one entity (as `entities.entity` of a minimal configuration), so placement,
 * filters, components, text colours, assets and the node depth are checked exactly as the content build and the app
 * check them; `path` names the entity in the problems. Component types the registry does not know pass here (a plugin
 * may provide them) and are listed.
 */
export function checkEntity(entity: unknown, path = "entity"): EntityCheck {
  const probe = {
    version: { version: "0.0.0", timestamp: "probe", schema: CONTENT_SCHEMA_VERSION },
    book: { id: "probe", title: "probe", author: "probe" },
    initialSpreadId: "probe",
    spreads: [{ id: "probe", title: "probe", firstPage: 1, lastPage: 2 }],
    entries: [],
    entities: { entity },
    tutorial: [],
  };
  let problems: string[] = [];
  try {
    assertGameConfiguration(probe, { unknownComponentTypes: "allow" });
  } catch (error) {
    if (!(error instanceof GameConfigurationError)) throw error;
    problems = error.problems.map(problem => problem.replace(/^entities\.entity/, path));
  }
  return { problems: [...problems, ...unknownNodeTypes(entity, path)], unknownComponents: unknownComponentTypes(entity) };
}

/**
 * A node type the contract does not know: the guard only warns (a newer content's node renders nothing in an older app),
 * but an agent writing content gets it refused here – the API refuses it too
 */
export function unknownNodeTypes(entity: unknown, path: string): string[] {
  if (typeof entity !== "object" || entity === null) return [];
  const node = entity as { type?: unknown; children?: unknown };
  const problems = (ENTITY_TYPES as readonly string[]).includes(node.type as string) ? [] : [`${path}.type: "${String(node.type)}" is not one of ${ENTITY_TYPES.join(", ")}`];
  if (Array.isArray(node.children)) node.children.forEach((child, i) => problems.push(...unknownNodeTypes(child, `${path}.children[${i}]`)));
  return problems;
}

/** Every component type in the tree the shared registry does not know (built-in: `COMPONENTS`) */
export function unknownComponentTypes(entity: unknown, found = new Set<string>()): string[] {
  if (typeof entity !== "object" || entity === null) return [...found];
  const node = entity as { components?: unknown; children?: unknown };
  if (Array.isArray(node.components)) {
    for (const component of node.components) {
      const type = (component as { type?: unknown })?.type;
      if (typeof type === "string" && COMPONENT_TYPE_PATTERN.test(type) && !componentTypes().includes(type)) found.add(type);
    }
  }
  if (Array.isArray(node.children)) node.children.forEach(child => unknownComponentTypes(child, found));
  return [...found];
}

/**
 * The component and layer types a plugin source registers – read from the source text (`registerComponent("spin"`,
 * `registerLayer('tint'`), not by running it: the Code tab's sources are the editor's sandbox, nothing runs here
 */
export function pluginTypes(source: string): { components: string[]; layers: string[] } {
  const scan = (fn: string) =>
    [...source.matchAll(new RegExp(`${fn}\\s*\\(\\s*["'\`]([a-zA-Z0-9]+)["'\`]`, "g"))].map(match => match[1]);
  return { components: [...new Set(scan("registerComponent"))], layers: [...new Set(scan("registerLayer"))] };
}

export interface BookModel {
  /** the compiled plugins the book's configuration declares (content schema 2.4) */
  declared: readonly PluginData[];
  /** the Code tab's sources with the types read from them */
  sources: { id: string; components: string[]; layers: string[] }[];
}

/** The static model (the contract) and, with a book, what its plugins add */
export function describeContentModel(book?: BookModel): Record<string, unknown> {
  return {
    contentSchema: CONTENT_SCHEMA_VERSION,
    pluginApi: PLUGIN_API_VERSION,
    entity: {
      description:
        "An AR entity is a tree of nodes (EntityData): { id?, type, assets, params?, filters?, components?, children?, text?, color? }. " +
        "The root sits on the target (1 unit = the target image's width, origin in its centre); every node's params place it relative to its parent. " +
        `At most ${MAX_NODE_DEPTH} levels. Shared entities live under a ref and are used by targets as { ref }.`,
      nodeTypes: ENTITY_TYPES,
      assets: {
        description: "The node's own files: [{ id, assetType, src }] – empty for group and text. src is an absolute URL (an uploaded asset's url) or a /assets/content/… path of the imported content.",
        assetTypes: ASSET_TYPES,
      },
      text: "text nodes: `text` (the line; {{entry.title}} and {{book.title}} are replaced) and `color` (#rrggbb, default white).",
    },
    placement: {
      description:
        "entity.params: position [x, y, z] in target widths (x → right, y → top of the page, z → out of the page), rotation [x, y, z] in degrees (Euler XYZ), scale as one number or [x, y, z]. Missing values take the type's defaults.",
      params: PLACEMENT_PARAMS,
      defaults: PLACEMENT_DEFAULTS,
    },
    filters: { description: "entity.filters (video nodes only): [{ type, …params }], applied in order.", types: FILTERS },
    components: {
      description: "entity.components: [{ type, …params }] – the built-in types, and the components and material layers a plugin registers (used the same way).",
      builtIn: COMPONENTS,
      typePattern: COMPONENT_TYPE_PATTERN.source,
      ...(book
        ? {
            declaredPlugins: book.declared,
            codeTabSources: book.sources,
            note:
              "A declared plugin (compiled by the content build) registers its types when the reader loads it. A Code tab source runs on the editor's stage only; a publish whose nodes use a type no declared plugin provides is refused (409 unknown-components).",
          }
        : {}),
    },
    target: {
      description: "TargetData: { id, imageSrc, entity?: EntityData | { ref }, print? }. imageSrc = the printed image (an uploaded image asset's url).",
      print: {
        description: "Where the target is printed, in mm from the surface's top left corner: { surface, x, y, width, height?, page? } – the editor's stage lays it there.",
        surfaces: PRINT_SURFACES,
      },
    },
    entry: {
      description: "An entry is top level: { id, category, title, page, body, tags, target? } – page decides the spread. add_entry makes an entry with its target.",
      categories: ENTRY_CATEGORIES,
    },
    spread: { description: "SpreadData: { id, title, firstPage, lastPage, format? }.", formats: SPREAD_FORMATS },
    plugin: {
      description:
        "A plugin source (the Code tab) exports register(api): api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.three for three.js – never import three. The spec's params have kind (number | color | choice | boolean | string), default, description; nodeTypes narrows the node types. Read the resource osct://guides/plugins.",
      idPattern: PLUGIN_ID_PATTERN.source,
    },
  };
}
