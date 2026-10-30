import * as THREE from "three";
import type { Object3D } from "three";
import {
  type ComponentData,
  type ComponentSpec,
  componentSpecProblems,
  type EntityData,
  type NodeTypeSpec,
  nodeTypeSpecProblems,
  PLUGIN_API_VERSION,
  pluginApiCompatible,
  type PluginData,
  type PassSpec,
  registerComponentSpec,
  registerNodeTypeSpec,
  resolveNodeParams,
  resolveParams,
  type Target,
  unregisterComponentSpec,
  unregisterNodeTypeSpec,
} from "../types/index";
import type { LoadedAsset } from "./assets";
import { dropPluginListeners, nextRun, type PluginEvents, type PluginProgress, type PluginSpread, type PluginVars, runtimeApi } from "./plugin-runtime";
import { type PassFactory, passRegistration, registerPass, unregisterPassesOf } from "./post/registry";

/**
 * The plugin API (version `PLUGIN_API_VERSION`, agents/research/2026-10-29-code-in-the-editor.md): a book's own code
 * extends the engine without touching it. A plugin module exports `register(api)` and calls the registries –
 *
 *   api.registerComponent("spin", SPEC, ({ object, params }) => ({ update: delta => { object.rotation.y += … } }))
 *   api.registerLayer("tint", SPEC, { glsl: "return mix(rgba, vec4(color, rgba.a), opacity);" })
 *   api.registerPass("halo", PASS_SPEC, ({ shaderPass }) => shaderPass(FRAGMENT))
 *   api.registerNodeType("sparkle", NODE_SPEC, ({ params, three }) => ({ object: new three.Points(…) }))
 *
 * – with the specs of `shared/types/components.ts` (a pass: `shared/types/passes.ts`, a node type:
 * `shared/types/node-types.ts`), so the editor's Entity panel, the content build and the guard read a plugin's
 * component like the built-in `animation`. A **component** runs code on a node (`applyComponents`, called by the
 * entity registry when a node is built); a **material layer** is a piece of GLSL the engine composes into the node's
 * material (`utils/layers.ts`); a **pass** is a post-processing effect over the rendered AR image
 * (`post/registry.ts`); a **node type** builds a node's own three.js object (`buildPluginNode`, called by the entity
 * registry for a type without a built-in builder – the node is placed, holds children, components and layers like
 * any). Components and layers are used in the content as `components: [{ type, … }]`, a node type as `type`.
 * Across nodes and pages a plugin uses the runtime (`plugin-runtime.ts`, API 1.1): `api.events` (core events of the
 * scene, scene events of the content), `api.vars` (variables in the scopes spread / stage / session / book),
 * `api.progress` (what the reader unlocked – from the app) and `api.spread` (the current spread).
 *
 * Registrations are kept per plugin id: installing a plugin again (the editor's Run) replaces what it registered
 * before; an exception in `register` leaves the previous registration in place. The reader loads the plugins the
 * configuration declares (`loadPlugins`), compiled by the content build; the editor also installs modules it
 * transpiled itself (`installPlugin`) – the only place unchecked code runs.
 */

/** What a component's `apply` gets: the node, its parameters resolved, the node's objects, the target, three.js */
export interface ComponentContext {
  node: EntityData;
  /** The component's parameters with the spec's defaults filled in */
  params: Record<string, unknown>;
  /** The node's own object (a model's scene, a video's plane) – the placement group for a node without one */
  object: Object3D;
  /** The placement group around the node (its position / rotation / scale relative to the parent) */
  placed: Object3D;
  /** The placement groups of the node's children, in content order (empty for a leaf) */
  children: Object3D[];
  target: Target;
  /** The app's three.js (one instance – plugins never import three themselves) */
  three: typeof THREE;
}

