/**
 * `osct content export` (#322 T2, agents/research/2026-11-20-importer-export-plan.md §3, docs/content.md "Export"): the
 * database → the content source folder. The input is the export endpoint's answer (`GET /editor/experiences/{id}/export`,
 * `ExperienceExport`): a configuration as the reader gets it, the plugin sources, the credits and every file URL. This
 * module writes it back in the content source format – one writer per source file, the inverse of `src/build/*` – and
 * downloads the files next to the YAML that names them, so `osct content build` turns the folder into the same
 * configuration.
 *
 *   planExport   the folder as texts and downloads (pure – no file system, no network)
 *   runExport    writes the plan into a temp folder, downloads (resuming by sha256 from the previous export.json), swaps it in
 *   exportOfBuild the export endpoint's answer for a content build (the round-trip test, a local check)
 *
 * What the source format cannot hold is reported as a problem and listed in EXPORT.md (e.g. an initial scene that is not
 * the first scene, the order of the entries – the build sorts them by scene and title).
 */
import { createHash } from 'crypto';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import type { ExperienceExport, ExportFile } from '../../../shared/api/editor';
import type { AssetData, EntityData, EntryData, GameConfiguration, SceneData, TargetData } from '../../../shared/types/game-config';
import type { MediaLevelData } from '../../../shared/types/media-levels';
import type { TextureSetData } from '../../../shared/types/textures';
import { subtitleNameOf } from '../../../shared/types/subtitles';
import { rowPlaces } from '../build/scenes';
import { pluginFilesOf } from '../build/plugins';
import { listFiles } from './files';

/** The marker of an export: who wrote it, from what – "do not edit, re-export" */
export const EXPORT_MARKER = 'EXPORT.md';
/** The machine record of an export: per file its URL, sha256, size */
export const EXPORT_RECORD = 'export.json';
/** The Library's credit lines of the exported files (file path → line) – the build gives them to the configuration */
export const CREDITS_FILE = 'credits.yaml';
/** The scene groups (`[{ id, label }]`) – the build gives them to the configuration */
export const GROUPS_FILE = 'groups.yaml';
/** Marker files of the repository's folders: the demo's is carried over into its export, the fixture is never an export */
export const CARRIED_MARKERS = ['DEMO.md'];
export const REFUSED_MARKER = 'FIXTURE.md';

