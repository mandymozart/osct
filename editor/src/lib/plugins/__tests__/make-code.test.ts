import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Mesh, type MeshStandardMaterial, ShaderMaterial } from "three";
import type { EntityData, Target } from "@engine/types";
import {
  installedPlugins, installPlugin, pluginMaterialsOf, pluginNodeTypesOf, type PluginModule, pluginTexturesOf, uninstallPlugin,
} from "@engine/scene/plugins";
import { buildEntity } from "@engine/scene/entities";
import { MakeCodeError, materialCode, nodeTypeCode, nodeTypeOwner, takesMaterial } from "../make-code";
import { transpilePlugin } from "../compile";

/** Make it code (#188): a node, or its look, becomes a Code tab plugin – the source runs and reproduces the node */

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });

/** A source as the Code tab runs it: transpiled, the module evaluated, its register installed */
const run = async (id: string, source: string): Promise<void> => {
  const result = await transpilePlugin(source, id);
  if ("error" in result) throw new Error(result.error.message);
  const body = `${result.code.replace(/^export (const|function) register\b/m, "$1 register")}\nreturn register;`;
  const module: PluginModule = { register: new Function(body)() };
  installPlugin(id, module);
};

/** The demo's aquarium (#188): its build closes over FISH_COLOURS, defined in register outside the build (#199) */
const AQUARIUM = readFileSync(resolve(process.cwd(), "../fixtures/demo/plugins/aquarium/index.ts"), "utf8");

