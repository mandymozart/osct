import { describe, expect, it } from "vitest";
import { getMenuScenes, loopCopies, normalizeLoopScroll } from "../scene-switcher-loop";
import { sceneLabel } from "@engine/content/scenes";
import { getScenes } from "@/utils/game-config";

describe("scene menu loop", () => {
  it("lists only scenes with something to scan, in book order", () => {
    const expected = getScenes().filter(s => s.targets.length > 0).map(s => s.id);
    expect(getMenuScenes().map(s => s.id)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("shows a scene's label: a page range as written", () => {
    expect(sceneLabel({ id: "s020-021", label: "20–21" })).toBe("20–21");
    expect(sceneLabel({ id: "s001", label: "1" })).toBe("1");
  });

  it("shows the scene's label as it is (schema 3.0, #319): a cover, a wall – never page numbers", () => {
    expect(sceneLabel({ id: "cover", label: "Cover" })).toBe("Cover");
    expect(sceneLabel({ id: "studio", label: "Studio wall" })).toBe("Studio wall");
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
