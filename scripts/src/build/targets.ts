import { MAX_TARGETS_PER_SPREAD } from '../config';
import type { SpreadData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import type { EntryBuild } from './entries';

/**
 * Number the targets per spread (page → target order → id): a target's `index` is its position in the
 * spread – the app keys its anchors by it. A spread has at most MAX_TARGETS_PER_SPREAD targets.
 */
export function assignTargetIndices(spreads: SpreadData[], builds: EntryBuild[]): void {
  for (const spread of spreads) {
    const targets = builds
      .filter(b => b.spreadId === spread.id && b.entry.target)
      .sort((a, b) => a.entry.page - b.entry.page || a.targetOrder - b.targetOrder || a.entry.id.localeCompare(b.entry.id));

    if (targets.length > MAX_TARGETS_PER_SPREAD) {
      buildErrors.push(`spreads/${spread.id} has ${targets.length} targets, max is ${MAX_TARGETS_PER_SPREAD}.`);
    }
    targets.forEach((b, index) => {
      b.entry.target!.index = index;
      console.log(`🎯 ${spread.id}[${index}] ${b.entry.target!.id} (page ${b.entry.page})`);
    });
  }
}
