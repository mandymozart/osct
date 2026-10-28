/**
 * CDN sync of the built content (docs/content-cdn.md): the storage zone holds ONE folder per environment, a
 * mirror of the local content build, overwritten in place – no version folders, nothing accumulates.
 *
 *   <zone>/<env>/game.config.json      the game configuration – written after the files it names
 *   <zone>/<env>/files.json            every content file: size and a short checksum (`v`, the app's cache key)
 *   <zone>/<env>/assets/content/…      the content files, paths as in the app
 *
 * A sync uploads new and changed files (compared by SHA-256 with what the storage reports), then files.json,
 * then game.config.json, and only then deletes what is no longer part of the content (so readers still on the
 * previous configuration keep their files until the new one is live). The content's version is its build
 * checksum (`version.hash`); the app version it was built with is information only (RULES #10).
 */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseContentSchema } from '../../../shared/types/game-config';
import { CLIENT_PUBLIC_ASSETS_DIR, OUTPUT_FILE } from '../config';
import { listFiles } from './files';
import { contentTypeOf, StorageClient, StoredFile } from './storage';

const PARALLEL_UPLOADS = 4;
/** The CDN check waits this long for the new configuration to show at the edge */
const CDN_CHECK_TIMEOUT_MS = 60_000;
export const CONTENT_PREFIX = 'assets/content/';

export interface LocalFile {
  file: string; // relative to the content folder, `/`-separated
  size: number;
  sha256: string; // upper-case hex, as the Storage API reports it
}

export interface ContentBuild {
  hash: string;
  schema: string;
  version: string;
  config: Buffer;
  files: LocalFile[];
}

/** Entry of files.json, keyed by app path (`/assets/content/…`) */
export interface ContentFileInfo {
  size: number;
  /** First 12 hex digits of the file's SHA-256: changes with the file (the app adds it as `?v=`) */
  v: string;
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex').toUpperCase();

/** The local content build (`osct content build`) */
export function readContentBuild(): ContentBuild {
  if (!fs.existsSync(OUTPUT_FILE) || !fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
    throw new Error('No content build found – run `osct content build` first');
  }
  const config = fs.readFileSync(OUTPUT_FILE);
  const { version } = JSON.parse(config.toString('utf8')) as { version?: { version: string; hash?: string; schema?: unknown } };
  if (!version?.hash) throw new Error(`${OUTPUT_FILE} has no version.hash – rebuild the content`);
  if (!parseContentSchema(version.schema)) throw new Error(`${OUTPUT_FILE} has no content schema (MAJOR.MINOR) – rebuild the content`);
  const files = listFiles(CLIENT_PUBLIC_ASSETS_DIR).map(file => {
    const data = fs.readFileSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, file));
    return { file, size: data.length, sha256: sha256(data) };
  });
  return { hash: version.hash, schema: version.schema as string, version: version.version, config, files };
}

/** files.json of a build */
export const fileIndex = (build: ContentBuild): Record<string, ContentFileInfo> =>
  Object.fromEntries(build.files.map(f => [`/${CONTENT_PREFIX}${f.file}`, { size: f.size, v: f.sha256.slice(0, 12).toLowerCase() }]));

export interface SyncPlan {
  env: string;
  upload: LocalFile[];
  unchanged: number;
  /** Storage paths to delete after the switch; folders end with `/` (deleted with everything in them) */
  remove: string[];
  configChanged: boolean;
  /** Content hash of the configuration currently on the storage, if any */
  remoteHash: string | null;
}

/** Parent folders of a storage path below the environment folder: `env/a/b/c.jpg` → `env/a`, `env/a/b` */
const foldersOf = (storagePath: string): string[] => {
  const parts = storagePath.split('/');
  return parts.slice(1, -1).map((_, i) => parts.slice(0, i + 2).join('/'));
};

/**
 * What a sync changes: compares the local build with the listing of the environment's folder. Pure, so the
 * tests run it without a storage zone.
 */
export function planFromListing(env: string, build: ContentBuild, listing: StoredFile[], remoteHash: string | null, force = false): SyncPlan {
  // Only ever the environment's own folder
  const remote = listing.filter(r => r.path.startsWith(`${env}/`));
  const byPath = new Map(remote.filter(r => !r.isDirectory).map(r => [r.path, r]));
  const upload = build.files.filter(f => {
    const stored = byPath.get(`${env}/${CONTENT_PREFIX}${f.file}`);
    return force || !stored || stored.checksum !== f.sha256;
  });
  const needed = new Set([`${env}/game.config.json`, `${env}/files.json`, ...build.files.map(f => `${env}/${CONTENT_PREFIX}${f.file}`)]);
  const neededFolders = new Set([...needed].flatMap(foldersOf));
  const remove: string[] = [];
  const insideRemoved = (p: string) => remove.some(r => r.endsWith('/') && p.startsWith(r));
  // Shallow first: a folder that goes takes everything in it along
  for (const item of [...remote].sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
    if (insideRemoved(item.path)) continue;
    if (item.isDirectory ? !neededFolders.has(item.path) : !needed.has(item.path)) {
      remove.push(item.isDirectory ? `${item.path}/` : item.path);
    }
  }
  // The content version is the hash – the configuration's bytes also carry the build time
  const configStored = byPath.get(`${env}/game.config.json`);
  return {
    env,
    upload,
    unchanged: build.files.length - upload.length,
    remove,
    configChanged: force || !configStored || remoteHash !== build.hash,
    remoteHash,
  };
}

