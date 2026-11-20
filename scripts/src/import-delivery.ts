/**
 * Delivery import: the files a publisher delivers (printed images, entry images, videos) → `content/`,
 * driven by a mapping file: `node dist/import-delivery.js <delivery folder> <mapping.yaml>`
 * (`npm run import -- <delivery folder> import/<name>.yaml`).
 *
 * Mapping file:
 *   experience: osct
 *   entries:
 *     <entry id>:
 *       category: glossary | video | text | link      title, page   (entry fields; author, body, caption, media optional)
 *       target: <file>      the image as printed – becomes target.jpg (JPEG, ≤ MAX_TARGET_SIZE px)
 *       image: <file>       the entry image – becomes image.jpg (JPEG, ≤ MAX_ENTRY_IMAGE_SIZE px)
 *       video: <file>       AR video on the target – becomes video.mp4 (ffmpeg: H.264, ≤ 1280 px, ~2 Mbit/s)
 *       printed: { width, height, position }   mm and position on the page – checked, not used since the trigger
 *                           protocol went (#32): the places come from the layout (layout/place-targets.py)
 *       enabled: false      the target is switched off (#249): in the content, not in the reader's experience
 *       tags: [<tag>, …]    the entry's tags (e.g. `artwork`, to find a kind of target again)
 *       note: <text>        anything the editors should know – written as a comment into entry.yaml
 * Paths are relative to the delivery folder.
 *
 * Contract: media files are (re)written when the delivered file is newer; `entry.yaml` and `scene.yaml`
 * are written only when missing, so edited texts survive a second import. Content schema 3.0 (#319): the delivery's
 * page numbers are mapped to scenes here, once – an entry's `scene` is written, never its page. One scene per pair of
 * facing pages (page 1 and the last page stand alone) for every page with an entry: `s<first>-<last>`, label
 * "<first>–<last>", order = first page, one surface twice the page's width (a single page: one page wide). When the
 * content has a print layout (`layout/layout.json`), every sheet of it gets its scene too (#296): the cover, the front
 * and back matter (double pages without printed numbers), the numbered sheets without an entry and the back cover
 * (`layoutScenes`), the page size from the layout. Every problem is reported; the import exits 1 when something
 * could not be done (a warning – e.g. a video without a target – does not).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { isObject } from '../../shared/guards/game-config';
import { BOOK_PAGE_MM, CONTENT_DIR, requireContentDir } from './config';
import { isMainModule } from './lib/entry';
import { toJpeg } from './lib/optimize-media';

/** Target images: recognition needs detail – more than the client copy keeps (optimize-media: 1200) */
export const MAX_TARGET_SIZE = 1600;
export const MAX_ENTRY_IMAGE_SIZE = 1600;
/** Long side of a video (720p landscape or portrait) */
export const MAX_VIDEO_SIZE = 1280;
export const TARGET_FILE = 'target.jpg';
export const IMAGE_FILE = 'image.jpg';
export const VIDEO_FILE = 'video.mp4';

export interface MappedEntry {
  category: string;
  title: string;
  page: number;
  author?: string;
  body?: string;
  /** The line under the entry image (schema 2.34, #289) */
  caption?: string;
  media?: string;
  target?: string;
  image?: string;
  video?: string;
  printed?: { width: number; height: number; position: string };
  /** `false`: the target is switched off (#249) – written into entry.yaml; on is the default */
  enabled?: boolean;
  tags?: string[];
  note?: string;
}

export interface Mapping {
  experience?: string;
  entries: Record<string, MappedEntry>;
}

export interface ImportReport {
  entriesWritten: string[];
  scenesWritten: string[];
  mediaWritten: string[];
  problems: string[];
  /** Things worth knowing that do not stop the import (e.g. a video without a target) */
  warnings: string[];
}

const OPTIONAL_TEXTS = ['author', 'body', 'caption', 'media', 'target', 'image', 'video', 'note'] as const;

/** One entry of the mapping, read field by field; null (and why in `problems`) when it cannot be imported */
function readMappedEntry(id: string, value: unknown, problems: string[]): MappedEntry | null {
  const required = `${id}: category, title and page are required`;
  if (!isObject(value)) {
    problems.push(required);
    return null;
  }
  const { category, title, page, printed, enabled, tags } = value;
  if (typeof category !== 'string' || !category || typeof title !== 'string' || !title || typeof page !== 'number' || !Number.isFinite(page)) {
    problems.push(required);
    return null;
  }
  const entry: MappedEntry = { category, title, page };
  for (const key of OPTIONAL_TEXTS) {
    const text = value[key];
    if (typeof text === 'string') entry[key] = text;
    else if (text !== undefined && text !== null) problems.push(`${id}.${key}: expected a text`);
  }
  if (isObject(printed) && typeof printed.width === 'number' && typeof printed.height === 'number' && typeof printed.position === 'string') {
    entry.printed = { ...printed, width: printed.width, height: printed.height, position: printed.position };
  } else if (printed !== undefined && printed !== null) {
    problems.push(`${id}.printed: expected { width, height, position } (mm and the place on the page)`);
  }
  if (typeof enabled === 'boolean') entry.enabled = enabled;
  else if (enabled !== undefined && enabled !== null) problems.push(`${id}.enabled: expected true or false`);
  if (Array.isArray(tags) && tags.every(tag => typeof tag === 'string' && tag !== '')) entry.tags = tags;
  else if (tags !== undefined && tags !== null) problems.push(`${id}.tags: expected a list of words`);
  return entry;
}

