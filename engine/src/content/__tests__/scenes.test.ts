import { describe, expect, it } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";
import {
  entryPlaceLabel,
  getEntries,
  getEntry,
  getEntryPlaceLabel,
  getGroups,
  getInitialSceneId,
  getScene,
  getScenes,
  getTarget,
  getTargets,
  loadGameConfiguration,
  sceneLabel,
} from "../game-config";

/**
 * Scenes (schema 3.0, #319): an experience is an ordered list of scenes; an entry names its scene; a scene's label is
 * what the reader shows; surfaces are placed areas of a scene, a target's place lies on one. Nothing reads a page.
 */

const place = (x = 0) => ({ x, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
const surface = (id = "surface", widthMm = 460, extra: object = {}) => ({ id, widthMm, heightMm: 320, place: place(), ...extra });
const twoPages = [surface("l", 230, { label: "ii", place: place(-115) }), surface("r", 230, { label: "iii", place: place(115) })];

const book = (extra: { scenes?: object[]; entries?: object[]; groups?: object[] } = {}) => ({
  version: { version: "1.120.0", timestamp: "2026-11-18T00:00:00.000Z", hash: "abc123", schema: CONTENT_SCHEMA_VERSION },
  experience: { id: "b", title: "B", book: { author: "A" } },
  initialScene: "cover",
  scenes: extra.scenes ?? [
    { id: "cover", label: "Cover", surfaces: [surface("surface", 230)] },
    { id: "s2", label: "Preface", group: "front", surfaces: twoPages },
    { id: "s1", label: "186–187", surfaces: [surface()] },
  ],
  groups: extra.groups ?? [{ id: "front", label: "Front matter" }],
  entries: extra.entries ?? [
    { id: "seal", category: "glossary", title: "Seal", scene: "cover", body: "", tags: [], target: { id: "seal", imageSrc: "/assets/content/entries/seal/target.jpg", place: { x: 65, y: 110, width: 100 } } },
    {
      id: "moved", category: "glossary", title: "Moved", scene: "s2", surface: "r", body: "", tags: [],
      target: { id: "moved", imageSrc: "/assets/content/entries/moved/target.jpg", place: { surface: "r", x: 10, y: 20, width: 30 } },
    },
    { id: "plain", category: "text", title: "Plain", scene: "s1", body: "", tags: [] },
  ],
  entities: {},
});

describe("scenes (schema 3.0)", () => {
  it("an entry belongs to the scene it names; the scenes keep their order", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getScenes().map(s => s.id)).toEqual(["cover", "s2", "s1"]);
    expect(getInitialSceneId()).toBe("cover");
    expect(getEntry("moved")?.sceneId).toBe("s2");
    expect(getTarget("moved")?.sceneId).toBe("s2");
    expect(getTargets("s2").map(t => t.id)).toEqual(["moved"]);
    expect(getEntries().map(e => [e.id, e.sceneId])).toEqual([["seal", "cover"], ["moved", "s2"], ["plain", "s1"]]);
    expect(getTarget("moved")?.place).toEqual({ surface: "r", x: 10, y: 20, width: 30 });
  });

  it("reads groups and a scene's placed surfaces", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getGroups()).toEqual([{ id: "front", label: "Front matter" }]);
    expect(getScene("s2")?.group).toBe("front");
    expect(getScene("s2")?.surfaces.map(s => [s.id, s.label, s.place.x])).toEqual([["l", "ii", -115], ["r", "iii", 115]]);
  });

  it("an entry's place label: its surface's label, else its scene's", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getEntryPlaceLabel(getEntry("seal")!)).toBe("Cover");
    expect(getEntryPlaceLabel(getEntry("moved")!)).toBe("iii");
    expect(getEntryPlaceLabel(getEntry("plain")!)).toBe("186–187");
  });

  it("sceneLabel and entryPlaceLabel are pure: a blank label falls back to the id, no number is derived", () => {
    expect(sceneLabel({ id: "s1", label: "186–187" })).toBe("186–187");
    expect(sceneLabel({ id: "s1", label: "  " })).toBe("s1");
    const scene = { id: "s", label: "Studio wall", surfaces: [surface("w", 2000, { label: "  " })] };
    expect(entryPlaceLabel({ surface: "w" }, scene)).toBe("Studio wall");
    expect(entryPlaceLabel({}, scene)).toBe("Studio wall");
    expect(entryPlaceLabel({ surface: "x" }, undefined)).toBe("");
  });
});

