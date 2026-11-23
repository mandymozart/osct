#!/usr/bin/env node
/**
 * osct – the content command line (docs/content-cdn.md). Content has its own lifecycle, apart from the app
 * deployment: build it from a content folder, upload it as a new version to its experience's store in an environment
 * (`<title>/<env>/<experience>/`, shared/api/content-store.ts – #87), purge old versions that are provably out of use.
 * Who runs it (a person, a workflow) does not matter – it only needs the environment variables.
 *
 *   osct content build [--force]
 *   osct content status --env <env> [--experience <id>]   (every experience of the environment when none is named;
 *                                                          exit code 1 when latest.json and versions.json disagree)
 *   osct content sync   --env <env> [--force] [--dry-run] [--without-videos]   (the experience is the build's)
 *   osct content purge  --env <env> --experience <id> [--dry-run] [--min-age <days>] [--keep <n>] [--unknown]
 *   osct content move   --from <old folder> --env <env> [--experience <id>] [--dry-run] [--delete-old]
 *                                                          (one-off: the layout before #87 into the store per experience)
 *   osct content export --experience <id> [--from draft|live|<build>] [--out <dir>] [--force] [--assets-base <url>]
 *                                                          (the database → the content source folder, docs/content.md "Export")
 *   osct content export --archive --env <env> --experience <id> [--dry-run]
 *                                                          (the export archive of the build live in <env>, written into its store –
 *                                                          docs/content.md "Export archive")
 *   osct targets prepare --experience <id> [--dry-run] [--force] [--all]
 *   osct delivery import <mapping.yaml | folder> --experience <id> [--files <dir>] [--layout <layout.json>] [--name <name>]
 *                        [--apply] [--overwrite] [--all] [--cache <dir>]   (a publisher's delivery into the draft, #322)
 *   osct plugins listen (--experience <id> | --all | --dir <folder>) [--dry-run]
 *                                                          (plugin API 4.0, #341: the stored plugin sources' uses.hears → uses.listens)
 *   osct plugin link <experience> [<folder>] [--id <plugin>]   (#352: a plugin developed in your own folder)
 *   osct plugin push [<folder>] [--watch] [--force]
 *   osct plugin pull [<folder>]
 *
 * Environment (or a scripts/.env file, never committed):
 *   OSCT_CONTENT_DIR             the content source (absolute or relative to the repository; fixtures/content for
 *                                the test fixture; required for build – no default)
 *   OSCT_CONTENT_ENV             environment when --env is not given: staging | production
 *   OSCT_TITLE                   the title – the first segment of every store path (default osct)
 *   OSCT_EXPERIENCE              the experience when --experience is not given (status, purge, move)
 *   OSCT_BUNNY_STORAGE_ZONE      storage zone (osct)
 *   OSCT_BUNNY_STORAGE_ENDPOINT  Storage API host (storage.bunnycdn.com)
 *   OSCT_BUNNY_STORAGE_PASSWORD  the zone's access key (read-only is enough for status and purge --dry-run)
 *   OSCT_CONTENT_BASE_URL        the environment's CDN URL (<pull zone>/<title>/<env>; the experience is added) – sync
 *                                checks what the CDN serves; purge requires it
 *   OSCT_APP_URL                 the site the reader runs on (optional) – the CDN check asks with its origin (CORS)
 * The same names as the server's settings (docs/server.md, #33).
 *   OSCT_API_URL                 targets prepare, export, delivery import, plugins listen: the instance's API (default: the local dev API, http://127.0.0.1:8080/api)
 *   OSCT_EDITOR_TOKEN            targets prepare, export, delivery import, plugins listen: a person's editor token (the editor's experiences page, AI connections)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cdnManifest,
  cdnVersions,
  checkCdn,
  DEFAULT_PURGE,
  describePurge,
  describeSync,
  isDemoBuild,
  isFixtureBuild,
  nameOf,
  planPurge,
  planSync,
  readContentBuild,
  readStore,
  runPurge,
  runSync,
  versionProblems,
} from './lib/content-sync';
import { type CliArgs, parseArgs } from './lib/cli-args';
import { buildErrors, messageOf } from './lib/errors';
import { describePlan, editorApi, planTargets, prepareTargets } from './lib/targets-prepare';
import { StorageClient } from './lib/storage';
import { deleteMoved, describeMove, experienceOf, moveProblems, planMove, runMove } from './lib/content-move';
import { APP_VERSION, CONTENT_DIR, DEMO_REFUSED_ENV, projectRoot } from './config';
import { planExport, runExport } from './lib/content-export';
import { archivedBuilds, newestArchives, runArchive } from './lib/export-archive';
import { parseMapping, type LayoutLike } from './lib/delivery-plan';
import { DeliveryProblems, deliveryApi, runDeliveryImport } from './lib/delivery-import';
import { listenSource, listenStored, pluginSourcesApi, shortDiff } from './lib/plugins-listen';
import { pluginFilesApi } from './lib/plugin-files-api';
import { idFromFolder, pullFolder, pushFolder, readLink, writeFolderTypes, writeLink, type PluginLink } from './lib/plugin-link';
import { typeCheckPlugins } from './build/plugins';
import type { ExperienceExport } from '../../shared/api/editor';
import { ENV_NAME } from '../../shared/api/rules';
import { DEFAULT_TITLE, EXPERIENCE_NAME, experienceBaseUrl, storeRoot, TITLE_NAME } from '../../shared/api/content-store';

// scripts/.env is loaded by config.ts (imported through lib/content-sync)
const here = path.dirname(fileURLToPath(import.meta.url));

const OPTIONS = {
  flags: ['force', 'dry-run', 'without-videos', 'unknown', 'delete-old', 'help', 'all', 'apply', 'overwrite', 'archive', 'watch'],
  values: ['env', 'experience', 'from', 'min-age', 'keep', 'out', 'assets-base', 'files', 'layout', 'name', 'cache', 'dir', 'id'],
};
/** The local dev API (as the MCP server's default) */
const LOCAL_API = 'http://127.0.0.1:8080/api';

