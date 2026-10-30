import { describe, expect, it } from "vitest";
import { canFollow, followBlockedBy, isAddRefused, pagesOfSpread, removeBlockedBy, removeQuestion, type EditableSpread } from "../spread-edit";
import { ApiError } from "../api";

const spread = (id: string, firstPage: number, lastPage: number, format?: string, entries: unknown[] = []): EditableSpread => ({ id, title: id, firstPage, lastPage, format, entries });

const book = [spread("cover", 0, 0, "cover"), spread("s1", 1, 2, undefined, [{}]), spread("s2", 3, 4), spread("s3", 5, 6, undefined, [{}, {}]), spread("back", 7, 7, "back")];

describe("spread editing on the book page (#166)", () => {
  it("adds a double page after any spread but the back cover", () => {
    expect(book.filter(canFollow).map(s => s.id)).toEqual(["cover", "s1", "s2", "s3"]);
  });

  it("says why a card's menu cannot add a double page after it (#196)", () => {
    expect(followBlockedBy(book[0])).toBeNull();
    expect(followBlockedBy(book[4])).toBe("Nothing follows the back cover.");
    expect(followBlockedBy(book[2], true)).toBe("New spreads come in with an import for now.");
  });

  it("removes only an empty spread the book does not open on", () => {
    expect(removeBlockedBy(book[2], "s1")).toBeNull();
    expect(removeBlockedBy(book[0], "s1")).toBeNull();
    expect(removeBlockedBy(book[2], "s2")).toBe("The book opens on this spread.");
    expect(removeBlockedBy(book[1], "s9")).toBe("It has an entry – delete it first.");
    expect(removeBlockedBy(book[3], undefined)).toBe("It has 2 entries – delete them first.");
  });

  it("knows the pages that go with a spread – none for a cover", () => {
    expect(book.map(pagesOfSpread)).toEqual([0, 2, 2, 2, 0]);
  });

  it("asks before removing, saying what happens to the later pages", () => {
    expect(removeQuestion(book[2], book)).toBe("Remove the spread “s2” (pages 3–4)? The pages after it are numbered back by 2.");
    expect(removeQuestion(book[4], book)).toBe("Remove the back cover?");
    expect(removeQuestion(book[0], book)).toBe("Remove the cover?");
    expect(removeQuestion(spread("last", 9, 10), [spread("last", 9, 10)])).toBe("Remove the spread “last” (pages 9–10)?");
  });

  it("tells an API that knows only the covers from other errors", () => {
    expect(isAddRefused(new ApiError(400, "invalid-spread", "format must be cover or back."))).toBe(true);
    expect(isAddRefused(new ApiError(400, "invalid-spread", "Nothing comes after the back cover."))).toBe(false);
    expect(isAddRefused(new ApiError(409, "duplicate-id", "A spread exists."))).toBe(false);
    expect(isAddRefused(null)).toBe(false);
  });
});
