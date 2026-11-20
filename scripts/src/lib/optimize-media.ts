import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { type Document, NodeIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode.js';
import { gzipSync } from 'fflate';
import jpeg from 'jpeg-js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
import { IMAGE_WEBP_QUALITY, fitImage, type ImageFit } from '../../../shared/api/images';
import { listFiles } from './files';

/**
 * Media optimisation of the content build, on the copy in `client/public/assets/content` only –
 * the authored files in `content/` stay as they are:
 *   - models (`.glb`): textures ≤ MAX_TEXTURE_SIZE px (opaque ones as JPEG), meshopt geometry
 *     (EXT_meshopt_compression; the client's GLTFLoader has the decoder), duplicate / unused data removed;
 *   - images (`.jpg` / `.png`): ≤ MAX_IMAGE_SIZE px, opaque ones as JPEG (same file name – browsers go by
 *     the content, not the extension);
 *   - models (`.glb`): a gzip copy `<name>.gz` next to it (hosts serve these
 *     uncompressed; the client unpacks it – utils/compressed.ts –, browsers without DecompressionStream
 *     load the original);
 *   - videos: not re-encoded (needs ffmpeg, a native binary) – large ones are reported with the
 *     recommended export settings.
 * A file is kept as it is when the result would not be smaller. Pure JavaScript / WebAssembly (no sharp):
 * the output is the same on every platform, CI compares it.
 *
 * The image rule (#298, shared/api/images.ts) behind a switch: with `OSCT_IMAGE_FORMAT=webp` every image the
 * configuration names is written as WebP (`<name>.webp`, the configuration renamed with it – `renameContentPaths`) at
 * the rule's sizes: a target's printed image (`imageSrc`) at most 1200 px, every other at most 2048 px, quality 82,
 * lossless with transparency, EXIF orientation applied, metadata dropped (libwebp as WebAssembly – @jsquash/webp).
 * Images nobody names (a plugin may load one by its path) stay as they are. The default stays JPEG until the image
 * targets (8th Wall) are checked with WebP on a phone.
 */

/** Longest side of a model texture after the build (phones: 1024 is plenty for a page-sized model) */
export const MAX_TEXTURE_SIZE = 1024;
/** Longest side of an image (entry / target images: at most a phone's full width at 3× pixel density) */
export const MAX_IMAGE_SIZE = 1200;
/** Videos above this size are reported */
export const VIDEO_WARN_BYTES = 4 * 1024 * 1024;
const VIDEO_ADVICE = 'large video – export at 720p, H.264 MP4, ~2 Mbit/s, AAC 128 kbit/s audio (or none)';
const JPEG_QUALITY = 85;

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

export const decode = (image: Uint8Array, mimeType: string): Rgba | null => {
  if (mimeType === 'image/png') {
    const png = PNG.sync.read(Buffer.from(image));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (mimeType === 'image/jpeg') {
    const jpg = jpeg.decode(image, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { width: jpg.width, height: jpg.height, data: jpg.data };
  }
  return null; // WebP, KTX2, …: left alone
};

/** Area-average downscale (each target pixel = mean of the source pixels it covers) */
const downscale = (src: Rgba, width: number, height: number): Rgba => {
  const data = new Uint8Array(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const sum = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          sum[0] += src.data[i];
          sum[1] += src.data[i + 1];
          sum[2] += src.data[i + 2];
          sum[3] += src.data[i + 3];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[o + c] = Math.round(sum[c] / count);
    }
  }
  return { width, height, data };
};

const isOpaque = (image: Rgba): boolean => {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 255) return false;
  return true;
};

/**
 * An image scaled to `maxSize` (long side), opaque → JPEG; null when unreadable or not worth it: an image
 * that needs no scaling is only re-encoded when that saves at least MIN_REENCODE_SAVING (every JPEG
 * re-encode costs a little quality).
 */
const MIN_REENCODE_SAVING = 0.25;
const shrinkImage = (image: Uint8Array, mimeType: string, maxSize: number): { data: Uint8Array; opaque: boolean } | null => {
  const decoded = decode(image, mimeType);
  if (!decoded) return null;
  const scale = Math.min(1, maxSize / Math.max(decoded.width, decoded.height));
  const resized = scale < 1
    ? downscale(decoded, Math.max(1, Math.round(decoded.width * scale)), Math.max(1, Math.round(decoded.height * scale)))
    : decoded;
  const opaque = isOpaque(resized);
  const data = opaque
    ? new Uint8Array(jpeg.encode({ width: resized.width, height: resized.height, data: resized.data }, JPEG_QUALITY).data)
    : new Uint8Array(PNG.sync.write(Object.assign(new PNG({ width: resized.width, height: resized.height }), {
        data: Buffer.from(resized.data),
      })));
  const limit = scale < 1 ? image.byteLength : image.byteLength * (1 - MIN_REENCODE_SAVING);
  return data.byteLength < limit ? { data, opaque } : null;
};

/**
 * A JPEG of an image for `content/` (delivery import): scaled to `maxSize` (long side), transparency
 * flattened on white. Null when the image cannot be read.
 */
export const toJpeg = (image: Uint8Array, mimeType: string, maxSize: number, quality = 90): Uint8Array | null => {
  const decoded = decode(image, mimeType);
  if (!decoded) return null;
  const scale = Math.min(1, maxSize / Math.max(decoded.width, decoded.height));
  const resized = scale < 1
    ? downscale(decoded, Math.max(1, Math.round(decoded.width * scale)), Math.max(1, Math.round(decoded.height * scale)))
    : decoded;
  if (!isOpaque(resized)) {
    for (let i = 0; i < resized.data.length; i += 4) {
      const a = resized.data[i + 3] / 255;
      for (let c = 0; c < 3; c++) resized.data[i + c] = Math.round(resized.data[i + c] * a + 255 * (1 - a));
      resized.data[i + 3] = 255;
    }
  }
  return new Uint8Array(jpeg.encode({ width: resized.width, height: resized.height, data: resized.data }, quality).data);
};

// ── The image rule as WebP (#298) ────────────────────────────────────────────────────────────────

/** The content build's image format: `jpeg` (the default) or `webp` (`OSCT_IMAGE_FORMAT=webp`) */
export type ImageFormat = 'jpeg' | 'webp';
export const imageFormat = (value = process.env.OSCT_IMAGE_FORMAT): ImageFormat => (value?.trim().toLowerCase() === 'webp' ? 'webp' : 'jpeg');

/** A JPEG's EXIF orientation (1 = upright, 0 = none named) – the API reads it the same way (Images::orientation) */
export function jpegOrientation(data: Uint8Array): number {
  if (data[0] !== 0xff || data[1] !== 0xd8) return 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  while (offset + 4 <= data.length && data[offset] === 0xff) {
    const marker = data[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const size = view.getUint16(offset + 2);
    const exif = offset + 4;
    if (marker === 0xe1 && String.fromCharCode(...data.subarray(exif, exif + 4)) === 'Exif' && data[exif + 4] === 0 && data[exif + 5] === 0) {
      const tiff = exif + 6;
      const little = data[tiff] === 0x49;
      if (!little && data[tiff] !== 0x4d) return 0;
      const u16 = (at: number) => (at + 2 <= data.length ? view.getUint16(at, little) : -1);
      const u32 = (at: number) => (at + 4 <= data.length ? view.getUint32(at, little) : -1);
      const directory = tiff + u32(tiff + 4);
      const count = u16(directory);
      for (let i = 0; i < count; i++) {
        const entry = directory + 2 + i * 12;
        if (u16(entry) !== 0x0112) continue;
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 0;
      }
      return 0;
    }
    offset += 2 + size;
  }
  return 0;
}

/** The picture as it is meant to be seen: EXIF orientation 2–8 undone */
export function upright(image: Rgba, orientation: number): Rgba {
  if (orientation < 2 || orientation > 8) return image;
  const { width: w, height: h } = image;
  const turned = orientation >= 5;
  const width = turned ? h : w;
  const height = turned ? w : h;
  const data = new Uint8Array(image.data.length);
  // Where the source pixel (x, y) lands, per orientation (EXIF: 2 mirror, 3 180°, 4 flip, 5 transpose, 6 90° cw, 7 transverse, 8 90° ccw)
  const target: Record<number, (x: number, y: number) => [number, number]> = {
    2: (x, y) => [w - 1 - x, y],
    3: (x, y) => [w - 1 - x, h - 1 - y],
    4: (x, y) => [x, h - 1 - y],
    5: (x, y) => [y, x],
    6: (x, y) => [h - 1 - y, x],
    7: (x, y) => [h - 1 - y, w - 1 - x],
    8: (x, y) => [y, w - 1 - x],
  };
  const to = target[orientation];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [tx, ty] = to(x, y);
      data.set(image.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ty * width + tx) * 4);
    }
  }
  return { width, height, data };
}

