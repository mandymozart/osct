import { describe, expect, it } from "vitest";
import { numberedRows, TRIAL_WINDOW } from "../trial-panel";
import type { TrialRow } from "../trial-report";

const row = (targetId: string, printed: boolean | undefined): TrialRow => ({
  targetId, entryId: targetId, title: targetId, category: "glossary", page: Number(targetId.slice(1, 4)),
  spreadId: "s", spreadTitle: "s", imageSrc: "", result: "untested",
  ...(printed === undefined ? {} : { info: printed ? { width: 30, height: 20 } : { note: "not on the test printout" } }),
});

describe("trial strip", () => {
  it("orders by page, then the number on the page, and numbers only the printed targets", () => {
    const rows = [row("p038-2", true), row("p004-1", true), row("p030-2", false), row("p038-1", true), row("p030-1", true)];
    expect(numberedRows(rows).map(r => [r.targetId, r.number])).toEqual([
      ["p004-1", 1], ["p030-1", 2], ["p030-2", null], ["p038-1", 3], ["p038-2", 4],
    ]);
  });

  it("without printed-image details every target gets a number", () => {
    expect(numberedRows([row("p010-1", undefined), row("p002-1", undefined)]).map(r => r.number)).toEqual([1, 2]);
  });

  it("holds the neighbouring spreads while the trial is open", () => {
    expect(TRIAL_WINDOW).toBe(1);
  });
});
