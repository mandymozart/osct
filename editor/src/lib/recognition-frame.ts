import {
  RECOGNITION_FRAME_FILE, recognitionFrame, recognitionFrameName, type RecognitionFrame, type RgbaPixels,
} from "@engine/scene/target-frame";
import type { TargetRecognitionData } from "@shared/types/game-config";

/**
 * A target's recognition frame made in the browser (#306): the grey 480 × 640 frame `osct targets prepare` makes, from the
 * same builder (`recognitionFrame()`, engine/src/scene/target-frame.ts – the geometry the reader's runtime path uses) and
 * as the same file (`RECOGNITION_FRAME_FILE`). Pure parts here; `recognition-frames.svelte.ts` uploads it and stores it
 * with the target.
 */

/** The frame of a decoded printed image (its pixels as a canvas reads them) */
export const frameOfPixels = (pixels: RgbaPixels): RecognitionFrame => recognitionFrame(pixels);

/** The frame's grey bytes as RGBA (r = g = b, opaque) – what a canvas takes */
export function frameRgba(frame: RecognitionFrame): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(new ArrayBuffer(frame.width * frame.height * 4));
  for (let i = 0; i < frame.grey.length; i++) {
    const value = frame.grey[i];
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** The target's recognition data once its frame is stored at `imageSrc` – the printed image's size in px */
export const recognitionDataOf = (imageSrc: string, image: { width: number; height: number }): TargetRecognitionData => ({
  imageSrc,
  width: image.width,
  height: image.height,
});

/** The printed image's pixels, upright (EXIF applied, as the CLI and the browser show it) */
export async function decodePrintedImage(url: string, fetcher: typeof fetch = fetch): Promise<RgbaPixels> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`the printed image did not load (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("this browser cannot draw the image");
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data, width, height };
  } finally {
    bitmap.close();
  }
}

/** The frame as the file it is made as (`RECOGNITION_FRAME_FILE`), named for its target */
export async function frameFile(frame: RecognitionFrame, targetId: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("this browser cannot draw the frame");
  context.putImageData(new ImageData(frameRgba(frame), frame.width, frame.height), 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, RECOGNITION_FRAME_FILE.type));
  if (!blob) throw new Error("this browser cannot encode the frame");
  return new File([blob], recognitionFrameName(targetId), { type: RECOGNITION_FRAME_FILE.type });
}
