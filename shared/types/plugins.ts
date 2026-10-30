/**
 * Plugins: the book's own code as content (content schema 2.4, agents/research/2026-10-29-code-in-the-editor.md).
 * A plugin is a folder `plugins/<id>/` of the content source with an `index.ts` that exports `register(api)`; the
 * content build type-checks and bundles it into `plugins/<id>/plugin.js` of the build output and declares it here.
 * The engine loads every declared plugin before it builds the first spread and hands it the plugin API
 * (`engine/src/scene/plugins.ts`): registries for components and material layers, the app's three.js.
 *
 * The API is versioned apart from the content schema: `PLUGIN_API_VERSION` MAJOR.MINOR – a plugin built against
 * another MAJOR is not loaded (logged); MINOR adds. 1.1 added `api.events`, `api.vars`, `api.progress`, `api.spread`,
 * the component context's `children` and the hook `onUnlocked`; 1.2 `api.registerNodeType` (a node type of the
 * plugin's own, `./node-types.ts`).
 *
 * What a plugin registers is recorded by the content build (content schema 2.14, #90): it runs every plugin once with a
 * recording API and writes the specs into the plugin's `registered` – so the guard, the editor's API, the MCP server and
 * the Entity panel know a plugin's components, node types and passes with their parameters without running its code.
 * The engine ignores the field (it registers from the module). A plugin without `registered` (an older build) is
 * unknown until it runs: the guard then lets a type it may register pass.
 */

import { componentSpecProblems, type ComponentSpec } from "./components";
import { nodeTypeSpecProblems, type NodeTypeSpec } from "./node-types";
import type { PassSpec } from "./passes";

export const PLUGIN_API_VERSION = "1.2";

/** What a plugin registered, as the content build recorded it (schema 2.14); a missing kind = none of it */
export interface PluginRegistrations {
  /** Its components and material layers (both are components in the content), type → spec */
  components?: Record<string, ComponentSpec>;
  /** Its node types (`registerNodeType`), type → spec */
  nodeTypes?: Record<string, NodeTypeSpec>;
  /** Its post-processing passes (`registerPass`), type → spec */
  passes?: Record<string, PassSpec>;
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
    if (typeof plugin !== "object" || plugin === null || Array.isArray(plugin)) {
      problems.push(`${at}: expected { id, src, api }`);
      return;
    }
    const p = plugin as Record<string, unknown>;
    if (typeof p.id !== "string" || !PLUGIN_ID_PATTERN.test(p.id)) problems.push(`${at}.id: expected a plugin id (letters, digits, -)`);
    else if (ids.has(p.id)) problems.push(`${at}.id: duplicate plugin id "${p.id}"`);
    else ids.add(p.id);
    if (typeof p.src !== "string" || !p.src.endsWith(".js")) problems.push(`${at}.src: expected the compiled module (…/plugin.js)`);
    if (typeof p.api !== "string" || !/^\d+\.\d+$/.test(p.api)) problems.push(`${at}.api: expected the plugin API version "MAJOR.MINOR"`);
    if (p.registered !== undefined) problems.push(...registrationProblems(p.registered, `${at}.registered`));
  });
  return problems;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const KINDS = ["components", "nodeTypes", "passes"] as const;

/** Problems of a plugin's recorded `registered`: every spec checked as the engine checks it when the plugin registers it */
export const registrationProblems = (raw: unknown, path: string): string[] => {
  if (!isRecord(raw)) return [`${path}: expected { components?, nodeTypes?, passes? }`];
  const problems: string[] = [];
  const checks: Record<(typeof KINDS)[number], (type: string, spec: unknown) => string[]> = {
    components: componentSpecProblems,
    nodeTypes: nodeTypeSpecProblems,
    // A pass's spec is a component's without nodeTypes; a pass may share a component's name
    passes: (type, spec) => componentSpecProblems(type, spec).filter(problem => !problem.endsWith("is a built-in component")),
  };
  for (const kind of KINDS) {
    const specs = raw[kind];
    if (specs === undefined) continue;
    if (!isRecord(specs)) {
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
  /**
   * Every declared plugin recorded what it registers: a type outside the maps is registered by none of them. False when
   * one recorded nothing (an older build – what it registers is known only when it runs) or there is no list
   */
  complete: boolean;
}

/** What the declared plugins registered, from their recorded `registered`; an empty list records nothing, completely */
export const recordedRegistrations = (plugins: unknown): RecordedRegistrations => {
  const recorded = { components: new Map<string, unknown>(), nodeTypes: new Map<string, unknown>(), passes: new Map<string, unknown>(), complete: Array.isArray(plugins) };
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    const registered = isRecord(plugin) ? plugin.registered : undefined;
    if (!isRecord(registered)) {
      recorded.complete = false;
      continue;
    }
    for (const kind of KINDS) {
      const specs = registered[kind];
      if (!isRecord(specs)) continue;
      Object.entries(specs).forEach(([type, spec]) => { if (isRecord(spec)) recorded[kind].set(type, spec); });
    }
  }
  return recorded as RecordedRegistrations;
};

/** Can this engine run a plugin built against `api`? The same MAJOR (RULES #10's rule, for the API) */
export const pluginApiCompatible = (api: string): boolean => api.split(".")[0] === PLUGIN_API_VERSION.split(".")[0];