let webpReady: Promise<unknown> | null = null;
/** libwebp's WebAssembly, compiled once from the package (Node has no fetch for a file URL) */
const webpEncoder = (): Promise<unknown> => {
  if (!webpReady) {
    const wasm = createRequire(import.meta.url).resolve('@jsquash/webp/codec/enc/webp_enc_simd.wasm');
    const init = initWebp as unknown as (module: WebAssembly.Module) => Promise<unknown>;
    webpReady = WebAssembly.compile(fs.readFileSync(wasm)).then(init);
  }
  return webpReady;
};

/**
 * An image under the rule as WebP: upright, at most `IMAGE_MAX_SIDE[fit]` px (never larger), lossy at quality 82 or
 * lossless when it has transparency. Null when it cannot be read (WebP, KTX2, … are not decoded here).
 */
export async function toWebp(image: Uint8Array, mimeType: string, fit: ImageFit = 'default'): Promise<Uint8Array | null> {
  const read = decode(image, mimeType);
  if (!read) return null;
  const decoded = mimeType === 'image/jpeg' ? upright(read, jpegOrientation(image)) : read;
  const size = fitImage(decoded.width, decoded.height, fit);
  const resized = size.width < decoded.width ? downscale(decoded, size.width, size.height) : decoded;
  await webpEncoder();
  const pixels = { data: new Uint8ClampedArray(resized.data.buffer, resized.data.byteOffset, resized.data.byteLength), width: resized.width, height: resized.height };
  const lossless = !isOpaque(resized);
  const encoded = await encodeWebp(pixels as unknown as ImageData, lossless ? { lossless: 1, exact: 0 } : { quality: IMAGE_WEBP_QUALITY });
  return new Uint8Array(encoded);
}

