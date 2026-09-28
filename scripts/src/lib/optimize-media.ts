import fs from 'fs';
import path from 'path';
import { Document, NodeIO, Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { gzipSync } from 'fflate';
import jpeg from 'jpeg-js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

/**
 * Media optimisation of the content build, on the copy in `client/public/assets/content` only –
 * the authored files in `content/` stay as they are:
 *   - models (`.glb`): textures ≤ MAX_TEXTURE_SIZE px (opaque ones as JPEG), meshopt geometry
 *     (EXT_meshopt_compression; the client's GLTFLoader has the decoder), duplicate / unused data removed;
 *   - images (`.jpg` / `.png`): ≤ MAX_IMAGE_SIZE px, opaque ones as JPEG (same file name – browsers go by
 *     the content, not the extension);
 *   - recognition data (`.mind`) and models (`.glb`): a gzip copy `<name>.gz` next to it (hosts serve these
 *     uncompressed; the client unpacks it – utils/compressed.ts –, browsers without DecompressionStream
 *     load the original);
 *   - videos: not re-encoded (needs ffmpeg, a native binary) – large ones are reported with the
 *     recommended export settings.
 * A file is kept as it is when the result would not be smaller. Pure JavaScript / WebAssembly (no sharp):
 * the output is the same on every platform, CI compares it.
 */

/** Longest side of a model texture after the build (phones: 1024 is plenty for a page-sized model) */
export const MAX_TEXTURE_SIZE = 1024;
/** Longest side of an image (entry / target images: at most a phone's full width at 3× pixel density) */
export const MAX_IMAGE_SIZE = 1200;
/** Videos above this size are reported */
export const VIDEO_WARN_BYTES = 4 * 1024 * 1024;
const VIDEO_ADVICE = 'large video – export at 720p, H.264 MP4, ~2 Mbit/s, AAC 128 kbit/s audio (or none)';
const JPEG_QUALITY = 85;

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

const decode = (image: Uint8Array, mimeType: string): Rgba | null => {
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

/** `<file>.gz` next to a `.mind` / `.glb` file (header time fixed: the same bytes on every build) */
export function gzipCopy(file: string): MediaOptimization {
  const data = new Uint8Array(fs.readFileSync(file));
  const gz = gzipSync(data, { level: 9, mtime: 0 });
  fs.writeFileSync(`${file}.gz`, gz);
  return { file: `${file}.gz`, before: data.byteLength, after: gz.byteLength };
}

const listFiles = (dir: string, pattern: RegExp): string[] => {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (pattern.test(entry.name)) files.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return files.sort();
};

/** Optimise the content copy: models, images, `.mind` (gzip copy); report large videos */
export async function optimizeMedia(dir: string): Promise<MediaOptimization[]> {
  const results: MediaOptimization[] = [];
  for (const file of listFiles(dir, /\.glb$/i)) results.push(await optimizeModel(file));
  for (const file of listFiles(dir, /\.(jpe?g|png)$/i)) results.push(optimizeImage(file));
  // After the model optimisation: the .glb.gz holds the optimised model (client: utils/compressed.ts)
  for (const file of listFiles(dir, /\.(mind|glb)$/i)) results.push(gzipCopy(file));
  for (const file of listFiles(dir, /\.(mp4|webm|mov)$/i)) {
    const size = fs.statSync(file).size;
    if (size > VIDEO_WARN_BYTES) results.push({ file, before: size, after: size, note: VIDEO_ADVICE });
  }
  return results;
}
