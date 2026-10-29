import { describe, expect, it } from "vitest";
import { MathUtils, Object3D } from "three";
import { GIZMO_KEYS, placementOf, SNAP } from "../gizmo";

describe("the gizmo's placement", () => {
  it("reads a node's object as the content stores it: rounded, degrees, an even scale as one number", () => {
    const object = new Object3D();
    object.position.set(0.123456, -0.25, 0.1);
    object.rotation.set(MathUtils.degToRad(90), MathUtils.degToRad(45.00004), 0);
    object.scale.setScalar(0.7);
    expect(placementOf(object)).toEqual({ position: [0.1235, -0.25, 0.1], rotation: [90, 45, 0], scale: 0.7 });
  });

  it("keeps an uneven scale as three numbers", () => {
    const object = new Object3D();
    object.scale.set(1, 0.5, 1);
    expect(placementOf(object).scale).toEqual([1, 0.5, 1]);
  });

  it("W / E / R are the modes, Ctrl snaps in content units", () => {
    expect(GIZMO_KEYS).toEqual({ w: "translate", e: "rotate", r: "scale" });
    expect(SNAP).toEqual({ translate: 0.05, rotate: 15, scale: 0.1 });
  });
});
