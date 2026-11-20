import { describe, expect, it } from "vitest";
import type { Asset } from "../api";
import type { WebpDeps } from "../browser-webp";
import { librarySets, levelCount, stackRange } from "../library-sets";
import { imageLevelName, imageLevelsToMake, levelLabel, levelOfAsset, makeImageLevels, setNodeLevels, withLevel, withoutLevel } from "../media-levels";

const asset = (name: string, extra: Partial<Asset> = {}): Asset => ({
  id: name, name, kind: "image", mime: "image/webp", size: 1000, width: null, height: null, durationMs: null, version: 1, url: `https://cdn/lib/${name}`,
  usages: 1, imported: false, credits: null, place: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "", ...extra,
});

describe("media levels in the Inspector (#331 step 3)", () => {
  it("labels a level by its kind", () => {
    expect(levelLabel("image", 1024)).toBe("1024 px");
    expect(levelLabel("video", 720)).toBe("720p");
    expect(levelLabel("audio", 128)).toBe("128 kbps");
  });

  it("reads the level of a file: a picture's longest side, a film's shorter side – the nearest level", () => {
    expect(levelOfAsset(asset("a.webp", { width: 1920, height: 1080 }), "image")).toEqual({ level: 2048 });
    expect(levelOfAsset(asset("a.webp", { width: 600, height: 400 }), "image")).toEqual({ level: 512 });
    expect(levelOfAsset(asset("f.mp4", { kind: "video", width: 1080, height: 1920 }), "video")).toEqual({ level: 1080 });
    expect(levelOfAsset(asset("f.mp4", { kind: "video", width: 1280, height: 720 }), "video")).toEqual({ level: 720 });
    expect(levelOfAsset(asset("s.mp3", { kind: "audio" }), "audio")).toHaveProperty("problem");
    expect(levelOfAsset(asset("f.mp4", { kind: "video" }), "video")).toHaveProperty("problem");
    expect(levelOfAsset(asset("a.webp"), "video")).toEqual({ problem: "a.webp is no video." });
  });

  it("puts a file at a level (replacing it), takes one out, writes them on the node's file", () => {
    const levels = withLevel(withLevel(undefined, 1080, "b"), 480, "a");
    expect(levels).toEqual([{ level: 480, src: "a" }, { level: 1080, src: "b" }]);
    expect(withLevel(levels, 480, "c")[0]).toEqual({ level: 480, src: "c" });
    expect(withoutLevel(levels, 480)).toEqual([{ level: 1080, src: "b" }]);
    expect(withoutLevel([{ level: 480, src: "a" }], 480)).toBeUndefined();
    const node = { type: "video", assets: [{ id: "v", assetType: "video" as const, src: "v.mp4" }] };
    expect(setNodeLevels(node, levels).assets[0].levels).toEqual(levels);
    expect(setNodeLevels(setNodeLevels(node, levels), undefined).assets[0]).not.toHaveProperty("levels");
  });

  it("computes a picture's smaller levels in the browser: below its own level, the aspect kept, WebP", async () => {
    expect(imageLevelsToMake(2048, [2048])).toEqual([1024, 512]);
    expect(imageLevelsToMake(1024, [512])).toEqual([]);
    expect(imageLevelName("sky-2048.png", 512)).toBe("sky-512.webp");
    const drawn: [number, number][] = [];
    const deps: WebpDeps = {
      decode: async () => ({ width: 2000, height: 1000, close: () => {} }),
      encode: async (_p, w, h) => { drawn.push([w, h]); return new Blob(["x"], { type: "image/webp" }); },
    };
    const made = await makeImageLevels(new Blob(["p"]), "sky.png", [], undefined, deps);
    expect(made.level).toBe(2048);
    expect(made.levels.map(l => [l.level, l.file.name])).toEqual([[1024, "sky-1024.webp"], [512, "sky-512.webp"]]);
    expect(drawn).toEqual([[1024, 512], [512, 256]]);
  });
});

describe("media levels in the Library: a stack of the node's levels (#331)", () => {
  const f480 = asset("film-480.mp4", { kind: "video" });
  const f1080 = asset("film-1080.mp4", { kind: "video" });
  const scenes = [{ targets: [{ id: "p1", entity: { type: "video", name: "film", assets: [{ id: "v", assetType: "video", src: f1080.url, levels: [
    { level: 480, src: f480.url }, { level: 1080, src: f1080.url },
  ] }] } }] }];

  it("every level of the kind, the missing one a slot; the largest is the face; the node is where a level is added", () => {
    const sets = librarySets([f480, f1080], scenes);
    const stack = sets.stackOf.get(f480.id)!;
    expect(stack.kind).toBe("media");
    expect(stack.medium).toBe("video");
    expect(stack.levels.map(level => [level.label, level.asset?.id ?? null])).toEqual([["480p", f480.id], ["720p", null], ["1080p", f1080.id]]);
    expect(stack.face).toBe(f1080);
    expect(stack.media).toEqual({ targetId: "p1", src: f1080.url });
    expect(levelCount(stack)).toEqual({ there: 2, of: 3 });
    expect(stackRange(stack)).toBe("480p – 1080p");
    expect(sets.stackOf.get(f1080.id)).toBe(stack);
  });
});