export async function planSync(storage: StorageClient, env: string, build: ContentBuild, force = false): Promise<SyncPlan> {
  const remote = await storage.listTree(env);
  const config = remote.some(r => r.path === `${env}/game.config.json`) ? await storage.get(`${env}/game.config.json`) : null;
  let remoteHash: string | null = null;
  try {
    remoteHash = config ? (JSON.parse(Buffer.from(config).toString('utf8')).version?.hash ?? null) : null;
  } catch {
    remoteHash = null;
  }
  return planFromListing(env, build, remote, remoteHash, force);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function describePlan(plan: SyncPlan, build: ContentBuild, verbose = true): string[] {
  const bytes = plan.upload.reduce((sum, f) => sum + f.size, 0);
  const lines = [
    `📦 Content ${build.hash.slice(0, 12)} (schema ${build.schema}, built with app ${build.version}, ${build.files.length} files) → ${plan.env}/`,
    plan.remoteHash
      ? `   on the storage: ${plan.remoteHash.slice(0, 12)}${plan.remoteHash === build.hash ? ' (same content)' : ''}`
      : '   on the storage: no content yet',
    `   upload ${plan.upload.length} files (${mb(bytes)}), ${plan.unchanged} unchanged, delete ${plan.remove.length}` +
      `${plan.configChanged ? ', configuration changes' : ''}`,
  ];
  if (verbose) {
    plan.upload.forEach(f => lines.push(`   + ${f.file} (${Math.round(f.size / 1024)} KB)`));
    plan.remove.forEach(p => lines.push(`   - ${p}`));
  }
  return lines;
}

const VIDEO = /\.(mp4|webm|mov)$/i;

/**
 * Videos the sync would delete although their folder stays: the build lacked them – typically a checkout without
 * the git-ignored videos (CI). A sync from there would take them off the CDN.
 */
export const videosMissingLocally = (plan: SyncPlan): string[] => plan.remove.filter(p => !p.endsWith('/') && VIDEO.test(p));

export const isInSync = (plan: SyncPlan) => plan.upload.length === 0 && plan.remove.length === 0 && !plan.configChanged;

/** Runs a plan: files, files.json, game.config.json, then the deletions */
export async function runSync(storage: StorageClient, plan: SyncPlan, build: ContentBuild): Promise<void> {
  const { env } = plan;
  const total = plan.upload.reduce((sum, f) => sum + f.size, 0);
  const queue = [...plan.upload];
  let uploaded = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const data = fs.readFileSync(path.join(CLIENT_PUBLIC_ASSETS_DIR, next.file));
      await storage.put(`${env}/${CONTENT_PREFIX}${next.file}`, data, contentTypeOf(next.file));
      uploaded += next.size;
      console.log(`   ⬆️  ${next.file} (${Math.round((uploaded / Math.max(total, 1)) * 100)}%)`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
  await storage.put(`${env}/files.json`, JSON.stringify(fileIndex(build)), 'application/json');
  // The switch: from here on the app loads the new content
  await storage.put(`${env}/game.config.json`, build.config, 'application/json');
  console.log(`✅ ${env}/game.config.json → content ${build.hash.slice(0, 12)}`);
  for (const target of plan.remove) {
    await storage.delete(target);
    console.log(`   🗑️  ${target}`);
  }
}

/**
 * Does the CDN serve the new configuration? The app asks for `game.config.json?t=<minute>`; with the pull
 * zone's query-string cache variation on, that reaches the storage at least once a minute per edge.
 * Staleness and a missing CORS header are warnings – the storage is already right.
 */
export async function checkCdn(baseUrl: string, build: ContentBuild): Promise<void> {
  console.log(`🔍 Checking ${baseUrl}/game.config.json through the CDN …`);
  const deadline = Date.now() + CDN_CHECK_TIMEOUT_MS;
  for (;;) {
    const response = await fetch(`${baseUrl}/game.config.json?t=${Date.now()}`, { headers: { Origin: 'https://osct.buildingfictions.com' } });
    const seen = response.ok
      ? (((await response.json()) as { version?: { hash?: string } }).version?.hash ?? 'no hash')
      : `${response.status} ${response.statusText}`;
    if (seen === build.hash) {
      console.log(`✅ CDN serves content ${build.hash.slice(0, 12)}`);
      if (!response.headers.get('access-control-allow-origin')) {
        console.warn('⚠️  No Access-Control-Allow-Origin header – the app (another origin) cannot read the content. Enable CORS for all files on the pull zone.');
      }
      return;
    }
    if (Date.now() > deadline) {
      console.warn(`⚠️  The CDN still serves ${seen.slice(0, 12)} after ${CDN_CHECK_TIMEOUT_MS / 1000} s – turn on "Vary cache: query string" on the pull zone (docs/content-cdn.md).`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
