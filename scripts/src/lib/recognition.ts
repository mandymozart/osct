import fs from 'fs';
import { createRequire } from 'module';
import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js';
import { PNG } from 'pngjs';
import { recognitionFrame, targetFrame, type RecognitionFrame } from '../../../engine/src/scene/target-frame';
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

// The frame itself: one builder for the CLI and the editor (engine/src/scene/target-frame.ts)
export { recognitionFrame, type RecognitionFrame };

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
