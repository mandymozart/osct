import { afterEach, describe, expect, it, vi } from "vitest";
import {
  componentSpec, type ComponentSpec, type EntityData, materialSpec, type MaterialSpec, nodeTypeSpec, type NodeTypeSpec, type PassSpec, type Target,
  textureSpec, type TextureSpec,
} from "../../types/index";
import { materialRegistration } from "../materials";
import {
  buildPluginNode, installedPlugins, installPlugin, keepPlugin, pluginRegistryRevision, loadPlugins, nodeTypeFailure, nodeTypeRegistration, pluginRegistrySnapshot, pluginTypes,
  type PluginModule, resetPlugins, uninstallPlugin,
} from "../plugins";
import { PLUGIN_API_VERSION } from "../../types/index";
import { passRegistration } from "../post/registry";

/**
 * The registry as data – what a publish declares of the plugins that ran on the editor's stage – and its reset when the
 * editor's workspace closes (#340: the stage runs in the editor's page, the registry is the page's).
 */

const SPIN: ComponentSpec = { description: "Spins.", params: { speed: { kind: "number", default: 1, min: 0, max: 5, description: "Speed." } } };
const TINT: ComponentSpec = { description: "Tints.", nodeTypes: ["image"], params: { color: { kind: "color", default: "#ff0000", description: "Tint." } } };
const SPARKLE: NodeTypeSpec = { description: "Points.", params: { count: { kind: "number", default: 5, min: 1, max: 50, description: "How many." } } };
const WATER: MaterialSpec = { description: "Water.", params: { deep: { kind: "color", default: "#0b4f6c", description: "Deep." } } };
const CAUSTICS: TextureSpec = { description: "Light.", params: { cells: { kind: "number", default: 3, min: 1, max: 8, description: "Cells." } } };
const HALO: PassSpec = { description: "A halo.", params: { strength: { kind: "number", default: 0.5, min: 0, max: 1, description: "How strong." } } };

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", sceneId: "s", imageSrc: "/t.jpg", entity });

/** A plugin that registers one of every kind – its code counts the calls */
const SOFT_FADE = { description: "Fades in and out.", params: {} };
const calls: string[] = [];
const installFx = () => installPlugin("fx", {
  register: api => {
    api.registerComponent("spin", SPIN, () => { calls.push("spin"); return {}; });
    api.registerLayer("tint", TINT, { glsl: "return rgba;" });
    api.registerNodeType("sparkle", SPARKLE, ({ three }) => { calls.push("sparkle"); return { object: new three.Group() }; });
    api.registerMaterial("water", WATER, ({ three }) => new three.MeshBasicMaterial());
    api.registerTexture("caustics", CAUSTICS, ({ three }) => ({ texture: new three.Texture() }));
    api.registerPass("halo", HALO, ({ shaderPass }) => shaderPass("void main() { gl_FragColor = texture2D(tDiffuse, vUv); }"));
    api.registerAppearance("softFade", SOFT_FADE, () => ({ duration: 100, update: () => {} }));
  },
});

afterEach(() => {
  resetPlugins();
  calls.length = 0;
  vi.restoreAllMocks();
});

describe("pluginRegistrySnapshot", () => {
  it("lists every installed plugin's specs by kind, as plain data", () => {
    installFx();
    const snapshot = pluginRegistrySnapshot();
    expect(snapshot.plugins.fx).toEqual({
      components: { spin: SPIN }, layers: { tint: TINT }, nodeTypes: { sparkle: SPARKLE }, materials: { water: WATER }, textures: { caustics: CAUSTICS }, passes: { halo: HALO },
      appearances: { softFade: SOFT_FADE },
    });
    // Copies – the plugin's own objects stay its own
    expect(snapshot.plugins.fx.components.spin).not.toBe(SPIN);
    expect(snapshot.failures).toEqual({});
  });

  it("carries the node types whose build failed, with why", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installPlugin("broken", { register: api => api.registerNodeType("crash", SPARKLE, () => { throw new Error("no fish"); }) });
    expect(buildPluginNode({ type: "crash", assets: [] }, target({ type: "crash", assets: [] }), () => undefined)).toBeNull();
    expect(pluginRegistrySnapshot().failures).toEqual({ crash: "Error: no fish" });
  });
});

describe("resetPlugins (#340: the editor's workspace closes)", () => {
  it("empties the registry and the build failures, and forgets the plugins the editor kept", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installFx();
    installPlugin("broken", { register: api => api.registerNodeType("crash", SPARKLE, () => { throw new Error("no fish"); }) });
    buildPluginNode({ type: "crash", assets: [] }, target({ type: "crash", assets: [] }), () => undefined);
    keepPlugin("fx");
    resetPlugins();
    expect(installedPlugins()).toEqual([]);
    expect([componentSpec("spin"), nodeTypeSpec("sparkle"), materialSpec("water"), textureSpec("caustics")]).toEqual([undefined, undefined, undefined, undefined]);
    expect(materialRegistration("water")).toBeUndefined();
    expect(passRegistration("halo")).toBeUndefined();
    expect(nodeTypeFailure("crash")).toBeUndefined();
    expect(nodeTypeRegistration("crash")).toBeUndefined();
    // The kept mark went with it: the content's module of that id loads again
    const importer = vi.fn(async () => ({ register: (api: Parameters<NonNullable<PluginModule["register"]>>[0]) => api.registerComponent("spin", SPIN, () => ({})) }));
    await loadPlugins([{ id: "fx", src: "/p/fx/plugin.js", api: PLUGIN_API_VERSION }], importer);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(pluginTypes("fx")).toEqual(["spin"]);
    expect(calls).toEqual([]);
  });
});

describe("pluginRegistryRevision (#340: the editor's panels read the registry again only when it changed)", () => {
  it("moves with an install, an uninstall and a node type's build failing or building again – not with a build that changes nothing", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const start = pluginRegistryRevision();
    installFx();
    const installed = pluginRegistryRevision();
    expect(installed).toBeGreaterThan(start);
    buildPluginNode({ type: "sparkle", assets: [] }, target({ type: "sparkle", assets: [] }), () => undefined);
    expect(pluginRegistryRevision()).toBe(installed);
    installPlugin("broken", { register: api => api.registerNodeType("crash", SPARKLE, () => { throw new Error("no fish"); }) });
    const broken = pluginRegistryRevision();
    buildPluginNode({ type: "crash", assets: [] }, target({ type: "crash", assets: [] }), () => undefined);
    expect(pluginRegistryRevision()).toBe(broken + 1);
    buildPluginNode({ type: "crash", assets: [] }, target({ type: "crash", assets: [] }), () => undefined);
    expect(pluginRegistryRevision()).toBe(broken + 1);
    uninstallPlugin("broken");
    expect(pluginRegistryRevision()).toBe(broken + 2);
  });
});
