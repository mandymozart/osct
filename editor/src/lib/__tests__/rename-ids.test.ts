import { describe, expect, it } from "vitest";
import type { RenameIdsReport } from "../api.js";
import { canApply, reportLines } from "../rename-ids.js";

const report = (over: Partial<RenameIdsReport> = {}): RenameIdsReport => ({
  apply: false,
  experiences: [
    { experience: "osct", ids: 2, samples: [{ from: "s004-005", to: "s4-5" }], rows: { scenes: 1, entries: 3 }, collisions: [], applied: false },
    { experience: "demo", ids: 0, samples: [], rows: {}, collisions: [], applied: false },
  ],
  plugins: [],
  refused: 0,
  ...over,
});

describe("rename ids (#63)", () => {
  it("offers Apply only after a dry run with ids to rename and no collision", () => {
    expect(canApply(null)).toBe(false);
    expect(canApply(report())).toBe(true);
    expect(canApply(report({ refused: 1 }))).toBe(false);
    expect(canApply(report({ apply: true }))).toBe(false);
    expect(canApply(report({ experiences: [report().experiences[1]] }))).toBe(false);
  });

  it("says per experience what changes", () => {
    expect(reportLines(report())).toEqual(["osct: 2 ids – scenes 1, entries 3", "demo: nothing to do"]);
    const applied = report({ apply: true, experiences: [{ ...report().experiences[0], ids: 1, applied: true }] });
    expect(reportLines(applied)).toEqual(["osct: 1 id – scenes 1, entries 3 (renamed)"]);
  });
});