/** The hooks a component returns; every one is optional */
export interface ComponentInstance {
  /** Every rendered frame while the scene runs (seconds since the last frame) */
  update?(delta: number): void;
  onFound?(): void;
  onLost?(): void;
  /** The target's first find (the app's progress decides; the scene is told through `celebrate`) */
  onUnlocked?(): void;
  /** A tap on the entity */
  onTap?(): void;
  /** The scene paused (consultation, overlays) */
  onPause?(): void;
  /** Free what the component created */
  dispose?(): void;
  /** Apply other parameter values in place (the editor's live edit); false = the node is built anew */
  tune?(params: Record<string, unknown>): boolean;
}

export type ComponentApply = (context: ComponentContext) => ComponentInstance | null | void;

/**
 * A material layer: the body of a GLSL function `vec4 (vec4 rgba, vec2 uv, float time, <the parameters>)`, run on
 * every pixel of the node's material after its own shading, in linear RGB. The spec's parameters arrive as
 * arguments in their order: number → float, boolean → float (0 / 1), color → vec3, choice → int (the index in its
 * options); string parameters are not passed. `time` is the seconds since the node was built.
 */
export interface LayerDefinition {
  glsl: string;
}

/** What a node type's `build` gets: the node, its parameters resolved, its file loaded, the target, three.js */
export interface NodeTypeContext {
  node: EntityData;
  /** The node type's parameters (from the node's `params`) with the spec's defaults filled in */
  params: Record<string, unknown>;
  /**
   * The node's file, loaded – a model's `scene` and `animations`, a video's `element` and `texture`, an image's
   * `texture` – or undefined (a type without `src`, or the file did not load). It is shared with every node that uses
   * the same file: clone what you change (`asset.scene.clone()`), never dispose it.
   */
  asset?: LoadedAsset;
  target: Target;
  /** The app's three.js (one instance – plugins never import three themselves) */
  three: typeof THREE;
}

/**
 * What a node type's `build` returns: the node's own three.js object – the engine puts it into the node's placement
 * group, next to its children – and the hooks it needs (every one optional, as a component's).
 */
export interface NodeTypeInstance {
  object: Object3D;
  update?(delta: number): void;
  onFound?(): void;
  onLost?(): void;
  onUnlocked?(): void;
  onTap?(): void;
  onPause?(): void;
  /** Free what the build created (geometries, materials, textures of its own – not the shared asset) */
  dispose?(): void;
  /** Apply other parameter values in place (the editor's live edit); false = the node is built anew */
  tune?(params: Record<string, unknown>): boolean;
}

export type NodeTypeBuild = (context: NodeTypeContext) => NodeTypeInstance | null | void;

export interface PluginApi {
  /** `PLUGIN_API_VERSION` */
  readonly version: string;
  readonly three: typeof THREE;
  registerComponent(type: string, spec: ComponentSpec, apply: ComponentApply): void;
  registerLayer(type: string, spec: ComponentSpec, layer: LayerDefinition): void;
  /**
   * A node type of the plugin's own (API 1.2): `build` makes its three.js object with `api.three` (Points, a Sprite,
   * a Line, a mesh with its own material); the engine places it like every node – placement, children, components and
   * layers come with it. The spec declares its parameters (rows in the Entity panel, values in the node's `params`)
   * and the file its `src` takes (`glb`, `video`, `image` or `none`).
   */
  registerNodeType(type: string, spec: NodeTypeSpec, build: NodeTypeBuild): void;
  /**
   * A post-processing pass of the plugin's own: its spec as the built-in passes have it, the factory builds the
   * three.js pass (`PassContext`: the resolved parameters, `shaderPass`, the canvas size). The content names it in
   * `passes: [{ type, … }]`; the plugin's pass leaves the registry when the plugin is uninstalled.
   */
  registerPass(type: string, spec: PassSpec, factory: PassFactory): void;
  /** Core events of the scene (read-only) and scene events of the content */
  readonly events: PluginEvents;
  /** Variables in the scopes spread, stage, session and book */
  readonly vars: PluginVars;
  /** The reader's progress: unlocked, consulted, completion (read-only) */
  readonly progress: PluginProgress;
  /** The current spread */
  readonly spread: PluginSpread;
  /** To the console, prefixed with the plugin's id */
  log(...args: unknown[]): void;
}

/** What a compiled plugin module exports */
export interface PluginModule {
  register?: (api: PluginApi) => void;
  default?: (api: PluginApi) => void;
}