/**
 * The mapping file: its entries that can be imported. Every entry that cannot (or a field of the wrong type, which
 * is left out) is reported in `problems`; a file without `entries` is refused.
 */
export function readMapping(file: string, problems: string[] = []): Mapping {
  const data: unknown = yaml.load(fs.readFileSync(file, 'utf8'));
  if (!isObject(data) || !isObject(data.entries)) throw new Error(`${file}: expected a mapping with "entries"`);
  const entries: Record<string, MappedEntry> = {};
  for (const [key, value] of Object.entries(data.entries)) {
    const id = unpaddedId(key);
    if (entries[id]) {
      problems.push(`${key}: the same id as another entry once the leading zeros are gone (${id}) – left out`);
      continue;
    }
    const entry = readMappedEntry(id, value, problems);
    if (entry) entries[id] = entry;
  }
  return { ...(typeof data.experience === 'string' ? { experience: data.experience } : {}), entries };
}

/** The pair of facing pages a page belongs to: 1 | 2–3 | 4–5 | … | last (alone when even) */
export const scenePages = (page: number, lastPage: number): [number, number] => {
  if (page <= 1) return [1, 1];
  const first = page - (page % 2);
  return [first, Math.min(first + 1, lastPage)];
};

/** The scene id of a page range: `s1`, `s2-3` – no leading zeros (#63): the order is the scene's `order`, never its id */
export const pagesSceneId = ([first, last]: [number, number]) => (first === last ? `s${first}` : `s${first}-${last}`);

/**
 * An id without leading zeros (#63): `p004-1` → `p4-1`, `s004-005` → `s4-5` – a mapping written before keeps working
 * and imports the ids the database has since the one-off rename (#63, 3.10.0); any other id stays as it is
 */
export const unpaddedId = (id: string): string =>
  id.replace(/^([sp])(\d+)(?:-(\d+))?(?=\D|$)/, (_, prefix: string, first: string, second?: string) =>
    `${prefix}${Number(first)}${second === undefined ? '' : `-${Number(second)}`}`);

const newer = (source: string, output: string) =>
  !fs.existsSync(output) || fs.statSync(source).mtimeMs > fs.statSync(output).mtimeMs;

/** A layout sheet as `layout/layout.json` lists it – what `layoutScenes` reads */
export interface LayoutSheetLike {
  id: string;
  kind: string;
  pages: number[];
}

/**
 * A scene the import writes (schema 3.0): its folder id, label, order and how many pages wide its one surface is – a
 * double page is one surface of twice the page's width, a cover or a single page one of the page's width. The pages
 * are the import's only: they place the scene in the order and the entries in it once, and are not written.
 */
export interface ImportScene {
  id: string;
  label: string;
  order: number;
  /** 1 (a cover, a single page) or 2 (a double page) */
  pagesWide: 1 | 2;
  /** The printed pages it holds (internal numbers for front and back matter – only to find an entry's scene) */
  pages: [number, number];
}

/** The scene of a page range: `186–187` (one surface, two pages wide), a single page `1` */
export const pagesScene = (range: [number, number]): ImportScene => ({
  id: pagesSceneId(range),
  label: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
  order: range[0],
  pagesWide: range[0] === range[1] ? 1 : 2,
  pages: range,
});

/**
 * The scenes of a print layout's sheets, in book order: the cover, the front matter (`front-1` … `front-<n>`, the
 * last one next to page 1), one scene per numbered sheet, the back matter after the last printed page (`back-1` …)
 * and the back cover. `order` sorts them (the cover first); the pages are the import's own numbering.
 */
