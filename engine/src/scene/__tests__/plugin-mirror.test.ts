import { afterEach, describe, expect, it, vi } from "vitest";
import { Group } from "three";
import {
  componentSpec, type ComponentSpec, type EntityData, materialSpec, type MaterialSpec, nodeTypeSpec, type NodeTypeSpec, type PassSpec, type Target,
  textureSpec, type TextureSpec,
} from "../../types/index";
import { buildEntity } from "../entities";
import { materialRegistration } from "../materials";
import {
  buildPluginNode, installedPlugins, installPlugin, mirrorPluginRegistry, nodeTypeFailure, nodeTypeRegistration, pluginRegistrySnapshot, pluginTypes,
  type PluginRegistrySnapshot, uninstallPlugin,
} from "../plugins";
import { passRegistration } from "../post/registry";

/**
 * The registry as data (#234): the editor's stage frame runs the plugins and sends `pluginRegistrySnapshot`; the page,
 * which runs no plugin code, mirrors it so its panels read the same specs, owners and build failures.
 */

const SPIN: ComponentSpec = { description: "Spins.", params: { speed: { kind: "number", default: 1, min: 0, max: 5, description: "Speed." } } };
const TINT: ComponentSpec = { description: "Tints.", nodeTypes: ["image"], params: { color: { kind: "color", default: "#ff0000", description: "Tint." } } };
const SPARKLE: NodeTypeSpec = { description: "Points.", params: { count: { kind: "number", default: 5, min: 1, max: 50, description: "How many." } } };
const WATER: MaterialSpec = { description: "Water.", params: { deep: { kind: "color", default: "#0b4f6c", description: "Deep." } } };
const CAUSTICS: TextureSpec = { description: "Light.", params: { cells: { kind: "number", default: 3, min: 1, max: 8, description: "Cells." } } };
const HALO: PassSpec = { description: "A halo.", params: { strength: { kind: "number", default: 0.5, min: 0, max: 1, description: "How strong." } } };

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });

/** A plugin that registers one of every kind – its code counts the calls */
const calls: string[] = [];
const installFx = () => installPlugin("fx", {
  register: api => {
    api.registerComponent("spin", SPIN, () => { calls.push("spin"); return {}; });
    api.registerLayer("tint", TINT, { glsl: "return rgba;" });
    api.registerNodeType("sparkle", SPARKLE, ({ three }) => { calls.push("sparkle"); return { object: new three.Group() }; });
    api.registerMaterial("water", WATER, ({ three }) => new three.MeshBasicMaterial());
    api.registerTexture("caustics", CAUSTICS, ({ three }) => ({ texture: new three.Texture() }));
    api.registerPass("halo", HALO, ({ shaderPass }) => shaderPass("void main() { gl_FragColor = texture2D(tDiffuse, vUv); }"));
  },
});

afterEach(() => {
  mirrorPluginRegistry({ plugins: {}, failures: {} });
  installedPlugins().forEach(uninstallPlugin);
  calls.length = 0;
  vi.restoreAllMocks();
});

describe("pluginRegistrySnapshot", () => {
  it("lists every installed plugin's specs by kind, as plain data", () => {
    installFx();
    const snapshot = pluginRegistrySnapshot();
    expect(snapshot.plugins.fx).toEqual({
      components: { spin: SPIN }, layers: { tint: TINT }, nodeTypes: { sparkle: SPARKLE }, materials: { water: WATER }, textures: { caustics: CAUSTICS }, passes: { halo: HALO },
    });
    // Copies – a structured clone of it never meets the plugin's own objects or a function
    expect(snapshot.plugins.fx.components.spin).not.toBe(SPIN);
    expect(() => structuredClone(snapshot)).not.toThrow();
    expect(snapshot.failures).toEqual({});
  });

  it("carries the node types whose build failed, with why", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installPlugin("broken", { register: api => api.registerNodeType("crash", SPARKLE, () => { throw new Error("no fish"); }) });
    expect(buildPluginNode({ type: "crash", assets: [] }, target({ type: "crash", assets: [] }), () => undefined)).toBeNull();
    expect(pluginRegistrySnapshot().failures).toEqual({ crash: "Error: no fish" });
  });
});

