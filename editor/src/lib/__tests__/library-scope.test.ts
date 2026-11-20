import { beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "../api";
import {
  formatOf, inScene, inScope, indexUsages, isRecent, isUnused, kindCounts, libraryGroups, libraryIndex, matchesSpecial, missingCredits, nextChosen, readLibrarySort,
  readTileSize, saveLibrarySort, saveTileSize, sceneCounts, scenesOfAsset, scopeCounts, sortAssets, srcKey, startScope, startsFolded, surfaceImagesOf, tileKind, tileMeta,
  usageJump, useWord, type GroupContext,
} from "../library-scope";

const asset = (name: string, extra: Partial<Asset> = {}): Asset => ({
  id: name, name, kind: "image", mime: "image/webp", size: 1000, width: null, height: null, durationMs: null, version: 1, url: `https://cdn/lib/${name}`,
  usages: 1, imported: false, credits: null, place: null, createdAt: "2026-11-01T10:00:00Z", updatedAt: "", ...extra,
});

// The draft: two scenes; the open one has a reference image, a printed target, a node with a model and a texture map, an entry's picture
const surface = asset("s4-5_surface.webp");
const printed = asset("p004-1_target.webp", { usages: 2 });
const model = asset("croc.glb", { kind: "glb", mime: "model/gltf-binary", size: 2_100_000 });
const texture = asset("croc_1024.jpg");
const picture = asset("p004-1_image.webp");
const imported = asset("target.jpg", { imported: true, url: "https://cdn/assets/content/entries/p006-1/target.jpg" });
const sky = asset("sky.webp", { place: { scene: null, order: -1, more: 0 } });
const spare = asset("spare.webp", { usages: 0 });
const assets = [surface, printed, model, texture, picture, imported, sky, spare];

const scenes = [
  {
    id: "s4-5", label: "4–5",
    targets: [{ id: "p004-1", imageSrc: printed.url, entity: { type: "model", assets: [{ id: "m", assetType: "glb", src: model.url, textures: [{ size: 1024, src: texture.url }] }] } }],
    entries: [{ id: "p004-1", image: picture.url, target: { id: "p004-1" } }],
  },
  { id: "s6-7", label: "6–7", targets: [{ id: "p006-1", imageSrc: "/assets/content/entries/p006-1/target.jpg" }], entries: [{ id: "p006-1", target: { id: "p006-1" } }] },
];
const references = { "s4-5": { front: { url: surface.url } } };
const index = libraryIndex(scenes, references);

describe("the draft's uses of the files (#330)", () => {
  it("compares an imported file by its content path, an upload by its URL", () => {
    expect(srcKey("https://cdn/assets/content/entries/p006-1/target.jpg?v=2")).toBe("/assets/content/entries/p006-1/target.jpg");
    expect(srcKey("/assets/content/entries/p006-1/target.jpg")).toBe("/assets/content/entries/p006-1/target.jpg");
    expect(srcKey(model.url)).toBe(model.url);
  });

  it("finds a scene's reference images, printed images, node files (texture maps too) and entries' pictures", () => {
    for (const file of [surface, printed, model, texture, picture]) expect(inScene(file, "s4-5", index)).toBe(true);
    expect(inScene(imported, "s6-7", index)).toBe(true);
    expect(inScene(imported, "s4-5", index)).toBe(false);
    expect(inScene(sky, "s4-5", index)).toBe(false);
    expect(inScene(printed, null, index)).toBe(false);
  });

  it("counts the scene of a file's first use the API names too", () => {
    const placed = asset("elsewhere.webp", { place: { scene: "s6-7", order: 3, more: 0 } });
    expect(inScene(placed, "s6-7", index)).toBe(true);
    expect([...scenesOfAsset(placed, index)]).toEqual(["s6-7"]);
  });

  it("names an imported file's uses as the API would", () => {
    expect(indexUsages(imported, index)).toEqual([{ kind: "target", ref: "p006-1" }]);
    expect(indexUsages(surface, index)).toEqual([{ kind: "reference", ref: "s4-5/front" }]);
    expect(indexUsages(model, index)).toEqual([{ kind: "target", ref: "p004-1" }]);
    expect(indexUsages(spare, index)).toEqual([]);
  });
});

describe("the scope (#330)", () => {
  it("starts at the open scene while one is open – a picker and no scene start at all", () => {
    expect(startScope("s4-5", false)).toBe("scene");
    expect(startScope("s4-5", true)).toBe("all");
    expect(startScope(null, false)).toBe("all");
  });

  it("this scene, all, unused – and their counts", () => {
    expect(assets.filter(a => inScope(a, "scene", "s4-5", index))).toEqual([surface, printed, model, texture, picture]);
    expect(assets.filter(a => inScope(a, "unused", "s4-5", index))).toEqual([spare]);
    expect(assets.filter(a => inScope(a, "all", "s4-5", index))).toEqual(assets);
    expect(scopeCounts(assets, "s4-5", index)).toEqual({ scene: 5, all: 8, unused: 1 });
    expect(isUnused(spare)).toBe(true);
    expect(isUnused(sky)).toBe(false);
  });
});

describe("the kinds (#330)", () => {
  const targets = new Set([printed.url]);
  const surfaces = surfaceImagesOf(references);

  it("tell targets, surfaces and images apart and count each within what they get", () => {
    expect([...surfaces]).toEqual([surface.url]);
    const counts = kindCounts([...assets, asset("a.glsl", { kind: "shader" }), asset("v.mp4", { kind: "video" }), asset("hum.mp3", { kind: "audio" })], targets, surfaces);
    expect(counts).toEqual({ all: 10, target: 2, surface: 1, image: 4, video: 1, model: 1, audio: 1, code: 1, nodes: 0 });
  });

  it("name a tile's kind: target, surface, 3D, else the kind", () => {
    expect(tileKind(printed, targets, surfaces)).toBe("target");
    expect(tileKind(imported, targets, surfaces)).toBe("target");
    expect(tileKind(surface, targets, surfaces)).toBe("surface");
    expect(tileKind(model, targets, surfaces)).toBe("3D");
    expect(tileKind(picture, targets, surfaces)).toBe("image");
  });
});

describe("the browser's places (#330)", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");

  it("recently added: within the last week", () => {
    expect(isRecent(asset("new", { createdAt: "2026-11-15T00:00:00Z" }), now)).toBe(true);
    expect(isRecent(asset("old", { createdAt: "2026-11-01T00:00:00Z" }), now)).toBe(false);
    expect(isRecent(asset("bad", { createdAt: "" }), now)).toBe(false);
  });

  it("missing credits: a medium without its line – a shader needs none", () => {
    expect(missingCredits(asset("a"))).toBe(true);
    expect(missingCredits(asset("b", { credits: "  " }))).toBe(true);
    expect(missingCredits(asset("c", { credits: "© Kévin Bray" }))).toBe(false);
    expect(missingCredits(asset("d", { kind: "shader" }))).toBe(false);
  });

  it("one scene, and how many files each scene uses", () => {
    expect(assets.filter(a => matchesSpecial(a, { by: "scene", scene: "s6-7" }, now, index))).toEqual([imported]);
    expect(assets.filter(a => matchesSpecial(a, null, now, index))).toEqual(assets);
    expect(Object.fromEntries(sceneCounts(assets, index))).toEqual({ "s4-5": 5, "s6-7": 1 });
  });
});

