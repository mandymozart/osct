import {
  componentSpec,
  materialSpec,
  nodeTypeSpec,
  recordedRegistrations,
  registerComponentSpec,
  registerMaterialSpec,
  registerNodeTypeSpec,
  registerTextureSpec,
  textureSpec,
  unregisterComponentSpec,
  unregisterMaterialSpec,
  unregisterNodeTypeSpec,
  unregisterTextureSpec,
  type ComponentSpec,
  type MaterialSpec,
  type NodeTypeSpec,
  type PluginData,
  type TextureSpec,
} from "@engine/types";

/**
 * The specs the book's declared plugins recorded (content schema 2.14, `PluginData.registered` – written by the content
 * build, #90) in the shared registry, so the Entity panel shows a plugin component's, node type's or material's rows,
 * **+ node** lists its node types and a texture row its procedural textures (#188), before the plugin loaded on the stage
 * or ran in the Code tab. A type something registered already keeps its spec; a plugin that loads or a Run replaces a
 * recorded one (the engine registers over it).
 */

interface Adopted {
  components: Map<string, ComponentSpec>;
  nodeTypes: Map<string, NodeTypeSpec>;
  materials: Map<string, MaterialSpec>;
  textures: Map<string, TextureSpec>;
}

const empty = (): Adopted => ({ components: new Map(), nodeTypes: new Map(), materials: new Map(), textures: new Map() });

/** What the last adoption added, to take it back when the next book (or the next draft) loads */
let adopted: Adopted = empty();

/** Per kind: how the registry reads, adds and drops a spec */
const REGISTRIES = {
  components: { get: componentSpec, add: registerComponentSpec, drop: unregisterComponentSpec },
  nodeTypes: { get: nodeTypeSpec, add: registerNodeTypeSpec, drop: unregisterNodeTypeSpec },
  materials: { get: materialSpec, add: registerMaterialSpec, drop: unregisterMaterialSpec },
  textures: { get: textureSpec, add: registerTextureSpec, drop: unregisterTextureSpec },
} as const;

const KINDS = Object.keys(REGISTRIES) as Array<keyof Adopted>;

/**
 * Adopt the recorded specs of `plugins` (the draft's declared plugins): first the previous adoption goes – only where
 * the registry still holds that very spec, never one a plugin registered since –, then every recorded type nothing
 * registered joins. Returns the types added.
 */
export const adoptRecordedSpecs = (plugins: readonly PluginData[]): string[] => {
  for (const kind of KINDS) {
    const registry = REGISTRIES[kind] as { get(type: string): unknown; drop(type: string): void };
    adopted[kind].forEach((spec, type) => { if (registry.get(type) === spec) registry.drop(type); });
  }
  adopted = empty();
  // A plugin of an older build (nothing recorded) adds nothing; what the others recorded still joins
  const recorded = recordedRegistrations(plugins);
  for (const kind of KINDS) {
    const registry = REGISTRIES[kind] as { get(type: string): unknown; add(type: string, spec: unknown): void };
    (recorded[kind] as Map<string, unknown>).forEach((spec, type) => {
      if (registry.get(type)) return;
      registry.add(type, spec);
      (adopted[kind] as Map<string, unknown>).set(type, spec);
    });
  }
  return KINDS.flatMap(kind => [...adopted[kind].keys()]);
};
