import { PerspectiveCamera } from "three";
import { CAMERA_NOT_RESPONDING } from "@/types";
import { CAMERA_START_TIMEOUT_MS, IImageTracker, ImageTrackerOptions, TrackedSpread } from "./tracker-types";
import {
  anchorMatrix,
  loadXr8,
  makeImageTarget,
  PreparedImageTarget,
  XR8Api,
  XrImageDetail,
  XrPipelineModule,
  XrReality,
} from "./xr8";

/** Loading the targets into the engine may take this long before tracking starts anyway */
const TARGETS_LOAD_TIMEOUT_MS = 15000;
/** A neighbouring spread's target seen this long (and none of the current spread's) switches the spread */
const SPREAD_SEEN_MS = 400;
const NEAR = 0.01;
const FAR = 1000;

interface SpreadTargets {
  spreadId: string;
  targets: PreparedImageTarget[];
}

interface LoadedTarget {
  index: number;
  /** Anchor scale per engine scale: scaled width × full image width ÷ tracked width */
  widthFactor: number;
}

/**
 * Camera + image tracking with the 8th Wall engine (exploration 2026-09-28: compared with MindAR on the phones,
 * `utils/tracker-choice.ts`). Same contract as the MindAR `ImageTracker`: the camera survives a spread switch,
 * `loadTargets()` swaps the engine's image targets (made from the target images, `xr8.ts`).
 *
 * Spread switches: the engine extracts each target's features on the device (one target per frame, no
 * precompiled file like MindAR's `.mind`). So the neighbouring spreads' targets stay loaded next to the current
 * ones (`prepareTargets()`, the counterpart of the `.mind` preloading) – the engine only reports the current
 * spread's to the app, and a switch to a neighbour starts at once. The engine keeps what it already has when it
 * is configured again and extracts only new targets. A neighbour's target seen steadily while none of the
 * current spread's is means the reader turned the page: `onSpreadSeen` (the app switches the spread).
 *
 * The engine owns the camera: it draws the picture into its own canvas under the three.js canvas (a second
 * WebGL context – MindAR's TF.js has one too) and reports poses in its scene. World tracking is off, so the
 * camera stays put; each target's anchor is its pose relative to the camera – the three.js camera stays at
 * the origin and gets the engine's projection, as in the engine's own three.js module.
 */
export class EighthWallTracker implements IImageTracker {
  private XR8: XR8Api | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private camera: PerspectiveCamera | null = null;
  private intrinsics: number[] | null = null;
  private started = false;
  private paused = false;
  /** Engine target name → app target, for the spread being tracked (empty while none is) */
  private targets = new Map<string, LoadedTarget>();
  /** Found targets' latest engine poses, by target index */
  private poses = new Map<number, { detail: XrImageDetail; target: LoadedTarget }>();
  private loadRun = 0;
  private imageTargets = new Map<string, Promise<PreparedImageTarget>>();
  /** The current spread's targets and the neighbours' (`prepareTargets()`) – what the engine keeps loaded */
  private current: SpreadTargets | null = null;
  private upcoming: SpreadTargets[] = [];
  /** Engine target name → its spread, for the upcoming spreads' targets */
  private spreadOf = new Map<string, string>();
  /** Upcoming spreads' targets in view, since when (performance.now()) */
  private seenSince = new Map<string, number>();
  /** Engine target names whose features are extracted (reported by its `imagescanning` event) */
  private ready = new Set<string>();
  private prepareRun = 0;
  private startWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private scanningWaiter: (() => void) | null = null;

  constructor(private container: HTMLElement, private options: ImageTrackerOptions) {}

  get hasCamera(): boolean {
    return this.started;
  }

  get tracking(): boolean {
    return this.targets.size > 0;
  }

