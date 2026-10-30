import {
  AddEquation, CustomBlending, NormalBlending, OneFactor, OneMinusDstAlphaFactor,
  BoxGeometry, CanvasTexture, EquirectangularReflectionMapping, Group, Light, LineBasicMaterial, LineSegments, BufferGeometry, Float32BufferAttribute, type Material, type Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, Plane,
  PlaneGeometry, type Raycaster, RepeatWrapping, type Scene, SphereGeometry, SRGBColorSpace, type Texture, TextureLoader, UVMapping, Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { BACKDROP_LAYER } from "@engine/scene/view";
import type { PageFormat, StageBook, StageSheet, StageSurface, StageTarget, StageView } from "./mock-tracker";
import { printCentre, printedHeight } from "./placement";
import { gridAreas, gridLines, type OriginId } from "./origin";
import { linoleumTexture } from "./linoleum";
import { oakTexture } from "./oak";
import { plywoodEdgeTexture } from "./plywood";
import { applyShading, ownMaterial } from "./shading";
import type { DeskId, HdriId, ShadingMode } from "./preview";
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
 * (`plywood.ts`, drawn in code), untinted and matt. Schöpfer's top is no plywood (#187): an aluminium sandwich with a
 * blue-grey linoleum surface (`linoleum.ts`) and an oak edge band, oak drawers too (`oak.ts`) – both drawn in code,
 * untinted, matt. The cover is a white hardcover board.
 */
const DESK_TINT = 0x3b2416;
const DESK_EDGE_TINT = 0xc8c8c8;
const DESK_EDGE_ROUGHNESS = 0.8;
const LINOLEUM_ROUGHNESS = 0.85;
const OAK_ROUGHNESS = 0.65;
/**
 * The plies in one stack of the edges' texture: 18 mm birch plywood has 13 plies of about 1.4 mm (Tilman, 2026-10-30:
 * "we are 18 mm thick" – the trade's 18 mm birch, phenolic-faced like the Eiermann top, is 13-ply). The Eiermann board is
 * one stack (the model's UVs)
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
 * The desks (the Stage panel's choice): 1.8 × 0.8 m tops, the Eiermann 72 cm high, Schöpfer's 75 – our own low-poly
 * models, built by `editor/tools/desk-eiermann.py` (`editor/static/models/README.md`). Each model's origin is the
 * centre of the top's upper surface; the materials with a drawn look become the stage's own – the Eiermann's `top`
 * (the screen-printed plywood, see below) and `edge` (its plies), Schöpfer's `linoleum` and `oak` – while `steel`,
 * `aluminium` and `drawer` stay as exported. glTF is Y up: a model is turned so its up is the page's +z.
 */
const DESK_MODELS: Record<DeskId, string> = { eiermann: "models/desk-eiermann.glb", schoepfer: "models/desk-schoepfer.glb" };
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
  /** The desk (the chosen model, once loaded): its origin is the top's surface, placed at the table height */
  private table = new Group();
  private deskId: DeskId = "eiermann";
  /** The desks' models by id, loaded once and kept for a switch back */
  private models = new Map<DeskId, Group>();
  private loadingDesks = new Set<DeskId>();
  private topMaterial = new MeshStandardMaterial({ color: DESK_TINT, roughness: 0.5 });
  private edgeMaterial = new MeshStandardMaterial({ color: DESK_EDGE_TINT, roughness: DESK_EDGE_ROUGHNESS });
  /** Schöpfer's surfaces: their drawn textures are put on when the desk is first shown */
  private linoleumMaterial = new MeshStandardMaterial({ roughness: LINOLEUM_ROUGHNESS });
  private oakMaterial = new MeshStandardMaterial({ roughness: OAK_ROUGHNESS });
  /** The desks' materials that are the stage's own, by the models' material names (shared, disposed apart) */
  private deskMaterials = new Map<string, MeshStandardMaterial>([
    ["top", this.topMaterial],
    ["edge", this.edgeMaterial],
    ["linoleum", this.linoleumMaterial],
    ["oak", this.oakMaterial],
  ]);
  /** The desk whose look the desk materials show (none before the first) */
  private lookOf: DeskId | null = null;
  private disposed = false;
  private book = new Group();
  private pages = new Group();
  private textures: Texture[] = [];
  private loader = new TextureLoader();
  private layoutRun = 0;
  private desk: DeskTextures | null = null;
  /** The drawn textures, each drawn once on first use: the Eiermann edges' plies, Schöpfer's linoleum and oak */
  private plies: Texture | null = null;
  private linoleum: Texture | null = null;
  private oak: Texture | null = null;
  /** The page format of the last layout (the ghost is placed on it) */
  private page: PageFormat = { width: 230, height: 320 };
  /** What the current spread is: the open book, or the closed book seen from the front or the back */
  private format: StageBook["format"] = "spread";
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
    this.group.add(this.table, this.book, this.pages, this.gridGroup, this.guideGroup, this.ghostGroup);
    scene.add(this.group);
    this.showDesk();
  }

  /** The desk under the book: its model (loaded once) into the desk's group, its top in its own look */
  setDesk(desk: DeskId): void {
    if (this.deskId === desk && this.lookOf === desk) return;
    this.deskId = desk;
    this.showDesk();
    this.applyDeskLook();
  }

  private showDesk(): void {
    const id = this.deskId;
    [...this.table.children].forEach(child => this.table.remove(child));
    const loaded = this.models.get(id);
    if (loaded) {
      this.table.add(loaded);
      this.toBackdropLayer();
      return;
    }
    if (this.loadingDesks.has(id)) return;
    this.loadingDesks.add(id);
    new GLTFLoader().load(this.assetUrl(DESK_MODELS[id]), gltf => {
      this.loadingDesks.delete(id);
      const model = gltf.scene;
      if (this.disposed) {
        this.clear(model);
        return;
      }
      model.rotation.x = Math.PI / 2; // glTF's +y (up) becomes the page's +z
      // The surfaces with a drawn look become the stage's own; the frame keeps the file's steel, Schöpfer's drawers
      // their dark inside
      model.traverse(object => {
        if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
        const material = object.material as Material;
        const own = this.deskMaterials.get(material.name);
        if (!own) return;
        material.dispose();
        object.material = own;
      });
      this.models.set(id, model);
      if (this.deskId === id) {
        this.table.add(model);
        this.toBackdropLayer();
      }
    }, undefined, error => {
      this.loadingDesks.delete(id);
      console.warn(`[mock-stage] the desk "${id}" could not be loaded:`, error);
    });
  }

  /**
   * The desk's look, its textures loaded or drawn on first use: the Eiermann's screen-printed plywood with the plies
   * on its edges, Schöpfer's linoleum and oak (no plywood – #187)
   */
  private applyDeskLook(): void {
    this.lookOf = this.deskId;
    if (this.deskId === "schoepfer") {
      this.linoleum ??= linoleumTexture();
      this.oak ??= oakTexture();
      this.linoleumMaterial.map = this.linoleum;
      this.oakMaterial.map = this.oak;
      this.linoleumMaterial.needsUpdate = true;
      this.oakMaterial.needsUpdate = true;
      return;
    }
    const top = this.topMaterial;
    const edge = this.edgeMaterial;
    const desk = this.ensureDesk();
    top.map = desk.map;
    top.roughnessMap = desk.roughnessMap;
    top.color.setHex(DESK_TINT);
    top.roughness = 0.5;
    this.plies ??= plywoodEdgeTexture({ plies: DESK_EDGE_PLIES });
    edge.map = this.plies;
    edge.roughnessMap = null;
    edge.color.setHex(DESK_EDGE_TINT);
    edge.roughness = DESK_EDGE_ROUGHNESS;
    top.needsUpdate = true;
    edge.needsUpdate = true;
  }

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
    const w = page.width / 1000;
    const h = page.height / 1000;
    const closed = book.format === "cover" || book.format === "back";
    const edge = new MeshStandardMaterial({ color: PAGE_EDGE_COLOR, roughness: 1 });
    const top = new MeshStandardMaterial({ color: PAGE_COLOR, roughness: 1 });
    const board = new MeshStandardMaterial({ color: COVER_COLOR, roughness: 0.8 });
    // The board's four sides are the hard cover's edge (BoxGeometry faces 0–3); its faces stay the board
    const edgeTexture = coverEdgeTexture();
    if (edgeTexture) this.textures.push(edgeTexture);
    const boardEdge = new MeshStandardMaterial({ color: edgeTexture ? 0xffffff : PAGE_EDGE_COLOR, map: edgeTexture, roughness: 1 });
    const boardMaterials = [boardEdge, boardEdge, boardEdge, boardEdge, board, board];
    const blockTop = -3 * LAYER;
    let bottom: number;
    let shadowWidth: number;
    if (closed) {
      // The closed book, seen from the front or the back cover: the printed cover board on top, the whole block of
      // paper under it, the other board below – centred on the origin, one page wide
      const block = Math.min(2 * BLOCK_MAX, Math.max(BLOCK_MIN, book.spreads * SHEET_THICKNESS));
      const boardW = w + 2 * COVER_OVERHANG;
      const boardH = h + 2 * COVER_OVERHANG;
      const upper = new Mesh(new BoxGeometry(boardW, boardH, COVER_THICKNESS), boardMaterials);
      upper.position.set(0, 0, blockTop - COVER_THICKNESS / 2);
      const stack = new Mesh(new BoxGeometry(w, h, block), [edge, edge, edge, edge, top, top]);
      stack.position.set(0, 0, blockTop - COVER_THICKNESS - block / 2);
      const lower = new Mesh(new BoxGeometry(boardW, boardH, COVER_THICKNESS), boardMaterials);
      lower.position.set(0, 0, blockTop - COVER_THICKNESS - block - COVER_THICKNESS / 2);
      this.book.add(upper, stack, lower);
      bottom = blockTop - 2 * COVER_THICKNESS - block;
      shadowWidth = boardW;
    } else {
      // The open book: two blocks of paper (half the sheets each) on a cover board that overhangs the pages, the
      // block's thickness an approximation from the number of spreads
      const block = Math.min(BLOCK_MAX, Math.max(BLOCK_MIN, (book.spreads * SHEET_THICKNESS) / 2));
      [-1, 1].forEach(side => {
        const stack = new Mesh(new BoxGeometry(w, h, block), [edge, edge, edge, edge, top, edge]);
        stack.position.set((side * w) / 2, 0, blockTop - block / 2);
        this.book.add(stack);
      });
      const cover = new Mesh(new BoxGeometry(2 * w + 2 * COVER_OVERHANG, h + 2 * COVER_OVERHANG, COVER_THICKNESS), boardMaterials);
      cover.position.set(0, 0, blockTop - block - COVER_THICKNESS / 2);
      this.book.add(cover);
      bottom = blockTop - block - COVER_THICKNESS;
      shadowWidth = 2 * w + 2 * COVER_OVERHANG;
    }
    // A soft shadow under the book on the table
    const shadow = new Mesh(new PlaneGeometry(shadowWidth + 0.012, h + 2 * COVER_OVERHANG + 0.012), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
    shadow.position.set(0.003, -0.004, bottom - LAYER);
    this.book.add(shadow);
    this.table.position.z = bottom - 2 * LAYER;

    if (sheet) {
      // The sheet as laid out, centred on the spine (a double page spans both pages)
      const paper = new Mesh(new PlaneGeometry(sheet.widthMm / 1000, sheet.heightMm / 1000), new MeshBasicMaterial({ color: PAGE_COLOR }));
      paper.position.set(0, 0, -2 * LAYER);
      this.book.add(paper);
      this.sheetPaper = paper;
      this.loader.setCrossOrigin("anonymous");
      this.loader.load(sheet.image, texture => {
        if (run !== this.layoutRun) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        this.textures.push(texture);
        const own = ownMaterial<MeshBasicMaterial>(paper);
        own.map = texture;
        own.needsUpdate = true;
        this.setDetail(this.distance);
      });
    } else if (!closed) {
      const spine = new Mesh(new PlaneGeometry(0.002, h), new MeshBasicMaterial({ color: SPINE_COLOR }));
      spine.position.z = -2 * LAYER;
      this.book.add(spine);
    }

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
    this.toBackdropLayer();
  }

  /** Lay a print's plane where its target lies: one layer under the target's own plane (the entities sit at its z = 0) */
  private placePrint(plane: Mesh, target: StageTarget): void {
    plane.userData.place = target;
    const aspect = this.aspects.get(target.imageSrc);
    const centre = printCentre(target, this.page, aspect);
    plane.scale.set(target.width / 1000, printedHeight(target, aspect) / 1000, 1);
    plane.position.set(centre.x / 1000, centre.y / 1000, -LAYER);
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

  /**
   * Lines every `mm` from the origin's zero (per page for a corner origin, over both pages for the book's centre),
   * the zero lines in another colour; they lie just above the prints and below the entities. The vertical axis rises
   * from each zero, out of the page.
   */
  private drawGrid(): void {
    clearLines(this.gridGroup);
    if (!this.grid.on) return;
    const page = this.page;
    const spread = { page, format: this.format };
    const spreadWidth = this.format === "spread" ? 2 * page.width : page.width;
    const left = -spreadWidth / 2;
    const top = page.height / 2;
    const lines: number[] = [];
    const zeros: number[] = [];
    const verticals: number[] = [];
    // spread frame (mm, top left, y down) -> stage metres
    const point = (target: number[], x: number, y: number) => target.push((left + x) / 1000, (top - y) / 1000, -LAYER / 2);
    for (const area of gridAreas(this.grid.origin, spread)) {
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
        const [x, y] = [(left + area.zeroX) / 1000, (top - area.zeroY) / 1000];
        verticals.push(x, y, -LAYER / 2, x, y, GRID_AXIS_MM / 1000);
      }
    }
    addLines(this.gridGroup, lines, GRID_COLOR, 0.45);
    addLines(this.gridGroup, zeros, GRID_ZERO_COLOR, 0.9);
    addLines(this.gridGroup, verticals, GRID_AXIS_COLOR, 0.9);
  }

  /**
   * The snap guides: a line across the spread for each line a drag snapped to (x = a line up the page, y = one across
   * it, in mm of the stage frame); an empty list clears them. They lie on the page and show through the entities.
   */
  setGuides(guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>): void {
    clearLines(this.guideGroup);
    const half = (this.format === "spread" ? this.page.width : this.page.width / 2) + GUIDE_OVERHANG_MM;
    const high = this.page.height / 2 + GUIDE_OVERHANG_MM;
    const positions: number[] = [];
    for (const { axis, at } of guides) {
      if (axis === 0) positions.push(at / 1000, -high / 1000, 0, at / 1000, high / 1000, 0);
      if (axis === 1) positions.push(-half / 1000, at / 1000, 0, half / 1000, at / 1000, 0);
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

  /** The page's frame: a world ray meets the page plane (z = 0 of the stage) at this point in mm from the spine, page top */
  pageHit(raycaster: Raycaster): { surface: StageSurface; x: number; y: number } | null {
    this.group.updateMatrixWorld(true);
    const normal = new Vector3(0, 0, 1).transformDirection(this.group.matrixWorld);
    const origin = new Vector3().setFromMatrixPosition(this.group.matrixWorld);
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const world = raycaster.ray.intersectPlane(plane, new Vector3());
    if (!world) return null;
    const local = this.group.worldToLocal(world);
    const mmX = local.x * 1000;
    const mmY = this.page.height / 2 - local.y * 1000;
    // The closed book has one face: the cover's, centred on the origin
    if (this.format === "cover" || this.format === "back") {
      return { surface: this.format === "cover" ? "front" : "back", x: mmX + this.page.width / 2, y: mmY };
    }
    return mmX < 0 ? { surface: "left", x: mmX + this.page.width, y: mmY } : { surface: "right", x: mmX, y: mmY };
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
      const centre = printCentre(ghost, this.page, aspect);
      const height = printedHeight(ghost, aspect);
      plane.scale.set(ghost.width / 1000, height / 1000, 1);
      plane.position.set(centre.x / 1000, centre.y / 1000, -LAYER / 2);
      corner.position.set((centre.x + ghost.width / 2) / 1000, (centre.y - height / 2) / 1000, 0);
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
    this.ghostTextures.forEach(texture => texture.dispose());
    this.ghostTextures.clear();
    this.clear(this.table);
    this.models.forEach(model => this.clear(model));
    this.models.clear();
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
