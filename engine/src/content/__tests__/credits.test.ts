import { describe, expect, it } from "vitest";
import { assertGameConfiguration } from "@shared/guards/game-config";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";
import { getCredits, loadGameConfiguration } from "../game-config";

/** The book's credit lines (#292, schema 2.33), listed per spread on the reader's image credits page */

const golem = "Book Golem by TER-JAN / DeviantArt";
const carr = "Lindsey Carr, An Issue of Control, 2013. Available via DogStreets";
const kelly = "Gene Kelly dancing, 1944. Gjon Mili The LIFE Picture Collection/Shutterstock";

const book = (credits?: unknown) => ({
  version: { version: "1.82.0", timestamp: "2026-11-16T00:00:00.000Z", hash: "abc123", schema: CONTENT_SCHEMA_VERSION },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: [
    { id: "s1", title: "2–3", firstPage: 2, lastPage: 3 },
    { id: "s2", title: "4–5", firstPage: 4, lastPage: 5 },
    { id: "s3", title: "6–7", firstPage: 6, lastPage: 7 },
  ],
  entries: [
    { id: "golem", category: "glossary", title: "Golem", page: 3, body: "", tags: [], target: { id: "golem", imageSrc: "/assets/content/entries/golem/target.jpg" } },
    { id: "carr", category: "glossary", title: "Carr", page: 2, body: "", tags: [], image: "https://cdn.example/carr.jpg" },
    {
      id: "dance", category: "glossary", title: "Dance", page: 4, body: "", tags: [],
      target: { id: "dance", imageSrc: "/assets/content/entries/dance/target.jpg", entity: { ref: "film" } },
    },
    // The same picture again on the next spread, and a switched-off target: not in the reader's book
    { id: "golem2", category: "glossary", title: "Golem again", page: 5, body: "", tags: [], target: { id: "golem2", imageSrc: "/assets/content/entries/golem/target.jpg" } },
    { id: "off", category: "glossary", title: "Off", page: 6, body: "", tags: [], target: { id: "off", imageSrc: "/assets/content/entries/off/target.jpg", enabled: false } },
  ],
  entities: { film: { type: "video", assets: [{ id: "film", assetType: "video", src: "/assets/content/entities/film/film.mp4" }] } },
  ...(credits === undefined ? {} : { credits }),
});

const credits = {
  "/assets/content/entries/golem/target.jpg": golem,
  "https://cdn.example/carr.jpg": carr,
  "/assets/content/entities/film/film.mp4": kelly,
  "/assets/content/entries/off/target.jpg": "Switched off",
  "/assets/content/entries/golem/target.jpg.bak": "Another file",
};

describe("image credits", () => {
  it("lists the lines per spread, by page, of every file an entry uses – a shared entity's too", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book(credits) })).toBeNull();
    expect(getCredits().map(({ spread, lines }) => [spread.id, lines])).toEqual([
      ["s1", [carr, golem]],
      ["s2", [kelly, golem]],
    ]);
  });

  it("finds the lines below a content base as well", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book(credits), assetsBase: "https://cdn.example/b/v1" })).toBeNull();
    expect(getCredits()[0].lines).toEqual([carr, golem]);
  });

  it("none without credits", async () => {
    expect(await loadGameConfiguration({ bundled: async () => book() })).toBeNull();
    expect(getCredits()).toEqual([]);
  });

  it("the guard takes text lines only", () => {
    expect(() => assertGameConfiguration(book(credits))).not.toThrow();
    expect(() => assertGameConfiguration(book(["x"]))).toThrow(/credits: expected an object/);
    expect(() => assertGameConfiguration(book({ "a.jpg": 1 }))).toThrow(/credits\["a\.jpg"\]: expected a credit line/);
    expect(() => assertGameConfiguration(book({ "a.jpg": " " }))).toThrow(/credit line/);
  });
});
