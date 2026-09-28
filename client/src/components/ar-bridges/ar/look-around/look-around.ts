import {
  Matrix3,
  Matrix4,
  NoBlending,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  VideoTexture,
  WebGLRenderer,
} from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { GraphicsService } from "@/services";
import { DeviceOrientation } from "./orientation";

const DEG = Math.PI / 180;

/** Tuning – exposed on `window.osctLookAround` in the browser for trying values on the phone */
export interface LookAroundSettings {
  /** How much the world covers the camera picture outside the book's window (1 = fully) */
  worldOpacity: number;
  /** How strongly sky-coloured camera pixels turn into the alien sky when looking up (0 = off) */
  skyStrength: number;
  /** Seconds without a page before the world fades away (the gyroscope drifts; the book anchors the world) */
  forgetAfter: number;
  /** Seconds the world takes to appear */
  fadeIn: number;
  /** The window around the book: extra degrees around the tracked page, and the soft edge */
  windowMargin: number;
  windowSoftness: number;
  /**
   * Looking down, the world clears for the real table and book: fully clear this many degrees below the horizon,
   * fully there `floorSoftness` degrees above that
   */
  floorClear: number;
  floorSoftness: number;
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

/** Turn about y that brings the front (−z) to face a direction (its horizontal part) */
export const yawTowards = (direction: Vector3): number => Math.atan2(-direction.x, -direction.z);

/** Shortest step from angle `from` to `to`, by `amount` (0…1) */
export const lerpAngle = (from: number, to: number, amount: number): number => {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
};

/**
 * The book's window in degrees: the page's angular radius (its width `size` seen from `distance`, the page being
 * a bit larger than one target) plus a margin; the soft edge ends `softness` degrees further out.
 */
export const windowRadii = (size: number, distance: number, margin: number, softness: number): { inner: number; outer: number } => {
  const page = distance > 0 ? Math.atan((size * 0.9) / distance) / DEG : 20;
  const inner = Math.min(45, Math.max(14, page + margin));
  return { inner, outer: inner + softness };
};

/**
 * Draws a world around the reader over the camera picture (3DoF) and keys the sky:
 * - The world is anchored to the book: while a page is tracked, its direction in the world (from the gyroscope's
 *   orientation) sets where the world's front is and where the book's window is; each new find corrects the
 *   gyroscope's drift. Turning the phone turns the view through the world; the book and the table stay visible
 *   (a soft window around the book, clear below the horizon), and the world is open above.
 * - Looking up, sky-like camera pixels (blue or bright grey, smooth) show the world's sky instead.
 * One full-screen pass under the AR scene (`ArView.underlay`): the world's colour is computed from each pixel's
 * view direction (`worldColour` - a placeholder until the content brings the real world), alpha per pixel over
 * the camera canvas. No scene, no render target. No position tracking: walking does not move through it.
 */
export class LookAround {
  readonly settings: LookAroundSettings = { ...DEFAULT_LOOK_AROUND };
  private orientation = new DeviceOrientation();
  /** The reader's graphics options (Info page): onion sky, scene around the book */
  private graphics = GraphicsService.getInstance();
  /** Only the view's projection and orientation - nothing is rendered with it */
  private camera = new PerspectiveCamera(60, 1, 0.1, 400);
  private material: ShaderMaterial;
  private quad: FullScreenQuad;
  private video: VideoTexture | null = null;
  private videoElement: HTMLVideoElement | null = null;

  private time = 0;
  /** 0…1: how present the world is */
  private presence = 0;
  /** The book's direction in the world, while known */
  private bookDirection: Vector3 | null = null;
  private sinceSeen = Infinity;
  private yaw = 0;
  private window = { inner: 20, outer: 36 };
  private running = false;
  /** Some of the view is above the horizon (the sky could be keyed there) */
  private skyInView = false;