/** The content paths (`/assets/content/…`) a configuration names, and those a target's `imageSrc` names */
export function contentImagePaths(config: unknown): { named: Set<string>; targets: Set<string> } {
  const named = new Set<string>();
  const targets = new Set<string>();
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === 'string') {
      if (value.startsWith('/assets/content/')) {
        named.add(value);
        if (key === 'imageSrc') targets.add(value);
      }
    } else if (Array.isArray(value)) value.forEach(item => walk(item, key));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(config);
  return { named, targets };
}

/** The configuration with every renamed content path replaced (whole string values only) */
export function renameContentPaths<T>(config: T, renames: ReadonlyMap<string, string>): T {
  if (!renames.size) return config;
  const rename = (value: unknown): unknown => {
    if (typeof value === 'string') return renames.get(value) ?? value;
    if (Array.isArray(value)) return value.map(rename);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v)]));
    return value;
  };
  return rename(config) as T;
}

/** Smaller texture (scaled down, opaque → JPEG), or false when it would not get smaller */
const optimizeTexture = (texture: Texture): boolean => {
  const image = texture.getImage();
  if (!image) return false;
  const result = shrinkImage(image, texture.getMimeType(), MAX_TEXTURE_SIZE);
  if (!result) return false;
  texture.setImage(result.data).setMimeType(result.opaque ? 'image/jpeg' : 'image/png');
  const uri = texture.getURI();
  if (uri) texture.setURI(uri.replace(/\.(png|jpe?g)$/i, result.opaque ? '.jpg' : '.png'));
  return true;
};

let io: NodeIO | null = null;
const getIO = async (): Promise<NodeIO> => {
  if (!io) {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  }
  return io;
};

export interface MediaOptimization {
  file: string;
  before: number;
  after: number;
  /** Something the author should know (e.g. a large video) */
  note?: string;
  /** An image written as WebP (#298): its content path before and after – the configuration follows */
  renamedFrom?: string;
  renamedTo?: string;
}

/** Optimise one `.glb` in place; returns the sizes (after = before when it was kept) */
export async function optimizeModel(file: string): Promise<MediaOptimization> {
  const before = fs.statSync(file).size;
  const reader = await getIO();
  const document: Document = await reader.read(file);
  document.getRoot().listTextures().forEach(optimizeTexture);
  await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const output = await reader.writeBinary(document);
  if (output.byteLength >= before) return { file, before, after: before };
  fs.writeFileSync(file, output);
  return { file, before, after: output.byteLength };
}

/** Optimise one image in place (same name) */
export function optimizeImage(file: string): MediaOptimization {
  const image = new Uint8Array(fs.readFileSync(file));
  const mimeType = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const result = shrinkImage(image, mimeType, MAX_IMAGE_SIZE);
  if (result) fs.writeFileSync(file, result.data);
  return { file, before: image.byteLength, after: result?.data.byteLength ?? image.byteLength };
}