const CONTENT_PREFIX = '/assets/content/';
/** A value that names a file (the export endpoint's rule, `Export::FILE`) */
export const FILE_VALUE = /^(?:https?:\/\/|\/assets\/content\/)\S+\.(?:glb|gltf|mp4|webm|mov|m4v|jpe?g|png|webp|gif|svg|mp3|m4a|ogg|wav|glsl|frag|vert|wgsl|vtt|json|js|hdr|exr|ktx2)(?:[?#]\S*)?$/i;

/** A file the export writes by downloading it */
export interface PlannedDownload {
  url: string;
  /** What the export endpoint knows of it (null: a value that is not in its list) */
  file: ExportFile | null;
}

export interface ExportPlan {
  /** Path in the folder → its text (YAML, plugin sources, EXPORT.md is added by runExport) */
  texts: Map<string, string>;
  /** Path in the folder → the file to download there */
  downloads: Map<string, PlannedDownload>;
  /** What the content source cannot hold, or files it could not place */
  problems: string[];
}

/** One file of export.json */
export interface ExportRecordFile {
  path: string;
  url: string;
  sha256: string;
  size: number;
}

export interface ExportRecord {
  experience: string;
  instance: string;
  source: ExperienceExport['source'];
  build: string;
  hash: string;
  schema: string;
  appVersion: string;
  cliVersion: string;
  exportedAt: string;
  files: ExportRecordFile[];
  problems: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The content path of a URL below an assets base or of a content path (`/assets/content/…`, no query), else null */
export const contentPathOf = (value: string): string | null => {
  const at = value.indexOf(CONTENT_PREFIX);
  if (at < 0) return null;
  return value.slice(at).replace(/[?#].*$/, '');
};

/** A file name for the folder: the URL's last segment, decoded, with only safe characters */
const fileNameOf = (url: string): string => {
  const last = url.replace(/[?#].*$/, '').replace(/^.*\//, '');
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // keep it as it is
  }
  name = name.replace(/[^A-Za-z0-9._@-]+/g, '-').replace(/^[.-]+/, '');
  return name || 'file';
};

const YAML_OPTIONS: yaml.DumpOptions = { lineWidth: -1, noRefs: true, quotingType: '"' };
export const toYaml = (value: unknown): string => yaml.dump(value, YAML_OPTIONS);

/**
 * The content source of an export: every YAML file, the plugin sources and the files to download. Deterministic – the
 * same answer gives the same texts (so a second export of an unchanged experience changes nothing but EXPORT.md and export.json).
 */
export function planExport(data: ExperienceExport): ExportPlan {
  const config = data.configuration as GameConfiguration;
  const texts = new Map<string, string>();
  const downloads = new Map<string, PlannedDownload>();
  const problems: string[] = [];
  const filesByUrl = new Map(data.files.map(file => [file.url, file]));
  /** The folder paths each URL already has (one URL can be needed in several folders) */
  const placed = new Map<string, string>();

  const reserve = (wanted: string, url: string): string => {
    const ext = path.posix.extname(wanted);
    const stem = wanted.slice(0, wanted.length - ext.length);
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? wanted : `${stem}-${n}${ext}`;
      const taken = downloads.get(candidate);
      if (!taken && !texts.has(candidate)) {
        downloads.set(candidate, { url, file: filesByUrl.get(url) ?? null });
        return candidate;
      }
      if (taken?.url === url) return candidate;
    }
  };

  /**
   * A file the build needs next to its source file (`contentFile(section, id, name)`): its name in `folder`. A content path
   * already in that folder keeps its name (and sub-folder); anything else gets its file name there.
   */
  const local = (url: string, folder: string): string => {
    const key = `${folder}\n${url}`;
    const known = placed.get(key);
    if (known) return known.slice(folder.length + 1);
    const contentPath = contentPathOf(url);
    const inFolder = contentPath?.startsWith(`${CONTENT_PREFIX}${folder}/`) ? contentPath.slice(CONTENT_PREFIX.length) : null;
    const at = reserve(inFolder ?? `${folder}/${fileNameOf(url)}`, url);
    placed.set(key, at);
    return at.slice(folder.length + 1);
  };

  /**
   * A file a value names as an address (a texture or model parameter, the environment's world and sky): a content path
   * stays where it is, a URL is downloaded into `folder`; the value becomes the content path
   */
  const address = (url: string, folder: string): string => {
    const contentPath = contentPathOf(url);
    if (contentPath) return `${CONTENT_PREFIX}${reserve(contentPath.slice(CONTENT_PREFIX.length), url)}`;
    return `${CONTENT_PREFIX}${folder}/${local(url, folder)}`;
  };

  const isFile = (value: string) => filesByUrl.has(value) || (FILE_VALUE.test(value) && !/\.js(?:[?#]|$)/i.test(value));
  /** Every file value inside parameters, components, a material: downloaded, named by its content path */
  const addresses = (value: unknown, folder: string): unknown => {
    if (typeof value === 'string') return isFile(value) ? address(value, folder) : value;
    if (Array.isArray(value)) return value.map(item => addresses(item, folder));
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, addresses(item, folder)]));
    return value;
  };

  const levelsOf = (levels: readonly MediaLevelData[], folder: string) =>
    Object.fromEntries(levels.map(level => [String(level.level), local(level.src, folder)]));
  const texturesOf = (sets: readonly TextureSetData[], folder: string): unknown => {
    const sizes = (set: TextureSetData) => Object.fromEntries(set.sizes.map(size => [String(size.size), local(size.src, folder)]));
    return sets.length === 1 && !sets[0].material ? sizes(sets[0]) : sets.map(set => ({ ...(set.material ? { material: set.material } : {}), sizes: sizes(set) }));
  };
  const assetFiles = (asset: AssetData, folder: string) => ({
    ...(asset.textures ? { textures: texturesOf(asset.textures, folder) } : {}),
    ...(asset.levels ? { levels: levelsOf(asset.levels, folder) } : {}),
  });

  /** One node of an entity's tree as authored (the inverse of `buildNode`): asset ids as the build derives them */
  const nodeOf = (node: EntityData, label: string, idBase: string, folder: string, depth: number, kind: 'entities' | 'entries'): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (node.id !== undefined) out.id = node.id;
    if (node.name !== undefined) out.name = node.name;
    out.type = node.type;
    const srcId = depth === 0 && kind === 'entries' ? `${idBase}-media` : idBase;
    const assets = node.assets ?? [];
    if (assets.length === 1 && assets[0].id === srcId) {
      out.src = local(assets[0].src, folder);
      Object.assign(out, assetFiles(assets[0], folder));
    } else if (assets.length) {
      out.assets = assets.map((asset, i) => {
        const prefix = `${idBase}-`;
        let id = asset.id;
        if (id.startsWith(prefix)) id = id.slice(prefix.length);
        else problems.push(`${label}: asset id "${asset.id}" does not start with "${prefix}" – the build will name it "${prefix}${id}"`);
        return { ...(id === String(i) ? {} : { id }), src: local(asset.src, folder), ...assetFiles(asset, folder) };
      });
    }
    if (node.params !== undefined) out.params = addresses(node.params, folder);
    if (node.filters !== undefined) out.filters = node.filters;
    if (node.components !== undefined) out.components = addresses(node.components, folder);
    if (node.material !== undefined) out.material = addresses(node.material, folder);
    if (node.children?.length) out.children = node.children.map((child, i) => nodeOf(child, `${label} children[${i}]`, `${idBase}-${i}`, folder, depth + 1, kind));
    if (node.text !== undefined) out.text = node.text;
    if (node.color !== undefined) out.color = node.color;
    if (node.light !== undefined) out.light = node.light;
    return out;
  };

  // experience.yaml – every field of the experience as it is (the build keeps the ones it does not know), the
  // environment's world and sky as files of the folder
  const experience: Record<string, unknown> = { id: config.experience.id, title: config.experience.title };
  for (const [key, value] of Object.entries(config.experience)) {
    if (key === 'id' || key === 'title') continue;
    if (key === 'environment' && isObject(value)) {
      experience.environment = Object.fromEntries(Object.entries(value).map(([field, src]) =>
        [field, (field === 'worldSrc' || field === 'skySrc') && typeof src === 'string' && src ? address(src, 'environment').slice(CONTENT_PREFIX.length) : src]));
    } else if (key === 'landing' && isObject(value)) {
      // The landing's pick (#355): its ids – the build extracts the hero again
      experience.landing = { scene: value.scene, target: value.target };
    } else experience[key] = value;
  }
  texts.set('experience.yaml', toYaml(experience));

  // scenes/<id>/scene.yaml – the order is their position; a surface's place only when it is not where the row puts it
  const scenes = config.scenes as readonly SceneData[];
  if (scenes.length && config.initialScene && config.initialScene !== scenes[0].id) {
    problems.push(`initialScene "${config.initialScene}" is not the first scene – a content build opens on the first scene ("${scenes[0].id}")`);
  }
  scenes.forEach((scene, i) => {
    const row = rowPlaces(scene.surfaces.map(surface => surface.widthMm));
    const surfaces = scene.surfaces.map((surface, j) => {
      const same = JSON.stringify(surface.place) === JSON.stringify(row[j]);
      return { id: surface.id, ...(surface.label !== undefined ? { label: surface.label } : {}), widthMm: surface.widthMm, heightMm: surface.heightMm, ...(same ? {} : { place: surface.place }) };
    });
    texts.set(`scenes/${scene.id}/scene.yaml`, toYaml({
      label: scene.label,
      order: i + 1,
      ...(scene.group !== undefined ? { group: scene.group } : {}),
      surfaces,
      ...(scene.passes !== undefined ? { passes: scene.passes } : {}),
      ...(scene.logic !== undefined ? { logic: scene.logic } : {}),
    }));
  });
  if (config.groups?.length) texts.set(GROUPS_FILE, toYaml(config.groups.map(group => ({ id: group.id, label: group.label }))));

  // entities/<ref>/entity.yaml
  for (const [ref, node] of Object.entries(config.entities ?? {})) {
    texts.set(`entities/${ref}/entity.yaml`, toYaml(nodeOf(node, `entities/${ref}`, ref, `entities/${ref}`, 0, 'entities')));
  }

  // entries/<id>/entry.yaml – the build sorts the entries by scene order and title, the database by their position
  const KNOWN_ENTRY = new Set(['id', 'category', 'title', 'scene', 'surface', 'body', 'author', 'image', 'imageLevels', 'caption', 'media', 'tags', 'target']);
  const KNOWN_TARGET = new Set(['id', 'imageSrc', 'entity', 'place', 'enabled', 'recognition', 'recognitionOff']);
  for (const entry of config.entries as readonly EntryData[]) {
    const folder = `entries/${entry.id}`;
    Object.keys(entry).filter(key => !KNOWN_ENTRY.has(key)).forEach(key => problems.push(`${folder}: "${key}" is no field of an entry's source – left out`));
    const out: Record<string, unknown> = { category: entry.category, title: entry.title, scene: entry.scene };
    if (entry.surface) out.surface = entry.surface;
    if (entry.author) out.author = entry.author;
    out.body = entry.body ?? '';
    if (entry.image) {
      out.image = local(entry.image, folder);
      if (entry.imageLevels !== undefined) out.imageLevels = levelsOf(entry.imageLevels, folder);
    }
    if (entry.caption) out.caption = entry.caption;
    if (entry.media) out.media = entry.media;
    out.tags = entry.tags ?? [];
    if (entry.target) out.target = targetOf(entry.target, entry.id, folder);
    texts.set(`${folder}/entry.yaml`, toYaml(out));
  }

  function targetOf(target: TargetData, entryId: string, folder: string): Record<string, unknown> {
    Object.keys(target).filter(key => !KNOWN_TARGET.has(key)).forEach(key => problems.push(`${folder} target: "${key}" is no field of a target's source – left out`));
    const out: Record<string, unknown> = {};
    if (target.id !== entryId) out.id = target.id;
    out.image = local(target.imageSrc, folder);
    if (target.entity) {
      out.entity = 'ref' in target.entity ? { ref: target.entity.ref } : nodeOf(target.entity, `${folder} target`, target.id, folder, 0, 'entries');
    }
    if (target.place) out.place = target.place;
    if (target.enabled === false) out.enabled = false;
    if (target.recognitionOff === true) out.recognitionOff = true;
    if (target.recognition) out.recognition = { image: local(target.recognition.imageSrc, folder), width: target.recognition.width, height: target.recognition.height };
    return out;
  }

  // The subtitles: `<video name>.<language>.vtt` next to the video – the build pairs them again by their names
  for (const subtitle of config.subtitles ?? []) {
    const video = [...downloads].find(([, planned]) => planned.url === subtitle.media)?.[0];
    const name = video ? subtitleNameOf(video) : null;
    if (!video || !name) {
      problems.push(`subtitles of ${subtitle.media}: the video is not in the export – left out`);
      continue;
    }
    for (const [language, url] of Object.entries(subtitle.tracks)) reserve(`${path.posix.dirname(video)}/${name}.${language}.vtt`, url);
  }

  // The print layout (the reader's card back reads layout/layout.json): its files where the content holds them
  for (const url of data.layout?.files ?? []) {
    const contentPath = contentPathOf(url);
    reserve(contentPath ? contentPath.slice(CONTENT_PREFIX.length) : `layout/${fileNameOf(url)}`, url);
  }

  // plugins/<id>/<file> – the Code tab's plugins, every file (#352); the compiled plugin.js is the build's product
  for (const plugin of [...data.plugins].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const file of plugin.files) texts.set(`plugins/${plugin.id}/${file.name}`, file.text.replace(/\r\n/g, '\n'));
  }
  for (const plugin of config.plugins ?? []) {
    if (!data.plugins.some(source => source.id === plugin.id)) problems.push(`plugins/${plugin.id}: the configuration declares it, but the database has no source of it – left out`);
  }

  // credits.yaml – the Library's lines of the files the export holds
  const credits: Record<string, string> = {};
  for (const [at, planned] of [...downloads].sort(([a], [b]) => a.localeCompare(b))) {
    const line = data.credits?.[planned.url];
    if (line) credits[at] = line;
  }
  if (Object.keys(credits).length) texts.set(CREDITS_FILE, toYaml(credits));

  return { texts, downloads, problems };
}

/** The sha256 of bytes, hex */
export const sha256Of = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** Whether a file's checksums agree with what the export endpoint knows of it (nothing known: false – download again) */
const matches = (known: ExportFile | null, sha256: string): boolean => {
  if (known?.sha256) return known.sha256.toLowerCase() === sha256;
  if (known?.v) return sha256.startsWith(known.v.toLowerCase());
  return false;
};

export interface RunExportOptions {
  /** The folder to write (replaced as a whole) */
  out: string;
  /** Write over a folder that is no export (no EXPORT.md) */
  force?: boolean;
  /** Fetches a file's bytes */
  download: (url: string) => Promise<Uint8Array>;
  /** Where the export came from (EXPORT.md, export.json) */
  instance: string;
  cliVersion: string;
  /** Progress lines */
  log?: (line: string) => void;
  /** Parallel downloads */
  parallel?: number;
}

export interface ExportResult {
  out: string;
  record: ExportRecord;
  downloaded: number;
  kept: number;
}

/** Why a folder must not be written over, or null */
export function overwriteProblem(out: string, force = false): string | null {
  if (!fs.existsSync(out)) return null;
  if (!fs.statSync(out).isDirectory()) return `${out} is a file, not a folder`;
  if (fs.existsSync(path.join(out, REFUSED_MARKER))) return `${out} is the test fixture (${REFUSED_MARKER}) – it is hand-written, never an export`;
  const entries = fs.readdirSync(out);
  if (!entries.length || entries.includes(EXPORT_MARKER) || force) return null;
  return `${out} is no export (no ${EXPORT_MARKER}) – the export replaces the whole folder. Move it aside, or pass --force to replace it`;
}

/** The previous export.json of a folder, by path (only files that are still there with that checksum count) */
function previousFiles(out: string): Map<string, ExportRecordFile> {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(out, EXPORT_RECORD), 'utf8')) as Partial<ExportRecord>;
    return new Map((record.files ?? []).filter(file => typeof file?.path === 'string' && typeof file.sha256 === 'string').map(file => [file.path, file]));
  } catch {
    return new Map();
  }
}

