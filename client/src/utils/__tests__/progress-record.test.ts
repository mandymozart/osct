import { describe, expect, it } from "vitest";
import { createProgressRecord, mergeProgress, PROGRESS_FORMAT, PROGRESS_READERS, readProgress } from "../progress-record";
import { ENTRY_CATEGORIES, type ProgressRecord } from "@/types";

const experienceId = "osct";

describe("progress record", () => {
  it("creates an empty record of the current format", () => {
    expect(createProgressRecord(experienceId)).toMatchObject({ format: PROGRESS_FORMAT, experienceId, unlocked: {}, onboarded: false });
  });

  it("has a reader for the current format (add one per format on a MAJOR bump)", () => {
    expect(PROGRESS_READERS[PROGRESS_FORMAT]).toBeTypeOf("function");
  });

  it("treats missing, unknown or newer formats as unreadable", () => {
    expect(readProgress(undefined, experienceId).status).toBe("unreadable");
    expect(readProgress({ format: PROGRESS_FORMAT + 1 }, experienceId).status).toBe("unreadable");
  });

  it("drops malformed fields of a stored record", () => {
    const { record } = readProgress(
      { format: PROGRESS_FORMAT, unlocked: { a: 1, b: "x" }, lastCategory: "nope", marked: { c: 3 } },
      experienceId,
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
      const stored = { format: oldFormat, experienceId, appVersions: ["1.2.2"], unlocked: { a: 1 }, consulted: {}, lastScene: "scene2", lastCategory: null, onboarded: true };
      expect(readProgress(stored, experienceId)).toMatchObject({ status: "current", record: { ...stored, format: PROGRESS_FORMAT } });
      // A field the reader only adds as a default is no change
      const { onboarded: _, ...withoutFlag } = stored;
      expect(readProgress(withoutFlag, experienceId).status).toBe("current");
      // Dropped or corrected fields are
      expect(readProgress({ ...stored, unlocked: { a: 1, b: "x" } }, experienceId).status).toBe("converted");
      expect(readProgress({ ...stored, marked: { c: 3 } }, experienceId).status).toBe("converted");
      // The last spread of the 2.x content (#319) is dropped, not converted – the reader starts on the first scene
      const { lastScene: __, ...before3 } = stored;
      expect(readProgress({ ...before3, lastSpreadId: "spread2" }, experienceId).record.lastScene).toBeNull();
    } finally {
      if (realReader) PROGRESS_READERS[oldFormat] = realReader;
      else delete PROGRESS_READERS[oldFormat];
    }
  });

  it("reads a format-2 record with its bookId (#320): the id kept as experienceId, no conversion notice", () => {
    const stored = { format: 2, bookId: "osct", appVersions: ["2.1.0"], unlocked: { a: 1 }, consulted: {}, lastScene: "s1", lastCategory: null, onboarded: true, coached: false, variables: { hasKey: true } };
    const { record, status } = readProgress(stored, "osct");
    expect(status).toBe("current");
    expect(record).toMatchObject({ experienceId: "osct", unlocked: { a: 1 }, variables: { hasKey: true } });
    expect(record).not.toHaveProperty("bookId");
  });

  it("reads records written before the onboarding flag existed as not onboarded", () => {
    expect(readProgress({ format: PROGRESS_FORMAT }, experienceId).record.onboarded).toBe(false);
  });

  it("reads records without the coach-marks flag as not coached, and keeps it when set – additive within format 1 (#282)", () => {
    expect(readProgress({ format: PROGRESS_FORMAT }, experienceId).record.coached).toBe(false);
    const { record, status } = readProgress({ format: PROGRESS_FORMAT, coached: true }, experienceId);
    expect(record.coached).toBe(true);
    expect(status).toBe("current");
  });

  it("keeps the plugins' experience variables (scalars) and reads records without them as empty – additive within format 1", () => {
    expect(readProgress({ format: PROGRESS_FORMAT }, experienceId).record.variables).toEqual({});
    const { record, status } = readProgress({ format: PROGRESS_FORMAT, variables: { hasKey: true, chapter: 2, name: "x", bad: { a: 1 } } }, experienceId);
    expect(record.variables).toEqual({ hasKey: true, chapter: 2, name: "x" });
    expect(status).toBe("current");
  });
});

describe("mergeProgress (account sync)", () => {
  const record = (changes: Partial<ProgressRecord>): ProgressRecord => ({ ...createProgressRecord(experienceId), ...changes });

  it("keeps everything found or opened on either side, the first time wins", () => {
    const local = record({ unlocked: { a: 5, b: 2 }, consulted: { x: 3 }, appVersions: ["1.1.0", "1.2.0"] });
    const other = record({ unlocked: { a: 1, c: 4 }, consulted: { y: 7 }, appVersions: ["1.0.9", "1.1.0"] });
    expect(mergeProgress(local, other)).toMatchObject({
      unlocked: { a: 1, b: 2, c: 4 },
      consulted: { x: 3, y: 7 },
      appVersions: ["1.0.9", "1.1.0", "1.2.0"],
    });
  });

  it("this device's variables win, the other's fill in", () => {
    expect(mergeProgress(record({ variables: { hasKey: true } }), record({ variables: { hasKey: false, chapter: 3 } })).variables)
      .toEqual({ hasKey: true, chapter: 3 });
  });

  it("this device's last scene and category win, the other's fill in; onboarded and coached if either was", () => {
    expect(mergeProgress(record({ lastScene: "s1" }), record({ lastScene: "s2", lastCategory: ENTRY_CATEGORIES[0], onboarded: true, coached: true })))
      .toMatchObject({ lastScene: "s1", lastCategory: ENTRY_CATEGORIES[0], onboarded: true, coached: true });
  });
});