const USAGE = `osct – content command line

  osct content build [--force]                 build the content source (OSCT_CONTENT_DIR)
  osct content status --env <env> [--experience <id>]
                                               versions on the storage, what the CDN serves, whether
                                               latest.json and versions.json agree (exit code 1 if not) –
                                               every experience of the environment when none is named
  osct content sync --env <env> [--force] [--dry-run] [--without-videos]
                                               upload the build as a version of its experience and make it current
  osct content purge --env <env> --experience <id> [--dry-run] [--min-age <days>] [--keep <n>] [--unknown]
                                               delete old versions that are provably out of use – never exports/ and
                                               never a build the newest export archive (of any environment) names
                                               (defaults: --min-age ${DEFAULT_PURGE.minAgeDays} --keep ${DEFAULT_PURGE.keep})
  osct content export --experience <id> [--from draft|live|<build>] [--out <dir>] [--force] [--assets-base <url>]
                                               write the experience from the editor's database as a content source
                                               folder (YAML, plugin sources, its files, EXPORT.md, export.json):
                                               --from the draft (default), the build live on the instance's own
                                               environment, or a published build; --out defaults to OSCT_CONTENT_DIR;
                                               the folder is replaced as a whole – one without EXPORT.md only with
                                               --force; files whose sha256 export.json already has are kept, not
                                               downloaded again; --assets-base resolves content paths without a host
                                               (default the experience's assetsBase, else the API's origin). OSCT_API_URL, OSCT_EDITOR_TOKEN
  osct content export --archive --env <env> --experience <id> [--dry-run]
                                               the export archive of the build live in <env> (its latest.json on the
                                               storage) into <title>/<env>/<experience>/exports/<build>/ – YAML, plugin
                                               sources, EXPORT.md, export.json naming the media by URL (none copied);
                                               an archive that is there is not written again (a publish writes one
                                               itself). The build must be in the instance's publish log. OSCT_API_URL,
                                               OSCT_EDITOR_TOKEN and the storage variables
  osct targets prepare --experience <id> [--dry-run] [--force] [--all]
                                               make the targets' recognition data ahead (#306) on an instance
                                               (--all: switched-off targets too):
                                               OSCT_API_URL (default the local dev API), OSCT_EDITOR_TOKEN
  osct delivery import <mapping.yaml | folder> --experience <id> [--files <dir>] [--layout <layout.json>]
                       [--name <name>] [--apply] [--overwrite] [--all] [--cache <dir>]
                                               a publisher's delivery into the experience's draft (#322): the mapping's
                                               pages become scenes, its pictures WebP and videos H.264 (ffmpeg, only
                                               when it names a video), each file uploaded to the Library unless it
                                               holds those bytes already; then the API's comparison per scene, entry
                                               and target (+ new, ~ changed, ! conflict; --all lists the same ones too).
                                               Nothing is written without --apply; --overwrite writes the conflicts
                                               (rows edited in the editor since the last delivery) too. A folder holds
                                               delivery.yaml and the files; else the files lie next to the mapping or
                                               in --files. --layout: the print layout's sheets become scenes too.
                                               --name: the delivery's name (default the mapping's file name).
                                               --cache: where prepared files are kept between runs (default the
                                               system's temp folder). OSCT_API_URL, OSCT_EDITOR_TOKEN
  osct plugins listen (--experience <id> | --all | --dir <folder>) [--dry-run]
                                               plugin API 4.0 (#341): rewrite stored plugin sources – a spec's
                                               uses.hears → uses.listens, and hear → listen to in comments and strings.
                                               --experience / --all: the sources in the instance's database, read and
                                               written back through the editor API (OSCT_API_URL, OSCT_EDITOR_TOKEN);
                                               --dir: a content source folder's plugins/<id>/index.ts. --dry-run prints
                                               per experience and plugin the lines that would change, nothing written
  osct plugin link <experience> [<folder>] [--id <plugin>]
                                               #352: a plugin developed in your own folder and tools. Writes
                                               .osct-plugin.json (OSCT_API_URL, the experience, the plugin – --id, else
                                               the folder's name), pulls the plugin's files when it exists, and the
                                               folder's type-check files (plugin-api.d.ts, shader-files.d.ts,
                                               tsconfig.json). <folder> defaults to the current one
  osct plugin push [<folder>] [--watch] [--force]
                                               type-checks the folder's plugin as the content build does (--force pushes
                                               anyway), then sends its files (.ts, .frag, .vert, .glsl, .wgsl) to the
                                               linked plugin – the editor's stage runs them, the Code tab shows it linked.
                                               --watch pushes again on every change. OSCT_EDITOR_TOKEN
  osct plugin pull [<folder>]                  the linked plugin's files from the editor into the folder (edits made
                                               there; a file deleted there goes here too). OSCT_EDITOR_TOKEN
  osct content move --from <old folder> --env <env> [--experience <id>] [--dry-run] [--delete-old]
                                               one-off: copy an environment folder of the layout before #87
                                               (<env>/latest.json, <env>/<build>/) into <title>/<env>/<experience>/;
                                               the old folder stays unless --delete-old

Store: <title>/<env>/<experience>/ – <title> = OSCT_TITLE (default ${DEFAULT_TITLE}), <env>: staging | production,
--experience defaults to OSCT_EXPERIENCE. Storage access: OSCT_BUNNY_STORAGE_ZONE, OSCT_BUNNY_STORAGE_ENDPOINT,
OSCT_BUNNY_STORAGE_PASSWORD, OSCT_CONTENT_BASE_URL (<pull zone>/<title>/<env>), optionally OSCT_APP_URL
(environment variables or scripts/.env). docs/content-cdn.md`;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (environment variable or scripts/.env)`);
  return value;
};

const environment = (cli: CliArgs): string => {
  const env = cli.option('env') ?? process.env.OSCT_CONTENT_ENV;
  if (!env || !ENV_NAME.test(env)) {
    throw new Error('Name the environment: --env staging | production – lower-case letters, digits and -, a letter first, at most 32');
  }
  return env;
};

/** The title: the first segment of every store path (OSCT_TITLE, default osct – shared/api/content-store.ts) */
const title = (): string => {
  const value = process.env.OSCT_TITLE?.trim() || DEFAULT_TITLE;
  if (!TITLE_NAME.test(value)) throw new Error(`OSCT_TITLE "${value}" is no title name – lower-case letters, digits and -, a letter first, at most 32`);
  return value;
};

/** The experience named by --experience or OSCT_EXPERIENCE; undefined when neither is set */
const experienceOption = (cli: CliArgs): string | undefined => {
  const value = cli.option('experience') ?? (process.env.OSCT_EXPERIENCE?.trim() || undefined);
  if (value !== undefined && !EXPERIENCE_NAME.test(value)) throw new Error(`"${value}" is no experience id – letters, digits, _ and -, at most 64`);
  return value;
};

const requiredExperience = (cli: CliArgs): string => {
  const value = experienceOption(cli);
  if (!value) throw new Error('Name the experience: --experience <id> (or OSCT_EXPERIENCE)');
  return value;
};

const storage = () =>
  new StorageClient({
    endpoint: required('OSCT_BUNNY_STORAGE_ENDPOINT'),
    zone: required('OSCT_BUNNY_STORAGE_ZONE'),
    accessKey: required('OSCT_BUNNY_STORAGE_PASSWORD'),
  });

/**
 * `osct content export` (#322): the export endpoint's answer for the draft, the live build or a published build, written
 * as a content source folder (lib/content-export.ts)
 */
async function exportCommand(cli: CliArgs): Promise<void> {
  if (cli.flag('archive')) return archiveCommand(cli);
  const experience = requiredExperience(cli);
  const out = cli.option('out') ? path.resolve(cli.option('out')!) : CONTENT_DIR;
  if (!out) throw new Error('Name the folder: --out <dir> (or OSCT_CONTENT_DIR)');
  const apiUrl = (process.env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, '');
  const token = required('OSCT_EDITOR_TOKEN');
  const get = async <T>(route: string): Promise<T> => {
    const response = await fetch(`${apiUrl}${route}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`GET ${route} → ${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
    return response.json() as Promise<T>;
  };
  const from = cli.option('from') ?? 'draft';
  // The experience: where its content paths resolve (`assetsBase`), where it is live
  const tree = await get<{ experience: { assetsBase?: string; live?: { env: string; build: string | null }[] } }>(`/editor/experiences/${encodeURIComponent(experience)}`);
  let build: string | null = null;
  if (from === 'live') {
    const { env } = await get<{ env: string }>('/editor/environments');
    build = tree.experience.live?.find(live => live.env === env)?.build ?? null;
    if (!build) throw new Error(`${experience} is not live on this instance's environment (${env}) – export the draft or name a published build`);
  } else if (from !== 'draft') {
    if (!/^[0-9a-f]{12}$/.test(from)) throw new Error('--from takes draft, live or a published build (12 hex digits)');
    build = from;
  }
  console.log(`📤 ${experience} on ${apiUrl} – ${build ? `build ${build}` : 'the draft'} → ${out}`);
  const data = await get<ExperienceExport>(`/editor/experiences/${encodeURIComponent(experience)}/export${build ? `?build=${build}` : ''}`);
  const plan = planExport(data);
  const base = (cli.option('assets-base') ?? (tree.experience.assetsBase || new URL(apiUrl).origin)).replace(/\/+$/, '');
  const download = async (url: string): Promise<Uint8Array> => {
    const absolute = /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
    const response = await fetch(absolute);
    if (!response.ok) throw new Error(`GET ${absolute} → ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const result = await runExport(data, plan, { out, force: cli.flag('force'), download, instance: apiUrl, cliVersion: APP_VERSION, log: line => console.log(line) });
  result.record.problems.forEach(problem => console.warn(`   ⚠️  ${problem}`));
  console.log(`✅ ${result.out}: ${plan.texts.size} source files, ${result.record.files.length} files (${result.downloaded} downloaded, ${result.kept} kept from the previous export)` +
    ` – build ${data.build}, hash ${data.hash.slice(0, 12)}${data.unknown ? `, ${data.unknown} files the instance knows nothing of` : ''}`);
}

/**
 * `osct content export --archive --env <env>` (#322): the export archive of the build live in the environment (its store's
 * latest.json), from the export endpoint's answer for that build, written into the store (lib/export-archive.ts)
 */
async function archiveCommand(cli: CliArgs): Promise<void> {
  const experience = requiredExperience(cli);
  const env = environment(cli);
  const root = storeRoot(title(), env, experience);
  const client = storage();
  const raw = await client.get(`${root}/latest.json`);
  const build = raw ? (JSON.parse(Buffer.from(raw).toString('utf8')) as { build?: string }).build : undefined;
  if (!build || !/^[0-9a-f]{12}$/.test(build)) throw new Error(`${root}/latest.json names no build – nothing is live to archive`);
  const apiUrl = (process.env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, '');
  const token = required('OSCT_EDITOR_TOKEN');
  const route = `/editor/experiences/${encodeURIComponent(experience)}/export?build=${build}`;
  const response = await fetch(`${apiUrl}${route}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`GET ${route} → ${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
  const data = (await response.json()) as ExperienceExport;
  const plan = planExport(data);
  console.log(`🗄️  ${experience}: the archive of build ${build} (${env}) → ${root}/exports/${build}/ – ${plan.texts.size} source files, ${plan.downloads.size} files named`);
  plan.problems.forEach(problem => console.warn(`   ⚠️  ${problem}`));
  if (cli.flag('dry-run')) {
    console.log('Dry run – nothing written.');
    return;
  }
  const result = await runArchive(client, root, data, plan, { instance: apiUrl, title: title(), env, writtenBy: 'cli' });
  console.log(result.written ? `✅ ${result.path}/ written (builds it names: ${result.record.builds.map(b => `${b.env}/${b.build}`).join(', ')})` : `✅ ${result.path}/ is there already – an archive is never written again`);
}

/**
 * `osct delivery import` (#322 T6): a mapping file (or a folder with `delivery.yaml`) and its files through the editor API
 * into the experience's draft (lib/delivery-import.ts) – the comparison first, written only with --apply
 */
async function deliveryImport(cli: CliArgs): Promise<void> {
  const input = cli.positional[2];
  if (!input) throw new Error('Name the delivery: osct delivery import <mapping.yaml | folder> --experience <id>');
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) throw new Error(`${resolved} does not exist`);
  const isFolder = fs.statSync(resolved).isDirectory();
  const mappingFile = isFolder ? path.join(resolved, 'delivery.yaml') : resolved;
  if (!fs.existsSync(mappingFile)) throw new Error(`${resolved} holds no delivery.yaml – name the mapping file`);
  const filesDir = cli.option('files') ? path.resolve(cli.option('files')!) : path.dirname(mappingFile);
  const mappingProblems: string[] = [];
  const mapping = parseMapping(fs.readFileSync(mappingFile, 'utf8'), path.basename(mappingFile), mappingProblems);
  const named = experienceOption(cli);
  if (named && mapping.experience && named !== mapping.experience) throw new Error(`The mapping is for the experience ${mapping.experience}, not ${named}`);
  const experience = named ?? mapping.experience;
  if (!experience) throw new Error('Name the experience: --experience <id> (or OSCT_EXPERIENCE)');
  const layoutFile = cli.option('layout');
  const layout = layoutFile ? (JSON.parse(fs.readFileSync(path.resolve(layoutFile), 'utf8')) as LayoutLike) : undefined;
  const name = cli.option('name') ?? (isFolder ? path.basename(resolved) : path.basename(mappingFile).replace(/\.ya?ml$/i, ''));
  const apiUrl = (process.env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, '');
  const api = deliveryApi(apiUrl, required('OSCT_EDITOR_TOKEN'));
  console.log(`📦 Delivery ${name} → ${experience} on ${apiUrl}`);
  console.log(`📄 Mapping: ${mappingFile} (${Object.keys(mapping.entries).length} entries) · files: ${filesDir}${layout ? ` · layout: ${path.resolve(layoutFile!)}` : ''}`);
  mappingProblems.forEach(problem => console.error(`   ❌ ${problem}`));
  try {
    const report = await runDeliveryImport(api, {
      experience,
      mapping,
      filesDir,
      layout,
      name,
      source: `mapping ${path.basename(mappingFile)}, files ${path.basename(filesDir)}`,
      apply: cli.flag('apply'),
      overwrite: cli.flag('overwrite'),
      all: cli.flag('all'),
      media: { cacheDir: cli.option('cache') ? path.resolve(cli.option('cache')!) : path.join(os.tmpdir(), 'osct-delivery-cache') },
      log: line => console.log(line),
    });
    if (mappingProblems.length || report.problems.length || report.comparison.problems.length) process.exitCode = 1;
  } catch (error) {
    if (!(error instanceof DeliveryProblems)) throw error;
    // The draft changed between the comparison and `apply` so that the delivery has problems now: nothing was written
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

/** The CDN URL of an experience's store: OSCT_CONTENT_BASE_URL (the environment's, `<pull zone>/<title>/<env>`) + the experience */
const baseUrl = (experience: string) => {
  const base = process.env.OSCT_CONTENT_BASE_URL?.replace(/\/+$/, '');
  return base ? experienceBaseUrl(base, experience) : undefined;
};

/** The status of every experience in the environment (or of the one named): exit code 1 when a store disagrees */
async function status(cli: CliArgs): Promise<void> {
  const env = environment(cli);
  const client = storage();
  const named = experienceOption(cli);
  const experiences = named ? [named] : (await client.list(`${title()}/${env}`)).filter(i => i.isDirectory).map(nameOf).sort();
  if (experiences.length === 0) {
    console.log(`📍 ${title()}/${env}/: no experience on the storage`);
    return;
  }
  for (const experience of experiences) await statusOf(client, env, experience);
}

async function statusOf(client: StorageClient, env: string, experience: string): Promise<void> {
  const root = storeRoot(title(), env, experience);
  const state = await readStore(client, root);
  const current = state.current
    ? `${state.current.build} (schema ${state.current.schema}, since ${state.current.activatedAt})`
    : state.current === null ? 'not readable' : 'none';
  console.log(`📍 ${root}/latest.json: ${current}`);
  const versions = state.versions ?? [];
  for (const v of versions) {
    console.log(`   ${v.build}  schema ${v.schema}  app ${v.version}  current ${v.activatedAt} → ${v.retiredAt ?? 'now'}`);
  }
  const recorded = new Set(versions.map(v => v.build));
  state.listing
    .filter(i => !(i.isDirectory && recorded.has(nameOf(i))) && !/\/(latest|versions)\.json$/.test(i.path))
    .forEach(i => console.log(`   ? ${i.path}${i.isDirectory ? '/' : ''} (not a version on record)`));
  // The bookkeeping on the storage: latest.json must name a build versions.json records as current (#175)
  const bullets = (items: string[]) => items.map(item => `\n   - ${item}`).join('');
  const problems = versionProblems(state.current, state.versions);
  if (problems.length > 0) {
    console.warn(`⚠️  ${root}: latest.json and versions.json disagree on the storage – \`osct content sync\` of the current build repairs versions.json${bullets(problems)}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${root}: latest.json and versions.json agree on the storage`);
  }
  const url = baseUrl(experience);
  if (url) {
    const [seen, record] = await Promise.all([cdnManifest(url), cdnVersions(url)]);
    console.log(`🌐 CDN latest.json: ${seen.manifest?.build ?? seen.status}${seen.cors === false ? ' (no CORS header)' : seen.cors === null ? ' (CORS not checked: OSCT_APP_URL unset)' : ''}`);
    // What a reader of the CDN sees: an edge without the cache rule for versions.json serves an old copy (warning only)
    const edge = seen.manifest && record.versions ? versionProblems(seen.manifest, record.versions) : [];
    if (edge.length > 0) {
      console.warn(`⚠️  CDN versions.json (${record.status}) disagrees with its latest.json – the edge caches versions.json; ` +
        `add the edge rule for it and purge it (docs/content-cdn.md)${bullets(edge)}`);
    } else {
      console.log(`🌐 CDN versions.json: ${record.versions ? 'agrees with latest.json' : record.status}`);
    }
  }
}