describe("mirrorPluginRegistry", () => {
  /** The frame's snapshot, taken and then the frame's own registrations removed – as the page sees the registry */
  const frameSnapshot = (): PluginRegistrySnapshot => {
    installFx();
    const snapshot = structuredClone(pluginRegistrySnapshot());
    uninstallPlugin("fx");
    expect(componentSpec("spin")).toBeUndefined();
    return snapshot;
  };

  it("registers the specs with their owner, so the panels read them as the frame's", () => {
    const snapshot = frameSnapshot();
    expect(mirrorPluginRegistry(snapshot)).toEqual([]);
    expect(installedPlugins()).toEqual(["fx"]);
    expect(pluginTypes("fx")).toEqual(["spin", "tint"]);
    expect(componentSpec("spin")).toEqual(SPIN);
    expect(componentSpec("tint")).toEqual(TINT);
    expect(nodeTypeSpec("sparkle")).toEqual(SPARKLE);
    expect(nodeTypeRegistration("sparkle")?.plugin).toBe("fx");
    expect(materialSpec("water")).toEqual(WATER);
    expect(materialRegistration("water")?.plugin).toBe("fx");
    expect(textureSpec("caustics")).toEqual(CAUSTICS);
    expect(passRegistration("halo")).toMatchObject({ owner: "fx", spec: HALO });
  });

  it("runs none of the plugin's code: a mirrored node type builds nothing, a mirrored component does nothing", () => {
    mirrorPluginRegistry(frameSnapshot());
    expect(buildPluginNode({ type: "sparkle", assets: [] }, target({ type: "sparkle", assets: [] }), () => undefined)).toBeNull();
    const built = buildEntity(target({ type: "group", assets: [], components: [{ type: "spin" }] }), () => undefined);
    expect(built?.object).toBeInstanceOf(Group);
    expect(calls).toEqual([]);
    expect(() => passRegistration("halo")!.factory({} as never)).toThrow(/runs no code/);
  });

  it("takes the snapshot's build failures", () => {
    mirrorPluginRegistry({ ...frameSnapshot(), failures: { sparkle: "TypeError: x is undefined" } });
    expect(nodeTypeFailure("sparkle")).toBe("TypeError: x is undefined");
    mirrorPluginRegistry({ ...pluginRegistrySnapshot(), failures: {} });
    expect(nodeTypeFailure("sparkle")).toBeUndefined();
  });

  it("follows the next snapshot: a changed plugin is registered anew, a plugin no longer in it leaves", () => {
    const snapshot = frameSnapshot();
    mirrorPluginRegistry(snapshot);
    const fewer: PluginRegistrySnapshot = { plugins: { fx: { ...snapshot.plugins.fx, components: {}, layers: {} } }, failures: {} };
    mirrorPluginRegistry(fewer);
    expect(componentSpec("spin")).toBeUndefined();
    expect(nodeTypeSpec("sparkle")).toEqual(SPARKLE);
    mirrorPluginRegistry({ plugins: {}, failures: {} });
    expect(installedPlugins()).toEqual([]);
    expect(nodeTypeSpec("sparkle")).toBeUndefined();
    expect(passRegistration("halo")).toBeUndefined();
  });

  it("checks a mirrored spec like a plugin's own: an invalid one is refused and named", () => {
    const bad: PluginRegistrySnapshot = {
      plugins: { fx: { components: { Spin: SPIN }, layers: {}, nodeTypes: {}, materials: {}, textures: {}, passes: {} } },
      failures: {},
    };
    const problems = mirrorPluginRegistry(bad);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^fx: /);
    expect(installedPlugins()).toEqual([]);
  });
});
