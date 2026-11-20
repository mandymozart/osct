import { describe, expect, it } from "vitest";
import { getScenes } from "@/utils/game-config";
import { countResults, deviceLines, printedLine, printedPlace, trialReport, trialResult, trialRows } from "../trial-report";
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

  it("lists every target of the content once, with its entry and where it is printed (its place)", () => {
    const scenes = getScenes();
    const [first] = scenes.flatMap(s => s.targets);
    const rows = trialRows(scenes, { [first.id]: 1700000000000 });
    expect(rows.length).toBe(scenes.reduce((n, s) => n + s.targets.length, 0));
    expect(new Set(rows.map(r => r.targetId)).size).toBe(rows.length);
    const row = rows.find(r => r.targetId === first.id)!;
    expect(row).toMatchObject({ entryId: first.entryId, result: "found", unlockedAt: 1700000000000 });
    expect(row.title.length).toBeGreaterThan(0);
    expect(countResults(rows)).toEqual({ found: 1, untested: rows.length - 1 });
    // The fixture's cover seal carries its printed place on the cover (x 65, y 110, 100 mm wide)
    const seal = rows.find(r => r.entryId === "cover-seal")!;
    expect(seal.printed).toMatchObject({ x: 65, y: 110, width: 100 });
    expect(rows.filter(r => r.entryId !== "cover-seal" && r.printed === undefined).length).toBeGreaterThan(0);
  });

  it("names the surface and the third of it a place lies in", () => {
    const scene = { surfaces: [{ id: "spread", label: " 4–5 ", widthMm: 300, heightMm: 210, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] };
    expect(printedPlace({ place: { x: 10, y: 10, width: 40, height: 30 } }, scene)).toEqual({ surface: "4–5", x: 10, y: 10, width: 40, height: 30, position: "top left" });
    expect(printedPlace({ place: { x: 130, y: 90, width: 40, height: 30 } }, scene)?.position).toBe("middle centre");
    expect(printedPlace({ place: { surface: "spread", x: 250, y: 180, width: 40 } }, scene)).toMatchObject({ position: "bottom right" });
    expect(printedPlace({}, scene)).toBeUndefined();
    expect(printedLine({ imageSrc: "/assets/content/p4/target.jpg?v=1", printed: printedPlace({ place: { x: 10, y: 10, width: 40.25, height: 30 } }, scene) }))
      .toBe("target.jpg · 4–5 · 40.3 × 30 mm · top left (x 10, y 10 mm)");
    expect(printedLine({ imageSrc: "/assets/content/p4/target.jpg" })).toBe("target.jpg · not placed");
  });

  it("writes the report: counts, the targets not found with where they are printed, then the found", () => {
    const scenes = getScenes().map(scene => ({ ...scene, targets: scene.targets.map(target => ({ ...target })) }));
    const [a, b, c] = scenes.flatMap(s => s.targets);
    c.imageSrc = "/assets/content/P9|x.jpg";
    c.place = { x: 0, y: 0, width: 30, height: 20 };
    const rows = trialRows(scenes, { [a.id]: 1700000000000, [b.id]: 1700000060000 });
    const report = trialReport(rows, { experienceTitle: "Test Book", appVersion: "1.6.2", contentHash: "abcdef1234567890", device, date: new Date("2026-10-27T12:00:00Z") });
    expect(report).toContain("# Trigger test – Test Book");
    expect(report).toContain("- Date: 2026-10-27 12:00 (UTC)");
    expect(report).toContain("- App 1.6.2 · content abcdef123456\n- Device: iPhone 12 mini (tester) · screen-size guess:");
    expect(report).toContain("- Screen: 375×812 @3\n- OS: iOS 18.7 as Safari reports it");
    expect(report).toContain("- Language: fr-FR\n- Tester: VB\n- User agent: Mozilla/5.0 (iPhone;");
    expect(report).toContain(`- Targets: ${rows.length} · found 2 · not found ${rows.length - 2}`);
    expect(report).toContain(`## Not found (${rows.length - 2})`);
    expect(report).toContain(`| ${c.id} |`);
    expect(report).toContain(String.raw`| P9\|x.jpg · `);
    expect(report).toContain("· 30 × 20 mm · top left (x 0, y 0 mm) |");
    expect(report).toContain("## Found (2)");
    expect(report).toContain(`${a.id} (22:13)`); // 1700000000000 = 2023-11-14 22:13 UTC
  });
});
