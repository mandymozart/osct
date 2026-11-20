/**
 * One-off move of an environment folder of the old layout (`<env>/latest.json`, `<env>/versions.json`, `<env>/<build>/…`
 * – before #87) into an experience's store of the new one (`<title>/<env>/<experience>/…`, shared/api/content-store.ts).
 * `osct content move` (docs/content-cdn.md "Moving to the store per experience"): a person runs it once per old folder,
 * after Tilman approved it, with `--dry-run` first.
 *
 * Copies, never moves: the Storage API has no copy, so every file is downloaded and uploaded again (with its checksum,
 * which the Storage API verifies). Only what the old bookkeeping knows goes: the version folders versions.json or
 * latest.json name, then versions.json, then latest.json last – a reader of the new store never sees a current version
 * whose files are not there yet. A file already in the target with the same checksum is skipped, so a move that broke
 * off is run again. The old folder stays as it is; `--delete-old` deletes what was moved – only after every moved file
 * was found in the target with the same checksum (or size, where the listing has none), and never a file or folder the
 * move did not copy.
 * Refuses when the old folder has no readable latest.json, or when the target serves another version already (a sync
 * or a publish of the new layout came first – the move would roll it back).
 */
import { CONTENT_BUILD, type ContentManifest, isContentManifest, isContentVersions } from '../../../shared/types/content-manifest';
import { contentTypeOf, type StorageClient, type StoredFile } from './storage';

export interface MoveFile {
  /** Path below the old folder (`<build>/assets/content/…`, `versions.json`) */
  file: string;
  size: number;
  checksum: string | null;
  /** Already in the target with the same checksum (or size) – not copied again */
  present: boolean;
}

export interface MovePlan {
  /** The old environment folder (`staging`) */
  from: string;
  /** The new store root (`osct/staging/osct`) */
  to: string;
  /** The old folder's current version (its latest.json) */
  current: ContentManifest;
  /** In copy order: the version folders' files (each version's game.config.json last), versions.json, latest.json */
  files: MoveFile[];
  /** Entries of the old folder the move leaves alone (not a version on record) */
  skipped: string[];
}

const readJson = async (storage: StorageClient, file: string): Promise<unknown> => {
  const data = await storage.get(file);
  if (!data) return undefined;
  try {
    return JSON.parse(Buffer.from(data).toString('utf8'));
  } catch {
    return null;
  }
};

/** Every file below `folder`, with paths relative to it */
export async function listTree(storage: StorageClient, folder: string): Promise<StoredFile[]> {
  const prefix = `${folder.replace(/\/$/, '')}/`;
  const files: StoredFile[] = [];
  const walk = async (path: string): Promise<void> => {
    for (const item of await storage.list(path)) {
      if (item.isDirectory) await walk(item.path);
      else files.push({ ...item, path: item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path });
    }
  };
  await walk(folder);
  return files;
}

/** The experience an old folder serves: its latest.json's `experience`, else its current version's configuration */
export async function experienceOf(storage: StorageClient, from: string): Promise<string | null> {
  const manifest = await readJson(storage, `${from}/latest.json`);
  if (!isContentManifest(manifest)) return null;
  if (manifest.experience) return manifest.experience;
  const configuration = await readJson(storage, `${from}/${manifest.build}/game.config.json`);
  const id = (configuration as { experience?: { id?: unknown } } | null | undefined)?.experience?.id;
  return typeof id === 'string' ? id : null;
}

const same = (a: Pick<StoredFile, 'size' | 'checksum'>, b: Pick<StoredFile, 'size' | 'checksum'> | undefined): boolean =>
  !!b && a.size === b.size && (a.checksum === null || b.checksum === null || a.checksum === b.checksum);

