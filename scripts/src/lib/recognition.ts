import fs from 'fs';
import { createRequire } from 'module';
import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js';
import { PNG } from 'pngjs';
import { LUMINANCE_HEIGHT, LUMINANCE_WIDTH, luma, targetFrame, type XrCrop } from '../../../engine/src/scene/target-frame';
import type { TargetRecognitionData } from '../../../shared/types/game-config';
import { decode, jpegOrientation, type Rgba, upright } from './optimize-media';

/**
 * A target's recognition data made ahead (#306, `osct targets prepare`): the grey 480 × 640 frame 8th Wall's engine reads
 * for a flat image target – the frame the reader otherwise makes on the phone when a scene opens (`makeImageTarget()`,
 * engine/src/scene/xr8.ts): the whole printed image, landscape turned 90° clockwise, centred in a 3:4 portrait frame
 * filled with the image's edge colour (`targetFrame()`, engine/src/scene/target-frame.ts – the geometry both share).
 * The engine still extracts the features on the phone (it takes no precompiled features); made ahead saves decoding,
 * drawing and encoding the printed image there, and its download.
 *
 * Not 8th Wall's image-target CLI itself (`@8thwall/image-target-cli`, MIT): it only asks interactively, and its default
 * crop keeps the centred 3:4 part of the image – which loses the top and bottom of a tall page. Its output format is the
 * same: `imageTargetJson()` writes its JSON for a frame. Pure JavaScript / WebAssembly like the content build (no sharp).
 */

/** The image types a printed image comes as (the Library stores WebP since the image rule, #298) */
export const sniffImageType = (bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
};

let webpDecoderReady: Promise<unknown> | null = null;
/** libwebp's decoder (WebAssembly), compiled once from the package */
const webpDecoder = (): Promise<unknown> => {
  if (!webpDecoderReady) {
    const wasm = createRequire(import.meta.url).resolve('@jsquash/webp/codec/dec/webp_dec.wasm');
    const init = initWebpDecoder as unknown as (module: WebAssembly.Module) => Promise<unknown>;
    webpDecoderReady = WebAssembly.compile(fs.readFileSync(wasm)).then(init);
  }
  return webpDecoderReady;
};

/** A printed image as RGBA pixels, upright (a JPEG's EXIF orientation applied, as the browser does) */
export async function decodePrintedImage(bytes: Uint8Array): Promise<Rgba> {
  const type = sniffImageType(bytes);
  if (type === 'image/webp') {
    await webpDecoder();
    const image = await decodeWebp(bytes.slice().buffer);
    return { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength) };
  }
  const image = type ? decode(bytes, type) : null;
  if (!image) throw new Error('not a JPEG, PNG or WebP image');
  return type === 'image/jpeg' ? upright(image, jpegOrientation(bytes)) : image;
}

/** Mean colour of the image's outer pixel ring – what the frame is filled with (the corners count twice, as in the reader) */
const edgeColour = (image: Rgba): [number, number, number] => {
  const { width, height, data } = image;
  const sum = [0, 0, 0];
  let count = 0;
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
    count++;
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y++) { add(0, y); add(width - 1, y); }
  return [Math.round(sum[0] / count), Math.round(sum[1] / count), Math.round(sum[2] / count)];
};

/** The frame of a printed image: its grey pixels (one byte each, 480 × 640) and the engine's crop */
export interface RecognitionFrame {
  grey: Uint8Array;
  width: typeof LUMINANCE_WIDTH;
  height: typeof LUMINANCE_HEIGHT;
  crop: XrCrop;
}

/**
 * The grey frame of a printed image: each frame pixel is the mean of the image pixels it covers (box filter), blended
 * with the edge colour where it covers the image only in part or the image is transparent.
 */
export function recognitionFrame(image: Rgba): RecognitionFrame {
  const frame = targetFrame(image.width, image.height);
  const { crop } = frame;
  // The image as it lies in the frame: turned 90° clockwise when it is landscape (turned x' = H−1−y, y' = x)
  const turnedWidth = crop.isRotated ? image.height : image.width;
  const turnedHeight = crop.isRotated ? image.width : image.height;
  const at = (x: number, y: number): number => (crop.isRotated ? (image.height - 1 - x) * image.width + y : y * image.width + x) * 4;
  const [er, eg, eb] = edgeColour(image);
  const edge = luma(er, eg, eb);
  const step = crop.width / LUMINANCE_WIDTH; // image px per frame px (the frame is 3:4 like the output)
  const grey = new Uint8Array(LUMINANCE_WIDTH * LUMINANCE_HEIGHT);
  const { data } = image;
  for (let y = 0; y < LUMINANCE_HEIGHT; y++) {
    const v0 = y * step - frame.imageTop;
    const v1 = v0 + step;
    const y0 = Math.max(0, Math.floor(v0));
    const y1 = Math.min(turnedHeight, Math.ceil(v1));
    for (let x = 0; x < LUMINANCE_WIDTH; x++) {
      const u0 = x * step - frame.imageLeft;
      const u1 = u0 + step;
      const x0 = Math.max(0, Math.floor(u0));
      const x1 = Math.min(turnedWidth, Math.ceil(u1));
      let sum = 0;
      let covered = 0;
      for (let yy = y0; yy < y1; yy++) {
        const wy = Math.min(yy + 1, v1) - Math.max(yy, v0);
        if (wy <= 0) continue;
        for (let xx = x0; xx < x1; xx++) {
          const wx = Math.min(xx + 1, u1) - Math.max(xx, u0);
          if (wx <= 0) continue;
          const i = at(xx, yy);
          const alpha = data[i + 3] / 255;
          const w = wx * wy;
          sum += w * (alpha * luma(data[i], data[i + 1], data[i + 2]) + (1 - alpha) * edge);
          covered += w;
        }
      }
      const area = step * step;
      grey[y * LUMINANCE_WIDTH + x] = Math.round((sum + (area - covered) * edge) / area);
    }
  }
  return { grey, width: LUMINANCE_WIDTH, height: LUMINANCE_HEIGHT, crop };
}

/** The frame as a grey PNG (lossless – the API stores it under the image rule, as WebP) */
export function framePng(frame: RecognitionFrame): Uint8Array {
  const png = new PNG({ width: frame.width, height: frame.height, colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 });
  png.data = Buffer.from(frame.grey);
  return new Uint8Array(PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false }));
}

/** A target's recognition data once its frame is stored at `imageSrc` */
export const recognitionData = (imageSrc: string, image: Pick<Rgba, 'width' | 'height'>): TargetRecognitionData => ({
  imageSrc,
  width: image.width,
  height: image.height,
});

/**
 * The JSON 8th Wall's image-target CLI writes for a flat target – what `XR8.XrController.configure({ imageTargetData })`
 * takes; the reader builds the same from a target's `recognition` (`preparedImageTarget()`, engine/src/scene/xr8.ts)
 */
export const imageTargetJson = (name: string, recognition: TargetRecognitionData) => ({
  type: 'PLANAR' as const,
  name,
  imagePath: recognition.imageSrc,
  metadata: null,
  properties: targetFrame(recognition.width, recognition.height).crop,
});
