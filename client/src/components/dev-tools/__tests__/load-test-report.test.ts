import { describe, expect, it } from "vitest";
import type { LoadTestResult } from "@engine/utils/tracker-debug";
import { findLabel, loadTestCells, loadTestReport } from "../load-test-report";

const result = (change: Partial<LoadTestResult>): LoadTestResult => ({
  extra: 0, spreadId: "s010-011", loaded: 2, spreads: 1, prepareMs: 0, extractMs: 0, engineFps: 29.84, pageFps: 59.5, longFrames: 0,
  foundShare: 0.975, lost: 0, findMs: [], misses: 0, heapMb: 42.4, ...change,
});

describe("engine load test report", () => {
  it("formats a step as table cells", () => {
    const cells = loadTestCells(result({ extra: 20, loaded: 22, spreads: 14, prepareMs: 3450, extractMs: 1520, findMs: [600, 400, 900], misses: 1 }));
    expect(cells).toEqual(["22 (+20)", "14", "s010-011", "3.5", "1.5", "29.8", "59.5", "0", "98 %", "0", "600 / 900", "1", "42"]);
    expect(findLabel(result({}))).toBe("–");
    expect(loadTestCells(result({ heapMb: null })).at(-1)).toBe("–");
  });

  it("writes the header and one row per step", () => {
    const report = loadTestReport([result({}), result({ extra: 5, loaded: 7, spreads: 4 })], {
      bookTitle: "Test Book", appVersion: "1.6.1", contentHash: "abcdef1234567890", device: "Phone",
      date: new Date("2026-10-27T12:00:00Z"), spreadId: "s010-011", spreadTargets: 2, options: { steadyMs: 6000, covers: 2 },
    });
    expect(report).toContain("# Engine load test – Test Book");
    expect(report).toContain("- Date: 2026-10-27 12:00 (UTC)");
    expect(report).toContain("- Started on s010-011 · 6.0 s measured per step · 2 lens covers per step");
    expect(report).toContain("| 2 (+0) | 1 | s010-011 |");
    expect(report).toContain("| 7 (+5) | 4 | s010-011 |");
    expect(report.split("\n").filter(line => line.startsWith("| ")).length).toBe(3);
  });
});
