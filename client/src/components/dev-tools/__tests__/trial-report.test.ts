import { describe, expect, it } from "vitest";
import { getSpreads } from "@/utils/game-config";
import { countResults, deviceLines, trialReport, trialResult, trialRows } from "../trial-report";
import type { TrialDevice } from "../trial-device";

const device: TrialDevice = {
  model: "iPhone 12 mini",
  tester: "VB",
  source: "screen-size guess: iPhone 12 mini / 13 mini / X / XS / 11 Pro",
  screen: "375×812 @3",
  os: "iOS 18.7 as Safari reports it – frozen: Safari 26 comes with iOS 26",
  language: "fr-FR",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Version/26.6.1 Mobile/15E148 Safari/604.1",
};

describe("trigger trial", () => {
  it("writes the device lines: the model as entered and its prefill source, screen, OS, language, tester", () => {
    expect(deviceLines(device)).toEqual([
      "- Device: iPhone 12 mini (tester) · screen-size guess: iPhone 12 mini / 13 mini / X / XS / 11 Pro",
      "- Screen: 375×812 @3",
      "- OS: iOS 18.7 as Safari reports it – frozen: Safari 26 comes with iOS 26",
      "- Language: fr-FR",
      "- Tester: VB",
      `- User agent: ${device.userAgent}`,
    ]);
    // Without initials there is no tester line
    expect(deviceLines({ ...device, tester: " " }).some(line => line.startsWith("- Tester"))).toBe(false);
  });

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
    const report = trialReport(rows, { bookTitle: "Test Book", appVersion: "1.6.2", contentHash: "abcdef1234567890", device, date: new Date("2026-10-27T12:00:00Z") });
    expect(report).toContain("# Trigger test – Test Book");
    expect(report).toContain("- Date: 2026-10-27 12:00 (UTC)");
    expect(report).toContain("- App 1.6.2 · content abcdef123456\n- Device: iPhone 12 mini (tester) · screen-size guess:");
    expect(report).toContain("- Screen: 375×812 @3\n- OS: iOS 18.7 as Safari reports it");
    expect(report).toContain("- Language: fr-FR\n- Tester: VB\n- User agent: Mozilla/5.0 (iPhone;");
    expect(report).toContain(`- Targets: ${rows.length} · found 2 · not found ${rows.length - 2}`);
    expect(report).toContain(`## Not found (${rows.length - 2})`);
    expect(report).toContain(`| ${c.id} |`);
    expect(report).toContain(String.raw`P9\|x.jpg · 30 × 20 mm | check |`);
    expect(report).toContain("## Found (2)");
    expect(report).toContain(`${a.id} (22:13)`); // 1700000000000 = 2023-11-14 22:13 UTC
  });
});
