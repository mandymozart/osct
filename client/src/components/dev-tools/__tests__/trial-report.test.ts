import { describe, expect, it } from "vitest";
import { getSpreads } from "@/utils/game-config";
import { countResults, trialReport, trialResult, trialRows } from "../trial-report";

describe("trigger trial", () => {
  it("found when the progress has the target unlocked, otherwise not found yet", () => {
    expect(trialResult(undefined)).toBe("untested");
    expect(trialResult(1000)).toBe("found");
  });

  it("lists every target of the content once, with its entry and printed-image info", () => {
    const spreads = getSpreads();
    const [first] = spreads.flatMap(s => s.targets);
    const rows = trialRows(spreads, { [first.id]: 1700000000000 }, { [first.id]: { source: "P1.jpg", width: 40, height: 20, position: "top left" } });
    expect(rows.length).toBe(spreads.reduce((n, s) => n + s.targets.length, 0));
    expect(new Set(rows.map(r => r.targetId)).size).toBe(rows.length);
    const row = rows.find(r => r.targetId === first.id)!;
    expect(row).toMatchObject({ entryId: first.entryId, result: "found", unlockedAt: 1700000000000, info: { source: "P1.jpg" } });
    expect(row.title.length).toBeGreaterThan(0);
    expect(countResults(rows)).toEqual({ found: 1, untested: rows.length - 1 });
  });

  it("writes the report: counts, the targets not found with their printed image, then the found", () => {
    const spreads = getSpreads();
    const [a, b, c] = spreads.flatMap(s => s.targets);
    const rows = trialRows(spreads, { [a.id]: 1700000000000, [b.id]: 1700000060000 }, { [c.id]: { source: "P9|x.jpg", width: 30, height: 20, note: "check" } });
    const report = trialReport(rows, { bookTitle: "Test Book", appVersion: "1.6.2", contentHash: "abcdef1234567890", device: "Phone", date: new Date("2026-10-27T12:00:00Z") });
    expect(report).toContain("# Trigger test – Test Book");
    expect(report).toContain("- Date: 2026-10-27 12:00 (UTC)");
    expect(report).toContain("- App 1.6.2 · content abcdef123456");
    expect(report).toContain(`- Targets: ${rows.length} · found 2 · not found ${rows.length - 2}`);
    expect(report).toContain(`## Not found (${rows.length - 2})`);
    expect(report).toContain(`| ${c.id} |`);
    expect(report).toContain(String.raw`P9\|x.jpg · 30 × 20 mm | check |`);
    expect(report).toContain("## Found (2)");
    expect(report).toContain(`${a.id} (22:13)`); // 1700000000000 = 2023-11-14 22:13 UTC
  });
});
