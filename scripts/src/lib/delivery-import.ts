/**
 * `osct delivery import` (#322 T6): a publisher's delivery into an experience's draft through the editor API – the
 * database is the only truth, the content folder is never read or written (docs/content.md "Importing a delivery").
 *
 * 1. The delivered files are prepared here, as the folder's import did: pictures as WebP under the image rule
 *    (shared/api/images.ts – `fit=target` for a printed image, `fit=entryImage` for an entry's picture), videos with ffmpeg
 *    (H.264 ≤ 1280 px, AAC, `ffmpegArgs`; ffmpeg is needed only when the mapping names a video). Each result is kept in a
 *    cache folder by the delivered file's sha256, so a second run makes the same bytes without encoding again.
 * 2. Each file goes to the experience's Library (`POST …/assets`) unless the Library already holds those bytes (its
 *    `sha256`, `GET …/assets`) – nothing is uploaded twice.
 * 3. The plan (`delivery-plan.ts`) goes to `POST …/deliveries` without `apply`: the server's comparison is printed; with
 *    `apply` the same plan is written (one transaction, a change per row naming the delivery – revertable per delivery).
 *
 * The API decides the rights: the CLI acts as the person whose token it has (`OSCT_EDITOR_TOKEN`).
 */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Asset } from '../../../shared/api/editor';
import type { DeliveryPlan, DeliveryResult } from '../../../shared/api/deliveries';
import { IMAGE_MAX_SIDE, IMAGE_WEBP_QUALITY, imageUseQuery, type ImageFit } from '../../../shared/api/images';
import { toWebp } from './optimize-media';
import { buildPlan, describeComparison, type EntryFiles, type LayoutLike, type Mapping } from './delivery-plan';

/** Long side of a video (720p landscape or portrait) */
export const MAX_VIDEO_SIZE = 1280;

