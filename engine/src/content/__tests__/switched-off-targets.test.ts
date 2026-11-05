import { describe, expect, it } from "vitest";
import { assertGameConfiguration } from "@shared/guards/game-config";
import { CONTENT_SCHEMA_VERSION, isEntryInBook, isTargetEnabled } from "@shared/types/game-config";
import { getEntries, getEntry, getSpread, getTarget, getTargets, loadGameConfiguration } from "../game-config";

/**
 * A target switched off (`enabled: false`, #249) is not in the reader's book – neither the image target nor its entry –
 * but stays in the content with its values; the editor loads it to work on it (`keepSwitchedOffTargets`).
 */

const book = (enabled?: unknown) => ({
  version: { version: "1.64.0", timestamp: "2026-11-05T00:00:00.000Z", hash: "abc123", schema: CONTENT_SCHEMA_VERSION },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
  entries: [
    { id: "on", category: "glossary", title: "On", page: 1, body: "", tags: [], target: { id: "on", imageSrc: "/assets/content/entries/on/target.jpg" } },
    {
      id: "off", category: "glossary", title: "Off", page: 2, body: "", tags: [],
      target: { id: "off", imageSrc: "/assets/content/entries/off/target.jpg", ...(enabled === undefined ? {} : { enabled }) },
    },
    { id: "text", category: "text", title: "Text", page: 2, body: "", tags: [] },
  ],
  entities: {},
});

describe("switched-off targets", () => {
  it("the reader leaves a switched-off target and its entry out", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book(false) })).toBeNull();
    expect(getEntries().map(e => e.id)).toEqual(["on", "text"]);
    expect(getTargets("s1").map(t => t.id)).toEqual(["on"]);
    expect(getTarget("off")).toBeUndefined();
    expect(getEntry("off")).toBeUndefined();
    expect(getSpread("s1")?.entries.map(e => e.id)).toEqual(["on", "text"]);
  });

  it("the editor keeps it, with its entry", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book(false), keepSwitchedOffTargets: true })).toBeNull();
    expect(getEntries().map(e => e.id)).toEqual(["on", "off", "text"]);
    expect(getTarget("off")).toMatchObject({ id: "off", enabled: false, entryId: "off" });
  });

  it("on is the default: none and true are in the book", async () => {
    for (const enabled of [undefined, true]) {
      expect(await loadGameConfiguration({ bundled: async () => book(enabled) })).toBeNull();
      expect(getTargets("s1").map(t => t.id)).toEqual(["on", "off"]);
    }
  });

  it("the guard refuses anything but true or false", () => {
    expect(() => assertGameConfiguration(book(false))).not.toThrow();
    expect(() => assertGameConfiguration(book("off"))).toThrow(/entries\[1\]\.target\.enabled/);
  });

  it("the helpers: only `enabled: false` switches off; an entry without a target is in the book", () => {
    expect(isTargetEnabled({})).toBe(true);
    expect(isTargetEnabled({ enabled: true })).toBe(true);
    expect(isTargetEnabled({ enabled: false })).toBe(false);
    expect(isEntryInBook({})).toBe(true);
    expect(isEntryInBook({ target: { id: "t", imageSrc: "x", enabled: false } })).toBe(false);
  });
});
