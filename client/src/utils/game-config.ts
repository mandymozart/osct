/**
 * Read access to the game configuration (`game.config.json`): the data the content build
 * (`scripts/`) generates from the authored content in `content/`.
 *
 * The only module that reads `game.config.json` (RULES #14). `loadGameConfiguration()` loads it once
 * before the app starts (main.ts): from the content CDN when the build has a content base URL
 * (`VITE_CONTENT_BASE_URL` – `<base>/latest.json` names the current bundle, `<base>/<build>/game.config.json`
 * is the configuration, docs/content-cdn.md), else the copy bundled with the app (dev server, tests).
 * On load it checks the JSON against the contract (`assertGameConfiguration`), checks that this app can
 * read the bundle (content schema, version), maps `*Data` to the app model (`Spread`, `Entry`, `Target`,
 * `Step`) and builds in-memory indexes. Content file paths (`/assets/content/…`) become URLs of the
 * loaded bundle, so the rest of the app never knows where the content comes from.
 */
import { assertGameConfiguration, GameConfigurationError, isEntityRef } from '@shared/guards/game-config';
import { CONTENT_SCHEMA_VERSION } from '@shared/types/game-config';
import { ContentManifest, isContentManifest } from '@shared/types/content-manifest';
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
import { compareVersions } from './version';
import { t } from "i18next";

/** Used until the configuration is loaded, and when it is invalid, so the app can show the error */
const EMPTY_CONFIGURATION: GameConfiguration = {
  version: { version: '0.0.0', timestamp: '' },
  book: { id: '', title: '', author: '' },
  initialSpreadId: '',
  spreads: [],
  entries: [],
  entities: {},
  tutorial: [],
};

/** Path prefix of content files in the configuration and in the app's public folder */
export const CONTENT_PATH = '/assets/content/';
/** Fetching the manifest and the configuration: a slow CDN must not keep the splash forever */
const LOAD_TIMEOUT_MS = 20000;

/**
 * Runtime error handling: the guard's `GameConfigurationError` (every problem with its path, same
 * as the build reports) goes to the console; the app gets an `ErrorInfo` with an `ErrorCode`.
 * `main.ts` checks `getConfigurationError()` before starting and shows a critical error instead.
 */
let configurationError: ErrorInfo | null = null;

/**
 * One version for app and content build (RULES #10): another MAJOR means the content has to be
 * rebuilt (no configuration migrations); MINOR/PATCH differences must just work.
 */
export const checkConfigurationVersion = (appVersion: string, configVersion: string): ErrorInfo | null => {
  const compatibility = compareVersions(appVersion, configVersion);
  if (compatibility === 'compatible') {
    console.info(`[game-config] Content built with ${configVersion}, app is ${appVersion}.`);
  }
  if (compatibility !== 'incompatible') return null;
  return {
    code: ErrorCode.NOT_SUPPORTED,
    msg: t('startup:contentOtherVersion'),
    type: 'critical',
    details: [`App ${appVersion}, content ${configVersion}: the content needs to be rebuilt.`],
  };
};

/**
 * Can this app read the bundle? Content loaded at runtime may be newer than the installed app: a bundle
 * with a newer content schema is refused (the app has to be updated), then the version rule applies.
 */
export const checkContentCompatibility = (appVersion: string, version: ConfigurationVersion): ErrorInfo | null => {
  const schema = version.schema ?? 1;
  if (schema > CONTENT_SCHEMA_VERSION) {
    return {
      code: ErrorCode.NOT_SUPPORTED,
      msg: t('startup:contentNewer'),
      type: 'critical',
      details: [`Content schema ${schema} (content ${version.version}), app ${appVersion} reads schema ${CONTENT_SCHEMA_VERSION}: update the app.`],
    };
  }
  return checkConfigurationVersion(appVersion, version.version);
};

const fetchWithTimeout = async (fetchFn: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
    return response;
  } finally {
    clearTimeout(timer);
  }
};

