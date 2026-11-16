import {
  CanvasTexture,
  FrontSide,
  Group,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";

/**
 * The marginalia card (#285): a found picture lifts off the page as a stiff playing card, turns over once about its
 * horizontal axis (the back shows halfway) and lands dead centre on the screen.
 *
 * All in the camera's space (the three.js camera stays at the origin, a target's anchor is its pose relative to the
 * camera, 1 unit = the image's width – `tracker.ts`), so only the start moves while the card flies:
 *   start  P0 = the anchor's position, n = its +z (the page's normal), q0 = its rotation, w = its scale (image width)
 *   end    P1 = the camera's (0, 0, −d), q1 = the camera's rotation (the card faces the reader, upright)
 *   path   cubic Bézier P0, P0 + lift·n, P1 + settle·forward, P1 – it rises straight off the page and settles into the
 *          centre from behind; P0's weight (1−t)³ falls to 0, so the tracking's jitter is gone by the end
 *   turn   q(t) = slerp(q0, q1, e(t)) · rotX(2π·s(t))
 * The card keeps the picture's size in the scene; perspective makes it grow. The anchor is read every frame and
 * keeps its last pose while the target is lost, so the flight just goes on from there.
 */

/** Share of the screen's width and height the card may fill at the end */
export const CARD_FILL = 0.62;
/** Total flight */
export const CARD_FLIGHT_MS = 2700;
/** How long the card stays in the centre after landing (the entry opens over it) */
export const CARD_HOLD_MS = 300;
/** The lift off the page and the settle into the centre, in card widths / end distances */
const LIFT = 0.6;
const SETTLE = 0.35;

/** The anchor's pose, split up */
export interface CardStart {
  position: Vector3;
  rotation: Quaternion;
  /** The card's width in the scene (the anchor's scale) */
  width: number;
  /** The page's normal (the anchor's +z) */
  normal: Vector3;
}

export const startFromAnchor = (matrix: Matrix4): CardStart => {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position, rotation, width: scale.x, normal: new Vector3(0, 0, 1).applyQuaternion(rotation) };
};

/**
 * How far in front of the camera a card `width` wide and `width · aspect` high fills `fill` of the screen in both
 * directions: d = max(w / (2f·tan(hFov/2)), h / (2f·tan(vFov/2))). The tangents come from the projection matrix (the
 * tracker sets the matrix, not `fov`); never closer than just beyond the near plane.
 */
