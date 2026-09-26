import { describe, expect, it } from "vitest";
import { Group, MathUtils } from "three";
import { placementProblems, resolvePlacement, Target } from "@/types";
import { LoadedAsset } from "../assets";
import { buildEntity } from "../entities";

const model = (params?: Record<string, unknown>): Target => ({
  id: "racoon",
  entryId: "racoon",
  spreadId: "s",
  index: 0,
  imageSrc: "/racoon.jpg",
  entity: { type: "model", assets: [{ id: "racoon-media", assetType: "glb", src: "/racoon.glb" }], params },
});
const glb: LoadedAsset = { assetType: "glb", scene: new Group(), animations: [] };

describe("entity placement (params: position / rotation / scale)", () => {
  it("defaults: models stand on the page at half size, videos and images lie flat", () => {
    expect(resolvePlacement("model")).toEqual({ position: [0, 0, 0], rotation: [90, 0, 0], scale: [0.5, 0.5, 0.5] });
    expect(resolvePlacement("video")).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  });

  it("takes each valid value from params, the default for the rest", () => {
    expect(resolvePlacement("model", { rotation: [90, 0, 180], scale: 2 })).toEqual({
      position: [0, 0, 0], rotation: [90, 0, 180], scale: [2, 2, 2],
    });
    expect(resolvePlacement("image", { position: [0, 0.2, 0], scale: [1, 2, 1] })).toMatchObject({
      position: [0, 0.2, 0], scale: [1, 2, 1],
    });
  });

  it("reports wrong values (content build + config guard)", () => {
    expect(placementProblems({ rotation: [90, 0, 0], scale: 0.5, other: true }, "p")).toEqual([]);
    expect(placementProblems({ rotation: [90, 0], position: "up", scale: 0 }, "p")).toEqual([
      "p.position: expected three numbers [x, y, z], got \"up\"",
      "p.rotation: expected three numbers [x, y, z], got [90,0]",
      "p.scale: expected a number > 0 or three numbers [x, y, z] > 0, got 0",
    ]);
  });

  it("puts the entity into a group placed on the target", () => {
    const placed = buildEntity(model({ rotation: [0, 0, 45], position: [0.1, 0, 0] }), () => glb)!.object;
    expect(placed.position.toArray()).toEqual([0.1, 0, 0]);
    expect(placed.rotation.z).toBeCloseTo(MathUtils.degToRad(45));
    expect(placed.scale.toArray()).toEqual([0.5, 0.5, 0.5]);
    expect(placed.children).toHaveLength(1);

    const standing = buildEntity(model(), () => glb)!.object;
    expect(standing.rotation.x).toBeCloseTo(Math.PI / 2);
  });
});
