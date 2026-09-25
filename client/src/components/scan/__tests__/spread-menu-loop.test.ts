import { describe, expect, it } from "vitest";
import { formatPages, getMenuSpreads, loopCopies, normalizeLoopScroll } from "../spread-menu-loop";
import { getSpreads } from "@/utils/game-config";

describe("spread menu loop", () => {
  it("lists only spreads with something to scan, in book order", () => {
    const expected = getSpreads().filter(s => s.targets.length > 0).map(s => s.id);
    expect(getMenuSpreads().map(s => s.id)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("formats the page range with an en dash", () => {
    expect(formatPages({ firstPage: 20, lastPage: 21 })).toBe("20–21");
    expect(formatPages({ firstPage: 1, lastPage: 1 })).toBe("1");
  });

  it("renders an odd number of copies, enough to fill the viewport on both sides", () => {
    expect(loopCopies(216, 375)).toBe(7); // 3 per side + middle
    expect(loopCopies(2000, 375)).toBe(5);
    expect(loopCopies(0, 375)).toBe(1);
    expect(loopCopies(216, 375) % 2).toBe(1);
  });

  it("moves the item under the center into the middle copy, keeping its offset within the copy", () => {
    const viewport = 100; // center = scrollLeft + 50
    const width = 200;
    const copies = 5; // middle copy = 2 → 400..599
    expect(normalizeLoopScroll(400, viewport, width, copies)).toBe(400); // center 450: already middle
    expect(normalizeLoopScroll(0, viewport, width, copies)).toBe(400); // center 50 (copy 0) → 450
    expect(normalizeLoopScroll(900, viewport, width, copies)).toBe(500); // center 950 (copy 4) → 550
    expect(normalizeLoopScroll(560, viewport, width, copies)).toBe(360); // center 610 (copy 3) → 410
    expect(normalizeLoopScroll(50, viewport, width, 1)).toBe(50);
  });
});
