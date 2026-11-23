import { assertGameConfiguration, GameConfigurationError } from '../../../shared/guards/game-config';
import { CONTENT_SCHEMA_VERSION, type GameConfiguration, type PluginData, recordedRegistrations } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { copyContentToPublic } from '../lib/files';
import { buildExperience } from './experience';
import { buildEntities } from './entities';
import { warnLayerStacks } from './plugins';
import { warnZeroPlane } from './zero-plane';
import { buildEntries } from './entries';
import { buildScenes } from './scenes';
import { checkTargetsPerScene } from './targets';
import { buildSubtitles } from './subtitles';
import { buildCredits, buildGroups } from './exported';
import { landingPickProblem, landingSourceOf } from '../../../shared/api/landing-extract';

/**
 * Build the final config object; `plugins` = the compiled plugins (build/plugins.ts), declared when there are any
 */
export function buildConfig(versionStr: string, inputHash: string, plugins: PluginData[] = [], options: { copy?: boolean } = {}): GameConfiguration {
  // The passes the plugins recorded (schema 2.21): the experience and a scene may name them
  const recorded = recordedRegistrations(plugins);
  const pluginPasses = recorded.passes;
  // The looks they recorded (schema 2.29): the experience may name them in `appearance`
  const experience = buildExperience(pluginPasses, recorded.appearances, recorded.cardLooks);
  const scenes = buildScenes(pluginPasses);
  const entities = buildEntities();
  const builds = buildEntries(scenes, entities);
  checkTargetsPerScene(scenes, builds);
  const trees = [
    ...Object.entries(entities).map(([ref, node]) => ({ label: `entities/${ref}`, node })),
    ...builds.flatMap(b => (b.entry.target?.entity && !('ref' in b.entry.target.entity) ? [{ label: `entries/${b.entry.id} target`, node: b.entry.target.entity }] : [])),
  ];
  warnLayerStacks(trees);
  // Every model stands on its page (#189): its lowest point at the target's z = 0
  warnZeroPlane(trees);
  const subtitles = buildSubtitles();
  const groups = buildGroups(scenes);

  // In scene order, then by title (an entry of a scene that does not exist – an error – last)
  const position = new Map(scenes.map((scene, i) => [scene.id, i]));
  const at = (sceneId: string) => position.get(sceneId) ?? scenes.length;
  const entries = builds
    .map(b => b.entry)
    .sort((a, b) => at(a.scene) - at(b.scene) || a.title.localeCompare(b.title));

  console.log(`✨ ${scenes.length} scenes, ${entries.length} entries (${entries.filter(e => e.target).length} with target), ${Object.keys(entities).length} shared entities${plugins.length ? `, ${plugins.length} plugins` : ''}`);

  const timestamp = new Date().toISOString();
  console.log(`📊 Building config version: ${versionStr} (${timestamp}, hash ${inputHash.slice(0, 12)})`);

  const config: GameConfiguration = {
    version: {
      version: versionStr,
      timestamp, // when the build inputs last changed
      hash: inputHash,
      schema: CONTENT_SCHEMA_VERSION,
    },
    experience,
    initialScene: scenes[0]?.id ?? '',
    scenes,
    entries,
    entities,
    ...(plugins.length ? { plugins } : {}),
    ...(subtitles.length ? { subtitles } : {}),
    ...(groups.length ? { groups } : {}),
  };
  // The landing's pick (schema 6.1, #355): a target with AR content on a scene of the experience
  if (experience.landing) {
    const problem = landingPickProblem(landingSourceOf(config), experience.landing);
    if (problem) buildErrors.push(`experience.yaml: landing – ${problem}`);
  }
  const credits = buildCredits(config);
  if (Object.keys(credits).length) config.credits = credits;

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

  if (options.copy !== false) copyContentToPublic();
  return config;
}