  async startCamera(): Promise<void> {
    if (this.started) return;
    const XR8 = await loadXr8();
    this.XR8 = XR8;

    const canvas = document.createElement("canvas");
    canvas.className = "ar-camera";
    Object.assign(canvas.style, { position: "absolute", top: "0", left: "0", width: "100%", height: "100%", zIndex: "-2" });
    this.container.appendChild(canvas);
    this.canvas = canvas;
    this.sizeCanvas();

    const started = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error(`${CAMERA_NOT_RESPONDING} (no picture after ${CAMERA_START_TIMEOUT_MS / 1000} s)`)),
        CAMERA_START_TIMEOUT_MS,
      );
      this.startWaiter = {
        resolve: () => { window.clearTimeout(timer); resolve(); },
        reject: error => { window.clearTimeout(timer); reject(error); },
      };
    });
    XR8.XrController!.configure({ disableWorldTracking: true, imageTargetData: [] });
    XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.XrController!.pipelineModule(), this.module()]);
    // Any device: desktop browsers (dev, tests) too – the default allows phones only
    XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
    try {
      await started;
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.startWaiter = null;
    }
    this.started = true;
  }

  async loadTargets({ spreadId, targets }: TrackedSpread): Promise<void> {
    const XR8 = this.XR8;
    if (!XR8 || !this.started) throw new Error("loadTargets() needs the camera");
    this.stopTracking();
    const run = this.loadRun;

    const begun = performance.now();
    const withImage = targets.filter(target => target.imageSrc);
    const data = await Promise.all(withImage.map(target => this.imageTarget(target.imageSrc)));
    if (run !== this.loadRun) return; // replaced or stopped meanwhile
    this.targets = new Map(data.map((target, i) => [
      target.data.name,
      { index: withImage[i].index, widthFactor: target.widthFactor },
    ]));
    // The previous spread stays loaded until prepareTargets() names the new neighbours (it is one of them)
    this.upcoming = this.current ? [...this.upcoming, this.current] : this.upcoming;
    this.current = { spreadId, targets: data };
    this.configureEngine();
    if (!data.length) return;
    if (data.every(target => this.ready.has(target.data.name))) {
      console.info(`[8th Wall] ${data.length} targets already loaded – ready after ${Math.round(performance.now() - begun)} ms`);
      return;
    }

    let waiter: () => void = () => {};
    const scanning = new Promise<void>(resolve => {
      const timer = window.setTimeout(() => {
        console.warn("[8th Wall] Targets still loading – tracking starts anyway");
        resolve();
      }, TARGETS_LOAD_TIMEOUT_MS);
      waiter = () => { window.clearTimeout(timer); resolve(); };
    });
    this.scanningWaiter = waiter;
    const configured = performance.now();
    await scanning;
    console.info(`[8th Wall] ${data.length} targets: prepared in ${Math.round(configured - begun)} ms, engine ready after ${Math.round(performance.now() - configured)} ms`);
    if (this.scanningWaiter === waiter) this.scanningWaiter = null;
  }

  prepareTargets(spreads: readonly TrackedSpread[]): void {
    const run = ++this.prepareRun;
    const prepare = (spread: TrackedSpread): Promise<SpreadTargets> =>
      Promise.all(spread.targets.filter(target => target.imageSrc).map(target => this.imageTarget(target.imageSrc)))
        .then(targets => ({ spreadId: spread.spreadId, targets }));
    void Promise.all(spreads.map(prepare)).then(
      upcoming => {
        if (run !== this.prepareRun || !this.started) return; // newer neighbours or the camera is off
        this.upcoming = upcoming;
        this.configureEngine();
        console.info(`[8th Wall] Next spreads loaded: ${upcoming.map(spread => `${spread.spreadId} (${spread.targets.length})`).join(", ")}`);
      },
      error => console.warn("[8th Wall] Could not prepare the next spreads' targets:", error),
    );
  }

  /**
   * The engine's targets = current + upcoming. It unloads what is no longer listed, keeps the rest and
   * extracts the new ones (each new configure restarts that queue).
   */
  private configureEngine(): void {
    const XR8 = this.XR8;
    if (!XR8 || !this.started) return;
    const spreads = this.current ? [this.current, ...this.upcoming] : this.upcoming;
    const byName = new Map(spreads.flatMap(spread => spread.targets).map(target => [target.data.name, target.data]));
    this.spreadOf = new Map(this.upcoming.flatMap(spread => spread.targets.map(target => [target.data.name, spread.spreadId])));
    this.ready.forEach(name => { if (!byName.has(name)) this.ready.delete(name); });
    XR8.XrController!.configure({ imageTargetData: [...byName.values()] });
  }

  pause(): void {
    if (!this.XR8 || !this.started || this.paused) return;
    this.XR8.pause();
    this.paused = true;
    this.poses.clear();
  }

  resume(): void {
    if (!this.XR8 || !this.paused) return;
    this.XR8.resume();
    this.paused = false;
  }

  stopTracking(): void {
    this.loadRun++;
    this.targets.clear();
    this.poses.clear();
    this.scanningWaiter?.();
    this.scanningWaiter = null;
    this.seenSince.clear();
    // The engine keeps its targets (a switch back or to a neighbour needs no new extraction)
  }

  stop(): void {
    this.stopTracking();
    const XR8 = this.XR8;
    if (XR8 && this.canvas) {
      try {
        XR8.stop();
        XR8.clearCameraPipelineModules();
      } catch (error) {
        console.warn("[8th Wall] Stopping the engine failed:", error);
      }
    }
    this.canvas?.remove();
    this.canvas = null;
    this.current = null;
    this.upcoming = [];
    this.spreadOf.clear();
    this.ready.clear();
    this.prepareRun++;
    this.started = false;
    this.paused = false;
    this.intrinsics = null;
  }

  fit(camera: PerspectiveCamera): void {
    this.camera = camera;
    this.sizeCanvas();
    this.applyProjection();
  }

  /** Target data per image, made once per session (the object URLs stay valid) */
  private imageTarget(imageSrc: string): Promise<PreparedImageTarget> {
    let data = this.imageTargets.get(imageSrc);
    if (!data) {
      data = makeImageTarget(imageSrc);
      data.catch(() => this.imageTargets.delete(imageSrc));
      this.imageTargets.set(imageSrc, data);
    }
    return data;
  }

  /** The engine draws the camera picture at the canvas' pixel size (cover); intrinsics follow its aspect */
  private sizeCanvas(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.container.clientWidth * ratio);
    const height = Math.round(this.container.clientHeight * ratio);
    if (!width || !height || (canvas.width === width && canvas.height === height)) return;
    canvas.width = width;
    canvas.height = height;
  }

  /**
   * The engine's projection on the three.js camera, as fov / aspect / near / far – `ArView.resize()` calls
   * `updateProjectionMatrix()` after `fit()`, so a matrix set directly would be overwritten. The engine's
   * principal point is the centre (no offset to carry over).
   */
  private applyProjection(): void {
    const { camera, intrinsics: m } = this;
    if (!camera || !m || !m[0] || !m[5]) return;
    camera.fov = (2 * Math.atan(1 / m[5]) * 180) / Math.PI;
    camera.aspect = m[5] / m[0];
    const near = m[14] / (m[10] - 1);
    const far = m[14] / (m[10] + 1);
    camera.near = Number.isFinite(near) && near > 0 ? near : NEAR;
    camera.far = Number.isFinite(far) && far > camera.near ? far : FAR;
    camera.updateProjectionMatrix();
  }

  private setProjectionSize(width: number, height: number): void {
    this.XR8?.XrController?.updateCameraProjectionMatrix({
      cam: { pixelRectWidth: width, pixelRectHeight: height, nearClipPlane: NEAR, farClipPlane: FAR },
    });
  }

  /** Every frame: anchors of the found targets relative to the camera of that frame */
  private onFrame(reality: XrReality): void {
    const m = reality.intrinsics;
    if (m && m.every(Number.isFinite) && (!this.intrinsics || m.some((v, i) => v !== this.intrinsics![i]))) {
      this.intrinsics = [...m];
      this.applyProjection();
    }
    this.poses.forEach(({ detail, target }, index) =>
      this.options.onUpdate(index, anchorMatrix(reality, detail, target.widthFactor)));
  }

  private onImage(detail: XrImageDetail, found: boolean): void {
    if (this.paused) return;
    const target = this.targets.get(detail.name);
    if (!target) return this.onUpcomingImage(detail.name, found);
    if (found) {
      this.poses.set(target.index, { detail, target });
      return;
    }
    if (this.poses.delete(target.index)) this.options.onUpdate(target.index, null);
  }

  /**
   * An upcoming spread's target: held in view (and nothing of the current spread) → report its spread; held on
   * (the app did not switch, e.g. not in scan mode), it is reported again after the same time
   */
  private onUpcomingImage(name: string, found: boolean): void {
    const spreadId = this.spreadOf.get(name);
    if (!spreadId) return;
    if (!found) {
      this.seenSince.delete(name);
      return;
    }
    const now = performance.now();
    const since = this.seenSince.get(name);
    if (since === undefined) {
      this.seenSince.set(name, now);
      console.info(`[8th Wall] Target of ${spreadId} in view (current spread: ${this.poses.size} found)`);
      return;
    }
    if (now - since < SPREAD_SEEN_MS || this.poses.size > 0) return;
    this.seenSince.set(name, now);
    console.info(`[8th Wall] ${spreadId} held in view – switching`);
    this.options.onSpreadSeen?.(spreadId);
  }

  private module(): XrPipelineModule {
    return {
      name: "osct-image-tracker",
      onStart: ({ canvasWidth, canvasHeight }) => {
        this.setProjectionSize(canvasWidth, canvasHeight);
        this.startWaiter?.resolve();
      },
      onCanvasSizeChange: ({ canvasWidth, canvasHeight }) => this.setProjectionSize(canvasWidth, canvasHeight),
      onCameraStatusChange: ({ status, reason }) => {
        if (status === "failed") this.startWaiter?.reject(new Error(`Camera unavailable: ${reason ?? "failed"}`));
      },
      onException: error => {
        console.error("[8th Wall]", error);
        this.startWaiter?.reject(error instanceof Error ? error : new Error(String(error)));
      },
      onUpdate: ({ processCpuResult }) => {
        if (processCpuResult.reality) this.onFrame(processCpuResult.reality);
      },
      listeners: [
        {
          event: "reality.imagescanning",
          process: ({ detail }) => {
            (detail?.imageTargets ?? []).forEach((target: { name: string }) => this.ready.add(target.name));
            this.scanningWaiter?.();
          },
        },
        { event: "reality.imagefound", process: ({ detail }) => this.onImage(detail, true) },
        { event: "reality.imageupdated", process: ({ detail }) => this.onImage(detail, true) },
        { event: "reality.imagelost", process: ({ detail }) => this.onImage(detail, false) },
      ],
    };
  }
}
