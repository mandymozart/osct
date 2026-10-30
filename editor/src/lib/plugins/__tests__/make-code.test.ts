import { afterEach, describe, expect, it, vi } from "vitest";
import { type Mesh, ShaderMaterial } from "three";
import type { EntityData, Target } from "@engine/types";
import { installedPlugins, installPlugin, type PluginModule, uninstallPlugin } from "@engine/scene/plugins";
import { buildEntity } from "@engine/scene/entities";
import { materialCode, nodeTypeCode, takesMaterial } from "../make-code";
import { transpilePlugin } from "../compile";

/** Make it code (#188): a node, or its look, becomes a Code tab plugin – the source runs and reproduces the node */

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", spreadId: "s", imageSrc: "/t.jpg", entity });

/** The made source as the Code tab runs it: transpiled, its register evaluated */
const run = async (id: string, source: string): Promise<void> => {
  const result = await transpilePlugin(source, id);
  if ("error" in result) throw new Error(result.error.message);
  const body = result.code.replace(/^export const register =/m, "return");
  const module: PluginModule = { register: new Function(body)() };
  installPlugin(id, module);
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
    installPlugin("fx", {
      register: api => api.registerNodeType("sparkle", { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } },
        ({ params, three }) => ({ object: new three.Points(new three.BufferGeometry(), new three.PointsMaterial({ size: Number(params.count) / 1000 })) })),
    });
    const nodes: EntityData[] = [
      { type: "group", assets: [], children: [{ type: "text", assets: [], text: "child" }] },
      { type: "light", assets: [], light: { kind: "spot", intensity: 0.5 } },
      { type: "image", assets: [] },
      { type: "video", assets: [] },
      { type: "sparkle", assets: [], params: { count: 120 } },
    ];
    for (const node of nodes) {
      const made = nodeTypeCode(node, { plugins: installedPlugins() });
      await run(made.plugin, made.source);
      const built = buildEntity(target(made.node), () => undefined);
      expect(built, made.type).not.toBeNull();
    }
    const light = nodeTypeCode(nodes[1], { plugins: [] });
    expect(light.node.params).toMatchObject({ kind: "spot", intensity: 0.5, color: "#ffffff" });
    const sparkle = nodeTypeCode(nodes[4], { plugins: [] });
    expect(sparkle.source).toContain(`"default":120`);
    expect(nodeTypeCode(nodes[0], { plugins: [] }).node.children).toEqual(nodes[0].children);
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
