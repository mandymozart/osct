import { describe, expect, it, vi } from "vitest";
import { type ArSceneEvents, type ArStatus, ArState } from "@/types";

/** The real ArScene (three.js + 8th Wall) replaced: records what the lazy wrapper hands on */
const created: FakeScene[] = [];
class FakeScene {
  status: ArStatus = "idle";
  sceneId: string | null = null;
  loads: string[] = [];
  states: ArState[] = [];
  listeners = new Map<string, (...args: unknown[]) => void>();
  constructor() { created.push(this); }
  async load(id: string) { this.loads.push(id); this.sceneId = id; }
  async setState(state: ArState) { this.states.push(state); }
  async dispose() {}
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]) {
    this.listeners.set(event, listener as (...args: unknown[]) => void);
    return () => {};
  }
}
const imported = vi.fn();
const prefetchXr8 = vi.fn(async () => {});
vi.mock("../ar", () => {
  imported();
  return { createReaderScene: () => new FakeScene(), prefetchXr8 };
});

const { LazyArScene } = await import("../lazy-ar-scene");

describe("LazyArScene", () => {
  it("builds nothing until AR runs, then hands over the latest wishes and forwards the events", async () => {
    const lazy = new LazyArScene(document.createElement("div"));
    const statuses: ArStatus[] = [];
    const found: string[] = [];
    lazy.on("status", status => statuses.push(status));
    lazy.on("targetFound", id => found.push(id));
    const scanning: boolean[] = [];
    lazy.on("scanning", on => scanning.push(on));

    await lazy.load("scene-1");
    await lazy.setState(ArState.STOPPED);
    await lazy.setState(ArState.PAUSED);
    await lazy.load("scene-2");
    expect(created).toHaveLength(0);
    expect(lazy.status).toBe("idle");

    await lazy.setState(ArState.RUNNING);
    expect(created).toHaveLength(1);
    expect(statuses).toEqual(["loading"]);
    const scene = created[0];
    expect(scene.loads).toEqual(["scene-2"]);
    expect(scene.states).toEqual([ArState.RUNNING]);

    scene.listeners.get("targetFound")!("target-a");
    expect(found).toEqual(["target-a"]);
    scene.listeners.get("scanning")!(true);
    expect(scanning).toEqual([true]);

    // Once created, calls go straight to the real scene
    await lazy.load("scene-3");
    await lazy.setState(ArState.PAUSED);
    expect(scene.loads).toEqual(["scene-2", "scene-3"]);
    expect(scene.states).toEqual([ArState.RUNNING, ArState.PAUSED]);
    expect(created).toHaveLength(1);
  });

  it("warms up the AR chunk and the tracking engine without building a scene", async () => {
    const before = created.length;
    expect(await new LazyArScene(document.createElement("div")).warmUp()).toBe(true);
    expect(prefetchXr8).toHaveBeenCalled();
    expect(created).toHaveLength(before);
  });

  it("a tracking engine that does not preload only logs: the AR chunk itself is there", async () => {
    prefetchXr8.mockRejectedValueOnce(new Error("offline"));
    expect(await new LazyArScene(document.createElement("div")).warmUp()).toBe(true);
  });
});
