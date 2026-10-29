import {
  Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene, SRGBColorSpace, Texture, TextureLoader,
} from "three";
import type { PreviewBackdrop } from "./preview";
import type { PageFormat, StageSheet, StageTarget, StageView } from "./mock-tracker";

/** A paper plane sits a hair above the one below it, so nothing flickers */
const LAYER = 0.0005;
/** Backdrop colours */
const TABLE_COLOR = 0x6e5a44;
const PAPER_BACKDROP_COLOR = 0xdedbd2;
const PAGE_COLOR = 0xf3efe6;
const SPINE_COLOR = 0xd8d2c4;
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
    this.table.position.z = -4 * LAYER;
    this.group.add(this.table, this.book, this.pages);
    scene.add(this.group);
  }

  setLayout(targets: readonly StageTarget[], page: PageFormat, sheet: StageSheet | null): void {
    const run = ++this.layoutRun;
    this.clear(this.book);
    this.clear(this.pages);
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];

    const w = page.width / 1000;
    const h = page.height / 1000;
    const shadow = new Mesh(new PlaneGeometry(2 * w + 0.012, h + 0.012), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
    shadow.position.set(0.003, -0.004, -3 * LAYER);
    this.book.add(shadow);
    if (sheet) {
      // The sheet as laid out, centred on the spine (a double page spans both pages)
      const paper = new Mesh(new PlaneGeometry(sheet.widthMm / 1000, sheet.heightMm / 1000), new MeshBasicMaterial({ color: PAGE_COLOR }));
      paper.position.set(0, 0, -LAYER);
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
      const paper = new MeshStandardMaterial({ color: PAGE_COLOR, roughness: 1 });
      const left = new Mesh(new PlaneGeometry(w, h), paper);
      left.position.set(-w / 2, 0, -2 * LAYER);
      const right = new Mesh(new PlaneGeometry(w, h), paper);
      right.position.set(w / 2, 0, -LAYER);
      const spine = new Mesh(new PlaneGeometry(0.002, h), new MeshBasicMaterial({ color: SPINE_COLOR }));
      this.book.add(left, right, spine);
    }

    targets.forEach(target => {
      const plane = new Mesh(new PlaneGeometry(target.width / 1000, target.height / 1000), new MeshBasicMaterial({ color: 0xffffff }));
      const pageLeft = target.surface === "left" ? -page.width : 0;
      plane.position.set(
        (pageLeft + target.x + target.width / 2) / 1000,
        (page.height / 2 - target.y - target.height / 2) / 1000,
        0,
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
