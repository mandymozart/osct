import { describe, expect, it } from "vitest";
import { createProgressRecord, mergeProgress, PROGRESS_FORMAT, PROGRESS_READERS, readProgress } from "../progress-record";
import { ENTRY_CATEGORIES, ProgressRecord } from "@/types";

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
    expect(record).not.toHaveProperty("marked"); // unknown fields are dropped
  });

  it("reads an older format silently when nothing changes, and reports a conversion when something is dropped", () => {
    // Stand-in for an older format whose records have the current shape (its reader = the current one)
    const oldFormat = PROGRESS_FORMAT - 1;
    const realReader = PROGRESS_READERS[oldFormat];
    PROGRESS_READERS[oldFormat] = PROGRESS_READERS[PROGRESS_FORMAT];
    try {
      const stored = { format: oldFormat, bookId, appVersions: ["1.2.2"], unlocked: { a: 1 }, consulted: {}, lastSpreadId: "spread2", lastCategory: null, onboarded: true };
      expect(readProgress(stored, bookId)).toMatchObject({ status: "current", record: { ...stored, format: PROGRESS_FORMAT } });
      // A field the reader only adds as a default is no change
      const { onboarded: _, ...withoutFlag } = stored;
      expect(readProgress(withoutFlag, bookId).status).toBe("current");
      // Dropped or corrected fields are
      expect(readProgress({ ...stored, unlocked: { a: 1, b: "x" } }, bookId).status).toBe("converted");
      expect(readProgress({ ...stored, marked: { c: 3 } }, bookId).status).toBe("converted");
    } finally {
      if (realReader) PROGRESS_READERS[oldFormat] = realReader;
      else delete PROGRESS_READERS[oldFormat];
    }
  });

  it("reads records written before the onboarding flag existed as not onboarded", () => {
    expect(readProgress({ format: PROGRESS_FORMAT }, bookId).record.onboarded).toBe(false);
  });
});

describe("mergeProgress (account sync)", () => {
  const record = (changes: Partial<ProgressRecord>): ProgressRecord => ({ ...createProgressRecord(bookId), ...changes });

  it("keeps everything found or opened on either side, the first time wins", () => {
    const local = record({ unlocked: { a: 5, b: 2 }, consulted: { x: 3 }, appVersions: ["1.1.0", "1.2.0"] });
    const other = record({ unlocked: { a: 1, c: 4 }, consulted: { y: 7 }, appVersions: ["1.0.9", "1.1.0"] });
    expect(mergeProgress(local, other)).toMatchObject({
      unlocked: { a: 1, b: 2, c: 4 },
      consulted: { x: 3, y: 7 },
      appVersions: ["1.0.9", "1.1.0", "1.2.0"],
    });
  });

  it("this device's last spread and category win, the other's fill in; onboarded if either was", () => {
    expect(mergeProgress(record({ lastSpreadId: "s1" }), record({ lastSpreadId: "s2", lastCategory: ENTRY_CATEGORIES[0], onboarded: true })))
      .toMatchObject({ lastSpreadId: "s1", lastCategory: ENTRY_CATEGORIES[0], onboarded: true });
  });
});
