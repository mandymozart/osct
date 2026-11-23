import {
  ACESFilmicToneMapping, AmbientLight, AnimationMixer, BoxGeometry, CanvasTexture, Clock, DirectionalLight, EqualStencilFunc,
  ExtrudeGeometry, Group, type Material, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, ReplaceStencilOp, Scene, Shape, ShapeGeometry, SRGBColorSpace,
  type Texture, TextureLoader, Vector3, WebGLRenderer, AlwaysStencilFunc,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeObject, loadGltf } from "@engine/scene/assets";
import { applyTextureSets } from "@engine/scene/model-textures";
import { resolvePlacement } from "@shared/types/placement";
import type { ScanPrint, ScanStageData } from "./scan-stage-data";

/**
 * The landing hero's scan stage (#354, Tilman 2026-11-23: "put a actual 3d scene there … use the stage with the book on
 * the page as the back drop and simulate scaning the page with a phone frame that works as a portal"): the book lies open
 * on the scene of `ScanStageData`, a phone glides over it, and only through the phone's screen – a stencil portal – does
 * the model stand on its page; it grows when the phone finds the page and sinks back when the phone moves on.
 * Plain three.js and the engine's model loading – no tracker, no `ArScene`; loaded lazily (the `three` chunk).
 */

/** One loop of the phone: from the side onto the page, a while on it, off to the other side and back (s) */
const LOOP_S = 16;
/** The phone (surface widths): its size, its distance from the page point it looks at along the line of sight */
const PHONE = { width: 0.21, height: 0.44, depth: 0.014, radius: 0.032, bezel: 0.011, distance: 0.62 };
/** How near (surface widths) the phone's point must come to the target's centre to find it */
const FIND_RADIUS = 0.07;
const STENCIL_REF = 1;
const PAPER = "#f3eee4";
/** The paper is unlit (its colours as printed), dimmed to sit in the dark hero */
const PAPER_LIGHT = "#b8b2a6";

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A rounded rectangle, centred */
const roundedRect = (shape: Shape, width: number, height: number, radius: number): Shape => {
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
};

/** The paper's shading: the gutter's fold down the middle and a soft falloff to the edges */
const paperTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 8;
  const g = canvas.getContext("2d")!;
  const gradient = g.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, "#d9d2c3");
  gradient.addColorStop(0.08, PAPER);
  gradient.addColorStop(0.44, PAPER);
  gradient.addColorStop(0.5, "#b9b09e");
  gradient.addColorStop(0.56, PAPER);
  gradient.addColorStop(0.92, PAPER);
  gradient.addColorStop(1, "#d9d2c3");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 512, 8);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

