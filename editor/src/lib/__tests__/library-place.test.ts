import { beforeEach, describe, expect, it } from "vitest";
import { assetPlace, matchesSearch, readLibraryView, saveLibraryView } from "../library-place";

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