/** ffmpeg: H.264 MP4, long side ≤ MAX_VIDEO_SIZE, ~2 Mbit/s, AAC audio, moov atom first (streams at once) */
export const ffmpegArgs = (source: string, output: string): string[] => [
  '-y', '-loglevel', 'error', '-i', source,
  '-vf', `scale='if(gt(iw,ih),min(${MAX_VIDEO_SIZE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_VIDEO_SIZE},ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '2M', '-bufsize', '4M', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
  '-movflags', '+faststart',
  output,
];

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** A file's sha256, read in pieces (a delivered video can be large) */
export function fileSha256(file: string): string {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1 << 20);
    let read: number;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** Turns a delivered video into `output` (H.264 MP4); throws with ffmpeg's message */
export type VideoEncoder = (source: string, output: string) => void;

/** ffmpeg on the path (as the folder's import): a missing ffmpeg or a failed encode is the video's problem */
export const ffmpegEncoder: VideoEncoder = (source, output) => {
  const result = spawnSync('ffmpeg', ffmpegArgs(source, output), { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`ffmpeg failed – ${result.error?.message ?? result.stderr.trim()}`);
  }
};

/** A prepared file: its bytes as they go to the Library */
export interface PreparedFile {
  /** The Library name it is sent with */
  name: string;
  type: string;
  bytes: Uint8Array;
  sha256: string;
  /** The upload's use (`?fit=…&entry=…`) */
  query: string;
}

/** What the media preparation needs: where results are kept between runs and how a video is encoded */
export interface MediaOptions {
  cacheDir: string;
  encodeVideo?: VideoEncoder;
}

const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** A delivered picture as WebP under the image rule for its use; the result is cached by the delivered file's sha256 */
export async function prepareImage(source: string, entry: string, fit: Extract<ImageFit, 'target' | 'entryImage'>, options: MediaOptions): Promise<PreparedFile> {
  if (!fs.existsSync(source)) throw new Error(`delivered file not found: ${source}`);
  const mime = IMAGE_TYPES[path.extname(source).toLowerCase()];
  if (!mime) throw new Error(`cannot read ${source} (JPEG and PNG only)`);
  const original = new Uint8Array(fs.readFileSync(source));
  const cached = path.join(options.cacheDir, `${sha256(original)}-${fit}${IMAGE_MAX_SIDE[fit]}-q${IMAGE_WEBP_QUALITY}.webp`);
  let bytes: Uint8Array;
  if (fs.existsSync(cached)) {
    bytes = new Uint8Array(fs.readFileSync(cached));
  } else {
    const webp = await toWebp(original, mime, fit);
    if (!webp) throw new Error(`cannot read ${source} (JPEG and PNG only)`);
    bytes = webp;
    fs.mkdirSync(options.cacheDir, { recursive: true });
    fs.writeFileSync(cached, bytes);
  }
  const suffix = fit === 'target' ? 'target' : 'image';
  return { name: `${entry}_${suffix}.webp`, type: 'image/webp', bytes, sha256: sha256(bytes), query: imageUseQuery({ fit, entry }) };
}

/** The settings a cached video was made with – another ffmpeg rule makes another file */
const VIDEO_RULE = sha256(new TextEncoder().encode(ffmpegArgs('<in>', '<out>').join(' '))).slice(0, 12);

/** A delivered video as H.264 MP4 (ffmpeg); the result is cached by the delivered file's sha256 */
export function prepareVideo(source: string, entry: string, options: MediaOptions): PreparedFile {
  if (!fs.existsSync(source)) throw new Error(`delivered file not found: ${source}`);
  const cached = path.join(options.cacheDir, `${fileSha256(source)}-${VIDEO_RULE}.mp4`);
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(options.cacheDir, { recursive: true });
    const partial = `${cached}.part.mp4`;
    try {
      (options.encodeVideo ?? ffmpegEncoder)(source, partial);
      fs.renameSync(partial, cached);
    } finally {
      fs.rmSync(partial, { force: true });
    }
  }
  const bytes = new Uint8Array(fs.readFileSync(cached));
  return { name: `${entry}_video.mp4`, type: 'video/mp4', bytes, sha256: sha256(bytes), query: '' };
}

// ── The API ──────────────────────────────────────────────────────────────────────────────────────

/** A 409 `delivery-problems` of `apply`: the comparison that stopped it */
export class DeliveryProblems extends Error {
  constructor(readonly comparison: DeliveryResult) {
    super(`the delivery has problems – nothing written: ${comparison.problems.join('; ')}`);
    this.name = 'DeliveryProblems';
  }
}

/** The calls the import needs – an instance's editor API with a person's token (`OSCT_API_URL`, `OSCT_EDITOR_TOKEN`) */
export interface DeliveryApi {
  /** The experience's Library */
  assets(experience: string): Promise<Asset[]>;
  /** An upload: the stored asset and whether the Library held those bytes already (200 instead of 201) */
  upload(experience: string, file: PreparedFile): Promise<{ asset: Asset; existed: boolean }>;
  /** `POST …/deliveries`: the comparison (or, with `apply`, the written delivery); a 409 `delivery-problems` throws `DeliveryProblems` */
  deliver(experience: string, plan: DeliveryPlan): Promise<DeliveryResult>;
}

/** `fetch` against an instance's API (`api` ends without `/`) */
export function deliveryApi(api: string, token: string, fetcher: typeof fetch = fetch): DeliveryApi {
  const call = async (route: string, init: RequestInit = {}): Promise<Response> => {
    const response = await fetcher(`${api}${route}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 409) {
        try {
          const comparison = (JSON.parse(text) as { error?: { code?: string; comparison?: DeliveryResult } }).error;
          if (comparison?.code === 'delivery-problems' && comparison.comparison) throw new DeliveryProblems(comparison.comparison);
        } catch (error) {
          if (error instanceof DeliveryProblems) throw error;
        }
      }
      throw new Error(`${init.method ?? 'GET'} ${route} → ${response.status} ${text.slice(0, 300)}`);
    }
    return response;
  };
  const experiencePath = (experience: string) => `/editor/experiences/${encodeURIComponent(experience)}`;
  return {
    assets: async experience => ((await (await call(`${experiencePath(experience)}/assets`)).json()) as { assets: Asset[] }).assets,
    upload: async (experience, file) => {
      const response = await call(`${experiencePath(experience)}/assets${file.query}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
        body: file.bytes,
      });
      const { asset } = (await response.json()) as { asset: Asset };
      return { asset, existed: response.status === 200 };
    },
    deliver: async (experience, plan) =>
      (await call(`${experiencePath(experience)}/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      })).json() as Promise<DeliveryResult>,
  };
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────────

export interface DeliveryImportOptions {
  experience: string;
  mapping: Mapping;
  /** Where the mapping's file paths resolve */
  filesDir: string;
  layout?: LayoutLike;
  /** The delivery's name (`deliveries.name`) */
  name: string;
  source?: string;
  apply?: boolean;
  overwrite?: boolean;
  /** List the `same` rows too */
  all?: boolean;
  media: MediaOptions;
  log?: (line: string) => void;
}

