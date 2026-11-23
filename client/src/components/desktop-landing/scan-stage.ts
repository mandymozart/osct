import {
  AlwaysDepth, AlwaysStencilFunc, AmbientLight, AnimationMixer, BackSide, BoxGeometry, BufferAttribute, CanvasTexture, Clock,
  DirectionalLight, EqualStencilFunc, ExtrudeGeometry, FrontSide, Group, type Material, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator, Raycaster,
  RepeatWrapping, ReplaceStencilOp, ShaderMaterial, Scene, Shape, ShapeGeometry, SRGBColorSpace, type Texture, Vector2, Vector3, WebGLRenderer,
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
  /**
   * The print layout's pictures (`utils/book-cover.ts`): the front cover, the scene's spread and the spreads before it
   * (nearest last) – each null / missing without a layout (the test fixture): the cover is then set in gold on black,
   * the spread laid out from its targets, the turning pages show other prints of the book
   */
  sheets: Promise<{ cover: string | null; spread: string | null; earlier: string[] }>;
  title: string;
  author: string;
  /** Other prints of the book for turning pages without a sheet */
  pageImages: readonly string[];
}

/** The book's intro (s): closed for a moment, the cover opens, the pages turn one after the other */
const INTRO = { hold: 1.6, cover: 1.6, page: 0.85, stagger: 0.38, settle: 0.6 };
const PAGES = 3;
/** The autopilot's loop (s): in from the side, a while on the target, off to the other side, back */
const LOOP_S = 15;
/** A click takes the phone; the mouse rests this long (s), leaves the stage or clicks again: the autopilot takes over */
const IDLE_S = 3.5;
/**
 * The phone (surface widths): its size, its distance from the page point it looks at along the line of sight – and
 * while the visitor steers it, nearer the eye, bigger ("when clicking the phone it comes closer to the cameara")
 */
const PHONE = { width: 0.27, height: 0.56, depth: 0.018, radius: 0.046, bezel: 0.008, distance: 0.6, steered: 1.0 };
/** The autopilot aims this much above the target's centre: more of a standing model's upper part is in the screen */
const AIM_UP = 0.07;
/** The target counts as in the screen while the aimed point lies within this share of its half size */
const FIND_SHARE = 0.72;
const STENCIL_REF = 1;
const LIGHT = { ambient: 2.2, sun: 1.5 };
const PAPER = "#f6f3ec";
/**
 * The book (surface widths): its thickness closed, a cover's, and the share of its pages that lie on the left once it
 * is open on the scene – the left half grows and the right one thins as the cover and the pages turn
 */
const BOOK = { thickness: 0.05, cover: 0.0025, opened: 0.16 };
/** The pages dip into the gutter (this deep at the fold, level again about `reach` from it) and are a shade darker there */
const GUTTER = { dip: 0.006, reach: 0.045, shade: 0.14, shadeReach: 0.018 };
const dipAt = (distance: number): number => -GUTTER.dip * Math.exp(-((distance / GUTTER.reach) ** 2));
/** The leaves lie this far above one another (no flicker, no visible step) */
const LIFT = 0.00025;
/**
 * The canvas is larger than the stage's box by this share on every side, so the book's lower edge and a phone held
 * near the eye are never cut off; the camera's angle widens with it and the picture in the box stays the same
 */
const OVERSCAN = 0.3;
const FOV = 30;
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

/** An image as a canvas (a texture of it can be cut into halves with its own repeat and offset) */
const toCanvas = (image: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return canvas;
};

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
  // The fold itself is shaded by the leaf (`GUTTER.shade`): only a page of its own gets a soft shade here
  if (gutter !== 0) shade(gutter < 0 ? 0 : width, width * 0.06);
};

