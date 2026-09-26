import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from "three";

/**
 * Discovery animation of an AR entity (tap on an entry not consulted yet – the WebGL counterpart of the
 * found indicator's unlock): the entity pops and turns once around the page's normal, gold sparkles burst
 * out of the page and a ring spreads on it. All in the anchor's space, so it follows the tracked page.
 */

/** Same length as the found indicator's unlock (the entry opens afterwards) */
export const CELEBRATION_MS = 1200;

const GOLD = [0xf5e7c8, 0xd2ae5a, 0xf3cc94, 0x7f6032]; // --gold-1 … --gold-4 (main.css)
const SPARKS = 56;
const PAGE_NORMAL = new Vector3(0, 0, 1);

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Deterministic pseudo random (no Math.random: same burst every time, testable) */
const random = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Start the animation of `entity` (the placement group, child of `anchor`).
 * Returns a frame function (seconds since the last frame) – false once it is done and cleaned up.
 */
export const celebrate = (anchor: Object3D, entity: Object3D): ((delta: number) => boolean) => {
  const baseScale = entity.scale.clone();
  const baseQuaternion = entity.quaternion.clone();
  const spin = new Quaternion();

  // Sparkles: from the centre, out of the page and sideways, falling back a little
  const positions = new Float32Array(SPARKS * 3);
  const colors = new Float32Array(SPARKS * 3);
  const velocities: Vector3[] = [];
  for (let i = 0; i < SPARKS; i++) {
    const angle = random(i + 1) * Math.PI * 2;
    const spread = 0.25 + random(i + 101) * 0.45;
    velocities.push(new Vector3(Math.cos(angle) * spread, Math.sin(angle) * spread, 0.35 + random(i + 201) * 0.6));
    const color = new Color(GOLD[i % GOLD.length]);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  sparkGeometry.setAttribute("color", new BufferAttribute(colors, 3));
  const sparkMaterial = new PointsMaterial({
    size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const sparks = new Points(sparkGeometry, sparkMaterial);

  // Ring on the page
  const ringGeometry = new RingGeometry(0.2, 0.23, 64);
  const ringMaterial = new MeshBasicMaterial({
    color: GOLD[1], transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
  });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.position.z = 0.002;
  anchor.add(sparks, ring);

  let elapsed = 0;
  const finish = () => {
    entity.scale.copy(baseScale);
    entity.quaternion.copy(baseQuaternion);
    sparks.removeFromParent();
    ring.removeFromParent();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
  };

  return (delta: number) => {
    elapsed += delta * 1000;
    const t = Math.min(1, elapsed / CELEBRATION_MS);

    // Pop: up to 1.3× in the first third (overshooting), back to 1× by the end
    const pop = t < 0.3 ? easeOutBack(t / 0.3) * 0.3 : 0.3 * (1 - easeInOut((t - 0.3) / 0.7));
    entity.scale.copy(baseScale).multiplyScalar(1 + pop);
    // One turn around the page's normal
    spin.setFromAxisAngle(PAGE_NORMAL, easeInOut(t) * Math.PI * 2);
    entity.quaternion.copy(baseQuaternion).premultiply(spin);

    // Sparkles fly out, slow down, fade
    const s = elapsed / 1000;
    velocities.forEach((v, i) => {
      positions[i * 3] = v.x * s;
      positions[i * 3 + 1] = v.y * s;
      positions[i * 3 + 2] = 0.02 + v.z * s - 0.45 * s * s;
    });
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkMaterial.opacity = 1 - t * t;

    // Ring spreads and fades
    ring.scale.setScalar(1 + t * 3);
    ringMaterial.opacity = (1 - t) * 0.9;

    if (t < 1) return true;
    finish();
    return false;
  };
};
