// The content model an agent may write, from the shared content contract (`shared/`): node types, placement, filters,
// components (built in, and what an experience's plugins register), post-processing, the looks an entity appears with, the
// environment, scenes and surfaces (content schema 3.0), a target's place, entry categories – and the contract's own guard run over one entity before it is sent, so a wrong
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
  MEDIA_LEVELS,
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
  SURFACE_PLACE_KEYS,
  type PluginData,
} from "../../shared/types/game-config";
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_WORLDS, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS } from "../../shared/types/environment";
import { SCENE_PAGE_MM, SCENE_PRESETS, SCENE_SURFACES_MAX, SCENE_WALL_MM, SURFACE_REFERENCE_FITS } from "../../shared/api/editor";
import { ENTRY_CATEGORIES } from "../../shared/types/entry";
import type { SourceTypes } from "../../shared/api/rules";
import { VARIABLE_TYPES } from "../../shared/types/variables";
import { IMAGE_MAX_PIXELS, IMAGE_MAX_SIDE, IMAGE_WEBP_QUALITY } from "../../shared/api/images";

export interface ExperienceModel {
  /** the compiled plugins the experience's configuration declares, with what they recorded */
  declared: readonly PluginData[];
  /** the Code tab's sources with the types read from them */
  sources: ({ id: string } & SourceTypes)[];
}

/** What an experience's plugins are known to register */
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
  /** looks an entity appears with (`registerAppearance`, a `experience.appearance` moment), the same way */
  appearances: string[];
  /**
   * every plugin's registrations are known: each declared plugin recorded them and the experience has no Code tab
   * source (a source's types are read from its text, which may miss one) – a type outside the lists is then a typo
   */
  complete: boolean;
}

/** The plugins' types of an experience: the declared plugins' recorded specs and the types read from the Code tab's sources */
export function knownPluginTypes(experience: ExperienceModel): KnownPluginTypes {
  const recorded = experience.declared.map(plugin => plugin.registered ?? {});
  const unique = (types: string[]) => [...new Set(types)];
  return {
    components: unique([...recorded.flatMap(r => Object.keys(r.components ?? {})), ...experience.sources.flatMap(s => [...s.components, ...s.layers])]),
    nodeTypes: unique([...recorded.flatMap(r => Object.keys(r.nodeTypes ?? {})), ...experience.sources.flatMap(s => s.nodeTypes)]),
    materials: unique([...recorded.flatMap(r => Object.keys(r.materials ?? {})), ...experience.sources.flatMap(s => s.materials)]),
    textures: unique([...recorded.flatMap(r => Object.keys(r.textures ?? {})), ...experience.sources.flatMap(s => s.textures)]),
    passes: unique([...recorded.flatMap(r => Object.keys(r.passes ?? {})), ...experience.sources.flatMap(s => s.passes)]),
    appearances: unique([...recorded.flatMap(r => Object.keys(r.appearances ?? {})), ...experience.sources.flatMap(s => s.appearances)]),
    complete: experience.declared.every(plugin => plugin.registered) && experience.sources.length === 0,
  };
}

/** A passes list names a type that is not built in – only then the experience's plugins matter */
export function usesPluginPasses(passes: unknown): boolean {
  return Array.isArray(passes) && passes.some(pass => typeof pass?.type === "string" && !(PASS_TYPES as readonly string[]).includes(pass.type));
}

/**
 * The contract's check of a `passes` list (a plugin's pass too): a pass the declared plugins recorded is
 * checked against its spec like a built-in one; one a Code tab source registers (read from its text, no spec) passes,
 * listed as unverified; any other is refused – unless a declared plugin recorded nothing (what it registers is unknown
 * until it runs): then it passes, unverified, too. The publish refuses a pass no compiled plugin provides.
 */
