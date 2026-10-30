/**
 * Content on the CDN (docs/content-cdn.md, layout: shared/types/content-manifest.ts): every content version gets
 * its own immutable folder `<env>/<build>/` – a file on the CDN is never overwritten, so no edge cache or browser
 * cache can serve a stale copy. `<env>/latest.json` names the current version, `<env>/versions.json` records every
 * version with when it was current, so `purge` can remove old ones that are provably out of use.
 *
 * sync:  upload the build into `<env>/<build>/` (skipped when that version is already complete there: its
 *        game.config.json – written last – exists), then versions.json, then latest.json (the switch).
 *        Syncing an older content build again only moves latest.json back (rollback). Syncing the current build
 *        again repairs a versions.json that does not record it as current (#175).
 * purge: delete version folders that are not current, not served by the CDN's latest.json, not among the newest
 *        retired ones kept, and retired long enough ago (default: the CDN cache time, 30 days). Strict: missing or
 *        inconsistent bookkeeping refuses; folders it does not know stay unless asked for.
 */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CONTENT_BUILD,
  type ContentFiles,
  type ContentManifest,
  type ContentVersion,
  contentBuildName,
  isContentFiles,
  isContentManifest,
  isContentVersions,
} from '../../../shared/types/content-manifest';
import { assertGameConfiguration, GameConfigurationError } from '../../../shared/guards/game-config';
import { parseContentSchema } from '../../../shared/types/game-config';
import { CLIENT_PUBLIC_ASSETS_DIR, DEMO_MARKER, FIXTURE_MARKER, OUTPUT_FILE } from '../config';
import { listFiles } from './files';
import { contentTypeOf, type StorageClient, type StoredFile } from './storage';

const PARALLEL_UPLOADS = 4;
/** The CDN check waits this long for the new latest.json to show at the edge */
const CDN_CHECK_TIMEOUT_MS = 60_000;
export const CONTENT_PREFIX = 'assets/content/';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LocalFile {
  file: string; // relative to the content folder, `/`-separated
  size: number;
  sha256: string; // upper-case hex
}

export interface ContentBuild {
  build: string;
  hash: string;
  schema: string;
  version: string;
  /** The book the build is of (`book.id` of its configuration) */
  book?: string;
  config: Buffer;
  files: LocalFile[];
}

/** A build of the test fixture (fixtures/content) – its marker file is part of the build output */
export const isFixtureBuild = (build: Pick<ContentBuild, 'files'>): boolean => build.files.some(f => f.file === FIXTURE_MARKER);

/** A build of the demo book (fixtures/demo) – synced to its own environment only */
export const isDemoBuild = (build: Pick<ContentBuild, 'files'>): boolean => build.files.some(f => f.file === DEMO_MARKER);

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex').toUpperCase();

/** The local content build (`osct content build`) */
export function readContentBuild(): ContentBuild {
  if (!fs.existsSync(OUTPUT_FILE) || !fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
    throw new Error('No content build found – run `osct content build` first');
  }
  const config = fs.readFileSync(OUTPUT_FILE);
  const raw: unknown = JSON.parse(config.toString('utf8'));
  // The contract check the build and the app run: only a configuration the app can read is uploaded
  try {
    assertGameConfiguration(raw);
  } catch (error) {
    if (!(error instanceof GameConfigurationError)) throw error;
    throw new Error(`${OUTPUT_FILE} is not a valid game configuration – rebuild the content\n  - ${error.problems.join('\n  - ')}`);
  }
  const { version, book } = raw;
  if (!version.hash) throw new Error(`${OUTPUT_FILE} has no version.hash – rebuild the content`);
  if (!parseContentSchema(version.schema)) throw new Error(`${OUTPUT_FILE} has no content schema (MAJOR.MINOR) – rebuild the content`);
  const files = listFiles(CLIENT_PUBLIC_ASSETS_DIR).map(file => {
    const data = fs.readFileSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, file));
    return { file, size: data.length, sha256: sha256(data) };
  });
  return {
    build: contentBuildName(version.hash), hash: version.hash, schema: version.schema, version: version.version,
    book: book.id, config, files,
  };
}

