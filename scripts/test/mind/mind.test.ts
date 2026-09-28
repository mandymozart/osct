import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/mind/stats';
import { imageSize } from '../../src/mind/targets';

describe('tools/mind', () => {
  it('reads JPEG and PNG sizes from the file header', () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });

    // SOI, APP0 (length 4), SOF0: length, precision, height 300, width 200
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x00, 0xc8]);
    expect(imageSize(jpeg)).toEqual({ width: 200, height: 300 });
  });

  it('summarises a run: rates, GPU/CPU share, parallel speed-up, slowest first', () => {
    const results = [
      { name: 'a', pixels: 2e6, ms: 4000, detectMs: 3000, trackMs: 1000 },
      { name: 'b', pixels: 1e6, ms: 2000, detectMs: 1500, trackMs: 500 },
    ];
    const s = summarize(results, 3000);
    expect(s.images).toBe(2);
    expect(s.perImage).toBe(1500);
    expect(s.imagesPerMinute).toBe(40);
    expect(s.mpPerSecond).toBe(1);
    expect(s.gpuShare).toBe(0.75);
    expect(s.cpuShare).toBe(0.25);
    expect(s.parallel).toBe(2);
    expect(s.slowest.map((r: { name: string }) => r.name)).toEqual(['a', 'b']);
  });
});
