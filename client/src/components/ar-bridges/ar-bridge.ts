import { GameStoreService, GraphicsService, PreloaderService, resolveAddress, SubtitleService, UpdateService } from "@/services";
import { type ArError, type ArStatus, CameraPermissionStatus, CARD_FLIGHT_EVENT, type CardFlightDetail, ErrorCode, GameMode, type IArScene, type IGame, LoadingState, TARGET_UNLOCKED_EVENT } from "@/types";
import { getEntry, getTarget } from "@/utils/game-config";
import { EntryCategory } from "@/types";
import { bookCoverUrl } from "@/utils/book-cover";
import { LazyArScene } from "./lazy-ar-scene";
import { reportArError } from "@engine/utils/camera-debug";
import { getPreparedWindow } from "@engine/utils/prepared-scenes";
import { getArState } from "./utils/ar-state";

/** Lost this long after coming back to the scan, a target's card may fly again at its next find */
const REFLY_AFTER_RETURN_MS = 1500;

/** Delay after startup before the AR chunk and the current scene are preloaded in idle time */
const WARM_UP_DELAY_MS = 1500;

/** The scanning indicator (index.html, styles/gold-spinner.css) shown or hidden */
const showScanning = (scanning: boolean): void => {
  document.getElementById("osct-scanning")?.classList.toggle("hidden", !scanning);
};

/**
 * <ar-bridge>: the only link between the game store and the AR scene.
 *   store → AR: `currentScene` → `load()`, mode + route → `setState()` (policy in ar-state.ts).
 *   AR → store: found / lost → `game.targets`, status → `arStatus` + loading page, ready → content preload of the
 *   scenes kept ready next to the current one (the same window the tracker holds, `prepared-scenes.ts`).
 * A target's first find (unlock) plays the entity's unlock animation and dispatches TARGET_UNLOCKED_EVENT;
 * tapping an entity opens its entry (a video's tap pauses / plays it instead, #290); a glossary picture tapped for the first time flies its card first
 * (CARD_FLIGHT_EVENT). The scene's `scanning` shows the reader's scanning indicator (`#osct-scanning`,
 * index.html) while tracking runs and nothing is found, its `subtitle` goes to `SubtitleService` (the line of a speaking
 * video, drawn by `<subtitle-line>`); an AR error's code picks the camera overlay, a failed AR chunk
 * also the new-version notice (`UpdateService`). The scene is a `LazyArScene` (three.js + the 8th Wall engine load on the first
 * scan, warmed up in idle time after startup); tests inject one via `sceneFactory`.
 */
export class ArBridge extends HTMLElement {
  private game: Readonly<IGame>;
  private arScene: IArScene | null = null;
  private cleanups: Array<() => void> = [];
  /** The target whose card flies now (one at a time) */
  private flying: string | null = null;
  /** Targets whose card flew and opened the entry – not again until the page has left the camera */
  private flown = new Set<string>();
  /** When the reader last came (back) to the scan */
  private scanSince = Date.now();