export const layoutScenes = (sheets: readonly LayoutSheetLike[]): ImportScene[] => {
  const front = sheets.filter(sheet => sheet.kind === 'front-matter');
  const back = sheets.filter(sheet => sheet.kind === 'back-matter');
  const numbered = sheets.filter(sheet => sheet.kind === 'spread' && sheet.pages.length > 0);
  const lastPrinted = Math.max(0, ...numbered.flatMap(sheet => sheet.pages));
  const scenes: ImportScene[] = [];
  if (sheets.some(sheet => sheet.kind === 'cover-front')) {
    scenes.push({ id: 'cover', label: 'Cover', order: -2 * front.length - 1, pagesWide: 1, pages: [0, 0] });
  }
  front.forEach((_, i) => {
    const first = -2 * (front.length - i);
    scenes.push({ id: `front-${i + 1}`, label: `Front matter ${i + 1}`, order: first, pagesWide: 2, pages: [first, first + 1] });
  });
  for (const sheet of numbered) scenes.push(pagesScene([Math.min(...sheet.pages), Math.max(...sheet.pages)]));
  back.forEach((_, i) => {
    const first = lastPrinted + 1 + 2 * i;
    scenes.push({ id: `back-${i + 1}`, label: `Back matter ${i + 1}`, order: first, pagesWide: 2, pages: [first, first + 1] });
  });
  if (sheets.some(sheet => sheet.kind === 'cover-back')) {
    const page = lastPrinted + 2 * back.length + 1;
    scenes.push({ id: 'back', label: 'Back cover', order: page, pagesWide: 1, pages: [page, page] });
  }
  return scenes;
};

/** scene.yaml of an imported scene: its label, order and one surface (`surface`) of its pages' width */
export const sceneYaml = (scene: ImportScene, source: string, page: { width: number; height: number } = BOOK_PAGE_MM) =>
  `${comment(`${source}: ${scene.label}.`)}
label: ${quote(scene.label)}
order: ${scene.order}
surfaces:
  - id: surface
    widthMm: ${page.width * scene.pagesWide}
    heightMm: ${page.height}
`;

/** The layout's page size and scenes, or none when the content has no layout */
function readLayout(): { page?: { width: number; height: number }; scenes: ImportScene[] } {
  const file = path.join(CONTENT_DIR, 'layout', 'layout.json');
  if (!fs.existsSync(file)) return { scenes: [] };
  const layout = JSON.parse(fs.readFileSync(file, 'utf8')) as { page?: { width: number; height: number }; sheets?: LayoutSheetLike[] };
  return { ...(layout.page ? { page: layout.page } : {}), scenes: layoutScenes(layout.sheets ?? []) };
}

/** Writes a scene that the content does not have yet (by id) */
function writeScene(scene: ImportScene, source: string, page: { width: number; height: number } | undefined, report: ImportReport): void {
  const file = path.join(CONTENT_DIR, 'scenes', scene.id, 'scene.yaml');
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, sceneYaml(scene, source, page));
  report.scenesWritten.push(scene.id);
}

const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const comment = (text: string) => text.split('\n').map(line => `# ${line}`).join('\n');

function writeImage(source: string, output: string, maxSize: number, report: ImportReport): boolean {
  if (!fs.existsSync(source)) {
    report.problems.push(`${path.relative(CONTENT_DIR, output)}: delivered file not found: ${source}`);
    return false;
  }
  if (!newer(source, output)) return true;
  const mimeType = /\.png$/i.test(source) ? 'image/png' : 'image/jpeg';
  const data = toJpeg(new Uint8Array(fs.readFileSync(source)), mimeType, maxSize);
  if (!data) {
    report.problems.push(`${path.relative(CONTENT_DIR, output)}: cannot read ${source} (JPEG and PNG only)`);
    return false;
  }
  fs.writeFileSync(output, data);
  report.mediaWritten.push(path.relative(CONTENT_DIR, output));
  return true;
}