/** `osct targets prepare` (#306): the targets without recognition data (every one with --force, switched-off ones with --all), made and stored back */
async function targetsPrepare(cli: CliArgs): Promise<void> {
  const experience = cli.option('experience');
  if (!experience) throw new Error('Name the experience: --experience <id>');
  const apiUrl = (process.env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, '');
  const api = editorApi(apiUrl, required('OSCT_EDITOR_TOKEN'));
  const plan = planTargets(await api.tree(experience), { force: cli.flag('force'), all: cli.flag('all'), origin: new URL(apiUrl).origin });
  console.log(`🎯 ${experience} on ${apiUrl}`);
  describePlan(plan).forEach(line => console.log(line));
  if (cli.flag('dry-run')) {
    console.log('Dry run – nothing changed.');
    return;
  }
  const done = await prepareTargets(api, experience, plan, line => console.log(line));
  const ms = done.reduce((sum, target) => sum + target.makeMs, 0);
  console.log(`✅ ${done.length} targets prepared${done.length ? ` (${Math.round(ms / done.length)} ms each here)` : ''} – the draft has them; publish to reach readers`);
}

/**
 * One-off (#87): an environment folder of the layout before the store per experience (`<from>/latest.json`,
 * `<from>/<build>/`) is copied into `<title>/<env>/<experience>/` (lib/content-move.ts). The experience is the old
 * folder's (its latest.json) unless named. The old folder stays unless --delete-old – then it goes only when every moved
 * file arrived intact.
 */
