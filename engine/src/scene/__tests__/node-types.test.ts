import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, type Points, Texture } from "three";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import {
  type ComponentSpec, type EntityData, isKnownNodeType, nodeAssetTypes, type NodeTypeSpec, nodeTypeSpec, nodeTypeSpecProblems, nodeTypes, pluginNodeTypes, type Target,
} from "../../types/index";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, type NodeTypeContext, PluginError, pluginNodeTypesOf, uninstallPlugin } from "../plugins";
import type { LoadedAsset } from "../assets";

/** Plugin API 1.2: a plugin's own node type – the plugin builds the object, the engine places it like every node */

const SPARKLE: NodeTypeSpec = {
  description: "Points around the node.",
  params: {
    count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." },
    color: { kind: "color", default: "#ffffff", description: "Their colour." },
  },
};
const POSTER: NodeTypeSpec = { description: "A picture.", src: "image", params: {} };
const SPIN: ComponentSpec = { description: "Spins.", params: {} };

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });
const noAssets = () => undefined;

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("registerNodeType", () => {
  it("joins the node type registry the panel, the build and the guard read – ENTITY_TYPES stays the built-in list", () => {
    installPlugin("fx", { register: api => { api.registerNodeType("sparkle", SPARKLE, ({ three }) => ({ object: new three.Group() })); api.registerNodeType("poster", POSTER, ({ three }) => ({ object: new three.Group() })); } });
    expect(nodeTypeSpec("sparkle")).toBe(SPARKLE);
    expect(pluginNodeTypes()).toEqual(["sparkle", "poster"]);
    expect(nodeTypes()).toEqual(["group", "model", "video", "image", "text", "light", "sparkle", "poster"]);
    expect(pluginNodeTypesOf("fx")).toEqual(["sparkle", "poster"]);
    expect(isKnownNodeType("sparkle")).toBe(true);
    expect(isKnownNodeType("model")).toBe(true);
    expect(isKnownNodeType("nobody")).toBe(false);
    expect(nodeAssetTypes("poster")).toEqual(["image"]);
    expect(nodeAssetTypes("sparkle")).toEqual([]);
    expect(nodeAssetTypes("model")).toEqual(["glb", "gltf"]);
    expect(nodeAssetTypes("nobody")).toBeUndefined();
  });

  it("installing again replaces the plugin's node types; uninstalling removes them", () => {
    installPlugin("fx", { register: api => api.registerNodeType("sparkle", SPARKLE, ({ three }) => ({ object: new three.Group() })) });
    installPlugin("fx", { register: api => api.registerNodeType("glitter", SPARKLE, ({ three }) => ({ object: new three.Group() })) });
    expect(nodeTypeSpec("sparkle")).toBeUndefined();
    expect(pluginNodeTypes()).toEqual(["glitter"]);
    uninstallPlugin("fx");
    expect(pluginNodeTypes()).toEqual([]);
    expect(installedPlugins()).toEqual([]);
  });

  it("refuses an invalid spec, a built-in or taken type, a missing build – and keeps the previous registration", () => {
    const build = () => ({ object: new Group() });
    installPlugin("fx", { register: api => api.registerNodeType("sparkle", SPARKLE, build) });
    expect(() => installPlugin("fx", { register: api => api.registerNodeType("model", SPARKLE, build) })).toThrow(/"model" is a built-in node type/);
    expect(() => installPlugin("fx", { register: api => api.registerNodeType("Sparkle", SPARKLE, build) })).toThrow(PluginError);
    expect(() => installPlugin("other", { register: api => api.registerNodeType("sparkle", SPARKLE, build) })).toThrow(/registered by the plugin fx/);
    expect(() => installPlugin("fx", { register: api => { api.registerNodeType("a", SPARKLE, build); api.registerNodeType("a", SPARKLE, build); } })).toThrow(/registered twice/);
    expect(() => installPlugin("fx", { register: api => api.registerNodeType("a", SPARKLE, null as never) })).toThrow(/needs a build/);
    expect(nodeTypeSpec("sparkle")).toBe(SPARKLE);
    expect(pluginNodeTypesOf("fx")).toEqual(["sparkle"]);
  });

  it("checks the spec: its name, src, the placement's names, every parameter", () => {
    expect(nodeTypeSpecProblems("sparkle", SPARKLE)).toEqual([]);
    expect(nodeTypeSpecProblems("a".repeat(33), SPARKLE)).toEqual([`"${"a".repeat(33)}" is not a node type (camelCase letters and digits, e.g. sparkle)`]);
    expect(nodeTypeSpecProblems("x", { description: "d", src: "audio", params: { scale: { kind: "number", default: 5, min: 0, max: 1, description: "s" } } })).toEqual([
      "x: src must be one of none, glb, video, image",
      "x.scale: the placement's name – a node type's parameter needs another",
      "x.scale: a number needs min ≤ default ≤ max",
    ]);
    expect(nodeTypeSpecProblems("x", null)).toEqual(["x: the spec must be an object with description and params"]);
  });
});