export async function planMove(storage: StorageClient, from: string, to: string): Promise<MovePlan> {
  const [manifest, versions, sourceFiles, targetFiles, targetManifest] = await Promise.all([
    readJson(storage, `${from}/latest.json`),
    readJson(storage, `${from}/versions.json`),
    listTree(storage, from),
    listTree(storage, to),
    readJson(storage, `${to}/latest.json`),
  ]);
  if (!isContentManifest(manifest)) {
    throw new Error(`${from}/latest.json is ${manifest === undefined ? 'missing' : 'not readable'} – nothing to move`);
  }
  if (versions !== undefined && !isContentVersions(versions)) throw new Error(`${from}/versions.json is not readable – fix it before the move`);
  if (targetManifest !== undefined && (!isContentManifest(targetManifest) || targetManifest.build !== manifest.build)) {
    const serves = isContentManifest(targetManifest) ? targetManifest.build : 'an unreadable latest.json';
    throw new Error(`${to} serves ${serves} already (${from} serves ${manifest.build}) – a sync or publish came first; the move would roll it back`);
  }
  const builds = new Set([manifest.build, ...(versions ?? []).map(v => v.build)]);
  const target = new Map(targetFiles.map(f => [f.path, f]));
  const files: MoveFile[] = [];
  const skipped = new Set<string>();
  const entry = (f: StoredFile): MoveFile => ({ file: f.path, size: f.size, checksum: f.checksum, present: same(f, target.get(f.path)) });
  for (const build of [...builds].sort()) {
    const inVersion = sourceFiles.filter(f => f.path.startsWith(`${build}/`));
    // The configuration marks a version as complete (content-sync `runSync`): it goes last, as in a sync
    const config = inVersion.filter(f => f.path === `${build}/game.config.json`);
    files.push(...inVersion.filter(f => f.path !== `${build}/game.config.json`).map(entry), ...config.map(entry));
  }
  for (const name of ['versions.json', 'latest.json']) {
    const file = sourceFiles.find(f => f.path === name);
    if (file) files.push(entry(file));
  }
  for (const f of sourceFiles) {
    const top = f.path.split('/')[0];
    const moved = top === 'latest.json' || top === 'versions.json' || (CONTENT_BUILD.test(top) && builds.has(top));
    if (!moved) skipped.add(f.path.includes('/') ? `${top}/` : top);
  }
  return { from, to, current: manifest, files, skipped: [...skipped].sort() };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function describeMove(plan: MovePlan): string[] {
  const copy = plan.files.filter(f => !f.present);
  const bytes = copy.reduce((sum, f) => sum + f.size, 0);
  const versions = new Set(plan.files.map(f => f.file.split('/')[0]).filter(top => CONTENT_BUILD.test(top)));
  return [
    `🚚 ${plan.from}/ → ${plan.to}/ (current ${plan.current.build}, ${versions.size} versions, ${plan.files.length} files)`,
    `   copy ${copy.length} files (${mb(bytes)}), ${plan.files.length - copy.length} already there`,
    ...plan.skipped.map(s => `   leave ${plan.from}/${s} – not a version on record`),
  ];
}

/** Copies what the plan names (skipping what is there already), latest.json last */
export async function runMove(storage: StorageClient, plan: MovePlan, log: (line: string) => void = console.log): Promise<void> {
  for (const file of plan.files) {
    if (file.present) continue;
    const data = await storage.get(`${plan.from}/${file.file}`);
    if (!data) throw new Error(`${plan.from}/${file.file} vanished during the move – run it again`);
    await storage.put(`${plan.to}/${file.file}`, data, contentTypeOf(file.file));
    log(`   ➡️  ${file.file}`);
  }
}

/** Moved files that are not in the target with the same checksum (or size) – empty when every one arrived */
export async function moveProblems(storage: StorageClient, plan: MovePlan): Promise<string[]> {
  const target = new Map((await listTree(storage, plan.to)).map(f => [f.path, f]));
  return plan.files.filter(f => !same(f, target.get(f.file))).map(f => `${plan.to}/${f.file}`);
}

/** Deletes the moved entries of the old folder (its version folders and its two json files) – only after `moveProblems` is empty */
export async function deleteMoved(storage: StorageClient, plan: MovePlan, log: (line: string) => void = console.log): Promise<void> {
  const problems = await moveProblems(storage, plan);
  if (problems.length > 0) throw new Error(`Not deleting ${plan.from}/: ${problems.length} moved files are not in ${plan.to}/ as they were – ${problems.slice(0, 5).join(', ')}`);
  const tops = [...new Set(plan.files.map(f => f.file.split('/')[0]))];
  // latest.json first: the old folder stops serving before its versions go
  tops.sort((a, b) => (a === 'latest.json' ? -1 : b === 'latest.json' ? 1 : a.localeCompare(b)));
  for (const top of tops) {
    const target = top.endsWith('.json') ? `${plan.from}/${top}` : `${plan.from}/${top}/`;
    await storage.delete(target);
    log(`   🗑️  ${target}`);
  }
}
