import { describe, expect, it } from "vitest";
import { createProgressRecord, PROGRESS_FORMAT, PROGRESS_READERS, readProgress } from "../progress-record";

const bookId = "book";

describe("progress record", () => {
  it("creates an empty record of the current format", () => {
    expect(createProgressRecord(bookId)).toMatchObject({ format: PROGRESS_FORMAT, bookId, unlocked: {}, onboarded: false });
  });

  it("has a reader for the current format (add one per format on a MAJOR bump)", () => {
    expect(PROGRESS_READERS[PROGRESS_FORMAT]).toBeTypeOf("function");
  });

  it("treats missing, unknown or newer formats as unreadable", () => {
    expect(readProgress(undefined, bookId).status).toBe("unreadable");
    expect(readProgress({ format: PROGRESS_FORMAT + 1 }, bookId).status).toBe("unreadable");
  });

  it("drops malformed fields of a stored record", () => {
    const { record } = readProgress(
      { format: PROGRESS_FORMAT, unlocked: { a: 1, b: "x" }, lastCategory: "nope", marked: { c: 3 } },
      bookId,
    );
    expect(record).toMatchObject({ unlocked: { a: 1 }, lastCategory: null });
    expect(record).not.toHaveProperty("marked"); // bookmarks were removed (2026-09-25)
  });

  it("reads records written before the onboarding flag existed as not onboarded", () => {
    expect(readProgress({ format: PROGRESS_FORMAT }, bookId).record.onboarded).toBe(false);
  });
});