describe("the sort (#330)", () => {
  const a = asset("p10.webp", { size: 5, usages: 1, createdAt: "2026-11-02T00:00:00Z" });
  const b = asset("p9.webp", { size: 50, usages: 0, createdAt: "2026-11-03T00:00:00Z" });
  const c = asset("p100.webp", { size: 20, usages: 3, createdAt: "2026-11-01T00:00:00Z" });

  it("by name with numbers as numbers, the newest, the largest, the most used first", () => {
    expect(sortAssets([a, b, c], "name").map(x => x.name)).toEqual(["p9.webp", "p10.webp", "p100.webp"]);
    expect(sortAssets([a, b, c], "recent").map(x => x.name)).toEqual(["p9.webp", "p10.webp", "p100.webp"]);
    expect(sortAssets([a, b, c], "size").map(x => x.name)).toEqual(["p9.webp", "p100.webp", "p10.webp"]);
    expect(sortAssets([a, b, c], "uses").map(x => x.name)).toEqual(["p100.webp", "p10.webp", "p9.webp"]);
  });
});

describe("the groups (#330)", () => {
  const context = (extra: Partial<GroupContext> = {}): GroupContext => ({
    scope: "all", grouping: "scene", sort: "name", sceneId: "s4-5", sceneLabel: "4–5", scenes, index, targetImages: new Set([printed.url]), surfaceImages: surfaceImagesOf(references), ...extra,
  });
  const placed = [
    ...[surface, printed, model, texture, picture].map(f => ({ ...f, place: { scene: "s4-5", order: 0, more: 0 } })),
    { ...imported, place: { scene: "s6-7", order: 1, more: 0 } },
    sky,
    spare,
  ];

  it("in All: the open scene pinned on top, then the unused, then the other scenes and the experience-wide files", () => {
    const groups = libraryGroups(placed, context());
    expect(groups.map(g => [g.key, g.label, g.pinned ?? false, g.assets.length])).toEqual([
      ["open", "4–5", true, 5],
      ["unused", "Unused", false, 1],
      ["scene:s6-7", "6–7", false, 1],
      ["experience", "Not in a scene", false, 1],
    ]);
    expect(groups[0].assets.map(a => a.name)).toEqual(["croc_1024.jpg", "croc.glb", "p004-1_image.webp", "p004-1_target.webp", "s4-5_surface.webp"]);
    expect(groups.map(g => startsFolded(g, "all"))).toEqual([false, true, true, true]);
  });

  it("this scene and unused: one group each; nothing: no group", () => {
    expect(libraryGroups(placed.slice(0, 5), context({ scope: "scene" })).map(g => [g.key, g.pinned])).toEqual([["open", true]]);
    expect(libraryGroups([spare], context({ scope: "unused" })).map(g => g.key)).toEqual(["unused"]);
    expect(libraryGroups([], context())).toEqual([]);
    expect(startsFolded({ key: "open", label: "", assets: [], pinned: true }, "scene")).toBe(false);
  });

  it("by kind, or none", () => {
    expect(libraryGroups(placed, context({ grouping: "kind" })).map(g => [g.label, g.assets.length])).toEqual([
      ["Targets", 2], ["Surfaces", 1], ["Images", 4], ["3D", 1],
    ]);
    expect(libraryGroups(placed, context({ grouping: "none" })).map(g => [g.key, g.assets.length])).toEqual([["all", 8]]);
  });
});

