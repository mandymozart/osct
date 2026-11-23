import {
  AmbientLight, Box3, AnimationMixer, BackSide, BoxGeometry, BufferAttribute, CanvasTexture, Clock,
  DirectionalLight, Euler, ExtrudeGeometry, FrontSide, Group, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster,
  RepeatWrapping, Scene, Shape, ShapeGeometry, SRGBColorSpace, type Texture, TextureLoader, Vector2, Vector3, WebGLRenderer,
  WebGLRenderTarget,
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
 * comes in and scans it: only on its screen – the picture of its own camera, magnified – does the model stand on the page. When the
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
  /** The Mark (the eye) at the top of the phone's screen, as in the app */
  markSrc: string;
}

/**
 * The book's intro (s): it lies there like a picture on the page – its cover seen straight from above – for a moment,
 * the view moves to the stage, the cover opens (already while the view arrives), the pages turn one after the other
 */
const INTRO = { hold: 1.8, move: 1.7, cover: 1.6, page: 0.85, stagger: 0.38, settle: 0.6 };
/** The cover starts to open when the view has come this far */
const COVER_AT = INTRO.hold + INTRO.move * 0.55;
/** A leaf counts as lifted off its block within this share of its turn, and as landed on the other within the same */
const LANDING = 0.15;
const PAGES = 3;
/** The autopilot's loop (s): in from the side, a while on the target, off to the other side, back */
const LOOP_S = 15;
/** A click takes the phone; the mouse rests this long (s), leaves the stage or clicks again: the autopilot takes over */
const IDLE_S = 3.5;
/**
 * The phone (surface widths): its size, its distance from the page point it looks at along the line of sight – and
 * while the visitor steers it, nearer the eye, bigger ("when clicking the phone it comes closer to the cameara")
 */
const PHONE = { width: 0.27, height: 0.56, depth: 0.018, radius: 0.046, bezel: 0.008, distance: 0.6, steered: 1.0, pull: 0.5 };
/** The autopilot aims this much above the target's centre: more of a standing model's upper part is in the screen */
const AIM_UP = 0.12;
/**
 * The book counts as in the phone's sight while the aimed point lies on it or within this margin around it (the
 * screen still shows a part of it): the model stays until the phone is off the book altogether
 */
const SIGHT_MARGIN = 0.2;
/** The phone's camera looks at a point this high above the page: a standing model's top is in the picture */
const LOOK_HEIGHT = 0.16;
/** What stands on the target is seen by the phone's camera only; the phone by the visitor's only */
const MODEL_LAYER = 1;
const PHONE_LAYER = 2;
/** The page's own text, copied into the world for the phone's camera only (`buildPageText`) */
const TEXT_LAYER = 3;
/**
 * The phone's camera: it films from `back` behind the phone on its line of sight (from the phone itself a standing
 * model would fill the picture) with a narrow angle of view – the screen shows the page about 1.25 × larger than the
 * book behind it, a model on it whole; pulled away it sees more of the book. And its picture's width in px.
 */
const PHONE_FOV = 27;
const FILM_BACK = 0.6;
const FEED_WIDTH = 640;
/**
 * Before it scans, the phone lies beside the book, its screen up ("it could lay next to the book and move up from
 * there"): it slides in from the lower right while the pages turn, and rises to the scan within `PHONE_RISE` seconds
 */
const PHONE_REST = { position: new Vector3(0.74, -0.12, -0.03), quaternion: new Quaternion().setFromEuler(new Euler(0, 0, -0.28)) };
const PHONE_ARRIVAL = { before: 1.7, slide: 1.3, from: new Vector3(0.7, -1.1, 0) };
const PHONE_RISE = 1.3;
/**
 * The app's scanning indicator on the screen (agents/DESIGN.md §6, `.gold-scanning`): a thin circle, 62 % of the
 * screen's width, whose gold fades in from transparent and sweeps around once in `turn` seconds
 */
