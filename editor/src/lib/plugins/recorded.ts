import {
  componentSpec,
  nodeTypeSpec,
  recordedRegistrations,
  registerComponentSpec,
  registerNodeTypeSpec,
  unregisterComponentSpec,
  unregisterNodeTypeSpec,
  type ComponentSpec,
  type NodeTypeSpec,
  type PluginData,
} from "@engine/types";

/**
 * The specs the book's declared plugins recorded (content schema 2.14, `PluginData.registered` – written by the content
 * build, #90) in the shared registry, so the Entity panel shows a plugin component's or node type's rows, and **+ node**
 * lists its node types, before the plugin loaded on the stage or ran in the Code tab. A type something registered
 * already keeps its spec; a plugin that loads or a Run replaces a recorded one (the engine registers over it).
 */

/** What the last adoption added, to take it back when the next book (or the next draft) loads */
let adopted: { components: Map<string, ComponentSpec>; nodeTypes: Map<string, NodeTypeSpec> } = { components: new Map(), nodeTypes: new Map() };

/**
 * Adopt the recorded specs of `plugins` (the draft's declared plugins): first the previous adoption goes – only where
 * the registry still holds that very spec, never one a plugin registered since –, then every recorded type nothing
 * registered joins. Returns the types added.
 */
export const adoptRecordedSpecs = (plugins: readonly PluginData[]): string[] => {
  adopted.components.forEach((spec, type) => { if (componentSpec(type) === spec) unregisterComponentSpec(type); });
  adopted.nodeTypes.forEach((spec, type) => { if (nodeTypeSpec(type) === spec) unregisterNodeTypeSpec(type); });
  adopted = { components: new Map(), nodeTypes: new Map() };
  // A plugin of an older build (nothing recorded) adds nothing; what the others recorded still joins
  const recorded = recordedRegistrations(plugins);
  recorded.components.forEach((spec, type) => {
    if (componentSpec(type)) return;
    registerComponentSpec(type, spec);
    adopted.components.set(type, spec);
  });
  recorded.nodeTypes.forEach((spec, type) => {
    if (nodeTypeSpec(type)) return;
    registerNodeTypeSpec(type, spec);
    adopted.nodeTypes.set(type, spec);
  });
  return [...adopted.components.keys(), ...adopted.nodeTypes.keys()];
};
