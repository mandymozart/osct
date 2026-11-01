import { describe, expect, it } from "vitest";
import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from "three";
import { GIZMO_KEYS, placementOf, snappedRotation } from "../gizmo";
import { snapAngle } from "../snap";

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

  it("W / E / R are the modes", () => {
    expect(GIZMO_KEYS).toEqual({ w: "translate", e: "rotate", r: "scale" });
  });
});

// #190: a rotation snaps the angle turned since the drag started, about the drag's own axis
describe("the gizmo's snapped rotation", () => {
  const turned = (start: Quaternion, axis: Vector3, degrees: number) =>
    start.clone().multiply(new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(degrees)));
  const by15 = (degrees: number) => snapAngle(degrees, 15);

  it("turns by whole steps from where the node stood, about the handle's axis", () => {
    const start = new Quaternion().setFromEuler(new Euler(0, MathUtils.degToRad(7), 0));
    const object = new Object3D();
    object.quaternion.copy(snappedRotation(start, turned(start, new Vector3(0, 1, 0), 22), by15));
    // 22° snaps to 15°: 7° + 15°
    expect(placementOf(object).rotation.map(v => Math.round(v) + 0)).toEqual([0, 22, 0]);
    // −40° snaps to −45°: 7° − 45°
    object.quaternion.copy(snappedRotation(start, turned(start, new Vector3(0, 1, 0), -40), by15));
    expect(placementOf(object).rotation.map(v => Math.round(v) + 0)).toEqual([0, -38, 0]);
  });

  it("keeps the start under half a step, and a turn in the node's own space", () => {
    const start = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(90), 0, 0));
    expect(snappedRotation(start, turned(start, new Vector3(0, 0, 1), 6), by15).angleTo(start)).toBeCloseTo(0);
    const snapped = snappedRotation(start, turned(start, new Vector3(0, 0, 1), 47), by15);
    expect(MathUtils.radToDeg(snapped.angleTo(start))).toBeCloseTo(45);
    expect(snapped.angleTo(turned(start, new Vector3(0, 0, 1), 45))).toBeCloseTo(0);
  });
});
