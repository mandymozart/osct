import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Mesh, MeshBasicMaterial, ShaderMaterial } from "three";
import { componentProblems, componentSpec, componentTypes, ComponentSpec, EntityData, PLUGIN_API_VERSION, Target } from "../../types/index";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, loadPlugins, PluginApi, PluginError, pluginTypes, uninstallPlugin } from "../plugins";

/** The plugin API 1.0: components and material layers a book's own code registers, kept per plugin */

const SPIN: ComponentSpec = {
  description: "Turns the node around its y axis.",
  params: { degreesPerSecond: { kind: "number", default: 20, min: 0, max: 360, description: "Speed." } },
};
const TINT: ComponentSpec = {
  description: "Tints the pixels.",
  nodeTypes: ["video", "image"],
  params: {
    color: { kind: "color", default: "#f3cc94", description: "The tint." },
    opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." },
  },
};

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });
const noAssets = () => undefined;

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("installPlugin", () => {
  it("registers a component whose spec the panel, the build and the guard read", () => {
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
    expect(componentSpec("spin")).toBe(SPIN);
    expect(componentTypes()).toEqual(["animation", "spin"]);
    expect(pluginTypes("fx")).toEqual(["spin"]);
    expect(componentProblems([{ type: "spin", degreesPerSecond: 30 }], "components", "group")).toEqual([]);
    expect(componentProblems([{ type: "spin", degreesPerSecond: 999 }], "components")).toEqual(["components[0].degreesPerSecond: expected a number from 0 to 360, got 999"]);
  });

  it("hands the plugin the API version and the app's three.js", () => {
    let seen: PluginApi | null = null;
    installPlugin("fx", { default: api => { seen = api; } });
    expect(seen!.version).toBe(PLUGIN_API_VERSION);
    expect(new seen!.three.Group()).toBeInstanceOf(Group);
  });

  it("installing a plugin again replaces its registrations; uninstalling removes them", () => {
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
    installPlugin("fx", { register: api => api.registerComponent("float", SPIN, () => ({})) });
    expect(componentSpec("spin")).toBeUndefined();
    expect(componentSpec("float")).toBe(SPIN);
    uninstallPlugin("fx");
    expect(componentTypes()).toEqual(["animation"]);
    expect(installedPlugins()).toEqual([]);
  });

  it("refuses an invalid spec, a taken type, a module without register – and keeps the previous registration", () => {
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
    expect(() => installPlugin("fx", { register: api => api.registerComponent("Spin", SPIN, () => ({})) })).toThrow(PluginError);
    expect(() => installPlugin("fx", { register: api => api.registerComponent("bad", { description: "x", params: { n: { kind: "number", default: 5, min: 0, max: 1, description: "" } } }, () => ({})) }))
      .toThrow(/min ≤ default ≤ max/);
    expect(() => installPlugin("other", { register: api => api.registerComponent("spin", SPIN, () => ({})) })).toThrow(/registered by the plugin fx/);
    expect(() => installPlugin("fx", { register: api => api.registerComponent("animation", SPIN, () => ({})) })).toThrow(/built-in/);
    expect(() => installPlugin("fx", {})).toThrow(/exports no register/);
    expect(() => installPlugin("fx", { register: () => { throw new Error("boom"); } })).toThrow(/register failed – boom/);
    expect(() => installPlugin("fx", { register: api => api.registerLayer("tint", TINT, { glsl: "" }) })).toThrow(/needs its glsl/);
    expect(componentSpec("spin")).toBe(SPIN);
    expect(pluginTypes("fx")).toEqual(["spin"]);
  });
});

describe("a plugin's component on a node", () => {
  it("is applied when the node is built, with its parameters resolved, and its hooks join the node's", () => {
    const calls: string[] = [];
    let context: Parameters<Parameters<PluginApi["registerComponent"]>[2]>[0] | null = null;
    installPlugin("fx", {
      register: api => api.registerComponent("spin", SPIN, ctx => {
        context = ctx;
        return {
          update: delta => calls.push(`update ${delta}`),
          onFound: () => calls.push("found"),
          onLost: () => calls.push("lost"),
          onTap: () => calls.push("tap"),
          onPause: () => calls.push("pause"),
          dispose: () => calls.push("dispose"),
        };
      }),
    });
    const entity: EntityData = { type: "group", assets: [], components: [{ type: "spin" }], children: [{ type: "text", assets: [], text: "hi" }] };
    const instance = buildEntity(target(entity), noAssets)!;
    expect(context!.params).toEqual({ degreesPerSecond: 20 });
    expect(context!.node).toBe(entity);
    expect(context!.target.id).toBe("t");
    expect(context!.object.parent).toBe(context!.placed);
    expect(instance.nodes![""]).toBe(context!.placed);
    instance.onFound!();
    instance.update!(0.5);
    instance.onTap!();
    instance.onPause!();
    instance.onLost!();
    instance.dispose!();
    expect(calls).toEqual(["found", "update 0.5", "tap", "pause", "lost", "dispose"]);
  });

  it("tunes in place when the component says so, else the node is built anew", () => {
    const tuned: unknown[] = [];
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({ tune: params => { tuned.push(params.degreesPerSecond); return params.degreesPerSecond !== 0; } })) });
    const entity: EntityData = { type: "group", assets: [], components: [{ type: "spin", degreesPerSecond: 30 }] };
    const instance = buildEntity(target(entity), noAssets)!;
    expect(instance.tune!({ ...entity, components: [{ type: "spin", degreesPerSecond: 60 }] })).toBe(true);
    expect(instance.tune!({ ...entity, components: [{ type: "spin", degreesPerSecond: 0 }] })).toBe(false);
    expect(instance.tune!({ ...entity, components: [] })).toBe(false);
    expect(instance.tune!({ ...entity, components: [{ type: "spin" }, { type: "spin" }] })).toBe(false);
    expect(tuned).toEqual([60, 0]);
  });

  it("without a tune, equal parameters tune and changed ones rebuild; an unknown type is ignored with a warning", () => {
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entity: EntityData = { type: "group", assets: [], components: [{ type: "spin", degreesPerSecond: 30 }, { type: "nobody" }] };
    const instance = buildEntity(target(entity), noAssets)!;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No component "nobody"'));
    expect(instance.tune!({ ...entity, components: [{ type: "spin", degreesPerSecond: 30 }, { type: "nobody" }] })).toBe(true);
    expect(instance.tune!({ ...entity, components: [{ type: "spin", degreesPerSecond: 31 }, { type: "nobody" }] })).toBe(false);
  });

  it("a component that throws is logged and the node still builds", () => {
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => { throw new Error("nope"); }) });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const instance = buildEntity(target({ type: "group", assets: [], components: [{ type: "spin" }] }), noAssets);
    expect(instance).not.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spin (plugin fx) failed on t"), expect.any(Error));
  });
});

