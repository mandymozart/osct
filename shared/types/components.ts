/**
 * Components of a node (content schema 2.2, the first piece of the plugin API – agents/research/2026-10-28-entity-
 * components.md): a node carries `components: [{ type, ...parameters }]`, each applied to it by the engine's
 * registry. Like the filters, every component type is defined once – its parameters with kind, default, range
 * and a description, and the node types it applies to – so the editor's panel, the content build, the config guard
 * and the engine read one definition.
 *
 * Two kinds of definition share one registry (`componentSpec`): the **built-in** components in COMPONENTS (the
 * engine implements them in `engine/src/scene/entities.ts`), and the components and material layers a **plugin**
 * registers at runtime (`registerComponentSpec`, called by the engine's plugin API – `engine/src/scene/plugins.ts`).
 * A type nobody registered is refused by the build and the guard, unless the configuration declares plugins: then
 * the guard checks it against the specs the plugins recorded (schema 2.14, `PluginData.registered`) and refuses a type
 * none of them registers – or, when a plugin recorded nothing (an older build), lets it pass (`unknownTypes: "allow"`):
 * the plugin registers it when it loads.
 *
 * Adding a built-in component: define it in COMPONENTS, implement it in the engine, document it in docs/content.md.
 * The editor shows its rows without panel code. One built-in component is not made of parameters: `behaviour` (schema
 * 2.19) holds a list of rules, its grammar and checks are its own (`./behaviour.ts`) and the editor has a rule editor for it.
 */

import type { NodeType } from "./game-config";
import { BEHAVIOUR_TYPE, behaviourProblems } from "./behaviour";
import { CAMEL_CASE_NAME, isObject } from "../guards/primitives";

/**
 * A parameter of a spec (a component's, a material layer's, a pass's, a light's, a plugin node type's, a material's, a
 * procedural texture's): its kind with default and range, a `description` (the editor's help) and an optional `label`
 * (schema 2.15, plugin API 1.3) – the few words the editor's row shows. Without a label the row shows the name split
 * into words (`paramLabel`). A `texture` (schema 2.17, plugin API 1.4) takes a picture: a file (a Library image or
 * video, a file of the content) or a procedural texture a plugin registers (`registerTexture`) – its value is a
 * `TextureValue` (below); the engine hands the plugin's code a three.js texture.
 */
export type ComponentParamSpec = ParamText & (
  | { kind: "color"; default: string }
  | { kind: "number"; default: number; min: number; max: number; step?: number; unit?: string }
  | { kind: "choice"; options: readonly string[]; default: string }
  | { kind: "boolean"; default: boolean }
  | { kind: "string"; default: string }
  | { kind: "texture"; default: string }
);

/**
 * A texture parameter's value (schema 2.17): `""` = none; a procedural texture's type (`caustics` – camelCase, what a
 * plugin registers with `registerTexture`, with its defaults); `{ type, …parameters }` = a procedural texture with other
 * values; any other string = a file (a Library file's URL or a `/assets/content/…` path – in the content's YAML a file
 * next to the node, which the content build resolves to its path).
 */
export type TextureValue = string | { type: string; [param: string]: unknown };

/** A procedural texture's type: camelCase letters and digits (a file always has a dot or a slash) */
export const TEXTURE_TYPE_PATTERN = CAMEL_CASE_NAME;

const TEXTURE_VALUE_EXPECTED = "expected a texture: a file, a procedural texture's type or { type, …parameters }";

export const isTextureValue = (value: unknown): value is TextureValue =>
  typeof value === "string" ||
  (isObject(value) && typeof value.type === "string" && TEXTURE_TYPE_PATTERN.test(value.type));

/** What a texture value names: nothing, a file, or a procedural texture (its type and parameters) */
export type TextureSource =
  | { kind: "none" }
  | { kind: "file"; src: string }
  | { kind: "procedural"; type: string; params: Record<string, unknown> };

export const textureSource = (value: unknown): TextureSource => {
  if (typeof value === "string") {
    if (!value.trim()) return { kind: "none" };
    if (TEXTURE_TYPE_PATTERN.test(value)) return { kind: "procedural", type: value, params: {} };
    return { kind: "file", src: value };
  }
  if (typeof value === "object" && value !== null && isTextureValue(value)) {
    const { type, ...params } = value as { type: string; [param: string]: unknown };
    return { kind: "procedural", type, params };
  }
  return { kind: "none" };
};

