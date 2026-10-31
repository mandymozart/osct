import { describe, expect, it } from "vitest";
import type { EditorEntry } from "@shared/api/editor";
import { EntryCategory } from "@shared/types/entry";
import { draftOf, draftProblems, entryChanges, filterCounts, filterEntries, groupEntries, imageUrl, isDirty, tagsOf } from "../entry-edit";
import { bookChanges, bookDraftOf, bookProblems, moveStep, newStep, stepDraftOf, stepsData, stepsDirty, stepsProblems, stepSummary } from "../book-texts";

const { Glossary, Text, Video } = EntryCategory;
const entry = (fields: Partial<EditorEntry> & Pick<EditorEntry, "id" | "title">): EditorEntry => ({
  category: Glossary, page: 2, body: "", tags: [], spreadId: "spread-1", target: null, ...fields,
});

/** #223: the entry's form – what it edits, what a save sends, what keeps Save off */
describe("the entry form", () => {
  const racoon = entry({ id: "racoon", title: "Racoon", body: "A beast.", author: "Kévin", tags: ["animal"], image: "/assets/content/entries/racoon/img.jpg" });

  it("starts from the entry and sends nothing while nothing changed", () => {
    const draft = draftOf(racoon);
    expect(draft).toEqual({ title: "Racoon", category: "glossary", page: 2, author: "Kévin", tags: "animal", body: "A beast.", image: "/assets/content/entries/racoon/img.jpg", media: "" });
    expect(entryChanges(racoon, draft)).toEqual({});
    expect(isDirty(racoon, { ...draft, tags: " animal, ", title: "Racoon " })).toBe(false);
  });

  it("sends only the fields that changed; an emptied optional field is removed", () => {
    const draft = { ...draftOf(racoon), body: "A **beast**.", author: " ", tags: "animal, mask, animal", page: 5, media: " https://example.org " };
    expect(entryChanges(racoon, draft)).toEqual({ body: "A **beast**.", author: null, tags: ["animal", "mask"], page: 5, media: "https://example.org" });
    expect(entryChanges(racoon, { ...draftOf(racoon), image: "" })).toEqual({ image: null });
    expect(tagsOf(" a ,, b , a")).toEqual(["a", "b"]);
  });

  it("keeps Save off with the API's reasons", () => {
    expect(draftProblems(draftOf(racoon))).toEqual([]);
    expect(draftProblems({ ...draftOf(racoon), title: " ", media: "javascript:alert(1)", category: "poem", page: 1.5 })).toEqual([
      "The title is empty.",
      "The category is none of glossary, video, text, link.",
      "The access page is no whole number.",
      "The link is no http(s) address.",
    ]);
    expect(draftProblems({ ...draftOf(racoon), tags: Array.from({ length: 33 }, (_, i) => `t${i}`).join(",") })).toEqual(["More than 32 tags."]);
  });

  it("shows a picture of the content below the book's assets, an uploaded one as it is", () => {
    expect(imageUrl("/assets/content/a.jpg", "https://cdn.example/staging/abc/")).toBe("https://cdn.example/staging/abc/assets/content/a.jpg");
    expect(imageUrl("/assets/content/a.jpg", "")).toBe("/assets/content/a.jpg");
    expect(imageUrl("https://cdn.example/assets/x.jpg", "https://other.example")).toBe("https://cdn.example/assets/x.jpg");
  });
});

