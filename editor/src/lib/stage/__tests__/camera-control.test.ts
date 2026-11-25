import { describe, expect, it } from "vitest";
import { AXIS_VIEWS, leftView, orthoLens, PREVIEW_FOV, snappedTo, spotsBox } from "../mock-tracker";
import { ballAt, clickedView, gizmoBalls } from "../view-gizmo";
import { clearTopCorner } from "#lib/components/floats.js";

// #369: the camera control – the gizmo's views, auto ortho (Blender's Auto Perspective), the emulated ortho lens
const reader = { distance: 350, tilt: 30, yaw: 0 };

describe("snapping to a view", () => {
  it("turns to the view and goes ortho by itself; orbiting away is perspective again", () => {
    const top = snappedTo(reader, "top");
    expect(top).toMatchObject({ ...AXIS_VIEWS.top, axisView: "top", ortho: true, autoOrtho: true, distance: 350 });
    expect(leftView(top)).toEqual({ ...reader, ...AXIS_VIEWS.top });
  });

  it("keeps ortho switched on by hand when the camera orbits away", () => {
    const front = snappedTo({ ...reader, ortho: true }, "front");
    expect(front.autoOrtho).toBeUndefined();
    expect(leftView(front)).toMatchObject({ ortho: true });
    expect(leftView(front).axisView).toBeUndefined();
  });

  it("names the views as Blender does: front from the reader's side, right from +x, back from the far side", () => {
    expect(AXIS_VIEWS.front).toEqual({ tilt: 90, yaw: 0 });
    expect(AXIS_VIEWS.right).toEqual({ tilt: 90, yaw: 90 });
    expect(AXIS_VIEWS.back).toEqual({ tilt: 90, yaw: 180 });
  });
});

describe("the ortho lens", () => {
  it("is the perspective lens when not blended", () => {
    expect(orthoLens(350, 0)).toEqual({ eye: 350, fov: PREVIEW_FOV });
  });

  it("moves the eye far back and narrows the field so the looked-at plane keeps its size", () => {
    const lens = orthoLens(350, 1);
    expect(lens.eye).toBe(200_000);
    const height = (eye: number, fov: number) => 2 * eye * Math.tan((fov * Math.PI) / 360);
    expect(height(lens.eye, lens.fov)).toBeCloseTo(height(350, PREVIEW_FOV), 6);
    // 1 m in front of the plane shows less than 1 % larger: a parallel view
    expect(lens.eye / (lens.eye - 1000)).toBeLessThan(1.01);
  });
});

describe("the gizmo", () => {
  it("from the top: x to the right, y up, z towards the viewer", () => {
    const balls = gizmoBalls(0, 0);
    const ball = (axis: string, positive = true) => balls.find(b => b.axis === axis && b.positive === positive)!;
    expect(ball("x").x).toBeCloseTo(1);
    expect(ball("y").y).toBeCloseTo(-1);
    expect(ball("z").depth).toBeCloseTo(1);
    // The front-most ball is drawn last and taken by a click
    expect(balls.at(-1)).toMatchObject({ axis: "z", positive: true, view: "top" });
    expect(ballAt(balls, 0, 0, 0.3)?.view).toBe("top");
  });

  it("from the front: z up, −y towards the viewer", () => {
    const balls = gizmoBalls(90, 0);
    expect(balls.find(b => b.axis === "z" && b.positive)!.y).toBeCloseTo(-1);
    expect(balls.at(-1)).toMatchObject({ axis: "y", positive: false, view: "front" });
  });

  it("a click on the ball the camera already looks from flips to the opposite view", () => {
    const top = gizmoBalls(0, 0).at(-1)!;
    expect(clickedView(top, null)).toBe("top");
    expect(clickedView(top, "top")).toBe("bottom");
  });
});

describe("focus on several things", () => {
  it("frames the box around them all", () => {
    const box = spotsBox([
      { centre: { x: -100, y: 0, z: 0 }, width: 20, height: 20, label: "a" },
      { centre: { x: 100, y: 0, z: 0 }, width: 20, height: 20, label: "b" },
    ])!;
    expect(box.centre).toEqual({ x: 0, y: 0, z: 0 });
    expect(box.size).toBeGreaterThan(200);
    expect(spotsBox([])).toBeNull();
  });
});

describe("the camera control's place", () => {
  const area = { w: 1000, h: 600 };
  const box = { w: 40, h: 260 };

  it("sits in the stage's top right corner when it is free", () => {
    expect(clearTopCorner(box, [], area, 8)).toEqual({ right: 8, top: 8 });
  });

  it("moves left of a panel docked at the top right", () => {
    const inspector = { x: 700, y: 0, w: 300, h: 600 };
    expect(clearTopCorner(box, [inspector], area, 8)).toEqual({ right: 308, top: 8 });
  });
});
