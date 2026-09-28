import { GameStoreService, PreloaderService } from "@/services";
import { ArStatus, CAMERA_NOT_RESPONDING, CameraPermissionStatus, GameMode, IArScene, IGame, LoadingState, TARGET_UNLOCKED_EVENT } from "@/types";
import { getTarget } from "@/utils/game-config";
import { LazyArScene } from "./lazy-ar-scene";
import { getSceneState } from "./utils/scene-state";

/** Delay after startup before the AR chunk and the current spread are preloaded in idle time */
const WARM_UP_DELAY_MS = 1500;

/**
 * <ar-bridge>: the only link between the game store and the AR scene.
 *   store → AR: `currentSpread` → `load()`, mode + route → `setState()` (policy in scene-state.ts).
 *   AR → store: found / lost → `game.targets`, status → `arStatus` + loading page, ready → neighbour preload.
 * A target's first find (unlock) plays the entity's unlock animation and dispatches TARGET_UNLOCKED_EVENT;
 * tapping an entity opens its entry. The scene is a `LazyArScene` (three.js + MindAR load on the first scan,
 * warmed up in idle time after startup); tests inject one via `sceneFactory`.
 */
export class ArBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private scene: IArScene | null = null;
  private cleanups: Array<() => void> = [];

  /** Test seam: use this scene instead of creating one */
  static sceneFactory: ((container: HTMLElement) => IArScene) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
  }

  connectedCallback() {
    const container = document.getElementById("scene-container") ?? this.createContainer();
    const lazy = ArBridge.sceneFactory ? null : new LazyArScene(container);
    this.scene = ArBridge.sceneFactory ? ArBridge.sceneFactory(container) : lazy!;
    const scene = this.scene;
    const game = this.game;

    this.cleanups.push(
      scene.on("status", (status, error) => this.handleStatus(status, error)),
      scene.on("targetFound", id => this.handleFound(id)),
      scene.on("targetLost", id => game.targets.removeTarget(id)),
      scene.on("targetTapped", id => this.handleTap(id)),
      // The active .mind is loaded: fetch the neighbours' .mind + content into the browser cache
      scene.on("ready", spreadId => void PreloaderService.getInstance().preloadNeighbours(spreadId)),
      game.subscribeToProperty("currentSpread", id => {
        if (id) void scene.load(id);
      }),
      game.subscribeToProperty("mode", () => this.applySceneState()),
      game.subscribeToProperty("currentRoute", () => this.applySceneState()),
    );

    const spread = game.state.currentSpread;
    if (spread) void scene.load(spread);
    this.applySceneState();
    if (lazy) this.scheduleWarmUp(lazy);
  }

  /**
   * Once the loading screen is gone, in idle time: load the AR chunk and fetch the current spread's `.mind`
   * and content into the browser cache, so the first scan only has to start the camera.
   */
  private scheduleWarmUp(lazy: LazyArScene) {
    const idle = (run: () => void) =>
      typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 200);
    const warmUp = () => {
      const timer = window.setTimeout(() => idle(() => {
        if (!this.isConnected) return;
        void lazy.warmUp();
        const spread = this.game.state.currentSpread;
        if (spread) void PreloaderService.getInstance().preloadSpread(spread);
      }), WARM_UP_DELAY_MS);
      this.cleanups.push(() => window.clearTimeout(timer));
    };
    const started = (state: LoadingState) => state !== LoadingState.LOADING && state !== LoadingState.INITIAL;
    if (started(this.game.state.loading)) return warmUp();
    const unsubscribe = this.game.subscribeToProperty("loading", state => {
      if (!started(state)) return;
      unsubscribe();
      warmUp();
    });
    this.cleanups.push(unsubscribe);
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    void this.scene?.dispose();
    this.scene = null;
  }

  /** Records the find in the store; the first find (unlock) also animates the entity and notifies the found indicator */
  private handleFound(targetId: string) {
    const wasUnlocked = this.game.history.isUnlocked(targetId);
    this.game.targets.addTarget(targetId);
    if (wasUnlocked || !this.game.history.isUnlocked(targetId)) return;
    if (getTarget(targetId)?.entity) this.scene?.celebrate(targetId);
    document.dispatchEvent(new CustomEvent(TARGET_UNLOCKED_EVENT, { detail: { targetId } }));
  }

  /** Tap on an AR entity in scan mode opens its entry (the route sets consultation mode; the entry view marks it consulted) */
  private handleTap(targetId: string) {
    if (this.game.state.mode !== GameMode.SCAN) return;
    const target = getTarget(targetId);
    if (target) this.game.router.navigate("/entry", { key: "entryId", value: target.entryId });
  }

  private applySceneState() {
    void this.scene?.setState(getSceneState(this.game.state.mode, this.game.state.currentRoute));
  }

  private handleStatus(status: ArStatus, error?: string) {
    this.game.setArStatus(status);
    // The 3D layer shows while AR runs (main.css: body.scene-active #scene)
    document.body.classList.toggle("scene-active", status === "running");

    // Loading page while the scene is built or the camera starts
    if (status === "loading" || status === "starting") this.game.startLoading();
    else this.game.finishLoading();

    if (status === "error") {
      console.warn("[ArBridge] AR error:", error);
      // No picture from the camera: the overlay asks to reload / restart the browser.
      // Otherwise (denied / unavailable) refresh the permission state, which shows camera-permission-page.
      if (error?.includes(CAMERA_NOT_RESPONDING)) this.game.camera.reportNotResponding();
      else void this.game.camera.checkPermission();
    }
    // Running again (e.g. after the camera recovered): clear a "not responding" overlay
    if (status === "running" && this.game.state.cameraPermission === CameraPermissionStatus.NOT_RESPONDING) {
      void this.game.camera.checkPermission();
    }
  }

  private createContainer(): HTMLElement {
    const container = document.createElement("div");
    container.id = "scene-container";
    document.body.prepend(container);
    return container;
  }
}

customElements.define("ar-bridge", ArBridge);
