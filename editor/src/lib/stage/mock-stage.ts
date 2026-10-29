import {
  Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene, SRGBColorSpace, Texture, TextureLoader,
} from "three";
import type { PreviewBackdrop } from "./preview";
import { BoxGeometry } from "three";
import type { PageFormat, StageBook, StageSheet, StageTarget, StageView } from "./mock-tracker";

/**
 * A plane sits a hair below the one above it, so nothing flickers: the entities' plane is the target's (z = 0, as
 * the tracker reports it), the printed image lies one layer under it, the sheet's image another, the paper block
 * under that. Half a millimetre is invisible at a reading distance and enough for the depth buffer.
 */
const LAYER = 0.0005;
/** Backdrop colours */
const TABLE_COLOR = 0x6e5a44;
const PAPER_BACKDROP_COLOR = 0xdedbd2;
const PAGE_COLOR = 0xf3efe6;
const PAGE_EDGE_COLOR = 0xe6e1d6;
const SPINE_COLOR = 0xd8d2c4;
const COVER_COLOR = 0x2b2724;
/** The book as an object (metres): a sheet's thickness, the block's bounds, the cover's board and its overhang */
const SHEET_THICKNESS = 0.00015;
const BLOCK_MIN = 0.003;
const BLOCK_MAX = 0.04;
const COVER_THICKNESS = 0.002;
const COVER_OVERHANG = 0.003;
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

  constructor(private scene: Scene, private container: HTMLElement) {
    this.group.name = "mock-stage";
    this.group.matrixAutoUpdate = false;
    this.table = new Mesh(new PlaneGeometry(TABLE_WIDTH, TABLE_DEPTH), new MeshStandardMaterial({ color: TABLE_COLOR, roughness: 0.9 }));
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

  setBackdrop(backdrop: PreviewBackdrop, photo: string | null): void {
    const usePhoto = backdrop === "photo" && !!photo;
    this.table.visible = !usePhoto;
    this.table.material.color.setHex(backdrop === "paper" ? PAPER_BACKDROP_COLOR : TABLE_COLOR);
    this.container.style.backgroundImage = usePhoto ? `url(${photo})` : "";
    this.container.style.backgroundSize = usePhoto ? "cover" : "";
    this.container.style.backgroundPosition = usePhoto ? "center" : "";
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
