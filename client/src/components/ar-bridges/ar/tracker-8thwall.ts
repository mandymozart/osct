import { PerspectiveCamera } from "three";
import { CAMERA_NOT_RESPONDING } from "@/types";
import { CAMERA_START_TIMEOUT_MS, IImageTracker, ImageTrackerOptions, TrackedSpread } from "./tracker-types";
import {
  anchorMatrix,
  fullWidthFactor,
  loadXr8,
  makeImageTarget,
  XR8Api,
  XrImageDetail,
  XrImageTargetData,
  XrPipelineModule,
  XrReality,
} from "./xr8";

/** Loading the targets into the engine may take this long before tracking starts anyway */
const TARGETS_LOAD_TIMEOUT_MS = 15000;
const NEAR = 0.01;
const FAR = 1000;

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
  private imageTargets = new Map<string, Promise<XrImageTargetData>>();
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

  async loadTargets({ targets }: TrackedSpread): Promise<void> {
    const XR8 = this.XR8;
    if (!XR8 || !this.started) throw new Error("loadTargets() needs the camera");
    this.stopTracking();
    const run = this.loadRun;

    const withImage = targets.filter(target => target.imageSrc);
    const data = await Promise.all(withImage.map(target => this.imageTarget(target.imageSrc)));
    if (run !== this.loadRun) return; // replaced or stopped meanwhile
    this.targets = new Map(data.map((target, i) => [
      target.name,
      { index: withImage[i].index, widthFactor: fullWidthFactor(target.properties) },
    ]));
    if (!data.length) return;

    let waiter: () => void = () => {};
    const scanning = new Promise<void>(resolve => {
      const timer = window.setTimeout(() => {
        console.warn("[8th Wall] Targets still loading – tracking starts anyway");
        resolve();
      }, TARGETS_LOAD_TIMEOUT_MS);
      waiter = () => { window.clearTimeout(timer); resolve(); };
    });
    this.scanningWaiter = waiter;
    XR8.XrController!.configure({ imageTargetData: data });
    await scanning;
    if (this.scanningWaiter === waiter) this.scanningWaiter = null;
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
    if (this.XR8 && this.started) this.XR8.XrController!.configure({ imageTargetData: [] });
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
  private imageTarget(imageSrc: string): Promise<XrImageTargetData> {
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
    const target = this.targets.get(detail.name);
    if (!target || this.paused) return;
    if (found) {
      this.poses.set(target.index, { detail, target });
      return;
    }
    if (this.poses.delete(target.index)) this.options.onUpdate(target.index, null);
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
        { event: "reality.imagescanning", process: () => this.scanningWaiter?.() },
        { event: "reality.imagefound", process: ({ detail }) => this.onImage(detail, true) },
        { event: "reality.imageupdated", process: ({ detail }) => this.onImage(detail, true) },
        { event: "reality.imagelost", process: ({ detail }) => this.onImage(detail, false) },
      ],
    };
  }
}
