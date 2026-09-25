import { Scene } from "aframe";
import { ArSceneEvents, ArStatus, IArScene, SceneState } from "@/types";
import { Emitter, MindARSystem, nextTick, stopMindAR, waitForEvent } from "./mindar";
import { SpreadContent } from "./scene-builder";

/**
 * Common part of the AR scene strategies (Phase 6): the wish queue, the status, and start / pause /
 * stop of MindAR. Subclasses only decide **how the scene changes spread** (`changeSpread`):
 * `ArScene` rebuilds the scene, `PersistentArScene` swaps targets and content in one scene.
 *
 * Every call only records the wish (spread, state) and queues one reconcile step; each step reads the
 * newest wish, so fast switching never races and stale spreads are skipped.
 */
export abstract class BaseArScene implements IArScene {
  protected emitter = new Emitter<ArSceneEvents>();
  private queue: Promise<void> = Promise.resolve();
  protected wantedSpread: string | null = null;
  protected wantedState: SceneState = SceneState.STOPPED;

  protected scene: Scene | null = null;
  protected system: MindARSystem | null = null;
  protected content: SpreadContent | null = null;
  protected found = new Set<string>();
  /** MindAR started (camera on, `.mind` loaded) */
  protected started = false;
  protected running = false;
  /**
   * The last start failed (camera denied / unavailable): no retry until the wish changes (leaving scan
   * mode and coming back, another spread) – otherwise every queued RUNNING re-prompts for the camera.
   */
  protected startFailed = false;
  private _status: ArStatus = "idle";

  constructor(protected container: HTMLElement) {}

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

  /** Bring the scene to `spreadId` (null = remove everything) */
  protected abstract changeSpread(spreadId: string | null): Promise<void>;

  private reconcile(): Promise<void> {
    this.queue = this.queue.then(() => this.step()).catch(error => {
      console.error("[ArScene]", error);
      this.setStatus("error", error instanceof Error ? error.message : String(error));
    });
    return this.queue;
  }

  protected setStatus(status: ArStatus, error?: string) {
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

  /** Wait for MindAR's `arReady` (the `.mind` is loaded, tracking starts) after `begin()` */
  protected async awaitArReady(begin: () => void | Promise<void>): Promise<void> {
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
      // MindAR keeps its tracking state across a pause: resume entities of still found targets
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

  protected pauseEntities(): void {
    this.content?.anchors.forEach(a => a.entity?.onPause?.());
  }

  /** Report every found target as lost (scene / targets go away) */
  protected loseAll(): void {
    this.found.forEach(id => this.emitter.emit("targetLost", id));
    this.found.clear();
  }
}