interface ComponentRegistration { plugin: string; spec: ComponentSpec; apply: ComponentApply }
interface LayerRegistration { plugin: string; spec: ComponentSpec; layer: LayerDefinition }
interface PassRegistrationStaged { spec: PassSpec; factory: PassFactory }
interface NodeTypeRegistration { plugin: string; spec: NodeTypeSpec; build: NodeTypeBuild }

const components = new Map<string, ComponentRegistration>();
const layers = new Map<string, LayerRegistration>();
const nodeTypes = new Map<string, NodeTypeRegistration>();
/** Plugins installed, by id → the component and layer types they registered */
const installed = new Map<string, string[]>();
/** Plugins installed, by id → the node types they registered (a namespace of its own) */
const installedNodeTypes = new Map<string, string[]>();
/** The compiled modules loaded, by URL (a spread switch never loads a plugin twice) */
const loaded = new Map<string, Promise<void>>();

export class PluginError extends Error {
  constructor(public readonly plugin: string, message: string) {
    super(message);
    this.name = "PluginError";
  }
}

/** Every component, layer and pass type this plugin registered leaves the registries, its listeners with them */
export const uninstallPlugin = (id: string): void => {
  dropPluginListeners(id);
  removeRegistrations(id);
};

const removeRegistrations = (id: string): void => {
  (installed.get(id) ?? []).forEach(type => {
    if (components.get(type)?.plugin === id) components.delete(type);
    if (layers.get(type)?.plugin === id) layers.delete(type);
    if (components.get(type)?.plugin !== id && layers.get(type)?.plugin !== id) unregisterComponentSpec(type);
  });
  (installedNodeTypes.get(id) ?? []).forEach(type => {
    if (nodeTypes.get(type)?.plugin !== id) return;
    nodeTypes.delete(type);
    unregisterNodeTypeSpec(type);
  });
  unregisterPassesOf(id);
  installed.delete(id);
  installedNodeTypes.delete(id);
};

/**
 * Run a plugin module's `register(api)`: its registrations replace the plugin's previous ones. Throws a
 * `PluginError` (and keeps the previous registrations) when the module exports no register function, a spec is
 * invalid, a type is taken by another plugin, or `register` throws.
 */
