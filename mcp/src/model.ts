// The content model an agent may write, from the shared content contract (`shared/`): node types, placement, filters,
// components (built in, and what a book's plugins register), post-processing, the environment, printed placement,
// spread formats, entry categories – and the contract's own guard run over one entity before it is sent, so a wrong
// body never reaches the API.
import { assertGameConfiguration, GameConfigurationError, MAX_NODE_DEPTH } from "../../shared/guards/game-config";
import {
  ASSET_TYPES,
  COMPONENT_TYPE_PATTERN,
  COMPONENTS,
  componentTypes,
  CONTENT_SCHEMA_VERSION,
  ENTITY_TYPES,
  FILTERS,
  MATERIAL_TYPE_PATTERN,
  NODE_SRC_KINDS,
  NODE_TYPE_PATTERN,
  PASSES,
  PLACEMENT_DEFAULTS,
  PLACEMENT_PARAMS,
  PLUGIN_API_VERSION,
  PLUGIN_ID_PATTERN,
  PRINT_SURFACES,
  SPREAD_FORMATS,
  type PluginData,
} from "../../shared/types/game-config";
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_WORLDS, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS } from "../../shared/types/environment";
import { ENTRY_CATEGORIES } from "../../shared/types/entry";

/** What a plugin source registers, read from its text */
export interface SourceTypes {
  components: string[];
  layers: string[];
  nodeTypes: string[];
  passes: string[];
  /** materials (`registerMaterial`, plugin API 1.4) */
  materials: string[];
  /** procedural textures (`registerTexture`, plugin API 1.4) */
  textures: string[];
}

export interface BookModel {
  /** the compiled plugins the book's configuration declares (content schema 2.4), with what they recorded (2.14) */
  declared: readonly PluginData[];
  /** the Code tab's sources with the types read from them */
  sources: ({ id: string } & SourceTypes)[];
}

/** What a book's plugins are known to register */
export interface KnownPluginTypes {
  /** component and layer types: recorded by the declared plugins, read from the Code tab's sources */
  components: string[];
  /** node types (`registerNodeType`), the same way */
  nodeTypes: string[];
  /** materials (`registerMaterial`, schema 2.17), the same way */
  materials: string[];
  /** procedural textures (`registerTexture`), the same way */
  textures: string[];
  /**
   * every plugin's registrations are known: each declared plugin recorded them (schema 2.14) and the book has no Code tab
   * source (a source's types are read from its text, which may miss one) – a type outside the lists is then a typo
   */
  complete: boolean;
}

/** The plugins' types of a book: the declared plugins' recorded specs and the types read from the Code tab's sources */
export function knownPluginTypes(book: BookModel): KnownPluginTypes {
  const recorded = book.declared.map(plugin => plugin.registered ?? {});
  const unique = (types: string[]) => [...new Set(types)];
  return {
    components: unique([...recorded.flatMap(r => Object.keys(r.components ?? {})), ...book.sources.flatMap(s => [...s.components, ...s.layers])]),
    nodeTypes: unique([...recorded.flatMap(r => Object.keys(r.nodeTypes ?? {})), ...book.sources.flatMap(s => s.nodeTypes)]),
    materials: unique([...recorded.flatMap(r => Object.keys(r.materials ?? {})), ...book.sources.flatMap(s => s.materials)]),
    textures: unique([...recorded.flatMap(r => Object.keys(r.textures ?? {})), ...book.sources.flatMap(s => s.textures)]),
    complete: book.declared.every(plugin => plugin.registered) && book.sources.length === 0,
  };
}

/** The checks of one entity (a node tree): the guard's problems, and the plugin types it could not verify */
export interface EntityCheck {
  problems: string[];
  /** component types neither built in nor known from the book's plugins – a plugin must provide them; the publish checks */
  unknownComponents: string[];
  /** node types named like a plugin's that no known plugin registers – passed because a plugin of the book is unknown */
  unverifiedNodeTypes: string[];
  /** material types (schema 2.17) no known plugin registers – a plugin must provide them; the publish checks */
  unknownMaterials: string[];
}

