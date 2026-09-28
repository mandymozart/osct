import { MAX_TARGETS_PER_SPREAD } from '../config';
import type { SpreadData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import type { EntryBuild } from './entries';

/** A spread has at most MAX_TARGETS_PER_SPREAD targets (RULES.md #3) */
export function checkTargetsPerSpread(spreads: SpreadData[], builds: EntryBuild[]): void {
  for (const spread of spreads) {
    const targets = builds.filter(b => b.spreadId === spread.id && b.entry.target);
    if (targets.length > MAX_TARGETS_PER_SPREAD) {
      buildErrors.push(`spreads/${spread.id} has ${targets.length} targets, max is ${MAX_TARGETS_PER_SPREAD}.`);
    }
    targets.forEach(b => console.log(`🎯 ${spread.id} ${b.entry.target!.id} (page ${b.entry.page})`));
  }
}