const SCAN = { width: 0.62, turn: 2.4, opacity: 0.9 };
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
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 20);
  /**
   * The section the canvas fills (the landing's hero; else the stage's own box): the picture ends at the section's
   * line and nowhere before ("the 3d scene should end at the section bar, so we wont run into cut of 3d wehn draggin
   * the phone"). The camera frames the stage's box as before – the canvas shows the same view, wider (`fit`).
   */
  private readonly section: HTMLElement;
  private readonly clock = new Clock(false);
  private readonly phone = new Group();
  private readonly anchor = new Group();
  private readonly placed = new Group();
  private readonly leaves: Leaf[] = [];
  private blocks: { left: Mesh; right: Mesh; spine: Mesh } | null = null;
  private readonly phoneCamera = new PerspectiveCamera(PHONE_FOV, 0.5, 0.05, 10);
  private feed: WebGLRenderTarget | null = null;
  private marks: Mesh | null = null;
  private pageText: Mesh | null = null;
  /** How much the phone's camera keeps to the target's middle: 0 held over the book, 1 pulled all the way to the eye */
  private stick = 0;
  /** The middle of what stands on the target (the model's box), in the stage's space */
  private readonly centre = new Vector3(0, 0, LOOK_HEIGHT);
  private textDirty = true;
  /** Reflections for the metal, the gilt edges and the cover's lacquer only – the model is lit as in the reader */
  private readonly environment: Texture;
  private readonly cameraHome = new Vector3(0, -1.55, 1.85);
  private readonly look = new Vector3(0.02, 0.02, 0);
  /** The picture view: straight down onto the closed book's cover (it lies on the right half), upright */
  private readonly pictureView = { position: new Vector3(0.25, 0, 2.15), look: new Vector3(0.25, 0, 0), up: new Vector3(0, 1, 0) };
  private readonly stageUp = new Vector3(0, 0, 1);
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
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;opacity:0;transition:opacity .7s ease";
    this.section = container.closest<HTMLElement>(".hero") ?? container;
    this.section.appendChild(canvas);

    const pmrem = new PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // White light only, bright and even: nothing tints the model or the cover
    const ambient = new AmbientLight(0xffffff, LIGHT.ambient);
    const sun = new DirectionalLight(0xffffff, LIGHT.sun);
    sun.position.set(-0.4, -0.5, 1.6);
    // The lights shine for every camera, whichever layers it films
    ambient.layers.enableAll();
    sun.layers.enableAll();
    this.scene.add(ambient, sun);
    this.camera.layers.enable(PHONE_LAYER);

    this.view(this.still ? 1 : 0);
    this.placed.visible = false;
    this.anchor.add(this.placed);
    this.scene.add(this.anchor);
    this.buildPhone();

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.resize.observe(this.section);
    this.visibility = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      if (this.visible) this.start();
    });
    this.visibility.observe(container);
    this.section.addEventListener("pointerdown", this.handleClick);
    this.section.addEventListener("pointermove", this.handlePointer);
    this.section.addEventListener("pointerleave", this.handleLeave);
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
    this.anchor.updateWorldMatrix(true, true);
    new Box3().setFromObject(this.placed).getCenter(this.centre);
    if (loaded.animations.length) {
      this.mixer = new AnimationMixer(model);
      loaded.animations.forEach(clip => this.mixer!.clipAction(clip).play());
    }
    void document.fonts?.ready.then(() => (this.textDirty = true));
    this.clock.start();
    this.start();
    this.renderer.domElement.style.opacity = "1";
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.celebration?.finish();
    this.resize.disconnect();
    this.visibility.disconnect();
    this.section.removeEventListener("pointerdown", this.handleClick);
    this.section.removeEventListener("pointermove", this.handlePointer);
    this.section.removeEventListener("pointerleave", this.handleLeave);
    this.section.style.cursor = "";
    this.section.style.userSelect = "";
    disposeObject(this.scene);
    this.environment.dispose();
    this.feed?.dispose();
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
    // A leaf in the air belongs to neither block: nothing appears on the left before it lands there
    const share = (pick: (progress: number) => number): number => {
      const pages = this.leaves.slice(1).map(leaf => pick(leaf.progress));
      return pages.reduce((sum, value) => sum + value, 0) / Math.max(1, pages.length);
    };
    const all = BOOK.thickness - 2 * BOOK.cover;
    const left = all * BOOK.opened * share(progress => smooth((progress - 1 + LANDING) / LANDING));
    const right = BOOK.cover + all * (1 - BOOK.opened * share(progress => smooth(progress / LANDING)));
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

  /**
   * The phone: a graphite body with a gold rim and side buttons. Its screen shows what its own camera films
   * (`film`): the book below it, magnified, with what stands on the page drawn over it – as the reader draws it over
   * the camera's picture. On the screen as in the app: the Mark at the top, the app's scanning indicator while it
   * searches (gone once the book is in sight), a sheen of glass.
   */
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
    // The screen's shape with uv over its box (a ShapeGeometry's uv are its positions)
    const screenGeometry = () => {
      const geometry = new ShapeGeometry(roundedRect(inner.width, inner.height, inner.radius), 14);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / inner.width + 0.5, uv.getY(i) / inner.height + 0.5);
      return geometry;
    };
    this.feed = new WebGLRenderTarget(FEED_WIDTH, Math.round(FEED_WIDTH * (inner.height / inner.width)), { samples: 4 });
    this.phoneCamera.aspect = inner.width / inner.height;
    this.phoneCamera.updateProjectionMatrix();
    const screen = new Mesh(screenGeometry(), new MeshBasicMaterial({ map: this.feed.texture, toneMapped: false }));
    const overlay = (geometry: ShapeGeometry | PlaneGeometry, material: MeshBasicMaterial): Mesh => {
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 5;
      mesh.position.z = 0.001;
      return mesh;
    };
    const glass = overlay(screenGeometry(), new MeshBasicMaterial({ map: this.glassTexture() }));
    const scanning = overlay(new PlaneGeometry(inner.width * SCAN.width, inner.width * SCAN.width), new MeshBasicMaterial({ map: this.scanningTexture(), opacity: 0 }));
    this.marks = scanning;
    this.phone.add(body, rim, ...buttons, screen, glass, scanning);
    // The Mark at the top of the screen, as in the app
    void new TextureLoader().setCrossOrigin("anonymous").loadAsync(this.extras.markSrc).then(texture => {
      texture.colorSpace = SRGBColorSpace;
      const image = texture.image as { width: number; height: number };
      const markWidth = inner.width * 0.36;
      const mark = overlay(new PlaneGeometry(markWidth, markWidth * (image.height / Math.max(1, image.width))), new MeshBasicMaterial({ map: texture, toneMapped: false }));
      mark.position.y = inner.height / 2 - 0.05;
      mark.layers.set(PHONE_LAYER);
      this.phone.add(mark);
    }).catch(() => undefined);
    this.phone.traverse(object => object.layers.set(PHONE_LAYER));
    this.phone.visible = false;
    this.scene.add(this.phone);
  }

  /** The app's scanning indicator as a picture: the ring with its conic gold, transparent for the first 45 % */
  private scanningTexture(): CanvasTexture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!;
    const tokens = getComputedStyle(document.documentElement);
    const gold = (name: string, fallback: string) => tokens.getPropertyValue(name).trim() || fallback;
    // `conic-gradient(from 0deg …)` starts at the top; the canvas' at 3 o'clock
    const gradient = g.createConicGradient(-Math.PI / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(245, 231, 200, 0)");
    gradient.addColorStop(0.45, "rgba(245, 231, 200, 0)");
    gradient.addColorStop(0.75, gold("--gold-2", "#b8914a"));
    gradient.addColorStop(0.9, gold("--gold-3", "#e8cf96"));
    gradient.addColorStop(1, gold("--gold-1", "#f3dfb0"));
    g.strokeStyle = gradient;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    g.stroke();
    return canvasTexture(canvas);
  }

  /**
   * The page's text beside the stage, for the phone's camera only ("can it also magnify the text on the left from the
   * page"): the words of the hero's text block drawn into a picture where the page shows them, and that picture laid
   * on a plane below the book so that it lies exactly behind the real text as the visitor sees it. The phone held over
   * the title films it like the book – magnified. Rebuilt when the layout changes (`fit`) and once the fonts are there.
   */
  private buildPageText() {
    this.textDirty = false;
    if (this.pageText) {
      this.scene.remove(this.pageText);
      disposeObject(this.pageText);
      this.pageText = null;
    }
    const block = this.section.querySelector<HTMLElement>(".intro-block");
    const all = this.renderer.domElement.getBoundingClientRect();
    const box = block?.getBoundingClientRect();
    if (!block || !box || !box.width || !box.height || !all.width) return;
    const scale = Math.min(devicePixelRatio, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(box.width * scale);
    canvas.height = Math.ceil(box.height * scale);
    const g = canvas.getContext("2d")!;
    g.scale(scale, scale);
    g.textBaseline = "alphabetic";
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = node.textContent ?? "";
      if (!parent || !text.trim()) continue;
      const style = getComputedStyle(parent);
      g.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
      const golden = parent.closest<HTMLElement>(".gold");
      if (golden) {
        // The gold gradient of the design (agents/DESIGN.md) across the element
        const rect = golden.getBoundingClientRect();
        const gradient = g.createLinearGradient(rect.left - box.left, 0, rect.right - box.left, 0);
        gradient.addColorStop(0, "#f3dfb0");
        gradient.addColorStop(0.45, "#b8914a");
        gradient.addColorStop(1, "#e8cf96");
        g.fillStyle = gradient;
      } else {
        g.fillStyle = style.color;
      }
      const upper = style.textTransform === "uppercase";
      const ascent = g.measureText("M").fontBoundingBoxAscent;
      for (const word of text.matchAll(/\S+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const rect = range.getClientRects()[0];
        if (rect) g.fillText(upper ? word[0].toUpperCase() : word[0], rect.left - box.left, rect.top - box.top + ascent);
      }
    }
    // The plane: a grid whose points lie where the visitor's eye sees the block's points, on a level below the book
    const level = new Plane(new Vector3(0, 0, 1), BOOK.thickness + 0.02);
    const columns = 16;
    const rows = 16;
    const geometry = new PlaneGeometry(1, 1, columns, rows);
    const position = geometry.attributes.position;
    const point = new Vector3();
    for (let i = 0; i < position.count; i++) {
      const u = (i % (columns + 1)) / columns;
      const v = Math.floor(i / (columns + 1)) / rows;   // from the top row down
      const x = box.left + u * box.width;
      const y = box.top + v * box.height;
      this.raycaster.setFromCamera(new Vector2(((x - all.left) / all.width) * 2 - 1, -((y - all.top) / all.height) * 2 + 1), this.camera);
      if (!this.raycaster.ray.intersectPlane(level, point)) return;
      position.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, toneMapped: false }));
    mesh.layers.set(TEXT_LAYER);
    mesh.frustumCulled = false;
    this.pageText = mesh;
    this.scene.add(mesh);
  }

  /**
   * The phone's camera films the page it is held over into the screen's picture: first the book, then – over it,
   * whatever the page hides – what stands on the target (the model and what its looks add)
   */
  private film(onPage: Vector3) {
    if (!this.feed) return;
    this.phone.updateMatrixWorld();
    this.phoneCamera.position.copy(this.phone.position).sub(onPage).normalize().multiplyScalar(FILM_BACK).add(this.phone.position);
    this.phoneCamera.up.set(0, 1, 0).transformDirection(this.phone.matrixWorld);
    // Pulled to the eye, its picture keeps to the middle of what stands on the target ("the viewport target should
    // stick to the center of the sculpture"); held over the book it looks where it is held
    this.phoneCamera.lookAt(new Vector3(onPage.x, onPage.y, LOOK_HEIGHT).lerp(this.centre, this.stick));
    this.anchor.traverse(object => object.layers.set(MODEL_LAYER));
    const renderer = this.renderer;
    renderer.setRenderTarget(this.feed);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.autoClear = false;
    if (this.textDirty) this.buildPageText();
    this.phoneCamera.layers.set(0);
    this.phoneCamera.layers.enable(TEXT_LAYER);
    renderer.render(this.scene, this.phoneCamera);
    renderer.clearDepth();
    this.phoneCamera.layers.set(MODEL_LAYER);
    renderer.render(this.scene, this.phoneCamera);
    renderer.autoClear = true;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
  }

  /** While it searches, the scanning indicator turns; with the book in sight it is gone */
  private animateMarks(seconds: number, delta: number) {
    if (!this.marks) return;
    const material = this.marks.material as MeshBasicMaterial;
    const searching = !this.inView && (this.still || this.clock.elapsedTime >= this.introEnd + PHONE_RISE * 0.5);
    material.opacity = MathUtils.damp(material.opacity, searching ? SCAN.opacity : 0, 6, delta);
    this.marks.rotation.z = this.still ? 0 : -(seconds / SCAN.turn) * Math.PI * 2;
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

  // ── Running ──────────────────────────────────────────────────────────────────────────────────────

  private fit() {
    const all = this.section.getBoundingClientRect();
    const box = this.container.getBoundingClientRect();
    if (!all.width || !all.height || !box.width || !box.height) return;
    this.renderer.setSize(all.width, all.height, false);
    // The camera's own picture is the stage's box; the canvas shows the section around it
    this.camera.aspect = box.width / box.height;
    this.camera.setViewOffset(box.width, box.height, all.left - box.left, all.top - box.top, all.width, all.height);
    this.textDirty = true;
    if (!this.clock.running) this.renderer.render(this.scene, this.camera);
  }

  /** A click takes the phone (it goes to the page point under the mouse) – or, while steering, gives it back */
  private handleClick = (event: PointerEvent) => {
    if (!this.clock.running || this.clock.elapsedTime < this.introEnd) return;
    // Taken by a click on the stage, followed over the whole section, given back by a click anywhere in it
    if (!this.steering && !event.composedPath().includes(this.container)) return;
    event.preventDefault();   // no text selection starts with the click that takes or gives back the phone
    getSelection()?.removeAllRanges();
    this.steer(!this.steering);
    if (this.steering) this.handlePointer(event);
  };

  private steer(on: boolean) {
    this.steering = on;
    if (!on) this.mouse = null;
    this.section.style.cursor = on ? "none" : "";
    this.section.style.userSelect = on ? "none" : "";   // steering over the title never marks its text
  }

  /** While steering: the page point under the mouse is where the phone looks */
  private handlePointer = (event: PointerEvent) => {
    if (!this.steering) return;
    const box = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.page, new Vector3());
    if (!hit) return;
    this.mouse = new Vector2(MathUtils.clamp(hit.x, -1.6, 1.6), MathUtils.clamp(hit.y, -1.1, 1.1));
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
    return COVER_AT + INTRO.cover + INTRO.stagger * (PAGES - 1) + INTRO.page + INTRO.settle;
  }

  /** The camera between the picture view (0) and the stage's (1) */
  private view(t: number) {
    const k = smooth(t);
    this.camera.position.lerpVectors(this.pictureView.position, this.cameraHome, k);
    this.camera.up.lerpVectors(this.pictureView.up, this.stageUp, k).normalize();
    this.camera.lookAt(new Vector3().lerpVectors(this.pictureView.look, this.look, k));
  }

  /** The book opens: the cover, then the pages one after the other; the camera comes down meanwhile */
  private playIntro(seconds: number) {
    this.leaves.forEach((leaf, i) => {
      const start = i === 0 ? COVER_AT : COVER_AT + INTRO.cover * 0.7 + (i - 1) * INTRO.stagger;
      leaf.turn((seconds - start) / (i === 0 ? INTRO.cover : INTRO.page));
    });
    this.thicken();
    this.view((seconds - INTRO.hold) / INTRO.move);
  }

  /** The autopilot's page point over one loop: in from the side onto the target, a while there, off, back */
  private autopilot(seconds: number): Vector2 {
    const hold = new Vector2(this.target.x + Math.sin(seconds * 1.3) * 0.006, this.target.y + AIM_UP + Math.sin(seconds * 0.9) * 0.005);
    // Off the book on either side, so the model leaves and is found again
    const side = new Vector2(0.98, this.target.y - 0.12);
    const away = new Vector2(-0.98, this.target.y + 0.2);
    const u = (seconds % LOOP_S) / LOOP_S;
    if (u < 0.15) return side.lerp(hold, smooth(u / 0.15));
    if (u < 0.66) return hold;
    if (u < 0.82) return hold.lerp(away, smooth((u - 0.66) / 0.16));
    return away.lerp(side, smooth((u - 0.82) / 0.18));
  }

  private render(delta: number) {
    const seconds = this.still ? this.introEnd + LOOP_S * 0.4 : this.clock.elapsedTime;
    if (!this.still) this.playIntro(seconds);
    const scanning = seconds >= this.introEnd;
    // While the pages turn, the phone slides in from the lower right and lies beside the book
    const arrival = (seconds - (this.introEnd - PHONE_ARRIVAL.before)) / PHONE_ARRIVAL.slide;
    this.phone.visible = arrival > 0;
    if (!scanning && arrival > 0) {
      this.phone.position.copy(PHONE_REST.position).addScaledVector(PHONE_ARRIVAL.from, 1 - smooth(arrival));
      this.phone.quaternion.copy(PHONE_REST.quaternion);
    }
    let onPage: Vector3 | null = null;
    if (scanning) {
      if (this.steering && seconds - this.mouseAt > IDLE_S) this.steer(false);
      const following = this.steering && this.mouse !== null;
      const wanted = following ? this.mouse! : this.autopilot(seconds - this.introEnd);
      if (this.still) this.aim.copy(wanted);
      else this.aim.lerp(wanted, 1 - Math.exp(-(following ? 7 : 3) * delta));
      this.near = MathUtils.damp(this.near, this.steering ? 1 : 0, 5, delta);
      onPage = this.placePhone(seconds);
      this.scan();
    }
    if (this.celebration && !this.celebration.update(delta)) {
      if (this.celebration.kind === "lost") this.placed.visible = false;
      this.celebration = null;
    }
    this.animateMarks(seconds, delta);
    this.mixer?.update(delta);
    if (onPage) this.film(onPage);
    this.renderer.render(this.scene, this.camera);
  }

  /** The phone between the eye and the page point it looks at, held over the book rather than flat to the viewer */
  private placePhone(seconds: number): Vector3 {
    const onPage = new Vector3(this.aim.x, this.aim.y, 0);
    const sight = this.camera.position.clone().sub(onPage).normalize();
    // Steered, it is held nearer – and dragged down, towards the visitor, it comes up to the eye ("its more a pulling
    // it closer to our eyes")
    const pull = MathUtils.clamp((0.1 - this.aim.y) / 0.9, 0, 1) * PHONE.pull;
    this.phone.position.copy(onPage).addScaledVector(sight, MathUtils.lerp(PHONE.distance, PHONE.steered + pull, smooth(this.near)));
    this.phone.up.set(0, 0, 1);
    this.phone.lookAt(this.camera.position);
    // Held over the book its top leans away; pulled to the eye, its top comes towards the visitor
    const toEye = smooth(Math.min(1, (pull / PHONE.pull) * 1.6)) * smooth(this.near);
    // Held far off the book – beyond its top or its sides – the camera turns back to what stands on it as well
    const off = Math.max((this.aim.y - 0.12) / 0.45, (Math.abs(this.aim.x) - 0.3) / 0.45);
    this.stick = Math.max(toEye, smooth(off) * smooth(this.near));
    // Its back keeps towards what its camera looks at: dragged to a side, it turns towards the focus
    const aside = (MathUtils.lerp(this.aim.x, this.centre.x, this.stick) - this.aim.x) * 0.8;
    this.phone.rotateY(-MathUtils.clamp(aside, -0.6, 0.6));
    this.phone.rotateX(-0.4 + 0.8 * toEye);
    this.phone.rotateZ(Math.sin(seconds * 0.5) * 0.035);
    // It comes up from where it lay beside the book
    const rise = this.still ? 1 : smooth((seconds - this.introEnd) / PHONE_RISE);
    if (rise < 1) {
      this.phone.position.lerpVectors(PHONE_REST.position, this.phone.position, rise);
      this.phone.quaternion.slerpQuaternions(PHONE_REST.quaternion, this.phone.quaternion, rise);
    }
    return onPage;
  }

  /** The target comes into the screen or leaves it: the experience's look for the moment, as the reader plays it */
  private scan() {
    // Where the phone's camera looks: where it is held, or – pulled to the eye – the middle of the target (`film`)
    const x = MathUtils.lerp(this.aim.x, this.centre.x, this.stick);
    const y = MathUtils.lerp(this.aim.y, this.centre.y, this.stick);
    const inView = Math.abs(x) < 0.5 + SIGHT_MARGIN && Math.abs(y) < this.data.aspect / 2 + SIGHT_MARGIN;
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
}
