import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { RECOGNITION_FRAME_FILE, recognitionFrame as sharedRecognitionFrame, recognitionFrameName, targetFrame } from '../../engine/src/scene/target-frame';
import { decodePrintedImage, framePng, imageTargetJson, recognitionData, recognitionFrame, sniffImageType } from '../src/lib/recognition';
import { type EditorApi, imageUrl, planTargets, prepareTargets } from '../src/lib/targets-prepare';

const FIXTURE_ENTRIES = path.resolve(import.meta.dirname, '../../fixtures/content/entries');

/** An RGBA image filled by `colour(x, y)` */
const image = (width: number, height: number, colour: (x: number, y: number) => [number, number, number, number?]) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = colour(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
};

const greyAt = (frame: { grey: Uint8Array; width: number }, x: number, y: number) => frame.grey[y * frame.width + x];

describe('recognition frame (#306) – the grey 480 × 640 frame the reader otherwise makes on the phone', () => {
  it('is the one builder the editor uses too (engine/src/scene/target-frame.ts), named and typed in one place', () => {
    expect(recognitionFrame).toBe(sharedRecognitionFrame);
    expect(recognitionFrameName('p07-1')).toBe(`p07-1_recognition.${RECOGNITION_FRAME_FILE.extension}`);
  });

  it('a 3:4 portrait image fills the frame, in grey (Rec. 601)', () => {
    const frame = recognitionFrame(image(960, 1280, () => [200, 100, 50]));
    expect([frame.width, frame.height, frame.grey.length]).toEqual([480, 640, 480 * 640]);
    expect(frame.crop).toEqual(targetFrame(960, 1280).crop);
    expect(new Set(frame.grey)).toEqual(new Set([Math.round(0.299 * 200 + 0.587 * 100 + 0.114 * 50)]));
  });

  it('a tall image is centred whole, the sides filled with its edge colour – nothing cropped', () => {
    // 300 × 800: frame 600 × 800 – the image in the middle half; a white ring, a black middle column top to bottom
    const frame = recognitionFrame(image(300, 800, (x, y) => (x >= 140 && x < 160 && y > 0 && y < 799 ? [0, 0, 0] : [255, 255, 255])));
    expect(greyAt(frame, 10, 320)).toBe(255); // padding = the edge colour (white)
    expect(greyAt(frame, 240, 320)).toBe(0); // the image's middle
    expect(greyAt(frame, 240, 1)).toBe(0); // its top is kept
    expect(greyAt(frame, 240, 638)).toBe(0); // and its bottom
  });

  it('a landscape image is turned 90° clockwise: its left edge becomes the top', () => {
    // 1280 × 960, black left quarter: turned, the black lies along the top
    const frame = recognitionFrame(image(1280, 960, x => (x < 320 ? [0, 0, 0] : [255, 255, 255])));
    expect(frame.crop.isRotated).toBe(true);
    expect(greyAt(frame, 240, 10)).toBe(0);
    expect(greyAt(frame, 240, 630)).toBe(255);
    // …and its top edge the right side (clockwise)
    const top = recognitionFrame(image(1280, 960, (_x, y) => (y < 240 ? [0, 0, 0] : [255, 255, 255])));
    expect(greyAt(top, 470, 320)).toBe(0);
    expect(greyAt(top, 10, 320)).toBe(255);
  });

  it('transparent pixels show the edge colour', () => {
    const frame = recognitionFrame(image(30, 40, (x, y) => (x === 0 || y === 0 || x === 29 || y === 39 ? [100, 100, 100] : [255, 255, 255, 0])));
    expect(greyAt(frame, 240, 320)).toBe(100);
  });

  it('the PNG holds the frame losslessly', () => {
    const frame = recognitionFrame(image(90, 120, (x, y) => [(x * 7) % 256, (y * 5) % 256, 0]));
    const png = PNG.sync.read(Buffer.from(framePng(frame)));
    expect([png.width, png.height]).toEqual([480, 640]);
    for (const [x, y] of [[0, 0], [123, 456], [479, 639]]) expect(png.data[(y * 480 + x) * 4]).toBe(greyAt(frame, x, y));
  });

  it('reads JPEG and PNG printed images, upright', async () => {
    const pixels = image(4, 6, () => [10, 20, 30]);
    const jpg = new Uint8Array(jpeg.encode({ ...pixels, data: Buffer.from(pixels.data) }, 95).data);
    expect(sniffImageType(jpg)).toBe('image/jpeg');
    expect(await decodePrintedImage(jpg)).toMatchObject({ width: 4, height: 6 });
    const png = new PNG({ width: 4, height: 6 });
    png.data = Buffer.from(pixels.data);
    expect((await decodePrintedImage(new Uint8Array(PNG.sync.write(png)))).width).toBe(4);
    await expect(decodePrintedImage(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not a JPEG/);
  });

  it("the image-target CLI's JSON for a frame: flat, the crop of the printed image's size", () => {
    const json = imageTargetJson('p07-1', recognitionData('https://cdn.example/p07-1_recognition.webp', { width: 1200, height: 900 }));
    expect(json).toEqual({
      type: 'PLANAR',
      name: 'p07-1',
      imagePath: 'https://cdn.example/p07-1_recognition.webp',
      metadata: null,
      properties: { left: 0, top: 0, width: 900, height: 1200, isRotated: true, originalWidth: 900, originalHeight: 1200 },
    });
  });

  it('the fixture targets: each makes a frame (timed – the reader spends 150–260 ms per image on an S22)', async () => {
    const files = fs.readdirSync(FIXTURE_ENTRIES)
      .map(entry => path.join(FIXTURE_ENTRIES, entry, 'target.jpg'))
      .filter(file => fs.existsSync(file));
    expect(files.length).toBeGreaterThan(5);
    let ms = 0;
    let bytes = 0;
    for (const file of files) {
      const begun = performance.now();
      const printed = await decodePrintedImage(new Uint8Array(fs.readFileSync(file)));
      const png = framePng(recognitionFrame(printed));
      ms += performance.now() - begun;
      bytes += png.byteLength;
      expect(png.byteLength).toBeGreaterThan(1000);
    }
    console.info(`[#306] ${files.length} fixture targets: ${Math.round(ms / files.length)} ms each (Node), PNG ${Math.round(bytes / files.length / 1024)} KB each`);
  });
});

describe('osct targets prepare (#306)', () => {
  const tree = {
    scenes: [
      { id: 's1', entries: [
        { id: 'a', target: { id: 'a', imageSrc: 'https://cdn.example/a.jpg' } },
        { id: 'b', target: { id: 'b', imageSrc: 'https://cdn.example/b.jpg', recognition: { imageSrc: 'https://cdn.example/b_r.webp', width: 3, height: 4 } } },
        { id: 'text', target: null },
      ] },
      { id: 's2', entries: [{ id: 'c', target: { id: 'c', imageSrc: 'https://cdn.example/c.jpg', enabled: false } }] },
    ],
  };

  it("downloads a content path below the experience's assetsBase, else from the instance", () => {
    expect(imageUrl('/assets/content/entries/a/target.jpg', 'https://cdn.example/staging/v1/', 'https://osct.example')).toBe('https://cdn.example/staging/v1/assets/content/entries/a/target.jpg');
    expect(imageUrl('/assets/content/entries/a/target.jpg', '', 'https://osct.example')).toBe('https://osct.example/assets/content/entries/a/target.jpg');
    expect(imageUrl('https://cdn.example/osct/a.webp', 'https://x', 'https://y')).toBe('https://cdn.example/osct/a.webp');
  });

  it('plans the targets without recognition data – every one with --force, switched-off ones with --all', () => {
    expect(planTargets(tree).map(t => [t.id, t.action, t.enabled])).toEqual([['a', 'prepare', true], ['b', 'ready', true], ['c', 'off', false]]);
    expect(planTargets(tree, { all: true }).map(t => t.action)).toEqual(['prepare', 'ready', 'prepare']);
    expect(planTargets(tree, { force: true, all: true }).every(t => t.action === 'prepare')).toBe(true);
  });

  it('makes each frame, uploads it and names it on the target with the image it was made from; a changed image is skipped', async () => {
    const pixels = image(30, 40, () => [90, 90, 90]);
    const jpg = new Uint8Array(jpeg.encode({ ...pixels, data: Buffer.from(pixels.data) }, 95).data);
    const calls: string[] = [];
    const api: EditorApi = {
      tree: async () => tree,
      download: async url => { calls.push(`get ${url}`); return jpg; },
      upload: async (experience, name, bytes) => { calls.push(`upload ${experience} ${name} ${bytes[1] === 0x50 ? 'png' : '?'}`); return `https://cdn.example/${name.replace('.png', '.webp')}`; },
      putRecognition: async (_experience, target, imageSrc, recognition) => {
        if (target === 'c') throw new Error('PUT /editor/experiences/osct/targets/c → 409 {"error":{"code":"stale-image"}}');
        calls.push(`put ${target} ${imageSrc} ${JSON.stringify(recognition)}`);
      },
    };
    const lines: string[] = [];
    const done = await prepareTargets(api, 'osct', planTargets(tree, { all: true }), line => lines.push(line));
    expect(done.map(t => t.id)).toEqual(['a']);
    expect(calls).toEqual([
      'get https://cdn.example/a.jpg',
      'upload osct a_recognition.png png',
      'put a https://cdn.example/a.jpg {"imageSrc":"https://cdn.example/a_recognition.webp","width":30,"height":40}',
      'get https://cdn.example/c.jpg',
      'upload osct c_recognition.png png',
    ]);
    expect(lines.some(line => line.includes('c: its image changed meanwhile'))).toBe(true);
  });
});
