import { afterEach, describe, expect, it } from "vitest";
import { componentSpec, nodeTypeSpec, pluginNodeTypes, type EntityData, type PluginData } from "@engine/types";
import { installedPlugins, installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import { componentRows, componentTypesFor, nodeTypeRows } from "../../values";
import { adoptRecordedSpecs } from "../recorded";

/** The specs the declared plugins recorded (schema 2.14, #90): the Entity panel's rows before a plugin loads or runs */

const TINT = { description: "Tints.", nodeTypes: ["video"], params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." } } } as const;
const SPARKLE = { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } } as const;

const declared = (registered?: PluginData["registered"]): PluginData => ({ id: "fx", src: "/assets/content/plugins/fx/plugin.js", api: "1.2", ...(registered ? { registered } : {}) });

afterEach(() => {
  adoptRecordedSpecs([]);
  installedPlugins().forEach(uninstallPlugin);
});

describe("the recorded specs of the declared plugins", () => {
  it("give a plugin component and a plugin node type their rows before the plugin ran", () => {
    expect(adoptRecordedSpecs([declared({ components: { tint: TINT }, nodeTypes: { sparkle: SPARKLE }, passes: {} })])).toEqual(["tint", "sparkle"]);
    const video = { type: "video", assets: [], components: [{ type: "tint", opacity: 0.5 }] } as EntityData;
    expect(componentRows(video.components![0], 0).map(row => row.id)).toEqual(["components.0.opacity"]);
    expect(componentTypesFor("video")).toContain("tint");
    expect(componentTypesFor("model")).not.toContain("tint");
    expect(nodeTypeRows("sparkle").map(row => row.id)).toEqual(["params.count"]);
    expect(pluginNodeTypes()).toContain("sparkle");
  });

  it("go when the next draft loads, and a plugin without recorded specs adds nothing", () => {
    adoptRecordedSpecs([declared({ components: { tint: TINT } })]);
    expect(componentSpec("tint")).toBeDefined();
    expect(adoptRecordedSpecs([declared()])).toEqual([]);
    expect(componentSpec("tint")).toBeUndefined();
  });

  it("never replace or remove what a plugin registered", () => {
    adoptRecordedSpecs([declared({ nodeTypes: { sparkle: SPARKLE } })]);
    // The plugin loads (or runs) with a newer spec: it registers over the recorded one
    const live = { description: "Live points.", params: {} };
    installPlugin("fx", { register: api => api.registerNodeType("sparkle", live, ({ three }) => ({ object: new three.Group() })) });
    expect(nodeTypeSpec("sparkle")).toBe(live);
    adoptRecordedSpecs([declared({ nodeTypes: { sparkle: SPARKLE } })]);
    expect(nodeTypeSpec("sparkle")).toBe(live);
    adoptRecordedSpecs([]);
    expect(nodeTypeSpec("sparkle")).toBe(live);
  });
});
