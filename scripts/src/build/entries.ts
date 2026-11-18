import type { EntityData, EntryData, SceneData, TargetData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { contentFile, readSection, validate } from '../lib/content';
import { buildEntity } from './entities';

export interface EntryBuild {
  entry: EntryData;
  /** Its scene's id when the scene exists, else null (an error is reported) */
  sceneId: string | null;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function buildEntries(scenes: SceneData[], entities: Record<string, EntityData>): EntryBuild[] {
  const builds: EntryBuild[] = [];
  for (const { id, data } of readSection('entries', 'entry.yaml')) {
    const label = `entries/${id}`;
    const e = validate(data, 'entry', label);
    if (!e) continue;

    // The entry names its scene (schema 3.0) – nothing is derived from a page
    const scene = scenes.find(s => s.id === e.scene);
    if (!scene) buildErrors.push(`${label}: scene "${e.scene}" is not in scenes/`);
    if (scene && e.surface !== undefined && !scene.surfaces.some(s => s.id === e.surface)) {
      buildErrors.push(`${label}: scene "${scene.id}" has no surface "${e.surface}"`);
    }

    const entry: EntryData = {
      id,
      category: e.category,
      title: e.title,
      scene: e.scene,
      ...(e.surface ? { surface: e.surface } : {}),
      body: e.body,
      tags: e.tags,
      ...(e.author ? { author: e.author } : {}),
      ...(e.image ? { image: contentFile('entries', id, e.image, label) } : {}),
      ...(e.caption ? { caption: e.caption } : {}),
      ...(e.media ? { media: e.media } : {}),
    };

    if (e.target !== undefined) {
      const t = validate(e.target, 'target', `${label} target`);
      if (t) {
        const targetId: string = t.id ?? id;
        const target: TargetData = {
          id: targetId,
          imageSrc: contentFile('entries', id, t.image, `${label} target`),
        };
        const entity = buildEntity(t.entity, id, targetId, entities, `${label} target`);
        if (entity) target.entity = entity;
        if (t.place !== undefined) {
          const p = t.place;
          if (isNumber(p.x) && isNumber(p.y) && isNumber(p.width) && (p.height === undefined || isNumber(p.height)) && (p.surface === undefined || typeof p.surface === 'string')) {
            target.place = { ...(typeof p.surface === 'string' ? { surface: p.surface } : {}), x: p.x, y: p.y, width: p.width, ...(isNumber(p.height) ? { height: p.height } : {}) };
            if (scene && p.surface === undefined && scene.surfaces.length > 1) {
              buildErrors.push(`${label} target: scene "${scene.id}" has several surfaces – place needs the surface it lies on`);
            } else if (scene && typeof p.surface === 'string' && !scene.surfaces.some(s => s.id === p.surface)) {
              buildErrors.push(`${label} target: scene "${scene.id}" has no surface "${p.surface}"`);
            }
          } else {
            buildErrors.push(`${label} target: place needs x, y, width (and optional height) in mm, and the surface's id when the scene has several`);
          }
        }
        if (t.enabled === false) target.enabled = false;
        entry.target = target;
      }
    }

    builds.push({ entry, sceneId: scene?.id ?? null });
  }
  return builds;
}
