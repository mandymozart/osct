import {
  BoxGeometry, EquirectangularReflectionMapping, Group, Light, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Plane,
  PlaneGeometry, Raycaster, RepeatWrapping, Scene, SphereGeometry, SRGBColorSpace, Texture, TextureLoader, UVMapping, Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { surfaceLeft, type PageFormat, type StageBook, type StageSheet, type StageSurface, type StageTarget, type StageView } from "./mock-tracker";
import type { DeskId, HdriId, ShadingMode } from "./preview";

/**
 * A plane sits a hair below the one above it, so nothing flickers: the entities' plane is the target's (z = 0, as
 * the tracker reports it), the printed image lies one layer under it, the sheet's image another, the paper block
 * under that. Half a millimetre is invisible at a reading distance and enough for the depth buffer.
 */
const LAYER = 0.0005;
/**
 * Colours. The Eiermann desk's top is a screen-printed plywood board (Siebdruckplatte): Poly Haven's plywood texture
 * tinted to the dark phenolic brown on the faces, roughness from its map; the cut edges show the plywood's plies
 * untinted. The cover is a white hardcover board.
 */
const DESK_TINT = 0x3b2416;
const DESK_EDGE_TINT = 0xffffff;
const PAGE_COLOR = 0xf3efe6;
const PAGE_EDGE_COLOR = 0xe6e1d6;
const SPINE_COLOR = 0xd8d2c4;
const COVER_COLOR = 0xf2efe9;
/** The book as an object (metres): a sheet's thickness, the block's bounds, the cover's board and its overhang */
const SHEET_THICKNESS = 0.00015;
const BLOCK_MIN = 0.003;
const BLOCK_MAX = 0.04;
const COVER_THICKNESS = 0.002;
const COVER_OVERHANG = 0.003;
/**
 * The desks (the Stage panel's choice): 1.4 × 1.0 m tops, 72 cm high – our own low-poly models, built by
 * `editor/tools/desk-eiermann.py` (`editor/static/models/README.md`). Each model's origin is the centre of the top's
 * upper surface; its material `top` (and the Eiermann top's `edge`) becomes the stage's own – the Eiermann top is
 * the screen-printed plywood (see below), Schöpfer's a white board – while `steel` and `drawer` stay as exported.
 * glTF is Y up: a model is turned so its up is the page's +z.
 */
const DESK_MODELS: Record<DeskId, string> = { eiermann: "models/desk-eiermann.glb", schoepfer: "models/desk-schoepfer.glb" };
const DESK_WHITE = 0xf2f2f0;
/** The desk texture's files and how often it repeats across the top (the edges carry their own UVs, one repeat) */
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
/** The ghost's corner handle (mm) */
const GHOST_HANDLE = 8;

/** The plywood: repeated over the top, and once more as the edges' (their own repeat is in the model's UVs) */
interface DeskTextures {
  map: Texture;
  roughnessMap: Texture;
  edgeMap: Texture;
  edgeRoughnessMap: Texture;
}

/**
 * The mock stage: what the camera would show – a desk, the open book in its page format (the sheet as laid out when
 * the content has the book's layout, blank pages otherwise), the current spread's printed images where they are
 * printed (or in a row), all in the same three.js scene as the entities, moved as one group by the tracker's camera
 * (the three.js camera stays at the origin, as in AR). The sky and the light: the chosen HDRI while the shading is
 * rendered, the scene's own lights otherwise. The desk keeps its own materials under every viewport shading
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
  private edgeMaterial = new MeshStandardMaterial({ color: DESK_EDGE_TINT, roughness: 0.7 });
  private disposed = false;
  private book = new Group();
  private pages = new Group();
  private textures: Texture[] = [];
  private loader = new TextureLoader();
  private layoutRun = 0;
  private desk: DeskTextures | null = null;
  /** The page format of the last layout (the ghost is placed on it) */
  private page: PageFormat = { width: 230, height: 320 };
  /** What the current spread is: the open book, or the closed book seen from the front or the back */
  private format: StageBook["format"] = "spread";
  private ghostGroup = new Group();
  private ghostTextures = new Map<string, Texture>();
  private hdris = new Map<string, Texture>();
  private wantedHdri: string | null = null;
  /** The sky: the HDRI on a sphere inside the stage's group, so it turns with the stage by construction */
  private sky: Mesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private shading: ShadingMode = "rendered";
  private hdri: HdriId | null = null;

  /** The viewport's shading: the sky and the HDRI's light belong to "rendered" only */
  setShading(mode: ShadingMode): void {
    if (this.shading === mode) return;
    this.shading = mode;
    this.setHdri(this.hdri);
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
    this.group.add(this.table, this.book, this.pages, this.ghostGroup);
    scene.add(this.group);
    this.showDesk();
  }

  /** The desk under the book: its model (loaded once) into the desk's group, its top in its own look */
  setDesk(desk: DeskId): void {
    if (this.deskId === desk) return;
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
      // The top's materials become the stage's own; the frame keeps the file's steel
      model.traverse(object => {
        if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
        const material = object.material as Material;
        const own = material.name === "top" ? this.topMaterial : material.name === "edge" ? this.edgeMaterial : null;
        if (!own) return;
        material.dispose();
        object.material = own;
      });
      this.models.set(id, model);
      if (this.deskId === id) this.table.add(model);
    }, undefined, error => {
      this.loadingDesks.delete(id);
      console.warn(`[mock-stage] the desk "${id}" could not be loaded:`, error);
    });
  }

  /** The top's look by desk: plywood with the plies on the edges, or Schöpfer's white */
  private applyDeskLook(): void {
    const top = this.topMaterial;
    const edge = this.edgeMaterial;
    if (this.deskId === "schoepfer") {
      top.map = edge.map = null;
      top.roughnessMap = edge.roughnessMap = null;
      top.color.setHex(DESK_WHITE);
      edge.color.setHex(DESK_WHITE);
      top.roughness = edge.roughness = 0.6;
    } else {
      const desk = this.ensureDesk();
      top.map = desk.map;
      top.roughnessMap = desk.roughnessMap;
      top.color.setHex(DESK_TINT);
      top.roughness = 0.5;
      edge.map = desk.edgeMap;
      edge.roughnessMap = desk.edgeRoughnessMap;
      edge.color.setHex(DESK_EDGE_TINT);
      edge.roughness = 0.7;
    }
    top.needsUpdate = true;
    edge.needsUpdate = true;
  }

  setLayout(targets: readonly StageTarget[], page: PageFormat, sheet: StageSheet | null, book: StageBook): void {
    const run = ++this.layoutRun;
    this.clear(this.book);
    this.clear(this.pages);
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];

    this.page = page;
    this.format = book.format;
    const w = page.width / 1000;
    const h = page.height / 1000;
    const closed = book.format === "cover" || book.format === "back";
    const edge = new MeshStandardMaterial({ color: PAGE_EDGE_COLOR, roughness: 1 });
    const top = new MeshStandardMaterial({ color: PAGE_COLOR, roughness: 1 });
    const board = new MeshStandardMaterial({ color: COVER_COLOR, roughness: 0.8 });
    const blockTop = -3 * LAYER;
    let bottom: number;
    let shadowWidth: number;
    if (closed) {
      // The closed book, seen from the front or the back cover: the printed cover board on top, the whole block of
      // paper under it, the other board below – centred on the origin, one page wide
      const block = Math.min(2 * BLOCK_MAX, Math.max(BLOCK_MIN, book.spreads * SHEET_THICKNESS));
      const boardW = w + 2 * COVER_OVERHANG;
      const boardH = h + 2 * COVER_OVERHANG;
      const upper = new Mesh(new BoxGeometry(boardW, boardH, COVER_THICKNESS), board);
      upper.position.set(0, 0, blockTop - COVER_THICKNESS / 2);
      const stack = new Mesh(new BoxGeometry(w, h, block), [edge, edge, edge, edge, top, top]);
      stack.position.set(0, 0, blockTop - COVER_THICKNESS - block / 2);
      const lower = new Mesh(new BoxGeometry(boardW, boardH, COVER_THICKNESS), board);
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
      const cover = new Mesh(new BoxGeometry(2 * w + 2 * COVER_OVERHANG, h + 2 * COVER_OVERHANG, COVER_THICKNESS), board);
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
      this.loader.setCrossOrigin("anonymous");
      this.loader.load(sheet.image, texture => {
        if (run !== this.layoutRun) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        this.textures.push(texture);
        paper.material.map = texture;
        paper.material.needsUpdate = true;
      });
    } else if (!closed) {
      const spine = new Mesh(new PlaneGeometry(0.002, h), new MeshBasicMaterial({ color: SPINE_COLOR }));
      spine.position.z = -2 * LAYER;
      this.book.add(spine);
    }

    targets.forEach(target => {
      const plane = new Mesh(new PlaneGeometry(target.width / 1000, target.height / 1000), new MeshBasicMaterial({ color: 0xffffff }));
      plane.userData.targetId = target.id;
      const pageLeft = surfaceLeft(target.surface, page);
      // One layer under the target's own plane: the entities sit at z = 0 of the target, the print just below
      plane.position.set(
        (pageLeft + target.x + target.width / 2) / 1000,
        (page.height / 2 - target.y - target.height / 2) / 1000,
        -LAYER,
      );
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
        const aspect = texture.image.height / texture.image.width;
        plane.geometry.dispose();
        plane.geometry = new PlaneGeometry(target.width / 1000, (target.width * aspect) / 1000);
        plane.position.y = (page.height / 2 - target.y - (target.width * aspect) / 2) / 1000;
        plane.material.map = texture;
        plane.material.needsUpdate = true;
      });
    });
  }

  /** The sky and the light: the HDRI while rendered, else the scene's own lights over the editor's dark ground */
  setHdri(hdri: HdriId | null): void {
    this.hdri = hdri;
    this.wantedHdri = hdri && this.shading === "rendered" ? hdri : null;
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
   * its bottom right corner – the handles: drag the image to move it, the corner to set its printed width
   */
  setGhost(ghost: StageTarget | null): void {
    this.clear(this.ghostGroup);
    if (!ghost) return;
    const page = this.page;
    const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    const height = ghost.height || ghost.width * 0.75;
    const plane = new Mesh(new PlaneGeometry(ghost.width / 1000, height / 1000), material);
    plane.name = "ghost";
    const pageLeft = surfaceLeft(ghost.surface, page);
    plane.position.set((pageLeft + ghost.x + ghost.width / 2) / 1000, (page.height / 2 - ghost.y - height / 2) / 1000, -LAYER / 2);
    const corner = new Mesh(new PlaneGeometry(GHOST_HANDLE / 1000, GHOST_HANDLE / 1000), new MeshBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.9, depthWrite: false }));
    corner.name = "ghost-corner";
    const placeCorner = (h: number) => corner.position.set((pageLeft + ghost.x + ghost.width) / 1000, (page.height / 2 - ghost.y - h) / 1000, 0);
    placeCorner(height);
    this.ghostGroup.add(plane, corner);
    const apply = (texture: Texture) => {
      if (!plane.parent) return;
      const aspect = texture.image.height / texture.image.width;
      plane.geometry.dispose();
      plane.geometry = new PlaneGeometry(ghost.width / 1000, (ghost.width * aspect) / 1000);
      plane.position.y = (page.height / 2 - ghost.y - (ghost.width * aspect) / 2) / 1000;
      placeCorner(ghost.width * aspect);
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
    // The light: the equirectangular map as the scene's environment (its direction does not follow the orbit – the
    // room's light is even enough for that not to show)
    this.scene.background = null;
    this.scene.environment = texture;
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
    }
    this.sky.material.map?.dispose();
    this.sky.material.map = map;
    this.sky.material.color.setScalar(exposure);
    this.sky.material.needsUpdate = true;
    this.sky.visible = true;
    this.dimLights(true);
  }

  /** The scene's own lights (the engine's ambient and sun) step back while the HDRI lights the stage */
  private dimLights(on: boolean): void {
    if (on) {
      this.scene.traverse(object => {
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
      edgeMap: load(DESK_DIFFUSE, true, [1, 1]),
      edgeRoughnessMap: load(DESK_ROUGHNESS, false, [1, 1]),
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
    this.ghostTextures.forEach(texture => texture.dispose());
    this.ghostTextures.clear();
    this.clear(this.table);
    this.models.forEach(model => this.clear(model));
    this.models.clear();
    this.topMaterial.dispose();
    this.edgeMaterial.dispose();
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];
    if (this.desk) Object.values(this.desk).forEach(texture => texture.dispose());
    this.desk = null;
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
          if (material !== this.topMaterial && material !== this.edgeMaterial) material.dispose();
        });
      });
      group.remove(child);
    });
  }
}
