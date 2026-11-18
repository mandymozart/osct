import { isObject } from '../../../shared/guards/primitives';
import type { SceneData, SurfaceData, SurfacePlace } from '../../../shared/types/game-config';
import type { PassSpec } from '../../../shared/types/passes';
import { buildErrors } from '../lib/errors';
import { readSection, validate } from '../lib/content';
import { checkedPasses } from './book';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The places of surfaces laid out in a row (schema 3.0, `agents/SCENES.md` – *Arrange in a row*): side by side,
 * touching, flat, the row centred on the scene's origin
 */
export const rowPlaces = (widths: readonly number[]): SurfacePlace[] => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  let left = -total / 2;
  return widths.map(width => {
    const x = left + width / 2;
    left += width;
    return { x: Math.round(x * 1000) / 1000, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  });
};

/**
 * A scene's surfaces as authored → the contract's: each with an id, its size in mm and its place. A surface without
 * `place` lies where a row of all the scene's surfaces puts it; a place's rotations default to 0.
 */
function buildSurfaces(raw: unknown[], label: string): SurfaceData[] {
  if (raw.length === 0) buildErrors.push(`${label}: a scene needs at least one surface`);
  const read = raw.flatMap((value, i): { surface: Omit<SurfaceData, 'place'>; place: unknown }[] => {
    const at = `${label} surfaces[${i}]`;
    if (!isObject(value) || typeof value.id !== 'string' || !value.id || !isNumber(value.widthMm) || !isNumber(value.heightMm) || value.widthMm <= 0 || value.heightMm <= 0) {
      buildErrors.push(`${at}: needs id, widthMm and heightMm (mm > 0)`);
      return [];
    }
    if (value.label !== undefined && typeof value.label !== 'string') buildErrors.push(`${at}.label: expected a text`);
    const surface = { id: value.id, ...(typeof value.label === 'string' && value.label.trim() ? { label: value.label } : {}), widthMm: value.widthMm, heightMm: value.heightMm };
    return [{ surface, place: value.place }];
  });
  const ids = new Set<string>();
  read.forEach(({ surface }) => {
    if (ids.has(surface.id)) buildErrors.push(`${label}: duplicate surface id "${surface.id}"`);
    ids.add(surface.id);
  });
  const row = rowPlaces(read.map(({ surface }) => surface.widthMm));
  return read.map(({ surface, place }, i) => {
    if (place === undefined) return { ...surface, place: row[i] };
    if (!isObject(place) || !isNumber(place.x) || !isNumber(place.y) || !isNumber(place.z) ||
      (['rx', 'ry', 'rz'] as const).some(key => place[key] !== undefined && !isNumber(place[key]))) {
      buildErrors.push(`${label} surface ${surface.id}: place needs x, y, z (mm) and optional rx, ry, rz (degrees)`);
      return { ...surface, place: row[i] };
    }
    const angle = (key: 'rx' | 'ry' | 'rz') => (isNumber(place[key]) ? place[key] as number : 0);
    return { ...surface, place: { x: place.x as number, y: place.y as number, z: place.z as number, rx: angle('rx'), ry: angle('ry'), rz: angle('rz') } };
  });
}

/** The scenes in order; `pluginPasses` = the passes the book's plugins recorded (schema 2.21), which a scene may name */
export function buildScenes(pluginPasses: ReadonlyMap<string, PassSpec> = new Map()): SceneData[] {
  return readSection('scenes', 'scene.yaml')
    .map(({ id, data }): { order: number; scene: SceneData } | null => {
      const label = `scenes/${id}`;
      const s = validate(data, 'scene', label);
      if (!s) return null;
      const passes = s.passes === undefined ? undefined : checkedPasses(s.passes, label, pluginPasses);
      return {
        order: s.order,
        scene: {
          id,
          label: s.label,
          surfaces: buildSurfaces(s.surfaces, label),
          ...(passes !== undefined ? { passes } : {}),
        },
      };
    })
    .filter((item): item is { order: number; scene: SceneData } => item !== null)
    .sort((a, b) => a.order - b.order || a.scene.id.localeCompare(b.scene.id))
    .map(({ scene }) => scene);
}