describe("a use in the details (#330)", () => {
  it("says where it is", () => {
    expect(useWord({ kind: "reference", ref: "s4-5/front" }, scenes)).toBe("reference image · 4–5 · front");
    expect(useWord({ kind: "target", ref: "p004-1" }, scenes)).toBe("target p004-1");
    expect(useWord({ kind: "scene", ref: "s6-7" }, scenes)).toBe("scene 6–7");
    expect(useWord({ kind: "environment", ref: "x" }, scenes)).toBe("environment");
  });

  it("leads to the target, the entry, the surface or the scene – none for the environment or a plugin", () => {
    expect(usageJump({ kind: "target", ref: "p006-1" }, scenes)).toEqual({ sceneId: "s6-7", select: { target: "p006-1", node: [], onTarget: true } });
    expect(usageJump({ kind: "entry", ref: "p004-1" }, scenes)).toEqual({ sceneId: "s4-5", select: { target: "p004-1", node: [], onTarget: true, entry: "p004-1" } });
    expect(usageJump({ kind: "reference", ref: "s4-5/front" }, scenes)).toEqual({ sceneId: "s4-5", select: { target: null, node: [], onTarget: true, surface: { scene: "s4-5", id: "front" } } });
    expect(usageJump({ kind: "scene", ref: "s6-7" }, scenes)?.select.scene).toBe(true);
    expect(usageJump({ kind: "environment", ref: "x" }, scenes)).toBeNull();
    expect(usageJump({ kind: "plugin", ref: "wobble" }, scenes)).toBeNull();
    expect(usageJump({ kind: "target", ref: "gone" }, scenes)).toBeNull();
  });
});

describe("the browser's selection (#330)", () => {
  const order = ["a", "b", "c", "d"];
  it("a click one file, Ctrl adds or takes one, Shift the run from the anchor", () => {
    expect(nextChosen(["a"], "a", "c", order, {})).toEqual({ chosen: ["c"], anchor: "c" });
    expect(nextChosen(["a"], "a", "c", order, { toggle: true })).toEqual({ chosen: ["a", "c"], anchor: "c" });
    expect(nextChosen(["a", "c"], "c", "a", order, { toggle: true })).toEqual({ chosen: ["c"], anchor: "a" });
    expect(nextChosen(["b"], "b", "d", order, { shift: true })).toEqual({ chosen: ["b", "c", "d"], anchor: "b" });
    expect(nextChosen([], null, "d", order, { shift: true })).toEqual({ chosen: ["d"], anchor: "d" });
  });
});

describe("the tiles' words (#330)", () => {
  it("a meta line: just uploaded, pixels, size, version, further uses", () => {
    expect(tileMeta(asset("a", { width: 2048, height: 1425, size: 77_000 }))).toBe("2048×1425 · 77 kB");
    expect(tileMeta(asset("b", { size: 8_400_000, version: 2, place: { scene: "s", order: 0, more: 2 } }), true)).toBe("just uploaded · 8.4 MB · v2 · +2 more");
  });

  it("the format: the extension, else the media type", () => {
    expect(formatOf({ name: "p004-1_target.webp", mime: "image/webp" })).toBe("WEBP");
    expect(formatOf({ name: "noext", mime: "model/gltf-binary" })).toBe("GLTF-BINARY");
  });
});

describe("the remembered sort and tile size", () => {
  beforeEach(() => localStorage.clear());
  it("fall back to name and the start size", () => {
    expect(readLibrarySort()).toBe("name");
    saveLibrarySort("size");
    expect(readLibrarySort()).toBe("size");
    expect(readTileSize()).toBe(7);
    saveTileSize(9.5);
    expect(readTileSize()).toBe(9.5);
    saveTileSize(99);
    expect(readTileSize()).toBe(7);
  });
});