export const endDistance = (projection: Matrix4, width: number, aspect: number, fill = CARD_FILL): number => {
  const e = projection.elements;
  const tanHalfH = 1 / e[0];
  const tanHalfV = 1 / e[5];
  const near = e[14] / (e[10] - 1);
  const d = Math.max(width / (2 * fill * tanHalfH), (width * aspect) / (2 * fill * tanHalfV));
  return Math.max(d, Number.isFinite(near) && near > 0 ? near * 1.5 : 0);
};

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 0 before `from`, 1 after `to`, smooth in between */
const smoothRange = (t: number, from: number, to: number): number => {
  const x = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

export const bezier = (p0: Vector3, c1: Vector3, c2: Vector3, p1: Vector3, t: number, out = new Vector3()): Vector3 => {
  const u = 1 - t;
  return out
    .copy(p0).multiplyScalar(u * u * u)
    .addScaledVector(c1, 3 * u * u * t)
    .addScaledVector(c2, 3 * u * t * t)
    .addScaledVector(p1, t * t * t);
};

const X_AXIS = new Vector3(1, 0, 0);

/**
 * The card's position and rotation at `t` (0…1 of the flight), in the scene. `camera` gives the end: its world
 * matrix (where the reader looks) and its projection (how far away the card fills the screen).
 */
export const cardPose = (
  start: CardStart,
  camera: Pick<PerspectiveCamera, "matrixWorld" | "projectionMatrix" | "quaternion">,
  aspect: number,
  t: number,
): { position: Vector3; rotation: Quaternion } => {
  const d = endDistance(camera.projectionMatrix, start.width, aspect);
  const end = new Vector3(0, 0, -d).applyMatrix4(camera.matrixWorld);
  const forward = new Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
  const lift = start.position.clone().addScaledVector(start.normal, LIFT * start.width);
  const settle = end.clone().addScaledVector(forward, SETTLE * d);
  const e = easeInOutCubic(Math.min(1, Math.max(0, t)));
  const position = bezier(start.position, lift, settle, end, e);
  const flip = new Quaternion().setFromAxisAngle(X_AXIS, 2 * Math.PI * smoothRange(t, 0.12, 0.88));
  const rotation = start.rotation.clone().slerp(camera.quaternion, e).multiply(flip);
  return { position, rotation };
};

/** The card's back until the book has one of its own: dark, a gold frame and a gold diamond (DESIGN.md's golds) */
const defaultBack = (): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#14110d";
    g.fillRect(0, 0, 256, 256);
    const gold = g.createLinearGradient(0, 0, 256, 256);
    gold.addColorStop(0, "#f5e7c8");
    gold.addColorStop(0.32, "#7f6032");
    gold.addColorStop(0.57, "#d2ae5a");
    gold.addColorStop(1, "#f3cc94");
    g.strokeStyle = gold;
    g.lineWidth = 8;
    g.strokeRect(14, 14, 228, 228);
    g.beginPath();
    g.moveTo(128, 70);
    g.lineTo(178, 128);
    g.lineTo(128, 186);
    g.lineTo(78, 128);
    g.closePath();
    g.lineWidth = 5;
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

/**
 * One flight: a two-sided card added to the scene, moved every frame by `update`, removed by `dispose`.
 * The front is the picture, the back lies behind it turned about the card's horizontal axis, so it reads upright
 * once the card has turned half way.
 */
export class CardFlight {
  readonly object = new Group();
  private elapsed = 0;
  private start: CardStart;
  private textures: Texture[] = [];

  constructor(
    anchor: Matrix4,
    front: Texture,
    private aspect: number,
    back: Texture | null = null,
    private duration = CARD_FLIGHT_MS,
  ) {
    this.start = startFromAnchor(anchor);
    const backTexture = back ?? defaultBack();
    this.textures = [front, backTexture];
    const geometry = new PlaneGeometry(1, aspect);
    // On top of the page and its entities: no depth test, drawn last
    const material = (map: Texture) => new MeshBasicMaterial({ map, side: FrontSide, depthTest: false, depthWrite: false, transparent: true });
    const frontMesh = new Mesh(geometry, material(front));
    const backMesh = new Mesh(geometry, material(backTexture));
    backMesh.rotation.x = Math.PI;
    for (const mesh of [frontMesh, backMesh]) {
      mesh.renderOrder = 10_000;
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
    this.object.name = "marginalia-card";
  }

  /**
   * Advance by `delta` (s); `anchor` is the anchor's pose this frame (null: keep the last). False once the card has
   * landed. The card keeps the picture's width at the start, so it lands at the size `endDistance` planned for.
   */
  update(delta: number, anchor: Matrix4 | null, camera: PerspectiveCamera): boolean {
    if (anchor) {
      // Only the pose follows the page; the width stays, so the end distance does not jump with the tracking's scale
      this.start = { ...startFromAnchor(anchor), width: this.start.width };
    }
    this.elapsed += delta * 1000;
    const t = Math.min(1, this.elapsed / this.duration);
    const { position, rotation } = cardPose(this.start, camera, this.aspect, t);
    this.object.position.copy(position);
    this.object.quaternion.copy(rotation);
    this.object.scale.setScalar(this.start.width);
    return t < 1;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.traverse(node => {
      if (node instanceof Mesh) {
        (node.material as MeshBasicMaterial).dispose();
      }
    });
    (this.object.children[0] as Mesh | undefined)?.geometry.dispose();
    // The flight owns its textures (the front is loaded for it)
    this.textures.forEach(texture => texture.dispose());
  }
}
