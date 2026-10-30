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
 * the plugin registers it when it loads, and the guard lets it pass (`unknownTypes: "allow"`).
 *
 * Adding a built-in component: define it in COMPONENTS, implement it in the engine, document it in docs/content.md.
 * The editor shows its rows without panel code.
 */

import type { NodeType } from "./game-config";

export type ComponentParamSpec =
  | { kind: "color"; default: string; description: string }
  | { kind: "number"; default: number; min: number; max: number; step?: number; unit?: string; description: string }
  | { kind: "choice"; options: readonly string[]; default: string; description: string }
  | { kind: "boolean"; default: boolean; description: string }
  | { kind: "string"; default: string; description: string };

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
      clip: { kind: "string", default: "", description: "The clip's name – empty plays the first clip." },
      playOn: {
        kind: "choice", options: ["found", "tap", "never"], default: "found",
        description: "When the clip starts: when the page is found, when the entity is tapped, or never (the editor's timeline only).",
      },
      stopOn: {
        kind: "choice", options: ["lost", "never"], default: "lost",
        description: "When it stops: when the page is lost, or never (it keeps its time while the page is away).",
      },
      loop: { kind: "boolean", default: true, description: "Repeat the clip; off = play it once and hold the last frame." },
      speed: { kind: "number", default: 1, min: 0.1, max: 4, step: 0.1, unit: "×", description: "Playback speed." },
    },
  },
} as const satisfies Record<string, ComponentSpec>;

/** The built-in component types */
export type ComponentType = keyof typeof COMPONENTS;
export const COMPONENT_TYPES = Object.keys(COMPONENTS) as ComponentType[];

/** A component type: `camelCase`, letters and digits */
export const COMPONENT_TYPE_PATTERN = /^[a-z][a-zA-Z0-9]{0,39}$/;

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

export const isComponentType = (value: unknown): value is string => typeof value === "string" && componentSpec(value) !== undefined;

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
  if (typeof s.params !== "object" || s.params === null || Array.isArray(s.params)) return [...problems, `${type}: params must be an object`];
  return [...problems, ...paramSpecProblems(type, s.params as Record<string, unknown>)];
};

/** Problems of a spec's parameters (a component's, a layer's, a pass's, a plugin node type's): names, kinds, defaults */
export const paramSpecProblems = (type: string, params: Record<string, unknown>): string[] => {
  const problems: string[] = [];
  for (const [name, raw] of Object.entries(params)) {
    const at = `${type}.${name}`;
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(name)) problems.push(`${at}: a parameter name is camelCase letters and digits`);
    const p = raw as Partial<Record<string, unknown>> | null;
    if (typeof p !== "object" || p === null) {
      problems.push(`${at}: expected { kind, default, description }`);
      continue;
    }
    if (typeof p.description !== "string") problems.push(`${at}: description must be a string`);
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
      default: problems.push(`${at}: kind must be color, number, choice, boolean or string`);
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
}

/** Problems of a node's `components` list (the content build, the guard); `nodeType` checks that each applies */
export const componentProblems = (raw: unknown, path: string, nodeType?: string, options: ComponentCheckOptions = {}): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of components`];
  const problems: string[] = [];
  raw.forEach((component, i) => {
    const at = `${path}[${i}]`;
    if (typeof component !== "object" || component === null || Array.isArray(component)) {
      problems.push(`${at}: expected { type, ...parameters }`);
      return;
    }
    const { type, ...params } = component as Record<string, unknown>;
    const spec = typeof type === "string" ? componentSpec(type) : undefined;
    if (!spec) {
      if (options.unknownTypes === "allow" && typeof type === "string" && COMPONENT_TYPE_PATTERN.test(type)) return;
      problems.push(`${at}.type: "${type}" is not one of ${componentTypes().join(", ")}`);
      return;
    }
    if (nodeType && spec.nodeTypes && !(spec.nodeTypes as readonly string[]).includes(nodeType)) {
      problems.push(`${at}: ${type} applies to ${spec.nodeTypes.join(", ")} nodes, not to a ${nodeType}`);
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
