/**
 * Read access to the game configuration (`game.config.json`): the data the content build
 * (`scripts/`) generates from the authored content in `content/`.
 *
 * The only module that imports `game.config.json` (RULES #14). On load it checks the JSON
 * against the contract (`assertGameConfiguration`), maps `*Data` to the app model
 * (`Spread`, `Entry`, `Target`, `Step`) and builds in-memory indexes.
 */
import raw from '@/game.config.json';
import { assertGameConfiguration, GameConfigurationError, isEntityRef } from '@shared/guards/game-config';
import {
  AssetData,
  BookData,
  ConfigurationVersion,
  EntityData,
  EntityRefData,
  Entry,
  ErrorCode,
  ErrorInfo,
  GameConfiguration,
  Spread,
  Step,
  Target,
} from '@/types';

/** Used when the JSON is invalid, so modules can load and the app can show the error */
const EMPTY_CONFIGURATION: GameConfiguration = {
  version: { version: '0.0.0', timestamp: '' },
  book: { id: '', title: '', author: '' },
  maxTargetsPerSpread: 0,
  initialSpreadId: '',
  spreads: [],
  entries: [],
  entities: {},
  tutorial: [],
};

/**
 * Runtime error handling: the guard's `GameConfigurationError` (every problem with its path, same
 * as the build reports) goes to the console; the app gets an `ErrorInfo` with an `ErrorCode`.
 * `main.ts` checks `getConfigurationError()` before starting and shows a critical error instead.
 */
let configurationError: ErrorInfo | null = null;

const loadConfiguration = (): GameConfiguration => {
  try {
    assertGameConfiguration(raw);
    return raw;
  } catch (error) {
    const problems = error instanceof GameConfigurationError ? error.problems : [String(error)];
    console.error(`[game-config] Invalid game configuration:\n  - ${problems.join('\n  - ')}`);
    configurationError = {
      code: ErrorCode.GAME_CONFIGURATION_INVALID,
      msg: 'The book content could not be loaded.',
      type: 'critical',
      details: problems,
    };
    return EMPTY_CONFIGURATION;
  }
};

const config: GameConfiguration = loadConfiguration();

/** Set when the game configuration is invalid; the app must not start then */
export const getConfigurationError = (): ErrorInfo | null => configurationError;

const resolveEntity = (entity?: EntityData | EntityRefData): EntityData | undefined =>
  entity && isEntityRef(entity) ? config.entities[entity.ref] : entity;

const spreadForPage = (page: number): string => {
  const spread = config.spreads.find(s => page >= s.firstPage && page <= s.lastPage);
  if (!spread) throw new Error(`[game-config] Page ${page} is not part of any spread`);
  return spread.id;
};

const entries: Entry[] = config.entries.map(({ target, ...data }) => {
  const spreadId = spreadForPage(data.page);
  return {
    ...data,
    spreadId,
    ...(target
      ? { target: { ...target, entity: resolveEntity(target.entity), entryId: data.id, spreadId } }
      : {}),
  };
});

const spreads: Spread[] = config.spreads.map(data => {
  const spreadEntries = entries.filter(e => e.spreadId === data.id);
  return {
    ...data,
    entries: spreadEntries,
    targets: spreadEntries
      .flatMap(e => (e.target ? [e.target] : []))
      .sort((a, b) => a.index - b.index),
  };
});

const spreadById = new Map(spreads.map(s => [s.id, s]));
const entryById = new Map(entries.map(e => [e.id, e]));
const targetById = new Map(spreads.flatMap(s => s.targets.map(t => [t.id, t] as const)));
const tutorial: Step[] = [...config.tutorial];

/** Version of the game configuration (content build): version, timestamp, hash */
export const getConfigVersion = (): ConfigurationVersion => config.version;

export const getBook = (): BookData => config.book;

/** Max image targets per spread (.mind group) = MindAR maxTrack. Set by the content build. */
export const getMaxTargetsPerSpread = (): number => config.maxTargetsPerSpread;

export const getInitialSpreadId = (): string => config.initialSpreadId;

export const getSpreads = (): Spread[] => [...spreads];

export const getSpread = (id: string): Spread | undefined => spreadById.get(id);

export const getEntries = (): Entry[] => [...entries];

export const getEntry = (id: string): Entry | undefined => entryById.get(id);

/** Targets of a spread in MindAR index order */
export const getTargets = (spreadId: string): Target[] => spreadById.get(spreadId)?.targets ?? [];

export const getTarget = (id: string): Target | undefined => targetById.get(id);

/** Assets of all entities (optionally of one spread), deduplicated by id */
export const getAssets = (spreadId?: string): AssetData[] => {
  const targets = spreadId ? getTargets(spreadId) : [...targetById.values()];
  const assets = new Map<string, AssetData>();
  targets.forEach(t => t.entity?.assets.forEach(a => assets.set(a.id, a)));
  return [...assets.values()];
};

export const getTutorial = (): Step[] => [...tutorial];