/**
 * Runs the content contract's guard over one entity (as `entities.entity` of a minimal configuration), so placement,
 * filters, components, text colours, assets and the node depth are checked exactly as the content build and the app
 * check them; `path` names the entity in the problems. With `book`, its declared plugins go into the configuration: the
 * guard checks a recorded plugin component's or node type's parameters like a built-in one's. Component types nobody
 * knows pass here (a plugin may provide them – the publish checks) and are listed; node types follow `unknownNodeTypes`.
 */
export function checkEntity(entity: unknown, path = "entity", book?: BookModel): EntityCheck {
  const declared = book?.declared ?? [];
  const probe = {
    version: { version: "0.0.0", timestamp: "probe", schema: CONTENT_SCHEMA_VERSION },
    book: { id: "probe", title: "probe", author: "probe" },
    initialSpreadId: "probe",
    spreads: [{ id: "probe", title: "probe", firstPage: 1, lastPage: 2 }],
    entries: [],
    entities: { entity },
    tutorial: [],
    ...(declared.length ? { plugins: declared } : {}),
  };
  let problems: string[] = [];
  try {
    assertGameConfiguration(probe, { unknownComponentTypes: "allow" });
  } catch (error) {
    if (!(error instanceof GameConfigurationError)) throw error;
    problems = error.problems.map(problem => problem.replace(/^entities\.entity/, path));
  }
  const known = book ? knownPluginTypes(book) : undefined;
  const nodes = unknownNodeTypes(entity, path, known);
  // A type the guard refused already (with the book's recorded plugins) is named once
  const refused = new Set(problems.map(problem => problem.split(":")[0]));
  const typeProblems = nodes.problems.filter(problem => !refused.has(problem.split(":")[0]));
  const materials = unknownMaterialTypes(entity, known);
  // A material no plugin of the book can register (every plugin known, or none): refused as the API refuses it
  const materialProblems = known?.complete
    ? materials.map(type => `material "${type}" is not registered by a plugin of the book${known?.materials.length ? ` (${known.materials.join(", ")})` : ""}`)
    : [];
  return {
    problems: [...problems, ...typeProblems, ...materialProblems],
    unknownComponents: unknownComponentTypes(entity, known),
    unverifiedNodeTypes: nodes.unverified,
    unknownMaterials: materialProblems.length ? [] : materials,
  };
}

/** Every material type (schema 2.17) in the tree that the book's known plugins do not register */
export function unknownMaterialTypes(entity: unknown, known?: KnownPluginTypes): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const { material, children } = node as { material?: unknown; children?: unknown };
    const type = (material as { type?: unknown } | undefined)?.type;
    if (typeof type === "string" && MATERIAL_TYPE_PATTERN.test(type) && !known?.materials.includes(type)) found.add(type);
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(entity);
  return [...found];
}

/**
 * The node types the contract does not know: the guard only warns about one (a newer content's node renders nothing in
 * an older app), but an agent writing content gets it refused here, as the API refuses it – unless a plugin of the book
 * registers it (`known.nodeTypes`), or a plugin of the book is unknown (`known.complete` false) and it is named like a
 * plugin's: then it passes, listed as unverified.
 */
export function unknownNodeTypes(entity: unknown, path: string, known?: KnownPluginTypes): { problems: string[]; unverified: string[] } {
  const result = { problems: [] as string[], unverified: [] as string[] };
  const walk = (node: unknown, at: string) => {
    if (typeof node !== "object" || node === null) return;
    const { type, children } = node as { type?: unknown; children?: unknown };
    if (!(ENTITY_TYPES as readonly string[]).includes(type as string) && !(typeof type === "string" && known?.nodeTypes.includes(type))) {
      if (typeof type === "string" && known && !known.complete && NODE_TYPE_PATTERN.test(type)) {
        if (!result.unverified.includes(type)) result.unverified.push(type);
      } else {
        const plugins = known?.nodeTypes.length ? `, or a node type of the book's plugins (${known.nodeTypes.join(", ")})` : "";
        result.problems.push(`${at}.type: "${String(type)}" is not one of ${ENTITY_TYPES.join(", ")}${plugins}`);
      }
    }
    if (Array.isArray(children)) children.forEach((child, i) => walk(child, `${at}.children[${i}]`));
  };
  walk(entity, path);
  return result;
}

