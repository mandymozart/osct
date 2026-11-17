import { beforeEach, describe, expect, it } from "vitest";
import { assetPlace, convertedNotice, heldNotice, matchesSearch, readLibraryView, saveLibraryView } from "../library-place";

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
    expect(assetPlace(file("/assets/content/spreads/s%2001/media/cover.png")).label).toBe("s 01/media · cover");
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