/** Runs `tasks` with at most `limit` at a time */
async function inParallel<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++]);
  }));
}

/** EXPORT.md: what the folder is, from where, when – "do not edit, re-export" */
export function exportMarker(data: ExperienceExport, record: ExportRecord): string {
  const source = data.source.kind === 'draft'
    ? 'the draft'
    : `the published build ${data.build} (${data.source.env}, ${data.source.publishedAt}${data.source.publishedBy ? `, by ${data.source.publishedBy}` : ''})`;
  const lines = [
    '# Export – do not edit, re-export',
    '',
    `This folder is an export of the experience \`${data.experience}\` from the editor's database, written by`,
    '`osct content export` (docs/content.md "Export"). The database is the truth: an edit here is lost on the next',
    'export – change the experience in the editor and export it again. `osct content build` builds this folder.',
    '',
    '| | |',
    '|---|---|',
    `| Instance | ${record.instance} |`,
    `| Experience | ${data.experience} – ${data.configuration.experience?.title ?? ''} |`,
    `| From | ${source} |`,
    `| Build | ${data.build} |`,
    `| Hash | ${data.hash} |`,
    `| Content schema | ${data.schema || '–'} |`,
    `| Exported | ${record.exportedAt} |`,
    `| App version | ${data.appVersion} (instance), ${record.cliVersion} (osct CLI) |`,
    `| Files | ${record.files.length} (export.json: URL, sha256, size of each) |`,
    '',
  ];
  if (record.problems.length) lines.push('What the content source cannot hold (left out or changed):', '', ...record.problems.map(problem => `- ${problem}`), '');
  return lines.join('\n');
}

