import { Camera, Color, CustomBlending, HalfFloatType, OneFactor, OneMinusSrcAlphaFactor, Scene, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { PassData } from "../../types/index";
import { MaskUsage, passContext, passRegistration, PostPass } from "./registry";

/** Anti-aliasing of the chain's buffer – as the canvas itself has it (clamped to what the GPU offers) */
const SAMPLES = 4;

/**
 * The last pass: the chain's buffer (linear, premultiplied) to the canvas – the colour is divided by the alpha for
 * the transfer to the output colour space and multiplied again, so an edge looks as it does without a chain; light
 * over alpha 0 (a bloom over the camera picture) is converted as it is. Drawn over what the screen holds with
 * premultiplied blending, as the scene itself would be.
 */
const OUTPUT_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (c.a > 0.001) {
        gl_FragColor = vec4(linearToOutputTexel(vec4(c.rgb / c.a, 1.0)).rgb * c.a, c.a);
      } else {
        gl_FragColor = vec4(linearToOutputTexel(vec4(c.rgb, 1.0)).rgb, c.a);
      }
    }
  `,
};

/**
 * The first pass while something is drawn under the scene (the look-around world and sky): the chain's buffer is
 * cleared and the underlay drawn into it, so the scene lies over it there and every pass shades both. The underlay
 * writes premultiplied colour over alpha like the scene; into the buffer its shader outputs linear (three picks the
 * output colour space by the render target), as the buffer holds.
 */
class UnderlayPass extends Pass {
  draw: (() => void) | null = null;

  constructor() {
    super();
    this.needsSwap = false;
    this.enabled = false;
  }

  render(renderer: WebGLRenderer, _writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const autoClear = renderer.autoClear;
    renderer.setRenderTarget(readBuffer);
    renderer.clear();
    renderer.autoClear = false;
    this.draw?.();
    renderer.setRenderTarget(readBuffer);
    renderer.autoClear = autoClear;
  }
}

interface Instance {
  data: PassData;
  pass: PostPass;
}

/**
 * The post-processing chain over the view's one renderer: the scene is rendered into a buffer, the passes of the
 * content run over it in order (`passes: [{ type, … }]`, from the pass registry), and the result lies on the canvas
 * as the scene would. Built only while a spread names passes; `set([])` frees everything – a spread without passes
 * renders straight to the canvas as before (no cost). `enabled` off keeps the passes but renders without them (the
 * editor's viewport outside *rendered*).
 */
export class PostChain {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private underlayPass = new UnderlayPass();
  private output: ShaderPass;
  private instances: Instance[] = [];
  private size = new Vector2();
  /** The AR layer's coverage alone – what a pass that reaches only the AR layer (the grade with `reach: ar`) is masked with */
  private mask: WebGLRenderTarget;
  enabled = true;

  constructor(private renderer: WebGLRenderer, private scene: Scene, private camera: Camera) {
    const size = renderer.getSize(new Vector2());
    const pixelRatio = renderer.getPixelRatio();
    const target = new WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
      type: HalfFloatType,
      samples: Math.min(SAMPLES, renderer.capabilities.maxSamples),
    });
    target.texture.name = "PostChain.rt1";
    this.mask = new WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, { samples: Math.min(SAMPLES, renderer.capabilities.maxSamples) });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    this.output = new ShaderPass(OUTPUT_SHADER);
    Object.assign(this.output.material, {
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.size.copy(size);
    this.rebuild();
  }

  /** Something to run this frame */
  get active(): boolean {
    return this.enabled && this.instances.length > 0;
  }

  get passes(): readonly PassData[] {
    return this.instances.map(i => i.data);
  }

  /**
   * The passes to run, in order. A pass whose type and position stay gets its new parameters in place (`update`);
   * everything else is built anew. An unknown type is logged and skipped (nothing registered it).
   */
  set(passes: readonly PassData[]): void {
    const pixelRatio = this.renderer.getPixelRatio();
    const next: Instance[] = [];
    const kept = new Set<PostPass>();
    passes.forEach((data, i) => {
      const registration = passRegistration(data.type);
      if (!registration) {
        console.warn(`[post] no pass "${data.type}" is registered – skipped`);
        return;
      }
      const context = passContext(registration, data, this.size, pixelRatio);
      const current = this.instances[i];
      if (current && current.data.type === data.type && current.pass.update) {
        current.pass.update(context.params);
        kept.add(current.pass);
        next.push({ data, pass: current.pass });
        return;
      }
      next.push({ data, pass: registration.factory(context) });
    });
    this.instances.forEach(instance => kept.has(instance.pass) || instance.pass.dispose());
    this.instances = next;
    this.rebuild();
  }

  private rebuild(): void {
    this.composer.passes = [this.underlayPass, this.renderPass, ...this.instances.map(i => i.pass), this.output];
    const pixelRatio = this.renderer.getPixelRatio();
    this.instances.forEach(i => i.pass.setSize(this.size.x * pixelRatio, this.size.y * pixelRatio));
  }

  /** The canvas size in CSS px changed */
  setSize(width: number, height: number): void {
    this.size.set(width, height);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    const pixelRatio = this.renderer.getPixelRatio();
    this.mask.setSize(width * pixelRatio, height * pixelRatio);
  }

  /**
   * Render the scene through the chain onto the canvas (the caller cleared the screen).
   * `backdrop`: the image holds more than the AR layer – objects standing in for the camera picture (the editor's
   * desk) or the underlay – and `arLayers` is the camera's layer mask for the AR layer alone: a pass that reaches the
   * AR layer only is given its coverage as a mask (drawn only while such a pass uses it).
   * `underlay`: draws the look-around world and sky into the chain's buffer before the scene, so the passes shade it
   * too; `null`: the buffer starts empty and the screen keeps the camera picture under it.
   */
  render(backdrop: { arLayers: number } | null = null, underlay: (() => void) | null = null): void {
    const masked = !!backdrop && this.wantsMask();
    if (backdrop && masked) this.drawMask(backdrop.arLayers);
    const mask = masked ? this.mask.texture : null;
    this.instances.forEach(i => i.pass.setMask?.(mask));
    this.underlayPass.draw = underlay;
    this.underlayPass.enabled = !!underlay;
    this.renderPass.clear = !underlay;
    this.composer.render();
    this.underlayPass.draw = null;
  }

  /** A pass limits itself to the AR layer with its current parameters (a pass with `setMask` and no `usesMask` always does) */
  private wantsMask(): boolean {
    return this.instances.some(i => !!i.pass.setMask && (i.pass as PostPass & MaskUsage).usesMask !== false);
  }

  /** The AR layer alone into the mask target: its alpha is the coverage (the scene's background stays out) */
  private drawMask(arLayers: number): void {
    const { renderer, scene, camera } = this;
    const layers = camera.layers.mask;
    const background = scene.background;
    const color = renderer.getClearColor(new Color());
    const alpha = renderer.getClearAlpha();
    camera.layers.mask = arLayers;
    scene.background = null;
    renderer.setRenderTarget(this.mask);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(color, alpha);
    scene.background = background;
    camera.layers.mask = layers;
  }

  dispose(): void {
    this.instances.forEach(instance => instance.pass.dispose());
    this.instances = [];
    this.renderPass.dispose();
    this.underlayPass.dispose();
    this.mask.dispose();
    this.output.dispose();
    this.composer.dispose();
  }
}