/** Every component type in the tree neither the shared registry (built-in: `COMPONENTS`) nor the book's plugins know */
export function unknownComponentTypes(entity: unknown, known?: KnownPluginTypes): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const { components, children } = node as { components?: unknown; children?: unknown };
    if (Array.isArray(components)) {
      for (const component of components) {
        const type = (component as { type?: unknown })?.type;
        if (typeof type === "string" && COMPONENT_TYPE_PATTERN.test(type) && !componentTypes().includes(type) && !known?.components.includes(type)) found.add(type);
      }
    }
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(entity);
  return [...found];
}

/** The tree names a node type or a component type that is not built in – only then the book's plugins matter */
export function usesPluginTypes(entity: unknown): boolean {
  if (typeof entity !== "object" || entity === null) return false;
  const { type, components, children, material } = entity as { type?: unknown; components?: unknown; children?: unknown; material?: unknown };
  if (typeof type === "string" && !(ENTITY_TYPES as readonly string[]).includes(type)) return true;
  if (material !== undefined) return true;
  if (Array.isArray(components) && components.some(c => typeof c?.type === "string" && !componentTypes().includes(c.type))) return true;
  return Array.isArray(children) && children.some(usesPluginTypes);
}

/**
 * The types a plugin source registers – read from the source text (`registerComponent("spin"`, `registerLayer('tint'`,
 * `registerNodeType("sparkle"`, `registerPass("scan"`, `registerMaterial("water"`, `registerTexture("caustics"`), not by
 * running it: the Code tab's sources are the editor's sandbox, nothing runs here
 */
export function pluginTypes(source: string): SourceTypes {
  const scan = (fn: string) =>
    [...new Set([...source.matchAll(new RegExp(`${fn}\\s*\\(\\s*["'\`]([a-zA-Z0-9]+)["'\`]`, "g"))].map(match => match[1]))];
  return {
    components: scan("registerComponent"), layers: scan("registerLayer"), nodeTypes: scan("registerNodeType"), passes: scan("registerPass"),
    materials: scan("registerMaterial"), textures: scan("registerTexture"),
  };
}

/** The recorded specs of a kind, type → the spec with the plugin that registers it */
const recordedSpecs = (book: BookModel, kind: "components" | "nodeTypes" | "passes" | "materials" | "textures") =>
  Object.fromEntries(book.declared.flatMap(plugin => Object.entries(plugin.registered?.[kind] ?? {}).map(([type, spec]) => [type, { plugin: plugin.id, ...spec }])));