  constructor(private renderer: WebGLRenderer, private cameraVideo: () => HTMLVideoElement | null) {
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uYaw: { value: 0 },
        tCamera: { value: null },
        uHasCamera: { value: 0 },
        uCover: { value: new Vector2(1, 1) },
        uInverseProjection: { value: new Matrix4() },
        uRotation: { value: new Matrix3() },
        uBook: { value: new Vector3(0, -1, 0) },
        uWindow: { value: new Vector2(0.3, 0.6) },
        uPresence: { value: 0 },
        uOpacity: { value: 1 },
        uSky: { value: 1 },
        uFloor: { value: new Vector2(-0.7, -0.44) },
        uTexel: { value: new Vector2(0.004, 0.004) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uYaw;
        uniform sampler2D tCamera;
        uniform float uHasCamera;
        uniform vec2 uCover;
        uniform mat4 uInverseProjection;
        uniform mat3 uRotation;
        uniform vec3 uBook;
        uniform vec2 uWindow;
        uniform float uPresence;
        uniform float uOpacity;
        uniform float uSky;
        uniform vec2 uFloor;
        uniform vec2 uTexel;
        varying vec2 vUv;

        // Sky-likeness of a camera pixel (raw sRGB): clear blue, or bright and grey (overcast)
        float skyColour(vec3 c) {
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float hi = max(c.r, max(c.g, c.b));
          float lo = min(c.r, min(c.g, c.b));
          float saturation = (hi - lo) / (hi + 0.001);
          float blue = smoothstep(0.03, 0.14, c.b - c.r) * smoothstep(0.28, 0.5, lum) * (1.0 - smoothstep(0.02, 0.12, c.g - c.b));
          float grey = smoothstep(0.6, 0.8, lum) * (1.0 - smoothstep(0.1, 0.24, saturation));
          return max(blue, grey);
        }

        float skyMask(vec2 uv) {
          // The camera picture covers the screen (cropped like the engine draws it); five taps in a cross
          vec2 cam = (uv - 0.5) * uCover + 0.5;
          vec2 d = uTexel * 4.0;
          vec3 c0 = texture2D(tCamera, cam).rgb;
          vec3 c1 = texture2D(tCamera, cam + vec2(d.x, 0.0)).rgb;
          vec3 c2 = texture2D(tCamera, cam - vec2(d.x, 0.0)).rgb;
          vec3 c3 = texture2D(tCamera, cam + vec2(0.0, d.y)).rgb;
          vec3 c4 = texture2D(tCamera, cam - vec2(0.0, d.y)).rgb;
          float score = (skyColour(c0) + skyColour(c1) + skyColour(c2) + skyColour(c3) + skyColour(c4)) / 5.0;
          vec3 w = vec3(0.299, 0.587, 0.114);
          float l0 = dot(c0, w);
          float edge = abs(dot(c1, w) - l0) + abs(dot(c2, w) - l0) + abs(dot(c3, w) - l0) + abs(dot(c4, w) - l0);
          // Sky is smooth: leaves, edges and texture are not
          return score * (1.0 - smoothstep(0.06, 0.2, edge));
        }

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        // Placeholder world (the content brings the real one): sky gradient, stars, one moon, a dark ground
        vec3 worldColour(vec3 dir) {
          float h = dir.y;
          vec3 colour = mix(vec3(0.95, 0.45, 0.4), vec3(0.35, 0.08, 0.45), smoothstep(0.0, 0.3, h));
          colour = mix(colour, vec3(0.08, 0.02, 0.2), smoothstep(0.3, 0.9, h));
          vec2 cell = floor(vec2(atan(dir.x, dir.z), h) * 120.0);
          colour += step(0.996, hash(cell)) * smoothstep(0.15, 0.5, h) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(cell) * 50.0));
          float moon = smoothstep(0.075, 0.07, acos(clamp(dot(dir, normalize(vec3(0.45, 0.5, -0.75))), -1.0, 1.0)));
          colour = mix(colour, vec3(0.8, 0.95, 1.0), moon);
          vec3 ground = mix(vec3(0.1, 0.03, 0.14), vec3(0.3, 0.1, 0.3), smoothstep(-0.3, 0.0, h));
          return mix(ground, colour, smoothstep(-0.01, 0.01, h));
        }

