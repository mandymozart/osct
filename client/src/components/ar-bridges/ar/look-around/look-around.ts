import {
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  NoBlending,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  VideoTexture,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { AlienCafe, buildAlienCafe } from "./alien-cafe";
import { DeviceOrientation } from "./orientation";

const DEG = Math.PI / 180;

/** Tuning – exposed on `window.osctLookAround` in the browser for trying values on the phone */
export interface LookAroundSettings {
  /** How much the café covers the camera picture outside the book's window (1 = fully) */
  cafeOpacity: number;
  /** How strongly sky-coloured camera pixels turn into the alien sky when looking up (0 = off) */
  skyStrength: number;
  /** Seconds without a page before the café fades away (the gyroscope drifts; the book anchors the world) */
  forgetAfter: number;
  /** Seconds the café takes to appear / to fade when a page is found again */
  fadeIn: number;
  /** The window around the book: extra degrees around the tracked page, and the soft edge */
  windowMargin: number;
  windowSoftness: number;
  /** Render the café at this share of the screen's resolution */
  resolution: number;
}

export const DEFAULT_LOOK_AROUND: LookAroundSettings = {
  cafeOpacity: 0.92,
  skyStrength: 1,
  forgetAfter: 45,
  fadeIn: 1.4,
  windowMargin: 9,
  windowSoftness: 16,
  resolution: 0.75,
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
 * Draws the camera picture's surroundings as an alien café (3DoF) and keys the sky:
 * - The café is anchored to the book: while a page is tracked, its direction in the world (from the gyroscope's
 *   orientation) sets where the café's front is and where the book's window is; each new find corrects the
 *   gyroscope's drift. Turning the phone turns the view through the café; the book stays visible in a soft
 *   window, the café's roof is open (it fades out above the horizon).
 * - Looking up, sky-like camera pixels (blue or bright grey, smooth) show the alien sky instead.
 * Rendered first into its own target, then composed under the AR scene (`ArView.underlay`) with per-pixel alpha
 * over the camera canvas. No position tracking: walking does not move through the café.
 */
export class LookAround {
  readonly settings: LookAroundSettings = { ...DEFAULT_LOOK_AROUND };
  private orientation = new DeviceOrientation();
  private scene = new Scene();
  private camera = new PerspectiveCamera(60, 1, 0.1, 400);
  private cafe: AlienCafe = buildAlienCafe();
  private target: WebGLRenderTarget | null = null;
  private material: ShaderMaterial;
  private quad: FullScreenQuad;
  private video: VideoTexture | null = null;
  private videoElement: HTMLVideoElement | null = null;

  private time = 0;
  /** 0…1: how present the café is */
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
    this.scene.add(this.cafe.root);
    this.material = new ShaderMaterial({
      uniforms: {
        tCafe: { value: null },
        tCamera: { value: null },
        uHasCamera: { value: 0 },
        uCover: { value: new Vector2(1, 1) },
        uInverseProjection: { value: new Matrix4() },
        uRotation: { value: new Matrix3() },
        uBook: { value: new Vector3(0, -1, 0) },
        uWindow: { value: new Vector2(0.3, 0.6) },
        uPresence: { value: 0 },
        uCafeOpacity: { value: 1 },
        uSky: { value: 1 },
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
        uniform sampler2D tCafe;
        uniform sampler2D tCamera;
        uniform float uHasCamera;
        uniform vec2 uCover;
        uniform mat4 uInverseProjection;
        uniform mat3 uRotation;
        uniform vec3 uBook;
        uniform vec2 uWindow;
        uniform float uPresence;
        uniform float uCafeOpacity;
        uniform float uSky;
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
          // The camera picture covers the screen (cropped like the engine draws it)
          vec2 cam = (uv - 0.5) * uCover + 0.5;
          float score = 0.0;
          float sum = 0.0;
          float sumSq = 0.0;
          for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
              vec3 c = texture2D(tCamera, cam + vec2(float(x), float(y)) * uTexel * 3.0).rgb;
              score += skyColour(c);
              float l = dot(c, vec3(0.299, 0.587, 0.114));
              sum += l;
              sumSq += l * l;
            }
          }
          score /= 9.0;
          float mean = sum / 9.0;
          float deviation = sqrt(max(sumSq / 9.0 - mean * mean, 0.0));
          // Sky is smooth: leaves, edges and texture are not
          return score * (1.0 - smoothstep(0.025, 0.08, deviation));
        }

        void main() {
          vec4 point = uInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 ray = normalize(uRotation * (point.xyz / point.w));
          float elevation = asin(clamp(ray.y, -1.0, 1.0));

          float angle = acos(clamp(dot(ray, uBook), -1.0, 1.0));
          float outside = smoothstep(uWindow.x, uWindow.y, angle);
          float roof = 1.0 - smoothstep(0.35, 0.8, elevation);
          float cafe = uPresence * uCafeOpacity * outside * roof;

          float sky = 0.0;
          if (uHasCamera > 0.5 && uSky > 0.0) sky = uSky * smoothstep(0.03, 0.3, elevation) * skyMask(vUv);

          float alpha = max(cafe, sky);
          gl_FragColor = vec4(texture2D(tCafe, vUv).rgb, 1.0);
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

  /** Something to draw: the café is (partly) there, or the sky may be keyed */
  get active(): boolean {
    return this.running && (this.presence > 0.002 || (this.settings.skyStrength > 0 && this.skyInView));
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

  /** Scan paused or stopped: the café goes, the book's direction is kept for a quick return */
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
    const wanted = known ? 1 : 0;
    const rate = delta / Math.max(0.05, wanted > this.presence ? this.settings.fadeIn : 3);
    this.presence = wanted > this.presence ? Math.min(wanted, this.presence + rate) : Math.max(wanted, this.presence - rate);
    if (!known && this.presence === 0) this.bookDirection = null;

    this.cafe.root.rotation.y = this.yaw;
    this.cafe.update(this.time);

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
    const width = Math.max(1, Math.round(size.x * this.settings.resolution));
    const height = Math.max(1, Math.round(size.y * this.settings.resolution));
    if (!this.target) this.target = new WebGLRenderTarget(width, height, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter });
    else if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    const uniforms = this.material.uniforms;
    const video = this.cameraTexture();
    uniforms.tCafe.value = this.target.texture;
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
    uniforms.uCafeOpacity.value = this.settings.cafeOpacity;
    uniforms.uSky.value = this.settings.skyStrength;
    this.quad.render(renderer);
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
    this.cafe.dispose();
    this.target?.dispose();
    this.video?.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
