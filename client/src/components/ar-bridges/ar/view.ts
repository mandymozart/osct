import {
  AmbientLight,
  AddEquation,
  Clock,
  CustomBlending,
  DirectionalLight,
  OneFactor,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  ZeroFactor,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Bloom: only what is brighter than white glows; rendered at half resolution */
const BLOOM_THRESHOLD = 1.0;
const BLOOM_RADIUS = 0.55;
const BLOOM_SCALE = 0.5;

/**
 * Adds the bloom over the camera image as light: colour is added, the canvas' alpha is left unchanged (a
 * premultiplied colour over alpha 0 is added to what lies under the canvas – the camera video).
 */
const bloomOverlayMaterial = () => new ShaderMaterial({
  uniforms: { tBloom: { value: null }, uStrength: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tBloom;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(texture2D(tBloom, vUv).rgb * uStrength, 0.0);
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
});

/**
 * The three.js side of the AR scene: one WebGL renderer (one context for the session), scene, camera,
 * lights and the render loop. The transparent canvas (`#scene`, faded in by main.css while AR runs) lies
 * over the camera video.
 */
export class ArView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  readonly renderer: WebGLRenderer;
  private clock = new Clock();
  private frameListeners = new Set<(delta: number) => void>();
  private looping = false;
  /** The canvas shows nothing (last frame was rendered empty) */
  private cleared = true;
  /**
   * Whether a frame needs drawing (something visible or animating). While nothing is found, rendering
   * costs no GPU time and the tracking engine has the GPU to itself (battery, heat).
   */
  needsRender: () => boolean = () => true;
  /** Bloom strength (0 = off – no post-processing cost); set every frame by the scene's animations */
  bloomStrength = 0;
  /** Drawn first each frame, under the scene (the look-around world) – it draws into the cleared screen */
  underlay: (() => void) | null = null;
  private bloom: { composer: EffectComposer; pass: UnrealBloomPass; quad: FullScreenQuad; material: ShaderMaterial } | null = null;

  constructor(private container: HTMLElement, private onResize: (camera: PerspectiveCamera) => void) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.id = "scene";
    Object.assign(canvas.style, { position: "absolute", left: "0", top: "0" });
    container.appendChild(canvas);

    // A-Frame's default lighting, which the models were authored for: ambient #BBB, directional 0.6 from above left
    this.scene.add(new AmbientLight(0xbbbbbb, 1));
    const sun = new DirectionalLight(0xffffff, 0.6);
    sun.position.set(-0.5, 1, 1);
    this.scene.add(sun);

    window.addEventListener("resize", this.resize);
    this.resize();
  }

  /** Called every rendered frame with the seconds since the last one */
  onFrame(listener: (delta: number) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  get running(): boolean {
    return this.looping;
  }

  start(): void {
    if (this.running) return;
    this.clock.getDelta(); // no jump after a pause
    this.looping = true;
    this.renderer.setAnimationLoop(() => {
      const delta = this.clock.getDelta();
      this.frameListeners.forEach(listener => listener(delta));
      const needed = this.needsRender();
      if (!needed && this.cleared) return;
      this.draw(); // the first frame with nothing visible clears the canvas
      this.cleared = !needed;
    });
  }

  /** Stop rendering – the canvas keeps the last frame */
  stop(): void {
    this.looping = false;
    this.renderer.setAnimationLoop(null);
  }

  /** The scene, plus the bloom over it while an animation wants it */
  private draw(): void {
    const bloom = this.bloomStrength > 0 ? this.ensureBloom() : null;
    bloom?.composer.render(); // scene → half-size target → bloom (only the part brighter than white)
    const autoClear = this.renderer.autoClear;
    this.renderer.setRenderTarget(null);
    if (this.underlay) {
      this.renderer.clear();
      this.underlay();
      this.renderer.setRenderTarget(null);
      this.renderer.clearDepth();
      this.renderer.autoClear = false;
    }
    this.renderer.render(this.scene, this.camera);
    if (bloom) {
      bloom.material.uniforms.tBloom.value = bloom.pass.renderTargetsHorizontal[0].texture;
      bloom.material.uniforms.uStrength.value = this.bloomStrength;
      this.renderer.autoClear = false;
      bloom.quad.render(this.renderer);
    }
    this.renderer.autoClear = autoClear;
  }

  private ensureBloom() {
    if (!this.bloom) {
      const size = this.renderer.getSize(new Vector2());
      const composer = new EffectComposer(this.renderer);
      composer.renderToScreen = false;
      composer.setPixelRatio(this.renderer.getPixelRatio() * BLOOM_SCALE);
      composer.setSize(size.x, size.y);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const pass = new UnrealBloomPass(new Vector2(size.x, size.y), 1, BLOOM_RADIUS, BLOOM_THRESHOLD);
      composer.addPass(pass);
      const material = bloomOverlayMaterial();
      this.bloom = { composer, pass, material, quad: new FullScreenQuad(material) };
    }
    return this.bloom;
  }

  resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.bloom?.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.onResize(this.camera); // the tracker fits video + field of view
    this.camera.updateProjectionMatrix();
    if (!this.running) this.draw();
    this.cleared = false; // size changed: draw again
  };

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this.resize);
    this.frameListeners.clear();
    if (this.bloom) {
      this.bloom.composer.dispose();
      this.bloom.pass.dispose();
      this.bloom.quad.dispose();
      this.bloom.material.dispose();
      this.bloom = null;
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