/** files.json of a build */
export const fileIndex = (build: ContentBuild): ContentFiles =>
  Object.fromEntries(build.files.map(f => [`/${CONTENT_PREFIX}${f.file}`, { size: f.size, v: f.sha256.slice(0, 12).toLowerCase() }]));

const readJson = async (storage: StorageClient, file: string): Promise<unknown> => {
  const data = await storage.get(file);
  if (!data) return undefined;
  try {
    return JSON.parse(Buffer.from(data).toString('utf8'));
  } catch {
    return null; // there, but not JSON
  }
};

export interface EnvironmentState {
  env: string;
  /** latest.json on the storage: undefined = none, null = unreadable */
  current: ContentManifest | null | undefined;
  /** versions.json: undefined = none, null = unreadable */
  versions: ContentVersion[] | null | undefined;
  /** Direct children of the environment folder */
  listing: StoredFile[];
}

export async function readEnvironment(storage: StorageClient, env: string): Promise<EnvironmentState> {
  const [listing, current, versions] = await Promise.all([
    storage.list(env),
    readJson(storage, `${env}/latest.json`),
    readJson(storage, `${env}/versions.json`),
  ]);
  return {
    env,
    listing,
    current: current === undefined ? undefined : isContentManifest(current) ? current : null,
    versions: versions === undefined ? undefined : isContentVersions(versions) ? versions : null,
  };
}

const nameOf = (item: StoredFile) => item.path.split('/').pop() ?? '';

/** Version folders on the storage (direct children of the environment named like a build) */
const versionFolders = (state: EnvironmentState): string[] =>
  state.listing.filter(i => i.isDirectory && CONTENT_BUILD.test(nameOf(i))).map(nameOf);

/**
 * Where latest.json and versions.json disagree (#175): versions.json must list the build latest.json names, with it as
 * its only current entry (`retiredAt` null). Empty when they agree, or when neither exists yet. Arguments as in
 * `EnvironmentState`: undefined = none, null = unreadable.
 */
export function versionProblems(current: ContentManifest | null | undefined, versions: ContentVersion[] | null | undefined): string[] {
  const problems: string[] = [];
  if (current === null) problems.push('latest.json is not readable');
  if (versions === null) problems.push('versions.json is not readable');
  if (current === null || versions === null) return problems;
  const open = (versions ?? []).filter(v => v.retiredAt === null).map(v => v.build);
  if (!current) {
    if (open.length > 0) problems.push(`latest.json is missing, versions.json has ${open.join(', ')} as current`);
    return problems;
  }
  if (!versions) return [`versions.json is missing (latest.json names ${current.build})`];
  if (!versions.some(v => v.build === current.build)) problems.push(`versions.json does not list ${current.build}, the build latest.json names`);
  if (open.length !== 1 || open[0] !== current.build) {
    problems.push(`versions.json has ${open.join(', ') || 'no version'} as current, latest.json names ${current.build}`);
  }
  return problems;
}

// ---------------------------------------------------------------- sync

export interface SyncPlan {
  env: string;
  build: ContentBuild;
  /** The version is complete on the storage already (only latest.json moves, if at all) */
  uploaded: boolean;
  /** latest.json names this version already */
  current: boolean;
  /** latest.json and versions.json agree (`versionProblems`) – when they do not, the sync rewrites versions.json */
  agrees: boolean;
  /** Videos the current version has and this build lacks although the entry stays (a checkout without them) */
  missingVideos: string[];
}

const VIDEO = /\.(mp4|webm|mov)$/i;

/** Videos of the current version this build lacks while their entry folder stays */
export function videosMissing(currentFiles: ContentFiles | null, build: ContentBuild): string[] {
  if (!currentFiles) return [];
  const local = new Set(build.files.map(f => `/${CONTENT_PREFIX}${f.file}`));
  const folders = new Set([...local].map(p => p.slice(0, p.lastIndexOf('/'))));
  return Object.keys(currentFiles).filter(p => VIDEO.test(p) && !local.has(p) && folders.has(p.slice(0, p.lastIndexOf('/'))));
}

