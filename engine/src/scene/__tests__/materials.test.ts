import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, Texture } from "three";
import {
  type EntityData, type MaterialSpec, materialSpec, materialTypes, materialTypesFor, type Target, textureSource, type TextureSpec, textureSpec, textureTypes,
} from "../../types/index";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, PluginError, pluginMaterialsOf, pluginTexturesOf, uninstallPlugin } from "../plugins";
import { OWNED_MATERIAL } from "../materials";

/** Plugin API 1.4 (#188): a whole material and a procedural texture of a plugin's own */

const WATER: MaterialSpec = {
  description: "Water.",
  params: {
    deep: { kind: "color", default: "#0b4f6c", description: "Deep." },
    ripples: { kind: "texture", default: "", description: "Ripples." },
  },
};
const CAUSTICS: TextureSpec = { description: "Light.", params: { cells: { kind: "number", default: 3, min: 1, max: 8, description: "Cells." } } };

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });
const noAssets = () => undefined;
const image = (material?: EntityData["material"], extra: Partial<EntityData> = {}): EntityData => ({ type: "image", assets: [], ...(material ? { material } : {}), ...extra });
const meshOf = (entity: ReturnType<typeof buildEntity>): Mesh => {
  let found: Mesh | null = null;
  entity!.object.traverse(child => { if (!found && (child as Mesh).isMesh) found = child as Mesh; });
  return found!;
};

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("registerMaterial and registerTexture", () => {
  it("join the registries the panel, the build and the guard read; uninstalling removes them", () => {
    installPlugin("water", {
      register: api => {
        api.registerTexture("caustics", CAUSTICS, ({ three }) => new three.DataTexture(new Uint8Array(4), 1, 1));
        api.registerMaterial("water", WATER, ({ three }) => new three.ShaderMaterial());
        api.registerMaterial("glass", { ...WATER, nodeTypes: ["model"] }, ({ three }) => new three.MeshBasicMaterial());
      },
    });
    expect(materialSpec("water")).toBe(WATER);
    expect(textureSpec("caustics")).toBe(CAUSTICS);
    expect(materialTypes()).toEqual(["water", "glass"]);
    expect(materialTypesFor("image")).toEqual(["water"]);
    expect(textureTypes()).toEqual(["caustics"]);
    expect([pluginMaterialsOf("water"), pluginTexturesOf("water")]).toEqual([["water", "glass"], ["caustics"]]);
    uninstallPlugin("water");
    expect([materialTypes(), textureTypes()]).toEqual([[], []]);
  });

  it("refuse an invalid spec, a type another plugin registers, a missing build – the previous registration stays", () => {
    installPlugin("a", { register: api => api.registerMaterial("water", WATER, ({ three }) => new three.ShaderMaterial()) });
    expect(() => installPlugin("b", { register: api => api.registerMaterial("water", WATER, ({ three }) => new three.ShaderMaterial()) })).toThrow(/registered by the plugin a/);
    expect(() => installPlugin("b", { register: api => api.registerMaterial("Water", WATER, ({ three }) => new three.ShaderMaterial()) })).toThrow(PluginError);
    expect(() => installPlugin("b", { register: api => api.registerTexture("noise", { description: "x", params: { t: { kind: "texture", default: "", description: "x" } } }, () => null) })).toThrow(/cannot be a texture/);
    expect(() => installPlugin("a", { register: api => api.registerMaterial("lava", WATER, undefined as never) })).toThrow(/needs a build/);
    expect(materialSpec("water")).toBe(WATER);
  });
});

