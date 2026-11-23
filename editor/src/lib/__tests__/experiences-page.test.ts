import { describe, expect, it } from "vitest";
import type { PublishedVersion, RecentChange } from "../api";
import { addressPreview, deleteArmed, deletionTakes, makeLiveQuestion, moveSelection, readImportFile, recentPlaces, shelfInsets, versionRows } from "../experiences-page";

// The Experiences workspace (#348, #356): the pure parts of the books and the Inspector

describe("the reader address while the slug is typed", () => {
  it("shows the whole address once there is a slug", () => {
    expect(addressPreview("https://osct.porschuetz.de", "my-book")).toEqual({ text: "https://osct.porschuetz.de/my-book/", placeholder: false });
  });

  it("shows a plain placeholder without one – never %3Cslug%3E (the staging bug)", () => {
    const preview = addressPreview("https://osct.porschuetz.de/", "");
    expect(preview).toEqual({ text: "https://osct.porschuetz.de/…/", placeholder: true });
    expect(preview.text).not.toMatch(/%3C|<slug>/);
  });
});

const change = (over: Partial<RecentChange>): RecentChange => ({
  experience: "osct", experienceTitle: "Onion Skin", kind: "target", ref: "p1-1", scene: "p1", sceneLabel: "Page 1",
  entry: "The onion", user: "ana@osct.test", token: null, at: "2026-11-22T10:00:00Z", ...over,
});
const NOW = Date.parse("2026-11-22T10:30:00Z");

describe("Last worked on", () => {
  it("one row per experience and scene, the newest change there, at most five", () => {
    const changes = [
      change({ at: "2026-11-22T10:29:30Z" }),
      change({ at: "2026-11-22T10:20:00Z", entry: "older on the same scene" }),
      change({ scene: "p2", sceneLabel: "Page 2", entry: null, kind: "scene", at: "2026-11-22T09:30:00Z", user: "rudy@example.com" }),
      change({ experience: "demo", experienceTitle: "The Demo Book", scene: "the-key", sceneLabel: "The key", entry: "Key", at: "2026-11-21T10:00:00Z" }),
      ...["p3", "p4", "p5", "p6"].map((scene, i) => change({ scene, sceneLabel: scene, at: `2026-11-20T0${i}:00:00Z` })),
    ];
    const rows = recentPlaces(changes, "ana@osct.test", NOW);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ experience: "osct", book: "Onion Skin", place: "Page 1", detail: "The onion", when: "just now", who: null, path: "osct/p1/" });
    expect(rows[1]).toMatchObject({ place: "Page 2", detail: null, when: "1 h ago", who: "rudy@example.com", path: "osct/p2/" });
    expect(rows[2]).toMatchObject({ book: "The Demo Book", place: "The key", when: "yesterday", path: "demo/the-key/" });
    expect(rows.map(r => r.place)).not.toContain("p6");
  });

  it("a change on no scene opens the panel it belongs to on the first scene, else the experience", () => {
    const rows = recentPlaces([
      change({ kind: "plugin", ref: "tint", scene: null, sceneLabel: null, entry: null, token: "laptop-claude" }),
      change({ kind: "plugin", ref: "other", scene: null, sceneLabel: null, entry: null }),
      change({ kind: "experience", ref: "osct", scene: null, sceneLabel: null, entry: null }),
    ], "someone@else", NOW, 5, { osct: "p1" });
    expect(rows).toEqual([
      expect.objectContaining({ place: "Code", detail: null, who: "ana@osct.test (laptop-claude)", path: "osct/p1/?tab=code" }),
      expect.objectContaining({ place: "Experience", path: "osct/" }),
    ]);
  });
});

const version = (over: Partial<PublishedVersion>): PublishedVersion => ({
  id: over.build ?? "v", env: "staging", build: "aaaaaaaaaaaa", hash: "h", publishedBy: "tilman@example.com", publishedAt: "2026-11-22T07:53:00", note: null, ...over,
});

describe("Versions: the publish log with the live mark and make live", () => {
  const log = [
    version({ id: "5", build: "ccccccccccc3", publishedAt: "2026-11-22T10:13:00" }),
    version({ id: "4", build: "bbbbbbbbbbb2", publishedAt: "2026-11-22T07:53:00" }),
    version({ id: "3", build: "aaaaaaaaaaa1", publishedAt: "2026-11-21T21:32:00" }),
    version({ id: "2", build: "bbbbbbbbbbb2", publishedAt: "2026-11-21T20:00:00", note: "same build again" }),
    version({ id: "1", env: "production", build: "aaaaaaaaaaa1", publishedAt: "2026-11-20T12:00:00" }),
  ];
  const rows = versionRows(log, [{ env: "staging", build: "ccccccccccc3", since: null }, { env: "production", build: "aaaaaaaaaaa1", since: null }], "staging", new Date("2026-11-22T12:00:00"));

  it("marks what readers get now, per environment", () => {
    expect(rows.map(r => r.live)).toEqual([true, false, false, false, true]);
    expect(rows[0].when).toBe("today 10:13");
  });

  it("offers make live on the newest row of each older build of the own environment only", () => {
    expect(rows.map(r => r.canMakeLive)).toEqual([false, true, true, false, false]);
  });

  it("asks in the person's words", () => {
    expect(makeLiveQuestion(rows[1])).toBe("Make the version of today 07:53 live on staging again? Readers get it on their next start. The draft is not changed.");
  });
});

