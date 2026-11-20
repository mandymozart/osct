import { describe, expect, it } from "vitest";
import type { EditorEntry } from "@shared/api/editor";
import { EntryCategory } from "@shared/types/entry";
import { draftOf, draftProblems, entryChanges, imageUrl, isDirty, tagsOf } from "../entry-edit";
import { experienceChanges, experienceDraftOf, experienceProblems, type ExperienceDraft } from "../experience-texts";

const { Glossary } = EntryCategory;
const entry = (fields: Partial<EditorEntry> & Pick<EditorEntry, "id" | "title">): EditorEntry => ({
  category: Glossary, scene: "scene-1", body: "", tags: [], target: null, ...fields,
});

/** #223: the entry's form – what it edits, what a save sends, what keeps Save off */
describe("the entry form", () => {
  const racoon = entry({ id: "racoon", title: "Racoon", body: "A beast.", author: "Kévin", tags: ["animal"], image: "/assets/content/entries/racoon/img.jpg" });

  it("starts from the entry and sends nothing while nothing changed", () => {
    const draft = draftOf(racoon);
    expect(draft).toEqual({ title: "Racoon", category: "glossary", scene: "scene-1", surface: "", author: "Kévin", tags: "animal", body: "A beast.", image: "/assets/content/entries/racoon/img.jpg", caption: "", media: "", imageLevels: [] });
    expect(entryChanges(racoon, draft)).toEqual({});
    expect(isDirty(racoon, { ...draft, tags: " animal, ", title: "Racoon " })).toBe(false);
  });

  it("sends only the fields that changed; an emptied optional field is removed", () => {
    const draft = { ...draftOf(racoon), body: "A **beast**.", author: " ", tags: "animal, mask, animal", scene: "scene-2", surface: "wall", media: " https://example.org " };
    expect(entryChanges(racoon, draft)).toEqual({ body: "A **beast**.", author: null, tags: ["animal", "mask"], scene: "scene-2", surface: "wall", media: "https://example.org" });
    // A surface emptied goes (the scene as a whole)
    expect(entryChanges({ ...racoon, surface: "wall" }, draftOf(racoon))).toEqual({ surface: null });
    expect(entryChanges(racoon, { ...draftOf(racoon), image: "" })).toEqual({ image: null });
    // #289: the caption under the picture – trimmed, emptied removes it
    expect(entryChanges(racoon, { ...draftOf(racoon), caption: " Image: a racoon " })).toEqual({ caption: "Image: a racoon" });
    expect(entryChanges({ ...racoon, caption: "Image: a racoon" }, { ...draftOf(racoon), caption: "" })).toEqual({ caption: null });
    expect(tagsOf(" a ,, b , a")).toEqual(["a", "b"]);
  });

  it("the picture's levels (#331): sent when they change, null when emptied, not without a picture", () => {
    const levels = [{ level: 512, src: "https://cdn/racoon-512.webp" }];
    expect(entryChanges(racoon, { ...draftOf(racoon), imageLevels: levels })).toEqual({ imageLevels: levels });
    expect(entryChanges({ ...racoon, imageLevels: levels }, { ...draftOf(racoon), imageLevels: [] })).toEqual({ imageLevels: null });
    expect(entryChanges({ ...racoon, imageLevels: levels }, { ...draftOf({ ...racoon, imageLevels: levels }), image: "", imageLevels: [] })).toEqual({ image: null });
  });

  it("keeps Save off with the API's reasons", () => {
    expect(draftProblems(draftOf(racoon))).toEqual([]);
    expect(draftProblems({ ...draftOf(racoon), title: " ", media: "javascript:alert(1)", category: "poem", scene: "" })).toEqual([
      "The title is empty.",
      "The category is none of glossary, video, text, link.",
      "The entry is on no scene.",
      "The link is no http(s) address.",
    ]);
    expect(draftProblems({ ...draftOf(racoon), caption: "x".repeat(501) })).toEqual(["The caption is longer than 500 characters."]);
    expect(draftProblems({ ...draftOf(racoon), tags: Array.from({ length: 33 }, (_, i) => `t${i}`).join(",") })).toEqual(["More than 32 tags."]);
  });

  it("shows a picture of the content below the experience's assets, an uploaded one as it is", () => {
    expect(imageUrl("/assets/content/a.jpg", "https://cdn.example/staging/abc/")).toBe("https://cdn.example/staging/abc/assets/content/a.jpg");
    expect(imageUrl("/assets/content/a.jpg", "")).toBe("/assets/content/a.jpg");
    expect(imageUrl("https://cdn.example/assets/x.jpg", "https://other.example")).toBe("https://cdn.example/assets/x.jpg");
  });
});

describe("the experience's texts", () => {
  const experience = { title: "Onion Skin", book: { author: "Kévin Bray", publisher: "Building Fictions" } };
  const draft = (over: Partial<ExperienceDraft> = {}): ExperienceDraft => ({ ...experienceDraftOf(experience), ...over });

  it("a printed book: only what changed, an emptied publisher removed, title and author needed", () => {
    expect(experienceChanges(experience, experienceDraftOf(experience))).toEqual({});
    expect(experienceChanges(experience, draft({ title: " Onion Skin & Crocodile Tears ", publisher: "" })))
      .toEqual({ title: "Onion Skin & Crocodile Tears", book: { publisher: null } });
    expect(experienceProblems({ title: "", book: true, author: " ", publisher: "" })).toEqual(["The title is empty.", "The printed book's author is empty."]);
  });

  it("no printed book: no author needed; switched on, the book goes whole; switched off, nothing about it is sent", () => {
    const wall = { title: "The Wall" };
    expect(experienceDraftOf(wall)).toEqual({ title: "The Wall", book: false, author: "", publisher: "" });
    expect(experienceProblems(experienceDraftOf(wall))).toEqual([]);
    expect(experienceChanges(wall, { title: "The Wall", book: true, author: " Ann ", publisher: "" })).toEqual({ book: { author: "Ann" } });
    expect(experienceChanges(wall, { title: "The Wall", book: true, author: "Ann", publisher: "Ink" })).toEqual({ book: { author: "Ann", publisher: "Ink" } });
    expect(experienceChanges(experience, draft({ book: false, author: "" }))).toEqual({});
  });
});
