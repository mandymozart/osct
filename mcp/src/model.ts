// The content model an agent may write, from the shared content contract (`shared/`): node types, placement, filters,
// components (built in, and what a book's plugins register), post-processing, the looks an entity appears with, the
// environment, printed placement,
// spread formats, entry categories – and the contract's own guard run over one entity before it is sent, so a wrong
// body never reaches the API.
import { assertGameConfiguration, GameConfigurationError, MAX_NODE_DEPTH } from "../../shared/guards/game-config";
import {
  APPEARANCE_TYPES,
  APPEARANCES,
  appearanceProblems,
  type AppearanceSpec,
  ASSET_TYPES,
  DEFAULT_APPEARANCE_TYPE,
  MOMENTS,
  TEXTURE_SIZES,
  BEHAVIOUR_ACTIONS,
  BEHAVIOUR_CORE_EVENTS,
  BEHAVIOUR_NODE_EVENTS,
  BEHAVIOUR_SCOPES,
  COMPONENT_TYPE_PATTERN,
  COMPONENTS,
  componentTypes,
  CONTENT_SCHEMA_VERSION,
  ENTITY_TYPES,
  FILTERS,
  MATERIAL_TYPE_PATTERN,
  NODE_SRC_KINDS,
  NODE_TYPE_PATTERN,
  PASS_TYPES,
  passProblems,
  PASSES,
  type PassSpec,
  PLACEMENT_DEFAULTS,
  PLACEMENT_PARAMS,
  PLUGIN_API_VERSION,
  PLUGIN_ID_PATTERN,
  PRINT_SURFACES,
  SOURCES_OF_TRUTH,
  SPREAD_FORMATS,
  MATTERS,
  SCENE_LAYOUTS,
  SURFACE_SIDES,
  type PluginData,
} from "../../shared/types/game-config";
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_WORLDS, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS } from "../../shared/types/environment";
import { SCENE_PRESETS } from "../../shared/api/editor";
import { ENTRY_CATEGORIES } from "../../shared/types/entry";
import type { SourceTypes } from "../../shared/api/rules";
import { IMAGE_MAX_PIXELS, IMAGE_MAX_SIDE, IMAGE_WEBP_QUALITY } from "../../shared/api/images";

export interface BookModel {
  /** the compiled plugins the book's configuration declares, with what they recorded */
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
  /** materials (`registerMaterial`), the same way */
  materials: string[];
  /** procedural textures (`registerTexture`), the same way */
  textures: string[];
  /** post-processing passes (`registerPass`, a `passes` entry), the same way */
  passes: string[];
  /** looks an entity appears with (`registerAppearance`, a `book.appearance` moment), the same way */
  appearances: string[];
  /**
   * every plugin's registrations are known: each declared plugin recorded them and the book has no Code tab
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
    passes: unique([...recorded.flatMap(r => Object.keys(r.passes ?? {})), ...book.sources.flatMap(s => s.passes)]),
    appearances: unique([...recorded.flatMap(r => Object.keys(r.appearances ?? {})), ...book.sources.flatMap(s => s.appearances)]),
    complete: book.declared.every(plugin => plugin.registered) && book.sources.length === 0,
  };
}

/** A passes list names a type that is not built in – only then the book's plugins matter */
export function usesPluginPasses(passes: unknown): boolean {
  return Array.isArray(passes) && passes.some(pass => typeof pass?.type === "string" && !(PASS_TYPES as readonly string[]).includes(pass.type));
}

/**
 * The contract's check of a `passes` list (a plugin's pass too): a pass the declared plugins recorded is
 * checked against its spec like a built-in one; one a Code tab source registers (read from its text, no spec) passes,
 * listed as unverified; any other is refused – unless a declared plugin recorded nothing (what it registers is unknown
 * until it runs): then it passes, unverified, too. The publish refuses a pass no compiled plugin provides.
 */
export function checkPasses(passes: unknown, path: string, book?: BookModel): { problems: string[]; unverified: string[] } {
  const specs = new Map<string, PassSpec>(
    (book?.declared ?? []).flatMap(plugin => Object.entries(plugin.registered?.passes ?? {})),
  );
  const fromSources = new Set((book?.sources ?? []).flatMap(source => source.passes));
  const unrecorded = (book?.declared ?? []).some(plugin => !plugin.registered);
  const known = book ? knownPluginTypes(book).passes : [];
  const allowed = (type: string) => fromSources.has(type) || (unrecorded && COMPONENT_TYPE_PATTERN.test(type));
  const problems = passProblems(passes, path, { spec: type => specs.get(type), pluginTypes: known })
    .filter(problem => {
      const type = /\.type: "([^"]*)" is not one of/.exec(problem)?.[1];
      return type === undefined || !allowed(type);
    });
  const unverified = Array.isArray(passes)
    ? [...new Set(passes.map(pass => pass?.type).filter((type): type is string => typeof type === "string" && !(PASS_TYPES as readonly string[]).includes(type) && !specs.has(type) && allowed(type)))]
    : [];
  return { problems, unverified };
}

