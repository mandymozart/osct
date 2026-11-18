import {
  AddEquation, CustomBlending, NormalBlending, OneFactor, OneMinusDstAlphaFactor,
  BoxGeometry, CanvasTexture, EquirectangularReflectionMapping, Group, Light, LineBasicMaterial, LineSegments, BufferGeometry, Float32BufferAttribute, type Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D,
  PlaneGeometry, type Raycaster, RepeatWrapping, type Scene, SphereGeometry, SRGBColorSpace, type Texture, TextureLoader, UVMapping, Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { BACKDROP_LAYER } from "@engine/scene/view";
import type { PageFormat, StageBook, StageSheet, StageSurface, StageTarget, StageView } from "./mock-tracker";
import { frameFor, printedHeight } from "./placement";
import { DEFAULT_PAGE_MM } from "./stage-layout";
import { frameBox, gridAreas, gridLines, type OriginFrame, type OriginId } from "./origin";
import { fitImage, hitSurfaces, sceneSurfaces, surfaceFrame, surfaceRects, toStage, type SurfaceFrame, type SurfaceReference, type V3 } from "./surfaces";
import { linoleumTexture } from "./linoleum";
import { oakTexture } from "./oak";
import { plywoodEdgeTexture } from "./plywood";
import { applyShading, ownMaterial } from "./shading";
import type { HdriId, ShadingMode, TopId } from "./preview";
import { stageLook, type StageLook } from "./sky";

/**
 * A plane sits a hair below the one above it, so nothing flickers: the entities' plane is the target's (z = 0, as
 * the tracker reports it), the printed image lies one layer under it, the sheet's image another, the paper block
 * under that. Half a millimetre is invisible at a reading distance and enough for the depth buffer.
 */
const LAYER = 0.0005;
/**
 * Colours. The Eiermann desk's top is a screen-printed plywood board (Siebdruckplatte): Poly Haven's plywood texture
 * tinted to the dark phenolic brown on the faces, roughness from its map; its cut edges show the plywood's plies
 * (`plywood.ts`, drawn in code), untinted and matt. The linoleum top (#226, once Schöpfer's – #187) is blue-grey
 * linoleum (`linoleum.ts`) on an oak-faced plywood board: its cut edges show the same plies tinted to oak, its underside
 * the oak veneer (`oak.ts`) – all drawn in code, matt. The cover is a white hardcover board.
 */
const DESK_TINT = 0x3b2416;
const DESK_EDGE_TINT = 0xc8c8c8;
const OAK_EDGE_TINT = 0xe8c290;
const DESK_EDGE_ROUGHNESS = 0.8;
const LINOLEUM_ROUGHNESS = 0.85;
const OAK_ROUGHNESS = 0.65;
/**
 * The plies in one stack of the edges' texture: both tops' boards are 18 mm plywood – 13 plies of about 1.4 mm, as the
 * trade's 18 mm birch plywood. Each board's edge is one stack (the model's UVs)
 */
const DESK_EDGE_PLIES = 13;
const PAGE_COLOR = 0xf3efe6;
const PAGE_EDGE_COLOR = 0xe6e1d6;
const SPINE_COLOR = 0xd8d2c4;
const COVER_COLOR = 0xf2efe9;
/** The book as an object (metres): a sheet's thickness, the block's bounds, the cover's board and its overhang */
const SHEET_THICKNESS = 0.00015;
const BLOCK_MIN = 0.003;
const BLOCK_MAX = 0.04;
const COVER_THICKNESS = 0.001;
const COVER_OVERHANG = 0;
/**
 * The cover's edge: a paper texture drawn in code (fine fibre lines, a seeded sequence so every build is the same),
 * so no image file and no licence. Null when the browser gives no 2D canvas – the edge then keeps its flat colour.
 */
function coverEdgeTexture(): CanvasTexture | null {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = `#${PAGE_EDGE_COLOR.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < size; y++) {
    ctx.globalAlpha = 0.04 + random() * 0.12;
    ctx.fillStyle = random() < 0.5 ? "#8a8270" : "#ffffff";
    ctx.fillRect(0, y, size, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
/**
 * The fold of an open book (#250): the paper curving into the spine, drawn over the double page's middle – a shadow
 * that is darkest at the spine and fades out towards both pages. The page images carry none: they are the flat pages.
 */
const FOLD_WIDTH_MM = 36;
const FOLD_DARKNESS = 0.22;
function foldTexture(): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  // Steeper close to the spine, as the page bends away there
  [[0, 0], [0.3, 0.12], [0.44, 0.45], [0.5, 1], [0.56, 0.45], [0.7, 0.12], [1, 0]].forEach(([at, alpha]) =>
    gradient.addColorStop(at, `rgba(40, 32, 20, ${alpha * FOLD_DARKNESS})`));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
/**
 * The desk (#226): the Eiermann frame, 72 cm high, with two tops of the same 1.8 × 0.8 m and the same surface height,
 * one model with a mesh per top (`TOP_NODES`) – loaded once, the top not chosen hidden, so a switch moves nothing
 * (our own low-poly model, built by `editor/tools/desk-eiermann.py` – `editor/static/models/README.md`). Its origin is
 * the centre of the tops' upper surface; the materials with a drawn look become the stage's own – the plywood top's
 * `top` (the screen-printed plywood, see below) and `edge` (its plies), the linoleum top's `linoleum`, `oak_edge` (the
 * plies in oak) and `oak` – while `steel` stays as exported. glTF is Y up: the model is turned so its up is the page's +z.
 */
const DESK_MODEL = "models/desk-eiermann.glb";
const TOP_NODES: Readonly<Record<TopId, string>> = { plywood: "TopEiermann", linoleum: "TopLinoleum" };
/** The desk texture's files and how often it repeats across the top (the edges have their own texture and UVs) */
const DESK_DIFFUSE = "textures/plywood_diff_1k.jpg";
const DESK_ROUGHNESS = "textures/plywood_rough_1k.jpg";
const DESK_REPEAT = [3, 2] as const;
/**
 * The HDRIs are not tone mapped (the reader's videos and images must keep their colours), so each is shown and used
 * as light at an exposure that keeps the page white, not blown out; the scene's own lights step back meanwhile.
 */
const HDRI_EXPOSURE: Record<string, number> = { ferndale_studio_04: 0.9 };
const HDRI_EXPOSURE_DEFAULT = 0.4;
const LIGHTS_WITH_HDRI = 0.35;
/** The sky sphere's radius (metres) – far beyond the table, near enough for the depth buffer */
const SKY_RADIUS = 30;
/**
 * The sky sphere behind the environment's world (#185): the world's pass is drawn first and leaves its camera window
 * transparent (alpha 0, premultiplied soft edges), so the sphere adds itself only where the frame is not yet covered –
 * `(1 − destination alpha) · sky + frame` – and fills the window as a stand-in for the reader's camera picture. Off: the
 * sphere draws normally (the HDRI as the sky).
 */
export const behindWorld = (material: Material, on: boolean): void => {
  material.blending = on ? CustomBlending : NormalBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = OneMinusDstAlphaFactor;
  material.blendDst = OneFactor;
  material.blendSrcAlpha = OneMinusDstAlphaFactor;
  material.blendDstAlpha = OneFactor;
};
/** The ghost's corner handle (mm) */
const GHOST_HANDLE = 8;
/** The sharper sheet image is fetched once the camera is this close to the page (mm) */
const SHARP_DISTANCE_MM = 500;
const GRID_COLOR = 0x2d7ff9;
const GRID_ZERO_COLOR = 0xe5484d;
/** The vertical axis: the height's line through the origin, in the 3D tools' colour for the up axis, this tall (mm) */
const GRID_AXIS_COLOR = 0x30a46c;
const GRID_AXIS_MM = 150;
/** A snap guide: the line a drag snapped to, across the spread and this far beyond it (mm) */
const GUIDE_COLOR = 0xd23cf0;
const GUIDE_OVERHANG_MM = 20;

/** The scene's axes at its origin (#314): x red, y (up) green, z (towards the reader) blue, as 3D tools draw them (mm long) */
const AXIS_X_COLOR = 0xe5484d;
const AXIS_Z_COLOR = 0x2d7ff9;
const SCENE_AXIS_MM = 100;
/** The scene grid on the table (#314): faint, every few grid steps, over the desk's top (mm) */
const SCENE_GRID_COLOR = 0x9aa4b2;
const SCENE_GRID_EXTENT_MM = { x: 900, y: 400 };
/** A free scene's surface is a board this thick (m), lying behind its face */
const BOARD_THICKNESS = 0.0015;
/**
 * The surfaces' outlines (#314, the Surface mode): all surfaces grey, the hovered one lighter, the highlighted (selected)
 * one white with a black line inside – the editor is monochrome (RULES #38)
 */
const SURFACE_OUTLINE_COLOR = 0x8c8c8c;
const SURFACE_HOVER_COLOR = 0xc8c8c8;
const SURFACE_HIGHLIGHT_COLOR = 0xffffff;
const SURFACE_HIGHLIGHT_INNER_COLOR = 0x111111;

/** Lays a plane (its face +z) on a surface: centred at (x, y) mm of the surface, `lift` m off its face, turned with it */
const layOnSurface = (object: Object3D, frame: SurfaceFrame, x: number, y: number, lift: number): void => {
  const at = toStage(frame, x, y, lift * 1000);
  object.position.set(at[0] / 1000, at[1] / 1000, at[2] / 1000);
  object.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(vec(frame.right), vec([-frame.down[0], -frame.down[1], -frame.down[2]]), vec(frame.normal)));
};
const vec = (v: V3): Vector3 => new Vector3(v[0], v[1], v[2]);

/** Frees and removes a group's lines (the grid, the guides) */
const clearLines = (group: Group): void => {
  group.children.forEach(child => {
    if (child instanceof LineSegments) {
      child.geometry.dispose();
      (child.material as Material).dispose();
    }
  });
  group.clear();
};

/**
 * Adds line segments (pairs of points, stage metres) to a group, drawn over what lies under them without hiding it;
 * `throughAll` draws them through everything (the guides, which an entity must not cover)
 */
const addLines = (group: Group, positions: number[], color: number, opacity: number, throughAll = false): void => {
  if (!positions.length) return;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: !throughAll }));
  if (throughAll) lines.renderOrder = 1;
  group.add(lines);
};

/** The Eiermann top's plywood faces, repeated over the top */
interface DeskTextures {
  map: Texture;
  roughnessMap: Texture;
}

/**
 * The mock stage: what the camera would show – a desk, the open book in its page format (the sheet as laid out when
 * the content has the book's layout, blank pages otherwise), the current spread's printed images where they are
 * printed (or in a row), all in the same three.js scene as the entities, moved as one group by the tracker's camera
 * (the three.js camera stays at the origin, as in AR). The sky and the light (`sky.ts`, #185): the chosen HDRI while the
 * shading is rendered, the scene's own lights otherwise – and while the book's environment is drawn under the stage,
 * its world as the sky and the scene's own lights, as in the reader. The desk keeps its own materials under every viewport shading
 * (`shading.ts` applies to the entities), like the gizmo and the outlines.
 */
export class MockStage implements StageView {
  private group = new Group();
  /** The desk (the model, once loaded): its origin is the tops' surface, placed at the table height */
  private table = new Group();
  /** The chosen top: its mesh shows, the other's is hidden */
  private topId: TopId = "plywood";
  private model: Group | null = null;
  private topMaterial = new MeshStandardMaterial({ color: DESK_TINT, roughness: 0.5 });
  private edgeMaterial = new MeshStandardMaterial({ color: DESK_EDGE_TINT, roughness: DESK_EDGE_ROUGHNESS });
  /** The linoleum top's surfaces: their drawn textures are put on when the top is first shown */
  private linoleumMaterial = new MeshStandardMaterial({ roughness: LINOLEUM_ROUGHNESS });
  private oakEdgeMaterial = new MeshStandardMaterial({ color: OAK_EDGE_TINT, roughness: DESK_EDGE_ROUGHNESS });
  private oakMaterial = new MeshStandardMaterial({ roughness: OAK_ROUGHNESS });
  /** The desk's materials that are the stage's own, by the model's material names (shared, disposed apart) */
  private deskMaterials = new Map<string, MeshStandardMaterial>([
    ["top", this.topMaterial],
    ["edge", this.edgeMaterial],
    ["linoleum", this.linoleumMaterial],
    ["oak_edge", this.oakEdgeMaterial],
    ["oak", this.oakMaterial],
  ]);
  /** The tops whose look their materials show (each put on once, when the top is first chosen) */
  private looks = new Set<TopId>();
  private disposed = false;
  private book = new Group();
  private pages = new Group();
  private textures: Texture[] = [];
  private loader = new TextureLoader();
  private layoutRun = 0;
  private desk: DeskTextures | null = null;
  /** The drawn textures, each drawn once on first use: the boards' plies (both tops), the linoleum and the oak */
  private plies: Texture | null = null;
  private linoleum: Texture | null = null;
  private oak: Texture | null = null;
  /** The page format of the last layout (the ghost is placed on it) */
  private page: PageFormat = { ...DEFAULT_PAGE_MM };
  /** What the current spread is: the open book, or the closed book seen from the front or the back */
  private format: StageBook["format"] = "spread";
  /** The scene's surfaces in the stage frame (mm, #314): the prints lie on them, the hits find them */
  private frames: SurfaceFrame[] = this.legacyFrames();
  /** The scene's axes at its origin and its grid on the table (#314) */
  private sceneGridGroup = new Group();
  /** The surfaces outlined or highlighted (the Surface mode) */
  private marksGroup = new Group();
  private marks: { outlined: string[]; highlighted: string | null } = { outlined: [], highlighted: null };
  /** Where the table's top lies (m, the stage frame's z) – the scene grid lies on it */
  private tableTop = -BLOCK_MIN - COVER_THICKNESS - 4 * LAYER;
  private ghostGroup = new Group();
  private gridGroup = new Group();
  private grid = { on: false, mm: 10, origin: "top-left" as OriginId, axis: true };
  /** The snap guides of the drag going on */
  private guideGroup = new Group();
  /** The current sheet's page plane and its sharper image, fetched on demand (see `setDetail`) */
  private sheetPaper: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private sharpSource: string | null = null;
  private sharpRequested = false;
  private ghostTextures = new Map<string, Texture>();
  /** Every printed image's height per width by its source, once loaded (the ghost and a moved print know it at once) */
  private aspects = new Map<string, number>();
  private hdris = new Map<string, Texture>();
  private wantedHdri: string | null = null;
  /** The sky: the HDRI on a sphere inside the stage's group, so it turns with the stage by construction */
  private sky: Mesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private shading: ShadingMode = "rendered";
  private hdri: HdriId | null = null;
  /** The book's environment is drawn under the stage (the engine's look-around world): it replaces the HDRI (#185) */
  private world = false;

  /** The environment's world is drawn under the stage (true) or not: the HDRI steps aside – sky and light – while it is */
  setWorld(world: boolean): void {
    if (this.world === world) return;
    this.world = world;
    this.setHdri(this.hdri);
  }

  /** Which sky and which light now (`sky.ts`) */
  private look(): StageLook {
    return stageLook({ shading: this.shading, hdri: this.hdri, world: this.world });
  }

  /** The viewport's shading: the sky and the HDRI's light belong to "rendered" only; wireframe and solid reach the book and the desk too (#137) */
  setShading(mode: ShadingMode): void {
    if (this.shading === mode) return;
    this.shading = mode;
    this.setHdri(this.hdri);
    this.shadeStage();
  }

  /** The current shading on the desk, the book and the pages – not the ghost, the grid or the sky */
  private shadeStage(): void {
    applyShading([this.table, this.book, this.pages], this.shading);
  }
  /** The scene's own lights at their intensity before the HDRI dimmed them */
  private dimmed = new Map<Light, number>();

  /** `assetUrl`: where the editor's static files live (`hdri/…`, `textures/…`) */
  constructor(private scene: Scene, private assetUrl: (path: string) => string = path => `/${path}`) {
    this.group.name = "mock-stage";
    this.group.matrixAutoUpdate = false;
    this.table.name = "mock-desk";
    this.table.position.z = -BLOCK_MIN - COVER_THICKNESS - 6 * LAYER;
    this.ghostGroup.name = "mock-ghost";
    this.gridGroup.name = "mock-grid";
    this.guideGroup.name = "mock-guides";
    this.sceneGridGroup.name = "mock-scene-grid";
    this.marksGroup.name = "mock-surface-marks";
    this.group.add(this.table, this.book, this.pages, this.gridGroup, this.sceneGridGroup, this.marksGroup, this.guideGroup, this.ghostGroup);
    scene.add(this.group);
    this.loadDesk();
  }

  /** The desk's top (#226): only the top switches – the frame, the size and the height stay, so nothing else moves */
  setTop(top: TopId): void {
    if (this.topId === top && this.looks.has(top)) return;
    this.topId = top;
    this.showTop();
    this.applyTopLook(top);
  }

  /** The desk's model, loaded once into the desk's group: the frame and both tops, the chosen one shown */
  private loadDesk(): void {
    new GLTFLoader().load(this.assetUrl(DESK_MODEL), gltf => {
      const model = gltf.scene;
      if (this.disposed) {
        this.clear(model);
        return;
      }
      model.rotation.x = Math.PI / 2; // glTF's +y (up) becomes the page's +z
      // The surfaces with a drawn look become the stage's own; the frame keeps the file's steel
      model.traverse(object => {
        if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
        const material = object.material as Material;
        const own = this.deskMaterials.get(material.name);
        if (!own) return;
        material.dispose();
        object.material = own;
      });
      this.model = model;
      this.table.add(model);
      this.showTop();
      this.toBackdropLayer();
    }, undefined, error => {
      console.warn("[mock-stage] the desk could not be loaded:", error);
    });
  }

  /** Shows the chosen top's mesh and hides the other's (nothing before the model is loaded) */
  private showTop(): void {
    if (!this.model) return;
    for (const [id, name] of Object.entries(TOP_NODES)) {
      const node = this.model.getObjectByName(name);
      if (node) node.visible = id === this.topId;
    }
  }

  /**
   * A top's look, its textures loaded or drawn on first use: the screen-printed plywood with the plies on its edges, or
   * the linoleum with the same plies in oak on its edges and the oak veneer underneath
   */
  private applyTopLook(id: TopId): void {
    if (this.looks.has(id)) return;
    this.looks.add(id);
    this.plies ??= plywoodEdgeTexture({ plies: DESK_EDGE_PLIES });
    if (id === "linoleum") {
      this.linoleum ??= linoleumTexture();
      this.oak ??= oakTexture();
      this.linoleumMaterial.map = this.linoleum;
      this.oakMaterial.map = this.oak;
      this.oakEdgeMaterial.map = this.plies;
      [this.linoleumMaterial, this.oakMaterial, this.oakEdgeMaterial].forEach(material => (material.needsUpdate = true));
      return;
    }
    const top = this.topMaterial;
    const edge = this.edgeMaterial;
    const desk = this.ensureDesk();
    top.map = desk.map;
    top.roughnessMap = desk.roughnessMap;
    top.color.setHex(DESK_TINT);
    top.roughness = 0.5;
    edge.map = this.plies;
    edge.roughnessMap = null;
    edge.color.setHex(DESK_EDGE_TINT);
    edge.roughness = DESK_EDGE_ROUGHNESS;
    top.needsUpdate = true;
    edge.needsUpdate = true;
  }

  /** The surfaces of content without surfaces for the current format: the open book's pages or the cover */
  private legacyFrames(): SurfaceFrame[] {
    return sceneSurfaces({ format: this.format }, this.page).map(surfaceFrame);
  }

  /**
   * The scene on the stage (#314: drawn from its surfaces). A `fixed` scene is the book: its surfaces side by side, each
   * a block of paper at its own size on one cover board – a double page the open book, a fold-out three pages, a cover
   * the closed book; the layout's sheet over the row as today. A `free` scene: each surface a board at its place (a wall
   * stands), no book around it. Each surface shows its reference image (`book.references`), else its page image, else
   * the layout's sheet, else paper.
   */
  setLayout(targets: readonly StageTarget[], page: PageFormat, sheet: StageSheet | null, book: StageBook): void {
    const run = ++this.layoutRun;
    this.clear(this.book);
    this.clear(this.pages);
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];
    this.sheetPaper = null;
    this.sharpSource = sheet?.imageSharp ?? null;
    this.sharpRequested = false;

    this.page = page;
    this.format = book.format;
    this.frames = book.surfaces?.length ? book.surfaces.map(surfaceFrame) : this.legacyFrames();
    const frames = this.frames;
    const free = !!book.free;
    const closed = !free && (book.format === "cover" || book.format === "back");
    const edge = new MeshStandardMaterial({ color: PAGE_EDGE_COLOR, roughness: 1 });
    const top = new MeshStandardMaterial({ color: PAGE_COLOR, roughness: 1 });
    const board = new MeshStandardMaterial({ color: COVER_COLOR, roughness: 0.8 });
    // The board's four sides are the hard cover's edge (BoxGeometry faces 0–3); its faces stay the board
    const edgeTexture = coverEdgeTexture();
    if (edgeTexture) this.textures.push(edgeTexture);
    const boardEdge = new MeshStandardMaterial({ color: edgeTexture ? 0xffffff : PAGE_EDGE_COLOR, map: edgeTexture, roughness: 1 });
    const boardMaterials = [boardEdge, boardEdge, boardEdge, boardEdge, board, board];
    const blockTop = -3 * LAYER;
    // The row's box (m): what the cover board, the shadow and the sheet span
    const rects = surfaceRects(frames);
    const box = rects.length ? frameBox({ page, format: book.format, surfaces: rects }) : { left: -page.width / 2, top: page.height / 2, width: page.width, height: page.height };
    const rowW = box.width / 1000;
    const rowH = box.height / 1000;
    const rowX = (box.left + box.width / 2) / 1000;
    const rowY = (box.top - box.height / 2) / 1000;
    let bottom: number;
    if (free) {
      // Each surface a board at its place: its face the paper, the board behind it
      frames.forEach(frame => {
        const slab = new Mesh(new BoxGeometry(frame.widthMm / 1000, frame.heightMm / 1000, BOARD_THICKNESS), [edge, edge, edge, edge, top, edge]);
        layOnSurface(slab, frame, frame.widthMm / 2, frame.heightMm / 2, blockTop - BOARD_THICKNESS / 2);
        slab.userData.surfaceId = frame.id;
        this.book.add(slab);
      });
      bottom = blockTop - BOARD_THICKNESS;
    } else if (closed) {
      // The closed book, seen from the front or the back cover: the printed cover board on top, the whole block of
      // paper under it, the other board below – centred on its surface, its size
      const face = frames[0];
      const w = face.widthMm / 1000;
      const h = face.heightMm / 1000;
      const cx = (face.origin[0] + face.widthMm / 2) / 1000;
      const cy = (face.origin[1] - face.heightMm / 2) / 1000;
      const block = Math.min(2 * BLOCK_MAX, Math.max(BLOCK_MIN, book.spreads * SHEET_THICKNESS));
      const boardW = w + 2 * COVER_OVERHANG;
      const boardH = h + 2 * COVER_OVERHANG;
      const upper = new Mesh(new BoxGeometry(boardW, boardH, COVER_THICKNESS), boardMaterials);
      upper.position.set(cx, cy, blockTop - COVER_THICKNESS / 2);
      const stack = new Mesh(new BoxGeometry(w, h, block), [edge, edge, edge, edge, top, top]);
      stack.position.set(cx, cy, blockTop - COVER_THICKNESS - block / 2);
      const lower = new Mesh(new BoxGeometry(boardW, boardH, COVER_THICKNESS), boardMaterials);
      lower.position.set(cx, cy, blockTop - COVER_THICKNESS - block - COVER_THICKNESS / 2);
      this.book.add(upper, stack, lower);
      bottom = blockTop - 2 * COVER_THICKNESS - block;
    } else {
      // The open book: a block of paper per surface (the sheets shared out), on a cover board that spans the row, the
      // block's thickness an approximation from the number of spreads
      const block = Math.min(BLOCK_MAX, Math.max(BLOCK_MIN, (book.spreads * SHEET_THICKNESS) / Math.max(2, frames.length)));
      frames.forEach(frame => {
        const stack = new Mesh(new BoxGeometry(frame.widthMm / 1000, frame.heightMm / 1000, block), [edge, edge, edge, edge, top, edge]);
        stack.position.set((frame.origin[0] + frame.widthMm / 2) / 1000, (frame.origin[1] - frame.heightMm / 2) / 1000, blockTop - block / 2);
        stack.userData.surfaceId = frame.id;
        this.book.add(stack);
      });
      const cover = new Mesh(new BoxGeometry(rowW + 2 * COVER_OVERHANG, rowH + 2 * COVER_OVERHANG, COVER_THICKNESS), boardMaterials);
      cover.position.set(rowX, rowY, blockTop - block - COVER_THICKNESS / 2);
      this.book.add(cover);
      bottom = blockTop - block - COVER_THICKNESS;
    }
    if (!free) {
      // A soft shadow under the book on the table
      const shadow = new Mesh(new PlaneGeometry(rowW + 2 * COVER_OVERHANG + 0.012, rowH + 2 * COVER_OVERHANG + 0.012), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
      shadow.position.set(rowX + 0.003, rowY - 0.004, bottom - LAYER);
      this.book.add(shadow);
    }
    this.table.position.z = bottom - 2 * LAYER;
    this.tableTop = bottom - LAYER;

    // The seams of the row: where one surface meets the next (the spine of a double page, a fold-out's folds)
    const seams = closed || free ? [] : frames.slice(1).map((frame, i) => ({ x: frame.origin[0] / 1000, h: Math.min(frame.heightMm, frames[i].heightMm) / 1000, y: rowY }));
    const references = book.references ?? {};
    // The book's row (its pages, a cover) takes the sheet whole, centred; a fold-out's or a free scene's surfaces each
    // take their part of it – a double sheet's halves on the left and the right page, a one-page sheet on the cover
    const bookRow = !free && frames.every(f => ["left", "right", "front", "back"].includes(f.side));
    if (sheet && !bookRow) {
      this.laySheetOnSurfaces(sheet, run, references);
      if (!closed && !free) seams.forEach(seam => {
        const spine = new Mesh(new PlaneGeometry(0.002, seam.h), new MeshBasicMaterial({ color: SPINE_COLOR }));
        spine.position.set(seam.x, seam.y, -2 * LAYER);
        this.book.add(spine);
      });
    } else if (sheet && !free) {
      // The sheet as laid out, centred on the row (a double page spans both pages)
      const paper = new Mesh(new PlaneGeometry(sheet.widthMm / 1000, sheet.heightMm / 1000), new MeshBasicMaterial({ color: PAGE_COLOR }));
      // A one-page sheet of a single printed page lies on its own half (#251), the facing half beside it
      paper.position.set(sheet.side ? ((sheet.side === "left" ? -1 : 1) * sheet.widthMm) / 2000 : rowX, rowY, -2 * LAYER);
      this.book.add(paper);
      this.sheetPaper = paper;
      this.loader.setCrossOrigin("anonymous");
      if (sheet.image) this.loader.load(sheet.image, texture => {
        if (run !== this.layoutRun) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        this.textures.push(texture);
        const own = ownMaterial<MeshBasicMaterial>(paper);
        own.map = texture;
        // The image's white is the book's paper, as on the printed targets lying on it – the paper colour is for a
        // page without a picture (#250)
        own.color.setHex(0xffffff);
        own.needsUpdate = true;
        this.setDetail(this.distance);
      });
    } else if (!closed && !free) {
      seams.forEach(seam => {
        const spine = new Mesh(new PlaneGeometry(0.002, seam.h), new MeshBasicMaterial({ color: SPINE_COLOR }));
        spine.position.set(seam.x, seam.y, -2 * LAYER);
        this.book.add(spine);
      });
    }
    if (sheet) this.layPageImages(sheet, run, references);
    this.layReferences(references, run);
    // The fold over each seam, above the page image and under the prints and the entities
    seams.forEach(seam => {
      const fold = foldTexture();
      if (!fold) return;
      this.textures.push(fold);
      const shade = new Mesh(new PlaneGeometry(FOLD_WIDTH_MM / 1000, seam.h), new MeshBasicMaterial({ map: fold, transparent: true, depthWrite: false }));
      shade.position.set(seam.x, seam.y, -1.5 * LAYER);
      this.book.add(shade);
    });

    targets.forEach(target => {
      // A unit plane scaled to the print: a move or the image's own aspect only rescales it, so whatever hangs on it
      // (the selection's outline) follows
      const plane = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0xffffff }));
      plane.userData.targetId = target.id;
      this.placePrint(plane, target);
      this.pages.add(plane);
      this.loader.setCrossOrigin("anonymous");
      this.loader.load(target.imageSrc, texture => {
        if (run !== this.layoutRun) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        this.textures.push(texture);
        // The printed width is known; the height follows the image, as the print does
        this.aspects.set(target.imageSrc, texture.image.height / texture.image.width);
        this.placePrint(plane, plane.userData.place as StageTarget);
        const own = ownMaterial<MeshBasicMaterial>(plane);
        own.map = texture;
        own.needsUpdate = true;
      });
    });
    this.drawGrid();
    this.drawMarks();
    this.toBackdropLayer();
  }

  /**
   * The layout's sheet cut onto the scene's surfaces (#314): a double sheet's left half on the left page, its right half
   * on the right page; a one-page sheet on the cover's face (or the page of its side). Other surfaces stay paper. A
   * surface with a reference image shows that instead (drawn over it).
   */
  private laySheetOnSurfaces(sheet: StageSheet, run: number, references: Readonly<Record<string, SurfaceReference>>): void {
    if (!sheet.image) return;
    const double = sheet.widthMm > this.page.width * 1.5;
    const parts = this.frames.flatMap((frame): Array<{ frame: SurfaceFrame; repeat: [number, number]; offset: [number, number] }> => {
      if (references[frame.id]) return [];
      const half = double ? (frame.side === "left" ? 0 : frame.side === "right" ? 1 : -1) : -1;
      if (double && half >= 0) return [{ frame, repeat: [0.5, 1], offset: [half * 0.5, 0] }];
      const single = !double && (frame.side === "front" || frame.side === "back" || frame.side === sheet.side);
      return single ? [{ frame, repeat: [1, 1], offset: [0, 0] }] : [];
    });
    if (!parts.length) return;
    const planes = parts.map(({ frame }) => {
      const plane = new Mesh(new PlaneGeometry(frame.widthMm / 1000, frame.heightMm / 1000), new MeshBasicMaterial({ color: PAGE_COLOR }));
      layOnSurface(plane, frame, frame.widthMm / 2, frame.heightMm / 2, -2 * LAYER);
      this.book.add(plane);
      return plane;
    });
    this.loader.setCrossOrigin("anonymous");
    this.loader.load(sheet.image, texture => {
      if (run !== this.layoutRun) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      this.textures.push(texture);
      parts.forEach(({ repeat, offset }, i) => {
        const part = texture.clone();
        part.repeat.set(repeat[0], repeat[1]);
        part.offset.set(offset[0], offset[1]);
        part.needsUpdate = true;
        this.textures.push(part);
        const own = ownMaterial<MeshBasicMaterial>(planes[i]);
        own.map = part;
        own.color.setHex(0xffffff);
        own.needsUpdate = true;
      });
    }, undefined, error => console.warn("[mock-stage] the sheet could not be loaded:", error));
  }

  /** The surface a page image's half lies on: the left / right page, or the scene's one surface (a cover) */
  private surfaceOfHalf(half: string): SurfaceFrame | undefined {
    if (half === "whole") return this.frames.find(f => f.side === "front" || f.side === "back") ?? this.frames[0];
    return this.frames.find(f => f.side === half);
  }

  /**
   * The sheet's page images (#251): one surface-sized plane per half over the sheet's image (under the fold, the prints
   * and the entities), its picture stretched to the surface as uploaded – the sheet's sharper image stays the layout's.
   * A surface with a reference image shows that instead.
   */
  private layPageImages(sheet: StageSheet, run: number, references: Readonly<Record<string, SurfaceReference>>): void {
    for (const [half, url] of Object.entries(sheet.pages ?? {})) {
      const frame = this.surfaceOfHalf(half);
      if (!url || !frame || references[frame.id]) continue;
      const plane = new Mesh(new PlaneGeometry(frame.widthMm / 1000, frame.heightMm / 1000), new MeshBasicMaterial({ color: PAGE_COLOR }));
      layOnSurface(plane, frame, frame.widthMm / 2, frame.heightMm / 2, -1.75 * LAYER);
      plane.userData.pageImage = half;
      this.book.add(plane);
      this.loader.load(url, texture => {
        if (run !== this.layoutRun) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        this.textures.push(texture);
        const own = ownMaterial<MeshBasicMaterial>(plane);
        own.map = texture;
        own.color.setHex(0xffffff);
        own.needsUpdate = true;
      }, undefined, error => console.warn("[mock-stage] a page image could not be loaded:", url, error));
    }
  }

  /**
   * The surfaces' reference images (#314): over the page image and the sheet, under the fold and the prints, fitted
   * to the surface as its `fit` says (`fitImage`) – paper around a contained one
   */
  private layReferences(references: Readonly<Record<string, SurfaceReference>>, run: number): void {
    for (const frame of this.frames) {
      const reference = references[frame.id];
      if (!reference) continue;
      const paper = new Mesh(new PlaneGeometry(frame.widthMm / 1000, frame.heightMm / 1000), new MeshBasicMaterial({ color: PAGE_COLOR }));
      layOnSurface(paper, frame, frame.widthMm / 2, frame.heightMm / 2, -1.7 * LAYER);
      const plane = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: PAGE_COLOR }));
      plane.scale.set(frame.widthMm / 1000, frame.heightMm / 1000, 1);
      layOnSurface(plane, frame, frame.widthMm / 2, frame.heightMm / 2, -1.65 * LAYER);
      plane.userData.reference = frame.id;
      this.book.add(paper, plane);
      this.loader.setCrossOrigin("anonymous");
      this.loader.load(reference.url, texture => {
        if (run !== this.layoutRun) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        const fitted = fitImage(reference.fit, texture.image.height / texture.image.width, frame.widthMm, frame.heightMm);
        texture.repeat.set(...fitted.repeat);
        texture.offset.set(...fitted.offset);
        this.textures.push(texture);
        plane.scale.set(fitted.width / 1000, fitted.height / 1000, 1);
        const own = ownMaterial<MeshBasicMaterial>(plane);
        own.map = texture;
        own.color.setHex(0xffffff);
        own.needsUpdate = true;
      }, undefined, error => console.warn("[mock-stage] a reference image could not be loaded:", reference.url, error));
    }
  }

  /** Outline the surfaces (the Surface mode, #314): `outlined` thin, `highlighted` in the highlight's colour; unknown ids are left out */
  setSurfaceMarks(outlined: readonly string[], highlighted: string | null): void {
    this.marks = { outlined: [...outlined], highlighted };
    this.drawMarks();
    this.toBackdropLayer();
  }

  /** The surfaces the stage knows now, in the stage frame (mm) */
  surfaceFrames(): readonly SurfaceFrame[] {
    return this.frames;
  }

  /** The surface under the pointer in the Surface mode (#314): outlined stronger than the others, under the highlight */
  setSurfaceHover(id: string | null): void {
    if (id === this.hoveredSurface) return;
    this.hoveredSurface = id;
    this.drawMarks();
    this.toBackdropLayer();
  }
  private hoveredSurface: string | null = null;

  /** An editor helper that lives in the stage frame (moves with the stage): the surface gizmo's stand-in */
  addHelper(object: Object3D): void {
    this.group.add(object);
  }

  private drawMarks(): void {
    clearLines(this.marksGroup);
    // A loop `inset` mm inside the surface's edges
    const outline = (frame: SurfaceFrame, inset = 0): number[] => {
      const a = Math.min(inset, frame.widthMm / 4, frame.heightMm / 4);
      const corners = [[a, a], [frame.widthMm - a, a], [frame.widthMm - a, frame.heightMm - a], [a, frame.heightMm - a]].map(([x, y]) => toStage(frame, x, y, 0));
      return corners.flatMap((corner, i) => [...corner, ...corners[(i + 1) % 4]].map(v => v / 1000));
    };
    const { highlighted } = this.marks;
    const hovered = this.hoveredSurface !== highlighted ? this.hoveredSurface : null;
    const outlined = this.frames.filter(f => this.marks.outlined.includes(f.id) && f.id !== highlighted && f.id !== hovered);
    addLines(this.marksGroup, outlined.flatMap(f => outline(f)), SURFACE_OUTLINE_COLOR, 0.9, true);
    const hover = this.frames.find(f => f.id === hovered);
    if (hover) addLines(this.marksGroup, [...outline(hover), ...outline(hover, 1)], SURFACE_HOVER_COLOR, 1, true);
    // The selected one in two tones (monochrome, RULES #38): white on the dark desk, black just inside on the paper
    const selected = this.frames.find(f => f.id === highlighted);
    if (selected) {
      addLines(this.marksGroup, [...outline(selected), ...outline(selected, 0.6)], SURFACE_HIGHLIGHT_COLOR, 1, true);
      addLines(this.marksGroup, [...outline(selected, 1.4), ...outline(selected, 2)], SURFACE_HIGHLIGHT_INNER_COLOR, 1, true);
    }
  }
  /** The targets hidden in the tree (the eye): their printed images go with their AR content, so the scene shows neither */
  setHiddenPrints(hidden: ReadonlySet<string>): void {
    this.printedPlanes().forEach(plane => {
      plane.visible = !hidden.has(plane.userData.targetId as string);
    });
  }

  /** Lay a print's plane where its target lies: one layer under the target's own plane (the entities sit at its z = 0) */
  private placePrint(plane: Mesh, target: StageTarget): void {
    plane.userData.place = target;
    const aspect = this.aspects.get(target.imageSrc);
    const height = printedHeight(target, aspect);
    plane.scale.set(target.width / 1000, height / 1000, 1);
    // On its surface (#314): flat on the table as before, standing on a wall
    layOnSurface(plane, frameFor(this.frames, target.surface), target.x + target.width / 2, target.y + height / 2, -LAYER);
  }

  /** A target's print moves (the placement being edited): the same plane, so its texture and outline stay */
  movePrint(target: StageTarget): void {
    const plane = this.printedPlanes().find(p => p.userData.targetId === target.id);
    if (plane) this.placePrint(plane, target);
  }

  /** A printed image's height per width, once its image has loaded */
  printedAspect(targetId: string): number | undefined {
    const place = this.printedPlanes().find(p => p.userData.targetId === targetId)?.userData.place as StageTarget | undefined;
    return place ? this.aspects.get(place.imageSrc) : undefined;
  }

  /** The camera's distance from the page (mm) as last reported */
  private distance = Infinity;

  /**
   * The sheet's sharper image replaces the base one once the camera is close to the page – fetched only then, once
   * per layout, so a far view or a spread never looked at costs nothing. The base image stays until it has loaded.
   */
  setDetail(distanceMm: number): void {
    this.distance = distanceMm;
    const paper = this.sheetPaper;
    if (!paper || !this.sharpSource || this.sharpRequested || distanceMm > SHARP_DISTANCE_MM) return;
    // The base image first: the sharper one only replaces a picture that is already there
    if (!ownMaterial<MeshBasicMaterial>(paper).map) return;
    this.sharpRequested = true;
    const run = this.layoutRun;
    this.loader.load(this.sharpSource, texture => {
      if (run !== this.layoutRun) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      this.textures.push(texture);
      const own = ownMaterial<MeshBasicMaterial>(paper);
      own.map = texture;
      own.color.setHex(0xffffff);
      own.needsUpdate = true;
    }, undefined, error => console.warn("[mock-stage] the sharper sheet image could not be loaded:", error));
  }

  /** The stage's frame (metres, origin in the middle of the book, z out of the page) – snapping counts in it */
  frame(): Object3D {
    this.group.updateMatrixWorld(true);
    return this.group;
  }

  /** The grid over the page, counted from the chosen origin, and its vertical axis; off = none */
  setGrid(grid: { on: boolean; mm: number; origin: OriginId; axis: boolean }): void {
    this.grid = grid;
    this.drawGrid();
    this.toBackdropLayer();
  }

  /** The page grid's frame: the scene's surfaces lying flat on the table (#314), else the format's pages */
  private gridFrame(): OriginFrame {
    const rects = surfaceRects(this.frames);
    return { page: this.page, format: this.format, ...(rects.length ? { surfaces: rects } : {}) };
  }

  /**
   * Lines every `mm` from the origin's zero (per surface for a corner origin, over the whole row for the scene's
   * centre), the zero lines in another colour; they lie just above the prints and below the entities, on the surfaces
   * lying flat on the table (a wall's own grid is #316). The vertical axis rises from each zero, out of the page. With
   * the grid the scene's coordinate system shows too (#314): a faint grid on the table and, with the axis, the scene's
   * axes at its origin – x red, y (up) green, z (towards the reader) blue.
   */
  private drawGrid(): void {
    clearLines(this.gridGroup);
    clearLines(this.sceneGridGroup);
    if (!this.grid.on) return;
    const frame = this.gridFrame();
    const flat = surfaceRects(this.frames).length > 0 || !this.frames.length;
    const box = frameBox(frame);
    const lines: number[] = [];
    const zeros: number[] = [];
    const verticals: number[] = [];
    // spread frame (mm, top left, y down) -> stage metres
    const point = (target: number[], x: number, y: number) => target.push((box.left + x) / 1000, (box.top - y) / 1000, -LAYER / 2);
    for (const area of flat ? gridAreas(this.grid.origin, frame) : []) {
      for (const x of gridLines(area.zeroX, area.left, area.width, this.grid.mm)) {
        const target = Math.abs(x - area.zeroX) < 1e-6 ? zeros : lines;
        point(target, x, area.top);
        point(target, x, area.top + area.height);
      }
      for (const y of gridLines(area.zeroY, area.top, area.height, this.grid.mm)) {
        const target = Math.abs(y - area.zeroY) < 1e-6 ? zeros : lines;
        point(target, area.left, y);
        point(target, area.left + area.width, y);
      }
      if (this.grid.axis) {
        const [x, y] = [(box.left + area.zeroX) / 1000, (box.top - area.zeroY) / 1000];
        verticals.push(x, y, -LAYER / 2, x, y, GRID_AXIS_MM / 1000);
      }
    }
    addLines(this.gridGroup, lines, GRID_COLOR, 0.45);
    addLines(this.gridGroup, zeros, GRID_ZERO_COLOR, 0.9);
    addLines(this.gridGroup, verticals, GRID_AXIS_COLOR, 0.9);
    this.drawSceneGrid();
  }

  /** The scene's grid on the table (every five grid steps, at least 50 mm) and its axes at the origin (#314) */
  private drawSceneGrid(): void {
    const step = Math.max(50, 5 * this.grid.mm);
    const z = this.tableTop;
    const { x: ex, y: ey } = SCENE_GRID_EXTENT_MM;
    const positions: number[] = [];
    for (const x of gridLines(0, -ex, 2 * ex, step)) positions.push(x / 1000, -ey / 1000, z, x / 1000, ey / 1000, z);
    for (const y of gridLines(0, -ey, 2 * ey, step)) positions.push(-ex / 1000, y / 1000, z, ex / 1000, y / 1000, z);
    addLines(this.sceneGridGroup, positions, SCENE_GRID_COLOR, 0.35);
    if (!this.grid.axis) return;
    const a = SCENE_AXIS_MM / 1000;
    // The stage frame: scene x = stage x, scene y (up) = stage z, scene z (towards the reader) = stage −y
    addLines(this.sceneGridGroup, [0, 0, 0, a, 0, 0], AXIS_X_COLOR, 1, true);
    addLines(this.sceneGridGroup, [0, 0, 0, 0, 0, a], GRID_AXIS_COLOR, 1, true);
    addLines(this.sceneGridGroup, [0, 0, 0, 0, -a, 0], AXIS_Z_COLOR, 1, true);
  }

  /**
   * The snap guides: a line across the row for each line a drag snapped to (x = a line up the page, y = one across
   * it, in mm of the stage frame); an empty list clears them. They lie on the page and show through the entities.
   */
  setGuides(guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>): void {
    clearLines(this.guideGroup);
    const box = frameBox(this.gridFrame());
    const [left, right] = [box.left - GUIDE_OVERHANG_MM, box.left + box.width + GUIDE_OVERHANG_MM];
    const [high, low] = [box.top + GUIDE_OVERHANG_MM, box.top - box.height - GUIDE_OVERHANG_MM];
    const positions: number[] = [];
    for (const { axis, at } of guides) {
      if (axis === 0) positions.push(at / 1000, low / 1000, 0, at / 1000, high / 1000, 0);
      if (axis === 1) positions.push(left / 1000, at / 1000, 0, right / 1000, at / 1000, 0);
    }
    addLines(this.guideGroup, positions, GUIDE_COLOR, 1, true);
    this.toBackdropLayer();
  }

  /**
   * Everything of the stage stands in for the camera picture: on the engine's backdrop layer the spread's
   * post-processing passes shade it as the camera picture (bloom, vignette; the grade stays on the AR layer)
   */
  private toBackdropLayer(): void {
    this.group.traverse(object => object.layers.set(BACKDROP_LAYER));
    // Called whenever the stage built something new: it gets the current shading as well
    this.shadeStage();
  }

  /**
   * The sky and the light: the HDRI while rendered, else the scene's own lights over the editor's dark ground – or the
   * environment's world (drawn by the engine under the stage) with the scene's own lights (`sky.ts`)
   */
  setHdri(hdri: HdriId | null): void {
    this.hdri = hdri;
    this.wantedHdri = this.look().hdri;
    if (!this.wantedHdri) {
      this.scene.background = null;
      this.scene.environment = null;
      if (this.sky) this.sky.visible = false;
      this.dimLights(false);
      return;
    }
    const loaded = this.hdris.get(this.wantedHdri);
    if (loaded) {
      this.applyHdri(loaded);
      return;
    }
    const id = this.wantedHdri;
    new RGBELoader().load(this.assetUrl(`hdri/${id}_1k.hdr`), texture => {
      texture.mapping = EquirectangularReflectionMapping;
      this.hdris.set(id, texture);
      if (this.wantedHdri === id) this.applyHdri(texture);
    }, undefined, error => console.warn(`[mock-stage] HDRI "${id}" could not be loaded:`, error));
  }

  /** The ghost's parts for the handles: the image and its corner (none while no ghost is shown) */
  ghostParts(): { image: Object3D | null; corner: Object3D | null } {
    return {
      image: this.ghostGroup.getObjectByName("ghost") ?? null,
      corner: this.ghostGroup.getObjectByName("ghost-corner") ?? null,
    };
  }

  /**
   * Where a world ray meets the scene's surfaces (#314, `hitSurfaces`): the surface it hits (by id) and mm from its top
   * left corner – the nearest surface hit inside its edges, else the one whose edge is nearest (a drag beyond a page's
   * edge stays on it; on the open book the spine decides, as before)
   */
  pageHit(raycaster: Raycaster): { surface: StageSurface; x: number; y: number } | null {
    this.group.updateMatrixWorld(true);
    const inverse = this.group.matrixWorld.clone().invert();
    const origin = raycaster.ray.origin.clone().applyMatrix4(inverse).multiplyScalar(1000);
    const direction = raycaster.ray.direction.clone().transformDirection(inverse);
    return hitSurfaces(this.frames, [origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z]);
  }

  /** The printed images on the page (each knows its `userData.targetId`) – for picking a target by its print */
  printedPlanes(): Mesh[] {
    return this.pages.children.filter((child): child is Mesh => child instanceof Mesh);
  }

  /**
   * A translucent print of `ghost` where it would lie (above the print, below the entities), with a small square at
   * its bottom right corner – the handles: drag the image to move it, the corner to set its printed width. With
   * `handlesOnly` the target's own print moves instead (`movePrint`): the image stays a handle but is not drawn, so
   * the target never shows twice.
   */
  setGhost(ghost: StageTarget | null, options: { handlesOnly?: boolean } = {}): void {
    this.clear(this.ghostGroup);
    if (!ghost) return;
    const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    material.visible = !options.handlesOnly;
    const plane = new Mesh(new PlaneGeometry(1, 1), material);
    plane.name = "ghost";
    const corner = new Mesh(new PlaneGeometry(GHOST_HANDLE / 1000, GHOST_HANDLE / 1000), new MeshBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.9, depthWrite: false }));
    corner.name = "ghost-corner";
    const place = () => {
      const aspect = this.aspects.get(ghost.imageSrc);
      const height = printedHeight(ghost, aspect);
      const surface = frameFor(this.frames, ghost.surface);
      plane.scale.set(ghost.width / 1000, height / 1000, 1);
      layOnSurface(plane, surface, ghost.x + ghost.width / 2, ghost.y + height / 2, -LAYER / 2);
      layOnSurface(corner, surface, ghost.x + ghost.width, ghost.y + height, 0);
    };
    place();
    this.ghostGroup.add(plane, corner);
    this.toBackdropLayer();
    const apply = (texture: Texture) => {
      if (!plane.parent) return;
      this.aspects.set(ghost.imageSrc, texture.image.height / texture.image.width);
      place();
      material.map = texture;
      material.needsUpdate = true;
    };
    const cached = this.ghostTextures.get(ghost.imageSrc);
    if (cached) {
      apply(cached);
      return;
    }
    this.loader.setCrossOrigin("anonymous");
    this.loader.load(ghost.imageSrc, texture => {
      texture.colorSpace = SRGBColorSpace;
      this.ghostTextures.set(ghost.imageSrc, texture);
      apply(texture);
    });
  }

  private applyHdri(texture: Texture): void {
    const exposure = HDRI_EXPOSURE[this.wantedHdri ?? ""] ?? HDRI_EXPOSURE_DEFAULT;
    const look = this.look();
    // The light: the equirectangular map as the scene's environment (its direction does not follow the orbit – the
    // room's light is even enough for that not to show) – not while the world is the sky (the reader's lights, `sky.ts`)
    this.scene.background = null;
    this.scene.environment = look.light === "hdri" ? texture : null;
    this.scene.environmentIntensity = exposure;
    // The sky: the same image on a sphere around the stage, seen from inside; the HDRI's up is the page's +z
    const map = texture.clone();
    map.mapping = UVMapping;
    map.needsUpdate = true;
    if (!this.sky) {
      const geometry = new SphereGeometry(SKY_RADIUS, 64, 32);
      geometry.scale(-1, 1, 1); // seen from inside, the image reads the right way round
      this.sky = new Mesh(geometry, new MeshBasicMaterial({ toneMapped: false, depthWrite: false }));
      this.sky.name = "mock-sky";
      this.sky.rotation.x = Math.PI / 2;
      this.sky.renderOrder = -1;
      this.group.add(this.sky);
      this.toBackdropLayer();
    }
    this.sky.material.map?.dispose();
    this.sky.material.map = map;
    this.sky.material.color.setScalar(exposure);
    behindWorld(this.sky.material, look.behindWorld);
    this.sky.material.needsUpdate = true;
    this.sky.visible = look.sky === "hdri" || look.behindWorld;
    this.dimLights(look.light === "hdri");
  }

  /**
   * The scene's own lights (the engine's ambient and sun, children of the scene) step back while the HDRI lights the
   * stage; the content's lights (light nodes, inside the anchors) keep the author's intensity
   */
  private dimLights(on: boolean): void {
    if (on) {
      this.scene.children.forEach(object => {
        if (object instanceof Light && !this.dimmed.has(object)) {
          this.dimmed.set(object, object.intensity);
          object.intensity *= LIGHTS_WITH_HDRI;
        }
      });
    } else {
      this.dimmed.forEach((intensity, light) => (light.intensity = intensity));
      this.dimmed.clear();
    }
  }

  private ensureDesk(): DeskTextures {
    if (this.desk) return this.desk;
    const load = (path: string, srgb: boolean, repeat: readonly [number, number]) => {
      const texture = this.loader.load(this.assetUrl(path));
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      if (srgb) texture.colorSpace = SRGBColorSpace;
      return texture;
    };
    this.desk = {
      map: load(DESK_DIFFUSE, true, DESK_REPEAT),
      roughnessMap: load(DESK_ROUGHNESS, false, DESK_REPEAT),
    };
    return this.desk;
  }

  update(cameraInverse: Matrix4): void {
    this.group.matrix.copy(cameraInverse);
    this.group.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    this.layoutRun++;
    this.clear(this.book);
    this.clear(this.pages);
    this.clear(this.ghostGroup);
    this.grid = { ...this.grid, on: false };
    this.drawGrid();
    clearLines(this.guideGroup);
    clearLines(this.marksGroup);
    this.ghostTextures.forEach(texture => texture.dispose());
    this.ghostTextures.clear();
    this.clear(this.table);
    this.model = null;
    this.deskMaterials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];
    if (this.desk) Object.values(this.desk).forEach(texture => texture.dispose());
    this.desk = null;
    [this.plies, this.linoleum, this.oak].forEach(texture => texture?.dispose());
    this.plies = this.linoleum = this.oak = null;
    this.hdris.forEach(texture => texture.dispose());
    this.hdris.clear();
    if (this.sky) {
      this.sky.geometry.dispose();
      this.sky.material.map?.dispose();
      this.sky.material.dispose();
      this.sky.removeFromParent();
      this.sky = null;
    }
    this.scene.background = null;
    this.scene.environment = null;
    this.dimLights(false);
    this.group.removeFromParent();
  }

  /** Empties `group`, freeing every mesh below it (the desk's shared materials are the stage's own, disposed apart) */
  private clear(group: Object3D): void {
    [...group.children].forEach(child => {
      child.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
          if (![...this.deskMaterials.values()].includes(material as MeshStandardMaterial)) material.dispose();
        });
      });
      group.remove(child);
    });
  }
}