/**
 * Writes an export: the plan into `<out>.export-tmp`, the files downloaded (or taken from the previous export when its
 * export.json names the same URL with a checksum the endpoint confirms), EXPORT.md and export.json, then the temp folder
 * replaces `out` as a whole. Nothing of the old folder survives but the demo's marker.
 */
export async function runExport(data: ExperienceExport, plan: ExportPlan, options: RunExportOptions): Promise<ExportResult> {
  const out = path.resolve(options.out);
  const log = options.log ?? (() => undefined);
  const refused = overwriteProblem(out, options.force);
  if (refused) throw new Error(refused);
  const temp = `${out}.export-tmp`;
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  const write = (at: string, data: string | Uint8Array) => {
    const file = path.join(temp, ...at.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  try {
    for (const [at, text] of plan.texts) write(at, text);
    for (const marker of CARRIED_MARKERS) {
      if (fs.existsSync(path.join(out, marker))) fs.copyFileSync(path.join(out, marker), path.join(temp, marker));
    }

    const previous = previousFiles(out);
    const files: ExportRecordFile[] = [];
    let downloaded = 0;
    let kept = 0;
    await inParallel([...plan.downloads], options.parallel ?? 4, async ([at, planned]) => {
      const before = previous.get(at);
      const oldFile = path.join(out, ...at.split('/'));
      let bytes: Uint8Array | null = null;
      if (before && before.url === planned.url && matches(planned.file, before.sha256) && fs.existsSync(oldFile)) {
        const old = new Uint8Array(fs.readFileSync(oldFile));
        if (sha256Of(old) === before.sha256) {
          bytes = old;
          kept++;
        }
      }
      if (!bytes) {
        bytes = await options.download(planned.url);
        downloaded++;
        log(`   ⬇️  ${at}`);
      }
      const sha256 = sha256Of(bytes);
      if (planned.file && (planned.file.sha256 || planned.file.v) && !matches(planned.file, sha256)) {
        plan.problems.push(`${at}: its sha256 ${sha256.slice(0, 12)}… is not the one the instance records (${planned.file.sha256 ?? planned.file.v}) – written as downloaded`);
      }
      write(at, bytes);
      files.push({ path: at, url: planned.url, sha256, size: bytes.byteLength });
    });
    files.sort((a, b) => a.path.localeCompare(b.path));

    const record: ExportRecord = {
      experience: data.experience,
      instance: options.instance,
      source: data.source,
      build: data.build,
      hash: data.hash,
      schema: data.schema,
      appVersion: data.appVersion,
      cliVersion: options.cliVersion,
      exportedAt: data.exportedAt,
      files,
      problems: plan.problems,
    };
    write(EXPORT_RECORD, `${JSON.stringify(record, null, 2)}\n`);
    write(EXPORT_MARKER, exportMarker(data, record));

    // The swap: the old folder aside, the new one in, the old one gone
    const old = `${out}.export-old`;
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(out)) fs.renameSync(out, old);
    fs.renameSync(temp, out);
    fs.rmSync(old, { recursive: true, force: true });
    return { out, record, downloaded, kept };
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

/**
 * The export endpoint's answer for a content build: its configuration (`client/src/game.config.json`), the files it names
 * as content paths (where `assetsDir` holds them – the build's copy, or the content folder itself), the layout's files and
 * the plugin sources of `contentDir`. For the round-trip test and a local check – an instance answers the same shape.
 */
export function exportOfBuild(configuration: GameConfiguration, contentDir: string, assetsDir: string): ExperienceExport {
  const files = new Map<string, ExportFile>();
  const add = (value: string) => {
    if (files.has(value) || !FILE_VALUE.test(value)) return;
    const contentPath = contentPathOf(value);
    const file = contentPath ? path.join(assetsDir, ...contentPath.slice(CONTENT_PREFIX.length).split('/')) : null;
    const bytes = file && fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null;
    files.set(value, { url: value, path: contentPath, origin: bytes ? 'import' : 'unknown', size: bytes?.byteLength ?? null, sha256: bytes ? sha256Of(bytes) : null, v: bytes ? sha256Of(bytes).slice(0, 12) : null });
  };
  const walk = (node: unknown, top: boolean) => {
    if (typeof node === 'string') add(node);
    else if (Array.isArray(node)) node.forEach(item => walk(item, false));
    else if (isObject(node)) Object.entries(node).forEach(([key, value]) => { if (!(top && key === 'credits')) walk(value, false); });
  };
  walk(configuration, true);
  const layoutFiles = listFiles(path.join(assetsDir, 'layout')).map(file => `${CONTENT_PREFIX}layout/${file}`);
  layoutFiles.forEach(add);
  // A built folder's plugins (#352): every file of a plugin's folder the editor would take
  const plugins = listFiles(path.join(contentDir, 'plugins'))
    .filter(file => /^[^/]+\/index\.ts$/.test(file))
    .map(file => {
      const id = file.split('/')[0];
      const files = pluginFilesOf(path.join(contentDir, 'plugins', id));
      return { id, files, size: files.reduce((sum, f) => sum + Buffer.byteLength(f.text), 0), updatedAt: '', updatedBy: null, origin: null };
    });
  const hash = configuration.version?.hash ?? '';
  return {
    experience: configuration.experience.id,
    source: { kind: 'draft' },
    build: hash.slice(0, 12),
    hash,
    schema: configuration.version?.schema ?? '',
    appVersion: configuration.version?.version ?? '',
    exportedAt: new Date().toISOString(),
    configuration,
    files: [...files.values()],
    unknown: [...files.values()].filter(file => file.origin === 'unknown').length,
    layout: layoutFiles.includes(`${CONTENT_PREFIX}layout/layout.json`) ? { file: `${CONTENT_PREFIX}layout/layout.json`, files: layoutFiles } : null,
    plugins,
    credits: { ...(configuration.credits ?? {}) },
  };
}
