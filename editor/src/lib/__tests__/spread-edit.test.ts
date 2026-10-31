import { describe, expect, it } from "vitest";
import { canFollow, followBlockedBy, removeBlockedBy, type EditableSpread, canEditSpreads, creatableFormats, defaultAfter, newPagesAfter } from "../spread-edit";

const spread = (id: string, firstPage: number, lastPage: number, format?: string, entries: unknown[] = []): EditableSpread => ({ id, title: id, firstPage, lastPage, format, entries });

const book = [spread("cover", 0, 0, "cover"), spread("s1", 1, 2, undefined, [{}]), spread("s2", 3, 4), spread("s3", 5, 6, undefined, [{}, {}]), spread("back", 7, 7, "back")];

describe("spread editing on the book page (#166)", () => {
  it("adds a double page after any spread but the back cover", () => {
    expect(book.filter(canFollow).map(s => s.id)).toEqual(["cover", "s1", "s2", "s3"]);
  });

  it("says why a card's menu cannot add a double page after it (#196)", () => {
    expect(followBlockedBy(book[0])).toBeNull();
    expect(followBlockedBy(book[2])).toBeNull();
    expect(followBlockedBy(book[4])).toBe("Nothing follows the back cover.");
  });

  it("removes any spread but the one the book opens on – with entries too, after the confirmation (#198)", () => {
    expect(removeBlockedBy(book[2], "s1")).toBeNull();
    expect(removeBlockedBy(book[0], "s1")).toBeNull();
    expect(removeBlockedBy(book[1], "s9")).toBeNull();
    expect(removeBlockedBy(book[3], undefined)).toBeNull();
    expect(removeBlockedBy(book[2], "s2")).toBe("The book opens on this spread.");
  });
});

describe("print first or digital first; the creation step (#238)", () => {
  const book = [
    { id: "cover", title: "Cover", firstPage: 0, lastPage: 0, format: "cover", entries: [] },
    { id: "s1", title: "1–2", firstPage: 1, lastPage: 2, entries: [] },
    { id: "s2", title: "3–4", firstPage: 3, lastPage: 4, entries: [] },
    { id: "back", title: "Back", firstPage: 5, lastPage: 5, format: "back", entries: [] },
  ];

  it("only a digital-first book's spreads are added and removed – none is print", () => {
    expect(canEditSpreads({ sourceOfTruth: "digital" })).toBe(true);
    expect(canEditSpreads({ sourceOfTruth: "print" })).toBe(false);
    expect(canEditSpreads({})).toBe(false);
    expect(canEditSpreads(null)).toBe(false);
  });

  it("offers only the formats the book can still take", () => {
    expect(creatableFormats(book)).toEqual(["spread"]);
    expect(creatableFormats(book.slice(1, 3))).toEqual(["spread", "cover", "back"]);
    expect(creatableFormats(book.slice(0, 3))).toEqual(["spread", "back"]);
  });

  it("a double page goes after the chosen spread, else after the last before the back cover, and takes the next two pages", () => {
    expect(defaultAfter(book, "s1")).toBe("s1");
    expect(defaultAfter(book, "back")).toBe("s2");
    expect(defaultAfter(book)).toBe("s2");
    expect(defaultAfter([])).toBeNull();
    expect(newPagesAfter(book, "s1")).toEqual({ first: 3, last: 4 });
    expect(newPagesAfter(book, "cover")).toEqual({ first: 1, last: 2 });
    expect(newPagesAfter([], null)).toEqual({ first: 1, last: 2 });
  });
});