export interface DeliveryImportReport {
  /** Files prepared, uploaded, and found in the Library already */
  prepared: number;
  uploaded: number;
  known: number;
  /** Local problems: a file not found or not readable, ffmpeg failing – the entry is left out of the plan */
  problems: string[];
  warnings: string[];
  plan: DeliveryPlan;
  comparison: DeliveryResult;
  /** The applied delivery, when `apply` wrote one */
  applied: DeliveryResult | null;
}

const kb = (bytes: number) => (bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Something the delivery would write: a new or changed row, a conflict only with `overwrite` */
export const hasWrites = (result: DeliveryResult, overwrite = false): boolean =>
  result.counts.new > 0 || result.counts.changed > 0 || (overwrite && result.counts.conflict > 0);

/** Prepares and uploads the delivery's files, sends the plan for the comparison and – with `apply` – writes it */
export async function runDeliveryImport(api: DeliveryApi, options: DeliveryImportOptions): Promise<DeliveryImportReport> {
  const log = options.log ?? (() => {});
  const { experience, mapping, filesDir } = options;
  const problems: string[] = [];
  const library = new Map<string, string>();
  for (const asset of await api.assets(experience)) if (asset.sha256) library.set(asset.sha256, asset.url);
  let prepared = 0, uploaded = 0, known = 0;

  const place = async (entry: string, role: string, make: () => Promise<PreparedFile> | PreparedFile, delivered: string): Promise<string> => {
    const file = await make();
    prepared++;
    const inLibrary = library.get(file.sha256);
    if (inLibrary) {
      known++;
      return inLibrary;
    }
    const { asset, existed } = await api.upload(experience, file);
    library.set(file.sha256, asset.url);
    if (existed) known++;
    else uploaded++;
    log(`   ↑ ${entry} ${role.padEnd(6)} ${delivered} → ${asset.name} (${kb(file.bytes.byteLength)})${existed ? ' – the Library had it' : ''}`);
    return asset.url;
  };

  const files = new Map<string, EntryFiles>();
  const skip = new Set<string>();
  for (const [id, e] of Object.entries(mapping.entries)) {
    const f: EntryFiles = {};
    const jobs: [keyof EntryFiles, string | undefined, () => Promise<PreparedFile> | PreparedFile][] = [
      ['target', e.target, () => prepareImage(path.join(filesDir, e.target!), id, 'target', options.media)],
      ['image', e.image, () => prepareImage(path.join(filesDir, e.image!), id, 'entryImage', options.media)],
      // A video without a target is dropped by the plan – no need to encode it
      ['video', e.target ? e.video : undefined, () => prepareVideo(path.join(filesDir, e.video!), id, options.media)],
    ];
    for (const [role, delivered, make] of jobs) {
      if (!delivered) continue;
      try {
        f[role] = await place(id, role, make, delivered);
      } catch (error) {
        problems.push(`${id}.${role}: ${error instanceof Error ? error.message : String(error)} – the entry is left out`);
        skip.add(id);
      }
    }
    files.set(id, f);
  }
  log(`${prepared} files prepared: ${uploaded} uploaded, ${known} already in the Library`);

  const { plan, warnings } = buildPlan({ name: options.name, source: options.source, mapping, layout: options.layout, files, skip });
  const overwrite = options.overwrite === true;
  const comparison = await api.deliver(experience, { ...plan, ...(overwrite ? { overwrite } : {}) });
  log(`Comparison with the draft of ${experience} – ${plan.entries.length} entries, ${plan.scenes?.length ?? 0} scenes in the plan:`);
  describeComparison(comparison, { all: options.all }).forEach(line => log(line));
  warnings.forEach(warning => log(`   ⚠️  ${warning}`));
  problems.forEach(problem => log(`   ❌ ${problem}`));

  let applied: DeliveryResult | null = null;
  if (!options.apply) {
    log(comparison.problems.length ? 'Not applicable – the API names problems (above).'
      : hasWrites(comparison, overwrite) ? `Compared only – nothing written. --apply writes it${comparison.counts.conflict && !overwrite ? ' (the conflicts stay as they are unless --overwrite)' : ''}.`
        : 'Nothing to write – the draft has this delivery.');
  } else if (comparison.problems.length) {
    log('Nothing written – the API names problems (above).');
  } else if (!hasWrites(comparison, overwrite)) {
    log('Nothing to write – the draft has this delivery.');
  } else {
    applied = await api.deliver(experience, { ...plan, apply: true, ...(overwrite ? { overwrite } : {}) });
    log(`✅ Delivery ${applied.delivery.id} applied: ${applied.written.length} changes in the draft's history – ` +
      'revert them there (or POST …/changes/revert); publish to reach readers');
  }
  return { prepared, uploaded, known, problems, warnings, plan, comparison, applied };
}
