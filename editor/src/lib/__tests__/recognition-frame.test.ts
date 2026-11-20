import { describe, expect, it } from "vitest";
import { LUMINANCE_HEIGHT, LUMINANCE_WIDTH, RECOGNITION_FRAME_FILE, recognitionFrame, targetFrame } from "@engine/scene/target-frame";
import { frameOfPixels, frameRgba, recognitionDataOf } from "../recognition-frame";

/** RGBA pixels as a canvas gives them (`Uint8ClampedArray`), filled by `colour(x, y)` */
const pixels = (width: number, height: number, colour: (x: number, y: number) => [number, number, number, number?]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = colour(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
};
const greyAt = (frame: { grey: Uint8Array }, x: number, y: number) => frame.grey[y * LUMINANCE_WIDTH + x];

describe("the editor's recognition frame (#306) – the CLI's frame, made in the browser", () => {
  it("is the frame `osct targets prepare` makes: the same builder, the same geometry, byte for byte", () => {
    const image = pixels(90, 120, (x, y) => [(x * 7) % 256, (y * 5) % 256, 40]);
    const frame = frameOfPixels(image);
    expect(frame.crop).toEqual(targetFrame(90, 120).crop);
    expect(frame.grey).toEqual(recognitionFrame({ ...image, data: new Uint8Array(image.data) }).grey);
  });

  it("follows the shared geometry: a tall page whole and centred, a landscape one turned clockwise", () => {
    const tall = frameOfPixels(pixels(300, 800, (x, y) => (x >= 140 && x < 160 && y > 0 && y < 799 ? [0, 0, 0] : [255, 255, 255])));
    expect([greyAt(tall, 10, 320), greyAt(tall, 240, 320), greyAt(tall, 240, 1), greyAt(tall, 240, 638)]).toEqual([255, 0, 0, 0]);
    const wide = frameOfPixels(pixels(1280, 960, x => (x < 320 ? [0, 0, 0] : [255, 255, 255])));
    expect(wide.crop.isRotated).toBe(true);
    expect([greyAt(wide, 240, 10), greyAt(wide, 240, 630)]).toEqual([0, 255]);
  });

  it("draws the grey as opaque RGBA for the canvas", () => {
    const frame = frameOfPixels(pixels(30, 40, () => [200, 100, 50]));
    const rgba = frameRgba(frame);
    expect(rgba.length).toBe(LUMINANCE_WIDTH * LUMINANCE_HEIGHT * 4);
    const grey = Math.round(0.299 * 200 + 0.587 * 100 + 0.114 * 50);
    expect([...rgba.subarray(0, 4)]).toEqual([grey, grey, grey, 255]);
    expect([...rgba.subarray(rgba.length - 4)]).toEqual([grey, grey, grey, 255]);
  });

  it("names the printed image's size with the stored frame, in the one file format of the CLI", () => {
    expect(recognitionDataOf("https://cdn.example/p-1_recognition.webp", { width: 1200, height: 900 }))
      .toEqual({ imageSrc: "https://cdn.example/p-1_recognition.webp", width: 1200, height: 900 });
    expect(RECOGNITION_FRAME_FILE.type).toMatch(/^image\//);
  });
});