export async function planSync(storage: StorageClient, env: string, build: ContentBuild, force = false): Promise<SyncPlan> {
  const state = await readEnvironment(storage, env);
  const uploaded = !force && (await storage.exists(`${env}/${build.build}/game.config.json`));
  const currentFiles = state.current && state.current.build !== build.build
    ? await readJson(storage, `${env}/${state.current.build}/files.json`)
    : null;
  return {
    env,
    build,
    uploaded,
    current: !!state.current && state.current.build === build.build,
    agrees: versionProblems(state.current, state.versions).length === 0,
    missingVideos: videosMissing(isContentFiles(currentFiles) ? currentFiles : null, build),
  };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function describeSync(plan: SyncPlan): string[] {
  const { build } = plan;
  const bytes = build.files.reduce((sum, f) => sum + f.size, 0);
  return [
    `📦 Content ${build.build} (schema ${build.schema}, built with app ${build.version}, ${build.files.length} files, ${mb(bytes)}) → ${plan.env}/${build.build}/`,
    plan.uploaded ? '   already on the storage – no upload' : `   upload ${build.files.length} files (${mb(bytes)})`,
    plan.current ? '   already the current version' : '   becomes the current version (latest.json)',
    ...(plan.current && !plan.agrees ? ['   versions.json does not record it as current – rewritten (latest.json stays)'] : []),
  ];
}

/** versions.json after `build` became current at `now` */
export function activate(versions: ContentVersion[], build: ContentBuild, now: string, uploadedNow: boolean): ContentVersion[] {
  const existing = versions.find(v => v.build === build.build);
  const others = versions
    .filter(v => v.build !== build.build)
    .map(v => (v.retiredAt === null ? { ...v, retiredAt: now } : v));
  const entry: ContentVersion = {
    build: build.build,
    hash: build.hash,
    schema: build.schema,
    version: build.version,
    uploadedAt: uploadedNow || !existing ? now : existing.uploadedAt,
    activatedAt: existing && existing.retiredAt === null ? existing.activatedAt : now,
    retiredAt: null,
    ...(build.book ? { book: build.book } : {}),
  };
  return [...others, entry].sort((a, b) => a.activatedAt.localeCompare(b.activatedAt));
}

export async function runSync(storage: StorageClient, plan: SyncPlan): Promise<void> {
  const { env, build } = plan;
  const root = `${env}/${build.build}`;
  if (!plan.uploaded) {
    const total = build.files.reduce((sum, f) => sum + f.size, 0);
    const queue = [...build.files];
    let done = 0;
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const data = fs.readFileSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, next.file));
        await storage.put(`${root}/${CONTENT_PREFIX}${next.file}`, data, contentTypeOf(next.file));
        done += next.size;
        console.log(`   ⬆️  ${next.file} (${Math.round((done / Math.max(total, 1)) * 100)}%)`);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
    await storage.put(`${root}/files.json`, JSON.stringify(fileIndex(build)), 'application/json');
    // Last: the configuration marks the version as complete
    await storage.put(`${root}/game.config.json`, build.config, 'application/json');
    console.log(`✅ ${root}/ uploaded`);
  }
  if (plan.current && plan.agrees) return;
  // Read again right before the write, from the Storage API (never through the pull zone, whose edges cache JSON for
  // 30 days): versions.json first, latest.json last – a reader never sees a current version without its record
  const state = await readEnvironment(storage, env);
  if (state.versions === null) throw new Error(`${env}/versions.json is not readable – fix it before switching versions`);
  // latest.json names the build already: only versions.json is repaired, the build current since latest.json says (#175)
  const stays = state.current?.build === build.build ? state.current : null;
  const now = stays?.activatedAt ?? new Date().toISOString();
  const versions = activate(state.versions ?? [], build, now, !plan.uploaded);
  await storage.put(`${env}/versions.json`, JSON.stringify(versions, null, 2), 'application/json');
  if (stays) {
    console.log(`✅ ${env}/versions.json records ${build.build} as current again (latest.json named it already)`);
    return;
  }
  const manifest: ContentManifest = {
    build: build.build, hash: build.hash, schema: build.schema, version: build.version, activatedAt: now,
    ...(build.book ? { book: build.book } : {}),
  };
  await storage.put(`${env}/latest.json`, JSON.stringify(manifest, null, 2), 'application/json');
  console.log(`✅ ${env}/latest.json → ${build.build}`);
}