describe("the cards' arrow keys", () => {
  it("move by one and by a row, stay inside, start at the first", () => {
    expect(moveSelection(null, "ArrowRight", 5, 3)).toBe(0);
    expect(moveSelection(null, "End", 5, 3)).toBe(4);
    expect(moveSelection(0, "ArrowLeft", 5, 3)).toBe(0);
    expect(moveSelection(1, "ArrowRight", 5, 3)).toBe(2);
    expect(moveSelection(1, "ArrowDown", 5, 3)).toBe(4);
    expect(moveSelection(2, "ArrowDown", 5, 3)).toBe(2);
    expect(moveSelection(4, "ArrowUp", 5, 3)).toBe(1);
    expect(moveSelection(3, "Home", 5, 3)).toBe(0);
    expect(moveSelection(3, "Enter", 5, 3)).toBeNull();
    expect(moveSelection(null, "ArrowDown", 0, 3)).toBeNull();
  });
});

describe("a file the Import reads", () => {
  it("an export file is the import body it carries", () => {
    const file = readImportFile("osct.osct.json", JSON.stringify({
      format: "osct-export", formatVersion: 2, experience: "osct", title: "Onion", build: "abcabcabcabc", exportedAt: "2026-11-22T10:00:00Z",
      configuration: { experience: { id: "osct", title: "Onion" } }, files: { a: 1 }, assetsBase: "https://cdn/osct/abc",
      sources: [{ id: "tint", files: [{ name: "index.ts", text: "x" }, { name: "a.frag", text: "y" }, { name: 3 }] }, { id: 3 }],
    }));
    expect(file).toEqual({ kind: "export", configuration: { experience: { id: "osct", title: "Onion" } }, files: { a: 1 }, assetsBase: "https://cdn/osct/abc",
      sources: [{ id: "tint", files: [{ name: "index.ts", text: "x" }, { name: "a.frag", text: "y" }] }], of: { experience: "osct", title: "Onion", build: "abcabcabcabc", exportedAt: "2026-11-22T10:00:00Z" } });
  });

  it("an export file of format 1 (one source per plugin) brings it as its index.ts (#352)", () => {
    const file = readImportFile("old.osct.json", JSON.stringify({ format: "osct-export", formatVersion: 1, configuration: { experience: { id: "osct" } }, sources: [{ id: "tint", source: "x" }] }));
    expect(file.kind === "export" && file.sources).toEqual([{ id: "tint", files: [{ name: "index.ts", text: "x" }] }]);
  });

  it("a game configuration stays one; anything else says why", () => {
    expect(readImportFile("game.config.json", '{"experience":{"id":"demo"}}')).toEqual({ kind: "configuration", configuration: { experience: { id: "demo" } } });
    expect(() => readImportFile("x.json", "nope")).toThrow("x.json is not JSON.");
    expect(() => readImportFile("x.json", "[1]")).toThrow(/no export/);
    expect(() => readImportFile("x.json", '{"format":"osct-export","formatVersion":3,"configuration":{}}')).toThrow(/newer format/);
  });
});

describe("deleting an experience", () => {
  it("names what goes, leaving out the parts that are zero", () => {
    expect(deletionTakes({ scenes: 1, entries: 0, plugins: 0, files: 0, versions: 0, changes: 0 })).toEqual(["1 scene"]);
    expect(deletionTakes({ scenes: 12, entries: 40, plugins: 2, files: 1, versions: 3, changes: 120 })).toEqual([
      "12 scenes with 40 entries",
      "2 plugin sources",
      "the Library's records of 1 file",
      "the history (120 changes) – no undo brings it back",
      "the publish log (3 versions) – no make live afterwards",
    ]);
  });

  it("arms the button only for the exact id", () => {
    expect(deleteArmed("osct", "osct")).toBe(true);
    expect(deleteArmed("  osct ", "osct")).toBe(true);
    expect(deleteArmed("OSCT", "osct")).toBe(false);
    expect(deleteArmed("osc", "osct")).toBe(false);
    expect(deleteArmed("", "osct")).toBe(false);
  });
});

describe("the books beside the panels (#356)", () => {
  // A stage of 1000 × 600 px: the room inside a gap of 8
  const area = { x: 8, y: 8, w: 984, h: 584 };
  const view = (x: number, y: number, w: number, h: number, collapsed = false) => ({ rect: { x, y, w, h }, collapsed });

  it("keeps clear of a tall panel along the right side, by its width and a gap", () => {
    expect(shelfInsets([view(576, 8, 416, 584), view(8, 556, 264, 36, true)], area, 8, 192)).toEqual({ left: 0, right: 424 });
  });

  it("keeps clear of one along the left side too; a folded or short panel takes nothing", () => {
    expect(shelfInsets([view(8, 8, 300, 584)], area, 8, 192)).toEqual({ left: 308, right: 0 });
    expect(shelfInsets([view(576, 8, 416, 584, true), view(8, 400, 300, 192)], area, 8, 192)).toEqual({ left: 0, right: 0 });
  });

  it("lets the books reflow under the panels when too little room would be left", () => {
    expect(shelfInsets([view(8, 8, 450, 584), view(542, 8, 450, 584)], area, 8, 192)).toEqual({ left: 0, right: 0 });
  });
});
