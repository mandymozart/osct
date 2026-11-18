import { describe, expect, it } from "vitest";
import type { EditorEntry } from "@shared/api/editor";
import { EntryCategory } from "@shared/types/entry";
import { draftOf, draftProblems, entryChanges, imageUrl, isDirty, tagsOf } from "../entry-edit";
import { bookChanges, bookDraftOf, bookProblems } from "../book-texts";

const { Glossary } = EntryCategory;
const entry = (fields: Partial<EditorEntry> & Pick<EditorEntry, "id" | "title">): EditorEntry => ({
  category: Glossary, scene: "spread-1", body: "", tags: [], target: null, ...fields,
});

/** #223: the entry's form – what it edits, what a save sends, what keeps Save off */
describe("the entry form", () => {
  const racoon = entry({ id: "racoon", title: "Racoon", body: "A beast.", author: "Kévin", tags: ["animal"], image: "/assets/content/entries/racoon/img.jpg" });

  it("starts from the entry and sends nothing while nothing changed", () => {
    const draft = draftOf(racoon);
    expect(draft).toEqual({ title: "Racoon", category: "glossary", scene: "spread-1", surface: "", author: "Kévin", tags: "animal", body: "A beast.", image: "/assets/content/entries/racoon/img.jpg", caption: "", media: "" });
    expect(entryChanges(racoon, draft)).toEqual({});
    expect(isDirty(racoon, { ...draft, tags: " animal, ", title: "Racoon " })).toBe(false);
  });

  it("sends only the fields that changed; an emptied optional field is removed", () => {
    const draft = { ...draftOf(racoon), body: "A **beast**.", author: " ", tags: "animal, mask, animal", scene: "spread-2", surface: "wall", media: " https://example.org " };
    expect(entryChanges(racoon, draft)).toEqual({ body: "A **beast**.", author: null, tags: ["animal", "mask"], scene: "spread-2", surface: "wall", media: "https://example.org" });
    // A surface emptied goes (the scene as a whole)
    expect(entryChanges({ ...racoon, surface: "wall" }, draftOf(racoon))).toEqual({ surface: null });
    expect(entryChanges(racoon, { ...draftOf(racoon), image: "" })).toEqual({ image: null });
    // #289: the caption under the picture – trimmed, emptied removes it
    expect(entryChanges(racoon, { ...draftOf(racoon), caption: " Image: a racoon " })).toEqual({ caption: "Image: a racoon" });
    expect(entryChanges({ ...racoon, caption: "Image: a racoon" }, { ...draftOf(racoon), caption: "" })).toEqual({ caption: null });
    expect(tagsOf(" a ,, b , a")).toEqual(["a", "b"]);
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

  it("shows a picture of the content below the book's assets, an uploaded one as it is", () => {
    expect(imageUrl("/assets/content/a.jpg", "https://cdn.example/staging/abc/")).toBe("https://cdn.example/staging/abc/assets/content/a.jpg");
    expect(imageUrl("/assets/content/a.jpg", "")).toBe("/assets/content/a.jpg");
    expect(imageUrl("https://cdn.example/assets/x.jpg", "https://other.example")).toBe("https://cdn.example/assets/x.jpg");
  });
});

describe("the book's texts", () => {
  const book = { title: "Onion Skin", author: "Kévin Bray", publisher: "Building Fictions" };

  it("the book: only what changed, an emptied publisher removed, title and author needed", () => {
    expect(bookChanges(book, bookDraftOf(book))).toEqual({});
    expect(bookChanges(book, { title: " Onion Skin & Crocodile Tears ", author: "Kévin Bray", publisher: "" })).toEqual({ title: "Onion Skin & Crocodile Tears", publisher: null });
    expect(bookProblems({ title: "", author: " ", publisher: "" })).toEqual(["The title is empty.", "The author is empty."]);
  });
});
