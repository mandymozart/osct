import {
  ACESFilmicToneMapping, AlwaysStencilFunc, AmbientLight, AnimationMixer, BackSide, BoxGeometry, CanvasTexture, Clock,
  DirectionalLight, EqualStencilFunc, ExtrudeGeometry, FrontSide, Group, type Material, MathUtils, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, type Object3D, PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator, Raycaster,
  ReplaceStencilOp, Scene, Shape, ShapeGeometry, SRGBColorSpace, type Texture, Vector2, Vector3, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeObject, loadGltf } from "@engine/scene/assets";
import { type Celebration, celebrate } from "@engine/scene/celebration";
import { applyTextureSets } from "@engine/scene/model-textures";
import { loadPlugins } from "@engine/scene/plugins";
import { entityMomentAppearance, type Moment } from "@shared/types/appearance";
import { resolvePlacement } from "@shared/types/placement";
import { getExperience, getPlugins } from "@/utils/game-config";
import type { ScanPrint, ScanStageData } from "./scan-stage-data";

/**
 * The landing hero's scan stage (#354). Tilman, 2026-11-23: "put a actual 3d scene there … use the stage with the book
 * on the page as the back drop and simulate scaning the page with a phone frame that works as a portal"; "it starts with
 * the cover page opening the book, a few pages flipping and than the phonescaning. the reveal animation should also be
 * the real reveal we got"; "the phone can also follow the mouse so it becomes a simulation of the scan".
 *
 * The book lies closed, its cover opens, a few pages turn, and it lies open on the scene of `ScanStageData`. Then a phone
 * comes in and scans it: only through its screen – a stencil portal – does the model stand on the page. When the
 * target comes into the screen, the experience's own looks play (`reveal` the first time, then `found`; `lost` when it
 * leaves – the content's appearance and plugins, the engine's `celebrate`, as in the reader). The phone follows the
 * mouse once clicked ("the simulation should do this automatic scan, but when i click the mouse it should take control
 * of the phone"); another click, leaving the stage or a resting mouse give it back to the autopilot.
 * Plain three.js and the engine's model loading – no tracker, no `ArScene`; loaded lazily (the `three` chunk).
 */

export interface ScanStageExtras {
  /** The book's front cover as a picture (the print layout's), null without: the cover is set in gold on black */
  cover: Promise<string | null>;
  title: string;
  author: string;
  /** Other prints of the book for the pages that turn on the way */
  pageImages: readonly string[];
}

/** The book's intro (s): closed for a moment, the cover opens, the pages turn one after the other */
const INTRO = { hold: 1.6, cover: 1.6, page: 0.85, stagger: 0.38, settle: 0.6 };
const PAGES = 3;
/** The autopilot's loop (s): in from the side, a while on the target, off to the other side, back */
const LOOP_S = 15;
/** A click takes the phone; the mouse rests this long (s), leaves the stage or clicks again: the autopilot takes over */
const IDLE_S = 3.5;
/** The phone (surface widths): its size, its distance from the page point it looks at, along the line of sight */
const PHONE = { width: 0.27, height: 0.56, depth: 0.018, radius: 0.046, bezel: 0.008, distance: 0.6 };
/** The autopilot aims this much above the target's centre: more of a standing model's upper part is in the screen */
const AIM_UP = 0.07;
/** The target counts as in the screen while the aimed point lies within this share of its half size */
const FIND_SHARE = 0.72;
const STENCIL_REF = 1;
const PAPER = "#f3eee4";
/** The paper is unlit (its colours as printed), dimmed to sit in the dark hero */
const PAPER_LIGHT = "#bdb7ab";
const GOLD = "#b8914a";
/** The spread's picture, this many px across */
const CANVAS_WIDTH = 2048;

const smooth = (t: number): number => {
  const x = MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** A rounded rectangle, centred */
const roundedRect = (width: number, height: number, radius: number): Shape => {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
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

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(src));
  image.src = src;
});