/** An image as WebP next to it (`<name>.webp`, the original removed); kept as it is when it cannot be read */
async function writeWebp(file: string, contentPath: string, fit: ImageFit): Promise<MediaOptimization> {
  const image = new Uint8Array(fs.readFileSync(file));
  const result = await toWebp(image, /\.png$/i.test(file) ? 'image/png' : 'image/jpeg', fit);
  if (!result) return { file, before: image.byteLength, after: image.byteLength };
  const renamed = file.replace(/\.(jpe?g|png)$/i, '.webp');
  fs.writeFileSync(renamed, result);
  fs.rmSync(file);
  return { file: renamed, before: image.byteLength, after: result.byteLength, renamedFrom: contentPath, renamedTo: contentPath.replace(/\.(jpe?g|png)$/i, '.webp') };
}

/** `<file>.gz` next to a `.glb` file (header time fixed: the same bytes on every build) */
export function gzipCopy(file: string): MediaOptimization {
  const data = new Uint8Array(fs.readFileSync(file));
  const gz = gzipSync(data, { level: 9, mtime: 0 });
  fs.writeFileSync(`${file}.gz`, gz);
  return { file: `${file}.gz`, before: data.byteLength, after: gz.byteLength };
}

const matchingFiles = (dir: string, pattern: RegExp): string[] =>
  listFiles(dir).filter(file => pattern.test(path.basename(file))).map(file => path.join(dir, file));

/**
 * The files of every texture set and every media level (#331: an asset's `levels`, an entry's `imageLevels`) in a built
 * configuration, as paths below the content copy (`entities/x/map_512.jpg`) – files at exact sizes, kept as authored
 */
export function textureSetFiles(config: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(config)) config.forEach(value => textureSetFiles(value, found));
  else if (config && typeof config === 'object') {
    for (const [key, value] of Object.entries(config)) {
      if (key === 'textures' && Array.isArray(value)) {
        value.forEach(set => (Array.isArray(set?.sizes) ? set.sizes : []).forEach((entry: { src?: unknown }) => {
          if (typeof entry?.src === 'string') found.add(entry.src.replace(/^\/assets\/content\//, ''));
        }));
      } else if ((key === 'levels' || key === 'imageLevels') && Array.isArray(value)) {
        value.forEach((entry: { src?: unknown }) => {
          if (typeof entry?.src === 'string') found.add(entry.src.replace(/^\/assets\/content\//, ''));
        });
      } else textureSetFiles(value, found);
    }
  }
  return found;
}

/**
 * Optimise the content copy: models (+ gzip copy), images; report large videos. `keep` names the images that stay
 * as authored (paths below `dir`, forward slashes): a model's texture set is its map at exact sizes (#260).
 * `webp` (#298, `OSCT_IMAGE_FORMAT=webp`): the configuration the images belong to – the images it names are written as
 * WebP under the image rule; each such result has `renamedFrom`/`renamedTo` (content paths) for `renameContentPaths`.
 */
export async function optimizeMedia(dir: string, keep: ReadonlySet<string> = new Set(), webp?: { config: unknown }): Promise<MediaOptimization[]> {
  const results: MediaOptimization[] = [];
  const relative = (file: string) => path.relative(dir, file).split(path.sep).join('/');
  const kept = (file: string) => keep.has(relative(file));
  const images = webp ? contentImagePaths(webp.config) : null;
  for (const file of matchingFiles(dir, /\.glb$/i)) results.push(await optimizeModel(file));
  for (const file of matchingFiles(dir, /\.(jpe?g|png)$/i)) {
    if (kept(file)) continue;
    const contentPath = `/assets/content/${relative(file)}`;
    if (images?.named.has(contentPath)) results.push(await writeWebp(file, contentPath, images.targets.has(contentPath) ? 'target' : 'default'));
    else results.push(optimizeImage(file));
  }
  // After the model optimisation: the .glb.gz holds the optimised model (client: utils/compressed.ts)
  for (const file of matchingFiles(dir, /\.glb$/i)) results.push(gzipCopy(file));
  for (const file of matchingFiles(dir, /\.(mp4|webm|mov)$/i)) {
    const size = fs.statSync(file).size;
    if (size > VIDEO_WARN_BYTES) results.push({ file, before: size, after: size, note: VIDEO_ADVICE });
  }
  return results;
}
