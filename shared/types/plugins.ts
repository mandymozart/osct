/**
 * Plugins: the experience's own code as content (content schema 2.4, agents/research/2026-10-29-code-in-the-editor.md).
 * A plugin is a folder `plugins/<id>/` of the content source with an `index.ts` that exports `register(api)`; the
 * content build type-checks and bundles it into `plugins/<id>/plugin.js` of the build output and declares it here.
 * The engine loads every declared plugin before it builds the first scene and hands it the plugin API
 * (`engine/src/scene/plugins.ts`): registries for components and material layers, the app's three.js.
 *
 * The API is versioned apart from the content schema: `PLUGIN_API_VERSION` MAJOR.MINOR – a plugin built against
 * another MAJOR is not loaded (logged); MINOR adds. 1.1 added `api.events`, `api.vars`, `api.progress`, `api.scene`,
 * the component context's `children` and the hook `onUnlocked`; 1.2 `api.registerNodeType` (a node type of the
 * plugin's own, `./node-types.ts`); 1.3 a parameter's optional `label` (the words the editor's row shows,
 * `./components.ts` – content schema 2.15); 1.4 `api.registerMaterial` and `api.registerTexture` (a whole material, a
 * procedural texture – `./materials.ts`) and the parameter kind `texture` (content schema 2.17); 1.5 `api.loadText` (a
 * text file – a shader of the Library – by its URL, content schema 2.18); 1.6 `api.feedback` (a GPU feedback buffer the
 * engine steps every frame) and `api.shadertoy` (a Shadertoy pass as its fragment) – content schema 2.20; neither is a
 * registration (no type, no spec), so nothing of them is recorded; 1.7 `api.loadModel` (a model file by its URL) and the
 * parameter kind `model` (a Library model picked in the editor – content schema 2.28); 1.8 `api.registerAppearance` (a look an entity
 * appears with, `./appearance.ts` – content schema 2.29); **2.0** (#319, no alias): the scene names – `api.scene`
 * (was `api.spread`), the core event `sceneChanged { sceneId, previous }` (was `spreadChanged`), the variable scope `scene`
 * (was `spread`), a target's and an entry's `sceneId` (was `spreadId`), `progress.completion(sceneId?)` / `counts(sceneId?)`,
 * the AR scene's state event `arState` (was `sceneState`) – a plugin built against 1.x is not loaded until it is built again.
 * **3.0** (#320, no alias): the variable scope `experience` (was `book`) in `api.vars.get/set/all`, behaviour rules' `scope`
 * and `varChanged` – a plugin built against 2.x is not loaded until it is built again. **3.1** (content schema 5.1, #334
 * L-T6): `api.p` – typed parameter builders (`./spec-builders.ts`) that write the same parameter objects; the register
 * functions infer a handler's `params` from the spec; a spec's optional `actions`, `events` and `uses` (`SpecLogic`,
 * `./components.ts`) – a handler's `emit` for the declared events and an instance's `onAction` for the declared verbs; a
 * number parameter's `slider` (soft range) and `integer`.
 * **4.0** (content schema 6.0, #341, no alias – Tilman: "i think it is listen"): a spec's bus use names what its code
 * listens to `uses.listens` (was `uses.hears`) – a plugin built against 3.x is not loaded until it is built again.
 * **4.1** (content schema 6.3, #361): `api.registerCardLook` – how the marginalia card is picked up, in code
 * (`./card-look.ts`); recorded as `registered.cardLooks`.
 *
 * What a plugin registers is recorded by the content build (content schema 2.14, #90): it runs every plugin once with a
 * recording API and writes the specs into the plugin's `registered` – so the guard, the editor's API, the MCP server and
 * the Entity panel know a plugin's components, node types and passes with their parameters without running its code.
 * The engine ignores the field (it registers from the module). A plugin without `registered` (an older build) is
 * unknown until it runs: the guard then lets a type it may register pass.
 */