/** What latest.json the CDN serves (from this machine's edge) – manifest null when it serves none */
export async function cdnManifest(baseUrl: string): Promise<{ manifest: ContentManifest | null; status: string; cors: boolean }> {
  const response = await fetch(`${baseUrl}/latest.json?t=${Date.now()}`, { headers: { Origin: 'https://osct.buildingfictions.com' } });
  const body: unknown = response.ok ? await response.json().catch(() => null) : null;
  return {
    manifest: isContentManifest(body) ? body : null,
    status: `${response.status} ${response.headers.get('cdn-cache') ?? ''}`.trim(),
    cors: !!response.headers.get('access-control-allow-origin'),
  };
}

/**
 * What versions.json the CDN serves (from this machine's edge, as a reader sees it – no query string: the pull zone
 * ignores it) – versions null when it serves none or an unreadable one. Only to compare with the storage: an edge
 * without the cache rule for versions.json keeps an old copy for 30 days (#175).
 */
export async function cdnVersions(baseUrl: string): Promise<{ versions: ContentVersion[] | null; status: string }> {
  const response = await fetch(`${baseUrl}/versions.json`);
  const body: unknown = response.ok ? await response.json().catch(() => null) : null;
  return { versions: isContentVersions(body) ? body : null, status: `${response.status} ${response.headers.get('cdn-cache') ?? ''}`.trim() };
}

/**
 * Does the CDN serve the new latest.json? It is the only file that changes; an edge that caches it serves the
 * previous version until it expires (bunny.net: edge rule for latest.json, cache time 0). Warnings only – the
 * storage is right, and the previous version stays complete on it.
 */
