/**
 * The export archive (#322, MEMORY 2026-11-21 "Export archive follows the CDN rules", docs/content.md "Export archive"):
 * the export of a published build in the experience's own content store, `<title>/<env>/<experience>/exports/<build>/`,
 * once per build. A publish writes it on the server (`server/api/src/ExportArchive.php` – the same plan, compared by
 * test/export-archive.test.ts); `osct content export --archive --env <env>` writes one for the build live there.
 *
 * It holds what `osct content export` writes (the plan of content-export.ts) **without the media**: export.json names every
 * file by its folder path and the immutable URL it is read from, and lists the content builds those URLs lie in
 * (`builds`). `osct content purge` keeps every build the newest archive of an experience names (`archivedBuilds`).
 */
import type { ExperienceExport, ExportArchiveRecord } from '../../../shared/api/editor';
import { CONTENT_BUILD } from '../../../shared/types/content-manifest';
import { EXPORT_MARKER, EXPORT_RECORD, type ExportPlan } from './content-export';
import type { StorageClient } from './storage';

/** The archives' folder in an experience's store (`ExportArchive::FOLDER`) – purge never deletes it */
export const ARCHIVE_FOLDER = 'exports';

/** An environment's name inside a store path (`ContentStore::ENV`) */
const ENV = '[a-z][a-z0-9-]{0,31}';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The content builds the files lie in: every `<title>/<env>/<experience>/<build>/` (the storage zone, also below a pull zone
 * URL) or `/content/<env>/<experience>/<build>/` (the directory store's route) of this experience, and the archived build
 * itself (`ExportArchive::builds`), sorted by `<env>/<build>`
 */
export function archiveBuilds(urls: readonly string[], title: string, experience: string, own: { env: string; build: string }): { env: string; build: string }[] {
  const found = new Map<string, { env: string; build: string }>([[`${own.env}/${own.build}`, own]]);
  const pattern = new RegExp(`/(?:${escape(title)}|content)/(${ENV})/${escape(experience)}/([0-9a-f]{12})/`);
  for (const url of urls) {
    const match = pattern.exec(url);
    if (match) found.set(`${match[1]}/${match[2]}`, { env: match[1], build: match[2] });
  }
  return [...found].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, value]) => value);
}

export interface ArchiveOptions {
  instance: string;
  title: string;
  env: string;
  writtenBy?: ExportArchiveRecord['writtenBy'];
}