import { componentSpecProblems, declaresLogic, type ComponentSpec, type SpecLogic } from "./components";
import { nodeTypeSpecProblems, type NodeTypeSpec } from "./node-types";
import { type AppearanceSpec, isBuiltInAppearanceType } from "./appearance";
import { isBuiltInCardLookType } from "./card-look";
import { isBuiltInPassType, type PassSpec } from "./passes";
import { materialSpecProblems, textureSpecProblems, type MaterialSpec, type TextureSpec } from "./materials";
import { isObject } from "../guards/primitives";

export const PLUGIN_API_VERSION = "4.1";

/**
 * What a plugin registered, as the content build recorded it (schema 2.14); a missing kind = none of it. Since schema 5.1
 * every spec carries what it declares beyond its parameters – `actions`, `events`, `uses` (`SpecLogic`) – checked by the
 * same spec checks
 */
export interface PluginRegistrations {
  /** Its components and material layers (both are components in the content), type → spec */
  components?: Record<string, ComponentSpec>;
  /** Its node types (`registerNodeType`), type → spec */
  nodeTypes?: Record<string, NodeTypeSpec>;
  /** Its post-processing passes (`registerPass`), type → spec */
  passes?: Record<string, PassSpec>;
  /** Its materials (`registerMaterial`, API 1.4 – schema 2.17), type → spec */
  materials?: Record<string, MaterialSpec>;
  /** Its procedural textures (`registerTexture`, API 1.4 – schema 2.17), type → spec */
  textures?: Record<string, TextureSpec>;
  /** Its looks (`registerAppearance`, API 1.8 – schema 2.29), type → spec */
  appearances?: Record<string, AppearanceSpec>;
  /** Its card looks (`registerCardLook`, API 4.1 – schema 6.3), type → spec */
  cardLooks?: Record<string, AppearanceSpec>;
}

