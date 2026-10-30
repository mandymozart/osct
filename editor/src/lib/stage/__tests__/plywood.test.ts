import { describe, expect, it } from "vitest";
import { RepeatWrapping, SRGBColorSpace } from "three";
import { plywoodEdge, plywoodEdgeTexture, type PlywoodEdge } from "../plywood";

/** The mean luminance of a row (0..255) */
const rowLuminance = (edge: PlywoodEdge, y: number) => {
  let sum = 0;
  for (let x = 0; x < edge.width; x++) {
    const o = (y * edge.width + x) * 4;
    sum += 0.2126 * edge.data[o] + 0.7152 * edge.data[o + 1] + 0.0722 * edge.data[o + 2];
  }
  return sum / edge.width;
};
const middleRow = (edge: PlywoodEdge, ply: number) => Math.floor((edge.plies[ply].from + edge.plies[ply].to) / 2);

describe("plywood edge: the plies", () => {
  it("draws the asked number of plies through the thickness, filling it", () => {
    for (const plies of [5, 7, 9]) {
      const edge = plywoodEdge({ plies });
      expect(edge.plies).toHaveLength(plies);
      expect(edge.plies[0].from).toBe(0);
      expect(edge.plies[plies - 1].to).toBe(edge.height);
      edge.plies.slice(1).forEach((ply, i) => expect(ply.from).toBeCloseTo(edge.plies[i].to));
      expect(edge.data).toHaveLength(edge.width * edge.height * 4);
    }
  });

  it("alternates long-grain and darker cross-grain plies, both faces long-grain", () => {
    const edge = plywoodEdge({ plies: 7 });
    expect(edge.plies.map(p => p.cross)).toEqual([false, true, false, true, false, true, false]);
    const light = edge.plies.map((_, i) => rowLuminance(edge, middleRow(edge, i)));
    for (let i = 1; i < light.length; i++) {
      if (edge.plies[i].cross) expect(light[i]).toBeLessThan(light[i - 1] - 8);
      else expect(light[i]).toBeGreaterThan(light[i - 1] + 8);
    }
  });

  it("parts the plies with glue lines darker than either ply", () => {
    const edge = plywoodEdge({ plies: 7 });
    const boundary = Math.floor(edge.plies[1].from);
    const line = Math.min(rowLuminance(edge, boundary - 1), rowLuminance(edge, boundary), rowLuminance(edge, boundary + 1));
    expect(line).toBeLessThan(rowLuminance(edge, middleRow(edge, 0)) - 20);
    expect(line).toBeLessThan(rowLuminance(edge, middleRow(edge, 1)) - 10);
  });

  it("runs the plies along u: a ply varies far less along the edge than from one ply to the next", () => {
    const edge = plywoodEdge({ plies: 7 });
    const y = middleRow(edge, 2);
    const values: number[] = [];
    for (let x = 0; x < edge.width; x++) values.push(edge.data[(y * edge.width + x) * 4 + 1]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(deviation).toBeGreaterThan(0.5); // a faint grain, not a flat colour
    expect(deviation).toBeLessThan(10);
  });

  it("repeats seamlessly along the edge and is the same for the same seed", () => {
    const edge = plywoodEdge({ plies: 7 });
    const y = middleRow(edge, 0);
    const first = edge.data[(y * edge.width) * 4 + 1];
    const last = edge.data[(y * edge.width + edge.width - 1) * 4 + 1];
    expect(Math.abs(first - last)).toBeLessThan(12);
    expect(plywoodEdge({ plies: 7 }).data).toEqual(edge.data);
    expect(plywoodEdge({ plies: 7, seed: 2 }).data).not.toEqual(edge.data);
  });

  it("stays small: a 512 × 128 texture by default", () => {
    const edge = plywoodEdge();
    expect([edge.width, edge.height]).toEqual([512, 128]);
    expect(edge.plies).toHaveLength(7);
  });
});

describe("plywood edge: the texture", () => {
  it("is an sRGB data texture that repeats both ways", () => {
    const texture = plywoodEdgeTexture({ plies: 7 });
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.image.width).toBe(512);
    texture.dispose();
  });
});
