import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Box3, Mesh, type Object3D } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildKeyGlb, KEY_MODEL_PATH } from "../../../tools/key-model.mjs";

const parse = (glb: Uint8Array): Promise<GLTF> =>
  new Promise((resolve, reject) => new GLTFLoader().parse(glb.slice().buffer, "", resolve, reject));

describe("the demo experience's key (editor/tools/key-model.mjs)", () => {
  it("is the demo's key – the export holds it as the build optimised it, with the script's node and clip", () => {
    // fixtures/demo is the staging database's export (#322): the file is the CDN-optimised one (meshopt), not the
    // script's bytes; it keeps the script's node `key` and clip `rattle`. From the editor's folder (vitest's cwd).
    const file = readFileSync(resolve(process.cwd(), "..", KEY_MODEL_PATH));
    const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString("utf8")) as { nodes: Array<{ name?: string }>; animations?: Array<{ name: string }> };
    expect(json.nodes.map(node => node.name)).toContain("key");
    expect(json.animations?.map(clip => clip.name)).toEqual(["rattle"]);
  });

  it("writes the same file every time", () => {
    expect(Buffer.from(buildKeyGlb()).equals(Buffer.from(buildKeyGlb()))).toBe(true);
  });

  it("stays a few KB", () => {
    expect(buildKeyGlb().length).toBeLessThan(10_000);
  });

  it("loads as glTF with one mesh and one clip, rattle, that moves the key node and ends at rest", async () => {
    const gltf = await parse(buildKeyGlb());
    const meshes: Mesh[] = [];
    gltf.scene.traverse((o: Object3D) => { if (o instanceof Mesh) meshes.push(o); });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].name).toBe("key");

    expect(gltf.animations.map(clip => clip.name)).toEqual(["rattle"]);
    const [clip] = gltf.animations;
    expect(clip.duration).toBeCloseTo(0.9);
    expect(clip.tracks.map(track => track.name).sort()).toEqual(["key.position", "key.quaternion"]);
    const rotation = clip.tracks.find(track => track.name === "key.quaternion")!;
    expect(Array.from(rotation.values.slice(-4))).toEqual([0, 0, 0, 1]);
  });

  it("stands on its tip, about one unit high, the bow on top", async () => {
    const gltf = await parse(buildKeyGlb());
    const box = new Box3().setFromObject(gltf.scene);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(1, 1);
    expect(box.max.x - box.min.x).toBeLessThan(0.5);
  });
});
