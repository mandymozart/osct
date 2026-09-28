import { MAX_TARGETS_PER_SPREAD } from '../config';
import { assertGameConfiguration, GameConfigurationError } from '../../../shared/guards/game-config';
import type { GameConfiguration } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { copyContentToPublic } from '../lib/files';
import { buildBook } from './book';
import { buildEntities } from './entities';
import { buildEntries } from './entries';
import { buildSpreads } from './spreads';
import { assignTargetIndices } from './targets';
import { buildTutorial } from './tutorial';

/**
 * Build the final config object
 */
export function buildConfig(versionStr: string, inputHash: string): GameConfiguration {
  const book = buildBook();
  const spreads = buildSpreads();
  const entities = buildEntities();
  const builds = buildEntries(spreads, entities);
  assignTargetIndices(spreads, builds);
  const tutorial = buildTutorial(book);

  const entries = builds
    .map(b => b.entry)
    .sort((a, b) => a.page - b.page || (a.target?.index ?? 99) - (b.target?.index ?? 99) || a.title.localeCompare(b.title));

  console.log(`✨ ${spreads.length} spreads, ${entries.length} entries (${entries.filter(e => e.target).length} with target), ${Object.keys(entities).length} shared entities, ${tutorial.length} steps`);

  const timestamp = new Date().toISOString();
  console.log(`📊 Building config version: ${versionStr} (${timestamp}, hash ${inputHash.slice(0, 12)})`);

  const config: GameConfiguration = {
    version: {
      version: versionStr,
      timestamp, // when the build inputs last changed
      hash: inputHash
    },
    book,
    maxTargetsPerSpread: MAX_TARGETS_PER_SPREAD,
    initialSpreadId: spreads[0]?.id ?? '',
    spreads,
    entries,
    entities,
    tutorial,
  };

  // The same contract check the app runs on load
  try {
    assertGameConfiguration(config);
  } catch (error) {
    if (error instanceof GameConfigurationError) buildErrors.push(...error.problems.map(p => `output ${p}`));
    else throw error;
  }

  if (buildErrors.length > 0) {
    throw new Error(`${buildErrors.length} content error(s):\n  - ${buildErrors.join('\n  - ')}`);
  }

  copyContentToPublic();
  return config;
}