/** What every parameter says about itself, whatever its kind */
export interface ParamText {
  /**
   * The few words the editor's row shows (schema 2.15, plugin API 1.3), e.g. `"speed"` for `degreesPerSecond` – 1 to
   * 24 characters (`PARAM_LABEL_MAX`). Without one the row shows the name split into words ("degrees per second").
   */
  label?: string;
  /** What the parameter does – the row's help in the editor's Info view */
  description: string;
}

/** The longest label a parameter may carry (the editor's label column is narrow; the description is the help) */
export const PARAM_LABEL_MAX = 24;

/** A parameter's name as words: `degreesPerSecond` → "degrees per second", `playOn` → "play on", `uvScale2` → "uv scale 2" */
export const paramWords = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .toLowerCase();

/** What the editor's row shows for a parameter: its spec's label, else its name as words */
export const paramLabel = (name: string, spec?: { label?: string }): string => spec?.label?.trim() || paramWords(name);

export interface ComponentSpec {
  description: string;
  /** The node types it applies to (none = every type) – built-in types or a plugin's (`registerNodeType`) */
  nodeTypes?: readonly NodeType[];
  params: Record<string, ComponentParamSpec>;
}

export const COMPONENTS = {
  /** A model's glTF animation: which clip plays, when it starts and stops, how it loops – the editor's timeline */
  animation: {
    description: "Plays one of the model's animation clips (glTF). Without this component every clip plays in a loop.",
    nodeTypes: ["model"],
    params: {
      clip: { kind: "string", default: "", label: "clip", description: "The clip's name – empty plays the first clip." },
      playOn: {
        kind: "choice", options: ["found", "tap", "never"], default: "found", label: "plays on",
        description: "When the clip starts: when the page is found, when the entity is tapped, or never (the editor's timeline only).",
      },
      stopOn: {
        kind: "choice", options: ["lost", "never"], default: "lost", label: "stops on",
        description: "When it stops: when the page is lost, or never (it keeps its time while the page is away).",
      },
      loop: { kind: "boolean", default: true, label: "loop", description: "Repeat the clip; off = play it once and hold the last frame." },
      speed: { kind: "number", default: 1, min: 0.1, max: 4, step: 0.1, unit: "×", label: "speed", description: "Playback speed." },
    },
  },
  /**
   * Rules without code (schema 2.19): on an event, when the variables match, do actions – its `rules` are no parameters
   * (no rows), their grammar is `./behaviour.ts`
   */
  behaviour: {
    description: "Rules without code: on an event (found, lost, tap, unlocked or a named event), when variables match, do actions – play, pause or stop a clip, show or hide a node, set a variable, emit an event.",
    params: {},
  },
} as const satisfies Record<string, ComponentSpec>;

/** The built-in component types */
export type ComponentType = keyof typeof COMPONENTS;
export const COMPONENT_TYPES = Object.keys(COMPONENTS) as ComponentType[];

/** A component type: `camelCase`, letters and digits */
export const COMPONENT_TYPE_PATTERN = CAMEL_CASE_NAME;

/** Components a plugin registered (type → spec); the built-in ones win on a clash */
const registered = new Map<string, ComponentSpec>();

/** A plugin's component or material layer: its spec joins the registry the panel, the build and the guard read */
export const registerComponentSpec = (type: string, spec: ComponentSpec): void => {
  registered.set(type, spec);
};

export const unregisterComponentSpec = (type: string): void => {
  registered.delete(type);
};

/** The definition of a component type – built-in or registered – or undefined */
export const componentSpec = (type: string): ComponentSpec | undefined =>
  (COMPONENTS as Record<string, ComponentSpec>)[type] ?? registered.get(type);

/** Every component type known right now: the built-in ones, then the registered ones */
export const componentTypes = (): string[] => [...COMPONENT_TYPES, ...[...registered.keys()].filter(type => !(type in COMPONENTS))];

/** A component as the content holds it: its type and the parameters set (missing ones use the defaults) */
export interface ComponentData {
  type: string;
  [param: string]: unknown;
}

