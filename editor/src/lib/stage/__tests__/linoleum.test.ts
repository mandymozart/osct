import { describe, expect, it } from "vitest";
import { RepeatWrapping, SRGBColorSpace } from "three";
import { linoleum, linoleumTexture } from "../linoleum";

describe("linoleum: Schöpfer's top (#187)", () => {
  const sheet = linoleum();
  const n = sheet.size * sheet.size;
  const channel = (c: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sheet.data[i * 4 + c];
    return sum / n;
  };

  it("is blue-grey: blue over green over red, none far from the others", () => {
    const [r, g, b] = [channel(0), channel(1), channel(2)];
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(b - r).toBeLessThan(80);
  });

  it("has a faint speckle: some variation, but an even surface", () => {
    const lum = Array.from({ length: n }, (_, i) => 0.2126 * sheet.data[i * 4] + 0.7152 * sheet.data[i * 4 + 1] + 0.0722 * sheet.data[i * 4 + 2]);
    const mean = lum.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(lum.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    expect(sd).toBeGreaterThan(0.01 * mean);
    expect(sd).toBeLessThan(0.06 * mean);
  });

  it("is the same every build, another with another seed", () => {
    expect(linoleum().data).toEqual(sheet.data);
    expect(linoleum({ seed: 2 }).data).not.toEqual(sheet.data);
  });

  it("is a repeating sRGB texture named linoleum", () => {
    const texture = linoleumTexture();
    expect(texture.name).toBe("linoleum");
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
  });
});
