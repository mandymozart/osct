import { GameStoreService, PreloaderService } from "@/services";
import { ArStatus, IArScene, IGame } from "@/types";
import { createArScene } from "./ar";
import { getSceneState, registerChromaKeyShader } from "./utils";

// A-Frame (index.html) is loaded before the app modules; scenes may use the shader from the first load
registerChromaKeyShader();

/**
 * <ar-bridge> – the only glue between the game store and the AR scene (Phase 6, replaces the static
 * scene bridge and the target bridge).
 *   store → AR: `currentSpread` → `load()`, mode + route → `setState()` (scene-state policy)
 *   AR → store: found / lost → `game.targets`, status → `arStatus` + loading page, ready → preload
 * The scene itself is an `IArScene` (strategy chosen in `./ar/index.ts`); `scene` can be injected
 * for tests.
 */
export class ArBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private scene: IArScene | null = null;
  private cleanups: Array<() => void> = [];
  /** Dev timing: when the last spread switch was requested */
  private switchStarted: number | null = null;

  /** Test seam: use this scene instead of creating one */
  static sceneFactory: ((container: HTMLElement) => IArScene) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
  }

  connectedCallback() {
    const container = document.getElementById("scene-container") ?? this.createContainer();
    this.scene = ArBridge.sceneFactory ? ArBridge.sceneFactory(container) : createArScene(container);
    const scene = this.scene;
    const game = this.game;

    this.cleanups.push(
      scene.on("status", (status, error) => this.handleStatus(status, error)),
      scene.on("targetFound", id => game.targets.addTarget(id)),
      scene.on("targetLost", id => game.targets.removeTarget(id)),
      // The active .mind is loaded: fetch the neighbours' .mind + content into the browser cache
      scene.on("ready", spreadId => void PreloaderService.getInstance().preloadNeighbours(spreadId)),
      game.subscribeToProperty("currentSpread", id => {
        if (!id) return;
        this.switchStarted = performance.now();
        void scene.load(id);
      }),
      game.subscribeToProperty("mode", () => this.applySceneState()),
      game.subscribeToProperty("currentRoute", () => this.applySceneState()),
    );

    const spread = game.state.currentSpread;
    if (spread) void scene.load(spread);
    this.applySceneState();
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    void this.scene?.dispose();
    this.scene = null;
  }

  private applySceneState() {
    void this.scene?.setState(getSceneState(this.game.state.mode, this.game.state.currentRoute));
  }

  private handleStatus(status: ArStatus, error?: string) {
    this.game.setArStatus(status);
    // Dev: how long a spread switch takes until tracking runs again (compare the strategies)
    if (import.meta.env.DEV && this.switchStarted !== null && (status === "running" || status === "ready")) {
      console.info(`[AR] Spread switch → ${status} in ${Math.round(performance.now() - this.switchStarted)} ms`);
      if (status === "running") this.switchStarted = null;
    }
    document.body.classList.toggle("scene-active", status === "running");

    // Loading page while a scene is built or the camera starts (review #15: loading concept)
    if (status === "loading" || status === "starting") this.game.startLoading();
    else this.game.finishLoading();

    if (status === "error") {
      console.warn("[ArBridge] AR error:", error);
      // Camera denied / unavailable: refresh the permission state → camera-permission-page
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