/** Problems of the parameters set for a spec (a component, a pass): unknown names, wrong kinds, numbers out of range */
export const paramProblems = (specs: Record<string, ComponentParamSpec>, params: Record<string, unknown>, at: string, type: string): string[] => {
  const problems: string[] = [];
  for (const [name, value] of Object.entries(params)) {
    const param = specs[name];
    if (!param) {
      problems.push(`${at}.${name}: unknown parameter of ${type} (${Object.keys(specs).join(", ")})`);
    } else if (param.kind === "color" && !(typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))) {
      problems.push(`${at}.${name}: expected a color "#rrggbb", got ${JSON.stringify(value)}`);
    } else if (param.kind === "choice" && !param.options.includes(value as string)) {
      problems.push(`${at}.${name}: expected one of ${param.options.join(", ")}, got ${JSON.stringify(value)}`);
    } else if (param.kind === "number" && !(typeof value === "number" && value >= param.min && value <= param.max)) {
      problems.push(`${at}.${name}: expected a number from ${param.min} to ${param.max}, got ${JSON.stringify(value)}`);
    } else if (param.kind === "boolean" && typeof value !== "boolean") {
      problems.push(`${at}.${name}: expected true or false, got ${JSON.stringify(value)}`);
    } else if (param.kind === "string" && typeof value !== "string") {
      problems.push(`${at}.${name}: expected a string, got ${JSON.stringify(value)}`);
    } else if (param.kind === "texture" && !isTextureValue(value)) {
      problems.push(`${at}.${name}: ${TEXTURE_VALUE_EXPECTED}, got ${JSON.stringify(value)}`);
    }
  }
  return problems;
};

const isColor = (value: unknown) => typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

/**
 * Problems of a spec a plugin registers (the editor's Run and the content build check it before the registry
 * takes it): the type's name, every parameter's kind and default
 */
export const componentSpecProblems = (type: string, spec: unknown): string[] => {
  const problems: string[] = [];
  if (!COMPONENT_TYPE_PATTERN.test(type)) problems.push(`"${type}" is not a component type (camelCase letters and digits, e.g. tint)`);
  if (type in COMPONENTS) problems.push(`"${type}" is a built-in component`);
  if (typeof spec !== "object" || spec === null) return [...problems, `${type}: the spec must be an object with description and params`];
  const s = spec as Record<string, unknown>;
  if (typeof s.description !== "string") problems.push(`${type}: description must be a string`);
  if (s.nodeTypes !== undefined && !(Array.isArray(s.nodeTypes) && s.nodeTypes.every(t => typeof t === "string"))) problems.push(`${type}: nodeTypes must be a list of node types`);
  if (!isObject(s.params)) return [...problems, `${type}: params must be an object`];
  return [...problems, ...paramSpecProblems(type, s.params)];
};

/** Problems of a spec's parameters (a component's, a layer's, a pass's, a plugin node type's): names, kinds, defaults */
export const paramSpecProblems = (type: string, params: Record<string, unknown>): string[] => {
  const problems: string[] = [];
  for (const [name, raw] of Object.entries(params)) {
    const at = `${type}.${name}`;
    if (!CAMEL_CASE_NAME.test(name)) problems.push(`${at}: a parameter name is camelCase letters and digits`);
    const p = raw as Partial<Record<string, unknown>> | null;
    if (typeof p !== "object" || p === null) {
      problems.push(`${at}: expected { kind, default, description }`);
      continue;
    }
    if (typeof p.description !== "string") problems.push(`${at}: description must be a string`);
    if (p.label !== undefined && !(typeof p.label === "string" && p.label.trim() && p.label.length <= PARAM_LABEL_MAX)) {
      problems.push(`${at}: label must be a short text (1–${PARAM_LABEL_MAX} characters)`);
    }
    switch (p.kind) {
      case "color": if (!isColor(p.default)) problems.push(`${at}: default must be a color "#rrggbb"`); break;
      case "number":
        if (typeof p.default !== "number" || typeof p.min !== "number" || typeof p.max !== "number" || !(p.min <= p.default && p.default <= p.max)) {
          problems.push(`${at}: a number needs min ≤ default ≤ max`);
        }
        break;
      case "choice":
        if (!(Array.isArray(p.options) && p.options.length && p.options.every(o => typeof o === "string") && p.options.includes(p.default as string))) {
          problems.push(`${at}: a choice needs options (strings) and a default among them`);
        }
        break;
      case "boolean": if (typeof p.default !== "boolean") problems.push(`${at}: default must be true or false`); break;
      case "string": if (typeof p.default !== "string") problems.push(`${at}: default must be a string`); break;
      case "texture": if (typeof p.default !== "string") problems.push(`${at}: a texture's default is a string (empty = none, or a procedural texture's type)`); break;
      default: problems.push(`${at}: kind must be color, number, choice, boolean, string or texture`);
    }
  }
  return problems;
};