/** The current bundle of a content base URL: the manifest names it, the bundle holds the configuration */
const fetchFromContentBase = async (baseUrl: string, fetchFn: typeof fetch): Promise<{ raw: unknown; bundleUrl: string; manifest: ContentManifest }> => {
  // The manifest changes with every upload: always revalidated; the bundle itself is immutable
  const manifest: unknown = await (await fetchWithTimeout(fetchFn, `${baseUrl}/latest.json`, { cache: 'no-cache' })).json();
  if (!isContentManifest(manifest)) throw new Error(`${baseUrl}/latest.json is not a content manifest`);
  const bundleUrl = `${baseUrl}/${manifest.build}`;
  const raw: unknown = await (await fetchWithTimeout(fetchFn, `${bundleUrl}/game.config.json`)).json();
  return { raw, bundleUrl, manifest };
};

export interface LoadOptions {
  /** Content base URL (default: the build's `VITE_CONTENT_BASE_URL`); empty = the bundled configuration */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Loads the game configuration – once, before the app starts. Resolves with the startup error (also kept
 * for `getConfigurationError()`) or null when the app can start.
 */
export const loadGameConfiguration = async (options: LoadOptions = {}): Promise<ErrorInfo | null> => {
  const baseUrl = (options.baseUrl ?? import.meta.env.VITE_CONTENT_BASE_URL ?? '').replace(/\/+$/, '');
  configurationError = null;
  try {
    let raw: unknown;
    let bundle = '';
    if (baseUrl) {
      const loaded = await fetchFromContentBase(baseUrl, options.fetch ?? fetch);
      raw = loaded.raw;
      bundle = loaded.bundleUrl;
      console.info(`[game-config] Content bundle ${loaded.manifest.build} from ${baseUrl} (uploaded ${loaded.manifest.uploadedAt}).`);
    } else {
      raw = (await import('@/game.config.json')).default;
    }
    assertGameConfiguration(raw);
    configurationError = checkContentCompatibility(__VITE_APP_VERSION__, raw.version);
    if (configurationError) {
      console.error(`[game-config] ${configurationError.details?.[0]}`);
      apply(EMPTY_CONFIGURATION, '');
    } else {
      apply(raw, bundle);
    }
  } catch (error) {
    const invalid = error instanceof GameConfigurationError;
    const problems = invalid ? error.problems : [String(error instanceof Error ? error.message : error)];
    console.error(`[game-config] ${invalid ? 'Invalid game configuration' : 'Game configuration not loaded'}:\n  - ${problems.join('\n  - ')}`);
    configurationError = {
      code: invalid ? ErrorCode.GAME_CONFIGURATION_INVALID : ErrorCode.NETWORK_ERROR,
      msg: t('startup:contentNotLoaded'),
      type: 'critical',
      details: problems,
    };
    apply(EMPTY_CONFIGURATION, '');
  }
  return configurationError;
};

/** Set when the game configuration is invalid or could not be loaded; the app must not start then */
export const getConfigurationError = (): ErrorInfo | null => configurationError;

let config: GameConfiguration = EMPTY_CONFIGURATION;
/** URL prefix of the loaded bundle's content files ('' when the content is served with the app) */
let bundleBase = '';
let entries: Entry[] = [];
let spreads: Spread[] = [];
let spreadById = new Map<string, Spread>();
let entryById = new Map<string, Entry>();
let targetById = new Map<string, Target>();
let tutorial: Step[] = [];

/** URL of a content file given its path in the configuration (`/assets/content/…`) */
export const contentUrl = (path: string): string => (path.startsWith(CONTENT_PATH) ? `${bundleBase}${path}` : path);

/** A URL of the loaded content (same origin or the content bundle) – as opposed to external links */
export const isContentUrl = (src?: string): src is string =>
  !!src && (src.startsWith(CONTENT_PATH) || (bundleBase !== '' && src.startsWith(`${bundleBase}${CONTENT_PATH}`)));

/** Where the content files come from: the bundle's URL on the CDN, '' when served with the app */
export const getContentBundleUrl = (): string => bundleBase;

const withContentUrls = (raw: GameConfiguration, base: string): GameConfiguration => {
  if (!base) return raw;
  const url = (path?: string) => (path === undefined ? undefined : contentUrl(path));
  const entity = (e?: EntityData | EntityRefData): EntityData | EntityRefData | undefined =>
    e && !isEntityRef(e) ? { ...e, assets: e.assets.map(a => ({ ...a, src: contentUrl(a.src) })) } : e;
  return {
    ...raw,
    entities: Object.fromEntries(Object.entries(raw.entities).map(([id, e]) => [id, entity(e) as EntityData])),
    entries: raw.entries.map(e => ({
      ...e,
      ...(e.image !== undefined ? { image: url(e.image) } : {}),
      ...(e.target ? { target: { ...e.target, imageSrc: contentUrl(e.target.imageSrc), entity: entity(e.target.entity) } } : {}),
    })),
  };
};

const apply = (raw: GameConfiguration, base: string): void => {
  bundleBase = base;
  config = withContentUrls(raw, base);

  const resolveEntity = (entity?: EntityData | EntityRefData): EntityData | undefined =>
    entity && isEntityRef(entity) ? config.entities[entity.ref] : entity;

  const spreadForPage = (page: number): string => {
    const spread = config.spreads.find(s => page >= s.firstPage && page <= s.lastPage);
    if (!spread) throw new Error(`[game-config] Page ${page} is not part of any spread`);
    return spread.id;
  };

  entries = config.entries.map(({ target, ...data }) => {
    const spreadId = spreadForPage(data.page);
    return {
      ...data,
      spreadId,
      ...(target
        ? { target: { ...target, entity: resolveEntity(target.entity), entryId: data.id, spreadId } }
        : {}),
    };
  });

  spreads = config.spreads.map(data => {
    const spreadEntries = entries.filter(e => e.spreadId === data.id);
    return {
      ...data,
      entries: spreadEntries,
      targets: spreadEntries.flatMap(e => (e.target ? [e.target] : [])),
    };
  });

  spreadById = new Map(spreads.map(s => [s.id, s]));
  entryById = new Map(entries.map(e => [e.id, e]));
  targetById = new Map(spreads.flatMap(s => s.targets.map(t => [t.id, t] as const)));
  tutorial = [...config.tutorial];
};

/** Version of the game configuration (content build): version, timestamp, hash, schema */
export const getConfigVersion = (): ConfigurationVersion => config.version;

export const getBook = (): BookData => config.book;


export const getInitialSpreadId = (): string => config.initialSpreadId;

export const getSpreads = (): Spread[] => [...spreads];

export const getSpread = (id: string): Spread | undefined => spreadById.get(id);

/**
 * The spreads next to `spreadId` in book order (the ones the spread menu reaches next) – what is preloaded
 * ahead of a switch (target images + content, and the tracker's image targets)
 */
export const getNeighbourSpreads = (spreadId: string, range = 1): Spread[] => {
  const index = spreads.findIndex(s => s.id === spreadId);
  return index === -1 ? [] : spreads.filter((_, i) => i !== index && Math.abs(i - index) <= range);
};

export const getEntries = (): Entry[] => [...entries];

export const getEntry = (id: string): Entry | undefined => entryById.get(id);

/** Targets of a spread in entry order (page → title) */
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

/** The shared entity (`content/entities/<id>`) a target refers to with `ref`, or undefined for an inline entity */
export const getEntityRef = (targetId: string): string | undefined => {
  const entity = config.entries.find(e => e.target?.id === targetId)?.target?.entity;
  return entity && isEntityRef(entity) ? entity.ref : undefined;
};

/** Ids of the targets whose entity is the shared entity `ref` */
export const getTargetsUsingEntity = (ref: string): string[] =>
  config.entries.flatMap(e => {
    const entity = e.target?.entity;
    return e.target && entity && isEntityRef(entity) && entity.ref === ref ? [e.target.id] : [];
  });