async function move(cli: CliArgs): Promise<void> {
  const from = cli.option('from');
  if (!from || !ENV_NAME.test(from)) throw new Error('Name the old folder: --from staging (an environment folder at the zone root)');
  const env = environment(cli);
  const client = storage();
  const experience = experienceOption(cli) ?? (await experienceOf(client, from));
  if (!experience) throw new Error(`${from}/latest.json names no experience – name it: --experience <id>`);
  const plan = await planMove(client, from, storeRoot(title(), env, experience));
  describeMove(plan).forEach(line => console.log(line));
  if (cli.flag('dry-run')) {
    console.log(`Dry run – nothing copied${cli.flag('delete-old') ? ', nothing deleted' : ''}.`);
    return;
  }
  await runMove(client, plan);
  const problems = await moveProblems(client, plan);
  if (problems.length > 0) {
    process.exitCode = 1;
    console.warn(`⚠️  ${problems.length} files did not arrive as they were – run the move again:\n   - ${problems.slice(0, 10).join('\n   - ')}`);
    return;
  }
  console.log(`✅ ${plan.to}/ holds every moved file; ${plan.from}/ ${cli.flag('delete-old') ? 'goes now' : 'stays (--delete-old deletes it)'}`);
  if (cli.flag('delete-old')) {
    await deleteMoved(client, plan);
    console.log(`✅ ${plan.from}/: the moved versions, its latest.json and versions.json are deleted. CDN edges may keep copies until their cache time ends.`);
  }
}