        void main() {
          vec4 point = uInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 ray = normalize(uRotation * (point.xyz / point.w));
          float elevation = asin(clamp(ray.y, -1.0, 1.0));

          float angle = acos(clamp(dot(ray, uBook), -1.0, 1.0));
          float outside = smoothstep(uWindow.x, uWindow.y, angle);
          float roof = 1.0 - smoothstep(0.35, 0.8, elevation);
          float floorClear = smoothstep(uFloor.x, uFloor.y, elevation);
          float world = uPresence * uOpacity * outside * roof * floorClear;

          float sky = 0.0;
          if (uHasCamera > 0.5 && uSky > 0.0) sky = uSky * smoothstep(0.03, 0.3, elevation) * skyMask(vUv);

          float alpha = max(world, sky);
          if (alpha < 0.002) { gl_FragColor = vec4(0.0); return; }
          float yc = cos(uYaw);
          float ys = sin(uYaw);
          vec3 local = vec3(yc * ray.x - ys * ray.z, ray.y, ys * ray.x + yc * ray.z);
          gl_FragColor = vec4(worldColour(local), 1.0);
          #include <colorspace_fragment>
          gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
        }
      `,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Something to draw: the world is (partly) there, or the sky may be keyed */
  get active(): boolean {
    return this.running && (this.presence > 0.002 || (this.skyStrength() > 0 && this.skyInView));
  }

  start(): void {
    this.running = true;
    this.orientation.listen();
    this.exposeForTuning();
  }

  /** The running instance's settings on `window.osctLookAround` (tuning on the phone); dev: a debug handle */
  private exposeForTuning(): void {
    const handle = window as unknown as { osctLookAround?: LookAroundSettings; osctLookAroundDebug?: object };
    handle.osctLookAround = this.settings;
    // Dev only: pretend a page was seen in a direction (desktop browsers have no camera pages or gyroscope)
    if (import.meta.env.DEV) handle.osctLookAroundDebug = {
      seeBook: (x = 0, y = -0.6, z = -1) => {
        this.bookDirection = new Vector3(x, y, z).normalize();
        this.yaw = yawTowards(this.bookDirection);
        this.sinceSeen = 0;
      },
      look: (alpha = 0, beta = 90, gamma = 0) => this.orientation.set(alpha, beta, gamma),
    };
  }

  /** Scan paused or stopped: the world goes, the book's direction is kept for a quick return */
  pause(): void {
    this.running = false;
    this.presence = 0;
  }

  /** Every frame: the found pages' anchors (relative to the camera) place the book; `delta` in seconds */
  update(delta: number, viewCamera: PerspectiveCamera, anchors: readonly Matrix4[]): void {
    if (!this.running) return;
    this.time += delta;
    const orientation = this.orientation.quaternion;

    if (anchors.length) this.seeBook(anchors, orientation);
    else this.sinceSeen += delta;

    const known = this.bookDirection !== null && this.sinceSeen < this.settings.forgetAfter;
    const wanted = known && this.graphics.getSettings().surroundings ? 1 : 0;
    const rate = delta / Math.max(0.05, wanted > this.presence ? this.settings.fadeIn : 3);
    this.presence = wanted > this.presence ? Math.min(wanted, this.presence + rate) : Math.max(wanted, this.presence - rate);
    if (!known && this.presence === 0) this.bookDirection = null;

    this.camera.fov = viewCamera.fov;
    this.camera.aspect = viewCamera.aspect;
    this.camera.updateProjectionMatrix();
    this.camera.quaternion.copy(orientation);
    this.camera.updateMatrixWorld();
    const pitch = Math.asin(Math.max(-1, Math.min(1, new Vector3(0, 0, -1).applyQuaternion(orientation).y)));
    this.skyInView = pitch + (this.camera.fov / 2) * DEG * 1.3 > 2 * DEG;
  }

  private seeBook(anchors: readonly Matrix4[], orientation: Quaternion): void {
    const centre = new Vector3();
    let size = 0;
    anchors.forEach(matrix => {
      centre.add(new Vector3().setFromMatrixPosition(matrix));
      size = Math.max(size, new Vector3().setFromMatrixScale(matrix).x);
    });
    centre.divideScalar(anchors.length);
    const distance = centre.length();
    const direction = centre.normalize().applyQuaternion(orientation);
    const first = this.bookDirection === null;
    if (first) this.bookDirection = direction.clone();
    else this.bookDirection!.lerp(direction, 0.2).normalize();
    const flat = new Vector3(this.bookDirection!.x, 0, this.bookDirection!.z);
    if (flat.lengthSq() > 1e-4) this.yaw = first ? yawTowards(flat) : lerpAngle(this.yaw, yawTowards(flat), 0.05);
    const radii = windowRadii(size, distance, this.settings.windowMargin, this.settings.windowSoftness);
    this.window.inner += (radii.inner - this.window.inner) * 0.2;
    this.window.outer += (radii.outer - this.window.outer) * 0.2;
    this.sinceSeen = 0;
  }

  /** Draw into the screen (cleared) – before the AR scene */
  render(): void {
    if (!this.active) return;
    const renderer = this.renderer;
    const size = renderer.getDrawingBufferSize(new Vector2());
    const uniforms = this.material.uniforms;
    const video = this.cameraTexture();
    uniforms.uTime.value = this.time;
    uniforms.uYaw.value = this.yaw;
    uniforms.tCamera.value = video;
    uniforms.uHasCamera.value = video ? 1 : 0;
    if (video && this.videoElement) {
      const videoAspect = this.videoElement.videoWidth / Math.max(1, this.videoElement.videoHeight);
      const screenAspect = size.x / Math.max(1, size.y);
      uniforms.uCover.value.set(Math.min(1, screenAspect / videoAspect), Math.min(1, videoAspect / screenAspect));
      uniforms.uTexel.value.set(1 / Math.max(1, this.videoElement.videoWidth), 1 / Math.max(1, this.videoElement.videoHeight));
    }
    uniforms.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    uniforms.uRotation.value.setFromMatrix4(this.camera.matrixWorld);
    if (this.bookDirection) uniforms.uBook.value.copy(this.bookDirection);
    uniforms.uWindow.value.set(this.window.inner * DEG, this.window.outer * DEG);
    uniforms.uPresence.value = this.bookDirection ? this.presence : 0;
    uniforms.uOpacity.value = this.settings.worldOpacity;
    uniforms.uSky.value = this.skyStrength();
    uniforms.uFloor.value.set(-this.settings.floorClear * DEG, (-this.settings.floorClear + this.settings.floorSoftness) * DEG);
    this.quad.render(renderer);
  }

  /** The sky key's strength: off when the reader turned the onion sky off */
  private skyStrength(): number {
    return this.graphics.getSettings().onionSky ? this.settings.skyStrength : 0;
  }

  /** The engine's camera video as a texture (raw sRGB values for the sky test) */
  private cameraTexture(): VideoTexture | null {
    const element = this.cameraVideo();
    if (element !== this.videoElement) {
      this.video?.dispose();
      this.video = null;
      this.videoElement = element;
      if (element) {
        this.video = new VideoTexture(element);
        this.video.colorSpace = NoColorSpace;
      }
    }
    return this.videoElement && this.videoElement.readyState >= 2 ? this.video : null;
  }

  dispose(): void {
    this.running = false;
    this.orientation.stop();
    this.video?.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