export const installPlugin = (id: string, module: PluginModule): void => {
  const register = module.register ?? module.default;
  if (typeof register !== "function") throw new PluginError(id, `${id}: the module exports no register(api) function`);
  const staged: {
    components: Map<string, ComponentRegistration>; layers: Map<string, LayerRegistration>; passes: Map<string, PassRegistrationStaged>;
    nodeTypes: Map<string, NodeTypeRegistration>;
  } = {
    components: new Map(),
    layers: new Map(),
    passes: new Map(),
    nodeTypes: new Map(),
  };
  // The listeners this run subscribes replace the previous run's once register succeeded
  const run = nextRun();
  const check = (type: string, spec: ComponentSpec) => {
    const problems = componentSpecProblems(type, spec);
    const owner = components.get(type)?.plugin ?? layers.get(type)?.plugin;
    if (owner && owner !== id) problems.push(`"${type}" is registered by the plugin ${owner}`);
    if (staged.components.has(type) || staged.layers.has(type)) problems.push(`"${type}" is registered twice`);
    if (problems.length) throw new PluginError(id, `${id}: ${problems.join("; ")}`);
  };
  const api: PluginApi = {
    version: PLUGIN_API_VERSION,
    three: THREE,
    ...runtimeApi(id, run),
    registerComponent: (type, spec, apply) => {
      check(type, spec);
      if (typeof apply !== "function") throw new PluginError(id, `${id}: ${type} needs an apply(context) function`);
      staged.components.set(type, { plugin: id, spec, apply });
    },
    registerLayer: (type, spec, layer) => {
      check(type, spec);
      if (typeof layer?.glsl !== "string" || !layer.glsl.trim()) throw new PluginError(id, `${id}: the layer ${type} needs its glsl`);
      staged.layers.set(type, { plugin: id, spec, layer });
    },
    registerPass: (type, spec, factory) => {
      const problems = componentSpecProblems(type, spec);
      const owner = passRegistration(type)?.owner;
      if (owner && owner !== id) problems.push(`the pass "${type}" is registered by ${owner}`);
      if (staged.passes.has(type)) problems.push(`the pass "${type}" is registered twice`);
      if (typeof factory !== "function") problems.push(`the pass "${type}" needs a factory`);
      if (problems.length) throw new PluginError(id, `${id}: ${problems.join("; ")}`);
      staged.passes.set(type, { spec, factory });
    },
    registerNodeType: (type, spec, build) => {
      const problems = nodeTypeSpecProblems(type, spec);
      const owner = nodeTypes.get(type)?.plugin;
      if (owner && owner !== id) problems.push(`the node type "${type}" is registered by the plugin ${owner}`);
      if (staged.nodeTypes.has(type)) problems.push(`the node type "${type}" is registered twice`);
      if (typeof build !== "function") problems.push(`the node type "${type}" needs a build(context) function`);
      if (problems.length) throw new PluginError(id, `${id}: ${problems.join("; ")}`);
      staged.nodeTypes.set(type, { plugin: id, spec, build });
    },
    log: (...args) => console.info(`[plugin ${id}]`, ...args),
  };
  try {
    register(api);
  } catch (error) {
    dropPluginListeners(id, { onlyRun: run });
    if (error instanceof PluginError) throw error;
    throw new PluginError(id, `${id}: register failed – ${error instanceof Error ? error.message : String(error)}`);
  }
  dropPluginListeners(id, { keepRun: run });
  removeRegistrations(id);
  staged.components.forEach((registration, type) => {
    components.set(type, registration);
    registerComponentSpec(type, registration.spec);
  });
  staged.layers.forEach((registration, type) => {
    layers.set(type, registration);
    registerComponentSpec(type, registration.spec);
  });
  staged.passes.forEach(({ spec, factory }, type) => registerPass(type, spec, factory, id));
  staged.nodeTypes.forEach((registration, type) => {
    nodeTypes.set(type, registration);
    registerNodeTypeSpec(type, registration.spec);
  });
  installed.set(id, [...staged.components.keys(), ...staged.layers.keys()]);
  installedNodeTypes.set(id, [...staged.nodeTypes.keys()]);
};

/** The ids of the plugins installed right now */
export const installedPlugins = (): string[] => [...installed.keys()];

/** The component and layer types a plugin registered */
export const pluginTypes = (id: string): string[] => [...(installed.get(id) ?? [])];

/** The node types a plugin registered */
export const pluginNodeTypesOf = (id: string): string[] => [...(installedNodeTypes.get(id) ?? [])];

export const componentRegistration = (type: string): ComponentRegistration | undefined => components.get(type);
export const layerRegistration = (type: string): LayerRegistration | undefined => layers.get(type);
export const nodeTypeRegistration = (type: string): NodeTypeRegistration | undefined => nodeTypes.get(type);

/**
 * Build a node of a plugin's type: the registration's `build` with the node's parameters resolved and its file
 * loaded. Null when the type is nobody's, `build` returns nothing or throws (logged – the node renders nothing and
 * keeps its children). `tune` applies another node of the same type and file in place: the build's own `tune`, or –
 * without one – only when the parameters did not change.
 */
