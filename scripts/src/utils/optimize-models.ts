import fs from 'fs';
import path from 'path';
import { Document, NodeIO, Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import jpeg from 'jpeg-js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

/**
 * Model optimisation of the content build (Phase 9): every `.glb` copied to the client gets
 *   - textures scaled down to at most MAX_TEXTURE_SIZE px (the long side), opaque ones as JPEG,
 *   - geometry compressed with meshopt (EXT_meshopt_compression; the client's GLTFLoader has the decoder),
 *   - duplicate / unused data removed.
 * Only the copy in `client/public/assets/content` changes – the authored files in `content/` stay as they are.
 * Pure JavaScript / WebAssembly (no sharp): the output is the same on every platform, CI compares it.
 * A model is kept as it is when the result would not be smaller. `.gltf` with external files: not touched.
 */

/** Longest side of a model texture after the build (phones: 1024 is plenty for a page-sized model) */
export const MAX_TEXTURE_SIZE = 1024;
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
    const jpg = jpeg.decode(image, { useTArray: true, formatAsRGBA: true });
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

/** Smaller texture (scaled down, opaque → JPEG), or false when it would not get smaller */
const optimizeTexture = (texture: Texture): boolean => {
  const image = texture.getImage();
  const mimeType = texture.getMimeType();
  if (!image) return false;
  const decoded = decode(image, mimeType);
  if (!decoded) return false;

  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(decoded.width, decoded.height));
  const resized = scale < 1
    ? downscale(decoded, Math.max(1, Math.round(decoded.width * scale)), Math.max(1, Math.round(decoded.height * scale)))
    : decoded;
  const opaque = isOpaque(resized);
  const encoded = opaque
    ? new Uint8Array(jpeg.encode({ width: resized.width, height: resized.height, data: resized.data }, JPEG_QUALITY).data)
    : new Uint8Array(PNG.sync.write(Object.assign(new PNG({ width: resized.width, height: resized.height }), {
        data: Buffer.from(resized.data),
      })));
  if (encoded.byteLength >= image.byteLength) return false;

  texture.setImage(encoded).setMimeType(opaque ? 'image/jpeg' : 'image/png');
  const uri = texture.getURI();
  if (uri) texture.setURI(uri.replace(/\.(png|jpe?g)$/i, opaque ? '.jpg' : '.png'));
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

export interface ModelOptimization {
  file: string;
  before: number;
  after: number;
}

/** Optimise one `.glb` in place; returns the sizes (after = before when it was kept) */
export async function optimizeModel(file: string): Promise<ModelOptimization> {
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

/** Optimise every `.glb` below a directory (the client's content copy) */
export async function optimizeModels(dir: string): Promise<ModelOptimization[]> {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.glb$/i.test(entry.name)) files.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  files.sort();
  const results: ModelOptimization[] = [];
  for (const file of files) results.push(await optimizeModel(file));
  return results;
}
