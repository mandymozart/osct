import { Scene } from "aframe";
import { ArSceneEvents, ArStatus, IArScene, SceneState } from "@/types";
import { getAssets, getSpread, getTargets } from "@/utils/game-config";
import { createAsset } from "./entities";
import {
  Anchor,
  buildAnchor,
  disarmMindAR,
  Emitter,
  MindARSystem,
  mindarAttribute,
  nextTick,
  removeMindAROverlays,
  SCENE_ATTRIBUTES,
  stopMindAR,
  waitForEvent,
} from "./mindar";

/**
 * AR scene – strategy A (PLAN Phase 6, decided): a **new A-Frame scene per spread**, built with DOM
 * calls. Proven approach (replacing the scene lets the browser reset MindAR and the target listeners);
 * the camera restarts on each spread switch. Strategy B keeps one scene: `PersistentArScene`.
 *
 * Every call only records the wish (spread, state) and queues one reconcile step; each step reads the
 * newest wish, so fast switching never races and stale spreads are skipped.
 */
export class ArScene implements IArScene {
  private emitter = new Emitter<ArSceneEvents>();
  private queue: Promise<void> = Promise.resolve();
  private wantedSpread: string | null = null;
  private wantedState: SceneState = SceneState.STOPPED;

  private scene: Scene | null = null;
  private system: MindARSystem | null = null;
  private anchors: Anchor[] = [];
  private found = new Set<string>();
  private loadedSpread: string | null = null;
  /** MindAR started on this scene (camera on, `.mind` loaded) */
  private started = false;
  private running = false;
  /**
   * The last start failed (camera denied / unavailable): no retry until the wish changes (leaving scan
   * mode and coming back, another spread) – otherwise every queued RUNNING re-prompts for the camera.
   */
  private startFailed = false;
  private _status: ArStatus = "idle";

  constructor(private container: HTMLElement) {}

  get status(): ArStatus {
    return this._status;
  }

  get spreadId(): string | null {
    return this.loadedSpread;
  }

  on<E extends keyof ArSceneEvents>(event: E, listener: ArSceneEvents[E]): () => void {
    return this.emitter.on(event, listener);
  }

  load(spreadId: string): Promise<void> {
    this.wantedSpread = spreadId;
    return this.reconcile();
  }

  setState(state: SceneState): Promise<void> {
    if (state !== this.wantedState) this.startFailed = false;
    this.wantedState = state;
    return this.reconcile();
  }

  dispose(): Promise<void> {
    this.wantedSpread = null;
    this.wantedState = SceneState.STOPPED;
    return this.reconcile();
  }

  private reconcile(): Promise<void> {
    this.queue = this.queue.then(() => this.step()).catch(error => {
      console.error("[ArScene]", error);
      this.setStatus("error", error instanceof Error ? error.message : String(error));
    });
    return this.queue;
  }

  private setStatus(status: ArStatus, error?: string) {
    if (status === this._status && !error) return;
    this._status = status;
    this.emitter.emit("status", status, error);
  }

  /** Bring the scene to the wanted spread and state */
  private async step(): Promise<void> {
    if (this.wantedSpread !== this.loadedSpread) {
      await this.teardown();
      if (this.wantedSpread) await this.build(this.wantedSpread);
    }
    if (!this.scene || !this.system) {
      this.setStatus("idle");
      return;
    }

    switch (this.wantedState) {
      case SceneState.RUNNING:
        await this.run();
        break;
      case SceneState.PAUSED:
        this.pause();
        break;
      case SceneState.STOPPED:
        this.stop();
        break;
    }
  }

  private async build(spreadId: string): Promise<void> {
    const spread = getSpread(spreadId);
    if (!spread) throw new Error(`Unknown spread ${spreadId}`);
    this.setStatus("loading");

    const scene = document.createElement("a-scene") as Scene;
    scene.id = "scene";
    Object.entries(SCENE_ATTRIBUTES).forEach(([k, v]) => scene.setAttribute(k, v));
    scene.setAttribute("mindar-image", mindarAttribute(spread.mindSrc));

    const assets = document.createElement("a-assets");
    const assetById = new Map<string, HTMLElement>();
    getAssets(spreadId).forEach(data => {
      const el = createAsset(data);
      if (el && !assetById.has(data.id)) {
        assetById.set(data.id, el);
        assets.appendChild(el);
      }
    });
    scene.appendChild(assets);

    const camera = document.createElement("a-camera");
    camera.setAttribute("position", "0 0 0");
    camera.setAttribute("look-controls", "enabled: false");
    scene.appendChild(camera);

    this.found.clear();
    this.anchors = getTargets(spreadId).map(target => buildAnchor(target, id => assetById.get(id), this.emitter, this.found));
    this.anchors.forEach(anchor => scene.appendChild(anchor.element));

    this.container.appendChild(scene);
    if (!scene.hasLoaded) await waitForEvent(scene, "loaded", { timeout: 30000 });

    this.scene = scene;
    this.system = scene.systems["mindar-image-system"] as unknown as MindARSystem;
    this.loadedSpread = spreadId;
    this.started = false;
    this.running = false;
    this.startFailed = false;
    this.setStatus("ready");
  }

  private async teardown(): Promise<void> {
    if (!this.scene) return;
    this.pauseEntities();
    this.found.forEach(id => this.emitter.emit("targetLost", id));
    this.found.clear();
    disarmMindAR(this.system);
    this.scene.remove();
    removeMindAROverlays();
    this.scene = null;
    this.system = null;
    this.anchors = [];
    this.loadedSpread = null;
    this.started = false;
    this.running = false;
  }

  private async run(): Promise<void> {
    const scene = this.scene!;
    const system = this.system!;
    if (!this.started) {
      if (this.startFailed) return;
      this.setStatus("starting");
      const ready = waitForEvent(scene, "arReady", { failEvent: "arError" });
      system.start();
      try {
        await ready;
      } catch (error) {
        stopMindAR(system);
        this.startFailed = true;
        throw new Error(`AR could not start: ${(error as Error).message}`);
      }
      this.started = true;
      this.running = true;
      this.emitter.emit("ready", this.loadedSpread!);
      await nextTick();
      // A newer wish arrived while starting: the next queued step applies it
      if (this.wantedState !== SceneState.RUNNING) return;
    } else if (!this.running) {
      system.unpause();
      scene.play();
      this.running = true;
      // MindAR keeps its tracking state across a pause: resume entities of still found targets
      this.anchors.filter(a => this.found.has(a.target.id)).forEach(a => a.entity?.onFound?.());
    }
    this.setStatus("running");
  }

  private pause(): void {
    if (this.started && this.running) {
      try {
        this.system!.pause();
      } catch (error) {
        console.warn("[ArScene] Pausing MindAR failed:", error);
      }
      this.scene!.pause();
      this.running = false;
    }
    this.pauseEntities();
    this.setStatus(this.started ? "paused" : "ready");
  }

  private stop(): void {
    this.pauseEntities();
    if (this.started) {
      stopMindAR(this.system);
      this.found.forEach(id => this.emitter.emit("targetLost", id));
      this.found.clear();
      this.started = false;
      this.running = false;
    }
    this.setStatus("ready");
  }

  private pauseEntities(): void {
    this.anchors.forEach(a => a.entity?.onPause?.());
  }
}
