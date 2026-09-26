import { describe, expect, it, vi } from "vitest";
import { ArSceneEvents, ArStatus, SceneState } from "@/types";

/** The real ArScene (three.js + MindAR) replaced: records what the lazy wrapper hands on */
const created: FakeScene[] = [];
class FakeScene {
  status: ArStatus = "idle";
  spreadId: string | null = null;
  loads: string[] = [];
  states: SceneState[] = [];
  listeners = new Map<string, (...args: unknown[]) => void>();
  constructor() { created.push(this); }
  async load(id: string) { this.loads.push(id); this.spreadId = id; }
  async setState(state: SceneState) { this.states.push(state); }
  async dispose() {}
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]) {
    this.listeners.set(event, listener as (...args: unknown[]) => void);
    return () => {};
  }
}
const imported = vi.fn();
vi.mock("../ar", () => {
  imported();
  return { ArScene: FakeScene };
});

const { LazyArScene } = await import("../lazy-ar-scene");

describe("LazyArScene", () => {
  it("builds nothing until AR runs, then hands over the latest wishes and forwards the events", async () => {
    const lazy = new LazyArScene(document.createElement("div"));
    const statuses: ArStatus[] = [];
    const found: string[] = [];
    lazy.on("status", status => statuses.push(status));
    lazy.on("targetFound", id => found.push(id));

    await lazy.load("spread-1");
    await lazy.setState(SceneState.STOPPED);
    await lazy.setState(SceneState.PAUSED);
    await lazy.load("spread-2");
    expect(created).toHaveLength(0);
    expect(lazy.status).toBe("idle");

    await lazy.setState(SceneState.RUNNING);
    expect(created).toHaveLength(1);
    expect(statuses).toEqual(["loading"]);
    const scene = created[0];
    expect(scene.loads).toEqual(["spread-2"]);
    expect(scene.states).toEqual([SceneState.RUNNING]);

    scene.listeners.get("targetFound")!("target-a");
    expect(found).toEqual(["target-a"]);

    // From now on straight through
    await lazy.load("spread-3");
    await lazy.setState(SceneState.PAUSED);
    expect(scene.loads).toEqual(["spread-2", "spread-3"]);
    expect(scene.states).toEqual([SceneState.RUNNING, SceneState.PAUSED]);
    expect(created).toHaveLength(1);
  });
});
