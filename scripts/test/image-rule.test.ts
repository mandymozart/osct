// The image rule in the content build (#298): WebP behind OSCT_IMAGE_FORMAT=webp – sizes, transparency, orientation,
// and the configuration renamed with the files
import fs from 'fs';
import os from 'os';
import path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { contentImagePaths, imageFormat, jpegOrientation, optimizeMedia, renameContentPaths, toWebp, upright } from '../src/lib/optimize-media';
import { fitImage, IMAGE_MAX_SIDE } from '../../shared/api/images';

const png = (width: number, height: number, alpha = 255): Uint8Array => {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) image.data.set([40, 120, 200, alpha], i);
  return new Uint8Array(PNG.sync.write(image));
};

/** A JPEG with an EXIF APP1 segment naming `orientation` (little-endian TIFF, one entry) */
const jpegWithOrientation = (width: number, height: number, orientation: number): Uint8Array => {
  const data = new Uint8Array(width * height * 4).fill(200);
  const encoded = new Uint8Array(jpeg.encode({ width, height, data }, 80).data);
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
  const exif = [...'Exif'].map(c => c.charCodeAt(0)).concat([0, 0], tiff);
  const app1 = [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif];
  return new Uint8Array([0xff, 0xd8, ...app1, ...encoded.subarray(2)]);
};

/** A lossy WebP's size from its VP8 frame header */
const webpSize = (data: Uint8Array) => ({ width: (data[26] | (data[27] << 8)) & 0x3fff, height: (data[28] | (data[29] << 8)) & 0x3fff });
const chunk = (data: Uint8Array, at: number) => String.fromCharCode(...data.subarray(at, at + 4));

describe('the image rule in the content build (#298)', () => {
  it('is off by default: OSCT_IMAGE_FORMAT=webp switches it on', () => {
    expect(imageFormat(undefined)).toBe('jpeg');
    expect(imageFormat('')).toBe('jpeg');
    expect(imageFormat(' WebP ')).toBe('webp');
  });

  it('the sizes per use, never scaled up', () => {
    expect(IMAGE_MAX_SIDE).toEqual({ reference: 2048, entryImage: 2048, target: 1200, default: 2048 });
    expect(fitImage(3000, 1000)).toEqual({ width: 2048, height: 683 });
    expect(fitImage(3000, 1000, 'target')).toEqual({ width: 1200, height: 400 });
    expect(fitImage(800, 600, 'target')).toEqual({ width: 800, height: 600 });
  });

  it('an opaque picture → lossy WebP at the target size; one with transparency → lossless', async () => {
    const lossy = (await toWebp(png(3000, 100), 'image/png', 'target'))!;
    expect(chunk(lossy, 8)).toBe('WEBP');
    expect(chunk(lossy, 12)).toBe('VP8 ');
    expect(webpSize(lossy)).toEqual({ width: 1200, height: 40 });
    const lossless = (await toWebp(png(30, 20, 0), 'image/png'))!;
    expect(chunk(lossless, 12)).toBe('VP8L');
    expect(await toWebp(new Uint8Array([1, 2, 3]), 'image/webp')).toBeNull();
  });

  it('a JPEG turns upright by its EXIF orientation, and the WebP carries no EXIF', async () => {
    const turned = jpegWithOrientation(40, 20, 6);
    expect(jpegOrientation(turned)).toBe(6);
    expect(jpegOrientation(png(2, 2))).toBe(0);
    const result = (await toWebp(turned, 'image/jpeg'))!;
    expect(webpSize(result)).toEqual({ width: 20, height: 40 });
    expect(Buffer.from(result).includes('Exif')).toBe(false);
  });

  it('orientations move the pixels where EXIF says (6: 90° clockwise, 8: counter-clockwise, 2: mirrored)', () => {
    // 2 × 1: a red pixel left, a blue one right
    const image = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) };
    const six = upright(image, 6);
    expect([six.width, six.height, six.data[0], six.data[6]]).toEqual([1, 2, 255, 255]);
    const eight = upright(image, 8);
    expect([eight.width, eight.height, eight.data[2], eight.data[4]]).toEqual([1, 2, 255, 255]);
    expect(Array.from(upright(image, 2).data.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    expect(upright(image, 1)).toBe(image);
  });

  it('the build writes the images the configuration names as WebP and renames them in it; the rest stay', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osct-webp-'));
    fs.mkdirSync(path.join(dir, 'entries/p1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'entries/p1/target.png'), png(1600, 800));
    fs.writeFileSync(path.join(dir, 'entries/p1/image.png'), png(2500, 1000));
    fs.writeFileSync(path.join(dir, 'entries/p1/loose.png'), png(10, 10));
    const config = { entries: [{ image: '/assets/content/entries/p1/image.png', target: { imageSrc: '/assets/content/entries/p1/target.png' } }] };
    expect(contentImagePaths(config).targets).toEqual(new Set(['/assets/content/entries/p1/target.png']));
    const results = await optimizeMedia(dir, new Set(), { config });
    const renames = new Map(results.flatMap(r => (r.renamedFrom && r.renamedTo ? [[r.renamedFrom, r.renamedTo] as const] : [])));
    expect(renameContentPaths(config, renames)).toEqual({
      entries: [{ image: '/assets/content/entries/p1/image.webp', target: { imageSrc: '/assets/content/entries/p1/target.webp' } }],
    });
    expect(fs.readdirSync(path.join(dir, 'entries/p1')).sort()).toEqual(['image.webp', 'loose.png', 'target.webp']);
    expect(webpSize(new Uint8Array(fs.readFileSync(path.join(dir, 'entries/p1/target.webp'))))).toEqual({ width: 1200, height: 600 });
    expect(webpSize(new Uint8Array(fs.readFileSync(path.join(dir, 'entries/p1/image.webp'))))).toEqual({ width: 2048, height: 819 });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