/** A plugin as the game configuration declares it */
export interface PluginData {
  /** The folder's name: letters, digits, `-` */
  id: string;
  /** The compiled module (`/assets/content/plugins/<id>/plugin.js`) */
  src: string;
  /** The plugin API it was built against (`PLUGIN_API_VERSION`) */
  api: string;
  /** What it registered, recorded by the content build (schema 2.14, optional – the engine ignores it) */
  registered?: PluginRegistrations;
}

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Problems of a configuration's `plugins` list, as "<path>: <message>" */
export const pluginProblems = (raw: unknown, path = "plugins"): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of plugins`];
  const problems: string[] = [];
  const ids = new Set<string>();
  raw.forEach((plugin, i) => {
    const at = `${path}[${i}]`;
    if (!isObject(plugin)) {
      problems.push(`${at}: expected { id, src, api }`);
      return;
    }
    const p = plugin;
    if (typeof p.id !== "string" || !PLUGIN_ID_PATTERN.test(p.id)) problems.push(`${at}.id: expected a plugin id (letters, digits, -)`);
    else if (ids.has(p.id)) problems.push(`${at}.id: duplicate plugin id "${p.id}"`);
    else ids.add(p.id);
    if (typeof p.src !== "string" || !p.src.endsWith(".js")) problems.push(`${at}.src: expected the compiled module (…/plugin.js)`);
    if (typeof p.api !== "string" || !/^\d+\.\d+$/.test(p.api)) problems.push(`${at}.api: expected the plugin API version "MAJOR.MINOR"`);
    if (p.registered !== undefined) problems.push(...registrationProblems(p.registered, `${at}.registered`));
  });
  return problems;
};

const KINDS = ["components", "nodeTypes", "passes", "materials", "textures", "appearances", "cardLooks"] as const;

/** Problems of a plugin's recorded `registered`: every spec checked as the engine checks it when the plugin registers it */
export const registrationProblems = (raw: unknown, path: string): string[] => {
  if (!isObject(raw)) return [`${path}: expected { components?, nodeTypes?, passes?, materials?, textures?, appearances?, cardLooks? }`];
  const problems: string[] = [];
  const checks: Record<(typeof KINDS)[number], (type: string, spec: unknown) => string[]> = {
    components: componentSpecProblems,
    nodeTypes: nodeTypeSpecProblems,
    // A pass's spec is a component's without nodeTypes; a pass may share a component's name, never a built-in pass's
    passes: (type, spec) => [
      ...componentSpecProblems(type, spec).filter(problem => !problem.endsWith("is a built-in component")),
      ...(isBuiltInPassType(type) ? [`"${type}" is a built-in pass`] : []),
    ],
    materials: materialSpecProblems,
    textures: textureSpecProblems,
    // A look's spec is a component's without nodeTypes, too; never a built-in look's name
    appearances: (type, spec) => [
      ...componentSpecProblems(type, spec).filter(problem => !problem.endsWith("is a built-in component")),
      ...(isBuiltInAppearanceType(type) ? [`"${type}" is a built-in look`] : []),
    ],
    // A card look's spec as a look's; never a built-in card look's name
    cardLooks: (type, spec) => [
      ...componentSpecProblems(type, spec).filter(problem => !problem.endsWith("is a built-in component")),
      ...(isBuiltInCardLookType(type) ? [`"${type}" is a built-in card look`] : []),
    ],
  };
  for (const kind of KINDS) {
    const specs = raw[kind];
    if (specs === undefined) continue;
    if (!isObject(specs)) {
      problems.push(`${path}.${kind}: expected an object of type → spec`);
      continue;
    }
    Object.entries(specs).forEach(([type, spec]) => checks[kind](type, spec).forEach(problem => problems.push(`${path}.${kind}: ${problem}`)));
  }
  return problems;
};

/** The specs a configuration's declared plugins recorded, merged (type → spec) */
export interface RecordedRegistrations {
  components: Map<string, ComponentSpec>;
  nodeTypes: Map<string, NodeTypeSpec>;
  passes: Map<string, PassSpec>;
  materials: Map<string, MaterialSpec>;
  textures: Map<string, TextureSpec>;
  appearances: Map<string, AppearanceSpec>;
  cardLooks: Map<string, AppearanceSpec>;
  /**
   * Every declared plugin recorded what it registers: a type outside the maps is registered by none of them. False when
   * one recorded nothing (an older build – what it registers is known only when it runs) or there is no list
   */
  complete: boolean;
}

/** What the declared plugins registered, from their recorded `registered`; an empty list records nothing, completely */
export const recordedRegistrations = (plugins: unknown): RecordedRegistrations => {
  const recorded = {
    components: new Map<string, unknown>(), nodeTypes: new Map<string, unknown>(), passes: new Map<string, unknown>(),
    materials: new Map<string, unknown>(), textures: new Map<string, unknown>(), appearances: new Map<string, unknown>(),
    cardLooks: new Map<string, unknown>(),
    complete: Array.isArray(plugins),
  };
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    const registered = isObject(plugin) ? plugin.registered : undefined;
    if (!isObject(registered)) {
      recorded.complete = false;
      continue;
    }
    for (const kind of KINDS) {
      const specs = registered[kind];
      if (!isObject(specs)) continue;
      Object.entries(specs).forEach(([type, spec]) => { if (isObject(spec)) recorded[kind].set(type, spec); });
    }
  }
  return recorded as RecordedRegistrations;
};

/** A plugin's bus use as its specs declare it: event names listened to and emitted, variable names read and set */
export interface DeclaredUses {
  listens: string[];
  emits: string[];
  reads: string[];
  sets: string[];
}

/**
 * What a plugin's recorded specs declare of the bus and the variables (schema 5.1): every spec's `uses`, its `events`
 * counted as emitted – sorted, each once. Null when none of its specs declares any logic (`actions`, `events`, `uses`):
 * then only its code says (the editor reads the source)
 */
export const declaredUses = (registered: PluginRegistrations | undefined): DeclaredUses | null => {
  const specs = KINDS.flatMap(kind => Object.values((registered?.[kind] ?? {}) as Record<string, SpecLogic>)).filter(isObject) as SpecLogic[];
  if (!specs.some(declaresLogic)) return null;
  const all = (pick: (spec: SpecLogic) => readonly string[] | undefined) => [...new Set(specs.flatMap(spec => [...(pick(spec) ?? [])]))].sort();
  return {
    listens: all(spec => spec.uses?.listens),
    emits: all(spec => [...(spec.uses?.emits ?? []), ...(spec.events ?? [])]),
    reads: all(spec => spec.uses?.reads),
    sets: all(spec => spec.uses?.sets),
  };
};

/** Can this engine run a plugin built against `api`? The same MAJOR (RULES #10's rule, for the API) */
export const pluginApiCompatible = (api: string): boolean => api.split(".")[0] === PLUGIN_API_VERSION.split(".")[0];

// ── A plugin's files (#352) ──────────────────────────────────────────────────────────────────────────

/**
 * A plugin is a folder of files (#352, agents/research/2026-11-23-plugin-files.md): `index.ts` – the entry, it exports
 * `register(api)` – and any TypeScript and shader files next to it. TypeScript imports its siblings (`./fluid`), a shader
 * file comes in as a string (`import WATER from "./water.frag"`). The content build, the editor's Run and Publish
 * bundle the same folder; the editor's Code tab shows each file as a tab.
 */
export interface PluginFile {
  /** `index.ts`, `fluid.ts`, `water.frag` – a name, never a path */
  name: string;
  text: string;
}

/** The entry of every plugin */
export const PLUGIN_ENTRY = "index.ts";
/** A file's kinds by extension: TypeScript (bundled) or a shader (imported as a string) */
export const PLUGIN_FILE_KINDS = { ts: "typescript", frag: "shader", vert: "shader", glsl: "shader", wgsl: "shader" } as const;
/** A file's name: letters, digits, `.`, `_`, `-`, one of the kinds' extensions – no folders */
export const PLUGIN_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}\.(ts|frag|vert|glsl|wgsl)$/;
/** One file of a plugin at most (as one source was before) */
export const PLUGIN_FILE_MAX_BYTES = 256 * 1024;
/** A plugin's files together at most */
export const PLUGIN_MAX_BYTES = 1024 * 1024;
/** Files a plugin has at most */
export const PLUGIN_MAX_FILES = 32;
/** Above this a bundle is reported (readers download it with the AR scene) – the content build's and the editor's warning */
export const PLUGIN_BUNDLE_WARN_BYTES = 256 * 1024;

/** What is wrong with a plugin's files (none: an empty list) – the API answers the same in PHP (Plugins::checkFiles) */
export const pluginFilesProblems = (files: readonly PluginFile[]): string[] => {
  const problems: string[] = [];
  if (!files.some(file => file.name === PLUGIN_ENTRY)) problems.push(`a plugin needs ${PLUGIN_ENTRY}`);
  if (files.length > PLUGIN_MAX_FILES) problems.push(`at most ${PLUGIN_MAX_FILES} files`);
  const seen = new Set<string>();
  let total = 0;
  for (const file of files) {
    if (!PLUGIN_FILE_PATTERN.test(file.name)) problems.push(`"${file.name}": a file name is letters, digits, . _ - and .ts, .frag, .vert, .glsl or .wgsl`);
    if (seen.has(file.name.toLowerCase())) problems.push(`"${file.name}" twice`);
    seen.add(file.name.toLowerCase());
    const bytes = new TextEncoder().encode(file.text).length;
    total += bytes;
    if (bytes > PLUGIN_FILE_MAX_BYTES) problems.push(`"${file.name}" is larger than ${PLUGIN_FILE_MAX_BYTES / 1024} KB`);
  }
  if (total > PLUGIN_MAX_BYTES) problems.push(`the files together are larger than ${PLUGIN_MAX_BYTES / 1024} KB`);
  return problems;
};

/** The files in their order: the entry first, then by name */
export const sortPluginFiles = <T extends { name: string }>(files: readonly T[]): T[] =>
  [...files].sort((a, b) => (a.name === PLUGIN_ENTRY ? -1 : b.name === PLUGIN_ENTRY ? 1 : a.name.localeCompare(b.name)));

/** The plugin's text as one string – what registers and loads read: the files one after the other, the entry first */
export const pluginText = (files: readonly PluginFile[]): string => sortPluginFiles(files).map(file => file.text).join("\n");

/** Whether a file is a shader (imported as a string) */
export const isShaderFile = (name: string): boolean => PLUGIN_FILE_KINDS[name.slice(name.lastIndexOf(".") + 1) as keyof typeof PLUGIN_FILE_KINDS] === "shader";
