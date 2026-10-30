/**
 * Read access to the game configuration (`game.config.json`): the data the content build
 * (`scripts/`) generates from the authored content.
 *
 * The only module that reads it (RULES #14). `loadGameConfiguration()` loads it once before the app starts:
 * from a content base URL (`<base>/latest.json` names the current version, `<base>/<build>/` holds it and never
 * changes – the CDN, docs/content-cdn.md, or the editor's draft endpoint), else the configuration the app bundles
 * (`options.bundled` – the reader's dev server and tests). The engine knows no `import.meta.env` and no i18n: the
 * app passes the base URL, the bundled copy and the texts of the startup errors.
 * On load it checks the JSON against the contract (`assertGameConfiguration`), checks that this app can
 * read the content (content schema MAJOR – RULES #10), maps `*Data` to the app model (`Spread`, `Entry`,
 * `Target`, `Step`) and builds in-memory indexes. Content file paths (`/assets/content/…`) become URLs of the
 * loaded version, so the rest of the app never knows where the content comes from.
 */
import { assertGameConfiguration, GameConfigurationError, type GuardOptions, isEntityRef } from '@shared/guards/game-config';
import { CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR, parseContentSchema } from '@shared/types/game-config';
import { type ContentFiles, type ContentManifest, isContentFiles, isContentManifest } from '@shared/types/content-manifest';
import {
  type AssetData,
  type BookData,
  type ConfigurationVersion,
  type EntityData,
  type EntityRefData,
  type Entry,
  ErrorCode,
  type ErrorInfo,
  type GameConfiguration,
  type PassData,
  type PluginData,
  type Spread,
  type Step,
  type Target,
} from "../types/index";

/** Used until the configuration is loaded, and when it is invalid, so the app can show the error */
const EMPTY_CONFIGURATION: GameConfiguration = {
  version: { version: '0.0.0', timestamp: '', schema: CONTENT_SCHEMA_VERSION },
  book: { id: '', title: '', author: '' },
  initialSpreadId: '',
  spreads: [],
  entries: [],
  entities: {},
  tutorial: [],
};

/** Path prefix of content files in the configuration and in the app's public folder */
export const CONTENT_PATH = '/assets/content/';
/** Fetching the configuration: a slow CDN must not keep the splash forever */
const LOAD_TIMEOUT_MS = 20000;

/**
 * Runtime error handling: the guard's `GameConfigurationError` (every problem with its path, same
 * as the build reports) goes to the console; the app gets an `ErrorInfo` with an `ErrorCode`.
 * `main.ts` checks `getConfigurationError()` before starting and shows a critical error instead.
 */
let configurationError: ErrorInfo | null = null;

/**
 * Can this app read the content? The content schema (`MAJOR.MINOR`, shared/) is the only rule (RULES #10):
 * another MAJOR is refused – newer content needs an app update, older content a newer content sync – and any
 * MINOR of the same MAJOR loads. The app version the content was built with is information only.
 */
/** Texts of the startup errors (`ErrorInfo.msg`) – the app translates them */
export interface LoadTexts {
  contentNewer: string;
  contentOlder: string;
  contentNotLoaded: string;
}

const DEFAULT_TEXTS: LoadTexts = {
  contentNewer: 'This content needs a newer version of the app.',
  contentOlder: 'This content needs a newer build.',
  contentNotLoaded: 'The content could not be loaded.',
};

