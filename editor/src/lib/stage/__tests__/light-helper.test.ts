import { describe, expect, it } from "vitest";
import { LineSegments, Mesh, MeshBasicMaterial, Object3D } from "three";
import { resolveLight, type EntityData, type SceneInspection } from "@engine/types";
import { SELECTION_COLOR } from "../shading";
import { buildLightHelper, LIGHT_HELPER_NAME, LightHelpers } from "../light-helper";

const parts = (helper: Object3D) => ({
  bulb: helper.children.find((c): c is Mesh => c instanceof Mesh)!,
  lines: helper.children.find((c): c is LineSegments => c instanceof LineSegments)!,
});

describe("the light helpers of the stage", () => {
  it("draws a bulb and lines per kind: rays for a point, a cone for a spot, parallel rays for the sun", () => {
    const point = parts(buildLightHelper(resolveLight({ kind: "point" }), 0x000000));
    const spot = parts(buildLightHelper(resolveLight({ kind: "spot", angle: 45, distance: 1 }), 0x000000));
    const sun = parts(buildLightHelper(resolveLight({ kind: "directional" }), 0x000000));
    expect(point.bulb.name).toBe("editor-light-bulb");
    expect(point.lines.geometry.getAttribute("position").count).toBe(12);
    // The cone's ring lies one distance along −z, as wide as the angle says
    const cone = spot.lines.geometry.getAttribute("position");
    expect(cone.getZ(0)).toBeCloseTo(-1);
    expect(Math.hypot(cone.getX(0), cone.getY(0))).toBeCloseTo(Math.tan(Math.PI / 4));
    expect(sun.lines.geometry.getAttribute("position").count).toBeGreaterThan(point.lines.geometry.getAttribute("position").count);
    // Only the bulb can be picked
    expect(spot.lines.raycast.toString()).toContain("{}");
  });

  it("adds a helper to every light node's object, recolours the selected one, removes a gone node's", () => {
    const objects = new Map<string, Object3D>([["t/0", new Object3D()], ["t/1", new Object3D()]]);
    let tree: EntityData = { type: "group", assets: [], children: [{ type: "light", assets: [], light: { kind: "spot" } }, { type: "light", assets: [] }] };
    const inspection = {
      onFrame: () => () => {},
      nodeObject: (targetId: string, path: number[]) => objects.get(`${targetId}/${path.join(".")}`) ?? null,
    } as unknown as SceneInspection;
    const helpers = new LightHelpers(inspection, () => [{ targetId: "t", tree }]);
    helpers.sync();
    const first = objects.get("t/0")!.getObjectByName(LIGHT_HELPER_NAME)!;
    expect(first).toBeTruthy();
    expect(objects.get("t/1")!.getObjectByName(LIGHT_HELPER_NAME)).toBeTruthy();
    expect(parts(first).bulb.material).toMatchObject({ color: { r: expect.any(Number) } });

    // The same values keep the helper; a selection draws it anew in orange
    helpers.sync();
    expect(objects.get("t/0")!.getObjectByName(LIGHT_HELPER_NAME)).toBe(first);
    helpers.selection = { targetId: "t", path: [0] };
    helpers.sync();
    const selected = objects.get("t/0")!.getObjectByName(LIGHT_HELPER_NAME)!;
    expect(selected).not.toBe(first);
    expect((parts(selected).bulb.material as MeshBasicMaterial).color.getHex()).toBe(SELECTION_COLOR);

    // The second light went: its helper goes with it
    tree = { ...tree, children: [tree.children![0]] };
    helpers.sync();
    expect(objects.get("t/1")!.getObjectByName(LIGHT_HELPER_NAME)).toBeUndefined();
    helpers.dispose();
    expect(objects.get("t/0")!.getObjectByName(LIGHT_HELPER_NAME)).toBeUndefined();
  });
});