describe("a node of a plugin's type", () => {
  it("is built by the plugin and placed by the engine: placement, children, components, hooks", () => {
    const calls: string[] = [];
    let context: NodeTypeContext | null = null;
    let points: Points | null = null;
    let componentObject: unknown = null;
    installPlugin("fx", {
      register: api => {
        api.registerNodeType("sparkle", SPARKLE, ctx => {
          context = ctx;
          points = new ctx.three.Points();
          return { object: points, update: delta => calls.push(`update ${delta}`), onFound: () => calls.push("found"), dispose: () => calls.push("dispose") };
        });
        api.registerComponent("spin", SPIN, ({ object }) => { componentObject = object; return { onFound: () => calls.push("spin found") }; });
      },
    });
    const node: EntityData = {
      type: "sparkle", assets: [], params: { position: [0, 0.5, 0], count: 120 },
      components: [{ type: "spin" }], children: [{ type: "text", assets: [], text: "hi" }],
    };
    const instance = buildEntity(target(node), noAssets)!;
    expect(context!.params).toEqual({ count: 120, color: "#ffffff" });
    expect(context!.node).toBe(node);
    expect(context!.asset).toBeUndefined();
    const placed = instance.nodes![""];
    expect(placed.position.y).toBe(0.5);
    expect(points!.parent).toBe(placed);
    expect(placed.children).toHaveLength(2); // the sparkle's object and the text's placement group
    expect(instance.nodes!["0"]).toBeDefined();
    expect(componentObject).toBe(points);
    instance.onFound!();
    instance.update!(0.25);
    instance.dispose!();
    expect(calls).toEqual(["found", "spin found", "update 0.25", "dispose"]);
  });

  it("gets its file loaded (shared – the asset of the scene)", () => {
    const texture = new Texture();
    let seen: LoadedAsset | undefined;
    installPlugin("fx", { register: api => api.registerNodeType("poster", POSTER, ({ asset, three }) => { seen = asset; return { object: new three.Group() }; }) });
    buildEntity(target({ type: "poster", assets: [{ id: "p", assetType: "image", src: "/p.jpg" }] }), id => (id === "p" ? { assetType: "image", texture } : undefined));
    expect(seen).toEqual({ assetType: "image", texture });
  });

  it("tunes through its own tune, without one only for equal parameters; another file or type rebuilds", () => {
    const tuned: unknown[] = [];
    installPlugin("fx", {
      register: api => {
        api.registerNodeType("sparkle", SPARKLE, ({ three }) => ({ object: new three.Group(), tune: params => { tuned.push(params.color); return params.count === 120; } }));
        api.registerNodeType("plain", SPARKLE, ({ three }) => ({ object: new three.Group() }));
      },
    });
    const node: EntityData = { type: "sparkle", assets: [], params: { count: 120 } };
    const instance = buildEntity(target(node), noAssets)!;
    expect(instance.tune!({ ...node, params: { count: 120, position: [0, 1, 0] } })).toBe(true); // placement only: no call
    expect(instance.tune!({ ...node, params: { count: 120, color: "#ff0000" } })).toBe(true);
    expect(instance.tune!({ ...node, params: { count: 7 } })).toBe(false);
    expect(instance.tune!({ ...node, type: "plain" })).toBe(false);
    expect(tuned).toEqual(["#ff0000", "#ffffff"]);

    const plain: EntityData = { type: "plain", assets: [], params: { count: 3 } };
    const other = buildEntity(target(plain), noAssets)!;
    expect(other.tune!({ ...plain })).toBe(true);
    expect(other.tune!({ ...plain, params: { count: 4 } })).toBe(false);
    expect(other.tune!({ ...plain, assets: [{ id: "x", assetType: "image", src: "/x.jpg" }] })).toBe(false);
  });

  it("a build that throws or returns no object is logged: the node renders nothing and keeps its children", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    installPlugin("fx", {
      register: api => {
        api.registerNodeType("broken", SPARKLE, () => { throw new Error("nope"); });
        api.registerNodeType("empty", SPARKLE, () => ({ object: "no" as never }));
      },
    });
    const instance = buildEntity(target({ type: "broken", assets: [], children: [{ type: "group", assets: [] }] }), noAssets)!;
    expect(instance.nodes![""].children).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("the node type broken (plugin fx) failed on t"), expect.any(Error));
    expect(buildEntity(target({ type: "empty", assets: [] }), noAssets)).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("the node type empty (plugin fx) returned no three.js object on t"));
  });

  it("a type nobody registered renders nothing with a warning (a newer content's, or its plugin did not load)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(buildEntity(target({ type: "sparkle", assets: [] }), noAssets)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No builder for node type "sparkle"'));
  });
});

