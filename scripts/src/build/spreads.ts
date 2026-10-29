import type { SpreadData } from '../../../shared/types/game-config';
import { passProblems, type PassData } from '../../../shared/types/passes';
import { buildErrors } from '../lib/errors';
import { contractPart, readSection, validate } from '../lib/content';

export function buildSpreads(): SpreadData[] {
  const spreads = readSection('spreads', 'spread.yaml')
    .map(({ id, data }): { order: number; spread: SpreadData } | null => {
      const label = `spreads/${id}`;
      const s = validate(data, 'spread', label);
      if (!s) return null;
      if (s.firstPage > s.lastPage) buildErrors.push(`${label}: firstPage ${s.firstPage} > lastPage ${s.lastPage}`);
      const passes = s.passes === undefined ? undefined : contractPart<PassData[]>(s.passes, passProblems(s.passes, 'passes'), label);
      return {
        order: s.order,
        spread: {
          id,
          title: s.title,
          firstPage: s.firstPage,
          lastPage: s.lastPage,
          ...(s.format && s.format !== 'spread' ? { format: s.format } : {}),
          ...(passes !== undefined ? { passes } : {}),
        },
      };
    })
    .filter((item): item is { order: number; spread: SpreadData } => item !== null)
    .sort((a, b) => a.order - b.order || a.spread.id.localeCompare(b.spread.id))
    .map(({ spread }) => spread);

  // A page belongs to at most one spread
  spreads.forEach((a, i) => spreads.slice(i + 1).forEach(b => {
    if (a.firstPage <= b.lastPage && b.firstPage <= a.lastPage) {
      buildErrors.push(`spreads/${a.id} and spreads/${b.id}: page ranges overlap`);
    }
  }));
  return spreads;
}
