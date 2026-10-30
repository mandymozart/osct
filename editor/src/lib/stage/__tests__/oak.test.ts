import { describe, expect, it } from "vitest";
import { RepeatWrapping, SRGBColorSpace } from "three";
import { oakGrain, oakTexture, type OakGrain } from "../oak";

const luminance = (oak: OakGrain, x: number, y: number) => {
  const i = (y * oak.width + x) * 4;
  return 0.2126 * oak.data[i] + 0.7152 * oak.data[i + 1] + 0.0722 * oak.data[i + 2];
};
/** The mean absolute change in luminance from each pixel to its neighbour along u (dx = 1) or along v (dy = 1) */
const change = (oak: OakGrain, dx: number, dy: number) => {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < oak.height; y++) {
    for (let x = 0; x < oak.width; x++) {
      sum += Math.abs(luminance(oak, x, y) - luminance(oak, (x + dx) % oak.width, (y + dy) % oak.height));
      count++;
    }
  }
  return sum / count;
};

describe("oak: the grain (#187)", () => {
  const oak = oakGrain();

  it("is a light, warm wood", () => {
    let [r, g, b] = [0, 0, 0];
    for (let i = 0; i < oak.data.length; i += 4) [r, g, b] = [r + oak.data[i], g + oak.data[i + 1], b + oak.data[i + 2]];
    const n = oak.data.length / 4;
    expect(r / n).toBeGreaterThan(g / n);
    expect(g / n).toBeGreaterThan(b / n);
    expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / n).toBeGreaterThan(130);
  });

  it("runs along u: the grain changes far more across it than along it", () => {
    expect(change(oak, 0, 1)).toBeGreaterThan(2 * change(oak, 1, 0));
  });

  it("tiles both ways: the seams change no more than the texture does inside", () => {
    let seamU = 0;
    let seamV = 0;
    for (let y = 0; y < oak.height; y++) seamU += Math.abs(luminance(oak, oak.width - 1, y) - luminance(oak, 0, y));
    for (let x = 0; x < oak.width; x++) seamV += Math.abs(luminance(oak, x, oak.height - 1) - luminance(oak, x, 0));
    expect(seamU / oak.height).toBeLessThan(2 * change(oak, 1, 0) + 1);
    expect(seamV / oak.width).toBeLessThan(2 * change(oak, 0, 1) + 1);
  });

  it("is the same every build, another with another seed", () => {
    expect(oakGrain().data).toEqual(oak.data);
    expect(oakGrain({ seed: 2 }).data).not.toEqual(oak.data);
  });

  it("is a repeating sRGB texture named oak", () => {
    const texture = oakTexture();
    expect(texture.name).toBe("oak");
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
  });
});