/** A book's `appearance` names a look that is not built in – only then the book's plugins matter */
export function usesPluginAppearances(appearance: unknown): boolean {
  if (typeof appearance !== "object" || appearance === null) return false;
  return Object.values(appearance).some(look => typeof look?.type === "string" && !(APPEARANCE_TYPES as readonly string[]).includes(look.type));
}

/**
 * The contract's check of a book's `appearance` (a plugin's look too), as `checkPasses`: a look the declared plugins
 * recorded is checked against its spec like a built-in one; one a Code tab source registers (read from its text, no
 * spec) passes, listed as unverified; any other is refused – unless a declared plugin recorded nothing. The publish
 * refuses a look no compiled plugin provides.
 */
export function checkAppearance(appearance: unknown, path: string, book?: BookModel): { problems: string[]; unverified: string[] } {
  const specs = new Map<string, AppearanceSpec>(
    (book?.declared ?? []).flatMap(plugin => Object.entries(plugin.registered?.appearances ?? {})),
  );
  const fromSources = new Set((book?.sources ?? []).flatMap(source => source.appearances));
  const unrecorded = (book?.declared ?? []).some(plugin => !plugin.registered);
  const known = book ? knownPluginTypes(book).appearances : [];
  const allowed = (type: string) => fromSources.has(type) || (unrecorded && COMPONENT_TYPE_PATTERN.test(type));
  const problems = appearanceProblems(appearance, path, { spec: type => specs.get(type), pluginTypes: known })
    .filter(problem => {
      const type = /\.type: "([^"]*)" is not one of/.exec(problem)?.[1];
      return type === undefined || !allowed(type);
    });
  const looks = typeof appearance === "object" && appearance !== null ? Object.values(appearance) : [];
  const unverified = [...new Set(looks.map(look => look?.type).filter((type): type is string =>
    typeof type === "string" && !(APPEARANCE_TYPES as readonly string[]).includes(type) && !specs.has(type) && allowed(type)))];
  return { problems, unverified };
}

