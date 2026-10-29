import { Matrix4, PerspectiveCamera, Quaternion, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { DEFAULT_ENVIRONMENT, EnvironmentData } from "@shared/types/environment";
import { GraphicsSettings, GraphicsSource, NO_GRAPHICS } from "../../types/index";
import { BookAnchor, yawTowards } from "./book-anchor";
import { EnvironmentAssets, EnvironmentLoaders } from "./environment-assets";
import { DeviceOrientation } from "./orientation";
import { lookAroundMaterial } from "./shader";
import { SkySample } from "./sky-sample";

const DEG = Math.PI / 180;
/** Seconds the world takes to fade out (book forgotten, option turned off) */
const FADE_OUT = 3;

/**
 * What is drawn: the book's environment (content schema 2.8) says which world and whether the onion sky, the reader's
 * Graphics switches apply on top – either can turn a part off, neither turns on what the book leaves out. The café is
 * the only built-in world (a world model or sky image of 2.9 is drawn over it), so `surroundings` follows the world; a
 * new built-in world adds its own check here. Pure, for the tests.
 */
export const effectiveGraphics = (reader: GraphicsSettings, environment: EnvironmentData): GraphicsSettings => ({
  onionSky: reader.onionSky && environment.onionSky,
  surroundings: reader.surroundings && environment.world === "cafe",
});

/** Tuning – the running instance's copy is `window.osctLookAround` (try values on the phone over USB debugging) */
export interface LookAroundSettings {
  /** How much the world covers the camera picture outside the book's window (1 = fully) */
  worldOpacity: number;
  /** How strongly sky-like camera pixels turn into the world's sky when looking up */
  skyStrength: number;
  /** Seconds without a page before the world fades away (the gyroscope drifts; the book anchors the world) */
  forgetAfter: number;
  /** Seconds the world takes to appear */
  fadeIn: number;
  /** The window around the book: degrees around the tracked page, and the soft edge */
  windowMargin: number;
  windowSoftness: number;
  /** Looking down, the world is fully clear this many degrees below the horizon, fully there `floorSoftness` above */
  floorClear: number;
  floorSoftness: number;
}

/**
 * The editor's preview of the environment (`IArScene.previewEnvironment`): the world is drawn whatever the reader's
 * switches say (the onion sky needs a camera picture – not in the preview), turned by `orientation` – the camera's
 * orientation in the world (y up) – instead of the gyroscope
 */
export interface LookAroundPreview {
  orientation: () => Quaternion;
}

export const DEFAULT_LOOK_AROUND: LookAroundSettings = {
  worldOpacity: 0.92,
  skyStrength: 1,
  forgetAfter: 45,
  fadeIn: 1.4,
  windowMargin: 16,
  windowSoftness: 18,
  floorClear: 40,
  floorSoftness: 15,
};

/**
 * The scan view's surroundings, drawn under the AR scene (`ArView.underlay`) in one full-screen pass (`shader.ts`):
 * - **Scene around the book**: a world around the reader, anchored to the book (`BookAnchor`) and turned by the
 *   gyroscope (`DeviceOrientation`, 3DoF – walking does not move through it). The book and the table stay visible.
 * - **Onion sky**: looking up, sky-like parts of the camera picture (`SkySample`) show the world's sky.
 * Both are reader options (the app's `GraphicsSource` – the reader's `GraphicsService`, Info page); with both off
 * nothing is drawn and the gyroscope is not read. See docs/look-around.md.
 */
export class LookAround {
  readonly settings: LookAroundSettings = { ...DEFAULT_LOOK_AROUND };
  /** The reader's switches, and what is drawn of them (`effectiveGraphics`, the book's environment applied) */
  private reader: GraphicsSettings;
  private options: GraphicsSettings;
  private preview: LookAroundPreview | null = null;
  /** The environment's sky image and world model (content schema 2.9), loaded while something is drawn */
  private assets: EnvironmentAssets;
  private unsubscribe: () => void;
  private orientation = new DeviceOrientation();
  private book = new BookAnchor();
  private sky: SkySample;
  /** The view's projection and the phone's orientation – nothing is rendered with it */
  private camera = new PerspectiveCamera();
  private material: ShaderMaterial = lookAroundMaterial();
  private quad = new FullScreenQuad(this.material);
  private size = new Vector2();
  private forward = new Vector3();

  private running = false;
  private time = 0;
  /** 0…1: how present the world is */
  private presence = 0;
  /** Some of the view is above the horizon (only there the sky can be keyed) */
  private skyInView = false;

  constructor(
    private renderer: WebGLRenderer,
    cameraVideo: () => HTMLVideoElement | null,
    graphics: GraphicsSource = NO_GRAPHICS,
    private environment: EnvironmentData = DEFAULT_ENVIRONMENT,
    loaders?: EnvironmentLoaders,
  ) {
    this.sky = new SkySample(cameraVideo);
    this.assets = new EnvironmentAssets(renderer, loaders);
    this.assets.onChange = () => this.applyAssets();
    this.reader = graphics.getSettings();
    this.options = this.drawn();
    this.unsubscribe = graphics.subscribe(reader => {
      this.reader = reader;
      this.options = this.drawn();
      this.followOptions();
    });
  }

  /** The book's environment changed (the editor saved, or edits it live): what is drawn and its assets follow */
  setEnvironment(environment: EnvironmentData): void {
    this.environment = environment;
    this.options = this.drawn();
    this.followOptions();
  }

  /** The editor's preview on (the world drawn, turned by its orientation) or off (`null`: the reader's switches again) */
  setPreview(preview: LookAroundPreview | null): void {
    // The preview ends at once (the editor's studio returns), it does not fade
    if (this.preview && !preview) this.presence = 0;
    this.preview = preview;
    this.options = this.drawn();
    this.followOptions();
  }

  /** Something to draw this frame */
  get active(): boolean {
    return this.running && (this.presence > 0.002 || (this.options.onionSky && this.skyInView));
  }

  /** Scan mode runs */
  start(): void {
    this.running = true;
    this.followOptions();
    this.exposeForTuning();
  }

  /** Scan paused or stopped: the world goes at once; the book's direction is kept for a quick return */
  pause(): void {
    this.running = false;
    this.presence = 0;
    this.orientation.stop();
  }

  /** Every frame: the found pages' anchors (relative to the camera) place the book; `delta` in seconds */
  update(delta: number, viewCamera: PerspectiveCamera, anchors: readonly Matrix4[]): void {
    if (!this.running) return;
    if (!this.anyOption()) {
      // Both turned off while scanning: the world fades out as when the book is forgotten, nothing else is read
      this.presence = Math.max(0, this.presence - delta / FADE_OUT);
      this.skyInView = false;
      return;
    }
    this.time += delta;
    const orientation = this.preview?.orientation() ?? this.orientation.quaternion;
    if (anchors.length) this.book.see(anchors, orientation, this.settings.windowMargin, this.settings.windowSoftness);
    else this.book.unseen(delta);

    const known = this.book.direction !== null && this.book.sinceSeen < this.settings.forgetAfter;
    const wanted = known && this.options.surroundings ? 1 : 0;
    const step = delta / (wanted > this.presence ? Math.max(0.05, this.settings.fadeIn) : FADE_OUT);
    this.presence = wanted > this.presence ? Math.min(wanted, this.presence + step) : Math.max(wanted, this.presence - step);
    if (!known && this.presence === 0) this.book.forget();

    this.camera.fov = viewCamera.fov;
    this.camera.aspect = viewCamera.aspect;
    this.camera.updateProjectionMatrix();
    this.camera.quaternion.copy(orientation);
    this.camera.updateMatrixWorld();
    const pitch = Math.asin(Math.min(1, Math.max(-1, this.forward.set(0, 0, -1).applyQuaternion(orientation).y)));
    this.skyInView = pitch + (this.camera.fov / 2) * 1.3 * DEG > 2 * DEG; // 1.3: the diagonal reaches higher
  }

  /** Draw into the cleared screen, before the AR scene */
  render(): void {
    if (!this.active) return;
    const size = this.renderer.getDrawingBufferSize(this.size);
    const camera = this.options.onionSky && this.skyInView ? this.sky.update(size.x / size.y) : null;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uYaw.value = this.book.yaw;
    u.tCamera.value = camera;
    u.uCover.value.copy(this.sky.cover);
    u.uTexel.value.copy(this.sky.texel);
    u.uSky.value = camera ? this.settings.skyStrength : 0;
    u.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    u.uRotation.value.setFromMatrix4(this.camera.matrixWorld);
    if (this.book.direction) u.uBook.value.copy(this.book.direction);
    u.uWindow.value.set(this.book.window.inner * DEG, this.book.window.outer * DEG);
    u.uFloor.value.set(-this.settings.floorClear * DEG, (this.settings.floorSoftness - this.settings.floorClear) * DEG);
    u.uPresence.value = this.book.direction ? this.presence : 0;
    u.uOpacity.value = this.settings.worldOpacity;
    this.quad.render(this.renderer);
  }

  dispose(): void {
    this.pause();
    this.unsubscribe();
    this.assets.dispose();
    this.sky.dispose();
    this.material.dispose();
    this.quad.dispose();
  }

  private anyOption(): boolean {
    return this.options.onionSky || this.options.surroundings;
  }

  /** The reader's switches on the book's environment – in the editor's preview the world whatever they say */
  private drawn(): GraphicsSettings {
    return this.preview ? { onionSky: false, surroundings: true } : effectiveGraphics(this.reader, this.environment);
  }

  /**
   * The gyroscope (and on iOS its permission prompt) only while an option is on and scan mode runs – the preview turns
   * the world by its own orientation. The environment's assets load once something is drawn (never for a reader with
   * both switches off) and follow the environment from then on.
   */
  private followOptions(): void {
    if (this.running && this.anyOption() && !this.preview) this.orientation.listen();
    else this.orientation.stop();
    if (this.running && this.anyOption()) void this.assets.set(this.environment);
  }

  private applyAssets(): void {
    const u = this.material.uniforms;
    u.tSky.value = this.assets.sky;
    u.uSkyImage.value = this.assets.sky ? 1 : 0;
    u.tWorld.value = this.assets.world;
    u.uWorldModel.value = this.assets.world ? 1 : 0;
  }

  /** `window.osctLookAround` = the settings; dev builds also get `osctLookAroundDebug` (desktop: fake book / tilt) */
  private exposeForTuning(): void {
    const handle = window as unknown as { osctLookAround?: LookAroundSettings; osctLookAroundDebug?: object };
    handle.osctLookAround = this.settings;
    if (!import.meta.env.DEV) return;
    handle.osctLookAroundDebug = {
      seeBook: (x = 0, y = -0.6, z = -1) => {
        this.book.direction = new Vector3(x, y, z).normalize();
        this.book.yaw = yawTowards(this.book.direction);
        this.book.sinceSeen = 0;
      },
      look: (alpha = 0, beta = 90, gamma = 0) => this.orientation.set(alpha, beta, gamma),
    };
  }
}
