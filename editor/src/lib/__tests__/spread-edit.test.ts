import { describe, expect, it } from "vitest";
import { canFollow, followBlockedBy, removeBlockedBy, type EditableSpread } from "../spread-edit";

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
