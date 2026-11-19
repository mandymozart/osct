import { CanvasTexture, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, type PerspectiveCamera, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";
import { AssetStore } from "@engine/scene/assets";
import { buildEntity, placeEntity, type EntityInstance } from "@engine/scene/entities";
import { ArView, BACKDROP_LAYER } from "@engine/scene/view";
import type { EntityData, Target } from "@engine/types";
import type { PlacementParams, SceneParams } from "./params";
import { anchorBounds } from "./reveal";

/**
 * The reader's conditions without a camera: the engine's `ArView` (its renderer, lights and bloom, the transparent
 * canvas over a background that stands in for the camera picture), an anchor group that gets the page's pose each
 * frame as a tracker reports it (the camera stays at the origin), and on it the entity the engine's `model` builder
 * makes from the file – loaded by the engine's asset store, placed by `params` as the content places it.
 */

const NEAR = 0.01;
const FAR = 100;
/** The printed target: 1 unit wide (the engine's unit), a portrait picture */
const TARGET_HEIGHT = 1.3;

/** A stand-in for the printed image: something dark with structure, so the entity reads against a print */
const printTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 * TARGET_HEIGHT);
  const c = canvas.getContext("2d")!;
  const gradient = c.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#5b5148");
  gradient.addColorStop(1, "#2b2622");
  c.fillStyle = gradient;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = "rgba(245, 231, 200, 0.16)";
  c.lineWidth = 2;
  for (let r = 40; r < 520; r += 44) {
    c.beginPath();
    c.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.strokeStyle = "rgba(245, 231, 200, 0.3)";
  c.beginPath();
  c.moveTo(canvas.width / 2 - 24, canvas.height / 2);
  c.lineTo(canvas.width / 2 + 24, canvas.height / 2);
  c.moveTo(canvas.width / 2, canvas.height / 2 - 24);
  c.lineTo(canvas.width / 2, canvas.height / 2 + 24);
  c.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export class Stage {
  readonly view: ArView;
  /** The target's anchor: its matrix is the page's pose in front of the camera */
  readonly anchor = new Group();
  private assets = new AssetStore();
  private loads = 0;
  private assetId = "";
  private entityData: EntityData | null = null;
  instance: EntityInstance | null = null;
  private page = new Group();
  private paper: MeshBasicMaterial;
  private time = 0;
  private cameraWorld = new Matrix4();
  /** The orbit changed by a gesture on the stage */
  onOrbit: () => void = () => {};

  constructor(private container: HTMLElement, private scene: SceneParams) {
    this.view = new ArView(container, camera => this.fit(camera));
    this.anchor.name = "sandbox";
    this.anchor.matrixAutoUpdate = false;
    this.view.scene.add(this.anchor);

    // The page: stands in for the print in the camera picture (the backdrop layer – never part of the entity)
    this.paper = new MeshBasicMaterial({ color: scene.pageColor });
    const sheet = new Mesh(new PlaneGeometry(2.7, 3.6), this.paper);
    sheet.position.z = -0.006;
    const print = new Mesh(new PlaneGeometry(1, TARGET_HEIGHT), new MeshBasicMaterial({ map: printTexture() }));
    print.position.z = -0.003;
    this.page.add(sheet, print);
    this.page.traverse(object => object.layers.set(BACKDROP_LAYER));
    this.anchor.add(this.page);

    this.view.onFrame(delta => this.frame(delta));
    this.listen();
    this.applyScene();
    this.view.start();
  }

  /** The drawing buffer's height in px (the sparks' size) */
  get bufferHeight(): number {
    return this.view.renderer.domElement.height;
  }

  /** A fixed field of view; the aspect follows the container, as the tracking engine's intrinsics would */
  private fit(camera: PerspectiveCamera): void {
    camera.fov = this.scene.fov;
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width && height) camera.aspect = width / height;
    camera.near = NEAR;
    camera.far = FAR;
    camera.updateProjectionMatrix();
  }

  /** Scene values changed: background, page, field of view */
  applyScene(): void {
    this.container.style.background = this.scene.background;
    this.page.visible = this.scene.page;
    this.paper.color.set(this.scene.pageColor);
    this.view.resize();
  }

  /** The page's pose in front of the camera: the camera orbits the page, the anchor gets the inverse */
  private frame(delta: number): void {
    this.time += delta;
    const { tilt, yaw, distance, wobble } = this.scene;
    const t = MathUtils.degToRad(tilt);
    const y = MathUtils.degToRad(yaw);
    // The reader sits at the bottom edge of the page (−y) and looks down at it
    const eye = new Vector3(Math.sin(t) * Math.sin(y), -Math.sin(t) * Math.cos(y), Math.cos(t)).multiplyScalar(distance);
    const up = new Vector3(-Math.sin(y), Math.cos(y), 0);
    if (wobble > 0) {
      const s = this.time;
      const shake = 0.012 * wobble * distance;
      eye.add(new Vector3(Math.sin(s * 1.7) + 0.5 * Math.sin(s * 4.3), Math.sin(s * 1.3 + 1) + 0.5 * Math.sin(s * 3.7), Math.sin(s * 0.9 + 2)).multiplyScalar(shake));
    }
    this.cameraWorld.lookAt(eye, new Vector3(0, 0, 0.25), up).setPosition(eye);
    if (wobble > 0) {
      const roll = MathUtils.degToRad(0.5 * wobble) * Math.sin(this.time * 1.1);
      this.cameraWorld.multiply(new Matrix4().makeRotationZ(roll));
    }
    this.anchor.matrix.copy(this.cameraWorld).invert();
    this.anchor.matrixWorldNeedsUpdate = true;
    this.instance?.update?.(delta);
  }

  /** Load a model and build its entity as the reader does; the old one is disposed */
  async load(src: string, placement: PlacementParams): Promise<void> {
    const id = `model-${++this.loads}`;
    await this.assets.load([{ id, assetType: "glb", src }]);
    if (id !== `model-${this.loads}`) return; // a later load won
    if (!this.assets.get(id)) throw new Error(`Could not load ${src}`);
    this.unload();
    this.assetId = id;
    this.entityData = { type: "model", assets: [{ id, assetType: "glb", src }], params: this.paramsOf(placement) };
    const target = { id: "sandbox", entryId: "sandbox", sceneId: "sandbox", imageSrc: "", entity: this.entityData } as Target;
    this.instance = buildEntity(target, asset => this.assets.get(asset));
    if (!this.instance) throw new Error("The engine built no entity from this file");
    this.anchor.add(this.instance.object);
    this.assets.release(new Set([id]));
  }

  private unload(): void {
    this.instance?.object.removeFromParent();
    this.instance?.dispose?.();
    this.instance = null;
    this.entityData = null;
  }

  private paramsOf(p: PlacementParams): Record<string, unknown> {
    return { position: [p.px, p.py, p.pz], rotation: [p.rx, p.ry, p.rz], scale: p.scale };
  }

  /** Place the entity by the content's `params`, through the engine's own placement */
  place(placement: PlacementParams): void {
    if (!this.instance || !this.entityData) return;
    this.entityData.params = this.paramsOf(placement);
    placeEntity(this.instance.object, this.entityData);
  }

  /**
   * A placement that fits the target: the largest side one target width, centred on the print, its base on the page –
   * the rotation stays
   */
  fitted(placement: PlacementParams): PlacementParams {
    if (!this.instance) return placement;
    const next = { ...placement, px: 0, py: 0, pz: 0 };
    this.place(next);
    let box = anchorBounds(this.anchor, this.instance.object);
    const size = box.getSize(new Vector3());
    next.scale = Number((next.scale / Math.max(size.x, size.y, size.z, 1e-6)).toFixed(4));
    this.place(next);
    box = anchorBounds(this.anchor, this.instance.object);
    const centre = box.getCenter(new Vector3());
    next.px = Number((-centre.x).toFixed(3));
    next.py = Number((-centre.y).toFixed(3));
    next.pz = Number((-box.min.z).toFixed(3));
    this.place(next);
    return next;
  }

  /**
   * A first placement for a model nobody placed yet: of the engine's default (rotated 90° around x – a model whose up
   * is y) and no rotation (a model authored in the page's own axes, its up out of the page), the one whose base lies
   * nearer the page; then fitted
   */
  upright(placement: PlacementParams): PlacementParams {
    if (!this.instance) return placement;
    const offBase = (rx: number) => {
      this.place({ ...placement, px: 0, py: 0, pz: 0, rx, ry: 0, rz: 0 });
      const box = anchorBounds(this.anchor, this.instance!.object);
      return Math.abs(box.min.z) / Math.max(box.max.z - box.min.z, 1e-6);
    };
    const rx = offBase(90) <= offBase(0) ? 90 : 0;
    return this.fitted({ ...placement, rx, ry: 0, rz: 0 });
  }

  // ── Orbit: drag turns and tilts, wheel and pinch change the distance ──

  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;

  private listen(): void {
    const el = this.container;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", event => {
      el.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.pinch = 0;
    });
    el.addEventListener("pointermove", event => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (this.pointers.size === 1) {
        this.scene.yaw = Math.round(((this.scene.yaw - dx * 0.4 + 540) % 360) - 180);
        this.scene.tilt = Math.round(Math.min(85, Math.max(0, this.scene.tilt - dy * 0.3)));
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const scene = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoom(this.pinch / scene);
        this.pinch = scene;
      }
      this.onOrbit();
    });
    const release = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      this.pinch = 0;
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("wheel", event => {
      event.preventDefault();
      this.zoom(Math.exp(event.deltaY * 0.001));
      this.onOrbit();
    }, { passive: false });
  }

  private zoom(factor: number): void {
    this.scene.distance = Number(Math.min(10, Math.max(0.8, this.scene.distance * factor)).toFixed(2));
  }
}
