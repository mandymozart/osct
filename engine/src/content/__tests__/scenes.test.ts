import { describe, expect, it } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";
import {
  entryPlaceLabel,
  getEntries,
  getEntry,
  getEntryPlaceLabel,
  getGroups,
  getSpread,
  getSurfaces,
  getTarget,
  getTargets,
  loadGameConfiguration,
  sceneIdOf,
  sceneLabel,
} from "../game-config";

/**
 * Scenes (#307 phase 1, schema 2.35): an entry's `scene` decides its spread, not its page; a scene's surfaces carry the
 * labels as printed; groups label several scenes. Content without any of it reads as before.
 */

const surfaces = [
  { id: "l", side: "left", widthMm: 170, heightMm: 240, label: "ii" },
  { id: "r", side: "right", widthMm: 170, heightMm: 240, label: "iii" },
];

const book = (extra: { spreads?: object[]; entries?: object[]; groups?: object[] } = {}) => ({
  version: { version: "1.97.3", timestamp: "2026-11-17T00:00:00.000Z", hash: "abc123", schema: CONTENT_SCHEMA_VERSION },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: extra.spreads ?? [
    { id: "s1", title: "Pages 1–2", firstPage: 1, lastPage: 2 },
    { id: "s2", title: "Pages 3–4", firstPage: 3, lastPage: 4, surfaces, layout: "fixed", group: "front", label: "Preface" },
  ],
  ...(extra.groups ? { groups: extra.groups } : { groups: [{ id: "front", label: "Front matter" }] }),
  entries: extra.entries ?? [
    // by page, as before
    { id: "old", category: "glossary", title: "Old", page: 1, body: "", tags: [], target: { id: "old", imageSrc: "/assets/content/entries/old/target.jpg" } },
    // its scene wins over its page (page 2 lies in s1)
    {
      id: "moved", category: "glossary", title: "Moved", page: 2, scene: "s2", surface: "r", body: "", tags: [],
      target: { id: "moved", imageSrc: "/assets/content/entries/moved/target.jpg" },
    },
    { id: "plain", category: "text", title: "Plain", page: 3, scene: "s2", body: "", tags: [] },
  ],
  entities: {},
});

describe("scenes (schema 2.35)", () => {
  it("an entry's scene wins over its page – also when the scene's pages do not hold it", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getEntry("old")?.spreadId).toBe("s1");
    expect(getEntry("moved")?.spreadId).toBe("s2");
    expect(getTarget("moved")?.spreadId).toBe("s2");
    expect(getTargets("s1").map(t => t.id)).toEqual(["old"]);
    expect(getTargets("s2").map(t => t.id)).toEqual(["moved"]);
    expect(getSpread("s2")?.entries.map(e => e.id)).toEqual(["moved", "plain"]);
  });

  it("reads groups and a scene's surfaces", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getGroups()).toEqual([{ id: "front", label: "Front matter" }]);
    expect(getSurfaces("s2").map(s => s.id)).toEqual(["l", "r"]);
    expect(getSurfaces("s1")).toEqual([]);
    expect(getSpread("s2")).toMatchObject({ layout: "fixed", group: "front", label: "Preface" });
  });

  it("an entry's place label: its surface's printed label, else its page", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getEntryPlaceLabel(getEntry("moved")!)).toBe("iii");
    expect(getEntryPlaceLabel(getEntry("plain")!)).toBe("3");
    expect(getEntryPlaceLabel(getEntry("old")!)).toBe("1");
  });

  it("content without scenes reads as before", async () => {
    const old = book({ spreads: [{ id: "s1", title: "Pages 1–2", firstPage: 1, lastPage: 2 }, { id: "s2", title: "Pages 3–4", firstPage: 3, lastPage: 4 }], groups: undefined, entries: [
      { id: "a", category: "glossary", title: "A", page: 2, body: "", tags: [] },
      { id: "b", category: "glossary", title: "B", page: 3, body: "", tags: [] },
    ] });
    delete (old as { groups?: unknown }).groups;
    expect(await loadGameConfiguration({ bundled: async () => old })).toBeNull();
    expect(getEntries().map(e => [e.id, e.spreadId])).toEqual([["a", "s1"], ["b", "s2"]]);
    expect(getGroups()).toEqual([]);
    expect(getEntryPlaceLabel(getEntry("b")!)).toBe("3");
  });
});

