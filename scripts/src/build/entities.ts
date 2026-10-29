import { ENTITY_TYPES, type AssetData, type EntityData, type EntityRefData } from '../../../shared/types/game-config';
import { FilterData, filterProblems } from '../../../shared/types/filters';
import { componentProblems, type ComponentData } from '../../../shared/types/components';
import { placementProblems } from '../../../shared/types/placement';
import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from '../config';
import { buildErrors, buildWarnings } from '../lib/errors';
import { assetType, contentFile, readSection, validate } from '../lib/content';

/** A node of the content's YAML: `type`, a `src` (or `assets`) for model / video / image, `text` / `color`, `children` */
type RawNode = Record<string, any>;

/** Node types without a file of their own */
const FILELESS = new Set(['group', 'text']);

export const MAX_NODE_DEPTH = 8;

export function buildEntities(): Record<string, EntityData> {
  const entities: Record<string, EntityData> = {};
  for (const { id, data } of readSection('entities', 'entity.yaml')) {
    const label = `entities/${id}`;
    const e = validate<any>(data, 'entity', label);
    if (!e) continue;
    const node = buildNode(e, label, id, file => contentFile('entities', id, file, label), 0, 'entities');
    if (node) entities[id] = node;
  }
  return entities;
}

/**
 * One node of an entity's tree (content schema 2.0), its children recursively. `assets: [{ id?, src }]` (the root
 * of a shared entity) or `src` (inline nodes) name the node's files; `group` and `text` have none. Asset ids:
 * `<idBase>-<n>` for a shared root, `<targetId>-media` for an inline root, `<parent id>-<index>` below.
 */
export function buildNode(
  raw: RawNode,
  label: string,
  idBase: string,
  file: (src: string) => string,
  depth: number,
  kind: 'entities' | 'entries',
  entryId?: string,
): EntityData | null {
  const type = raw?.type;
  if (!(ENTITY_TYPES as readonly string[]).includes(type)) {
    buildErrors.push(`${label}: node type "${type}" must be one of ${ENTITY_TYPES.join(', ')}`);
    return null;
  }
  if (raw.params !== undefined && (typeof raw.params !== 'object' || Array.isArray(raw.params))) {
    buildErrors.push(`${label}: params must be a mapping`);
  }
  buildErrors.push(...placementProblems(raw.params, `${label}: params`));
  // The node's files
  let assets: AssetData[] = [];
  if (Array.isArray(raw.assets) && raw.assets.length) {
    assets = (raw.assets as any[]).map((asset, i) => {
      if (!asset || typeof asset.src !== 'string') {
        buildErrors.push(`${label}: assets[${i}] needs a src`);
        return null;
      }
      return { id: `${idBase}-${asset.id ?? i}`, assetType: assetType(asset.src, label), src: file(asset.src) };
    }).filter((asset): asset is AssetData => asset !== null);
  } else if (typeof raw.src === 'string') {
    // Entry videos may be missing from a checkout (they reach the CDN by the content sync): a build without
    // them (CI, deploys) gives the target no AR video instead of failing
    if (kind === 'entries' && type === 'video' && entryId && !fs.existsSync(path.join(CONTENT_DIR, 'entries', entryId, raw.src))) {
      buildWarnings.push(`${label}: video "${raw.src}" is not on this machine (videos are not in git) – built without its AR video`);
      return null;
    }
    assets = [{ id: depth === 0 && kind === 'entries' ? `${idBase}-media` : idBase, assetType: assetType(raw.src, label), src: file(raw.src) }];
  }
  if (!assets.length && !FILELESS.has(type)) {
    buildErrors.push(`${label}: node type "${type}" needs a src`);
    return null;
  }
  if (type === 'text' && typeof raw.text !== 'string') buildErrors.push(`${label}: a text node needs a text`);
  if (raw.color !== undefined && !(typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color))) {
    buildErrors.push(`${label}: color must be #rrggbb`);
  }
  const filters = buildFilters(raw.filters, type, label);
  let components: ComponentData[] | undefined;
  if (raw.components !== undefined) {
    const problems = componentProblems(raw.components, 'components', type);
    problems.forEach(problem => buildErrors.push(`${label}: ${problem}`));
    if (!problems.length) components = raw.components as ComponentData[];
  }
  let children: EntityData[] | undefined;
  if (raw.children !== undefined) {
    if (!Array.isArray(raw.children)) buildErrors.push(`${label}: children must be a list`);
    else if (depth >= MAX_NODE_DEPTH) buildErrors.push(`${label}: nodes nest deeper than ${MAX_NODE_DEPTH} levels`);
    else {
      children = (raw.children as RawNode[])
        .map((child, i) => buildNode(child, `${label} children[${i}]`, `${idBase}-${i}`, file, depth + 1, kind, entryId))
        .filter((child): child is EntityData => child !== null);
    }
  }
  return {
    ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
    type,
    assets,
    ...(raw.params ? { params: raw.params } : {}),
    ...(filters ? { filters } : {}),
    ...(components?.length ? { components } : {}),
    ...(children?.length ? { children } : {}),
    ...(type === 'text' ? { text: String(raw.text ?? ''), ...(raw.color ? { color: raw.color } : {}) } : {}),
  };
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
 * Inline entity `{ type, src?, params?, filters?, children?, text?, color? }` (a node tree) or reference `{ ref }`
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
  if (!e || typeof e !== 'object') {
    buildErrors.push(`${label}: entity must be a mapping with a type (or { ref })`);
    return undefined;
  }
  return buildNode(e, label, targetId, file => contentFile('entries', entryId, file, label), 0, 'entries', entryId) ?? undefined;
}