/**
 * `osct plugins listen` (#341, plugin API 4.0): the plugin sources of a content source folder (`--dir`) or of the
 * instance's experiences (`--experience`, `--all`, through the editor API) rewritten by `listenSource` – with --dry-run
 * only the short diff per experience and plugin
 */
async function pluginsListen(cli: CliArgs): Promise<void> {
  const dryRun = cli.flag('dry-run');
  const print = (where: string, before: string, after: string) => {
    console.log(`~ ${where}`);
    shortDiff(before, after).forEach(line => console.log(`  ${line}`));
  };
  const dir = cli.option('dir');
  if (dir) {
    const root = path.join(path.resolve(dir), 'plugins');
    const ids = fs.existsSync(root) ? fs.readdirSync(root).filter(id => fs.existsSync(path.join(root, id, 'index.ts'))).sort() : [];
    let changed = 0;
    for (const id of ids) {
      const file = path.join(root, id, 'index.ts');
      const before = fs.readFileSync(file, 'utf8');
      const after = listenSource(before);
      if (after === before) continue;
      changed++;
      print(`plugins/${id}`, before, after);
      if (!dryRun) fs.writeFileSync(file, after);
    }
    console.log(`${dryRun ? 'Dry run – nothing written. ' : ''}${ids.length} plugin sources in ${root}, ${changed} ${dryRun ? 'would change' : 'changed'}`);
    return;
  }
  const apiUrl = (process.env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, '');
  const api = pluginSourcesApi(apiUrl, required('OSCT_EDITOR_TOKEN'));
  const experience = cli.option('experience');
  if (!experience && !cli.flag('all')) throw new Error('Name the experience: --experience <id>, or --all (or --dir <content folder>)');
  const experiences = experience ? [experience] : await api.experiences();
  console.log(`🎧 plugin sources on ${apiUrl} – ${experiences.join(', ') || 'no experiences'}`);
  const { changes, checked } = await listenStored(api, experiences, dryRun);
  changes.forEach(change => print(`${change.experience} · ${change.plugin}`, change.before, change.after));
  console.log(`${dryRun ? 'Dry run – nothing written. ' : ''}${checked} plugin sources, ${changes.length} ${dryRun ? 'would change' : 'changed'}` +
    (changes.length && !dryRun ? ' – each a change in History; publish each experience again for its readers' : ''));
}

