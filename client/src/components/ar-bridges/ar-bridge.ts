import { GameStoreService, PreloaderService } from "@/services";
import { ArStatus, CAMERA_NOT_RESPONDING, CameraPermissionStatus, GameMode, IArScene, IGame, LoadingState, TARGET_UNLOCKED_EVENT } from "@/types";
import { getTarget } from "@/utils/game-config";
import { LazyArScene } from "./lazy-ar-scene";
import { getSceneState } from "./utils/scene-state";

/** After startup: wait this long, then load the AR chunk and the current spread in idle time */
const WARM_UP_DELAY_MS = 1500;

/**
 * <ar-bridge> – the only glue between the game store and the AR scene
 *   store → AR: `currentSpread` → `load()`, mode + route → `setState()` (scene-state policy)
 *   AR → store: found / lost → `game.targets`, status → `arStatus` + loading page, ready → preload
 *   First find (= unlock): discovery animation of the entity + TARGET_UNLOCKED_EVENT (found indicator).
 *   Entity tapped: the entry opens (= consulted), like a tap on the found indicator's image.
 * The scene is an `IArScene`: `LazyArScene` (three.js + MindAR load on the first scan, warmed up in idle
 * time after startup); tests inject a fake one.
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
      // The reader turned to a neighbouring spread (8th Wall): switch like the spread menu does
      scene.on("spreadSeen", id => {
        if (this.game.state.mode === GameMode.SCAN && id !== this.game.state.currentSpread) this.game.spreads.switchSpread(id);
      }),
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
   * Once the app has started (loading screen gone), in idle time: load the AR chunk and fetch the current
   * spread's `.mind` and content into the browser cache – the first scan then only starts the camera.
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

  /** Found: tracked + unlocked (store); the first find also celebrates (entity) and tells the indicator */
  private handleFound(targetId: string) {
    const wasUnlocked = this.game.history.isUnlocked(targetId);
    this.game.targets.addTarget(targetId);
    if (wasUnlocked || !this.game.history.isUnlocked(targetId)) return;
    if (getTarget(targetId)?.entity) this.scene?.celebrate(targetId);
    document.dispatchEvent(new CustomEvent(TARGET_UNLOCKED_EVENT, { detail: { targetId } }));
  }

  /** Tap on an AR entity in scan mode: open its entry (the route sets consultation mode; the view consults it) */
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
      // No picture from the camera: the overlay asks to reload / restart the browser;
      // else (denied / unavailable) refresh the permission state → camera-permission-page
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
