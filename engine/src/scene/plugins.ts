import * as THREE from "three";
import type { Object3D } from "three";
import {
  ComponentData,
  ComponentSpec,
  componentSpecProblems,
  EntityData,
  PLUGIN_API_VERSION,
  pluginApiCompatible,
  PluginData,
  registerComponentSpec,
  resolveParams,
  Target,
  unregisterComponentSpec,
} from "../types/index";
import { dropPluginListeners, nextRun, PluginEvents, PluginProgress, PluginSpread, PluginVars, runtimeApi } from "./plugin-runtime";

/**
 * The plugin API (version `PLUGIN_API_VERSION`, agents/research/2026-10-29-code-in-the-editor.md): a book's own code
 * extends the engine without touching it. A plugin module exports `register(api)` and calls the registries –
 *
 *   api.registerComponent("spin", SPEC, ({ object, params }) => ({ update: delta => { object.rotation.y += … } }))
 *   api.registerLayer("tint", SPEC, { glsl: "return mix(rgba, vec4(color, rgba.a), opacity);" })
 *
 * – with the specs of `shared/types/components.ts`, so the editor's Entity panel, the content build and the guard
 * read a plugin's component like the built-in `animation`. A **component** runs code on a node (`applyComponents`,
 * called by the entity registry when a node is built); a **material layer** is a piece of GLSL the engine composes
 * into the node's material (`utils/layers.ts`). Both are used in the content as `components: [{ type, … }]`.
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

export interface PluginApi {
  /** `PLUGIN_API_VERSION` */
  readonly version: string;
  readonly three: typeof THREE;
  registerComponent(type: string, spec: ComponentSpec, apply: ComponentApply): void;
  registerLayer(type: string, spec: ComponentSpec, layer: LayerDefinition): void;
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

const components = new Map<string, ComponentRegistration>();
const layers = new Map<string, LayerRegistration>();
/** Plugins installed, by id → the component and layer types they registered */
const installed = new Map<string, string[]>();
/** The compiled modules loaded, by URL (a spread switch never loads a plugin twice) */
const loaded = new Map<string, Promise<void>>();

export class PluginError extends Error {
  constructor(public readonly plugin: string, message: string) {
    super(message);
    this.name = "PluginError";
  }
}

/** Every component and layer type this plugin registered leaves the registries, its listeners with them */
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
  installed.delete(id);
};

/**
 * Run a plugin module's `register(api)`: its registrations replace the plugin's previous ones. Throws a
 * `PluginError` (and keeps the previous registrations) when the module exports no register function, a spec is
 * invalid, a type is taken by another plugin, or `register` throws.
 */
export const installPlugin = (id: string, module: PluginModule): void => {
  const register = module.register ?? module.default;
  if (typeof register !== "function") throw new PluginError(id, `${id}: the module exports no register(api) function`);
  const staged: { components: Map<string, ComponentRegistration>; layers: Map<string, LayerRegistration> } = { components: new Map(), layers: new Map() };
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
  installed.set(id, [...staged.components.keys(), ...staged.layers.keys()]);
};

/** The ids of the plugins installed right now */
export const installedPlugins = (): string[] => [...installed.keys()];

/** The component and layer types a plugin registered */
export const pluginTypes = (id: string): string[] => [...(installed.get(id) ?? [])];

export const componentRegistration = (type: string): ComponentRegistration | undefined => components.get(type);
export const layerRegistration = (type: string): LayerRegistration | undefined => layers.get(type);

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
