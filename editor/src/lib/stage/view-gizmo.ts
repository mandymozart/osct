import { Quaternion, Vector3 } from "three";
import { axisViewOf, OPPOSITE_VIEW } from "./mock-tracker";
import type { AxisView } from "./preview";

/**
 * The stage's view gizmo (#369, Blender's navigation gizmo): the stage's three axes as seen by the camera, each as a
 * ball with its letter (positive) and a hollow ball (negative). A click on a ball snaps the camera to that view, a drag
 * orbits. The axes are the stage frame's (z up, the reader on −y); the colours are a stage helper's (x red, y green, z
 * blue – RULES #38's exception for the stage's 3D helpers).
 */
export interface GizmoBall {
  axis: "x" | "y" | "z";
  positive: boolean;
  /** Where it shows, −1…1 from the gizmo's middle (x right, y down) */
  x: number;
  y: number;
  /** Towards the viewer (−1…1): the balls are drawn back to front, a click takes the front-most one */
  depth: number;
  /** The view a click snaps to */
  view: AxisView;
}

const AXES = [
  ["x", new Vector3(1, 0, 0)],
  ["y", new Vector3(0, 1, 0)],
  ["z", new Vector3(0, 0, 1)],
] as const;

const Z = new Vector3(0, 0, 1);
const X = new Vector3(1, 0, 0);

/** The six balls for a camera at `tilt` / `yaw` (degrees, the orbit's), back to front */
export const gizmoBalls = (tilt: number, yaw: number): GizmoBall[] => {
  // The camera's turn, as the tracker's: about z by the yaw, then about its own x by the tilt
  const turn = new Quaternion().setFromAxisAngle(Z, (yaw * Math.PI) / 180).multiply(new Quaternion().setFromAxisAngle(X, (tilt * Math.PI) / 180));
  const toView = turn.clone().invert();
  const balls: GizmoBall[] = [];
  for (const [axis, direction] of AXES) {
    for (const positive of [true, false]) {
      const seen = direction.clone().multiplyScalar(positive ? 1 : -1).applyQuaternion(toView);
      balls.push({ axis, positive, x: seen.x, y: -seen.y, depth: seen.z, view: axisViewOf(axis, positive) });
    }
  }
  return balls.sort((a, b) => a.depth - b.depth);
};

/** The ball under a point (gizmo units, as `x` / `y`) within `radius` – the front-most one; null = none */
export const ballAt = (balls: readonly GizmoBall[], x: number, y: number, radius: number): GizmoBall | null => {
  let hit: GizmoBall | null = null;
  for (const ball of balls) if (Math.hypot(ball.x - x, ball.y - y) <= radius) hit = ball;
  return hit;
};

/** A click on a ball: its view – the opposite when the camera already looks from there (Blender's) */
export const clickedView = (ball: GizmoBall, current: AxisView | null): AxisView => (current === ball.view ? OPPOSITE_VIEW[ball.view] : ball.view);