/** The checks of one entity (a node tree): the guard's problems, and the plugin types it could not verify */
export interface EntityCheck {
  problems: string[];
  /** component types neither built in nor known from the book's plugins – a plugin must provide them; the publish checks */
  unknownComponents: string[];
  /** node types named like a plugin's that no known plugin registers – passed because a plugin of the book is unknown */
  unverifiedNodeTypes: string[];
  /** material types no known plugin registers – a plugin must provide them; the publish checks */
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

/** Every material type in the tree that the book's known plugins do not register */
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

/** The recorded specs of a kind, type → the spec with the plugin that registers it */
const recordedSpecs = (book: BookModel, kind: "components" | "nodeTypes" | "passes" | "materials" | "textures" | "appearances") =>
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
        textures: `textures (content schema 2.27, optional, a model file only): the model's colour map in several sizes – [{ material?, sizes: [{ size, src }] }], size one of ${TEXTURE_SIZES.join(", ")} (px, a square picture), each once, smallest first. The model file carries the smallest map and shows with it at once; the reader's texture quality chooses the size that is loaded, so the mesh loads once. material = the glTF material whose map the set is; none = every material of the model (a model baked into one map). Upload each size as an image (upload_asset tells its width) and put its url into src.`,
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
    subtitles: {
      description:
        "A video's subtitles (content schema 2.31): no field of a node. Upload a WebVTT file named <video name>.<language>.vtt with upload_asset – speak.en.vtt, speak.fr.vtt for speak.mp4 – and it belongs to every video of that name in the book, uploaded or imported; the draft's configuration lists the files per video in `subtitles`. One file per language (en, de, fr, nl, pt-BR …), each cue `00:00:01.000 --> 00:00:03.500` and its text below, the times the video's own. The reader shows the line of its language while the video plays (else English, else the first), the editor's stage the English one.",
    },
    credits: {
      description:
        "Picture credits (content schema 2.33, #292): no field of an entry or a node. A file's credit line (one free text line – \"Book Golem by TER-JAN / DeviantArt\") is set in the Library with set_asset_credits and listed by list_assets; the book's configuration carries the lines of the files it uses (credits: { <file URL>: <line> }), and the reader lists them per spread on its image credits page (Info → here).",
    },
    pageImages: {
      description:
        "Page images (#251): no content – an editor-only override of the print layout. One Library image per book page (the covers, the front and back matter's internal pages, the numbered pages, and the unnumbered half next to a single page – `facing`) that the editor's stage and spread cards show instead of the layout's sheet for that page; the reader never shows them and the draft does not carry them. list_pages lists every page in book order with its label (Cover, F1…, next to 1, 12, B1…, Back cover) and its image; set_page_images sets, replaces, moves, renames and removes them in one call – by page, label or a file name (P012…, start-1… / end-1… in print order), uploading local files on the way.",
    },
    images: {
      description:
        `The image rule (#298): every picture takes the same way into the book. An uploaded jpg / png / webp is stored as WebP (quality ${IMAGE_WEBP_QUALITY}; lossless when it has transparency – an icon, a cut-out), turned upright by its EXIF orientation, its metadata dropped, never scaled up, its longest side at most ${IMAGE_MAX_SIDE.page} px for a page image and an entry's colour picture, ${IMAGE_MAX_SIDE.target} px for a target's printed image and ${IMAGE_MAX_SIDE.default} px for every other Library picture; a picture above ${IMAGE_MAX_PIXELS / 1_000_000} MP is refused (413 image-too-large). The upload does not know the use: upload_asset takes fit: "target" for a target's printed image (set_page_images uploads as page images by itself). The stored file is named <name>.webp. TIFF and PDF are no Library files – convert them locally first (Pillow / PyMuPDF), then upload.`,
    },
    components: {
      description: "entity.components: [{ type, …params }] – the built-in types, and the components and material layers a plugin registers (used the same way).",
      builtIn: COMPONENTS,
      typePattern: COMPONENT_TYPE_PATTERN.source,
      moments: {
        description:
          "An entity's own look for a moment (content schema 2.30): the built-in components reveal (the first find of a target), found (every later find) and lost (the page is lost) on a node of the entity – any node – { type: reveal, look: printLift, duration: 900 }. " +
          "look = a look's type – a built-in one (appearance.builtIn) or one a plugin of the book registers (api.registerAppearance, appearance.plugins) – and \"\" or no look = the book's; the other keys are the look's parameters (appearance.builtIn[look].params), only the values that differ from its defaults. " +
          "Changing the look means writing the component anew with its parameters. They win over the book's appearance: the root node's moment, else its found (for reveal and lost), else the book's moment, the book's found, the default. A node with a look of its own animates its subtree apart from the rest, with that look (a child's moment: its own, else its found, else it is part of its parent's); the root plays the book's look where it names none.",
        types: MOMENTS,
        example: [{ type: "reveal", look: "printLift", duration: 900 }, { type: "lost", look: "fade", outDuration: 250 }],
      },
      behaviour: {
        description:
          "The built-in behaviour (content schema 2.19, any node type): rules without code – { type: behaviour, rules: [{ on, when?, do }] }. " +
          "on = the node's own event or any other camelCase name, an event of the stage's bus (a scene event a plugin or a behaviour emits, or a core event). " +
          "when = { variable: value, … } (all equal) or { any: { variable: value, … } }; a value is text, a number, true / false, null (= not set), or { not: value }. " +
          "do = one action or a list, run in order: play: <clip> (\"\" = the node's own clip – its animation component's, else the first) with optional node: <name>; " +
          "pause / stop / show / hide: <node name> (\"\" = the behaviour's own node; a node of its subtree by its name); set: { variable: value } with optional scope (spread by default, null deletes); " +
          "emit: <event> (a scene event, never a core event). A string runs a verb on the own node: play, pause, stop, show, hide. " +
          "On one event every rule's condition is read first, then the matching rules run in their order. Variables are read like a plugin's api.vars.get (the innermost scope that has it).",
        nodeEvents: BEHAVIOUR_NODE_EVENTS,
        coreEvents: BEHAVIOUR_CORE_EVENTS,
        actions: BEHAVIOUR_ACTIONS,
        scopes: BEHAVIOUR_SCOPES,
        example: {
          type: "behaviour",
          rules: [
            { on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "book" }, { emit: "keyRattled" }] },
            { on: "found", when: { hasKey: true }, do: [{ hide: "hint" }, { emit: "openDoor" }] },
          ],
        },
      },
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
        "Post-processing over the whole rendered AR image: [{ type, enabled?, …params }], run in order. The book's passes (put_book_passes) are the master every spread shows; a spread's own (put_spread passes) replace them for that spread, [] turns them off there, null gives the spread the book's again. " +
        "enabled: false (content schema 2.22) switches one pass off – it keeps its place and values, the chain skips it, it does not count towards the phone budget; leave enabled out for a pass that runs. A 2.21 reader ignores it and runs the pass. " +
        "The built-in types, and (content schema 2.21) a pass a plugin of the book registers (api.registerPass) – written the same way, its parameters checked against the recorded spec. A pass no compiled plugin provides is refused by the publish (409 unknown-passes); a 2.20 reader refuses a book that names one. Up to three passes and one bloom per list fit the phone budget.",
      builtIn: PASSES,
      ...(book ? { plugins: recordedSpecs(book, "passes"), known: known!.passes } : {}),
    },
    appearance: {
      description:
        "How an AR entity appears and disappears (content schema 2.29, put_book_appearance): book.appearance { reveal?, found?, lost? }, each a look { type, …params } like a pass – reveal = the first find of a target (the entry is unlocked with it), found = every later find, lost = the page is lost (its look plays rewound, in the look's outDuration). " +
        `A moment without a look takes found's, and without that ${DEFAULT_APPEARANCE_TYPE}; a book without appearance plays ${DEFAULT_APPEARANCE_TYPE} everywhere. ` +
        "The built-in looks share one set of parameters and differ in their defaults (builtIn: each look's params with its defaults); write only the values that differ. A look a plugin of the book registers (api.registerAppearance, plugin API 1.8) is named the same way, its parameters checked against the recorded spec; the publish refuses a look no compiled plugin provides (409 unknown-appearances). An app before 2.29 ignores the field and plays its own animation.",
      moments: MOMENTS,
      default: DEFAULT_APPEARANCE_TYPE,
      builtIn: APPEARANCES,
      ...(book ? { plugins: recordedSpecs(book, "appearances"), known: known!.appearances } : {}),
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
      description:
        "TargetData: { id, imageSrc, entity?: EntityData | { ref }, print?, enabled? }. imageSrc = the printed image (an uploaded image asset's url). enabled: false (content schema 2.26) switches the target off – the reader leaves it and its entry out until it is switched on, the editor keeps both; leave it out for a target in the book.",
      print: {
        description: "Where the target is printed, in mm from the surface's top left corner: { surface, x, y, width, height?, page? } – the editor's stage lays it there.",
        surfaces: PRINT_SURFACES,
      },
    },
    entry: {
      description:
        "An entry is top level: { id, category, title, page, scene?, surface?, body, author?, image?, caption?, media?, tags, target? } – page decides the spread unless scene is set (content schema 2.35, #307: scene = a spread id and wins over page; surface = the id of one of that scene's surfaces, whose printed label the reader shows in place of the page number). The page stays required and in the scene's range – older apps place the entry by it; the draft writes scene on every entry from the spread it is on, and add_entry / update_entry still place an entry by its page. add_entry makes one, with its target or without (read only in the list); get_entries reads every field; update_entry changes them (image: a Library picture, caption: the line under it in plain text – schema 2.34, an older app shows the picture without it –, media: a link's http(s) URL).",
      categories: ENTRY_CATEGORIES,
    },
    entryText: {
      description:
        "An entry's body (content schema 2.23) is Markdown with the book's variables, rendered alike by the reader and the editor's preview. Markdown, only this much: a blank line starts a paragraph, a single line break stays one, *emphasis* or _emphasis_, **strong** or __strong__, [link text](https://…) (http, https and mailto – any other link stays text), a backslash escapes (\\* is a star). No headings, lists, images, code or HTML – HTML shows as text. " +
        "Variables (the syntax of SCUTOONS' message boxes, ink's inline syntax): {hasKey} prints a variable – a bare camelCase name of the behaviour variables and the plugins' api.vars, read from the innermost scope that has it (spread, stage, session, book); {tries > 2: Try the window.} and {hasKey: The door opens.|It is locked.} choose a text; expressions have numbers, \"texts\", true / false, and or not, == != < <= > >=, + - * / mod and parentheses. A variable that is not set shows as nothing and is false – so {name: {name}|friend} is a fallback. \\{ \\} \\| write the characters. No lists ({a|b}) and no functions: they render nothing and update_entry refuses them. An older reader shows the source as written.",
      example: "Hello {name: **{name}**|stranger}.\n\n{hasKey: The door opens.|The door is *locked*.} See [the map](https://example.org/map).",
    },
    book: {
      description: "BookData: { id, title, author, publisher?, passes?, environment?, sourceOfTruth? }. update_book changes title, author and publisher – the reader's splash and home page show them – and sourceOfTruth: print (print first, the default: the spreads come from the printed book's layout) or digital (digital first: the editor is the truth). Scenes are added, moved and removed in both (#307).",
      sourcesOfTruth: SOURCES_OF_TRUTH,
    },
    onboarding: {
      description: "The onboarding (the splash and the steps before the scan) is the reader app's own UI, translated with the app – no book content and no tool edits it. The splash shows the book's title, author and publisher (update_book).",
    },
    spread: {
      description:
        "SpreadData: { id, title, firstPage, lastPage, format?, matter?, passes? }. matter (front | back, content schema 2.32) marks a double page without printed numbers – front matter between the cover and page 1 (internal pages counting down to −1), back matter between the last printed page and the back cover; a print-first book gets them from its layout through an import, or from add_matter (the missing front and back matter, the last printed page's spread and the back cover moved after them – a print-first book too, plan first, then apply). add_spread adds a double page, the front cover or the back cover; delete_spread removes one with everything on it (two steps: the impact, then the confirmation); put_spread changes title, format and passes. " +
        "Scenes (content schema 2.35, #307 – a spread is a scene, the type also named SceneData): optional surfaces: [{ id, side (left | middle | right | front | back | wall), widthMm, heightMm, label? }] – its physical areas, label written exactly as printed (\"41\", \"ii\", \"Cover\"), free text, never arithmetic; layout (fixed | free – side by side as printed, or each surface on its own anchor; none = fixed); group (the id of one of the book's groups: [{ id, label }] at the configuration's root); label (what the reader's switcher and credits show for the scene, else its surfaces' labels, else its pages or title). An older app ignores all of it. " +
        "The order is the scenes' position – nothing renumbers (#307 phase 2): list_scenes reads them, add_scene adds one anywhere from a preset (" + SCENE_PRESETS.join(", ") + "), move_scenes moves one or several (or into / out of a group), put_scene edits surfaces, label, layout and group, delete_scene removes one; group_scenes / rename_group / ungroup handle groups; migrate_scenes gives a book's spreads their surfaces, labels and groups from their pages. An entry names its scene and surface (add_entry / update_entry scene, surface). " +
        "firstPage / lastPage stay for apps before schema 2.35: the API writes a scene's stored range while the order allows, else one derived from the order, and every entry's page inside its scene's – those apps then show those numbers as pages.",
      presets: SCENE_PRESETS,
      formats: SPREAD_FORMATS,
      matters: MATTERS,
      surfaceSides: SURFACE_SIDES,
      layouts: SCENE_LAYOUTS,
    },
    plugin: {
      description:
        "A plugin source (the Code tab) exports register(api): api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.registerNodeType(type, spec, build) for a node type of its own, api.registerMaterial(type, spec, build) for a whole material (a ShaderMaterial …, plugin API 1.4), api.registerTexture(type, spec, draw) for a procedural texture, api.feedback({ width, height, fragment }) for a GPU feedback buffer the engine steps every frame and api.shadertoy(source) for a Shadertoy pass as its fragment (plugin API 1.6, in a build – nothing of it is recorded), api.three for three.js – never import three. The spec's params have kind (number | color | choice | boolean | string | texture | model), default, description and an optional label (the few words the editor's row shows, plugin API 1.3); nodeTypes narrows the node types. A parameter of kind model (plugin API 1.7, content schema 2.28) takes a model file – an uploaded glb / gltf asset's url or a /assets/content/… path, \"\" = none – which the plugin's code loads with api.loadModel(value). Read the resource osct://guides/plugins.",
      idPattern: PLUGIN_ID_PATTERN.source,
    },
  };
}
