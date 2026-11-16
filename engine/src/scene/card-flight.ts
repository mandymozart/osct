import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  CatmullRomCurve3,
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
 * The marginalia card (#285): a found picture peels off the page as a playing card, rises, spins about its vertical
 * axis (the back shows, then the front again), and slaps against the screen dead centre – a gold flash, a rumble.
 *
 * All in the camera's space (the three.js camera stays at the origin, a target's anchor is its pose relative to the
 * camera, 1 unit = the image's width – `tracker.ts`), so only the start moves while the card flies:
 *   start  P0 = the anchor's position, n = its +z (the page's normal), q0 = its rotation, w = its scale (image width)
 *   end    P1 = the camera's (0, 0, −d), q1 = the camera's rotation (the card faces the reader, upright)
 *   path   a centripetal Catmull-Rom through P0 → up off the page (P0 + lift·n) → a turn on the way to a point
 *          straight behind the landing → P1, walked in three phases (`phases`): rise (eases out to a hover), spin
 *          (eases in and out), slap (eases in – full speed at the screen). The page's points follow the anchor each
 *          frame; their weight is gone by the slap, so the tracking's jitter never reaches the landing.
 *   turn   q(t) = slerp(q0, q1, w(t)) · peel · spinY · roll
 *   bend   during the rise the card's top edge curls up off the page (the bottom edge stays down), then it is stiff
 *   impact after landing (`IMPACT_MS`): the card is pushed at the reader and bounces back, shakes, a gold halo flashes
 *          behind it (`flash`, also the scene's bloom), the phone vibrates once.
 */

/** Share of the screen's width and height the card may fill at the end */
export const CARD_FILL = 0.62;
/** The flight from the page to the screen */
export const CARD_FLIGHT_MS = 2700;
/** The slap: push, bounce, shake and flash after the card reached the screen */
export const IMPACT_MS = 480;
/** How long the card stays in the centre after the impact (the entry opens over it) */
export const CARD_HOLD_MS = 250;
/** Where the rise ends and the slap starts (0…1 of the flight) */
const RISE_END = 0.28;
const SLAP_START = 0.74;
/** Up off the page, in card widths; how far the turn swings out to the side */
const LIFT = 0.6;
const SWING = 0.18;
/** The slap starts from this far behind the landing, in end distances */
const BEHIND = 1.9;
/** The bend's strongest curl of the top edge, radians */
const CURL = 1.1;
/** Bend segments along the card's height */
const BEND_SEGMENTS = 18;

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

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const easeInCubic = (t: number): number => t * t * t;
const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/** The three phases' local progress (each 0…1) at `t` of the flight */
export const phases = (t: number): { rise: number; spin: number; slap: number } => ({
  rise: clamp01(t / RISE_END),
  spin: clamp01((t - RISE_END) / (SLAP_START - RISE_END)),
  slap: clamp01((t - SLAP_START) / (1 - SLAP_START)),
});

/** How far along the path (0…1, the Catmull-Rom's own parameter: a third per leg) the card is at `t` */
export const pathProgress = (t: number): number => {
  const { rise, spin, slap } = phases(t);
  return (easeOutCubic(rise) + easeInOutSine(spin) + easeInCubic(slap)) / 3;
};

/** How far the top edge curls at `t`: up fast while it peels, back to flat by the end of the rise */
export const bendAt = (t: number): number => {
  const rise = phases(t).rise;
  return rise < 0.35 ? easeOutCubic(rise / 0.35) : 1 - easeInOutSine((rise - 0.35) / 0.65);
};

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

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
  t = clamp01(t);
  const d = endDistance(camera.projectionMatrix, start.width, aspect);
  const end = new Vector3(0, 0, -d).applyMatrix4(camera.matrixWorld);
  const right = new Vector3(1, 0, 0).transformDirection(camera.matrixWorld);
  const up = start.position.clone().addScaledVector(start.normal, LIFT * start.width);
  // The turn: on the way to a point straight behind the landing (so the slap comes straight at the reader), swung
  // out a little to the side
  const behind = new Vector3(0, 0, -BEHIND * d).applyMatrix4(camera.matrixWorld);
  const turn = up.clone().lerp(behind, 0.65).addScaledVector(right, SWING * start.width);
  const curve = new CatmullRomCurve3([start.position, up, turn, end], false, "centripetal");
  const position = curve.getPoint(pathProgress(t));

  const { rise, spin } = phases(t);
  // Towards facing the reader: a little during the rise, the rest during the spin
  const facing = rise < 1 ? 0.2 * easeOutCubic(rise) : 0.2 + 0.8 * easeInOutSine(spin);
  const peel = new Quaternion().setFromAxisAngle(X_AXIS, -0.35 * Math.sin(Math.PI * rise));
  const turnY = new Quaternion().setFromAxisAngle(Y_AXIS, 2 * Math.PI * easeInOutCubic(spin));
  const roll = new Quaternion().setFromAxisAngle(Z_AXIS, 0.28 * Math.sin(Math.PI * spin));
  const rotation = start.rotation.clone().slerp(camera.quaternion, facing).multiply(peel).multiply(turnY).multiply(roll);
  return { position, rotation };
};

