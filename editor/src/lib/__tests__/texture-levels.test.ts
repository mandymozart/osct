import { describe, expect, it } from "vitest";
import type { WebpDeps } from "../browser-webp";
import { largestOf, levelName, levelsToMake, makeLevels, mapSizeOf, missingBelow } from "../texture-levels";

const deps = (width: number, height: number, drawn: number[] = [], type = "image/webp"): WebpDeps => ({
  decode: async () => ({ width, height, close: () => {} }),
  encode: async (_picture, w) => { drawn.push(w); return new Blob([new Uint8Array(w / 512)], { type }); },
});

describe("a map's levels computed in the browser (#331 step 2)", () => {
  it("makes every smaller size the set lacks, largest first", () => {
    expect(levelsToMake(4096, [4096])).toEqual([2048, 1024, 512]);
    expect(levelsToMake(2048, [512, 2048])).toEqual([1024]);
    expect(levelsToMake(512, [512])).toEqual([]);
  });

  it("reads a set's largest map and what it misses below it", () => {
    const set = { sizes: [{ size: 512 as const, src: "a-512" }, { size: 2048 as const, src: "a-2048" }] };
    expect(largestOf(set)).toEqual({ size: 2048, src: "a-2048" });
    expect(missingBelow(set)).toEqual([1024]);
    expect(missingBelow(undefined)).toEqual([]);
  });

  it("names a level after its source, without the source's size", () => {
    expect(levelName("p103-2_body-4096.png", 1024)).toBe("p103-2_body-1024.webp");
    expect(levelName("folder/face.jpg", 512)).toBe("face-512.webp");
  });

  it("only square maps of the four sizes", () => {
    expect(mapSizeOf(2048, 2048)).toEqual({ size: 2048 });
    expect(mapSizeOf(2000, 2000)).toHaveProperty("problem");
    expect(mapSizeOf(2048, 1024)).toHaveProperty("problem");
  });

  it("decodes once and writes each level as WebP; a size the browser cannot write is left out", async () => {
    const drawn: number[] = [];
    const started: number[] = [];
    const result = await makeLevels(new Blob(), "body-4096.png", [4096, 1024], size => started.push(size), deps(4096, 4096, drawn));
    expect(result.size).toBe(4096);
    expect(result.sizes.map(level => [level.size, level.file.name, level.file.type])).toEqual([[2048, "body-2048.webp", "image/webp"], [512, "body-512.webp", "image/webp"]]);
    expect(drawn).toEqual([2048, 512]);
    expect(started).toEqual([2048, 512]);
    expect((await makeLevels(new Blob(), "a.png", [], undefined, deps(1024, 1024, [], "image/png"))).sizes).toEqual([]);
    await expect(makeLevels(new Blob(), "wide.png", [], undefined, deps(2048, 1024))).rejects.toThrow("a map is square");
  });
});
