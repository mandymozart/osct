import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { Controller } from "@/vendor/mind-ar/mindar-image.prod.js";

/**
 * Camera + MindAR image tracking, without a renderer. A port of MindAR 1.2.5's `MindARThree`
 * (`src/image-target/three.js`: `_startVideo`, `_startAR`, `resize`) on top of its `Controller`, split
 * so the camera stream survives a spread switch: `loadTargets()` replaces only the controller.
 *
 * `onUpdate(targetIndex, matrix)`: the anchor matrix of a target (world matrix × MindAR's post matrix:
 * 1 unit = target width, origin in the target's centre), null when the target is lost – MindAR's own
 * warm-up / miss tolerance decides that.
 */
export class ImageTracker {
  private video: HTMLVideoElement | null = null;
  private controller: Controller | null = null;
  private postMatrices: Matrix4[] = [];

  constructor(
    private container: HTMLElement,
    private options: {
      maxTrack: number;
      onUpdate: (targetIndex: number, matrix: Matrix4 | null) => void;
    },
  ) {}

  get hasCamera(): boolean {
    return !!this.video;
  }

  get tracking(): boolean {
    return !!this.controller;
  }

  /** Request the back camera; resolves once the stream's size is known. Throws when it is unavailable. */
  async startCamera(): Promise<void> {
    if (this.video) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported (no getUserMedia)");
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.className = "ar-camera";
    Object.assign(video.style, { position: "absolute", top: "0px", left: "0px", zIndex: "-2" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } });
    } catch (error) {
      throw new Error(`Camera unavailable: ${(error as Error)?.name ?? error}`);
    }
    this.container.appendChild(video);
    this.video = video;
    await new Promise<void>(resolve => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.srcObject = stream;
    });
    video.setAttribute("width", String(video.videoWidth));
    video.setAttribute("height", String(video.videoHeight));
    await video.play().catch(() => {}); // autoplay (muted, inline) normally runs by itself
  }

  /** Track the targets of a `.mind` file on the running camera (replaces the previous targets) */
  async loadTargets(mindSrc: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error("loadTargets() needs the camera");
    this.stopTracking();

    const controller = new Controller({
      inputWidth: video.videoWidth,
      inputHeight: video.videoHeight,
      maxTrack: this.options.maxTrack,
      onUpdate: data => {
        if (data.type !== "updateMatrix" || this.controller !== controller) return;
        const post = this.postMatrices[data.targetIndex];
        if (!data.worldMatrix || !post) {
          this.options.onUpdate(data.targetIndex, null);
          return;
        }
        const matrix = new Matrix4().fromArray(data.worldMatrix);
        this.options.onUpdate(data.targetIndex, matrix.multiply(post));
      },
    });
    this.controller = controller;

    try {
      const { dimensions } = await controller.addImageTargets(mindSrc);
      if (this.controller !== controller) return; // replaced or stopped meanwhile
      this.postMatrices = dimensions.map(([width, height]) =>
        new Matrix4().compose(
          new Vector3(width / 2, width / 2 + (height - width) / 2, 0),
          new Quaternion(),
          new Vector3(width, width, width),
        ),
      );
      await controller.dummyRun(video);
      if (this.controller !== controller) return;
      controller.processVideo(video);
    } catch (error) {
      if (this.controller === controller) this.stopTracking();
      throw error;
    }
  }

  /** Tracking and the camera video pause, the stream stays (instant resume, frozen frame) */
  pause(): void {
    this.controller?.stopProcessVideo();
    this.video?.pause();
  }

  resume(): void {
    if (!this.video) return;
    void this.video.play().catch(() => {});
    this.controller?.processVideo(this.video);
  }

  stopTracking(): void {
    const controller = this.controller;
    this.controller = null;
    this.postMatrices = [];
    if (!controller) return;
    try {
      controller.dispose();
    } catch (error) {
      console.warn("[ImageTracker] Disposing the controller failed:", error);
    }
  }

  /** Release the camera (and the tracking) */
  stop(): void {
    this.stopTracking();
    const video = this.video;
    this.video = null;
    if (!video) return;
    (video.srcObject as MediaStream | null)?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.remove();
  }

  /**
   * Fit the camera video to the container (cover) and give the three.js camera the field of view that
   * matches it – MindAR's `resize()`. Needs a loaded controller (its projection).
   */
  fit(camera: PerspectiveCamera): void {
    const { video, controller, container } = this;
    if (!video || !controller || !video.videoWidth) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = width / height;
    const vw = videoRatio > containerRatio ? height * videoRatio : width;
    const vh = videoRatio > containerRatio ? height : width / videoRatio;

    // Rotated phone: the video's width and height are swapped against the controller's input
    const proj = controller.getProjectionMatrix();
    const inputRatio = controller.inputWidth / controller.inputHeight;
    const inputAdjust = inputRatio > containerRatio
      ? video.videoWidth / controller.inputWidth
      : video.videoHeight / controller.inputHeight;
    const videoDisplayHeight = (inputRatio > containerRatio
      ? height
      : (width / controller.inputWidth) * controller.inputHeight) * inputAdjust;
    const fovAdjust = height / videoDisplayHeight;

    camera.fov = (2 * Math.atan((1 / proj[5]) * fovAdjust) * 180) / Math.PI;
    camera.near = proj[14] / (proj[10] - 1.0);
    camera.far = proj[14] / (proj[10] + 1.0);
    camera.aspect = containerRatio;
    camera.updateProjectionMatrix();

    Object.assign(video.style, {
      top: `${-(vh - height) / 2}px`,
      left: `${-(vw - width) / 2}px`,
      width: `${vw}px`,
      height: `${vh}px`,
    });
  }
}