describe("the guard (schema 3.0)", () => {
  const problems = (raw: unknown): string[] => {
    try {
      assertGameConfiguration(raw);
      return [];
    } catch (error) {
      if (error instanceof GameConfigurationError) return error.problems;
      throw error;
    }
  };

  it("accepts scenes, surfaces, places and groups", () => {
    expect(problems(book())).toEqual([]);
  });

  it("refuses the 2.x page model", () => {
    const old = {
      ...book(),
      initialSpreadId: "s1",
      spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
      scenes: undefined,
      initialScene: undefined,
      entries: [{ id: "a", category: "glossary", title: "A", page: 1, body: "", tags: [] }],
    };
    expect(problems(old)).toEqual(expect.arrayContaining([
      "config.initialScene: expected a non-empty string",
      "config.scenes: expected an array",
      "entries[0].scene: expected a scene id",
    ]));
  });

  it("an entry's scene must exist, its surface must be on that scene", () => {
    expect(problems(book({
      entries: [
        { id: "a", category: "glossary", title: "A", scene: "nope", body: "", tags: [] },
        { id: "b", category: "glossary", title: "B", scene: "s1", surface: "r", body: "", tags: [] },
      ],
    }))).toEqual([
      'entries[0].scene: unknown scene "nope"',
      'entries[1].surface: scene "s1" has no surface "r" (the entry\'s surface)',
    ]);
  });

  it("a scene has a label and at least one surface; a surface a size and a full place; a group must exist", () => {
    expect(problems(book({
      scenes: [
        { id: "cover", label: "", group: "nope", surfaces: [] },
        { id: "s2", label: "B", surfaces: [{ id: "x", widthMm: 0, heightMm: 1, place: { x: 0, y: 0, z: 0 } }, surface("x")] },
        { id: "s1", label: "C" },
      ],
      entries: [],
    }))).toEqual([
      "scenes[0].label: expected a non-empty string",
      "scenes[0].surfaces: a scene has at least one surface",
      'scenes[0].group: unknown group "nope"',
      "scenes[1].surfaces[0].widthMm: expected a size in mm (> 0)",
      "scenes[1].surfaces[0].place.rx: expected a number",
      "scenes[1].surfaces[0].place.ry: expected a number",
      "scenes[1].surfaces[0].place.rz: expected a number",
      'scenes[1].surfaces[1].id: duplicate surface id "x"',
      "scenes[2].surfaces: expected an array",
    ]);
  });

  it("a target's place lies on a surface of its scene – named when the scene has several", () => {
    const target = (scene: string, placeOf: object) => ({
      id: `t-${scene}`, category: "glossary", title: "T", scene, body: "", tags: [],
      target: { id: `t-${scene}`, imageSrc: "/t.jpg", place: placeOf },
    });
    expect(problems(book({
      entries: [
        target("s2", { x: 1, y: 2, width: 3 }),
        target("s1", { surface: "nope", x: 1, y: 2, width: 3 }),
        { ...target("cover", { x: "1", y: 2, width: 3, height: "4" }), id: "t3" },
      ],
    }))).toEqual([
      'entries[0].target.place.surface: scene "s2" has several surfaces – name the one the target lies on',
      'entries[1].target.place.surface: scene "s1" has no surface "nope" (the target\'s place)',
      "entries[2].target.place.x: expected a number (mm)",
      "entries[2].target.place.height: expected a number (mm)",
    ]);
  });
});
