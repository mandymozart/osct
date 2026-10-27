/**
 * Delivery import: the files a publisher delivers (printed images, entry images, videos) → `content/`,
 * driven by a mapping file: `node dist/import-delivery.js <delivery folder> <mapping.yaml>`
 * (`npm run import -- <delivery folder> import/<name>.yaml`).
 *
 * Mapping file:
 *   book: osct
 *   entries:
 *     <entry id>:
 *       category: glossary | video | text | link      title, page   (entry fields; author, body, media optional)
 *       target: <file>      the image as printed – becomes target.jpg (JPEG, ≤ MAX_TARGET_SIZE px)
 *       image: <file>       the entry image – becomes image.jpg (JPEG, ≤ MAX_ENTRY_IMAGE_SIZE px)
 *       video: <file>       AR video on the target – becomes video.mp4 (ffmpeg: H.264, ≤ 1280 px, ~2 Mbit/s)
 *       printed: { width, height, position }   mm and position on the page – for the trigger protocol only
 *       note: <text>        anything the editors should know – written as a comment into entry.yaml
 * Paths are relative to the delivery folder.
 *
 * Contract: media files are (re)written when the delivered file is newer; `entry.yaml` and `spread.yaml`
 * are written only when missing, so edited texts survive a second import. One spread per pair of facing
 * pages (page 1 and the last page stand alone) for every page with an entry: `s<first>-<last>`, title
 * "<first>–<last>", order = first page. Every problem is reported; the import exits 1 when something
 * could not be done (a warning – e.g. a video without a target – does not).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { CONTENT_DIR } from './config';
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
  media?: string;
  target?: string;
  image?: string;
  video?: string;
  printed?: { width: number; height: number; position: string };
  note?: string;
}

export interface Mapping {
  book?: string;
  entries: Record<string, MappedEntry>;
}

export interface ImportReport {
  entriesWritten: string[];
  spreadsWritten: string[];
  mediaWritten: string[];
  problems: string[];
  /** Things worth knowing that do not stop the import (e.g. a video without a target) */
  warnings: string[];
}

export function readMapping(file: string): Mapping {
  const data = yaml.load(fs.readFileSync(file, 'utf8')) as Mapping;
  if (!data || typeof data !== 'object' || !data.entries || typeof data.entries !== 'object') {
    throw new Error(`${file}: expected a mapping with "entries"`);
  }
  return data;
}

/** The pair of facing pages a page belongs to: 1 | 2–3 | 4–5 | … | last (alone when even) */
export const spreadPages = (page: number, lastPage: number): [number, number] => {
  if (page <= 1) return [1, 1];
  const first = page - (page % 2);
  return [first, Math.min(first + 1, lastPage)];
};

const spreadId = ([first, last]: [number, number]) =>
  first === last ? `s${String(first).padStart(3, '0')}` : `s${String(first).padStart(3, '0')}-${String(last).padStart(3, '0')}`;

const newer = (source: string, output: string) =>
  !fs.existsSync(output) || fs.statSync(source).mtimeMs > fs.statSync(output).mtimeMs;

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

function entryYaml(e: MappedEntry, files: { target: boolean; image: boolean; video: boolean }, mappingName: string): string {
  const lines = [
    comment(`Imported from ${mappingName} (${[e.target, e.image, e.video].filter(Boolean).join(', ')}).`),
    comment('Placeholder title and body – the texts follow.'),
  ];
  if (e.note) lines.push(comment(`Note: ${e.note}`));
  lines.push(`category: ${e.category}`, `title: ${quote(e.title)}`, `page: ${e.page}`);
  if (e.author) lines.push(`author: ${quote(e.author)}`);
  lines.push(`body: ${quote(e.body ?? 'Placeholder – the text follows.')}`);
  if (files.image) lines.push(`image: ${IMAGE_FILE}`);
  if (e.media) lines.push(`media: ${quote(e.media)}`);
  if (files.target) {
    lines.push('target:', `  image: ${TARGET_FILE}`);
    if (files.video) lines.push('  entity:', '    type: video', `    src: ${VIDEO_FILE}`);
  }
  return lines.join('\n') + '\n';
}

/** Import one mapping into CONTENT_DIR */
export function importDelivery(deliveryDir: string, mappingFile: string): ImportReport {
  const report: ImportReport = { entriesWritten: [], spreadsWritten: [], mediaWritten: [], problems: [], warnings: [] };
  const mapping = readMapping(mappingFile);
  const mappingName = path.basename(mappingFile);
  const ids = Object.keys(mapping.entries);
  const lastPage = Math.max(...ids.map(id => mapping.entries[id].page));

  for (const id of ids) {
    const e = mapping.entries[id];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      report.problems.push(`${id}: entry ids are lowercase letters, digits and dashes`);
      continue;
    }
    if (!e.category || !e.title || typeof e.page !== 'number') {
      report.problems.push(`${id}: category, title and page are required`);
      continue;
    }
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
      fs.writeFileSync(yamlFile, entryYaml(e, files, mappingName));
      report.entriesWritten.push(id);
    }
  }

  const pages = new Set(ids.map(id => mapping.entries[id].page).filter(page => typeof page === 'number'));
  for (const page of [...pages].sort((a, b) => a - b)) {
    const range = spreadPages(page, lastPage);
    const id = spreadId(range);
    const dir = path.join(CONTENT_DIR, 'spreads', id);
    const file = path.join(dir, 'spread.yaml');
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(dir, { recursive: true });
    const title = range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
    fs.writeFileSync(file, `${comment(`Imported from ${mappingName}: pages ${title}.`)}\ntitle: ${quote(title)}\norder: ${range[0]}\nfirstPage: ${range[0]}\nlastPage: ${range[1]}\n`);
    report.spreadsWritten.push(id);
  }
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const [deliveryDir, mappingFile] = process.argv.slice(2);
  if (!deliveryDir || !mappingFile) {
    console.error('Usage: node dist/import-delivery.js <delivery folder> <mapping.yaml>');
    process.exit(2);
  }
  console.log('📦 OSCT delivery import');
  console.log('📁 Delivery:', path.resolve(deliveryDir));
  console.log('📄 Mapping:', path.resolve(mappingFile));
  console.log('📁 Content:', CONTENT_DIR);
  const report = importDelivery(path.resolve(deliveryDir), path.resolve(mappingFile));
  console.log(`\n✅ ${report.mediaWritten.length} media files written, ${report.entriesWritten.length} new entries, ${report.spreadsWritten.length} new spreads`);
  for (const warning of report.warnings) console.warn(`   ⚠️  ${warning}`);
  for (const problem of report.problems) console.error(`   ❌ ${problem}`);
  if (report.problems.length) process.exit(1);
}
