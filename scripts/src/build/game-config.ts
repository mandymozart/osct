import { assertGameConfiguration, GameConfigurationError } from '../../../shared/guards/game-config';
import { CONTENT_SCHEMA_VERSION, type GameConfiguration, type PluginData, recordedRegistrations } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { copyContentToPublic } from '../lib/files';
import { buildBook } from './book';
import { buildEntities } from './entities';
import { warnLayerStacks } from './plugins';
import { warnZeroPlane } from './zero-plane';
import { buildEntries } from './entries';
import { buildSpreads } from './spreads';
import { checkTargetsPerSpread } from './targets';
import { buildTutorial } from './tutorial';

/**
 * Build the final config object; `plugins` = the compiled plugins (build/plugins.ts), declared when there are any
 */
export function buildConfig(versionStr: string, inputHash: string, plugins: PluginData[] = []): GameConfiguration {
  // The passes the plugins recorded (schema 2.21): the book and a spread may name them
  const pluginPasses = recordedRegistrations(plugins).passes;
  const book = buildBook(pluginPasses);
  const spreads = buildSpreads(pluginPasses);
  const entities = buildEntities();
  const builds = buildEntries(spreads, entities);
  checkTargetsPerSpread(spreads, builds);
  const trees = [
    ...Object.entries(entities).map(([ref, node]) => ({ label: `entities/${ref}`, node })),
    ...builds.flatMap(b => (b.entry.target?.entity && !('ref' in b.entry.target.entity) ? [{ label: `entries/${b.entry.id} target`, node: b.entry.target.entity }] : [])),
  ];
  warnLayerStacks(trees);
  // Every model stands on its page (#189): its lowest point at the target's z = 0
  warnZeroPlane(trees);
  const tutorial = buildTutorial(book);

  const entries = builds
    .map(b => b.entry)
    .sort((a, b) => a.page - b.page || a.title.localeCompare(b.title));

  console.log(`✨ ${spreads.length} spreads, ${entries.length} entries (${entries.filter(e => e.target).length} with target), ${Object.keys(entities).length} shared entities, ${tutorial.length} steps${plugins.length ? `, ${plugins.length} plugins` : ''}`);

  const timestamp = new Date().toISOString();
  console.log(`📊 Building config version: ${versionStr} (${timestamp}, hash ${inputHash.slice(0, 12)})`);

  const config: GameConfiguration = {
    version: {
      version: versionStr,
      timestamp, // when the build inputs last changed
      hash: inputHash,
      schema: CONTENT_SCHEMA_VERSION,
    },
    book,
    initialSpreadId: spreads[0]?.id ?? '',
    spreads,
    entries,
    entities,
    tutorial,
    ...(plugins.length ? { plugins } : {}),
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
