import { describe, expect, it } from "vitest";
import type { ImportComparison } from "../api";
import { comparisonRows, confirmLabel, editLabel, editsLine, importedLine, liveLine } from "../import-compare";

const comparison = (over: Partial<ImportComparison["draft"]> = {}, same = false): ImportComparison => ({
  book: { id: "osct", title: "Test Book" },
  incoming: { book: "osct", title: "Test Book", build: "cdcdcdcdcdcd", hash: "cd".repeat(32), date: "2026-10-30T08:00:00.000Z", appVersion: "1.42.0", schema: "2.17", source: "cdn", from: "https://cdn.example/staging/cdcdcdcdcdcd" },
  draft: {
    basedOn: { build: "abababababab", hash: "ab".repeat(32), date: "2026-10-01T08:00:00.000Z", appVersion: "1.30.0", schema: "2.17", source: "configuration", from: null, importedAt: "2026-10-02T09:00:00.000Z", importedBy: "author@example.com" },
    build: "0123456789ab",
    edits: 3,
    editsSince: "2026-10-02T09:00:00.000Z",
    recentEdits: [
      { kind: "entity", ref: "castle", user: "author@example.com", token: null, at: "2026-10-29T10:00:00.000Z" },
      { kind: "target", ref: "racoon", user: "author@example.com", token: "Claude", at: "2026-10-28T10:00:00.000Z" },
    ],
    live: [{ env: "staging", build: "aaaaaaaaaaaa", current: false }],
    ...over,
  },
  same,
});

// Before an import overwrites a draft: what comes in against what the draft is based on and its edits (#183)
describe("the import's version comparison", () => {
  it("lines up build, date, app and schema version – incoming against the draft's base, the differences marked", () => {
    const rows = comparisonRows(comparison());
    expect(rows.map(r => r.label)).toEqual(["Build", "Built", "App version", "Schema"]);
    expect(rows[0]).toEqual({ label: "Build", incoming: "cdcdcdcdcdcd", draft: "abababababab", differs: true });
    expect(rows[2]).toMatchObject({ incoming: "1.42.0", draft: "1.30.0", differs: true });
    expect(rows[3]).toMatchObject({ incoming: "2.17", draft: "2.17", differs: false });
  });

  it("a draft without a recorded import: dashes, and it says so", () => {
    const c = comparison({ basedOn: null, editsSince: null });
    expect(comparisonRows(c)[0].draft).toBe("–");
    expect(importedLine(c)).toBe("The draft's import was not recorded.");
    expect(editsLine(c)).toBe("3 edits in the change log – the import replaces them.");
  });

  it("names who imported the base, and the edits since that the import replaces", () => {
    const c = comparison();
    expect(importedLine(c)).toMatch(/^Imported .+ by author@example\.com\.$/);
    expect(editsLine(c)).toBe("3 edits since the import – the import replaces them.");
    expect(editsLine(comparison({ edits: 1 }))).toBe("1 edit since the import – the import replaces it.");
    expect(editsLine(comparison({ edits: 0 }))).toBe("No edits since the import – nothing of the draft's own is lost.");
    expect(editLabel(c.draft.recentEdits[0])).toMatch(/^entity castle · author@example\.com · /);
    expect(editLabel(c.draft.recentEdits[1])).toContain("author@example.com (AI: Claude)");
  });

  it("says whether the draft as it is now is published", () => {
    expect(liveLine(comparison())).toBe("The draft as it is now (build 0123456789ab) is not published – staging serves another build.");
    expect(liveLine(comparison({ live: [{ env: "local", build: "0123456789ab", current: true }] }))).toBe("The draft as it is now (build 0123456789ab) is live on local.");
    expect(liveLine(comparison({ live: [] }))).toBe("The draft as it is now (build 0123456789ab) is not published anywhere.");
  });

  it("the button says what confirming does", () => {
    expect(confirmLabel(comparison())).toBe("Replace the draft");
    expect(confirmLabel(comparison({ edits: 0 }, true))).toBe("Import again");
  });
});