describe("the guard and a plugin's node type", () => {
  const config = (entity: unknown, plugins?: unknown[]) => ({
    version: { version: "1.31.0", timestamp: "2026-10-30T00:00:00.000Z", schema: "2.13" },
    book: { id: "b", title: "B", author: "A" },
    initialSpreadId: "s1",
    spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
    entries: [{ id: "e1", category: "glossary", title: "E", page: 1, body: "", tags: [], target: { id: "e1", imageSrc: "/t.jpg", entity } }],
    entities: {},
    tutorial: [],
    ...(plugins ? { plugins } : {}),
  });
  const problemsOf = (raw: unknown): string[] => {
    try {
      assertGameConfiguration(raw);
      return [];
    } catch (error) {
      if (error instanceof GameConfigurationError) return error.problems;
      throw error;
    }
  };
  const PLUGINS = [{ id: "fx", src: "/assets/content/plugins/fx/plugin.js", api: "1.2" }];

  it("a registered type passes with its parameters checked against its spec", () => {
    installPlugin("fx", { register: api => api.registerNodeType("sparkle", SPARKLE, ({ three }) => ({ object: new three.Group() })) });
    expect(problemsOf(config({ type: "sparkle", assets: [], params: { position: [0, 0, 0], count: 120 } }))).toEqual([]);
    expect(problemsOf(config({ type: "sparkle", assets: [], params: { count: 0, glow: 1 } }))).toEqual([
      "entries[0].target.entity.params.count: expected a number from 1 to 500, got 0",
      "entries[0].target.entity.params.glow: unknown parameter of sparkle (position, rotation, scale, count, color)",
    ]);
  });

  it("with plugins declared an unregistered type passes quietly (its plugin registers it when it loads); without, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(problemsOf(config({ type: "sparkle", assets: [], params: { count: 0 } }, PLUGINS))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(problemsOf(config({ type: "sparkle", assets: [] }))).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"sparkle" is not a node type this app knows'));
  });
});