export interface ComponentCheckOptions {
  /**
   * What to do with a type the registry does not know: refuse it (the default – the build, a configuration without
   * plugins), or allow it with its parameters unchecked (a configuration that declares plugins registers it at load)
   */
  unknownTypes?: "refuse" | "allow";
  /**
   * Specs beyond the registry's – the ones the declared plugins recorded (schema 2.14, `PluginData.registered`): a
   * type found here is checked like a registered one
   */
  specs?: ReadonlyMap<string, ComponentSpec>;
}

/** Problems of a node's `components` list (the content build, the guard); `nodeType` checks that each applies */
export const componentProblems = (raw: unknown, path: string, nodeType?: string, options: ComponentCheckOptions = {}): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of components`];
  const problems: string[] = [];
  raw.forEach((component, i) => {
    const at = `${path}[${i}]`;
    if (!isObject(component)) {
      problems.push(`${at}: expected { type, ...parameters }`);
      return;
    }
    const { type, ...params } = component;
    const spec = typeof type === "string" ? componentSpec(type) ?? options.specs?.get(type) : undefined;
    if (!spec) {
      if (options.unknownTypes === "allow" && typeof type === "string" && COMPONENT_TYPE_PATTERN.test(type)) return;
      const known = [...new Set([...componentTypes(), ...(options.specs?.keys() ?? [])])];
      problems.push(`${at}.type: "${type}" is not one of ${known.join(", ")}`);
      return;
    }
    if (nodeType && spec.nodeTypes && !(spec.nodeTypes as readonly string[]).includes(nodeType)) {
      problems.push(`${at}: ${type} applies to ${spec.nodeTypes.join(", ")} nodes, not to a ${nodeType}`);
    }
    // The behaviour's rules are no parameters: their own grammar
    if (type === BEHAVIOUR_TYPE) {
      problems.push(...behaviourProblems(params, at));
      return;
    }
    for (const [name, value] of Object.entries(params)) {
      const param = spec.params[name];
      if (!param) {
        problems.push(`${at}.${name}: unknown parameter of ${type} (${Object.keys(spec.params).join(", ")})`);
        continue;
      }
      const problem = paramProblem(param, value);
      if (problem) problems.push(`${at}.${name}: ${problem}`);
    }
  });
  return problems;
};

/** Why a value does not fit a parameter's spec (a component's, a light's), or null when it does */
export const paramProblem = (param: ComponentParamSpec, value: unknown): string | null => {
  if (param.kind === "color" && !isColor(value)) return `expected a color "#rrggbb", got ${JSON.stringify(value)}`;
  if (param.kind === "choice" && !param.options.includes(value as string)) {
    return `expected one of ${param.options.join(", ")}, got ${JSON.stringify(value)}`;
  }
  if (param.kind === "number" && !(typeof value === "number" && value >= param.min && value <= param.max)) {
    return `expected a number from ${param.min} to ${param.max}, got ${JSON.stringify(value)}`;
  }
  if (param.kind === "boolean" && typeof value !== "boolean") return `expected true or false, got ${JSON.stringify(value)}`;
  if (param.kind === "string" && typeof value !== "string") return `expected a string, got ${JSON.stringify(value)}`;
  if (param.kind === "texture" && !isTextureValue(value)) return `${TEXTURE_VALUE_EXPECTED}, got ${JSON.stringify(value)}`;
  return null;
};

/** A component's parameters with every one resolved to its value or the spec's default */
export const resolveParams = (spec: ComponentSpec, component: ComponentData): Record<string, unknown> => {
  const resolved: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(spec.params)) {
    resolved[name] = component[name] !== undefined ? component[name] : param.default;
  }
  return resolved;
};

/** The component of a type on a node, with every parameter resolved to its value or default */
export const resolveComponent = <T extends string>(components: ComponentData[] | undefined, type: T):
  (Record<string, unknown> & { type: T }) | undefined => {
  const found = components?.find(c => c.type === type);
  const spec = componentSpec(type);
  if (!found || !spec) return undefined;
  return { ...resolveParams(spec, found), type };
};
