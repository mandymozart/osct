import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { deviceQuaternion } from "../look-around/orientation";
import { lerpAngle, windowRadii, yawTowards } from "../look-around/look-around";

const forward = (alpha: number, beta: number, gamma: number, screen = 0) =>
  new Vector3(0, 0, -1).applyQuaternion(deviceQuaternion(alpha, beta, gamma, screen));

const close = (a: Vector3, b: Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-6);

describe("deviceQuaternion", () => {
  it("phone upright: the back camera looks at the horizon", () => {
    close(forward(0, 90, 0), new Vector3(0, 0, -1));
  });

  it("phone flat, screen up: the back camera looks down", () => {
    close(forward(0, 0, 0), new Vector3(0, -1, 0));
  });

  it("phone upright, turned left by 90°: looks to −x", () => {
    close(forward(90, 90, 0), new Vector3(-1, 0, 0));
  });

  it("phone tilted back past upright: looks up", () => {
    expect(forward(0, 135, 0).y).toBeGreaterThan(0.7);
  });
});

describe("yawTowards", () => {
  it("turns the front (−z) to the direction", () => {
    [new Vector3(0, 0, -1), new Vector3(1, 0, 0), new Vector3(-0.6, 0, 0.8)].forEach(direction => {
      const yaw = yawTowards(direction);
      close(new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), yaw), direction.clone().normalize());
    });
  });
});

describe("lerpAngle", () => {
  it("takes the short way round", () => {
    expect(lerpAngle(3, -3, 1)).toBeCloseTo(3 + (2 * Math.PI - 6), 6);
    expect(lerpAngle(0.2, 0.4, 0.5)).toBeCloseTo(0.3, 6);
  });
});

describe("windowRadii", () => {
  it("grows with the page's size on screen, within limits", () => {
    const near = windowRadii(1, 1, 9, 16);
    const far = windowRadii(1, 40, 9, 16);
    expect(near.inner).toBeGreaterThan(far.inner);
    expect(far.inner).toBe(14);
    expect(windowRadii(10, 0.5, 9, 16).inner).toBe(45);
    expect(near.outer - near.inner).toBe(16);
  });
});
