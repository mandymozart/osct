import { describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { setNodeTextures, textureSizeOf, withMaterial, withoutTexture, withTexture } from "../model-textures";
import { pickFilter, pickFits, pickKinds } from "../library-pick";

const picture = (width: number | null, height: number | null = width, kind = "image") =>
  ({ kind, name: "face_x.jpg", width, height }) as Parameters<typeof textureSizeOf>[0];

describe("a model's texture sets in the Inspector (#260)", () => {
  it("reads a map's size from the picture: square, one of the four sizes", () => {
    expect(textureSizeOf(picture(2048))).toEqual({ size: 2048 });
    expect(textureSizeOf(picture(1080))).toEqual({ problem: "face_x.jpg is 1080 × 1080 px – a map is square, 512, 1024, 2048 or 4096 px wide." });
    expect(textureSizeOf(picture(1024, 512))).toEqual({ problem: "face_x.jpg is 1024 × 512 px – a map is square, 512, 1024, 2048 or 4096 px wide." });
    expect(textureSizeOf(picture(null))).toEqual({ problem: "face_x.jpg: the file does not tell its size." });
    expect(textureSizeOf(picture(512, 512, "glb"))).toEqual({ problem: "face_x.jpg is no picture." });
  });

  it("adds maps to a set smallest first, a size taking the newer file, and starts a set past the end", () => {
    let sets = withTexture(undefined, 0, 2048, "b");
    sets = withTexture(sets, 0, 512, "a");
    sets = withTexture(sets, 0, 2048, "c");
    expect(sets).toEqual([{ sizes: [{ size: 512, src: "a" }, { size: 2048, src: "c" }] }]);
    expect(withTexture(sets, 1, 1024, "d")[1]).toEqual({ sizes: [{ size: 1024, src: "d" }] });
  });

  it("removes a size; the last size takes its set along, the last set the list", () => {
    const sets = [{ sizes: [{ size: 512 as const, src: "a" }, { size: 2048 as const, src: "c" }] }, { material: "m", sizes: [{ size: 1024 as const, src: "d" }] }];
    expect(withoutTexture(sets, 0, 512)).toEqual([{ sizes: [{ size: 2048, src: "c" }] }, sets[1]]);
    expect(withoutTexture(sets, 1, 1024)).toEqual([sets[0]]);
    expect(withoutTexture([sets[1]], 0, 1024)).toBeUndefined();
  });

  it("names a set for a material, or for every material again", () => {
    const sets = [{ sizes: [{ size: 512 as const, src: "a" }] }];
    const named = withMaterial(sets, 0, " LOW_joined ");
    expect(named).toEqual([{ material: "LOW_joined", sizes: sets[0].sizes }]);
    expect(withMaterial(named, 0, "")).toEqual(sets);
  });

  it("puts the sets on the node's model file, and takes the field away with the last set", () => {
    const node: EntityData = { type: "model", assets: [{ id: "a", assetType: "glb", src: "face_mesh.glb" }] };
    const sets = [{ sizes: [{ size: 512 as const, src: "a" }] }];
    const withSets = setNodeTextures(node, sets);
    expect(withSets.assets[0]).toEqual({ id: "a", assetType: "glb", src: "face_mesh.glb", textures: sets });
    expect(setNodeTextures(withSets, undefined)).toEqual(node);
  });

  it("the Library picks a map among the pictures", () => {
    expect(pickKinds({ for: "model-texture" })).toEqual(["image"]);
    expect(pickFilter({ for: "model-texture" })).toBe("image");
    expect(pickFits({ for: "model-texture" }, { kind: "image", url: "x.jpg" })).toBe(true);
    expect(pickFits({ for: "model-texture" }, { kind: "glb", url: "x.glb" })).toBe(false);
  });
});