/** export.json of an archive: the plan's files by path, not downloaded; no person named */
export function archiveRecord(data: ExperienceExport, plan: ExportPlan, options: ArchiveOptions): ExportArchiveRecord {
  const files = [...plan.downloads]
    .map(([at, planned]) => ({
      path: at,
      url: planned.url,
      origin: planned.file?.origin ?? ('unknown' as const),
      sha256: planned.file?.sha256 ?? null,
      v: planned.file?.v ?? null,
      size: planned.file?.size ?? null,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const source: ExperienceExport['source'] = data.source.kind === 'published' ? { ...data.source, publishedBy: null } : data.source;
  return {
    archive: true,
    experience: data.experience,
    instance: options.instance,
    title: options.title,
    env: options.env,
    source,
    build: data.build,
    hash: data.hash,
    schema: data.schema,
    appVersion: data.appVersion,
    writtenBy: options.writtenBy ?? 'cli',
    exportedAt: data.exportedAt,
    files,
    builds: archiveBuilds(files.map(file => file.url), options.title, data.experience, { env: options.env, build: data.build }),
    problems: [...plan.problems],
  };
}

/** EXPORT.md of an archive (`ExportArchive::marker`) */
export function archiveMarker(data: ExperienceExport, record: ExportArchiveRecord): string {
  const publishedAt = data.source.kind === 'published' ? data.source.publishedAt : '';
  const lines = [
    '# Export archive – do not edit',
    '',
    `This folder is the export of the published build ${record.build} of the experience \`${data.experience}\`, written`,
    'into the content store when it was published (docs/content.md "Export archive"). It holds the content source',
    '(YAML, plugin sources) but no media: export.json names every file by its path in this folder and the URL it is read',
    "from – the build's own immutable content files and the Library's uploads. `osct content purge` keeps every build the",
    'newest export of an experience still names. A folder here is never written again.',
    '',
    '| | |',
    '|---|---|',
    `| Instance | ${record.instance} |`,
    `| Experience | ${data.experience} – ${data.configuration.experience?.title ?? ''} |`,
    `| From | the published build ${record.build} (${record.env}, ${publishedAt}) |`,
    `| Build | ${record.build} |`,
    `| Hash | ${record.hash} |`,
    `| Content schema | ${record.schema || '–'} |`,
    `| Exported | ${record.exportedAt} |`,
    `| App version | ${record.appVersion} |`,
    `| Files | ${record.files.length} named, not copied (export.json: path, URL, checksum where known) |`,
    '',
  ];
  if (record.problems.length) lines.push('What the content source cannot hold (left out or changed):', '', ...record.problems.map(problem => `- ${problem}`), '');
  return lines.join('\n');
}

/**
 * Writes an archive below a store root (`<title>/<env>/<experience>`) unless its export.json is there: the plan's texts,
 * EXPORT.md, export.json last (a folder without it is incomplete and written again)
 */
export async function runArchive(storage: Pick<StorageClient, 'exists' | 'put'>, root: string, data: ExperienceExport, plan: ExportPlan, options: ArchiveOptions): Promise<{ path: string; written: boolean; record: ExportArchiveRecord }> {
  const folder = `${root}/${ARCHIVE_FOLDER}/${data.build}`;
  const record = archiveRecord(data, plan, options);
  if (await storage.exists(`${folder}/${EXPORT_RECORD}`)) return { path: folder, written: false, record };
  for (const [at, text] of plan.texts) await storage.put(`${folder}/${at}`, text, at.endsWith('.ts') ? 'text/plain' : 'text/yaml');
  await storage.put(`${folder}/${EXPORT_MARKER}`, archiveMarker(data, record), 'text/markdown');
  await storage.put(`${folder}/${EXPORT_RECORD}`, `${JSON.stringify(record, null, 2)}\n`, 'application/json');
  return { path: folder, written: true, record };
}

const isRecord = (value: unknown): value is ExportArchiveRecord =>
  typeof value === 'object' && value !== null && (value as ExportArchiveRecord).archive === true && typeof (value as ExportArchiveRecord).exportedAt === 'string'
  && Array.isArray((value as ExportArchiveRecord).builds);

/** The newest archive of each environment's store of an experience, and the archive folders that could not be read */
export interface NewestArchives {
  newest: { env: string; record: ExportArchiveRecord }[];
  unreadable: string[];
}

/**
 * Reads every archive of the experience in every environment of the title (`<title>/<env>/<experience>/exports/<build>/export.json`)
 * and keeps the newest per environment (by `exportedAt`)
 */
export async function newestArchives(storage: Pick<StorageClient, 'list' | 'get'>, title: string, experience: string): Promise<NewestArchives> {
  const newest: NewestArchives['newest'] = [];
  const unreadable: string[] = [];
  for (const envFolder of (await storage.list(title)).filter(item => item.isDirectory)) {
    const env = envFolder.path.split('/').pop() ?? '';
    const folder = `${title}/${env}/${experience}/${ARCHIVE_FOLDER}`;
    let best: ExportArchiveRecord | null = null;
    for (const archive of (await storage.list(folder)).filter(item => item.isDirectory && CONTENT_BUILD.test(item.path.split('/').pop() ?? ''))) {
      const raw = await storage.get(`${archive.path}/${EXPORT_RECORD}`);
      let record: unknown = null;
      try {
        record = raw ? JSON.parse(Buffer.from(raw).toString('utf8')) : null;
      } catch {
        record = null;
      }
      if (!isRecord(record)) {
        unreadable.push(`${archive.path}/`);
        continue;
      }
      if (!best || record.exportedAt > best.exportedAt) best = record;
    }
    if (best) newest.push({ env, record: best });
  }
  return { newest, unreadable };
}

/** The builds of one environment the newest archives name: build → the archives (`<env>/exports/<build>`) that need it */
export function archivedBuilds(archives: NewestArchives, env: string): Map<string, string[]> {
  const builds = new Map<string, string[]>();
  for (const { env: archiveEnv, record } of archives.newest) {
    for (const named of record.builds) {
      if (named.env !== env) continue;
      builds.set(named.build, [...(builds.get(named.build) ?? []), `${archiveEnv}/${ARCHIVE_FOLDER}/${record.build}`]);
    }
  }
  return builds;
}