export const checkContentCompatibility = (version: ConfigurationVersion, texts: LoadTexts = DEFAULT_TEXTS): ErrorInfo | null => {
  const app = parseContentSchema(CONTENT_SCHEMA_VERSION);
  const content = parseContentSchema(version.schema);
  // Every MAJOR so far only added (the node tree, the light node): this app reads older content as it is, down to
  // the oldest MAJOR the contract still knows
  if (app && content && content.major <= app.major && content.major >= OLDEST_READABLE_SCHEMA_MAJOR) {
    if (content.major !== app.major || content.minor !== app.minor) {
      console.info(`[game-config] Content schema ${version.schema}, this app reads ${CONTENT_SCHEMA_VERSION} – compatible.`);
    }
    return null;
  }
  const newer = !!app && !!content && content.major > app.major;
  return {
    code: ErrorCode.NOT_SUPPORTED,
    msg: newer ? texts.contentNewer : texts.contentOlder,
    type: 'critical',
    details: [
      `Content schema ${version.schema} (built with app ${version.version}), this app reads schema ${CONTENT_SCHEMA_VERSION}: ` +
        (newer ? 'update the app.' : 'the content needs a newer build.'),
    ],
  };
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

/**
 * The current content version on the CDN. latest.json is the only file that changes: revalidated by the browser
 * and asked for with a value that changes once a minute (`?t=`, for edges that vary their cache by query string).
 * The version folder never changes – its files are cached like any immutable file. files.json (sizes for the
 * whole-book download) is optional.
 */
const fetchFromContentBase = async (
  baseUrl: string,
  fetchFn: typeof fetch,
): Promise<{ raw: unknown; files: ContentFiles; versionUrl: string; manifest: ContentManifest }> => {
  const manifest: unknown = await (
    await fetchWithTimeout(fetchFn, `${baseUrl}/latest.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' })
  ).json();
  if (!isContentManifest(manifest)) throw new Error(`${baseUrl}/latest.json does not name a content version`);
  const versionUrl = `${baseUrl}/${manifest.build}`;
  const [raw, files] = await Promise.all([
    fetchWithTimeout(fetchFn, `${versionUrl}/game.config.json`).then(r => r.json() as Promise<unknown>),
    fetchWithTimeout(fetchFn, `${versionUrl}/files.json`)
      .then(r => r.json() as Promise<unknown>)
      .catch(error => {
        console.warn(`[game-config] ${versionUrl}/files.json not loaded (${error instanceof Error ? error.message : error})`);
        return null;
      }),
  ]);
  return { raw, files: isContentFiles(files) ? files : {}, versionUrl, manifest };
};

export interface LoadOptions {
  /** Content base URL; empty = the bundled configuration (`bundled`) */
  baseUrl?: string;
  /** The configuration bundled with the app (its content build), `null` when the build has none */
  bundled?: () => Promise<unknown>;
  /** For the requests to the base URL (a token, a proxy); default `fetch` */
  fetch?: typeof fetch;
  /**
   * Where the configuration's `/assets/content/…` paths resolve when it is not the version folder itself – the
   * editor's draft points at the files of the version it was imported from
   */
  assetsBase?: string;
  texts?: LoadTexts;
  /** The editor's stage: nodes may use component types its Code tab's plugins register at Run (`GuardOptions`) */
  unknownComponentTypes?: GuardOptions["unknownComponentTypes"];
}

/**
 * Loads the game configuration – once, before the app starts. Resolves with the startup error (also kept
 * for `getConfigurationError()`) or null when the app can start.
 */
export const loadGameConfiguration = async (options: LoadOptions = {}): Promise<ErrorInfo | null> => {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const texts = options.texts ?? DEFAULT_TEXTS;
  configurationError = null;
  try {
    let raw: unknown;
    let files: ContentFiles = {};
    let versionUrl = '';
    if (baseUrl) {
      ({ raw, files, versionUrl } = await fetchFromContentBase(baseUrl, options.fetch ?? fetch));
    } else {
      if (!options.bundled) throw new Error('No content base URL and no bundled configuration');
      raw = await options.bundled();
      if (raw === null) throw new Error('This build loads its content from the CDN but has no content base URL');
    }
    assertGameConfiguration(raw, { unknownComponentTypes: options.unknownComponentTypes });
    const { version } = raw;
    console.info(`[game-config] Content ${(version.hash ?? '').slice(0, 12)} (schema ${version.schema}, built with app ${version.version}) from ${versionUrl || 'the app'}.`);
    configurationError = checkContentCompatibility(version, texts);
    if (configurationError) {
      console.error(`[game-config] ${configurationError.details?.[0]}`);
      apply(EMPTY_CONFIGURATION, '', {});
    } else {
      apply(raw, (options.assetsBase ?? '').replace(/\/+$/, '') || versionUrl, files);
    }
  } catch (error) {
    const invalid = error instanceof GameConfigurationError;
    const problems = invalid ? error.problems : [String(error instanceof Error ? error.message : error)];
    console.error(`[game-config] ${invalid ? 'Invalid game configuration' : 'Game configuration not loaded'}:\n  - ${problems.join('\n  - ')}`);
    configurationError = {
      code: invalid ? ErrorCode.GAME_CONFIGURATION_INVALID : ErrorCode.NETWORK_ERROR,
      msg: texts.contentNotLoaded,
      type: 'critical',
      details: problems,
    };
    apply(EMPTY_CONFIGURATION, '', {});
  }
  return configurationError;
};

/** Set when the game configuration is invalid or could not be loaded; the app must not start then */
export const getConfigurationError = (): ErrorInfo | null => configurationError;

let config: GameConfiguration = EMPTY_CONFIGURATION;
/** URL of the loaded content version on the CDN (`<base>/<build>`; '' when the content is served with the app) */
let contentBase = '';
/** files.json of the loaded content (empty for content served with the app) */
let contentFiles: ContentFiles = {};
let entries: Entry[] = [];
let spreads: Spread[] = [];
let spreadById = new Map<string, Spread>();
let entryById = new Map<string, Entry>();
let targetById = new Map<string, Target>();
let tutorial: Step[] = [];

/** URL of a content file given its path in the configuration (`/assets/content/…`) */
export const contentUrl = (path: string): string => (path.startsWith(CONTENT_PATH) && contentBase ? `${contentBase}${path}` : path);

/** A URL of the loaded content (same origin or the content CDN) – as opposed to external links */
export const isContentUrl = (src?: string): src is string =>
  !!src && (src.startsWith(CONTENT_PATH) || (contentBase !== '' && src.startsWith(`${contentBase}${CONTENT_PATH}`)));

/** The path in the configuration (`/assets/content/…`) of a content URL, or null for other URLs */
export const contentPathOf = (src: string): string | null => {
  if (!isContentUrl(src)) return null;
  const path = src.startsWith(CONTENT_PATH) ? src : src.slice(contentBase.length);
  return path.split(/[?#]/)[0];
};

/** Where the content files come from: the loaded version's folder on the CDN, '' when served with the app */
export const getContentBaseUrl = (): string => contentBase;

/** Sizes in bytes by content URL from files.json (CDN content), null for content served with the app */
export const getContentSizes = (): Record<string, number> | null =>
  contentBase ? Object.fromEntries(Object.entries(contentFiles).map(([path, file]) => [contentUrl(path), file.size])) : null;

const withContentUrls = (raw: GameConfiguration, base: string): GameConfiguration => {
  if (!base) return raw;
  const url = (path?: string) => (path === undefined ? undefined : contentUrl(path));
  const node = (e: EntityData): EntityData => ({
    ...e,
    assets: e.assets.map(a => ({ ...a, src: contentUrl(a.src) })),
    ...(e.children ? { children: e.children.map(node) } : {}),
  });
  const entity = (e?: EntityData | EntityRefData): EntityData | EntityRefData | undefined =>
    e && !isEntityRef(e) ? node(e) : e;
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

const apply = (raw: GameConfiguration, base: string, files: ContentFiles): void => {
  contentBase = base;
  contentFiles = files;
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

/**
 * The passes a spread shows: its own list (an override – `[]` turns the book's off there), else the book's (the master
 * for every spread), else none. Pure, for the tests.
 */
export const passesFor = (spread: { passes?: PassData[] } | undefined, book: { passes?: PassData[] }): PassData[] =>
  spread?.passes ?? book.passes ?? [];

/** The post-processing passes over a spread's rendered image: the spread's own list, else the book's, else none */
export const getPasses = (spreadId: string): PassData[] => passesFor(spreadById.get(spreadId), config.book);


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

/** The assets of an entity's whole node tree, root first */
export const entityAssets = (entity: EntityData | undefined): AssetData[] =>
  entity ? [...entity.assets, ...(entity.children ?? []).flatMap(entityAssets)] : [];

/** Every node of an entity's tree with its path from the root (`[]` = the root, `[1, 0]` = the second child's first) */
export const entityNodes = (entity: EntityData, path: number[] = []): Array<{ node: EntityData; path: number[] }> =>
  [{ node: entity, path }, ...(entity.children ?? []).flatMap((child, i) => entityNodes(child, [...path, i]))];

/** Assets of all entities (optionally of one spread), deduplicated by id */
export const getAssets = (spreadId?: string): AssetData[] => {
  const targets = spreadId ? getTargets(spreadId) : [...targetById.values()];
  const assets = new Map<string, AssetData>();
  targets.forEach(t => entityAssets(t.entity).forEach(a => assets.set(a.id, a)));
  return [...assets.values()];
};

export const getTutorial = (): Step[] => [...tutorial];

/** The plugins the content declares (schema 2.4), their modules as URLs of the loaded version */
export const getPlugins = (): PluginData[] => (config.plugins ?? []).map(plugin => ({ ...plugin, src: contentUrl(plugin.src) }));

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