const canvasTexture = (canvas: HTMLCanvasElement): CanvasTexture => {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

/** A half of a picture across (0 = left, 1 = right); `mirrored` for the back of a turned leaf */
const half = (texture: Texture, side: 0 | 1, mirrored = false): Texture => {
  const own = texture.clone();
  own.repeat.set(mirrored ? -0.5 : 0.5, 1);
  own.offset.set(mirrored ? 0.5 + side * 0.5 : side * 0.5, 0);
  own.needsUpdate = true;
  return own;
};

/** Paper with the gutter's shade where it is bound (`gutter`: −1 its left edge, 1 its right edge, 0 the spread's middle) */
const paintPaper = (g: CanvasRenderingContext2D, width: number, height: number, gutter: -1 | 0 | 1) => {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, width, height);
  const shade = (at: number, reach: number) => {
    const gradient = g.createLinearGradient(at - reach, 0, at + reach, 0);
    gradient.addColorStop(0, "rgba(90, 75, 50, 0)");
    gradient.addColorStop(0.5, "rgba(90, 75, 50, .28)");
    gradient.addColorStop(1, "rgba(90, 75, 50, 0)");
    g.fillStyle = gradient;
    g.fillRect(at - reach, 0, reach * 2, height);
  };
  if (gutter === 0) shade(width / 2, width * 0.05);
  else shade(gutter < 0 ? 0 : width, width * 0.1);
};

/** The cover: the book's own when the content has it, else its title and author in gold on black, in a gold frame */
const paintCover = async (extras: ScanStageExtras, aspect: number): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round(1024 * aspect * 2);
  const g = canvas.getContext("2d")!;
  const own = await extras.cover.then(src => (src ? loadImage(src) : null)).catch(() => null);
  if (own) {
    g.drawImage(own, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  const { width, height } = canvas;
  g.fillStyle = "#0b0a08";
  g.fillRect(0, 0, width, height);
  const gold = g.createLinearGradient(0, 0, width, height);
  gold.addColorStop(0, "#f3dfb0");
  gold.addColorStop(0.45, "#b8914a");
  gold.addColorStop(1, "#e8cf96");
  g.strokeStyle = gold;
  g.lineWidth = 6;
  g.strokeRect(40, 40, width - 80, height - 80);
  g.fillStyle = gold;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-design").trim() || "Arial, sans-serif";
  let y = height * 0.2;
  extras.title.split(/\s+(&|and|und|et|en)\s+/i).forEach((line, i) => {
    const size = i % 2 ? 60 : 118;
    g.font = `400 ${size}px ${family}`;
    line.split(/\s+/).forEach(word => {
      g.fillText(word, 96, y);
      y += size * 1.02;
    });
  });
  g.font = `400 54px ${family}`;
  g.fillText(extras.author, 96, height - 120);
  return canvas;
};

/** A leaf's face: paper and one of the book's prints in its middle */
const paintPage = async (src: string | undefined, aspect: number, gutter: -1 | 1): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 * aspect * 2);
  const g = canvas.getContext("2d")!;
  paintPaper(g, canvas.width, canvas.height, gutter);
  const image = src ? await loadImage(src).catch(() => null) : null;
  if (image) {
    const ratio = image.height / Math.max(1, image.width);
    const width = Math.min(canvas.width * 0.64, (canvas.height * 0.6) / ratio);
    g.drawImage(image, (canvas.width - width) / 2, (canvas.height - width * ratio) / 2.4, width, width * ratio);
  }
  return canvas;
};

/** A leaf of the book: a plane of half the spread, hinged at the gutter, bending as it turns */
class Leaf {
  readonly group = new Group();
  private readonly geometry: PlaneGeometry;
  private readonly columns = 24;

  constructor(
    private readonly width: number, height: number,
    readonly front: MeshBasicMaterial, readonly back: MeshBasicMaterial,
    private readonly lift: [number, number], private readonly tint = PAPER_LIGHT,
  ) {
    this.geometry = new PlaneGeometry(width, height, this.columns, 1);
    this.geometry.translate(width / 2, 0, 0);
    front.side = FrontSide;
    back.side = BackSide;
    this.group.add(new Mesh(this.geometry, front), new Mesh(this.geometry, back));
    this.turn(0);
  }

  /** 0 = lying on the right, 1 = turned over onto the left; the free edge trails while it turns */
  turn(t: number) {
    const angle = Math.PI * smooth(t);
    const bend = -0.75 * Math.sin(angle);
    const step = this.width / this.columns;
    const xs = [0];
    const zs = [0];
    for (let j = 0; j < this.columns; j++) {
      const a = angle + bend * ((j + 0.5) / this.columns);
      xs.push(xs[j] + Math.cos(a) * step);
      zs.push(zs[j] + Math.sin(a) * step);
    }
    const position = this.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const j = i % (this.columns + 1);
      position.setX(i, xs[j]);
      position.setZ(i, zs[j]);
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.group.position.z = MathUtils.lerp(this.lift[0], this.lift[1], smooth(t));
    // The page darkens a little as it stands up from the light
    const shade = 1 - 0.22 * Math.sin(angle);
    this.front.color.set(this.tint).multiplyScalar(shade);
    this.back.color.set(PAPER_LIGHT).multiplyScalar(shade);
  }
}