/** The meshes of a built object */
const meshes = (object: { traverse(visit: (child: unknown) => void): void }): Mesh[] => {
  const found: Mesh[] = [];
  object.traverse(child => { if ((child as Mesh).isMesh) found.push(child as Mesh); });
  return found;
};

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("make it code – a node type from any node", () => {
  it("a model: its file stays, its place is written out, the builder clones the scene and plays the clips", () => {
    const model: EntityData = {
      type: "model", name: "Old door", assets: [{ id: "d", assetType: "glb", src: "/assets/content/entries/door/door.glb" }],
      params: { scale: 0.55 }, components: [{ type: "animation", clip: "open" }, { type: "spin", degreesPerSecond: 10 }],
    };
    const made = nodeTypeCode(model, { plugins: [] });
    expect([made.type, made.plugin]).toEqual(["oldDoorCode", "old-door-code"]);
    expect(made.source).toContain(`api.registerNodeType("oldDoorCode"`);
    expect(made.source).toContain(`src: "glb"`);
    expect(made.source).toContain("asset.scene.clone(true)");
    expect(made.node).toEqual({
      name: "Old door", type: "oldDoorCode", assets: model.assets,
      params: { position: [0, 0, 0], rotation: [90, 0, 0], scale: [0.55, 0.55, 0.55] },
      // The animation applies to models only (the new build plays the clips); a component for any node stays
      components: [{ type: "spin", degreesPerSecond: 10 }],
    });
  });

  it("a text: its line and colour become the spec's parameters with the node's values as defaults", async () => {
    const made = nodeTypeCode({ type: "text", assets: [], text: "Hello", color: "#f3cc94", params: { position: [0, -0.4, 0.01] } }, { plugins: [] });
    expect(made.type).toBe("myTextCode");
    expect(made.node.params).toEqual({ position: [0, -0.4, 0.01], rotation: [0, 0, 0], scale: [1, 1, 1], text: "Hello", color: "#f3cc94" });
    expect(made.node.text).toBeUndefined();
    await run(made.plugin, made.source);
    const built = buildEntity(target(made.node), () => undefined)!;
    let mesh: Mesh | null = null;
    built.object.traverse(child => { if ((child as Mesh).isMesh) mesh = child as Mesh; });
    expect(mesh).not.toBeNull();
  });

  it("a group, a light, an image, a video and a plugin's node type run as made", async () => {
    const fx = `import type { PluginApi } from "osct-plugin-api";
export function register(api: PluginApi): void {
  api.registerNodeType("sparkle", { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } },
    ({ params, three }) => ({ object: new three.Points(new three.BufferGeometry(), new three.PointsMaterial({ size: Number(params.count) / 1000 })) }));
}
`;
    await run("fx", fx);
    const nodes: EntityData[] = [
      { type: "group", assets: [], children: [{ type: "text", assets: [], text: "child" }] },
      { type: "light", assets: [], light: { kind: "spot", intensity: 0.5 } },
      { type: "image", assets: [] },
      { type: "video", assets: [] },
      { type: "sparkle", assets: [], params: { count: 120 } },
    ];
    for (const node of nodes) {
      const owner = nodeTypeOwner(node.type);
      const made = nodeTypeCode(node, { plugins: installedPlugins() }, owner ? { plugin: owner, source: fx } : undefined);
      await run(made.plugin, made.source);
      const built = buildEntity(target(made.node), () => undefined);
      expect(built, made.type).not.toBeNull();
    }
    const light = nodeTypeCode(nodes[1], { plugins: [] });
    expect(light.node.params).toMatchObject({ kind: "spot", intensity: 0.5, color: "#ffffff" });
    const sparkle = nodeTypeCode(nodes[4], { plugins: [] }, { plugin: "fx", source: fx });
    expect(sparkle.source).toContain(`"default":120`);
    expect(nodeTypeCode(nodes[0], { plugins: [] }).node.children).toEqual(nodes[0].children);
  });

  it("a plugin's node type comes with its plugin's whole source: the aquarium's fish keep their colours (#199)", async () => {
    await run("aquarium", AQUARIUM);
    const tank: EntityData = { type: "aquarium", name: "Tank", assets: [], params: { rotation: [90, 0, 0], fish: 4, fishSpeed: 2 } };
    expect(nodeTypeOwner("aquarium")).toBe("aquarium");
    expect(nodeTypeOwner("model")).toBeUndefined();
    const made = nodeTypeCode(tank, { plugins: installedPlugins() }, { plugin: "aquarium", source: AQUARIUM });
    expect([made.type, made.plugin]).toEqual(["tankCode", "tank-code"]);
    // The closure value is in the made source: the module comes whole, its register renamed, one type import at the head
    expect(made.source).toContain(`const FISH_COLOURS = [`);
    expect(made.source).toContain("const aquariumPlugin = (api: PluginApi): void => {");
    expect(made.source.match(/from "osct-plugin-api"/g)).toHaveLength(1);
    expect(made.source).toContain(`"default":4`);
    expect(made.node.params).toMatchObject({ rotation: [90, 0, 0], fish: 4, fishSpeed: 2 });
    await run(made.plugin, made.source);
    // Only the node type is the made plugin's: the water and the caustics stay the aquarium's
    expect(pluginNodeTypesOf(made.plugin)).toEqual(["tankCode"]);
    expect([pluginMaterialsOf(made.plugin), pluginTexturesOf(made.plugin)]).toEqual([[], []]);
    expect([pluginNodeTypesOf("aquarium"), pluginMaterialsOf("aquarium"), pluginTexturesOf("aquarium")]).toEqual([["aquarium"], ["water"], ["caustics"]]);
    const error = vi.spyOn(console, "error");
    const built = buildEntity(target(made.node), () => undefined)!;
    expect(error).not.toHaveBeenCalled();
    const colours = meshes(built.object).map(mesh => (mesh.material as MeshStandardMaterial).color?.getHexString());
    // Four fish of two meshes each, in the aquarium's colours
    ["ff8a3d", "ffd23f", "f25f5c", "7bdff2"].forEach(colour => expect(colours.filter(c => c === colour)).toHaveLength(2));
  });

  it("refuses a plugin's node type without its plugin's source, or whose register it cannot find", async () => {
    await run("aquarium", AQUARIUM);
    const tank: EntityData = { type: "aquarium", assets: [] };
    expect(() => nodeTypeCode(tank, { plugins: [] })).toThrow(MakeCodeError);
    const hidden = AQUARIUM.replace("export const register =", "const register =") + "\nexport { register };\n";
    expect(() => nodeTypeCode(tank, { plugins: [] }, { plugin: "aquarium", source: hidden })).toThrow(/exports no register\(api\)/);
  });

  it("copies a register exported as a default function", async () => {
    const source = `export default function (api) {
  api.registerNodeType("blob", { description: "A blob.", params: {} }, ({ three }) => ({ object: new three.Group() }));
}
`;
    installPlugin("blobs", { register: api => api.registerNodeType("blob", { description: "A blob.", params: {} }, ({ three }) => ({ object: new three.Group() })) });
    const made = nodeTypeCode({ type: "blob", assets: [] }, { plugins: installedPlugins() }, { plugin: "blobs", source });
    expect(made.source).toContain("function blobsPlugin(api) {");
    await run(made.plugin, made.source);
    expect(buildEntity(target(made.node), () => undefined)).not.toBeNull();
  });

  it("finds a free name next to the book's plugins and types", () => {
    expect(nodeTypeCode({ type: "model", assets: [] }, { plugins: ["my-model-code"] }).type).toBe("myModelCode2");
    expect(nodeTypeCode({ type: "model", assets: [] }, { plugins: [], types: ["myModelCode", "myModelCode2"] }).plugin).toBe("my-model-code3");
  });
});

describe("make material code – a material from the look of a node", () => {
  it("a plane's picture as a ShaderMaterial the node then carries", async () => {
    const made = materialCode({ type: "image", assets: [] }, { plugins: [] });
    expect(made.type).toBe("myImageLook");
    expect(made.node.material).toEqual({ type: "myImageLook" });
    expect(made.source).toContain(`kind":"texture"`);
    await run(made.plugin, made.source);
    const built = buildEntity(target(made.node), () => undefined)!;
    expect((built.object.children[0] as Mesh).material).toBeInstanceOf(ShaderMaterial);
  });

  it("a model's look as a standard material; groups and lights take none", () => {
    expect(materialCode({ type: "model", assets: [] }, { plugins: [] }).source).toContain("new three.MeshStandardMaterial");
    expect([takesMaterial("group"), takesMaterial("light"), takesMaterial("model"), takesMaterial("aquarium")]).toEqual([false, false, true, true]);
  });
});
