import { Matrix4, PerspectiveCamera, Quaternion, Vector3, WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { deviceQuaternion } from "../look-around/orientation";
import { BookAnchor, lerpAngle, windowRadii, yawTowards } from "../look-around/book-anchor";
import { LookAround } from "../look-around/look-around";

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

describe("BookAnchor", () => {
  const pageAt = (x: number, y: number, z: number, width = 0.2) =>
    new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(width, width, width));

  it("places the book in the world from the anchor and the phone's orientation, the world's front facing it", () => {
    const anchor = new BookAnchor();
    // Phone upright, turned left by 90° (looks to −x); the page straight ahead of the camera
    anchor.see([pageAt(0, 0, -1)], deviceQuaternion(90, 90, 0, 0), 16, 18);
    close(anchor.direction!, new Vector3(-1, 0, 0));
    close(new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), anchor.yaw), new Vector3(-1, 0, 0));
    expect(anchor.sinceSeen).toBe(0);
  });

  it("moves smoothly on later finds, counts the time unseen and can forget", () => {
    const anchor = new BookAnchor();
    const upright = deviceQuaternion(0, 90, 0, 0);
    anchor.see([pageAt(0, 0, -1)], upright, 16, 18);
    anchor.see([pageAt(1, 0, 0)], upright, 16, 18);
    expect(anchor.direction!.z).toBeLessThan(-0.9); // one jittery frame barely moves it
    anchor.unseen(2);
    expect(anchor.sinceSeen).toBe(2);
    anchor.forget();
    expect(anchor.direction).toBeNull();
  });
});


describe("LookAround", () => {
  /** A graphics source the test switches; the renderer is never drawn with here */
  const setup = () => {
    let settings = { onionSky: true, surroundings: true };
    const listeners = new Set<(s: typeof settings) => void>();
    const graphics = {
      getSettings: () => settings,
      subscribe: (listener: (s: typeof settings) => void) => (listeners.add(listener), () => listeners.delete(listener)),
    };
    const set = (next: typeof settings) => {
      settings = next;
      listeners.forEach(listener => listener(next));
    };
    const loaders = { sky: vi.fn(), world: vi.fn() };
    const lookAround = new LookAround({} as WebGLRenderer, () => null, graphics, { world: "cafe", onionSky: true }, loaders);
    return { lookAround, set, loaders };
  };
  const page = new Matrix4().compose(new Vector3(0, -0.3, -0.4), new Quaternion(), new Vector3(0.2, 0.2, 0.2));
  const camera = new PerspectiveCamera(60, 1);

  it("fades the world out when the reader turns both switches off while scanning", () => {
    const { lookAround, set } = setup();
    lookAround.start();
    for (let i = 0; i < 40; i++) lookAround.update(0.1, camera, [page]);
    expect(lookAround.active).toBe(true);
    set({ onionSky: false, surroundings: false });
    for (let i = 0; i < 40; i++) lookAround.update(0.1, camera, [page]);
    expect(lookAround.active).toBe(false);
    lookAround.dispose();
  });

  it("the editor's preview draws the world whatever the switches say, turned by its orientation, and ends at once", () => {
    const { lookAround, set } = setup();
    set({ onionSky: false, surroundings: false });
    lookAround.start();
    const orientation = vi.fn(() => new Quaternion());
    lookAround.setPreview({ orientation });
    for (let i = 0; i < 40; i++) lookAround.update(0.1, camera, [page]);
    expect(orientation).toHaveBeenCalled();
    expect(lookAround.active).toBe(true);
    lookAround.setPreview(null);
    expect(lookAround.active).toBe(false);
    lookAround.dispose();
  });

  it("loads the environment's files only once something is drawn", () => {
    const { lookAround, set, loaders } = setup();
    set({ onionSky: false, surroundings: false });
    lookAround.setEnvironment({ world: "cafe", onionSky: true, skySrc: "https://cdn.example/sky.jpg" });
    lookAround.start();
    expect(loaders.sky).not.toHaveBeenCalled();
    loaders.sky.mockReturnValue(new Promise(() => {}));
    set({ onionSky: false, surroundings: true });
    expect(loaders.sky).toHaveBeenCalledWith("https://cdn.example/sky.jpg");
    lookAround.dispose();
  });
});