/**
 * The impact at `ms` after the card reached the screen: `push` towards the reader (a share of the end distance; it
 * bounces back), `shake` sideways (card widths) and the `flash` (0…1).
 */
export const impactAt = (ms: number): { push: number; shake: [number, number]; flash: number } => {
  if (ms < 0 || ms >= IMPACT_MS) return { push: 0, shake: [0, 0], flash: 0 };
  const decay = Math.exp(-ms / 110);
  return {
    push: 0.09 * Math.exp(-ms / 70) * Math.cos(ms / 38),
    shake: [0.018 * decay * Math.sin(ms * 0.11), 0.014 * decay * Math.sin(ms * 0.17 + 1)],
    flash: ms < 50 ? ms / 50 : Math.max(0, 1 - (ms - 50) / (IMPACT_MS - 50)) ** 2,
  };
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

/** The flash's halo: the reveal's golds, bright in the middle, gone at the edge */
const haloTexture = (): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    const glow = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, "rgba(245, 231, 200, 1)");
    glow.addColorStop(0.35, "rgba(243, 204, 148, .85)");
    glow.addColorStop(0.65, "rgba(210, 174, 90, .35)");
    glow.addColorStop(1, "rgba(127, 96, 50, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

/** The back's geometry: the front's positions (shared, so the bend reaches both), the other winding, mirrored u */
const backOf = (front: PlaneGeometry): PlaneGeometry => {
  const back = front.clone() as PlaneGeometry;
  back.setAttribute("position", front.getAttribute("position"));
  const index = back.getIndex();
  if (index) {
    const order = index.array.slice();
    for (let i = 0; i < order.length; i += 3) [order[i + 1], order[i + 2]] = [order[i + 2], order[i + 1]];
    back.setIndex(new BufferAttribute(order, 1));
  }
  const uv = back.getAttribute("uv") as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  return back;
};

/**
 * One flight: a two-sided card added to the scene, moved every frame by `update`, removed by `dispose`.
 * The back reads upright once the card has turned half way about its vertical axis.
 */
export class CardFlight {
  readonly object = new Group();
  /** The impact's flash now (0…1): the halo, and the scene's bloom */
  flash = 0;
  private elapsed = 0;
  private start: CardStart;
  private textures: Texture[] = [];
  private geometry: PlaneGeometry;
  private flat: Float32Array;
  private halo: Mesh;
  private rumbled = false;

  constructor(
    anchor: Matrix4,
    front: Texture,
    private aspect: number,
    back: Texture | null = null,
    private duration = CARD_FLIGHT_MS,
  ) {
    this.start = startFromAnchor(anchor);
    const backTexture = back ?? defaultBack();
    const glow = haloTexture();
    this.textures = [front, backTexture, glow];
    this.geometry = new PlaneGeometry(1, aspect, 1, BEND_SEGMENTS);
    this.flat = (this.geometry.getAttribute("position").array as Float32Array).slice();
    // On top of the page and its entities: no depth test, drawn last
    const material = (map: Texture) => new MeshBasicMaterial({ map, side: FrontSide, depthTest: false, depthWrite: false, transparent: true });
    const frontMesh = new Mesh(this.geometry, material(front));
    const backMesh = new Mesh(backOf(this.geometry), material(backTexture));
    this.halo = new Mesh(
      new PlaneGeometry(1.9, aspect + 0.9),
      new MeshBasicMaterial({ map: glow, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0 }),
    );
    this.halo.position.z = -0.02;
    this.halo.renderOrder = 9_999;
    for (const mesh of [frontMesh, backMesh]) mesh.renderOrder = 10_000;
    for (const mesh of [this.halo, frontMesh, backMesh]) {
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
    this.object.name = "marginalia-card";
  }

  /**
   * Advance by `delta` (s); `anchor` is the anchor's pose this frame (null: keep the last). False once the impact is
   * over. The card keeps the picture's width at the start, so it lands at the size `endDistance` planned for.
   */
  update(delta: number, anchor: Matrix4 | null, camera: PerspectiveCamera): boolean {
    if (anchor) {
      // Only the pose follows the page; the width stays, so the end distance does not jump with the tracking's scale
      this.start = { ...startFromAnchor(anchor), width: this.start.width };
    }
    this.elapsed += delta * 1000;
    const t = Math.min(1, this.elapsed / this.duration);
    const { position, rotation } = cardPose(this.start, camera, this.aspect, t);
    const impact = impactAt(this.elapsed - this.duration);
    if (this.elapsed >= this.duration) {
      if (!this.rumbled) {
        this.rumbled = true;
        if (typeof navigator !== "undefined") navigator.vibrate?.([40, 30, 60]);
      }
      const towards = new Vector3().setFromMatrixPosition(camera.matrixWorld).sub(position);
      position.addScaledVector(towards, impact.push);
      const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
      const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
      position.addScaledVector(right, impact.shake[0] * this.start.width).addScaledVector(up, impact.shake[1] * this.start.width);
    }
    this.flash = impact.flash;
    (this.halo.material as MeshBasicMaterial).opacity = impact.flash;
    this.halo.scale.setScalar(1 + 0.35 * (1 - impact.flash));
    this.bend(bendAt(t));
    this.object.position.copy(position);
    this.object.quaternion.copy(rotation);
    this.object.scale.setScalar(this.start.width);
    return this.elapsed < this.duration + IMPACT_MS;
  }

  /** Curl the card's top edge up off the page by `amount` (0 = flat): a cylinder whose axis lies along the bottom edge */
  private bend(amount: number): void {
    const positions = this.geometry.getAttribute("position") as BufferAttribute;
    const height = this.aspect;
    const bottom = -height / 2;
    const k = (amount * CURL) / height; // curvature: the top edge turns by `amount · CURL`
    for (let i = 0; i < positions.count; i++) {
      const y = this.flat[i * 3 + 1] - bottom;
      if (k < 1e-5) positions.setXYZ(i, this.flat[i * 3], this.flat[i * 3 + 1], 0);
      else positions.setXYZ(i, this.flat[i * 3], bottom + Math.sin(k * y) / k, (1 - Math.cos(k * y)) / k);
    }
    positions.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.traverse(node => {
      if (node instanceof Mesh) {
        (node.material as MeshBasicMaterial).dispose();
        node.geometry.dispose();
      }
    });
    // The flight owns its textures (the front is loaded for it)
    this.textures.forEach(texture => texture.dispose());
  }
}