/** The scan frame on the phone's screen: four gold corners, as the reader shows while it searches */
const scanFrameTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  g.strokeStyle = "rgba(225, 190, 110, .9)";
  g.lineWidth = 6;
  g.lineCap = "round";
  const [l, t, r, b, arm] = [40, 140, 216, 372, 34];
  ([[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]] as const).forEach(([x, y, dx, dy]) => {
    g.beginPath();
    g.moveTo(x, y + dy * arm);
    g.lineTo(x, y);
    g.lineTo(x + dx * arm, y);
    g.stroke();
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export class ScanStage {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.01, 20);
  private readonly clock = new Clock();
  private readonly phone = new Group();
  private readonly anchor = new Group();
  private readonly cameraHome = new Vector3(0, -1.5, 1.75);
  private readonly look = new Vector3(0, -0.02, 0);
  private readonly pointer = { x: 0, y: 0 };
  private readonly resize: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private mixer: AnimationMixer | null = null;
  private model: Object3D | null = null;
  private frame = 0;
  private visible = true;
  private found = 0;
  private stopped = false;
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private readonly container: HTMLElement, private readonly data: ScanStageData) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.8;
    this.scene.add(new AmbientLight(0xfff2dd, 0.4));
    const sun = new DirectionalLight(0xfff0d6, 2);
    sun.position.set(-0.6, 0.4, 1.4);
    this.scene.add(sun);

    this.camera.up.set(0, 0, 1);
    this.buildBook();
    this.buildPhone();
    this.scene.add(this.anchor);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.visibility = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      if (this.visible) this.start();
    });
    this.visibility.observe(container);
    container.addEventListener("pointermove", this.handlePointer);
    this.fit();
  }

  /** Loads the model; resolves once the first frame with it is drawn (rejects when it cannot load) */
  async load(): Promise<void> {
    const { entity, asset } = this.data;
    const loaded = await loadGltf(asset.src, asset.assetType === "gltf" ? "gltf" : "glb");
    if (this.stopped) return;
    const model = cloneSkinned(loaded.scene);
    if (asset.textures?.length) void applyTextureSets(model, asset.textures, 1024);
    // Through the screen only: every material tests the stencil the phone's screen writes
    model.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.renderOrder = 2;
      const portal = (material: Material): Material => {
        const own = material.clone();
        own.stencilWrite = true;
        own.stencilRef = STENCIL_REF;
        own.stencilFunc = EqualStencilFunc;
        return own;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(portal) : portal(mesh.material);
      mesh.frustumCulled = false;
    });
    const { position, rotation, scale } = resolvePlacement(entity.type, entity.params);
    const placed = new Group();
    placed.position.set(...position);
    placed.rotation.set(...(rotation.map(MathUtils.degToRad) as [number, number, number]));
    placed.scale.set(...scale);
    placed.add(model);
    this.anchor.add(placed);
    this.model = model;
    if (loaded.animations.length) {
      this.mixer = new AnimationMixer(model);
      loaded.animations.forEach(clip => this.mixer!.clipAction(clip).play());
    }
    this.start();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.visibility.disconnect();
    this.container.removeEventListener("pointermove", this.handlePointer);
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Building ─────────────────────────────────────────────────────────────────────────────────────

  /** The open book: a block of pages, the paper with its gutter, the scene's prints on it; the anchor on the model's target */
  private buildBook() {
    const { aspect, prints, target } = this.data;
    const block = new Mesh(new BoxGeometry(1.02, aspect + 0.02, 0.03), new MeshStandardMaterial({ color: "#1d1812", roughness: 0.9 }));
    block.position.z = -0.016;
    this.scene.add(block);
    const paper = new Mesh(new PlaneGeometry(1, aspect), new MeshBasicMaterial({ map: paperTexture(), color: PAPER_LIGHT, toneMapped: false }));
    this.scene.add(paper);
    const loader = new TextureLoader().setCrossOrigin("anonymous");
    prints.forEach((print, i) => {
      const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: PAPER_LIGHT, transparent: true, opacity: 0, toneMapped: false }));
      mesh.position.z = 0.0006 + i * 0.0001;
      mesh.visible = false;
      this.scene.add(mesh);
      void loader.loadAsync(print.src).then((texture: Texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        const image = texture.image as { width: number; height: number };
        const height = print.height ?? print.width * (image.height / Math.max(1, image.width));
        this.lay(mesh, print, height);
        if (print === target) this.lay(this.anchor, print, height);
        const material = mesh.material as MeshBasicMaterial;
        material.map = texture;
        material.opacity = 1;
        material.needsUpdate = true;
        mesh.visible = true;
      }).catch(() => undefined);
    });
    // Until its image is known, the anchor lies where the target starts
    this.lay(this.anchor, target, target.height ?? target.width * 0.6);
  }

  /** A print's mesh (or the anchor: scaled by the target's width – the engine's unit) at its place on the paper */
  private lay(object: Object3D, print: ScanPrint, height: number) {
    const y = print.top === null ? 0 : print.top - height / 2;
    object.position.x = print.x;
    object.position.y = y;
    if (object === this.anchor) {
      object.position.z = 0.001;
      object.scale.setScalar(print.width);
    } else {
      object.scale.set(print.width, height, 1);
    }
  }

  /** The phone: a dark bronze body with a hole for the screen; the screen writes the stencil the model needs; the scan frame on it */
  private buildPhone() {
    const { width, height, depth, radius, bezel } = PHONE;
    const outer = roundedRect(new Shape(), width, height, radius);
    const hole = roundedRect(new Shape(), width - 2 * bezel, height - 2 * bezel, radius - bezel * 0.6);
    outer.holes.push(hole);
    const body = new Mesh(
      new ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 3, curveSegments: 10 }),
      new MeshStandardMaterial({ color: "#2a2016", metalness: 0.75, roughness: 0.32, emissive: "#3a2a10", emissiveIntensity: 0.15 }),
    );
    body.position.z = -depth;
    body.renderOrder = 3;
    const screenShape = roundedRect(new Shape(), width - 2 * bezel, height - 2 * bezel, radius - bezel * 0.6);
    const screen = new Mesh(new ShapeGeometry(screenShape, 10), new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilRef: STENCIL_REF,
      stencilFunc: AlwaysStencilFunc,
      stencilZPass: ReplaceStencilOp,
    }));
    screen.renderOrder = 1;
    const frame = new Mesh(new PlaneGeometry(width - 2 * bezel, height - 2 * bezel), new MeshBasicMaterial({
      map: scanFrameTexture(), transparent: true, depthTest: false, depthWrite: false, opacity: 0.9,
    }));
    frame.position.z = 0.001;
    frame.renderOrder = 4;
    this.phone.add(body, screen, frame);
    this.phone.userData.frame = frame;
    this.scene.add(this.phone);
  }

  // ── Running ──────────────────────────────────────────────────────────────────────────────────────

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render(0);
  }

  private handlePointer = (event: PointerEvent) => {
    const box = this.container.getBoundingClientRect();
    this.pointer.x = (event.clientX - box.left) / Math.max(1, box.width) - 0.5;
    this.pointer.y = (event.clientY - box.top) / Math.max(1, box.height) - 0.5;
  };

  private start() {
    if (this.stopped || !this.visible) return;
    cancelAnimationFrame(this.frame);
    this.clock.getDelta();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    if (this.stopped) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.render(delta);
    if (this.visible && !document.hidden && !this.still) this.frame = requestAnimationFrame(this.tick);
    else if (!this.still) this.frame = requestAnimationFrame(() => this.start());
  };

  /** The page point the phone looks at, over one loop: from the right onto the target, a while there, off left, back */
  private aim(seconds: number): { x: number; y: number } {
    const { x, y } = this.anchor.position;
    const from = { x: x + 0.36, y: y - 0.14 };
    const away = { x: x - 0.3, y: y + 0.12 };
    const u = (seconds % LOOP_S) / LOOP_S;
    const mix = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) =>
      ({ x: a.x + (b.x - a.x) * smooth(t), y: a.y + (b.y - a.y) * smooth(t) });
    if (u < 0.18) return mix(from, { x, y }, u / 0.18);
    if (u < 0.62) return { x: x + Math.sin(seconds * 1.3) * 0.006, y: y + Math.sin(seconds * 0.9) * 0.005 };   // the hand holds still
    if (u < 0.8) return mix({ x, y }, away, (u - 0.62) / 0.18);
    return mix(away, from, (u - 0.8) / 0.2);
  }

  private render(delta: number) {
    // A still for reduced motion: the phone on the page, the model standing
    const seconds = this.still ? LOOP_S * 0.4 : this.clock.elapsedTime;
    this.camera.position.copy(this.cameraHome).add(new Vector3(this.pointer.x * 0.25, 0, -this.pointer.y * 0.15));
    this.camera.lookAt(this.look);

    const point = this.aim(seconds);
    const onPage = new Vector3(point.x, point.y, 0);
    const sight = this.camera.position.clone().sub(onPage).normalize();
    this.phone.position.copy(onPage).addScaledVector(sight, PHONE.distance);
    this.phone.up.set(0, 0, 1);
    this.phone.lookAt(this.camera.position);
    this.phone.rotateX(-0.42);                                    // held over the book, not flat to the viewer
    this.phone.rotateZ(Math.sin(seconds * 0.5) * 0.04);

    const near = Math.hypot(point.x - this.anchor.position.x, point.y - this.anchor.position.y) < FIND_RADIUS;
    this.found = this.still ? 1 : MathUtils.damp(this.found, near ? 1 : 0, near ? 3 : 5, delta);
    if (this.model) {
      const grow = smooth(MathUtils.clamp(this.found, 0, 1));
      this.model.scale.setScalar(Math.max(0.0001, grow));
      this.model.visible = grow > 0.01;
    }
    const frame = this.phone.userData.frame as Mesh<PlaneGeometry, MeshBasicMaterial>;
    frame.material.opacity = 0.9 * (1 - this.found * 0.85);
    this.mixer?.update(delta);
    this.renderer.render(this.scene, this.camera);
  }
}