  /** Test seam: use this scene instead of creating one */
  static sceneFactory: ((container: HTMLElement) => IArScene) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
  }

  connectedCallback() {
    const container = document.getElementById("ar-container") ?? this.createContainer();
    let lazy: LazyArScene | null = null;
    if (ArBridge.sceneFactory) this.arScene = ArBridge.sceneFactory(container);
    // A rule's goto (schema 5.0): the router opens the address as it opens a link to it
    else this.arScene = lazy = new LazyArScene(container, address => resolveAddress(this.game, address));
    const arScene = this.arScene;
    const game = this.game;

    this.cleanups.push(
      arScene.on("status", (status, error) => this.handleStatus(status, error)),
      arScene.on("targetFound", id => this.handleFound(id)),
      arScene.on("targetLost", id => this.handleLost(id)),
      arScene.on("targetTapped", (id, used) => this.handleTap(id, used)),
      arScene.on("scanning", scanning => showScanning(scanning)),
      arScene.on("subtitle", text => SubtitleService.getInstance().show(text)),
      // The reader turned to a neighbouring scene (8th Wall): switch like the scene menu does
      arScene.on("sceneSeen", id => {
        if (this.game.state.mode === GameMode.SCAN && id !== this.game.state.currentScene) this.game.scenes.switchScene(id);
      }),
      // The scene is tracked (or its window changed): fetch the window's target images + content into the cache
      arScene.on("ready", sceneId => void PreloaderService.getInstance().preloadScenes(getPreparedWindow(sceneId).map(scene => scene.id))),
      game.subscribeToProperty("currentScene", id => {
        if (id) void arScene.load(id);
      }),
      game.subscribeToProperty("mode", mode => {
        if (mode === GameMode.SCAN) this.scanSince = Date.now();
        this.applyArState();
      }),
      game.subscribeToProperty("currentRoute", () => this.applyArState()),
    );

    const scene = game.state.currentScene;
    if (scene) void arScene.load(scene);
    this.applyArState();
    if (lazy) this.scheduleWarmUp(lazy);
  }

  /**
   * Once the loading screen is gone, in idle time: load the AR chunk, fetch the engine's files and the current
   * scene's target images and content into the browser cache, so the first scan only has to start the camera.
   */
  private scheduleWarmUp(lazy: LazyArScene) {
    const idle = (run: () => void) =>
      typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 200);
    const warmUp = () => {
      const timer = window.setTimeout(() => idle(() => {
        if (!this.isConnected) return;
        // A deploy may have removed the AR chunk under the open page: offer the reload before the reader scans
        void lazy.warmUp().then(loaded => {
          if (!loaded) UpdateService.getInstance().reportStaleCode();
        });
        const scene = this.game.state.currentScene;
        if (scene) void PreloaderService.getInstance().preloadScene(scene);
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
    showScanning(false);
    SubtitleService.getInstance().show(null);
    void this.arScene?.dispose();
    this.arScene = null;
  }

  /** Records the find in the store; the first find (unlock) also animates the entity and notifies the found indicator */
  private handleFound(targetId: string) {
    const wasUnlocked = this.game.history.isUnlocked(targetId);
    this.game.targets.addTarget(targetId);
    if (!wasUnlocked && this.game.history.isUnlocked(targetId)) {
      if (getTarget(targetId)?.entity) this.arScene?.celebrate(targetId);
      document.dispatchEvent(new CustomEvent(TARGET_UNLOCKED_EVENT, { detail: { targetId } }));
    }
    this.flyCard(targetId);
  }

  /**
   * A lost target: out of the store; in scan mode, a while after the reader came back to it, its card may fly again
   * (right after the return the tracker may report it lost and found again – that is no new find)
   */
  private handleLost(targetId: string) {
    this.game.targets.removeTarget(targetId);
    if (this.game.state.mode === GameMode.SCAN && Date.now() - this.scanSince > REFLY_AFTER_RETURN_MS) this.flown.delete(targetId);
  }

  /**
   * The marginalia card (#285): a glossary target found in scan mode flies its card at once – every time it is found
   * anew – and its entry opens when the card has landed. It flies as the printed picture and becomes the entry's own
   * when it hits the screen; its back is the book's cover (when the content has a print layout). Once it opened its
   * entry it does not fly again until the page left the camera (`handleLost`), so coming back to the scan with the
   * page still in view does not open the entry again. Reduced motion: the entry opens at once.
   */
  private flyCard(targetId: string) {
    const arScene = this.arScene;
    if (!arScene || this.game.state.mode !== GameMode.SCAN || this.flying || this.flown.has(targetId)) return;
    const target = getTarget(targetId);
    const entry = target ? getEntry(target.entryId) : undefined;
    if (!target || !entry || target.entity || entry.category !== EntryCategory.Glossary || !target.imageSrc) return;
    this.flown.add(targetId);
    const open = () => this.game.router.navigate("/entry", { key: "entryId", value: entry.id });
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return open();
    const front = target.imageSrc;
    const picture = entry.image ? GraphicsService.getInstance().mediaSrc("image", entry.image, entry.imageLevels) : undefined; // #331
    const reveal = picture && picture !== front ? picture : undefined;
    const announce = (flying: boolean) =>
      document.dispatchEvent(new CustomEvent<CardFlightDetail>(CARD_FLIGHT_EVENT, { detail: { targetId, flying } }));
    this.flying = targetId;
    announce(true);
    void bookCoverUrl()
      .then(back => arScene.flyCard(targetId, { front, reveal, back: back ?? undefined }))
      .catch(() => false)
      .then(landed => {
        this.flying = null;
        announce(false);
        if (landed && this.isConnected && this.game.state.mode === GameMode.SCAN) open();
        // Cut short (lost before it took off, the scene stopped): it may fly at the next find
        else if (!landed) this.flown.delete(targetId);
      });
  }

  /**
   * Tap on an AR entity in scan mode opens its entry (the route sets consultation mode; the entry view marks it
   * consulted) – unless the entity used the tap itself: a video pauses / plays on a tap (#290)
   */
  private handleTap(targetId: string, used = false) {
    if (this.game.state.mode !== GameMode.SCAN || used) return;
    const target = getTarget(targetId);
    if (target) this.game.router.navigate("/entry", { key: "entryId", value: target.entryId });
  }

  private applyArState() {
    void this.arScene?.setState(getArState(this.game.state.mode, this.game.state.currentRoute));
  }

  private handleStatus(status: ArStatus, error?: ArError) {
    reportArError(status === "error" ? error?.message ?? "unknown" : null);
    this.game.setArStatus(status);
    // The 3D layer shows while AR runs (main.css: body.ar-active #scene)
    document.body.classList.toggle("ar-active", status === "running");

    // Loading page while the scene is built or the camera starts
    if (status === "loading" || status === "starting") this.game.startLoading();
    else this.game.finishLoading();

    if (status === "error") {
      console.warn("[ArBridge] AR error:", error);
      // The AR chunk did not load – a deploy may have removed it under the open page: the new-version notice offers
      // a reload in place of the dead camera view (the next scan tries the chunk again)
      if (error?.code === ErrorCode.AR_LOAD_FAILED) UpdateService.getInstance().reportStaleCode();
      // No picture from the camera: the overlay asks to reload / restart the browser.
      // Otherwise (denied / unavailable) refresh the permission state, which shows camera-permission-page.
      if (error?.code === ErrorCode.CAMERA_NOT_RESPONDING) this.game.camera.reportNotResponding();
      else void this.game.camera.checkPermission();
    }
    // Running again (e.g. after the camera recovered): clear a "not responding" overlay
    if (status === "running" && this.game.state.cameraPermission === CameraPermissionStatus.NOT_RESPONDING) {
      void this.game.camera.checkPermission();
    }
  }

  private createContainer(): HTMLElement {
    const container = document.createElement("div");
    container.id = "ar-container";
    document.body.prepend(container);
    return container;
  }
}

customElements.define("ar-bridge", ArBridge);