/** The editor API the plugin commands talk to: the link's, else OSCT_API_URL (the local dev API by default) */
const apiOf = (link?: PluginLink | null): string => (link?.api ?? (process.env.OSCT_API_URL?.trim() || LOCAL_API)).replace(/\/+$/, '');

/** A folder's link, or why there is none */
const linkOf = (folder: string): PluginLink => {
  const link = readLink(folder);
  if (!link) throw new Error(`${folder} is not linked – osct plugin link <experience> ${folder === process.cwd() ? '' : folder}`.trim());
  return link;
};

/**
 * `osct plugin link / push / pull` (#352): a plugin in someone's own folder, linked to a plugin of an experience
 * (`lib/plugin-link.ts`). Push type-checks first, as the content build does.
 */
async function pluginCommand(cli: CliArgs, command: string): Promise<void> {
  const typesOf = () => [
    fs.readFileSync(path.join(projectRoot, 'editor', 'src', 'lib', 'plugins', 'plugin-api.d.ts'), 'utf8'),
    fs.readFileSync(path.join(projectRoot, 'shared', 'types', 'plugin-shader-files.d.ts'), 'utf8'),
  ] as const;
  if (command === 'link') {
    const experience = cli.positional[2];
    if (!experience) throw new Error('Name the experience: osct plugin link <experience> [<folder>] [--id <plugin>]');
    const folder = path.resolve(cli.positional[3] ?? '.');
    const plugin = cli.option('id') ?? idFromFolder(folder);
    const link: PluginLink = { api: apiOf(), experience, plugin };
    writeLink(folder, link);
    const api = pluginFilesApi(link.api, required('OSCT_EDITOR_TOKEN'));
    try {
      const pulled = await pullFolder(api, folder, link);
      console.log(`🔗 ${folder} → ${experience} · ${plugin} on ${link.api}; pulled ${pulled.written.join(', ') || 'nothing new'}`);
    } catch (e) {
      if (!/→ 404/.test(messageOf(e))) throw e;
      console.log(`🔗 ${folder} → ${experience} · ${plugin} on ${link.api} – a new plugin: osct plugin push makes it`);
    }
    const made = writeFolderTypes(folder, ...typesOf());
    if (made.length) console.log(`   for your editor's type check: ${made.join(', ')}`);
    return;
  }
  const folder = path.resolve(cli.positional[2] ?? '.');
  const link = linkOf(folder);
  const api = pluginFilesApi(link.api, required('OSCT_EDITOR_TOKEN'));
  if (command === 'pull') {
    const { written, deleted } = await pullFolder(api, folder, link);
    console.log(`⬇️  ${link.experience} · ${link.plugin}: ${written.length ? `wrote ${written.join(', ')}` : 'nothing new'}${deleted.length ? `; deleted ${deleted.join(', ')} (gone in the editor)` : ''}`);
    return;
  }
  if (command !== 'push') throw new Error(`osct plugin ${command}: link, push or pull`);
  const push = async (): Promise<void> => {
    if (!cli.flag('force')) {
      const before = buildErrors.length;
      typeCheckPlugins([path.join(folder, 'index.ts')]);
      const errors = buildErrors.splice(before);
      if (errors.length) {
        console.error(`❌ ${link.plugin}: ${errors.length} type ${errors.length === 1 ? 'error' : 'errors'} – not pushed (--force pushes anyway)\n   ${errors.slice(0, 10).join('\n   ')}`);
        process.exitCode = 1;
        return;
      }
    }
    const files = await pushFolder(api, folder, link);
    process.exitCode = 0;
    console.log(`⬆️  ${link.experience} · ${link.plugin} on ${link.api}: ${files.map(f => f.name).join(', ')} – the editor's stage runs it`);
  };
  await push();
  if (!cli.flag('watch')) return;
  console.log(`👀 watching ${folder} – Ctrl+C stops`);
  let timer: NodeJS.Timeout | null = null;
  fs.watch(folder, (_event, name) => {
    if (!name || name.startsWith('.') || !/\.(ts|frag|vert|glsl|wgsl)$/.test(String(name))) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void push().catch(e => console.error(`❌ ${messageOf(e)}`)), 300);
  });
  await new Promise(() => undefined);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2), OPTIONS);
  const { flag } = cli;
  const [group, command] = cli.positional;
  if (group === 'targets' && command === 'prepare' && !flag('help')) return targetsPrepare(cli);
  if (group === 'delivery' && command === 'import' && !flag('help')) return deliveryImport(cli);
  if (group === 'plugins' && command === 'listen' && !flag('help')) return pluginsListen(cli);
  if (group === 'plugin' && command && !flag('help')) return pluginCommand(cli, command);
  if (group !== 'content' || !command || flag('help')) {
    console.log(USAGE);
    if (group && group !== 'help') process.exitCode = 1;
    return;
  }
  switch (command) {
    case 'build': {
      const result = spawnSync(process.execPath, [path.join(here, 'index.js'), ...(flag('force') ? ['--force'] : [])], { stdio: 'inherit' });
      process.exitCode = result.status ?? 1;
      return;
    }
    case 'status':
      return status(cli);
    case 'sync': {
      const env = environment(cli);
      const build = readContentBuild();
      if (isFixtureBuild(build)) {
        throw new Error('This build is the test fixture (fixtures/content) – build the content source first (OSCT_CONTENT_DIR)');
      }
      if (isDemoBuild(build) && env === DEMO_REFUSED_ENV) {
        throw new Error(`This build is the demo (fixtures/demo) – it is never synced to ${DEMO_REFUSED_ENV}, readers of the app never get it`);
      }
      // The store is the build's experience: --experience only confirms it
      const experience = build.experience;
      if (!experience) throw new Error('The build names no experience (experience.id) – rebuild the content');
      const named = cli.option('experience');
      if (named !== undefined && named !== experience) throw new Error(`This build is the experience ${experience}, not ${named}`);
      const root = storeRoot(title(), env, experience);
      const client = storage();
      const plan = await planSync(client, root, build, flag('force'));
      describeSync(plan).forEach(line => console.log(line));
      if (plan.missingVideos.length > 0) {
        const message = `${plan.missingVideos.length} videos of the current version are missing in this build although their entries stay ` +
          '(a checkout without the git-ignored videos?)';
        if (!flag('without-videos')) throw new Error(`${message}. Sync from a machine that has them, or pass --without-videos.`);
        console.warn(`⚠️  ${message} – syncing anyway (--without-videos)`);
      }
      if (plan.uploaded && plan.current && plan.agrees) {
        console.log(`✅ ${root}/ is up to date`);
        return;
      }
      if (flag('dry-run')) {
        console.log('Dry run – nothing changed.');
        return;
      }
      await runSync(client, plan);
      const url = baseUrl(experience);
      if (url) await checkCdn(url, build);
      return;
    }
    case 'purge': {
      const env = environment(cli);
      const experience = requiredExperience(cli);
      const root = storeRoot(title(), env, experience);
      const url = baseUrl(experience);
      // Strict: what the CDN serves counts as in use, so the check needs the CDN URL
      if (!url) throw new Error('OSCT_CONTENT_BASE_URL is not set – purge checks which version the CDN serves');
      const client = storage();
      const [state, seen, archives] = await Promise.all([readStore(client, root), cdnManifest(url), newestArchives(client, title(), experience)]);
      if (!seen.manifest && !seen.status.startsWith('404')) {
        throw new Error(`The CDN's latest.json could not be read (${seen.status}) – nothing is purged without knowing what it serves`);
      }
      // The builds the newest export archive of the experience needs (#322): unreadable archives stop the purge
      if (archives.unreadable.length) throw new Error(`Export archives without a readable export.json: ${archives.unreadable.join(', ')} – nothing is purged without knowing what they name`);
      archives.newest.forEach(({ env: archiveEnv, record }) => console.log(`🗄️  newest export archive in ${archiveEnv}: ${record.build} (${record.exportedAt}) names ${record.builds.map(b => `${b.env}/${b.build}`).join(', ')}`));
      const plan = planPurge(state, seen.manifest?.build ?? null, Date.now(), {
        minAgeDays: cli.number('min-age', DEFAULT_PURGE.minAgeDays),
        keep: cli.number('keep', DEFAULT_PURGE.keep),
        unknown: flag('unknown'),
        archived: archivedBuilds(archives, env),
      });
      console.log(`🌐 CDN latest.json: ${seen.manifest?.build ?? seen.status}`);
      describePurge(plan).forEach(line => console.log(line));
      if (!plan.items.some(i => i.purge)) {
        console.log('Nothing to purge.');
        return;
      }
      if (flag('dry-run')) {
        console.log('Dry run – nothing deleted.');
        return;
      }
      await runPurge(client, plan);
      console.log('✅ Purged. CDN edges may keep copies of deleted files until their cache time ends.');
      return;
    }
    case 'move':
      return move(cli);
    case 'export':
      return exportCommand(cli);
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`❌ ${messageOf(error)}`);
  process.exit(1);
});
