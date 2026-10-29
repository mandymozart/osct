/**
 * Components of a node (content schema 2.2, the first piece of the plugin API – agents/research/2026-10-28-entity-
 * components.md): a node carries `components: [{ type, ...parameters }]`, each applied to it by the engine's
 * registry. Like the filters, every component type is defined once here – its parameters with kind, default, range
 * and a description, and the node types it applies to – so the editor's panel, the content build, the config guard
 * and the engine read one definition.
 *
 * Adding a component: define it in COMPONENTS, implement it in the engine (`engine/src/scene/entities.ts`),
 * document it in docs/content.md. The editor shows its rows without panel code.
 */

import { EntityType } from "./game-config";

export type ComponentParamSpec =
  | { kind: "color"; default: string; description: string }
  | { kind: "number"; default: number; min: number; max: number; step?: number; unit?: string; description: string }
  | { kind: "choice"; options: readonly string[]; default: string; description: string }
  | { kind: "boolean"; default: boolean; description: string }
  | { kind: "string"; default: string; description: string };

export interface ComponentSpec {
  description: string;
  /** The node types it applies to (none = every type) */
  nodeTypes?: readonly EntityType[];
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

export type ComponentType = keyof typeof COMPONENTS;
export const COMPONENT_TYPES = Object.keys(COMPONENTS) as ComponentType[];
export const isComponentType = (value: unknown): value is ComponentType => typeof value === "string" && value in COMPONENTS;

/** A component as the content holds it: its type and the parameters set (missing ones use the defaults) */
export interface ComponentData {
  type: ComponentType;
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

/** Problems of a node's `components` list (the content build, the guard); `nodeType` checks that each applies */
export const componentProblems = (raw: unknown, path: string, nodeType?: string): string[] => {
  if (!Array.isArray(raw)) return [`${path}: expected a list of components`];
  const problems: string[] = [];
  raw.forEach((component, i) => {
    const at = `${path}[${i}]`;
    if (typeof component !== "object" || component === null || Array.isArray(component)) {
      problems.push(`${at}: expected { type, ...parameters }`);
      return;
    }
    const { type, ...params } = component as Record<string, unknown>;
    if (!isComponentType(type)) {
      problems.push(`${at}.type: "${type}" is not one of ${COMPONENT_TYPES.join(", ")}`);
      return;
    }
    const spec: ComponentSpec = COMPONENTS[type];
    if (nodeType && spec.nodeTypes && !(spec.nodeTypes as readonly string[]).includes(nodeType)) {
      problems.push(`${at}: ${type} applies to ${spec.nodeTypes.join(", ")} nodes, not to a ${nodeType}`);
    }
    problems.push(...paramProblems(spec.params, params, at, type));
  });
  return problems;
};

/** The component of a type on a node, with every parameter resolved to its value or default */
export const resolveComponent = <T extends ComponentType>(components: ComponentData[] | undefined, type: T):
  (Record<string, unknown> & { type: T }) | undefined => {
  const found = components?.find(c => c.type === type);
  if (!found) return undefined;
  const resolved: Record<string, unknown> = { type };
  for (const [name, spec] of Object.entries(COMPONENTS[type].params as Record<string, ComponentParamSpec>)) {
    resolved[name] = found[name] !== undefined ? found[name] : spec.default;
  }
  return resolved as Record<string, unknown> & { type: T };
};