export function checkPasses(passes: unknown, path: string, experience?: ExperienceModel): { problems: string[]; unverified: string[] } {
  const specs = new Map<string, PassSpec>(
    (experience?.declared ?? []).flatMap(plugin => Object.entries(plugin.registered?.passes ?? {})),
  );
  const fromSources = new Set((experience?.sources ?? []).flatMap(source => source.passes));
  const unrecorded = (experience?.declared ?? []).some(plugin => !plugin.registered);
  const known = experience ? knownPluginTypes(experience).passes : [];
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

/** An experience's `appearance` names a look that is not built in – only then the experience's plugins matter */
export function usesPluginAppearances(appearance: unknown): boolean {
  if (typeof appearance !== "object" || appearance === null) return false;
  return Object.values(appearance).some(look => typeof look?.type === "string" && !(APPEARANCE_TYPES as readonly string[]).includes(look.type));
}

/**
 * The contract's check of an experience's `appearance` (a plugin's look too), as `checkPasses`: a look the declared plugins
 * recorded is checked against its spec like a built-in one; one a Code tab source registers (read from its text, no
 * spec) passes, listed as unverified; any other is refused – unless a declared plugin recorded nothing. The publish
 * refuses a look no compiled plugin provides.
 */
export function checkAppearance(appearance: unknown, path: string, experience?: ExperienceModel): { problems: string[]; unverified: string[] } {
  const specs = new Map<string, AppearanceSpec>(
    (experience?.declared ?? []).flatMap(plugin => Object.entries(plugin.registered?.appearances ?? {})),
  );
  const fromSources = new Set((experience?.sources ?? []).flatMap(source => source.appearances));
  const unrecorded = (experience?.declared ?? []).some(plugin => !plugin.registered);
  const known = experience ? knownPluginTypes(experience).appearances : [];
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
  /** component types neither built in nor known from the experience's plugins – a plugin must provide them; the publish checks */
  unknownComponents: string[];
  /** node types named like a plugin's that no known plugin registers – passed because a plugin of the experience is unknown */
  unverifiedNodeTypes: string[];
  /** material types no known plugin registers – a plugin must provide them; the publish checks */
  unknownMaterials: string[];
}

/**
 * Runs the content contract's guard over one entity (as `entities.entity` of a minimal configuration), so placement,
 * filters, components, text colours, assets and the node depth are checked exactly as the content build and the app
 * check them; `path` names the entity in the problems. With `experience`, its declared plugins go into the configuration: the
 * guard checks a recorded plugin component's or node type's parameters like a built-in one's. Component types nobody
 * knows pass here (a plugin may provide them – the publish checks) and are listed; node types follow `unknownNodeTypes`.
 */
export function checkEntity(entity: unknown, path = "entity", experience?: ExperienceModel): EntityCheck {
  const declared = experience?.declared ?? [];
  const probe = {
    version: { version: "0.0.0", timestamp: "probe", schema: CONTENT_SCHEMA_VERSION },
    experience: { id: "probe", title: "probe" },
    initialScene: "probe",
    scenes: [{ id: "probe", label: "probe", surfaces: [{ id: "surface", widthMm: 460, heightMm: 320, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] }],
    entries: [],
    entities: { entity },
    ...(declared.length ? { plugins: declared } : {}),
  };
  let problems: string[] = [];
  try {
    assertGameConfiguration(probe, { unknownComponentTypes: "allow" });
  } catch (error) {
    if (!(error instanceof GameConfigurationError)) throw error;
    // The probe has no scenes of the experience: whether a goto's scene exists is the draft's guard's to say (content schema 5.0)
    problems = error.problems.filter(problem => !/\.goto: unknown scene "/.test(problem)).map(problem => problem.replace(/^entities\.entity/, path));
  }
  const known = experience ? knownPluginTypes(experience) : undefined;
  const nodes = unknownNodeTypes(entity, path, known);
  // A type the guard refused already (with the experience's recorded plugins) is named once
  const refused = new Set(problems.map(problem => problem.split(":")[0]));
  const typeProblems = nodes.problems.filter(problem => !refused.has(problem.split(":")[0]));
  const materials = unknownMaterialTypes(entity, known);
  // A material no plugin of the experience can register (every plugin known, or none): refused as the API refuses it
  const materialProblems = known?.complete
    ? materials.map(type => `material "${type}" is not registered by a plugin of the experience${known?.materials.length ? ` (${known.materials.join(", ")})` : ""}`)
    : [];
  return {
    problems: [...problems, ...typeProblems, ...materialProblems],
    unknownComponents: unknownComponentTypes(entity, known),
    unverifiedNodeTypes: nodes.unverified,
    unknownMaterials: materialProblems.length ? [] : materials,
  };
}

/** Every material type in the tree that the experience's known plugins do not register */
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
 * an older app), but an agent writing content gets it refused here, as the API refuses it – unless a plugin of the experience
 * registers it (`known.nodeTypes`), or a plugin of the experience is unknown (`known.complete` false) and it is named like a
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
        const plugins = known?.nodeTypes.length ? `, or a node type of the experience's plugins (${known.nodeTypes.join(", ")})` : "";
        result.problems.push(`${at}.type: "${String(type)}" is not one of ${ENTITY_TYPES.join(", ")}${plugins}`);
      }
    }
    if (Array.isArray(children)) children.forEach((child, i) => walk(child, `${at}.children[${i}]`));
  };
  walk(entity, path);
  return result;
}