export class ScanStage {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.01, 20);
  private readonly clock = new Clock(false);
  private readonly phone = new Group();
  private readonly anchor = new Group();
  private readonly placed = new Group();
  private readonly leaves: Leaf[] = [];
  private readonly leftBlock = new Group();
  private readonly cameraHome = new Vector3(0, -1.55, 1.85);
  private readonly cameraStart = new Vector3(0.12, -1.25, 2.05);
  private readonly look = new Vector3(0.02, 0.02, 0);
  private readonly raycaster = new Raycaster();
  private readonly page = new Plane(new Vector3(0, 0, 1), 0);
  private readonly resize: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** The target's centre and half size on the page, once its picture is known */
  private target = { x: 0, y: 0, halfWidth: 0.2, halfHeight: 0.2 };
  /** Where the phone looks now (smoothed), where the mouse wants it (only once a click took the phone), and when it last moved */
  private readonly aim = new Vector2(0.9, -0.2);
  private mouse: Vector2 | null = null;
  private steering = false;
  private mouseAt = -Infinity;
  private mixer: AnimationMixer | null = null;
  private model: Object3D | null = null;
  private celebration: Celebration | null = null;
  private inView = false;
  private revealed = false;
  private frame = 0;
  private visible = true;
  private stopped = false;

  constructor(private readonly container: HTMLElement, private readonly data: ScanStageData, private readonly extras: ScanStageExtras) {
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
    this.camera.position.copy(this.still ? this.cameraHome : this.cameraStart);
    this.camera.lookAt(this.look);
    this.placed.visible = false;
    this.anchor.add(this.placed);
    this.scene.add(this.anchor);
    this.buildPhone();

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.visibility = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      if (this.visible) this.start();
    });
    this.visibility.observe(container);
    container.addEventListener("pointerdown", this.handleClick);
    container.addEventListener("pointermove", this.handlePointer);
    container.addEventListener("pointerleave", this.handleLeave);
    this.fit();
  }

  /** The book, the content's plugins (their looks) and the model; resolves once everything is there and running */
  async load(): Promise<void> {
    const { entity, asset } = this.data;
    const [loaded] = await Promise.all([
      loadGltf(asset.src, asset.assetType === "gltf" ? "gltf" : "glb"),
      loadPlugins(getPlugins()).catch(() => undefined),
      this.buildBook(),
    ]);
    if (this.stopped) return;
    const model = cloneSkinned(loaded.scene);
    if (asset.textures?.length) void applyTextureSets(model, asset.textures, 1024);
    model.traverse(object => {
      if ((object as Mesh).isMesh) object.frustumCulled = false;
    });
    const { position, rotation, scale } = resolvePlacement(entity.type, entity.params);
    this.placed.position.set(...position);
    this.placed.rotation.set(...(rotation.map(MathUtils.degToRad) as [number, number, number]));
    this.placed.scale.set(...scale);
    this.placed.add(model);
    this.model = model;
    if (loaded.animations.length) {
      this.mixer = new AnimationMixer(model);
      loaded.animations.forEach(clip => this.mixer!.clipAction(clip).play());
    }
    this.clock.start();
    this.start();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.celebration?.finish();
    this.resize.disconnect();
    this.visibility.disconnect();
    this.container.removeEventListener("pointerdown", this.handleClick);
    this.container.removeEventListener("pointermove", this.handlePointer);
    this.container.removeEventListener("pointerleave", this.handleLeave);
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Building ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * The book: gold boards under both halves, the right half's page (the scene's right page) at the bottom, and over it
   * the leaves that turn – the cover first, then the pages, the last one's back the scene's left page
   */
  private async buildBook() {
    const { aspect } = this.data;
    const gold = new MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.28 });
    const board = (side: -1 | 1) => {
      const mesh = new Mesh(new BoxGeometry(0.515, aspect + 0.03, 0.022), gold);
      mesh.position.set(side * 0.2575, 0, -0.012);
      return mesh;
    };
    this.scene.add(board(1));
    this.leftBlock.add(board(-1));
    this.leftBlock.visible = this.still;
    this.scene.add(this.leftBlock);

    const material = (map: Texture) => new MeshBasicMaterial({ map, color: PAPER_LIGHT, toneMapped: false });
    const [spread, pages, cover, endpaper] = await Promise.all([
      this.paintSpread(),
      Promise.all(Array.from({ length: PAGES * 2 - 1 }, (_, i) =>
        paintPage(this.extras.pageImages[i], aspect, i % 2 ? -1 : 1).then(canvasTexture))),
      paintCover(this.extras, aspect).then(canvasTexture),
      paintPage(undefined, aspect, -1).then(canvasTexture),
    ]);
    const right = new Mesh(new PlaneGeometry(0.5, aspect), material(half(spread, 1)));
    right.position.set(0.25, 0, 0.0004);
    this.scene.add(right);

    const count = PAGES + 1;
    // On the right the cover lies on top; on the left the last page turned does
    const lift = (i: number): [number, number] => [0.001 + (count - i) * 0.0012, 0.0006 + i * 0.0012];
    this.leaves.push(new Leaf(0.512, aspect + 0.024, material(cover), material(endpaper), lift(0), "#ffffff"));
    for (let i = 0; i < PAGES; i++) {
      const back = i === PAGES - 1 ? half(spread, 0, true) : pages[i * 2 + 1];
      this.leaves.push(new Leaf(0.5, aspect, material(pages[i * 2]), material(back), lift(i + 1)));
    }
    this.leaves.forEach(leaf => {
      if (this.still) leaf.turn(1);
      this.scene.add(leaf.group);
    });
  }

  /** The scene's spread as one picture: the paper, the gutter, the prints where they lie; places the anchor on the target */
  private async paintSpread(): Promise<CanvasTexture> {
    const { aspect, prints, target } = this.data;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = Math.round(CANVAS_WIDTH * aspect);
    const g = canvas.getContext("2d")!;
    paintPaper(g, canvas.width, canvas.height, 0);
    const images = await Promise.all(prints.map(print => loadImage(print.src).catch(() => null)));
    prints.forEach((print, i) => {
      const image = images[i];
      const height = print.height ?? print.width * (image ? image.height / Math.max(1, image.width) : 0.6);
      const top = print.top ?? height / 2;
      if (print === target) this.layAnchor(print, top - height / 2, height);
      if (!image) return;
      g.drawImage(image, (print.x - print.width / 2 + 0.5) * CANVAS_WIDTH, (aspect / 2 - top) * CANVAS_WIDTH,
        print.width * CANVAS_WIDTH, height * CANVAS_WIDTH);
    });
    return canvasTexture(canvas);
  }

  /** The anchor on the target's centre, 1 unit = its width (the engine's unit) */
  private layAnchor(print: ScanPrint, y: number, height: number) {
    this.anchor.position.set(print.x, y, 0.001);
    this.anchor.scale.setScalar(print.width);
    this.target = { x: print.x, y, halfWidth: print.width / 2, halfHeight: height / 2 };
  }

  /** The phone: a graphite body with a gold rim and side buttons, the screen's stencil portal, glass, scan frame, camera pill */
  private buildPhone() {
    const { width, height, depth, radius, bezel } = PHONE;
    const inner = { width: width - 2 * bezel, height: height - 2 * bezel, radius: radius - bezel };
    const outer = roundedRect(width, height, radius);
    outer.holes.push(roundedRect(inner.width, inner.height, inner.radius));
    const metal = new MeshStandardMaterial({ color: "#1c1a18", metalness: 0.85, roughness: 0.3 });
    const body = new Mesh(new ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 4, curveSegments: 14 }), metal);
    body.position.z = -depth;
    const ring = roundedRect(width + 0.007, height + 0.007, radius + 0.0035);
    ring.holes.push(roundedRect(width - 0.001, height - 0.001, radius));
    const rim = new Mesh(new ExtrudeGeometry(ring, { depth: depth * 0.7, bevelEnabled: false, curveSegments: 14 }),
      new MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 }));
    rim.position.z = -depth * 0.85;
    const buttons = ([[-1, 0.12, 0.05], [-1, 0.045, 0.05], [1, 0.08, 0.08]] as const).map(([side, y, length]) => {
      const button = new Mesh(new BoxGeometry(0.005, length, depth * 0.5), metal);
      button.position.set(side * (width / 2 + 0.005), y, -depth / 2);
      return button;
    });
    [body, rim, ...buttons].forEach(mesh => (mesh.renderOrder = 3));
    const screenShape = roundedRect(inner.width, inner.height, inner.radius);
    const screen = new Mesh(new ShapeGeometry(screenShape, 14), new MeshBasicMaterial({
      colorWrite: false, depthWrite: false, depthTest: false,
      stencilWrite: true, stencilRef: STENCIL_REF, stencilFunc: AlwaysStencilFunc, stencilZPass: ReplaceStencilOp,
    }));
    screen.renderOrder = 1;
    const overlay = (geometry: ShapeGeometry | PlaneGeometry, material: MeshBasicMaterial): Mesh => {
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 5;
      mesh.position.z = 0.001;
      return mesh;
    };
    const glassGeometry = new ShapeGeometry(screenShape, 14);
    const uv = glassGeometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / inner.width + 0.5, uv.getY(i) / inner.height + 0.5);
    const glass = overlay(glassGeometry, new MeshBasicMaterial({ map: this.glassTexture() }));
    const frameMaterial = new MeshBasicMaterial({ map: this.scanFrameTexture(), opacity: 0.9 });
    const frame = overlay(new PlaneGeometry(inner.width, inner.height), frameMaterial);
    const pill = overlay(new ShapeGeometry(roundedRect(0.07, 0.02, 0.01), 8), new MeshBasicMaterial({ color: "#000000" }));
    pill.position.y = inner.height / 2 - 0.022;
    this.phone.add(body, rim, ...buttons, screen, glass, frame, pill);
    this.phone.userData.frame = frameMaterial;
    this.phone.visible = false;
    this.scene.add(this.phone);
  }

  /** The glass: a faint sheen across the screen */
  private glassTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const g = canvas.getContext("2d")!;
    const gradient = g.createLinearGradient(0, 0, 128, 256);
    gradient.addColorStop(0, "rgba(255, 255, 255, .10)");
    gradient.addColorStop(0.42, "rgba(255, 255, 255, .03)");
    gradient.addColorStop(0.43, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(1, "rgba(255, 255, 255, .04)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 256);
    return canvasTexture(canvas);
  }

  /** The scan frame on the screen: four gold corners, as the reader shows while it searches */
  private scanFrameTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const g = canvas.getContext("2d")!;
    g.strokeStyle = "rgba(225, 190, 110, .9)";
    g.lineWidth = 5;
    g.lineCap = "round";
    const [l, t, r, b, arm] = [44, 150, 212, 362, 30];
    ([[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]] as const).forEach(([x, y, dx, dy]) => {
      g.beginPath();
      g.moveTo(x, y + dy * arm);
      g.lineTo(x, y);
      g.lineTo(x + dx * arm, y);
      g.stroke();
    });
    return canvasTexture(canvas);
  }

  // ── Running ──────────────────────────────────────────────────────────────────────────────────────

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.clock.running) this.renderer.render(this.scene, this.camera);
  }

  /** A click takes the phone (it goes to the page point under the mouse) – or, while steering, gives it back */
  private handleClick = (event: PointerEvent) => {
    if (!this.phone.visible) return;
    this.steer(!this.steering);
    if (this.steering) this.handlePointer(event);
  };

  private steer(on: boolean) {
    this.steering = on;
    if (!on) this.mouse = null;
    this.container.style.cursor = on ? "none" : "";
  }

  /** While steering: the page point under the mouse is where the phone looks */
  private handlePointer = (event: PointerEvent) => {
    if (!this.steering) return;
    const box = this.container.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.page, new Vector3());
    if (!hit) return;
    this.mouse = new Vector2(MathUtils.clamp(hit.x, -0.9, 0.9), MathUtils.clamp(hit.y, -0.7, 0.7));
    this.mouseAt = this.clock.elapsedTime;
  };

  private handleLeave = () => this.steer(false);

  private start() {
    if (this.stopped || !this.visible || !this.clock.running) return;
    cancelAnimationFrame(this.frame);
    this.clock.getDelta();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    if (this.stopped) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.render(delta);
    if (this.still) return;
    this.frame = this.visible && !document.hidden ? requestAnimationFrame(this.tick) : requestAnimationFrame(() => this.start());
  };

  /** When the intro is over (s) */
  private get introEnd(): number {
    return INTRO.hold + INTRO.cover + INTRO.stagger * (PAGES - 1) + INTRO.page + INTRO.settle;
  }

  /** The book opens: the cover, then the pages one after the other; the camera comes down meanwhile */
  private playIntro(seconds: number) {
    this.leaves.forEach((leaf, i) => {
      const start = i === 0 ? INTRO.hold : INTRO.hold + INTRO.cover * 0.7 + (i - 1) * INTRO.stagger;
      leaf.turn((seconds - start) / (i === 0 ? INTRO.cover : INTRO.page));
    });
    this.leftBlock.visible = seconds > INTRO.hold + INTRO.cover * 0.5;
    this.camera.position.lerpVectors(this.cameraStart, this.cameraHome, smooth((seconds - INTRO.hold) / (this.introEnd - INTRO.hold)));
  }

  /** The autopilot's page point over one loop: in from the side onto the target, a while there, off, back */
  private autopilot(seconds: number): Vector2 {
    const hold = new Vector2(this.target.x + Math.sin(seconds * 1.3) * 0.006, this.target.y + AIM_UP + Math.sin(seconds * 0.9) * 0.005);
    const side = new Vector2(this.target.x + 0.42, this.target.y - 0.12);
    const away = new Vector2(this.target.x - 0.34, this.target.y + 0.14);
    const u = (seconds % LOOP_S) / LOOP_S;
    if (u < 0.15) return side.lerp(hold, smooth(u / 0.15));
    if (u < 0.66) return hold;
    if (u < 0.82) return hold.lerp(away, smooth((u - 0.66) / 0.16));
    return away.lerp(side, smooth((u - 0.82) / 0.18));
  }

  private render(delta: number) {
    const seconds = this.still ? this.introEnd + LOOP_S * 0.4 : this.clock.elapsedTime;
    if (!this.still) this.playIntro(seconds);
    this.camera.lookAt(this.look);

    const scanning = seconds >= this.introEnd;
    this.phone.visible = scanning;
    if (scanning) {
      if (this.steering && seconds - this.mouseAt > IDLE_S) this.steer(false);
      const following = this.steering && this.mouse !== null;
      const wanted = following ? this.mouse! : this.autopilot(seconds - this.introEnd);
      if (this.still) this.aim.copy(wanted);
      else this.aim.lerp(wanted, 1 - Math.exp(-(following ? 7 : 3) * delta));
      this.placePhone(seconds);
      this.scan();
    }
    if (this.celebration && !this.celebration.update(delta)) {
      if (this.celebration.kind === "lost") this.placed.visible = false;
      this.celebration = null;
    }
    this.portal();
    const frame = this.phone.userData.frame as MeshBasicMaterial;
    frame.opacity = MathUtils.damp(frame.opacity, this.inView ? 0.15 : 0.9, 4, delta);
    this.mixer?.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  /** The phone between the eye and the page point it looks at, held over the book rather than flat to the viewer */
  private placePhone(seconds: number) {
    const onPage = new Vector3(this.aim.x, this.aim.y, 0);
    const sight = this.camera.position.clone().sub(onPage).normalize();
    this.phone.position.copy(onPage).addScaledVector(sight, PHONE.distance);
    this.phone.up.set(0, 0, 1);
    this.phone.lookAt(this.camera.position);
    this.phone.rotateX(-0.4);
    this.phone.rotateZ(Math.sin(seconds * 0.5) * 0.035);
  }

  /** The target comes into the screen or leaves it: the experience's look for the moment, as the reader plays it */
  private scan() {
    const { x, y, halfWidth, halfHeight } = this.target;
    const inView = Math.abs(this.aim.x - x) < halfWidth * FIND_SHARE
      && Math.abs(this.aim.y - y - AIM_UP / 2) < halfHeight * FIND_SHARE + AIM_UP / 2;
    if (inView === this.inView || !this.model) return;
    this.inView = inView;
    if (this.still) {
      this.placed.visible = inView;
      return;
    }
    const moment: Moment = inView ? (this.revealed ? "found" : "reveal") : "lost";
    if (inView) {
      this.revealed = true;
      this.placed.visible = true;
    }
    this.celebration?.finish();
    this.celebration = celebrate(this.anchor, this.placed, moment, entityMomentAppearance(this.data.entity, getExperience(), moment));
  }

  /** Everything on the anchor – the model and whatever its look adds (sparks, its own materials) – only through the screen */
  private portal() {
    this.anchor.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.material) return;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material: Material) => {
        if (material.stencilWrite && material.stencilFunc === EqualStencilFunc) return;
        material.stencilWrite = true;
        material.stencilRef = STENCIL_REF;
        material.stencilFunc = EqualStencilFunc;
        material.needsUpdate = true;
      });
      mesh.renderOrder = 2;
    });
  }
}