describe("the Entries page", () => {
  const list = [
    entry({ id: "e", title: "Écaille", body: "Scale of a fish." }),
    entry({ id: "z", title: "zebra", tags: ["stripes"] }),
    entry({ id: "a", title: "Apple", author: "Kévin" }),
    entry({ id: "four", title: "4th wall" }),
    entry({ id: "t", title: "A text", category: Text, page: 9, body: "Onion skin" }),
    entry({ id: "v", title: "Video", category: Video, page: 3 }),
  ];

  it("filters by category and searches title, text, author, tags and id – accents and case folded", () => {
    expect(filterEntries(list, Text, "").map(e => e.id)).toEqual(["t"]);
    expect(filterEntries(list, "all", "ecaille").map(e => e.id)).toEqual(["e"]);
    expect(filterEntries(list, "all", "STRIPES").map(e => e.id)).toEqual(["z"]);
    expect(filterEntries(list, "all", "kevin").map(e => e.id)).toEqual(["a"]);
    expect(filterEntries(list, "all", "onion skin").map(e => e.id)).toEqual(["t"]);
    expect(filterEntries(list, Glossary, "onion")).toEqual([]);
    expect(filterCounts(list)).toEqual({ all: 6, glossary: 4, video: 1, text: 1, link: 0 });
  });

  it("groups the glossary by first letter as the reader does – no letter first, an accent folded", () => {
    const groups = groupEntries(filterEntries(list, Glossary, ""), Glossary);
    expect(groups.map(g => [g.letter, g.entries.map(e => e.id)])).toEqual([[null, ["four"]], ["A", ["a"]], ["E", ["e"]], ["Z", ["z"]]]);
  });

  it("lists every other filter in the order of the pages", () => {
    expect(groupEntries(filterEntries(list, "all", ""), "all")[0].entries.map(e => e.id)).toEqual(["four", "a", "e", "z", "v", "t"]);
    expect(groupEntries([], Text)).toEqual([]);
  });
});

describe("the book's texts and the onboarding", () => {
  const book = { title: "Onion Skin", author: "Kévin Bray", publisher: "Building Fictions" };

  it("the book: only what changed, an emptied publisher removed, title and author needed", () => {
    expect(bookChanges(book, bookDraftOf(book))).toEqual({});
    expect(bookChanges(book, { title: " Onion Skin & Crocodile Tears ", author: "Kévin Bray", publisher: "" })).toEqual({ title: "Onion Skin & Crocodile Tears", publisher: null });
    expect(bookProblems({ title: "", author: " ", publisher: "" })).toEqual(["The title is empty.", "The author is empty."]);
  });

  const steps = [
    { id: "splash", index: 0, title: "{{title}}", advance: 3800, stagger: 500 },
    { id: "camera", index: 1, description: "Grant access.", button: "Grant access", action: "camera" as const },
  ];

  it("the steps: the list's order is the index, empty texts and default times left out", () => {
    const drafts = steps.map(stepDraftOf);
    expect(stepsData(drafts)).toEqual(steps);
    expect(stepsDirty(steps, drafts)).toBe(false);
    const moved = moveStep(drafts, 1, -1);
    expect(stepsData(moved).map(s => [s.id, s.index])).toEqual([["camera", 0], ["splash", 1]]);
    expect(stepsDirty(steps, moved)).toBe(true);
    expect(moveStep(drafts, 0, -1)).toEqual(drafts);
    const cleared = [{ ...drafts[0], title: " ", advance: null }, { ...drafts[1], button: "" }];
    expect(stepsData(cleared)).toEqual([{ id: "splash", index: 0, stagger: 500 }, { id: "camera", index: 1, description: "Grant access." }]);
  });

  it("a new step gets a free id; problems keep Save off", () => {
    const drafts = steps.map(stepDraftOf);
    expect(newStep([...drafts, { ...drafts[0], id: "step-3" }]).id).toBe("step-4");
    expect(stepsProblems(drafts)).toEqual([]);
    expect(stepsProblems([{ ...drafts[0], id: "camera" }, { ...drafts[1], button: "" }, { ...drafts[0], id: "a b", fadeIn: -1 }])).toEqual([
      "Step 2: the id camera is used twice.",
      "Step 2: the action camera needs a button.",
      "Step 3: the id is 1–64 letters, digits, _ or -.",
      "Step 3: fadeIn is 0 to 600000 ms.",
    ]);
  });

  it("a closed step says what it shows and what moves it on", () => {
    const [splash, camera] = steps.map(stepDraftOf);
    expect(stepSummary(splash)).toBe("{{title}} · on after 3800 ms");
    expect(stepSummary(camera)).toBe("Grant access. · Grant access → camera");
    expect(stepSummary({ ...splash, advance: null, title: "" })).toBe("on by a tap");
  });
});
