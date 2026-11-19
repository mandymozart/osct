import { beforeEach, describe, expect, it } from "vitest";
import { assetLabel, assetPlace, convertedNotice, groupByScene, heldNotice, matchesSearch, moreUses, namesPlanLine, readLibraryView, saveLibraryView } from "../library-place";
import type { Asset } from "../api";
import { imageUseQuery } from "@shared/api/images";

describe("the Library grouped by scene (#298 phase 3)", () => {
  const asset = (name: string, place: Asset["place"], extra: Partial<Asset> = {}): Asset => ({
    id: name, name, kind: "image", mime: "image/webp", size: 1, width: null, height: null, durationMs: null, version: 1, url: `https://cdn/${name}`,
    usages: place ? 1 : 0, imported: false, credits: null, place, createdAt: "", updatedAt: "", ...extra,
  });
  const scenes = [
    { id: "cover", label: "Cover" },
    { id: "s118-119", label: "118–119" },
    { id: "s120-121", label: "" },
  ];

  it("a header per scene in the scenes' order (its label, else its id), then the experience-wide files, then the unused ones", () => {
    const groups = groupByScene([
      asset("unused.webp", null),
      asset("p120-1_target.webp", { scene: "s120-121", order: 5, more: 0 }),
      asset("environment_sky.webp", { scene: null, order: -1, more: 0 }),
      asset("p118-2_target.webp", { scene: "s118-119", order: 3, more: 0 }),
      asset("p118-1_target.webp", { scene: "s118-119", order: 2, more: 2 }),
      asset("cover_target.webp", { scene: "cover", order: 0, more: 0 }),
      asset("gone_target.webp", { scene: "gone", order: 9, more: 0 }),
    ], scenes);
    expect(groups.map(g => [g.label, g.assets.map(a => a.name)])).toEqual([
      ["Cover", ["cover_target.webp"]],
      ["118–119", ["p118-1_target.webp", "p118-2_target.webp"]],
      ["s120-121", ["p120-1_target.webp"]],
      ["Not in a scene", ["environment_sky.webp", "gone_target.webp"]],
      ["Unused", ["unused.webp"]],
    ]);
  });

  it("+N more for a file used in more places, the listed name of an imported file once it has one", () => {
    expect(moreUses(asset("a", { scene: "cover", order: 0, more: 2 }))).toBe("+2 more");
    expect(moreUses(asset("a", { scene: "cover", order: 0, more: 0 }))).toBe("");
    const imported = { name: "target.jpg", url: "/assets/content/entries/p015-1/target.jpg", imported: true };
    expect(assetLabel(imported)).toBe("p015-1 · target");
    expect(assetLabel({ ...imported, name: "p015-1_target.jpg", named: true })).toBe("p015-1_target.jpg");
  });

  it("the names plan in a line", () => {
    expect(namesPlanLine([])).toBe("Every used file is named by its use already.");
    expect(namesPlanLine([{ to: "page-cover.webp", imported: false }, { to: "p1_target.jpg", imported: true }]))
      .toBe("2 files take the name of their use (1 imported – their listed name): page-cover.webp, p1_target.jpg");
  });

  it("an upload's use as its query: the size rule and what names the file", () => {
    expect(imageUseQuery(undefined)).toBe("");
    expect(imageUseQuery("default")).toBe("");
    expect(imageUseQuery("target")).toBe("?fit=target");
    expect(imageUseQuery({ fit: "target", entry: "p118-1" })).toBe("?fit=target&entry=p118-1");
    expect(imageUseQuery({ fit: "entryImage", entry: "p118-1" })).toBe("?fit=entryImage&entry=p118-1");
    expect(imageUseQuery({ fit: "reference", surface: { scene: "s118-119", surface: "surface" } })).toBe("?fit=reference&scene=s118-119&surface=surface");
    expect(imageUseQuery({ fit: "default", entry: "x" })).toBe("");
  });
});

describe("a picture the image rule converted at upload (#298)", () => {
  it("names the file as it came and as it is stored", () => {
    expect(convertedNotice({ name: "Photo.webp", size: 412_000, width: 2048, height: 1536 }, { name: "Photo.jpg", size: 6_200_000 }))
      .toBe("Photo.jpg (6.2 MB) is stored as Photo.webp – 2048×1536, 412 kB");
    expect(convertedNotice({ name: "eye.webp", size: 900, width: null, height: null }, { name: "eye.png", size: 3_000 })).toBe("eye.png (3 kB) is stored as eye.webp – 1 kB");
  });
});

const file = (url: string, name = url.split("/").pop() ?? url) => ({ name, url });

describe("where a library file belongs", () => {
  it("names an imported file by its entry and its role", () => {
    expect(assetPlace(file("/assets/content/entries/p015-1/target.jpg"))).toEqual({ collection: "entries", place: "p015-1", role: "target", label: "p015-1 · target" });
  });

  it("reads the place below an assets base (a CDN URL with a query)", () => {
    const place = assetPlace(file("https://cdn.example/staging/0123456789ab/assets/content/entries/p015-1/video.mp4?v=abc", "video.mp4"));
    expect(place.label).toBe("p015-1 · video");
  });

  it("keeps the folders between the place and the file, and decodes them", () => {
    expect(assetPlace(file("/assets/content/scenes/s%2001/media/cover.png")).label).toBe("s 01/media · cover");
  });

  it("an upload has no place: its label is its name", () => {
    expect(assetPlace(file("https://api.example/content/assets/osct/1f2e/v1.png", "Dot.png"))).toEqual({ collection: null, place: null, role: null, label: "Dot.png" });
    expect(assetPlace(file("/assets/content/logo.png")).place).toBeNull();
  });
});

describe("the library search", () => {
  const target = file("/assets/content/entries/p015-1/target.jpg");

  it("matches the place, the role and the collection, every word", () => {
    expect(matchesSearch(target, "p015")).toBe(true);
    expect(matchesSearch(target, "P015-1 target")).toBe(true);
    expect(matchesSearch(target, "entries")).toBe(true);
    expect(matchesSearch(target, "p015 video")).toBe(false);
    expect(matchesSearch(target, "  ")).toBe(true);
  });
});

describe("an upload whose bytes the library held already (#258)", () => {
  it("says which file it was and the name it has now", () => {
    expect(heldNotice({ name: "face_1.glb" }, "face.glb")).toBe("face.glb is the same file – it is now named face_1.glb");
    expect(heldNotice({ name: "face.glb" }, "face.glb")).toBe("face.glb is in the Library already – the same file, nothing new stored");
  });

  it("says nothing about a new file", () => {
    expect(heldNotice({ name: "face.glb" }, undefined)).toBeNull();
  });
});

describe("the library view", () => {
  beforeEach(() => localStorage.clear());

  it("is the cards until the list is chosen, then remembered", () => {
    expect(readLibraryView()).toBe("cards");
    saveLibraryView("list");
    expect(readLibraryView()).toBe("list");
    localStorage.setItem("osct-editor-library-view", "nonsense");
    expect(readLibraryView()).toBe("cards");
  });
});