describe("scene helpers", () => {
  const spreads = [{ id: "s1", firstPage: 1, lastPage: 2 }, { id: "s2", firstPage: 3, lastPage: 4 }];

  it("sceneIdOf: the scene when it names a spread, else the page's spread", () => {
    expect(sceneIdOf({ page: 1, scene: "s2" }, spreads)).toBe("s2");
    expect(sceneIdOf({ page: 3 }, spreads)).toBe("s2");
    expect(sceneIdOf({ page: 1, scene: "gone" }, spreads)).toBe("s1");
    expect(sceneIdOf({ page: 9 }, spreads)).toBeUndefined();
  });

  it("entryPlaceLabel keeps today's labels without a surface label", () => {
    expect(entryPlaceLabel({ page: 0 }, { title: "Cover", format: "cover" })).toBe("Cover");
    expect(entryPlaceLabel({ page: -1 }, { title: "Front matter", matter: "front" })).toBe("Front matter");
    expect(entryPlaceLabel({ page: 12, surface: "x" }, { title: "Pages 12–13", surfaces: [{ id: "x", side: "left", widthMm: 1, heightMm: 1 }] })).toBe("12");
    expect(entryPlaceLabel({ page: -1, surface: "x" }, { title: "Front", matter: "front", surfaces: [{ id: "x", side: "left", widthMm: 1, heightMm: 1, label: "iv" }] })).toBe("iv");
  });

  it("sceneLabel: its own label, else its surfaces' labels, else none", () => {
    expect(sceneLabel({ label: " Preface " })).toBe("Preface");
    expect(sceneLabel({ surfaces })).toBe("ii–iii");
    expect(sceneLabel({ surfaces: [surfaces[0]] })).toBe("ii");
    expect(sceneLabel({ surfaces: [{ id: "w", side: "wall", widthMm: 2000, heightMm: 1500 }] })).toBeNull();
    expect(sceneLabel({})).toBeNull();
  });
});

describe("the guard (schema 2.35)", () => {
  const problems = (config: unknown): string[] => {
    try {
      assertGameConfiguration(config);
      return [];
    } catch (error) {
      if (error instanceof GameConfigurationError) return error.problems;
      throw error;
    }
  };

  it("accepts scenes, surfaces and groups", () => {
    expect(problems(book())).toEqual([]);
  });

  it("an entry's scene must exist, its surface must be on that scene", () => {
    const config = book({ entries: [
      { id: "a", category: "glossary", title: "A", page: 1, scene: "nope", body: "", tags: [] },
      { id: "b", category: "glossary", title: "B", page: 1, scene: "s1", surface: "r", body: "", tags: [] },
      { id: "c", category: "glossary", title: "C", page: 1, surface: "r", body: "", tags: [] },
    ] });
    expect(problems(config)).toEqual([
      'entries[0].scene: unknown scene "nope"',
      'entries[1].surface: scene "s1" has no surface "r"',
      "entries[2].surface: a surface needs the entry's scene",
    ]);
  });

  it("a scene's group must exist; surfaces need a side and a size", () => {
    const config = book({
      groups: [],
      spreads: [{
        id: "s1", title: "1", firstPage: 1, lastPage: 2, group: "front", layout: "loose",
        surfaces: [{ id: "l", side: "Left", widthMm: 0, heightMm: 240 }, { id: "l", side: "right", widthMm: 1, heightMm: 1, label: 4 }],
      }],
      entries: [],
    });
    expect(problems(config)).toEqual([
      "spreads[0].surfaces[0].side: expected a side (left, right, front, back, wall …)",
      "spreads[0].surfaces[0].widthMm: expected a size in mm (> 0)",
      "spreads[0].surfaces[1].label: expected a non-empty string",
      'spreads[0].surfaces[1].id: duplicate surface id "l"',
      'spreads[0].layout: "loose" is not one of fixed, free',
      'spreads[0].group: unknown group "front"',
    ]);
  });

  it("a side a later MINOR adds passes", () => {
    const config = book({ spreads: [{ id: "s1", title: "1", firstPage: 1, lastPage: 2, surfaces: [{ id: "c", side: "ceiling", widthMm: 1, heightMm: 1 }] }], entries: [] });
    expect(problems(config)).toEqual([]);
  });
});
