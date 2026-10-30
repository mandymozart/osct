import { describe, expect, it } from "vitest";
import {
  backToBooks, draftPasses, editInEffect, effectivePasses, levelLine, ownPasses, passesHeading, passesSource, pendingSaves, saveLabel, spreadsOnBooks,
} from "../passes-edit";

const BOOK = [{ type: "grade", reach: "all", exposure: 0.5 }, { type: "vignette" }];

// The post-processing panel: the book's passes are the master, a spread's own list overrides them
describe("the book's passes and a spread's override", () => {
  it("a spread without a list of its own uses the book's", () => {
    const draft = draftPasses(BOOK, undefined);
    expect(passesSource(draft)).toBe("book");
    expect(effectivePasses(draft)).toEqual(BOOK);
    expect(passesHeading(draft)).toBe("post-processing · the whole book");
    expect(passesHeading(draftPasses(null, undefined))).toBe("post-processing · the whole book · none");
  });

  it("starts from copies – the loaded content is never edited", () => {
    const draft = draftPasses(BOOK, undefined);
    expect(draft.book).not.toBe(BOOK);
    expect(draft.book[0]).not.toBe(BOOK[0]);
  });

  it("own passes for this spread start as a copy of the book's", () => {
    const own = ownPasses(draftPasses(BOOK, undefined));
    expect(passesSource(own)).toBe("spread");
    expect(own.own).toEqual(BOOK);
    expect(own.own![0]).not.toBe(own.book[0]);
    expect(passesHeading(own)).toBe("post-processing · only this spread");
    expect(passesHeading({ ...own, own: [] })).toBe("post-processing · only this spread · off");
  });

  it("editing changes the list in effect: the book's while the spread uses them, else the spread's own", () => {
    const usesBook = editInEffect(draftPasses(BOOK, undefined), list => [...list, { type: "bloom" }]);
    expect(usesBook.book.map(p => p.type)).toEqual(["grade", "vignette", "bloom"]);
    expect(usesBook.own).toBeNull();
    const own = editInEffect(ownPasses(draftPasses(BOOK, undefined)), list => list.slice(1));
    expect(own.own!.map(p => p.type)).toEqual(["vignette"]);
    expect(own.book).toEqual(BOOK);
  });

  it("back to the book's drops the override", () => {
    const back = backToBooks(draftPasses(BOOK, [{ type: "bloom" }]));
    expect(back.own).toBeNull();
    expect(effectivePasses(back)).toEqual(BOOK);
  });

  it("Save writes only what changed", () => {
    const saved = draftPasses(BOOK, undefined);
    expect(pendingSaves(saved, saved)).toEqual({});
    expect(pendingSaves(ownPasses(saved), saved)).toEqual({ spread: BOOK });
    const bookEdited = editInEffect(saved, list => [...list, { type: "bloom" }]);
    expect(pendingSaves(bookEdited, saved)).toEqual({ book: [...BOOK, { type: "bloom" }] });
    // An empty book list removes the field; the spread back to the book's sends null
    expect(pendingSaves(editInEffect(saved, () => []), saved)).toEqual({ book: null });
    const withOwn = draftPasses(BOOK, [{ type: "bloom" }]);
    expect(pendingSaves(backToBooks(withOwn), withOwn)).toEqual({ spread: null });
    // An empty list of its own is kept: post-processing off for this spread
    expect(pendingSaves(editInEffect(withOwn, () => []), withOwn)).toEqual({ spread: [] });
  });
});

// The level at a glance (#181): what editing changes, and what Save saves
describe("the level in words", () => {
  const SPREADS = [{ id: "a" }, { id: "b", passes: [{ type: "bloom" }] }, { id: "c", passes: null }, { id: "d", passes: [] }];

  it("counts the spreads that use the book's – an empty list of its own is an override too", () => {
    expect(spreadsOnBooks(SPREADS, "a", null)).toBe(2);
    expect(spreadsOnBooks([], "a", null)).toBe(0);
  });

  it("counts the spread on the stage as the panel holds it, saved or not", () => {
    expect(spreadsOnBooks(SPREADS, "a", [])).toBe(1);
    expect(spreadsOnBooks(SPREADS, "b", null)).toBe(3);
  });

  it("says what editing the list changes", () => {
    const book = draftPasses(BOOK, undefined);
    expect(levelLine(book, 4)).toBe("changes all 4 spreads that use the book's");
    expect(levelLine(book, 1)).toBe("changes the 1 spread that uses the book's");
    expect(levelLine(ownPasses(book), 4)).toBe("overrides the book's for this spread");
  });

  it("Save says what it saves", () => {
    expect(saveLabel({ book: [] })).toBe("Save for the whole book");
    expect(saveLabel({ spread: null })).toBe("Save for this spread");
    expect(saveLabel({ book: null, spread: [] })).toBe("Save for the book and this spread");
  });
});
