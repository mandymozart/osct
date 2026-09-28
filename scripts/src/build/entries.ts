import type { EntityData, EntryData, SpreadData, TargetData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { contentFile, readSection, validate } from '../lib/content';
import { buildEntity } from './entities';

export interface EntryBuild {
  entry: EntryData;
  spreadId: string | null;
}

export function buildEntries(spreads: SpreadData[], entities: Record<string, EntityData>): EntryBuild[] {
  const builds: EntryBuild[] = [];
  for (const { id, data } of readSection('entries', 'entry.yaml')) {
    const label = `entries/${id}`;
    const e = validate<any>(data, 'entry', label);
    if (!e) continue;

    // The access page decides the spread
    const spread = spreads.find(s => e.page >= s.firstPage && e.page <= s.lastPage);
    if (!spread) buildErrors.push(`${label}: page ${e.page} is not part of any spread`);

    const entry: EntryData = {
      id,
      category: e.category,
      title: e.title,
      page: e.page,
      body: e.body,
      tags: e.tags,
      ...(e.author ? { author: e.author } : {}),
      ...(e.image ? { image: contentFile('entries', id, e.image, label) } : {}),
      ...(e.media ? { media: e.media } : {}),
    };

    if (e.target !== undefined) {
      const t = validate<any>(e.target, 'target', `${label} target`);
      if (t) {
        const targetId: string = t.id ?? id;
        const target: TargetData = {
          id: targetId,
          imageSrc: contentFile('entries', id, t.image, `${label} target`),
        };
        const entity = buildEntity(t.entity, id, targetId, entities, `${label} target`);
        if (entity) target.entity = entity;
        entry.target = target;
      }
    }

    builds.push({ entry, spreadId: spread?.id ?? null });
  }
  return builds;
}