/** ffmpeg: H.264 MP4, long side ≤ MAX_VIDEO_SIZE, ~2 Mbit/s, AAC audio, moov atom first (streams at once) */
export const ffmpegArgs = (source: string, output: string): string[] => [
  '-y', '-loglevel', 'error', '-i', source,
  '-vf', `scale='if(gt(iw,ih),min(${MAX_VIDEO_SIZE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_VIDEO_SIZE},ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '2M', '-bufsize', '4M', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
  '-movflags', '+faststart',
  output,
];

function writeVideo(source: string, output: string, report: ImportReport): boolean {
  if (!fs.existsSync(source)) {
    report.problems.push(`${path.relative(CONTENT_DIR, output)}: delivered file not found: ${source}`);
    return false;
  }
  if (!newer(source, output)) return true;
  const result = spawnSync('ffmpeg', ffmpegArgs(source, output), { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    report.problems.push(`${path.relative(CONTENT_DIR, output)}: ffmpeg failed – ${result.error?.message ?? result.stderr.trim()}`);
    if (fs.existsSync(output)) fs.unlinkSync(output);
    return false;
  }
  report.mediaWritten.push(path.relative(CONTENT_DIR, output));
  return true;
}

function entryYaml(e: MappedEntry, sceneId: string, files: { target: boolean; image: boolean; video: boolean }, mappingName: string): string {
  const lines = [
    comment(`Imported from ${mappingName} (${[e.target, e.image, e.video].filter(Boolean).join(', ')}).`),
    comment('Placeholder title and body – the texts follow.'),
  ];
  if (e.note) lines.push(comment(`Note: ${e.note}`));
  lines.push(`category: ${e.category}`, `title: ${quote(e.title)}`, `scene: ${sceneId}`);
  if (e.author) lines.push(`author: ${quote(e.author)}`);
  lines.push(`body: ${quote(e.body ?? 'Placeholder – the text follows.')}`);
  if (files.image) lines.push(`image: ${IMAGE_FILE}`);
  if (e.caption) lines.push(`caption: ${quote(e.caption)}`);
  if (e.media) lines.push(`media: ${quote(e.media)}`);
  if (e.tags?.length) lines.push(`tags: [${e.tags.map(quote).join(', ')}]`);
  if (files.target) {
    lines.push('target:', `  image: ${TARGET_FILE}`);
    if (e.enabled === false) lines.push('  enabled: false');
    if (files.video) lines.push('  entity:', '    type: video', `    src: ${VIDEO_FILE}`);
  }
  return lines.join('\n') + '\n';
}

/** Import one mapping into CONTENT_DIR */
export function importDelivery(deliveryDir: string, mappingFile: string): ImportReport {
  const report: ImportReport = { entriesWritten: [], scenesWritten: [], mediaWritten: [], problems: [], warnings: [] };
  const mapping = readMapping(mappingFile, report.problems);
  const mappingName = path.basename(mappingFile);
  const ids = Object.keys(mapping.entries);
  const lastPage = Math.max(...ids.map(id => mapping.entries[id].page));
  // The delivery's pages → scenes, once: a sheet of the layout that holds the page, else the pair of facing pages
  const layout = readLayout();
  const sceneOfPage = (page: number): ImportScene =>
    layout.scenes.find(scene => page >= scene.pages[0] && page <= scene.pages[1]) ?? pagesScene(scenePages(page, lastPage));
  const scenes = new Map<string, ImportScene>();

  for (const id of ids) {
    const e = mapping.entries[id];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      report.problems.push(`${id}: entry ids are lowercase letters, digits and dashes`);
      continue;
    }
    const scene = sceneOfPage(e.page);
    scenes.set(scene.id, scene);
    const dir = path.join(CONTENT_DIR, 'entries', id);
    fs.mkdirSync(dir, { recursive: true });
    const files = {
      target: !!e.target && writeImage(path.join(deliveryDir, e.target), path.join(dir, TARGET_FILE), MAX_TARGET_SIZE, report),
      image: !!e.image && writeImage(path.join(deliveryDir, e.image), path.join(dir, IMAGE_FILE), MAX_ENTRY_IMAGE_SIZE, report),
      video: !!e.video && writeVideo(path.join(deliveryDir, e.video), path.join(dir, VIDEO_FILE), report),
    };
    if (e.video && !e.target) report.warnings.push(`${id}: a video needs a target to play on – imported as an entry without AR`);
    const yamlFile = path.join(dir, 'entry.yaml');
    if (!fs.existsSync(yamlFile)) {
      fs.writeFileSync(yamlFile, entryYaml(e, scene.id, files, mappingName));
      report.entriesWritten.push(id);
    } else if (e.enabled === false && !/^ {2}enabled: false\s*$/m.test(fs.readFileSync(yamlFile, 'utf8'))) {
      report.warnings.push(`${id}: the delivery switches its target off, but entry.yaml is kept – add "enabled: false" under target (or switch it off in the editor)`);
    }
  }

  const ordered = [...scenes.values()].sort((x, y) => x.order - y.order);
  ordered.forEach(scene => writeScene(scene, `Imported from ${mappingName}`, layout.page, report));
  layout.scenes.forEach(scene => writeScene(scene, 'From the print layout (layout/layout.json)', layout.page, report));
  return report;
}

if (isMainModule(import.meta.url)) {
  const [deliveryDir, mappingFile] = process.argv.slice(2);
  if (!deliveryDir || !mappingFile) {
    console.error('Usage: node dist/import-delivery.js <delivery folder> <mapping.yaml>');
    process.exit(2);
  }
  console.log('📦 OSCT delivery import');
  console.log('📁 Delivery:', path.resolve(deliveryDir));
  console.log('📄 Mapping:', path.resolve(mappingFile));
  console.log('📁 Content:', requireContentDir());
  const report = importDelivery(path.resolve(deliveryDir), path.resolve(mappingFile));
  console.log(`\n✅ ${report.mediaWritten.length} media files written, ${report.entriesWritten.length} new entries, ${report.scenesWritten.length} new scenes`);
  for (const warning of report.warnings) console.warn(`   ⚠️  ${warning}`);
  for (const problem of report.problems) console.error(`   ❌ ${problem}`);
  if (report.problems.length) process.exit(1);
}
