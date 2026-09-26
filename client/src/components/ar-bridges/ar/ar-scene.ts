import { Box3, Group, Matrix4, Vector3 } from "three";
import { ArSceneEvents, ArStatus, IArScene, SceneState, Target } from "@/types";
import { getAssets, getMaxTargetsPerSpread, getSpread, getTargets } from "@/utils/game-config";
import { Emitter } from "../utils/emitter";
import { AssetStore } from "./assets";
import { celebrate } from "./celebration";
import { buildEntity, EntityInstance } from "./entities";
import { ImageTracker } from "./tracker";
import { ArView } from "./view";

interface Anchor {
  target: Target;
  group: Group;
  entity: EntityInstance | null;
}

interface SpreadContent {
  spreadId: string;
  mindSrc: string;
  anchors: Anchor[];
}

/** Taps on these (and inside them) are app UI, not taps on the AR scene */
const UI_SELECTOR = 'button, a, input, select, textarea, label, [role="button"], [role="listbox"], [role="option"]';

/** A tap this close to an entity's on-screen bounds still hits it (small models) */
const TAP_MARGIN_PX = 24;

/** Scanning indicator (index.html, styles/gold-spinner.css): shown while no target is found */
const scanningIndicator = () => document.getElementById("osct-scanning");

/**
 * The AR scene: plain three.js + MindAR tracking, **one** renderer and camera stream for the session.
 * Built lazily – nothing (no WebGL context, no assets, no camera) until AR first runs (RUNNING). A spread switch keeps the renderer and the camera stream and only
 *   1. stops MindAR's tracking controller,
 *   2. swaps the anchors, entities and assets (assets both spreads use stay),
 *   3. starts tracking the new `.mind` on the running camera video.
 *
 * Every call only records the wish (spread, state) and queues one reconcile step; each step reads the
 * newest wish, so fast switching never races and outdated spreads are skipped.
 */
export class ArScene implements IArScene {
  private emitter = new Emitter<ArSceneEvents>();
  private queue: Promise<void> = Promise.resolve();
  private wantedSpread: string | null = null;
  private wantedState: SceneState = SceneState.STOPPED;

  private view: ArView | null = null;
  private tracker: ImageTracker | null = null;
  private assets = new AssetStore();
  private content: SpreadContent | null = null;
  private found = new Set<string>();
  /** Tracking runs for `content` (camera on, `.mind` loaded) */
  private started = false;
  private running = false;
  /**
   * The last start failed (camera denied / unavailable): no retry until the wish changes – otherwise
   * every queued RUNNING would ask for the camera again.
   */
  private startFailed = false;
  private _status: ArStatus = "idle";
  /** Running animations (celebrations): frame functions, removed when they return false */
  private animations = new Set<(delta: number) => boolean>();

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