/** Every component type in the tree neither the shared registry (built-in: `COMPONENTS`) nor the experience's plugins know */
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

/** The tree names a node type or a component type that is not built in – only then the experience's plugins matter */
export function usesPluginTypes(entity: unknown): boolean {
  if (typeof entity !== "object" || entity === null) return false;
  const { type, components, children, material } = entity as { type?: unknown; components?: unknown; children?: unknown; material?: unknown };
  if (typeof type === "string" && !(ENTITY_TYPES as readonly string[]).includes(type)) return true;
  if (material !== undefined) return true;
  if (Array.isArray(components) && components.some(c => typeof c?.type === "string" && !componentTypes().includes(c.type))) return true;
  return Array.isArray(children) && children.some(usesPluginTypes);
}

/** The recorded specs of a kind, type → the spec with the plugin that registers it */
const recordedSpecs = (experience: ExperienceModel, kind: "components" | "nodeTypes" | "passes" | "materials" | "textures" | "appearances") =>
  Object.fromEntries(experience.declared.flatMap(plugin => Object.entries(plugin.registered?.[kind] ?? {}).map(([type, spec]) => [type, { plugin: plugin.id, ...spec }])));

/** The static model (the contract) and, with an experience, what its plugins add */
export function describeContentModel(experience?: ExperienceModel): Record<string, unknown> {
  const known = experience ? knownPluginTypes(experience) : undefined;
  return {
    contentSchema: CONTENT_SCHEMA_VERSION,
    pluginApi: PLUGIN_API_VERSION,
    logic: {
      description:
        "A scene's and the experience's rules (content schema 5.0): logic = { rules: [{ on, when?, do }], canvas? } on a scene (live while the scene is open – put_scene logic) and on the experience (live for the whole session, across scene switches – the editor's Logic view, PUT /editor/experiences/{id}/logic). " +
        "The rules are the behaviour's grammar (components.behaviour) with three differences: on hears the bus only – a scene event or a core event (coreEvents), never a node's own found / lost / tap / unlocked (use targetFound / targetTapped); show / hide / pause / stop and play's node name a node by address target:<targetId>/<node name> (target:<targetId> alone = the entity's root; a scene's rules only its own targets); no shorthand strings. " +
        "goto: scene:<id> works in every rule (a node's too): the reader opens that scene. sceneChanged reaches a scene's and the experience's rules once the new scene's nodes are built. " +
        "canvas = the editor's Logic view's own data – { groups?: [{ id, label, members: [node ids] }], notes?: [{ id, text, x, y }], folds?: [node ids], exposed?: { <box id>: [port ids] } (schema 5.1: the ports shown on a box beyond its wired ones), positions?: { <box id>: { x, y } } (schema 5.2: boxes pinned over the layout); a group may carry colour (#rrggbb) and folded (schema 5.2) } – stored and exported, never published to readers; leave it to the editor.",
      addresses: { goto: "scene:<sceneId>", node: "target:<targetId>/<node name>" },
      variables:
        "Typed variables (content schema 5.0): experience.variables = { name: { type, scope?, default? } } (PUT /editor/experiences/{id}/variables) – type number | integer | boolean | string; a variable not declared takes the type of its first set. A set of another type, a comparison of different types and a when that is not true / false are problems; && || ! need true / false, - * / % < > need numbers, + adds numbers or joins texts (never both); an integer goes where a number is wanted, nothing else converts. The reader refuses a value of the wrong type (also a plugin's api.vars.set) and keeps the old one; a declared variable not set reads as its default.",
      variableTypes: VARIABLE_TYPES,
      coreEvents: BEHAVIOUR_CORE_EVENTS,
      example: {
        rules: [
          { on: "doorOpened", when: "hasKey", do: [{ show: "target:door/hint" }, { play: "creak", node: "target:door" }] },
          { on: "targetUnlocked", when: "unlocks >= 3", do: [{ set: { chapterDone: true, unlocks: "unlocks + 1" }, scope: "experience" }, { goto: "scene:epilogue" }] },
        ],
      },
    },
    entity: {
      description:
        "An AR entity is a tree of nodes (EntityData): { id?, name?, type, assets, params?, filters?, components?, material?, children?, text?, color? }. " +
        "The root sits on the target (1 unit = the target image's width, origin in its centre); every node's params place it relative to its parent. " +
        `At most ${MAX_NODE_DEPTH} levels. Shared entities live under a ref and are used by targets as { ref }.`,
      name: "name (content schema 2.12, optional): what the editor's tree shows instead of the type – give the nodes of a larger tree names (\"door\", \"hint\") so the person finds them; the reader ignores it.",
      nodeTypes: ENTITY_TYPES,
      assets: {
        description: "The node's own files: [{ id, assetType, src, textures?, levels? }] – empty for group and text. src is an absolute URL (an uploaded asset's url) or a /assets/content/… path of the imported content.",
        assetTypes: ASSET_TYPES,
        textures: `textures (content schema 2.27, optional, a model file only): the model's colour map in several sizes – [{ material?, sizes: [{ size, src }] }], size one of ${TEXTURE_SIZES.join(", ")} (px, a square picture), each once, smallest first. The model file carries the smallest map and shows with it at once; the reader's texture quality chooses the size that is loaded, so the mesh loads once. material = the glTF material whose map the set is; none = every material of the model (a model baked into one map). Upload each size as an image (upload_asset tells its width) and put its url into src.`,
        levels: `levels (content schema 4.3, #331, optional, an image, video or audio file only): the medium in several qualities – [{ level, src }], each level once, smallest first; level = an image's longest side (${MEDIA_LEVELS.image.join(" / ")} px), a video's height (${MEDIA_LEVELS.video.join(" / ")}), a sound's bitrate (${MEDIA_LEVELS.audio.join(" / ")} kbps). The reader's media quality (Info → Settings: auto / low / medium / high) chooses the level it loads, falling back to the nearest; src stays the file an older reader loads – put the middle level there. Video levels are made before the upload (the editor never encodes video); upload each level (upload_asset) and put its url into src. Set them with put_entity / put_target (the node's assets).`,
      },
      text: "text nodes: `text` (the line; {{entry.title}} and {{experience.title}} are replaced) and `color` (#rrggbb, default white).",
      pluginNodeTypes: {
        description:
          "A plugin's node type (content schema 2.13, api.registerNodeType): written as `type: <its name>`, its parameters in params next to the placement; " +
          `src only when its spec says which file (${NODE_SRC_KINDS.join(" | ")}). The API refuses a type no plugin of the experience registers when the plugins recorded what they register (schema 2.14).`,
        ...(experience ? { recorded: recordedSpecs(experience, "nodeTypes"), known: known!.nodeTypes } : {}),
      },
    },
    placement: {
      description:
        "entity.params: position [x, y, z] in target widths (x → right, y → the top of the target image, z → out of the surface), rotation [x, y, z] in degrees (Euler XYZ), scale as one number or [x, y, z]. Missing values take the type's defaults.",
      params: PLACEMENT_PARAMS,
      defaults: PLACEMENT_DEFAULTS,
    },
    filters: { description: "entity.filters (video nodes only): [{ type, …params }], applied in order.", types: FILTERS },
    subtitles: {
      description:
        "A video's subtitles (content schema 2.31): no field of a node. Upload a WebVTT file named <video name>.<language>.vtt with upload_asset – speak.en.vtt, speak.fr.vtt for speak.mp4 – and it belongs to every video of that name in the experience, uploaded or imported; the draft's configuration lists the files per video in `subtitles`. One file per language (en, de, fr, nl, pt-BR …), each cue `00:00:01.000 --> 00:00:03.500` and its text below, the times the video's own. The reader shows the line of its language while the video plays (else English, else the first), the editor's stage the English one.",
    },
    credits: {
      description:
        "Picture credits (content schema 2.33, #292): no field of an entry or a node. A file's credit line (one free text line – \"Book Golem by TER-JAN / DeviantArt\") is set in the Library with set_asset_credits and listed by list_assets; the experience's configuration carries the lines of the files it uses (credits: { <file URL>: <line> }), and the reader lists them per scene on its image credits page (Info → here).",
    },
    images: {
      description:
        `The image rule (#298): every picture takes the same way into the experience. An uploaded jpg / png / webp is stored as WebP (quality ${IMAGE_WEBP_QUALITY}; lossless when it has transparency – an icon, a cut-out), turned upright by its EXIF orientation, its metadata dropped, never scaled up, its longest side at most ${IMAGE_MAX_SIDE.reference} px for a surface's reference image and an entry's colour picture, ${IMAGE_MAX_SIDE.target} px for a target's printed image and ${IMAGE_MAX_SIDE.default} px for every other Library picture; a picture above ${IMAGE_MAX_PIXELS / 1_000_000} MP is refused (413 image-too-large). The upload does not know the use: upload_asset takes fit: "target" for a target's printed image and fit: "reference" (with scene and surface) for a surface's reference image. The stored file is named <name>.webp. TIFF and PDF are no Library files – convert them locally first (Pillow / PyMuPDF), then upload.`,
    },
    components: {
      description: "entity.components: [{ type, …params }] – the built-in types, and the components and material layers a plugin registers (used the same way).",
      builtIn: COMPONENTS,
      typePattern: COMPONENT_TYPE_PATTERN.source,
      moments: {
        description:
          "An entity's own look for a moment (content schema 2.30): the built-in components reveal (the first find of a target), found (every later find) and lost (the target is lost) on a node of the entity – any node – { type: reveal, look: printLift, duration: 900 }. " +
          "look = a look's type – a built-in one (appearance.builtIn) or one a plugin of the experience registers (api.registerAppearance, appearance.plugins) – and \"\" or no look = the experience's; the other keys are the look's parameters (appearance.builtIn[look].params), only the values that differ from its defaults. " +
          "Changing the look means writing the component anew with its parameters. They win over the experience's appearance: the root node's moment, else its found (for reveal and lost), else the experience's moment, the experience's found, the default. A node with a look of its own animates its subtree apart from the rest, with that look (a child's moment: its own, else its found, else it is part of its parent's); the root plays the experience's look where it names none.",
        types: MOMENTS,
        example: [{ type: "reveal", look: "printLift", duration: 900 }, { type: "lost", look: "fade", outDuration: 250 }],
      },
      behaviour: {
        description:
          "The built-in behaviour (content schema 2.19, any node type): rules without code – { type: behaviour, rules: [{ on, when?, do }] }. The same grammar holds a scene's and the experience's rules (logic, content schema 5.0). " +
          "on = the node's own event or any other camelCase name, an event of the stage's bus (a scene event a plugin or a behaviour emits, or a core event). " +
          "when = an expression (content schema 5.0 – the object form { variable: value } is gone): the language of the entries' {…} texts without braces – camelCase variable names, numbers, \"texts\", true / false, and or not && || !, == != < <= > >=, + - * / mod, parentheses – e.g. hasKey && tries > 2, mood == \"calm\" || !doorOpen. The rule runs when the value is true (0, \"\", false and a variable that is not set are false); no functions, no dotted names. " +
          "do = one action or a list, run in order: play: <clip> (\"\" = the node's own clip – its animation component's, else the first) with optional node: <name>; " +
          "pause / stop / show / hide: <node name> (\"\" = the behaviour's own node; a node of its subtree by its name); set: { variable: value } with optional scope (the variable's declared scope, else scene; stage, session, or experience – the whole experience; null deletes) – a value is an expression (content schema 5.0): tries + 1, hasKey, \"calm\" (a text is the language's text literal, in YAML '\"calm\"'; a number or true / false may stand bare); " +
          "emit: <event> (a scene event, never a core event); goto: scene:<id> (content schema 5.0) – the reader opens that scene, as a link to /scene/<id>. A string runs a verb on the own node: play, pause, stop, show, hide. " +
          "On one event every rule's condition is read first, then the matching rules run in their order. Variables are read like a plugin's api.vars.get (the innermost scope that has it).",
        nodeEvents: BEHAVIOUR_NODE_EVENTS,
        coreEvents: BEHAVIOUR_CORE_EVENTS,
        actions: BEHAVIOUR_ACTIONS,
        scopes: BEHAVIOUR_SCOPES,
        example: {
          type: "behaviour",
          rules: [
            { on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "experience" }, { emit: "keyRattled" }] },
            { on: "found", when: "hasKey && tries > 2", do: [{ hide: "hint" }, { emit: "openDoor" }] },
            { on: "tap", when: "doorOpen", do: { goto: "scene:epilogue" } },
          ],
        },
      },
      ...(experience
        ? {
            plugins: recordedSpecs(experience, "components"),
            declaredPlugins: experience.declared.map(({ id, src, api, registered }) => ({ id, src, api, recorded: !!registered })),
            codeTabSources: experience.sources,
            note:
              "plugins = the specs the declared plugins recorded (schema 2.14): their parameters are checked like a built-in component's. A declared plugin without recorded specs (an older build) registers its types when the reader loads it. A Code tab source runs on the editor's stage only (its types are read from its text); a publish whose nodes use a type no declared plugin provides is refused (409 unknown-components, unknown-node-types).",
          }
        : {}),
    },
    materials: {
      description:
        "entity.material (content schema 2.17, plugin API 1.4): { type, params? } – a material a plugin registers (api.registerMaterial) replaces the material of the node's meshes (a model, an image or video plane, a plugin node); its layers still add on top. Every material is a plugin's: the API refuses one no plugin of the experience registers when the plugins recorded what they register, the publish refuses one no compiled plugin provides (409 unknown-materials).",
      textures:
        "A parameter of kind texture takes \"\" (none), a procedural texture's type (api.registerTexture – e.g. \"caustics\"), { type, …parameters } for one with other values, or a file: an uploaded image or video asset's url, or a /assets/content/… path.",
      typePattern: MATERIAL_TYPE_PATTERN.source,
      ...(experience ? { plugins: recordedSpecs(experience, "materials"), proceduralTextures: recordedSpecs(experience, "textures"), known: known!.materials } : {}),
    },
    passes: {
      description:
        "Post-processing over the whole rendered AR image: [{ type, enabled?, …params }], run in order. The experience's passes (put_experience_passes) are the master every scene shows; a scene's own (put_scene passes) replace them for that scene, [] turns them off there, null gives the scene the experience's again. " +
        "enabled: false (content schema 2.22) switches one pass off – it keeps its place and values, the chain skips it, it does not count towards the phone budget; leave enabled out for a pass that runs. A 2.21 reader ignores it and runs the pass. " +
        "The built-in types, and (content schema 2.21) a pass a plugin of the experience registers (api.registerPass) – written the same way, its parameters checked against the recorded spec. A pass no compiled plugin provides is refused by the publish (409 unknown-passes); a 2.20 reader refuses an experience that names one. Up to three passes and one bloom per list fit the phone budget.",
      builtIn: PASSES,
      ...(experience ? { plugins: recordedSpecs(experience, "passes"), known: known!.passes } : {}),
    },
    appearance: {
      description:
        "How an AR entity appears and disappears (content schema 2.29, put_experience_appearance): experience.appearance { reveal?, found?, lost? }, each a look { type, …params } like a pass – reveal = the first find of a target (the entry is unlocked with it), found = every later find, lost = the target is lost (its look plays rewound, in the look's outDuration). " +
        `A moment without a look takes found's, and without that ${DEFAULT_APPEARANCE_TYPE}; an experience without appearance plays ${DEFAULT_APPEARANCE_TYPE} everywhere. ` +
        "The built-in looks share one set of parameters and differ in their defaults (builtIn: each look's params with its defaults); write only the values that differ. A look a plugin of the experience registers (api.registerAppearance, plugin API 1.8) is named the same way, its parameters checked against the recorded spec; the publish refuses a look no compiled plugin provides (409 unknown-appearances). An app before 2.29 ignores the field and plays its own animation.",
      moments: MOMENTS,
      default: DEFAULT_APPEARANCE_TYPE,
      builtIn: APPEARANCES,
      ...(experience ? { plugins: recordedSpecs(experience, "appearances"), known: known!.appearances } : {}),
    },
    environment: {
      description:
        "The experience's world around the reader while scanning and the onion sky (put_environment): { world, onionSky, worldSrc?, skySrc? } – worldSrc a glTF model (origin = the floor under the reader, +y up, −z towards the book), skySrc an equirectangular image (2:1): an uploaded asset's url or a /assets/content/… path. null = the default.",
      worlds: ENVIRONMENT_WORLDS,
      default: DEFAULT_ENVIRONMENT,
      worldSrcExtensions: WORLD_MODEL_EXTENSIONS,
      skySrcExtensions: SKY_IMAGE_EXTENSIONS,
    },
    target: {
      description:
        "TargetData: { id, imageSrc, entity?: EntityData | { ref }, place?, enabled?, recognition?, recognitionOff? }. imageSrc = the printed image (an uploaded image asset's url). enabled: false switches the target off – the reader leaves it and its entry out until it is switched on, the editor keeps both; leave it out for a target in the experience. recognition (content schema 4.1) = the image tracker's grey frame made ahead from imageSrc by `osct targets prepare` or the editor – not written here; the API drops it when imageSrc changes. The reader uses it only when the experience's recognition is \"prepared\" and the target has no recognitionOff: true (content schema 4.2, put_target recognitionOff).",
      place: {
        description:
          "Where the target lies (TargetPlace, content schema 3.0): { surface?, x, y, width, height? } – its box in mm from the top left corner of a surface of its entry's scene; surface = the surface's id, required when the scene has several. The editor's stage lays the target there; the reader does not need it. put_target place, add_entry target.place; null removes it.",
        example: { surface: "surface", x: 40, y: 60, width: 80 },
      },
    },
    entry: {
      description:
        "An entry is top level: { id, category, title, scene, surface?, body, author?, image?, imageLevels?, caption?, media?, tags, target? } – scene = the id of its scene (required: where the reader finds it), surface = one of that scene's surfaces (only when the scene has several). add_entry makes one, with its target or without (read only in the list); get_entries reads every field; update_entry changes them (scene moves it, surface null takes it off a surface; image: a Library picture, imageLevels (content schema 4.3): the same picture at 512 / 1024 / 2048 px longest side – [{ level, src }], the reader's media quality chooses one; caption: the line under it in plain text, media: a link's http(s) URL).",
      categories: ENTRY_CATEGORIES,
    },
    entryText: {
      description:
        "An entry's body (content schema 2.23) is Markdown with the experience's variables, rendered alike by the reader and the editor's preview. Markdown, only this much: a blank line starts a paragraph, a single line break stays one, *emphasis* or _emphasis_, **strong** or __strong__, [link text](https://…) (http, https and mailto – any other link stays text), a backslash escapes (\\* is a star). No headings, lists, images, code or HTML – HTML shows as text. " +
        "Variables (the syntax of SCUTOONS' message boxes, ink's inline syntax): {hasKey} prints a variable – a bare camelCase name of the behaviour variables and the plugins' api.vars, read from the innermost scope that has it (scene, stage, session, experience); {tries > 2: Try the window.} and {hasKey: The door opens.|It is locked.} choose a text; expressions have numbers, \"texts\", true / false, and or not, == != < <= > >=, + - * / mod and parentheses. A variable that is not set shows as nothing and is false – so {name: {name}|friend} is a fallback. \\{ \\} \\| write the characters. No lists ({a|b}) and no functions: they render nothing and update_entry refuses them. An older reader shows the source as written.",
      example: "Hello {name: **{name}**|stranger}.\n\n{hasKey: The door opens.|The door is *locked*.} See [the map](https://example.org/map).",
    },
    experience: {
      description: "ExperienceData: { id, title, passes?, environment?, appearance?, book?, recognition? } – the experience, the top level of the content (content schema 4.0). book = BookData { author, publisher? }: the printed book it accompanies, print data only; none = not a book (a wall, a room, an exhibition). update_experience changes the title (the reader's splash, home page and account show it) and the printed book – its author and publisher (the splash shows them), book: null removes it. recognition (content schema 4.2): \"original\" (none = the default: the reader makes every target's recognition data from its printed image) or \"prepared\" (a target's frame made ahead where it has one) – update_experience recognition. Every experience adds, moves and removes its scenes in the editor.",
    },
    onboarding: {
      description: "The onboarding (the splash and the steps before the scan) is the reader app's own UI, translated with the app – no experience content and no tool edits it. The splash shows the experience's title and its printed book's author and publisher (update_experience).",
    },
    scene: {
      description:
        "Content schema 3.0: the configuration holds scenes (in order – their position is the experience's order, nothing numbers them), initialScene (the scene the reader starts on – it cannot be removed) and groups ([{ id, label }]). " +
        "SceneData: { id, label, group?, surfaces, passes? } – id stable and invisible (links /scene/<id>, progress, entries name it); label = what the reader's switcher and lists show (186–187, Cover, Studio wall), free text; group = the id of one of the experience's groups (one stop of the reader's bottom switcher); passes = the scene's own post-processing. " +
        "SurfaceData: { id, label?, widthMm, heightMm, place } – one physical area of the scene: a double page is one surface (twice the page's width), a cover one, a wall or a poster one; surfaces are free areas next to each other – no left / right, no front / back; label = what is printed on it, free text. " +
        "place: { x, y, z, rx, ry, rz } – the surface's centre in the scene's one coordinate system: mm, the origin on the table at the middle of the scene's first row of surfaces (a double page: its spine), +x right, +y up, +z towards the reader; rx, ry, rz in degrees (Euler XYZ). Unrotated a surface lies flat, face up, its top edge away from the reader – a page on the table; a wall ahead stands up: rx 90. " +
        "Tools: list_scenes reads them (with each surface's editor-only reference image), get_scene one with its entries, add_scene adds one anywhere from a preset, put_scene changes label, group, surfaces (the whole list – a surface without a place is laid in a row) and passes, put_surface changes, adds, moves or removes one surface alone, move_scenes moves one or several (or into / out of a group), delete_scene removes one with everything on it (two steps); group_scenes / rename_group / ungroup handle groups; set_surface_reference sets a surface's reference image (never content).",
      presets: SCENE_PRESETS,
      presetSizes: {
        double: { widthMm: SCENE_PAGE_MM.width * 2, heightMm: SCENE_PAGE_MM.height },
        single: { widthMm: SCENE_PAGE_MM.width, heightMm: SCENE_PAGE_MM.height },
        wall: { widthMm: SCENE_WALL_MM.width, heightMm: SCENE_WALL_MM.height, rx: 90 },
      },
      placeKeys: SURFACE_PLACE_KEYS,
      surfacesMax: SCENE_SURFACES_MAX,
      referenceFits: SURFACE_REFERENCE_FITS,
      example: { id: "s186-187", label: "186–187", surfaces: [{ id: "surface", label: "186–187", widthMm: 460, heightMm: 320, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] },
    },
    plugin: {
      description:
        "A plugin source (the Code tab) exports register(api): api.registerLayer(type, spec, { glsl }) for a material layer, api.registerComponent(type, spec, apply) for code on a node, api.registerNodeType(type, spec, build) for a node type of its own, api.registerMaterial(type, spec, build) for a whole material (a ShaderMaterial …, plugin API 1.4), api.registerTexture(type, spec, draw) for a procedural texture, api.feedback({ width, height, fragment }) for a GPU feedback buffer the engine steps every frame and api.shadertoy(source) for a Shadertoy pass as its fragment (plugin API 1.6, in a build – nothing of it is recorded), api.three for three.js – never import three. The spec's params have kind (number | color | choice | boolean | string | texture | model), default, description and an optional label (the few words the editor's row shows, plugin API 1.3); nodeTypes narrows the node types. A parameter of kind model (plugin API 1.7, content schema 2.28) takes a model file – an uploaded glb / gltf asset's url or a /assets/content/… path, \"\" = none – which the plugin's code loads with api.loadModel(value). Plugin API 3.1 (content schema 5.1): api.p builds the params (p.number({ min, max, slider? }), p.integer, p.boolean, p.string, p.choice([…]), p.color, p.texture, p.model, p.file(kind)) and the handler's params are typed from them; min / max are hard limits, slider the soft range; a spec may declare actions (rule verbs it answers: play, pause, stop, show, hide – onAction), events (scene events it emits through its context's emit) and uses ({ hears, emits, reads, sets } – the Logic view's joins). Read the resource osct://guides/plugins.",
      idPattern: PLUGIN_ID_PATTERN.source,
    },
  };
}
