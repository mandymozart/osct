/**
 * Placement of an AR entity on its target (Tilman 2026-09-26): `entity.params` in the content –
 *
 *   entity:
 *     type: model
 *     src: racoon.glb
 *     params:
 *       rotation: [90, 45, 0]   # degrees: x tips it up (90 = standing), y turns it around its own
 *                               # vertical axis, z tilts it sideways (three.js Euler order XYZ)
 *       position: [0, 0.1, 0]   # in target widths
 *       scale: 0.5              # one number, or [x, y, z]
 *
 * Axes (the printed page = the target): x → right, y → towards the top of the page, z → out of the
 * page (towards the reader). 1 unit = the target image's width, origin in its centre.
 * Defaults per entity type: models stand **on the page** (rotated 90° around x: the model's up points
 * out of the page, its front towards the bottom edge – the reader); videos and images lie flat on it.
 * Every missing value takes the default, so `rotation: [90, 180, 0]` alone turns a model around.
 *
 * Checked by the content build and the config guard (`placementProblems`), applied by the client
 * (`resolvePlacement`).
 */

export type Vector3Data = [number, number, number];

export interface PlacementData {
  position?: Vector3Data;
  rotation?: Vector3Data;
  scale?: number | Vector3Data;
}

export interface Placement {
  position: Vector3Data;
  /** Degrees, Euler order XYZ */
  rotation: Vector3Data;
  scale: Vector3Data;
}

export const PLACEMENT_KEYS = ["position", "rotation", "scale"] as const;

const FLAT: Placement = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

/** Defaults by entity type (other types lie flat, size 1) */
export const PLACEMENT_DEFAULTS: Record<string, Placement> = {
  model: { position: [0, 0, 0], rotation: [90, 0, 0], scale: [0.5, 0.5, 0.5] },
  video: FLAT,
  image: FLAT,
};

const isVector = (value: unknown): value is Vector3Data =>
  Array.isArray(value) && value.length === 3 && value.every(v => typeof v === "number" && Number.isFinite(v));

/** Problems of the placement keys in `params` (other keys of params are not checked here) */
export const placementProblems = (params: unknown, path: string): string[] => {
  if (params === undefined || params === null || typeof params !== "object" || Array.isArray(params)) return [];
  const p = params as Record<string, unknown>;
  const problems: string[] = [];
  (["position", "rotation"] as const).forEach(key => {
    if (p[key] !== undefined && !isVector(p[key])) {
      problems.push(`${path}.${key}: expected three numbers [x, y, z], got ${JSON.stringify(p[key])}`);
    }
  });
  if (p.scale !== undefined) {
    const ok = isVector(p.scale) ? p.scale.every(v => v > 0) : typeof p.scale === "number" && p.scale > 0;
    if (!ok) problems.push(`${path}.scale: expected a number > 0 or three numbers [x, y, z] > 0, got ${JSON.stringify(p.scale)}`);
  }
  return problems;
};

/** The entity's placement: its params where valid, the type's defaults otherwise */
export const resolvePlacement = (type: string, params?: Record<string, unknown>): Placement => {
  const defaults = PLACEMENT_DEFAULTS[type] ?? FLAT;
  const scale = params?.scale;
  return {
    position: isVector(params?.position) ? params.position : defaults.position,
    rotation: isVector(params?.rotation) ? params.rotation : defaults.rotation,
    scale: isVector(scale) ? scale : typeof scale === "number" && scale > 0 ? [scale, scale, scale] : defaults.scale,
  };
};
