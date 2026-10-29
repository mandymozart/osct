import {
  BoxGeometry, EquirectangularReflectionMapping, Group, Light, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  RepeatWrapping, Scene, SphereGeometry, SRGBColorSpace, Texture, TextureLoader, UVMapping,
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { PageFormat, StageBook, StageSheet, StageTarget, StageView } from "./mock-tracker";
import type { HdriId, PreviewBackdrop } from "./preview";

/**
 * A plane sits a hair below the one above it, so nothing flickers: the entities' plane is the target's (z = 0, as
 * the tracker reports it), the printed image lies one layer under it, the sheet's image another, the paper block
 * under that. Half a millimetre is invisible at a reading distance and enough for the depth buffer.
 */
const LAYER = 0.0005;
/**
 * Backdrop colours. The desk is a screen-printed plywood board (Siebdruckplatte): Poly Haven's plywood texture
 * tinted to the dark phenolic brown, roughness from its map. The cover is a white hardcover board.
 */
const DESK_TINT = 0x3b2416;
const PAPER_BACKDROP_COLOR = 0xdedbd2;
const PAGE_COLOR = 0xf3efe6;
const PAGE_EDGE_COLOR = 0xe6e1d6;
const SPINE_COLOR = 0xd8d2c4;
const COVER_COLOR = 0xf2efe9;
/** The book as an object (metres): a sheet's thickness, the block's bounds, the cover's board and its overhang */
const SHEET_THICKNESS = 0.00015;
const BLOCK_MIN = 0.003;
const BLOCK_MAX = 0.04;
const COVER_THICKNESS = 0.003;
const COVER_OVERHANG = 0.003;
/** The desk texture's files and how often it repeats across the table */
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
/** The table around the book (metres) */
const TABLE_WIDTH = 1.4;
const TABLE_DEPTH = 1.0;

/**
 * The mock stage: what the camera would show – a table, the open book in its page format (the sheet as laid out when
 * the content has the book's layout, blank pages otherwise), the current spread's printed images where they are
 * printed (or in a row), all in the same three.js scene as the entities, moved as one group by the tracker's camera
 * (the three.js camera stays at the origin, as in AR). Backdrops: the table, plain paper, or the reader's photo as
 * the container's background (the table is hidden, the book stays so the entities keep their paper). Nothing of this
 * is lit differently from AR: the scene's lights stay.
 */
export class MockStage implements StageView {
  private group = new Group();
  private table: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private book = new Group();
  private pages = new Group();
  private textures: Texture[] = [];
  private loader = new TextureLoader();
  private layoutRun = 0;
  private desk: { map: Texture; roughnessMap: Texture } | null = null;
  private hdris = new Map<string, Texture>();
  private wantedHdri: string | null = null;
  /** The sky: the HDRI on a sphere inside the stage's group, so it turns with the stage by construction */
  private sky: Mesh<SphereGeometry, MeshBasicMaterial> | null = null;
  /** The scene's own lights at their intensity before the HDRI dimmed them */
  private dimmed = new Map<Light, number>();

  /** `assetUrl`: where the editor's static files live (`hdri/…`, `textures/…`) */
  constructor(private scene: Scene, private container: HTMLElement, private assetUrl: (path: string) => string = path => `/${path}`) {
    this.group.name = "mock-stage";
    this.group.matrixAutoUpdate = false;
    this.table = new Mesh(new PlaneGeometry(TABLE_WIDTH, TABLE_DEPTH), new MeshStandardMaterial({ color: DESK_TINT, roughness: 0.5 }));
    this.table.position.z = -BLOCK_MIN - COVER_THICKNESS - 6 * LAYER;
    this.group.add(this.table, this.book, this.pages);
    scene.add(this.group);
  }

  setLayout(targets: readonly StageTarget[], page: PageFormat, sheet: StageSheet | null, book: StageBook): void {
    const run = ++this.layoutRun;
    this.clear(this.book);
    this.clear(this.pages);
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];

    const w = page.width / 1000;
    const h = page.height / 1000;
    // The open book: two blocks of paper (half the sheets each) on a cover board that overhangs the pages, the
    // block's thickness an approximation from the number of spreads, a soft shadow under the cover on the table
    const block = Math.min(BLOCK_MAX, Math.max(BLOCK_MIN, (book.spreads * SHEET_THICKNESS) / 2));
    const blockTop = -3 * LAYER;
    const edge = new MeshStandardMaterial({ color: PAGE_EDGE_COLOR, roughness: 1 });
    const top = new MeshStandardMaterial({ color: PAGE_COLOR, roughness: 1 });
    [-1, 1].forEach(side => {
      const stack = new Mesh(new BoxGeometry(w, h, block), [edge, edge, edge, edge, top, edge]);
      stack.position.set((side * w) / 2, 0, blockTop - block / 2);
      this.book.add(stack);
    });
    const cover = new Mesh(
      new BoxGeometry(2 * w + 2 * COVER_OVERHANG, h + 2 * COVER_OVERHANG, COVER_THICKNESS),
      new MeshStandardMaterial({ color: COVER_COLOR, roughness: 0.8 }),
    );
    cover.position.set(0, 0, blockTop - block - COVER_THICKNESS / 2);
    this.book.add(cover);
    const bottom = blockTop - block - COVER_THICKNESS;
    const shadow = new Mesh(new PlaneGeometry(2 * w + 2 * COVER_OVERHANG + 0.012, h + 2 * COVER_OVERHANG + 0.012), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
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
    } else {
      const spine = new Mesh(new PlaneGeometry(0.002, h), new MeshBasicMaterial({ color: SPINE_COLOR }));
      spine.position.z = -2 * LAYER;
      this.book.add(spine);
    }

    targets.forEach(target => {
      const plane = new Mesh(new PlaneGeometry(target.width / 1000, target.height / 1000), new MeshBasicMaterial({ color: 0xffffff }));
      const pageLeft = target.surface === "left" ? -page.width : 0;
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

  setBackdrop(backdrop: PreviewBackdrop, photo: string | null, hdri: HdriId | null = null): void {
    const usePhoto = backdrop === "photo" && !!photo;
    this.table.visible = !usePhoto;
    this.container.style.backgroundImage = usePhoto ? `url(${photo})` : "";
    this.container.style.backgroundSize = usePhoto ? "cover" : "";
    this.container.style.backgroundPosition = usePhoto ? "center" : "";
    // The desk: plain paper, or the screen-printed board
    const material = this.table.material;
    if (backdrop === "paper") {
      material.map = null;
      material.roughnessMap = null;
      material.color.setHex(PAPER_BACKDROP_COLOR);
      material.roughness = 1;
    } else {
      const desk = this.ensureDesk();
      material.map = desk.map;
      material.roughnessMap = desk.roughnessMap;
      material.color.setHex(DESK_TINT);
      material.roughness = 0.5;
    }
    material.needsUpdate = true;
    // The sky and the light: the HDRI, else the scene's own lights over the editor's dark ground
    this.wantedHdri = backdrop === "hdri" && hdri ? hdri : null;
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

  private ensureDesk(): { map: Texture; roughnessMap: Texture } {
    if (this.desk) return this.desk;
    const load = (path: string, srgb: boolean) => {
      const texture = this.loader.load(this.assetUrl(path));
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(DESK_REPEAT[0], DESK_REPEAT[1]);
      if (srgb) texture.colorSpace = SRGBColorSpace;
      return texture;
    };
    this.desk = { map: load(DESK_DIFFUSE, true), roughnessMap: load(DESK_ROUGHNESS, false) };
    return this.desk;
  }

  update(cameraInverse: Matrix4): void {
    this.group.matrix.copy(cameraInverse);
    this.group.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    this.layoutRun++;
    this.clear(this.book);
    this.clear(this.pages);
    this.table.geometry.dispose();
    this.table.material.dispose();
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];
    this.desk?.map.dispose();
    this.desk?.roughnessMap.dispose();
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
    this.container.style.backgroundImage = "";
    this.container.style.backgroundSize = "";
    this.container.style.backgroundPosition = "";
  }

  private clear(group: Group): void {
    [...group.children].forEach(child => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose());
      }
      group.remove(child);
    });
  }
}
