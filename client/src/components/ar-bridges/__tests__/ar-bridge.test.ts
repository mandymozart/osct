import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArSceneEvents, ArStatus, IArScene, LoadingState, SceneState } from "@/types";
import { GameStoreService, PreloaderService } from "@/services";
import { getSpreads, getTargets } from "@/utils/game-config";

const { ArBridge } = await import("../ar-bridge");

/** Records calls, lets the test emit scene events */
class FakeArScene implements IArScene {
  status: ArStatus = "idle";
  spreadId: string | null = null;
  loads: string[] = [];
  states: SceneState[] = [];
  disposed = false;
  private listeners = new Map<keyof ArSceneEvents, Array<(...args: any[]) => void>>();

  async load(spreadId: string) { this.loads.push(spreadId); this.spreadId = spreadId; }
  async setState(state: SceneState) { this.states.push(state); }
  async dispose() { this.disposed = true; }
  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return () => this.listeners.set(event, list.filter(l => l !== listener));
  }
  emit<E extends keyof ArSceneEvents>(event: E, ...args: Parameters<ArSceneEvents[E]>) {
    this.listeners.get(event)?.forEach(l => l(...args));
  }
  get lastState() { return this.states[this.states.length - 1]; }
}

describe("<ar-bridge>", () => {
  const game = GameStoreService.getInstance();
  const [spread1, spread2] = getSpreads();
  let scene: FakeArScene;
  let bridge: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    game.history.reset();
    game.router.navigate("/");
    game.spreads.switchSpread(spread1.id);
    scene = new FakeArScene();
    ArBridge.sceneFactory = () => scene;
    bridge = document.createElement("ar-bridge");
    document.body.appendChild(bridge);
  });

  afterEach(() => {
    bridge.remove();
    ArBridge.sceneFactory = null;
    document.body.classList.remove("scene-active");
    vi.restoreAllMocks();
  });

  it("loads the current spread and follows spread switches", () => {
    expect(scene.loads).toEqual([spread1.id]);
    game.spreads.switchSpread(spread2.id);
    expect(scene.loads).toEqual([spread1.id, spread2.id]);
  });

  it("runs the camera only in scan mode (paused in consultation and overlays, stopped at home)", () => {
    expect(scene.lastState).toBe(SceneState.STOPPED);
    game.router.navigate("/spread");
    expect(scene.lastState).toBe(SceneState.RUNNING);
    game.router.navigate("/entries");
    expect(scene.lastState).toBe(SceneState.PAUSED);
    game.router.navigate("/spread");
    game.router.navigate("/not-found");
    expect(scene.lastState).toBe(SceneState.PAUSED);
    game.router.navigate("/tutorial", { key: "step", value: "0" });
    expect(scene.lastState).toBe(SceneState.STOPPED);
  });

  it("maps found / lost targets to the store (and unlocks them)", () => {
    const target = getTargets(spread1.id)[0];
    scene.emit("targetFound", target.id);
    expect(game.state.trackedTargets).toEqual([target.id]);
    expect(game.history.isUnlocked(target.id)).toBe(true);
    scene.emit("targetLost", target.id);
    expect(game.state.trackedTargets).toEqual([]);
  });

  it("reports the AR status, shows loading while building / starting, marks the running scene", () => {
    scene.emit("status", "loading");
    expect(game.state.arStatus).toBe("loading");
    expect(game.state.loading).toBe(LoadingState.LOADING);

    scene.emit("status", "running");
    expect(game.state.arStatus).toBe("running");
    expect(game.state.loading).toBe(LoadingState.LOADED);
    expect(document.body.classList.contains("scene-active")).toBe(true);

    scene.emit("status", "paused");
    expect(document.body.classList.contains("scene-active")).toBe(false);
  });

  it("refreshes the camera permission when AR fails", () => {
    const check = vi.spyOn(game.camera, "checkPermission").mockResolvedValue(false);
    scene.emit("status", "error", "VIDEO_FAIL");
    expect(game.state.arStatus).toBe("error");
    expect(check).toHaveBeenCalled();
  });

  it("preloads the neighbours once a spread is ready", () => {
    const preload = vi.spyOn(PreloaderService.getInstance(), "preloadNeighbours").mockResolvedValue([]);
    scene.emit("ready", spread1.id);
    expect(preload).toHaveBeenCalledWith(spread1.id);
  });

  it("disposes the scene and stops listening when removed", () => {
    bridge.remove();
    expect(scene.disposed).toBe(true);
    game.spreads.switchSpread(spread2.id);
    expect(scene.loads).toEqual([spread1.id]);
  });
});