/** The static model (the contract) and, with a book, what its plugins add */
export function describeContentModel(book?: BookModel): Record<string, unknown> {
  const known = book ? knownPluginTypes(book) : undefined;
  return {
    contentSchema: CONTENT_SCHEMA_VERSION,
    pluginApi: PLUGIN_API_VERSION,
    entity: {
      description:
        "An AR entity is a tree of nodes (EntityData): { id?, name?, type, assets, params?, filters?, components?, material?, children?, text?, color? }. " +
        "The root sits on the target (1 unit = the target image's width, origin in its centre); every node's params place it relative to its parent. " +
        `At most ${MAX_NODE_DEPTH} levels. Shared entities live under a ref and are used by targets as { ref }.`,
      name: "name (content schema 2.12, optional): what the editor's tree shows instead of the type – give the nodes of a larger tree names (\"door\", \"hint\") so the person finds them; the reader ignores it.",
      nodeTypes: ENTITY_TYPES,
      assets: {
        description: "The node's own files: [{ id, assetType, src }] – empty for group and text. src is an absolute URL (an uploaded asset's url) or a /assets/content/… path of the imported content.",
        assetTypes: ASSET_TYPES,
      },
      text: "text nodes: `text` (the line; {{entry.title}} and {{book.title}} are replaced) and `color` (#rrggbb, default white).",
      pluginNodeTypes: {
        description:
          "A plugin's node type (content schema 2.13, api.registerNodeType): written as `type: <its name>`, its parameters in params next to the placement; " +
          `src only when its spec says which file (${NODE_SRC_KINDS.join(" | ")}). The API refuses a type no plugin of the book registers when the plugins recorded what they register (schema 2.14).`,
        ...(book ? { recorded: recordedSpecs(book, "nodeTypes"), known: known!.nodeTypes } : {}),
      },
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
            plugins: recordedSpecs(book, "components"),
            declaredPlugins: book.declared.map(({ id, src, api, registered }) => ({ id, src, api, recorded: !!registered })),
            codeTabSources: book.sources,
            note:
              "plugins = the specs the declared plugins recorded (schema 2.14): their parameters are checked like a built-in component's. A declared plugin without recorded specs (an older build) registers its types when the reader loads it. A Code tab source runs on the editor's stage only (its types are read from its text); a publish whose nodes use a type no declared plugin provides is refused (409 unknown-components, unknown-node-types).",
          }
        : {}),
    },
    materials: {
      description:
        "entity.material (content schema 2.17, plugin API 1.4): { type, params? } – a material a plugin registers (api.registerMaterial) replaces the material of the node's meshes (a model, an image or video plane, a plugin node); its layers still add on top. Every material is a plugin's: the API refuses one no plugin of the book registers when the plugins recorded what they register, the publish refuses one no compiled plugin provides (409 unknown-materials).",
      textures:
        "A parameter of kind texture takes \"\" (none), a procedural texture's type (api.registerTexture – e.g. \"caustics\"), { type, …parameters } for one with other values, or a file: an uploaded image or video asset's url, or a /assets/content/… path.",
      typePattern: MATERIAL_TYPE_PATTERN.source,
      ...(book ? { plugins: recordedSpecs(book, "materials"), proceduralTextures: recordedSpecs(book, "textures"), known: known!.materials } : {}),
    },
    passes: {
      description:
        "Post-processing over the whole rendered AR image: [{ type, …params }], run in order. The book's passes (put_book_passes) are the master every spread shows; a spread's own (put_spread passes) replace them for that spread, [] turns them off there, null gives the spread the book's again. The API takes the built-in types.",
      builtIn: PASSES,
      ...(book ? { plugins: recordedSpecs(book, "passes") } : {}),
    },
    environment: {
      description:
        "The book's world around the reader while scanning and the onion sky (put_environment): { world, onionSky, worldSrc?, skySrc? } – worldSrc a glTF model (origin = the floor under the reader, +y up, −z towards the book), skySrc an equirectangular image (2:1): an uploaded asset's url or a /assets/content/… path. null = the default.",
      worlds: ENVIRONMENT_WORLDS,
      default: DEFAULT_ENVIRONMENT,
      worldSrcExtensions: WORLD_MODEL_EXTENSIONS,
      skySrcExtensions: SKY_IMAGE_EXTENSIONS,
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
    spread: {
      description:
        "SpreadData: { id, title, firstPage, lastPage, format?, passes? }. add_spread adds a double page (later pages are numbered on by two), the front cover (page 0) or the back cover; delete_spread removes one with everything on it (two steps: the impact, then the confirmation); put_spread changes title, format and passes.",
      formats: SPREAD_FORMATS,
    },
    plugin: {
      description:
        "A plugin source (the Code tab) exports register(api): api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.registerNodeType(type, spec, build) for a node type of its own, api.registerMaterial(type, spec, build) for a whole material (a ShaderMaterial …, plugin API 1.4), api.registerTexture(type, spec, draw) for a procedural texture, api.three for three.js – never import three. The spec's params have kind (number | color | choice | boolean | string | texture), default, description and an optional label (the few words the editor's row shows, plugin API 1.3); nodeTypes narrows the node types. Read the resource osct://guides/plugins.",
      idPattern: PLUGIN_ID_PATTERN.source,
    },
  };
}