describe("a node's material", () => {
  it("replaces the material of the node's meshes; the build gets the values, time and the node's own picture", () => {
    const build = vi.fn(({ params, time, three }) => new three.ShaderMaterial({ uniforms: { time, deep: { value: new three.Color(String(params.deep)) } } }));
    installPlugin("water", { register: api => api.registerMaterial("water", WATER, build) });
    const entity = buildEntity(target(image({ type: "water", params: { deep: "#112233" } })), noAssets)!;
    const mesh = meshOf(entity);
    expect(mesh.material).toBeInstanceOf(ShaderMaterial);
    expect((mesh.material as ShaderMaterial).userData[OWNED_MATERIAL]).toBe(true);
    const context = build.mock.calls[0][0];
    expect(context.params).toMatchObject({ deep: "#112233", ripples: null });
    expect(context.map).toBeNull();
    entity.update!(0.5);
    entity.update!(0.25);
    expect(context.time.value).toBeCloseTo(0.75);
  });

  it("tunes in place through its tune; another type, or none, builds the node anew", () => {
    const tune = vi.fn(() => true);
    installPlugin("water", {
      register: api => {
        api.registerMaterial("water", WATER, ({ three }) => ({ material: new three.ShaderMaterial(), tune }));
        api.registerMaterial("ink", WATER, ({ three }) => new three.MeshBasicMaterial());
      },
    });
    const entity = buildEntity(target(image({ type: "water" })), noAssets)!;
    expect(entity.tune!(image({ type: "water", params: { deep: "#000000" } }))).toBe(true);
    expect(tune).toHaveBeenCalledWith(expect.objectContaining({ deep: "#000000", ripples: null }));
    expect(entity.tune!(image({ type: "ink" }))).toBe(false);
    expect(entity.tune!(image())).toBe(false);
    // Another texture: built anew
    expect(entity.tune!(image({ type: "water", params: { ripples: "/a.jpg" } }))).toBe(false);
  });

  it("an unknown material leaves the node's own (logged); dispose gives the meshes their own back", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const own = meshOf(buildEntity(target(image({ type: "lava" })), noAssets));
    expect(own.material).toBeInstanceOf(MeshBasicMaterial);
    const dispose = vi.fn();
    installPlugin("water", { register: api => api.registerMaterial("water", WATER, ({ three }) => ({ material: new three.ShaderMaterial(), dispose })) });
    const entity = buildEntity(target(image({ type: "water" })), noAssets)!;
    const mesh = meshOf(entity);
    entity.dispose!();
    expect(dispose).toHaveBeenCalled();
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
  });

  it("a node type's mesh with userData.keepMaterial keeps its own", () => {
    installPlugin("tank", {
      register: api => {
        api.registerMaterial("water", WATER, ({ three }) => new three.ShaderMaterial());
        api.registerNodeType("tank", { description: "A tank.", params: {} }, ({ three }) => {
          const group = new three.Group();
          const glass = new three.Mesh(new three.BoxGeometry(), new three.MeshBasicMaterial());
          glass.userData.keepMaterial = true;
          group.add(glass, new three.Mesh(new three.BoxGeometry(), new three.MeshBasicMaterial()));
          return { object: group };
        });
      },
    });
    const entity = buildEntity(target({ type: "tank", assets: [], material: { type: "water" } }), noAssets)!;
    const meshes: Mesh[] = [];
    entity.object.traverse(child => { if ((child as Mesh).isMesh) meshes.push(child as Mesh); });
    expect(meshes.map(mesh => mesh.material.constructor.name)).toEqual(["MeshBasicMaterial", "ShaderMaterial"]);
  });

  it("a layer adds on top of the plugin's material, patched in place (not a clone)", () => {
    installPlugin("fx", {
      register: api => {
        api.registerMaterial("water", WATER, ({ three }) => new three.ShaderMaterial({ fragmentShader: "varying vec2 vUv;\nvoid main() {\n  gl_FragColor = vec4(1.0);\n  #include <colorspace_fragment>\n}" }));
        api.registerLayer("tint", { description: "Tints.", params: { amount: { kind: "number", default: 0.5, min: 0, max: 1, description: "How much." } } }, { glsl: "return rgba * amount;" });
      },
    });
    const entity = buildEntity(target(image({ type: "water" }, { components: [{ type: "tint" }] })), noAssets)!;
    const material = meshOf(entity).material as ShaderMaterial;
    expect(material.userData[OWNED_MATERIAL]).toBe(true);
    expect(material.fragmentShader).toContain("osctLayer0(gl_FragColor");
  });
});

describe("texture parameters", () => {
  it("name nothing, a file or a procedural texture", () => {
    expect(textureSource("")).toEqual({ kind: "none" });
    expect(textureSource("caustics")).toEqual({ kind: "procedural", type: "caustics", params: {} });
    expect(textureSource({ type: "caustics", cells: 5 })).toEqual({ kind: "procedural", type: "caustics", params: { cells: 5 } });
    expect(textureSource("/assets/content/entries/a/sand.jpg")).toEqual({ kind: "file", src: "/assets/content/entries/a/sand.jpg" });
    expect(textureSource("https://cdn.example/sand.jpg")).toEqual({ kind: "file", src: "https://cdn.example/sand.jpg" });
  });

  it("arrive as three.js textures in a material, a node type and a component; an animated one updates, all are disposed", () => {
    const update = vi.fn();
    const disposeTexture = vi.fn();
    const seen: Record<string, unknown> = {};
    installPlugin("fx", {
      register: api => {
        api.registerTexture("caustics", CAUSTICS, ({ params, three }) => {
          const texture = new three.DataTexture(new Uint8Array(4 * Number(params.cells)), Number(params.cells), 1);
          texture.addEventListener("dispose", disposeTexture);
          return { texture, update };
        });
        api.registerMaterial("water", WATER, ({ params, three }) => { seen.material = params.ripples; return new three.ShaderMaterial(); });
        api.registerNodeType("tank", { description: "A tank.", params: { floor: { kind: "texture", default: "caustics", description: "Floor." } } }, ({ params, three }) => {
          seen.node = params.floor;
          return { object: new three.Mesh(new PlaneGeometry(), new three.MeshBasicMaterial()) };
        });
        api.registerComponent("shine", { description: "Shines.", params: { light: { kind: "texture", default: "", description: "Light." } } }, ({ params }) => { seen.component = params.light; });
      },
    });
    const entity = buildEntity(target({
      type: "tank", assets: [], material: { type: "water", params: { ripples: { type: "caustics", cells: 5 } } }, components: [{ type: "shine", light: "caustics" }],
    }), noAssets)!;
    expect(seen.node).toBeInstanceOf(DataTexture);
    expect((seen.material as DataTexture).image.width).toBe(5);
    expect(seen.component).toBeInstanceOf(Texture);
    entity.update!(0.1);
    expect(update).toHaveBeenCalledTimes(3);
    entity.dispose!();
    expect(disposeTexture).toHaveBeenCalledTimes(3);
  });

  it("a procedural texture nobody registered is none (logged)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let floor: unknown = "unset";
    installPlugin("fx", {
      register: api => api.registerNodeType("tank", { description: "A tank.", params: { floor: { kind: "texture", default: "sparkles", description: "Floor." } } }, ({ params }) => {
        floor = params.floor;
        return { object: new Group() };
      }),
    });
    buildEntity(target({ type: "tank", assets: [] }), noAssets);
    expect(floor).toBeNull();
  });
});