describe("a plugin's material layer on a node", () => {
  const video: EntityData = { type: "video", assets: [{ id: "v", assetType: "video", src: "/v.mp4" }], components: [{ type: "tint", opacity: 0.5 }] };

  it("is composed into the node's material with a uniform per parameter, and tunes in place", () => {
    installPlugin("fx", { register: api => api.registerLayer("tint", TINT, { glsl: "return mix(rgba, vec4(color, rgba.a), opacity);" }) });
    const instance = buildEntity(target({ ...video, filters: [{ type: "chromaKey", color: "#00ff00" }] }), noAssets)!;
    const mesh = instance.nodes![""].children[0] as Mesh;
    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.osctL0_opacity.value).toBe(0.5);
    expect(material.uniforms.osctL0_color.value.getHexString()).toBe("f3cc94");
    expect(material.fragmentShader).toContain("vec4 osctLayer0(vec4 rgba, vec2 uv, float time, vec3 color, float opacity) {\nreturn mix(rgba, vec4(color, rgba.a), opacity);\n}");
    expect(material.fragmentShader).toContain("gl_FragColor = osctLayer0(gl_FragColor, osctUv, osctTime, osctL0_color, osctL0_opacity);\n  #include <colorspace_fragment>");
    instance.update!(0.25);
    expect(material.uniforms.osctTime.value).toBe(0.25);
    expect(instance.tune!({ ...video, filters: [{ type: "chromaKey", color: "#00ff00" }], components: [{ type: "tint", opacity: 0.9, color: "#ff0000" }] })).toBe(true);
    expect(material.uniforms.osctL0_opacity.value).toBe(0.9);
    expect(material.uniforms.osctL0_color.value.getHexString()).toBe("ff0000");
    expect(instance.tune!({ ...video, filters: [{ type: "chromaKey", color: "#00ff00" }], components: [] })).toBe(false);
  });

  it("reaches a plain video's material through onBeforeCompile, under the dissolve's own injection", () => {
    installPlugin("fx", { register: api => api.registerLayer("tint", TINT, { glsl: "return rgba;" }) });
    const instance = buildEntity(target(video), noAssets)!;
    const material = (instance.nodes![""].children[0] as Mesh).material as MeshBasicMaterial;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: "uniform float x;\nvoid main() {\n  #include <opaque_fragment>\n  #include <colorspace_fragment>\n}" };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.osctL0_opacity.value).toBe(0.5);
    expect(shader.fragmentShader).toContain("#include <opaque_fragment>\n  #ifdef USE_MAP\n  vec2 osctUv = vMapUv;");
    expect(material.customProgramCacheKey()).toMatch(/^layers-\d+-/);
  });

  it("a node of the wrong type builds without the layer (the build and the guard refuse it)", () => {
    installPlugin("fx", { register: api => api.registerLayer("tint", TINT, { glsl: "return rgba;" }) });
    expect(componentProblems([{ type: "tint" }], "components", "group")).toEqual(["components[0]: tint applies to video, image nodes, not to a group"]);
  });
});

describe("loadPlugins", () => {
  it("imports every declared module once and installs it; a failing one is logged, not thrown", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const imported: string[] = [];
    const importer = async (url: string) => {
      imported.push(url);
      if (url.includes("broken")) throw new Error("404");
      return { register: (api: PluginApi) => api.registerComponent("spin", SPIN, () => ({})) };
    };
    const plugins = [{ id: "fx", src: "/p/fx/plugin.js", api: "1.0" }, { id: "broken", src: "/p/broken/plugin.js", api: "1.0" }, { id: "old", src: "/p/old/plugin.js", api: "0.9" }];
    await loadPlugins(plugins, importer);
    await loadPlugins(plugins, importer);
    expect(imported).toEqual(["/p/fx/plugin.js", "/p/broken/plugin.js", "/p/broken/plugin.js"]);
    expect(installedPlugins()).toEqual(["fx"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("broken"), expect.any(Error));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("plugin API 0.9"));
  });
});