/** The cover without a picture of its own: the title and the author in gold on black, in a gold frame */
const paintCover = (extras: ScanStageExtras, aspect: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round(1024 * aspect * 2);
  const g = canvas.getContext("2d")!;
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

/**
 * The printed cover as a material (Tilman: "the front cover is wrong. we can create a special texture material for it,
 * since it has this special laquer in the print"): the paper with its dot screen matte, the brush strokes – flat white
 * where the screen is left out – a glossy lacquer (clear coat), the gold title metal. The masks are read from the
 * picture itself into one texture: red = lacquer (clearcoatMap), green = roughness, blue = metalness.
 */
const lacquerCover = (image: HTMLImageElement, environment: Texture): MeshPhysicalMaterial => {
  const { width, height } = image;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(image, 0, 0);
  const pixels = g.getImageData(0, 0, width, height);
  const data = pixels.data;
  const count = width * height;
  const light = new Float32Array(count);
  const gold = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const [r, green, b] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    light[i] = (0.299 * r + 0.587 * green + 0.114 * b) / 255;
    gold[i] = r - b > 45 && light[i] < 0.9 ? 1 : 0;
  }
  // The dot screen varies at a small scale, the lacquer's strokes are flat white: a low variance around the pixel
  const radius = 4;
  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  const squares = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    let rowSquares = 0;
    for (let x = 0; x < width; x++) {
      const v = light[y * width + x];
      row += v;
      rowSquares += v * v;
      const at = (y + 1) * stride + x + 1;
      sum[at] = sum[at - stride] + row;
      squares[at] = squares[at - stride] + rowSquares;
    }
  }
  const box = (table: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    table[y1 * stride + x1] - table[y0 * stride + x1] - table[y1 * stride + x0] + table[y0 * stride + x0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const y0 = Math.max(0, y - radius);
      const x1 = Math.min(width, x + radius + 1);
      const y1 = Math.min(height, y + radius + 1);
      const n = (x1 - x0) * (y1 - y0);
      const mean = box(sum, x0, y0, x1, y1) / n;
      const variance = box(squares, x0, y0, x1, y1) / n - mean * mean;
      const i = y * width + x;
      const lacquer = !gold[i] && mean > 0.95 && variance < 0.0004;
      data[i * 4] = lacquer ? 255 : 0;
      data[i * 4 + 1] = gold[i] ? 70 : lacquer ? 25 : 215;
      data[i * 4 + 2] = gold[i] ? 255 : 0;
      data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(pixels, 0, 0);
  const masks = new CanvasTexture(canvas);
  const map = new CanvasTexture(image);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return new MeshPhysicalMaterial({
    map,
    roughness: 1,
    roughnessMap: masks,
    metalness: 1,
    metalnessMap: masks,
    clearcoat: 1,
    clearcoatMap: masks,
    clearcoatRoughness: 0.08,
    envMap: environment,
    envMapIntensity: 0.45,
    color: "#c9c9c9",   // under the stage's bright light the paper stays just below white: its dot screen and the gold read
  });
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

/**
 * A leaf of the book: a plane of half the spread, hinged at the gutter. It dips into the fold where it is bound
 * (`GUTTER`), is a shade darker there (vertex colours – the paper itself is unlit), and bends while it turns – a page
 * much, the cover little.
 */
class Leaf {
  readonly group = new Group();
  /** How far it is turned, eased: 0 = lying on the right, 1 = on the left */
  progress = 0;
  private readonly geometry: PlaneGeometry;
  private readonly columns = 28;

  constructor(
    private readonly width: number, height: number,
    readonly front: MeshBasicMaterial | MeshPhysicalMaterial, readonly back: MeshBasicMaterial,
    private readonly lift: [number, number], private readonly bend = 0.75,
  ) {
    this.geometry = new PlaneGeometry(width, height, this.columns, 1);
    const colors = new Float32Array(this.geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length / 3; i++) {
      const distance = ((i % (this.columns + 1)) / this.columns) * width;
      colors.fill(1 - GUTTER.shade * Math.exp(-((distance / GUTTER.shadeReach) ** 2)), i * 3, i * 3 + 3);
    }
    this.geometry.setAttribute("color", new BufferAttribute(colors, 3));
    front.side = FrontSide;
    back.side = BackSide;
    this.group.add(new Mesh(this.geometry, front), new Mesh(this.geometry, back));
    this.turn(0);
  }

  /** 0 = lying on the right, 1 = turned over onto the left; the free edge trails while it turns */
  turn(t: number) {
    this.progress = smooth(t);
    const angle = Math.PI * this.progress;
    const bend = -this.bend * Math.sin(angle);
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
      position.setZ(i, zs[j] + dipAt(j * step));
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.group.position.z = MathUtils.lerp(this.lift[0], this.lift[1], this.progress);
    // Barely darker while it stands: the colours stay the print's
    const shade = 1 - 0.06 * Math.sin(angle);
    if (this.front instanceof MeshBasicMaterial) this.front.color.setScalar(shade);
    this.back.color.setScalar(shade);
  }
}

/** The pages' edges seen from the side: fine lines, one per few pages (they vary along the texture's height) */
const edgeTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  let state = 354;
  for (let y = 0; y < canvas.height; y++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const light = Math.round(185 + (state / 2147483648) * 70);
    g.fillStyle = `rgb(${light}, ${light}, ${light})`;
    g.fillRect(0, y, canvas.width, 1);
  }
  const texture = canvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
};

export class ScanStage {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(FOV / 2)) * (1 + 2 * OVERSCAN))), 1, 0.1, 20);
  private readonly clock = new Clock(false);
  private readonly phone = new Group();
  private readonly anchor = new Group();
  private readonly placed = new Group();
  private readonly leaves: Leaf[] = [];
  private blocks: { left: Mesh; right: Mesh; spine: Mesh } | null = null;
  /** Reflections for the metal, the gilt edges and the cover's lacquer only – the model is lit as in the reader */
  private readonly environment: Texture;
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
  /** 0 = the autopilot's distance, 1 = steered: nearer the eye */
  private near = 0;
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = SRGBColorSpace;   // no tone mapping: the colours as printed and as modelled
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.inset = `${-OVERSCAN * 100}%`;
    canvas.style.width = canvas.style.height = `${(1 + 2 * OVERSCAN) * 100}%`;
    canvas.style.pointerEvents = "none";               // over the text beside the stage: the stage's box takes the mouse
    container.appendChild(canvas);

    const pmrem = new PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // White light only, bright and even: nothing tints the model or the cover
    this.scene.add(new AmbientLight(0xffffff, LIGHT.ambient));
    const sun = new DirectionalLight(0xffffff, LIGHT.sun);
    sun.position.set(-0.4, -0.5, 1.6);
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
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Building ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * The book, a softcover: its pages as two blocks with gilt edges under the halves (`buildBlocks`), the scene's right
   * page lying on the right one, and over it the leaves that turn – the cover first, then the pages, each the right
   * page of a spread with the next spread's left page on its back; the last one's back is the scene's left page. Cover
   * and pages are the same size and lie flush: the open spread is one picture across the fold.
   */
  private async buildBook() {
    const { aspect } = this.data;
    const page = (map: Texture) => new MeshBasicMaterial({ map, vertexColors: true, toneMapped: false });
    const sheets = await this.extras.sheets.catch(() => ({ cover: null, spread: null, earlier: [] as string[] }));
    const picture = (src: string | null | undefined): Promise<Texture | null> =>
      src ? loadImage(src).then(image => canvasTexture(toCanvas(image))).catch(() => null) : Promise.resolve(null);
    const [laidOut, spreadSheet, earlier, coverImage, endpaper, fallback] = await Promise.all([
      this.paintSpread(),
      picture(sheets.spread),
      Promise.all(sheets.earlier.slice(-PAGES).map(picture)),
      sheets.cover ? loadImage(sheets.cover).catch(() => null) : Promise.resolve(null),
      paintPage(undefined, aspect, -1).then(canvasTexture),
      Promise.all(Array.from({ length: PAGES * 2 }, (_, i) =>
        paintPage(this.extras.pageImages[i], aspect, i % 2 ? -1 : 1).then(canvasTexture))),
    ]);
    // The scene's spread: its layout sheet, else laid out from its targets
    const spread = spreadSheet ?? laidOut;
    // The spreads the turning pages show (nearest last): the layout's before the scene's, else pages with other prints
    const before: Array<Texture | null> = Array.from({ length: PAGES }, (_, i) => earlier[earlier.length - PAGES + i] ?? null);
    const right = page(half(spread, 1));
    this.scene.add(new Leaf(0.5, aspect, right, right.clone(), [0, 0]).group);

    const count = PAGES + 1;
    // On the right the cover lies on top; on the left the last page turned does
    const lift = (i: number): [number, number] => [(count - i) * LIFT, (i + 1) * LIFT];
    const cover = coverImage ? lacquerCover(coverImage, this.environment) : page(canvasTexture(paintCover(this.extras, aspect)));
    this.leaves.push(new Leaf(0.5, aspect, cover, page(endpaper), lift(0), 0.25));
    for (let i = 0; i < PAGES; i++) {
      const current = before[i];
      const next = i === PAGES - 1 ? spread : before[i + 1];
      const front = current ? half(current, 1) : fallback[i * 2];
      const back = next ? half(next, 0, true) : fallback[i * 2 + 1];
      this.leaves.push(new Leaf(0.5, aspect, page(front), page(back), lift(i + 1)));
    }
    this.buildBlocks(aspect);
    this.leaves.forEach(leaf => {
      if (this.still) leaf.turn(1);
      this.scene.add(leaf.group);
    });
    this.thicken();
  }

  /** The pages below the leaves: a block per half with gilt edges, and the spine between them */
  private buildBlocks(aspect: number) {
    const lines = edgeTexture();
    const across = lines.clone();
    across.center.set(0.5, 0.5);
    across.rotation = Math.PI / 2;
    across.needsUpdate = true;
    const gilt = (map: Texture) => new MeshStandardMaterial({ color: "#d9b56a", map, metalness: 1, roughness: 0.36, envMap: this.environment });
    const paper = new MeshBasicMaterial({ color: PAPER, toneMapped: false });
    // A box's faces: ±x (the pages stack along the texture's width there), ±y (along its height), top, bottom
    const faces = [gilt(across), gilt(across), gilt(lines), gilt(lines), paper, paper];
    const block = (side: -1 | 1): Mesh => {
      const mesh = new Mesh(new BoxGeometry(0.5, aspect, 1), faces);
      mesh.position.x = side * 0.25;
      this.scene.add(mesh);
      return mesh;
    };
    const spine = new Mesh(new BoxGeometry(0.004, aspect - 0.002, 1), new MeshBasicMaterial({ color: "#ece8df", toneMapped: false }));
    spine.position.x = -0.002;
    this.scene.add(spine);
    this.blocks = { left: block(-1), right: block(1), spine };
  }

  /** The blocks' thickness from the leaves turned so far: the cover and the pages move from the right block to the left */
  private thicken() {
    if (!this.blocks) return;
    const [cover = 0, ...pages] = this.leaves.map(leaf => leaf.progress);
    const turned = pages.reduce((sum, progress) => sum + progress, 0) / Math.max(1, pages.length);
    const all = BOOK.thickness - 2 * BOOK.cover;
    const left = BOOK.cover * cover + all * BOOK.opened * turned;
    const right = BOOK.cover + all * (1 - BOOK.opened * turned);
    const top = -GUTTER.dip - 0.0006;
    const set = (mesh: Mesh, thickness: number) => {
      mesh.visible = thickness > 0.0003;
      mesh.scale.z = Math.max(thickness, 0.0003);
      mesh.position.z = top - thickness / 2;
    };
    set(this.blocks.left, left);
    set(this.blocks.right, right);
    set(this.blocks.spine, Math.max(left, right));
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
    const metal = new MeshStandardMaterial({ color: "#1c1a18", metalness: 0.85, roughness: 0.3, envMap: this.environment });
    const body = new Mesh(new ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 4, curveSegments: 14 }), metal);
    body.position.z = -depth;
    const ring = roundedRect(width + 0.007, height + 0.007, radius + 0.0035);
    ring.holes.push(roundedRect(width - 0.001, height - 0.001, radius));
    const rim = new Mesh(new ExtrudeGeometry(ring, { depth: depth * 0.7, bevelEnabled: false, curveSegments: 14 }),
      new MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25, envMap: this.environment }));
    rim.position.z = -depth * 0.85;
    const buttons = ([[-1, 0.12, 0.05], [-1, 0.045, 0.05], [1, 0.08, 0.08]] as const).map(([side, y, length]) => {
      const button = new Mesh(new BoxGeometry(0.005, length, depth * 0.5), metal);
      button.position.set(side * (width / 2 + 0.005), y, -depth / 2);
      return button;
    });
    [body, rim, ...buttons].forEach(mesh => (mesh.renderOrder = 3));
    const screenShape = roundedRect(inner.width, inner.height, inner.radius);
    // The screen draws nothing: it marks its pixels (stencil) and clears their depth, so what stands on the page is
    // drawn over the book there as the reader draws it over the camera's picture – also the part sunk into the page
    const screen = new Mesh(new ShapeGeometry(screenShape, 14), new ShaderMaterial({
      vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "void main() { gl_FragColor = vec4(0.0); gl_FragDepth = 1.0; }",
      colorWrite: false, depthTest: true, depthFunc: AlwaysDepth, depthWrite: true,
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
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
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
    const box = this.renderer.domElement.getBoundingClientRect();
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
    this.thicken();
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
      this.near = MathUtils.damp(this.near, this.steering ? 1 : 0, 5, delta);
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
    this.phone.position.copy(onPage).addScaledVector(sight, MathUtils.lerp(PHONE.distance, PHONE.steered, smooth(this.near)));
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