export const buildPluginNode = (
  node: EntityData,
  target: Target,
  asset: (id: string) => LoadedAsset | undefined,
): (Omit<NodeTypeInstance, "tune"> & { tune(next: EntityData): boolean }) | null => {
  const registration = nodeTypes.get(node.type);
  if (!registration) return null;
  const params = resolveNodeParams(registration.spec, node.params);
  const file = node.assets[0];
  let instance: NodeTypeInstance | null | void;
  try {
    instance = registration.build({ node, params, asset: file ? asset(file.id) : undefined, target, three: THREE });
  } catch (error) {
    console.error(`[plugins] the node type ${node.type} (plugin ${registration.plugin}) failed on ${target.id}:`, error);
    return null;
  }
  if (!instance || !(instance.object instanceof THREE.Object3D)) {
    if (instance) console.error(`[plugins] the node type ${node.type} (plugin ${registration.plugin}) returned no three.js object on ${target.id}`);
    return null;
  }
  const built = instance;
  let applied = params;
  return {
    ...built,
    tune: next => {
      if (next.type !== node.type || (next.assets[0]?.src ?? "") !== (file?.src ?? "")) return false;
      const values = resolveNodeParams(registration.spec, next.params);
      const same = Object.keys(values).every(key => JSON.stringify(values[key]) === JSON.stringify(applied[key]));
      const ok = same || (built.tune?.(values) ?? false);
      if (ok) applied = values;
      return ok;
    },
  };
};

/** Load and install the plugins a configuration declares; a plugin that fails is logged and skipped (RULES #16) */
export const loadPlugins = async (
  plugins: readonly PluginData[],
  importer: (url: string) => Promise<unknown> = url => import(/* @vite-ignore */ url),
): Promise<void> => {
  await Promise.all(plugins.map(plugin => {
    if (!pluginApiCompatible(plugin.api)) {
      console.error(`[plugins] ${plugin.id} was built against plugin API ${plugin.api}, this engine runs ${PLUGIN_API_VERSION} – not loaded`);
      return Promise.resolve();
    }
    let loading = loaded.get(plugin.src);
    if (!loading) {
      loading = importer(plugin.src)
        .then(module => installPlugin(plugin.id, module as PluginModule))
        .catch(error => {
          loaded.delete(plugin.src);
          console.error(`[plugins] ${plugin.id} (${plugin.src}) could not be loaded:`, error);
        });
      loaded.set(plugin.src, loading);
    }
    return loading;
  }));
};

/** The components of a node that a plugin registered (not the built-in ones), with their parameters resolved */
export const pluginComponentsOf = (node: EntityData): Array<{ data: ComponentData; registration: ComponentRegistration; params: Record<string, unknown> }> =>
  (node.components ?? []).flatMap(data => {
    const registration = components.get(data.type);
    return registration ? [{ data, registration, params: resolveParams(registration.spec, data) }] : [];
  });

/** The material layers of a node, in order, with their parameters resolved */
export const layersOf = (node: EntityData): Array<{ data: ComponentData; registration: LayerRegistration; params: Record<string, unknown> }> =>
  (node.components ?? []).flatMap(data => {
    const registration = layers.get(data.type);
    return registration ? [{ data, registration, params: resolveParams(registration.spec, data) }] : [];
  });

/** A component type nobody registered (built-in or plugin): the node renders without it */
export const unknownComponentTypes = (node: EntityData, builtIn: readonly string[]): string[] =>
  (node.components ?? []).map(c => c.type).filter(type => !builtIn.includes(type) && !components.has(type) && !layers.has(type));

/**
 * Apply a node's plugin components: one instance per component, as `EntityInstance`-like parts the entity registry
 * adds to the node's hooks. `tune` applies new parameter values to every instance in place when the components
 * stay the same types in the same order; else the node is built anew.
 */
export const applyComponents = (
  context: Omit<ComponentContext, "params" | "three">,
): { parts: ComponentInstance[]; types: string[]; tune(node: EntityData): boolean } => {
  const applied = pluginComponentsOf(context.node);
  const parts = applied.map(({ registration, params, data }) => {
    try {
      return registration.apply({ ...context, params, three: THREE }) ?? {};
    } catch (error) {
      console.error(`[plugins] ${data.type} (plugin ${registration.plugin}) failed on ${context.target.id}:`, error);
      return {};
    }
  });
  const types = applied.map(a => a.data.type);
  return {
    parts,
    types,
    tune: node => {
      const next = pluginComponentsOf(node);
      if (next.length !== applied.length || next.some((c, i) => c.data.type !== types[i])) return false;
      return next.every((c, i) => parts[i].tune?.(c.params) ?? Object.keys(c.params).every(key => JSON.stringify(c.params[key]) === JSON.stringify(applied[i].params[key])));
    },
  };
};
