import { Scene } from "aframe";
import { ArSceneEvents, ArStatus, IArScene, SceneState } from "@/types";
import { getAssets, getSpread } from "@/utils/game-config";
import {
  disarmMindAR,
  Emitter,
  MindARSystem,
  nextTick,
  removeMindAROverlays,
  stopMindAR,
  waitForEvent,
} from "./mindar";
import { addSpreadContent, createScene, removeSpreadContent, SpreadContent, whenLoaded } from "./scene-builder";

/** MindAR internals used to swap spreads (vendored build – check them when upgrading MindAR) */
type SwappableMindAR = MindARSystem & {
  video: HTMLVideoElement | null;
  controller: { stopProcessVideo(): void; dispose(): void } | null;
  anchorEntities: unknown[];
  imageTargetSrc: string;
  _startAR(): Promise<void>;
};

/**
 * The AR scene: **one A-Frame scene** for the whole session. A spread switch keeps the scene and the
 * camera stream and only
 *   1. stops and disposes MindAR's tracking controller,
 *   2. swaps the anchors, entities and assets (assets both spreads use stay),
 *   3. restarts tracking on the running camera video with the new `.mind`.
 *
 * Every call only records the wish (spread, state) and queues one reconcile step; each step reads the
 * newest wish, so fast switching never races and outdated spreads are skipped.
 */
export class ArScene implements IArScene {
  private emitter = new Emitter<ArSceneEvents>();
  private queue: Promise<void> = Promise.resolve();
  private wantedSpread: string | null = null;
  private wantedState: SceneState = SceneState.STOPPED;

  private scene: Scene | null = null;
  private system: SwappableMindAR | null = null;
  private content: SpreadContent | null = null;
  private found = new Set<string>();
  /** MindAR started: camera on, `.mind` loaded */
  private started = false;
  private running = false;
  /**
   * The last start failed (camera denied / unavailable): no retry until the wish changes – otherwise
   * every queued RUNNING would ask for the camera again.
   */
  private startFailed = false;
  private _status: ArStatus = "idle";

  constructor(private container: HTMLElement) {}

  get status(): ArStatus {
    return this._status;
  }

  get spreadId(): string | null {
    return this.content?.spreadId ?? null;
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

  private async step(): Promise<void> {
    if (this.wantedSpread !== this.spreadId) {
      await this.changeSpread(this.wantedSpread);
      this.startFailed = false;
    }
    if (!this.scene || !this.system || !this.content) {
      this.setStatus("idle");
      return;
    }
    switch (this.wantedState) {
      case SceneState.RUNNING:
        return this.run();
      case SceneState.PAUSED:
        return this.pause();
      case SceneState.STOPPED:
        return this.stop();
    }
  }

  // ── Spreads ─────────────────────────────────────────────────────────────────────────────────

  /** Bring the scene to `spreadId`; null removes it */
  private async changeSpread(spreadId: string | null): Promise<void> {
    if (!spreadId) return this.teardown();
    const spread = getSpread(spreadId);
    if (!spread) throw new Error(`Unknown spread ${spreadId}`);

    if (!this.scene) {
      this.setStatus("loading");
      const scene = createScene(spread.mindSrc);
      this.content = addSpreadContent(scene, spreadId, this.emitter, this.found);
      this.container.appendChild(scene);
      await whenLoaded(scene);
      this.scene = scene as Scene;
      this.system = scene.systems["mindar-image-system"] as unknown as SwappableMindAR;
      this.setStatus("ready");
      return;
    }
    await this.swap(spreadId, spread.mindSrc);
  }

  private async swap(spreadId: string, mindSrc: string): Promise<void> {
    const system = this.system!;
    const cameraOn = !!system.video;
    this.setStatus(cameraOn ? "starting" : "loading");

    // 1. Stop tracking – the camera stream stays
    this.pauseEntities();
    this.loseAll();
    if (system.controller) {
      try {
        system.controller.stopProcessVideo();
        system.controller.dispose();
      } catch (error) {
        console.warn("[ArScene] Disposing the controller failed:", error);
      }
      system.controller = null;
    }
    this.running = false;

    // 2. Swap the content – anchors register with MindAR on init, so reset its list first
    const nextAssets = new Set(getAssets(spreadId).map(a => a.id));
    if (this.content) removeSpreadContent(this.content, nextAssets);
    system.anchorEntities = [];
    system.imageTargetSrc = mindSrc;
    this.content = addSpreadContent(this.scene!, spreadId, this.emitter, this.found);
    await Promise.all(this.content.anchors.map(anchor => whenLoaded(anchor.element)));

    // 3. Restart tracking on the running video; with the camera off, the next start loads the new .mind
    if (cameraOn) {
      await this.awaitArReady(() => system._startAR());
    } else {
      this.started = false;
      this.setStatus("ready");
    }
  }

  private teardown(): void {
    if (!this.scene) return;
    this.pauseEntities();
    this.loseAll();
    disarmMindAR(this.system);
    this.scene.remove();
    removeMindAROverlays();
    this.scene = null;
    this.system = null;
    this.content = null;
    this.started = false;
    this.running = false;
  }

  // ── Start / pause / stop ────────────────────────────────────────────────────────────────────

  /** Wait for MindAR's `arReady` (`.mind` loaded, tracking starts) after `begin()` */
  private async awaitArReady(begin: () => void | Promise<void>): Promise<void> {
    const ready = waitForEvent(this.scene!, "arReady", { failEvent: "arError" });
    try {
      await begin();
      await ready;
    } catch (error) {
      stopMindAR(this.system);
      this.started = false;
      this.running = false;
      this.startFailed = true;
      throw new Error(`AR could not start: ${(error as Error).message}`);
    }
    this.started = true;
    this.running = true;
    this.emitter.emit("ready", this.spreadId!);
    // MindAR starts processing right after arReady – a pause has to come one tick later
    await nextTick();
  }

  private async run(): Promise<void> {
    if (!this.started) {
      if (this.startFailed) return;
      this.setStatus("starting");
      await this.awaitArReady(() => this.system!.start());
      // A newer wish arrived while starting: the next queued step applies it
      if (this.wantedState !== SceneState.RUNNING) return;
    } else if (!this.running) {
      this.system!.unpause();
      this.scene!.play();
      this.running = true;
      // MindAR keeps its tracking state across a pause: resume the entities of targets still found
      this.content!.anchors.filter(a => this.found.has(a.target.id)).forEach(a => a.entity?.onFound?.());
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
      this.loseAll();
      this.started = false;
      this.running = false;
    }
    this.setStatus("ready");
  }

  private pauseEntities(): void {
    this.content?.anchors.forEach(a => a.entity?.onPause?.());
  }

  /** Report every found target as lost (the scene or its targets go away) */
  private loseAll(): void {
    this.found.forEach(id => this.emitter.emit("targetLost", id));
    this.found.clear();
  }
}