export async function checkCdn(baseUrl: string, build: ContentBuild): Promise<void> {
  console.log(`🔍 Checking ${baseUrl}/latest.json through the CDN …`);
  const deadline = Date.now() + CDN_CHECK_TIMEOUT_MS;
  for (;;) {
    const seen = await cdnManifest(baseUrl);
    if (seen.manifest?.build === build.build) {
      console.log(`✅ CDN serves ${build.build}`);
      if (!seen.cors) console.warn('⚠️  No Access-Control-Allow-Origin header – the app (another origin) cannot read the content.');
      return;
    }
    if (Date.now() > deadline) {
      console.warn(
        `⚠️  The CDN still serves ${seen.manifest?.build ?? seen.status} after ${CDN_CHECK_TIMEOUT_MS / 1000} s – the edge caches latest.json. ` +
          'Add the pull zone edge rule for latest.json with cache time 0 (docs/content-cdn.md).',
      );
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

// ---------------------------------------------------------------- purge

export interface PurgeOptions {
  /** Days a version must have been retired before it may go (default: the CDN cache time) */
  minAgeDays: number;
  /** Newest retired versions that always stay (rollback) */
  keep: number;
  /** Also delete folders and files in the environment that are not versions on record */
  unknown: boolean;
}

export const DEFAULT_PURGE: PurgeOptions = { minAgeDays: 30, keep: 1, unknown: false };

export interface PurgeItem {
  /** Storage path (folders end with `/`) */
  target: string;
  build?: string;
  /** Why it stays, or that it goes */
  verdict: string;
  purge: boolean;
}

export interface PurgePlan {
  env: string;
  items: PurgeItem[];
  /** versions.json without the purged versions */
  versions: ContentVersion[];
}

/**
 * Which version folders may go. Pure (state + what the CDN serves + now), so the tests run it without a storage
 * zone. Throws when the bookkeeping does not allow a safe decision.
 */
export function planPurge(state: EnvironmentState, cdnBuild: string | null, now: number, options: PurgeOptions): PurgePlan {
  const { env } = state;
  if (!state.current) throw new Error(`${env}/latest.json is ${state.current === null ? 'not readable' : 'missing'} – nothing is purged without a current version`);
  if (!state.versions) throw new Error(`${env}/versions.json is ${state.versions === null ? 'not readable' : 'missing'} – nothing is purged without the version record`);
  const current = state.current.build;
  const record = new Map(state.versions.map(v => [v.build, v]));
  if (!record.has(current)) throw new Error(`${env}/versions.json does not list the current version ${current}`);
  const folders = versionFolders(state);
  if (!folders.includes(current)) throw new Error(`The current version ${current} is not on the storage`);
  const open = state.versions.filter(v => v.retiredAt === null);
  if (open.length !== 1 || open[0].build !== current) {
    throw new Error(`${env}/versions.json does not agree with latest.json (current ${current}, open: ${open.map(v => v.build).join(', ') || 'none'})`);
  }

  const kept = new Set(
    state.versions
      .flatMap(v => (v.retiredAt !== null && folders.includes(v.build) ? [{ build: v.build, retiredAt: v.retiredAt }] : []))
      .sort((a, b) => b.retiredAt.localeCompare(a.retiredAt))
      .slice(0, options.keep)
      .map(v => v.build),
  );
  const items: PurgeItem[] = [];
  for (const entry of state.listing) {
    const name = nameOf(entry);
    if (!entry.isDirectory && (name === 'latest.json' || name === 'versions.json')) continue;
    const target = entry.isDirectory ? `${entry.path}/` : entry.path;
    const version = entry.isDirectory && CONTENT_BUILD.test(name) ? record.get(name) : undefined;
    if (!version) {
      const inUse = name === current || name === cdnBuild;
      items.push({
        target,
        verdict: inUse ? 'in use – stays' : options.unknown ? 'purge (not a version on record)' : 'not a version on record – stays (--unknown deletes it)',
        purge: options.unknown && !inUse,
      });
      continue;
    }
    const retiredDays = version.retiredAt ? (now - Date.parse(version.retiredAt)) / DAY_MS : 0;
    const verdict =
      name === current ? 'current version'
        : name === cdnBuild ? 'served by the CDN (latest.json at the edge points at it)'
          : kept.has(name) ? `newest retired – kept for rollback (--keep ${options.keep})`
            : retiredDays < options.minAgeDays
              ? `retired ${retiredDays.toFixed(1)} days ago – an edge may still serve a latest.json pointing at it (--min-age ${options.minAgeDays})`
              : 'purge';
    items.push({ target, build: name, verdict, purge: verdict === 'purge' });
  }
  const purged = new Set(items.flatMap(i => (i.purge && i.build ? [i.build] : [])));
  return { env, items, versions: state.versions.filter(v => !purged.has(v.build)) };
}

export function describePurge(plan: PurgePlan): string[] {
  const lines = [`🧹 ${plan.env}/: ${plan.items.filter(i => i.purge).length} of ${plan.items.length} entries go`];
  plan.items.forEach(i => lines.push(`   ${i.purge ? 'DELETE' : 'keep  '} ${i.target} – ${i.verdict}`));
  return lines;
}

export async function runPurge(storage: StorageClient, plan: PurgePlan): Promise<void> {
  for (const item of plan.items.filter(i => i.purge)) {
    await storage.delete(item.target);
    console.log(`   🗑️  ${item.target}`);
  }
  await storage.put(`${plan.env}/versions.json`, JSON.stringify(plan.versions, null, 2), 'application/json');
}
