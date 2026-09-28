import type { AssetData, EntityData, EntityRefData } from '../../../shared/types/game-config';
import { FilterData, filterProblems } from '../../../shared/types/filters';
import { placementProblems } from '../../../shared/types/placement';
import { buildErrors } from '../lib/errors';
import { assetType, contentFile, readSection, validate } from '../lib/content';

export function buildEntities(): Record<string, EntityData> {
  const entities: Record<string, EntityData> = {};
  for (const { id, data } of readSection('entities', 'entity.yaml')) {
    const label = `entities/${id}`;
    const e = validate<any>(data, 'entity', label);
    if (!e) continue;
    const assets: AssetData[] = (e.assets as any[]).map((asset, i) => {
      if (!asset || typeof asset.src !== 'string') {
        buildErrors.push(`${label}: assets[${i}] needs a src`);
        return null;
      }
      return {
        id: `${id}-${asset.id ?? i}`,
        assetType: assetType(asset.src, label),
        src: contentFile('entities', id, asset.src, label),
      };
    }).filter((asset): asset is AssetData => asset !== null);
    if (assets.length === 0) buildErrors.push(`${label}: type "${e.type}" needs assets`);
    buildErrors.push(...placementProblems(e.params, `${label}: params`));
    const filters = buildFilters(e.filters, e.type, label);
    entities[id] = { type: e.type, assets, ...(e.params ? { params: e.params } : {}), ...(filters ? { filters } : {}) };
  }
  return entities;
}

/**
 * Video filters `[{ type, ...parameters }]` – checked against their definitions in shared/types/filters.ts
 */
export function buildFilters(raw: unknown, type: string, label: string): FilterData[] | undefined {
  if (raw === undefined) return undefined;
  if (type !== 'video') {
    buildErrors.push(`${label}: filters only work on video entities (type is "${type}")`);
    return undefined;
  }
  const problems = filterProblems(raw, 'filters');
  problems.forEach(problem => buildErrors.push(`${label}: ${problem}`));
  return problems.length ? undefined : (raw as FilterData[]);
}

/**
 * Inline entity `{ type, src?, params?, filters? }` or reference `{ ref }`
 */
export function buildEntity(
  raw: unknown,
  entryId: string,
  targetId: string,
  entities: Record<string, EntityData>,
  label: string
): EntityData | EntityRefData | undefined {
  if (raw === undefined) return undefined;
  const e = raw as Record<string, any>;
  if (typeof e?.ref === 'string') {
    if (!(e.ref in entities)) buildErrors.push(`${label}: entity ref "${e.ref}" not found in content/entities/`);
    return { ref: e.ref };
  }
  const type = e?.type;
  // Links are entries (consultation), not AR entities
  if (!['model', 'video', 'image'].includes(type)) {
    buildErrors.push(`${label}: entity type "${type}" must be one of model, video, image (or use ref)`);
    return undefined;
  }
  if (e.params !== undefined && (typeof e.params !== 'object' || Array.isArray(e.params))) {
    buildErrors.push(`${label}: entity params must be a mapping`);
  }
  buildErrors.push(...placementProblems(e.params, `${label}: params`));
  if (typeof e.src !== 'string') {
    buildErrors.push(`${label}: entity type "${type}" needs a src`);
    return undefined;
  }
  const filters = buildFilters(e.filters, type, label);
  return {
    type,
    assets: [{
      id: `${targetId}-media`,
      assetType: assetType(e.src, label),
      src: contentFile('entries', entryId, e.src, label),
    }],
    ...(e.params ? { params: e.params } : {}),
    ...(filters ? { filters } : {}),
  };
}