  celebrate(targetId: string): void {
    const anchor = this.content?.anchors.find(a => a.target.id === targetId);
    if (!anchor?.entity || !this.view) return;
    this.animations.add(celebrate(anchor.group, anchor.entity.object));
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
    if (!this.wantedSpread) return this.teardown();
    // Lazy: the first RUNNING builds the renderer; until then only the wish is kept
    if (!this.view && this.wantedState !== SceneState.RUNNING) {
      this.setStatus("idle");
      return;
    }
    if (this.wantedSpread !== this.spreadId) {
      await this.changeSpread(this.wantedSpread);
      this.startFailed = false;
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

  private ensureView(): ArView {
    if (!this.view) {
      this.tracker = new ImageTracker(this.container, {
        maxTrack: getMaxTargetsPerSpread(),
        onUpdate: (index, matrix) => this.onTrackingUpdate(index, matrix),
      });
      this.view = new ArView(this.container, camera => this.tracker?.fit(camera));
      this.view.needsRender = () => this.animations.size > 0 || !!this.content?.anchors.some(a => a.group.visible);
      this.view.onFrame(delta => {
        this.content?.anchors.forEach(a => a.entity?.update?.(delta));
        this.animations.forEach(animation => animation(delta) || this.animations.delete(animation));
      });
      document.addEventListener("click", this.onTap);
    }
    return this.view;
  }

  /** Bring the scene to `spreadId`: tracking stops, content is swapped, tracking restarts if it ran */
  private async changeSpread(spreadId: string): Promise<void> {
    const spread = getSpread(spreadId);
    if (!spread) throw new Error(`Unknown spread ${spreadId}`);
    const view = this.ensureView();
    const tracker = this.tracker!;
    const cameraOn = tracker.hasCamera;
    this.setStatus(cameraOn ? "starting" : "loading");

    // 1. Stop tracking – the camera stream stays
    this.pauseEntities();
    this.loseAll();
    tracker.stopTracking();
    this.started = false;
    this.running = false;

    // 2. Swap the content (assets both spreads use stay loaded)
    this.removeContent();
    const assets = getAssets(spreadId);
    this.assets.release(new Set(assets.map(a => a.id)));
    await this.assets.load(assets);
    const anchors = getTargets(spreadId).map(target => this.buildAnchor(target));
    anchors.forEach(anchor => view.scene.add(anchor.group));
    this.content = { spreadId, mindSrc: spread.mindSrc, anchors };

    // 3. Tracking restarts in run() (camera kept); paused / stopped it waits for the next start
    if (this.wantedState !== SceneState.RUNNING) this.setStatus("ready");
  }

  private buildAnchor(target: Target): Anchor {
    const group = new Group();
    group.name = target.id;
    group.visible = false;
    group.matrixAutoUpdate = false;
    const entity = buildEntity(target, id => this.assets.get(id));
    if (entity) group.add(entity.object);
    return { target, group, entity };
  }

  private removeContent(): void {
    this.finishAnimations();
    this.content?.anchors.forEach(anchor => {
      anchor.entity?.onPause?.();
      anchor.entity?.dispose?.();
      anchor.group.removeFromParent();
    });
    this.content = null;
  }

  /** Jump running animations to their end (they clean up after themselves) */
  private finishAnimations(): void {
    this.animations.forEach(animation => animation(Infinity));
    this.animations.clear();
  }

  /** MindAR update of one target: move its anchor, report found / lost */
  private onTrackingUpdate(targetIndex: number, matrix: Matrix4 | null): void {
    const anchor = this.content?.anchors.find(a => a.target.index === targetIndex);
    if (!anchor || !this.running) return;
    const id = anchor.target.id;
    if (matrix) {
      anchor.group.matrix.copy(matrix);
      anchor.group.matrixWorldNeedsUpdate = true;
    }
    anchor.group.visible = !!matrix;
    if (matrix && !this.found.has(id)) {
      this.found.add(id);
      anchor.entity?.onFound?.();
      this.emitter.emit("targetFound", id);
    } else if (!matrix && this.found.has(id)) {
      this.found.delete(id);
      anchor.entity?.onLost?.();
      this.emitter.emit("targetLost", id);
    }
    scanningIndicator()?.classList.toggle("hidden", this.found.size > 0);
  }

  /**
   * A tap on the screen: the canvas lies under the app's pages, so taps are read from the document. Taps on
   * app UI are ignored; otherwise the nearest found entity whose on-screen bounds (+ margin) contain the
   * tap is reported (`targetTapped`).
   */
  private onTap = (event: MouseEvent): void => {
    if (!this.running || !this.view || !this.content) return;
    const onUi = event.composedPath().some(el => el instanceof Element && el.matches(UI_SELECTOR));
    if (onUi) return;
    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const camera = this.view.camera;
    const box = new Box3();
    const corner = new Vector3();
    let hit: { id: string; distance: number } | null = null;
    for (const anchor of this.content.anchors) {
      if (!anchor.group.visible || !anchor.entity || !this.found.has(anchor.target.id)) continue;
      box.setFromObject(anchor.entity.object);
      if (box.isEmpty()) continue;
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        corner.project(camera);
        const sx = ((corner.x + 1) / 2) * rect.width;
        const sy = ((1 - corner.y) / 2) * rect.height;
        left = Math.min(left, sx); right = Math.max(right, sx);
        top = Math.min(top, sy); bottom = Math.max(bottom, sy);
      }
      const inside = x >= left - TAP_MARGIN_PX && x <= right + TAP_MARGIN_PX && y >= top - TAP_MARGIN_PX && y <= bottom + TAP_MARGIN_PX;
      if (!inside) continue;
      const distance = box.getCenter(corner).distanceTo(camera.position);
      if (!hit || distance < hit.distance) hit = { id: anchor.target.id, distance };
    }
    if (hit) this.emitter.emit("targetTapped", hit.id);
  };

  private teardown(): void {
    document.removeEventListener("click", this.onTap);
    this.pauseEntities();
    this.loseAll();
    this.removeContent();
    this.assets.release();
    this.tracker?.stop();
    this.view?.dispose();
    this.tracker = null;
    this.view = null;
    this.started = false;
    this.running = false;
    scanningIndicator()?.classList.add("hidden");
    this.setStatus("idle");
  }

  // ── Start / pause / stop ────────────────────────────────────────────────────────────────────

  /** Camera (if off) + tracking of the current spread's `.mind` */
  private async startTracking(): Promise<void> {
    const tracker = this.tracker!;
    const content = this.content!;
    try {
      await tracker.startCamera();
      await tracker.loadTargets(content.mindSrc);
    } catch (error) {
      tracker.stop();
      this.started = false;
      this.running = false;
      this.startFailed = true;
      throw new Error(`AR could not start: ${(error as Error)?.message ?? error}`);
    }
    this.view!.resize(); // field of view from the controller's projection
    this.started = true;
    this.emitter.emit("ready", content.spreadId);
  }

  private async run(): Promise<void> {
    if (!this.started) {
      if (this.startFailed) return;
      this.setStatus("starting");
      await this.startTracking();
      // A newer wish arrived while starting: the next queued step applies it
      if (this.wantedState !== SceneState.RUNNING || this.wantedSpread !== this.spreadId) return;
    } else if (!this.running) {
      // MindAR starts its tracking state afresh: targets are found again (all were lost at the pause)
      this.tracker!.resume();
    }
    this.running = true;
    this.view!.start();
    scanningIndicator()?.classList.toggle("hidden", this.found.size > 0);
    this.setStatus("running");
  }

  private pause(): void {
    if (this.started && this.running) {
      this.tracker!.pause();
      this.view!.stop();
      this.running = false;
    }
    this.pauseEntities();
    // Nothing stays where it was: MindAR restarts its tracking state on resume and would never report
    // these targets lost – their anchors would stay visible at the old position ("stuck in space")
    this.finishAnimations();
    this.loseAll();
    scanningIndicator()?.classList.add("hidden");
    this.setStatus(this.started ? "paused" : "ready");
  }

  private stop(): void {
    this.pauseEntities();
    this.tracker?.stop();
    this.view?.stop();
    this.loseAll();
    this.started = false;
    this.running = false;
    scanningIndicator()?.classList.add("hidden");
    this.setStatus("ready");
  }

  private pauseEntities(): void {
    this.content?.anchors.forEach(a => a.entity?.onPause?.());
  }

  /** Report every found target as lost (tracking stops or the targets go away) */
  private loseAll(): void {
    this.content?.anchors.forEach(a => (a.group.visible = false));
    this.found.forEach(id => this.emitter.emit("targetLost", id));
    this.found.clear();
  }
}
