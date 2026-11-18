import { describe, expect, it } from "vitest";
import type { SurfaceData } from "@shared/types/game-config";
import {
  addSurface, choiceOf, CUSTOM_MM, liesOn, moveSurface, moveSurfaceTo, newSurfaceId, onSurface, pageSizeOf, placeOnChoice, presetSurface, removalWarning,
  removeSurface, sameSurfaces, surfaceChoices, surfaceName, updateSurface, WALL_MM,
} from "../surface-edit";

/** #314: a scene's surfaces – add from a preset, remove, reorder, change one, what lies on one, the placement's choices */

const page = { width: 230, height: 320 };
const double: SurfaceData[] = [
  { id: "left", side: "left", widthMm: 230, heightMm: 320, label: "40" },
  { id: "right", side: "right", widthMm: 230, heightMm: 320, label: "41" },
];

describe("a new surface from a preset", () => {
  it("a page: the left one first, then the right, then a middle – the book's page size", () => {
    expect(presetSurface("page", [], { page })).toEqual({ id: "left", side: "left", widthMm: 230, heightMm: 320 });
    expect(presetSurface("page", double.slice(0, 1), { page })).toMatchObject({ id: "right", side: "right" });
    expect(presetSurface("page", double, { page })).toMatchObject({ id: "middle", side: "middle", widthMm: 230 });
  });

  it("a wall: 2000 × 1500 mm; in a free scene standing ahead behind the row, its foot on the table", () => {
    expect(presetSurface("wall", double, { page })).toEqual({ id: "wall", side: "wall", widthMm: WALL_MM.width, heightMm: WALL_MM.height });
    expect(presetSurface("wall", double, { page, layout: "free" }).place).toEqual({ x: 0, y: 750, z: -260, rx: 90, ry: 0, rz: 0 });
  });

  it("custom: a middle in a fixed scene, a wall in a free one", () => {
    expect(presetSurface("custom", double, { page })).toMatchObject({ side: "middle", widthMm: CUSTOM_MM.width, heightMm: CUSTOM_MM.height });
    expect(presetSurface("custom", double, { page, layout: "free" })).toMatchObject({ side: "wall" });
  });

  it("ids stay unique", () => {
    expect(newSurfaceId(double, "wall")).toBe("wall");
    expect(newSurfaceId([...double, { id: "wall", side: "wall", widthMm: 1, heightMm: 1 }, { id: "wall-2", side: "wall", widthMm: 1, heightMm: 1 }], "wall")).toBe("wall-3");
  });

  it("a wall in a fixed scene makes it free; a page keeps the layout", () => {
    const wall = addSurface("wall", double, { page });
    expect(wall.layout).toBe("free");
    expect(wall.surfaces).toHaveLength(3);
    expect(wall.added.place?.rx).toBe(90);
    expect(addSurface("page", double, { page }).layout).toBeUndefined();
    expect(addSurface("wall", double, { page, layout: "free" }).layout).toBeUndefined();
  });

  it("the page size: a page the scene has, else the fallback", () => {
    expect(pageSizeOf(double, { width: 1, height: 1 })).toEqual(page);
    expect(pageSizeOf([], { width: 1, height: 2 })).toEqual({ width: 1, height: 2 });
  });
});

describe("remove and reorder", () => {
  it("removes by id", () => expect(removeSurface(double, "left").map(s => s.id)).toEqual(["right"]));

  it("↑ ↓ swap with the neighbour; the ends and unknown ids stay", () => {
    expect(moveSurface(double, "right", -1).map(s => s.id)).toEqual(["right", "left"]);
    expect(moveSurface(double, "left", -1).map(s => s.id)).toEqual(["left", "right"]);
    expect(moveSurface(double, "nope", 1).map(s => s.id)).toEqual(["left", "right"]);
  });

  it("a drop moves to an index", () => {
    const three = [...double, { id: "wall", side: "wall", widthMm: 1, heightMm: 1 }];
    expect(moveSurfaceTo(three, "wall", 0).map(s => s.id)).toEqual(["wall", "left", "right"]);
  });
});

describe("one surface changed", () => {
  it("a label trimmed, empty = none; a side; a size at least 1 mm", () => {
    expect(updateSurface(double, "left", { label: "  ii " })[0].label).toBe("ii");
    expect(updateSurface(double, "left", { label: "" })[0]).not.toHaveProperty("label");
    expect(updateSurface(double, "left", { side: "middle" })[0].side).toBe("middle");
    expect(updateSurface(double, "left", { widthMm: 0, heightMm: 210.04 })[0]).toMatchObject({ widthMm: 1, heightMm: 210 });
    expect(updateSurface(double, "left", {})[1]).toBe(double[1]);
  });

  it("a place rounded to a tenth; null takes it away", () => {
    const placed = updateSurface(double, "left", { place: { x: 1.234, y: 0, z: -2.06, rx: 90.04 } });
    expect(placed[0].place).toEqual({ x: 1.2, y: 0, z: -2.1, rx: 90 });
    expect(updateSurface(placed, "left", { place: null })[0]).not.toHaveProperty("place");
  });

  it("the same list is no change", () => {
    expect(sameSurfaces(double, updateSurface(double, "left", { label: "40" }))).toBe(true);
    expect(sameSurfaces(double, updateSurface(double, "left", { label: "39" }))).toBe(false);
  });

  it("a surface's name: its label with its side, else its side", () => {
    expect(surfaceName(double[0])).toBe("40 · left");
    expect(surfaceName({ side: "wall" })).toBe("wall");
  });
});

describe("what lies on a surface", () => {
  const surfaces = [...double, { id: "wall", side: "wall", widthMm: 2000, heightMm: 1500 }];
  it("by its id, else by its side (the first surface with it)", () => {
    expect(liesOn({ surface: "right", surfaceId: "wall" }, surfaces[2], surfaces)).toBe(true);
    expect(liesOn({ surface: "right", surfaceId: "wall" }, surfaces[1], surfaces)).toBe(false);
    expect(liesOn({ surface: "right" }, surfaces[1], surfaces)).toBe(true);
    expect(liesOn({ surface: "right", surfaceId: "gone" }, surfaces[1], surfaces)).toBe(true);
    expect(liesOn(undefined, surfaces[1], surfaces)).toBe(false);
  });

  it("the targets and entries on it, and the removal's words", () => {
    const entries = [
      { id: "a", title: "Racoon", target: { id: "p041-1", print: { surface: "right" as const } } },
      { id: "b", title: "Poster", target: { id: "wall-1", print: { surface: "right" as const, surfaceId: "wall" } } },
      { id: "c", title: "Glossary", surface: "wall", target: null },
    ];
    const on = onSurface(entries, surfaces[2], surfaces);
    expect(on).toEqual({ targets: ["wall-1"], entries: ["Glossary"] });
    expect(removalWarning(on)).toBe("target wall-1 and entry Glossary lie on it – they keep their side and fall back to it.");
    expect(removalWarning({ targets: [], entries: [] })).toBe("");
  });
});

describe("the surfaces a placement offers", () => {
  it("the scene's own by id, with the side older apps read", () => {
    const choices = surfaceChoices([...double, { id: "wall", side: "wall", widthMm: 2000, heightMm: 1500 }], "spread");
    expect(choices.map(c => [c.value, c.label, c.surface, c.surfaceId])).toEqual([
      ["left", "40 · left", "left", "left"], ["right", "41 · right", "right", "right"], ["wall", "wall", "right", "wall"],
    ]);
    expect(choiceOf(choices, { surface: "right", surfaceId: "wall" })).toBe("wall");
    expect(choiceOf(choices, { surface: "left" })).toBe("left");
    expect(placeOnChoice({ surface: "left" as const, x: 1, y: 2, width: 3 }, choices[2])).toEqual({ surface: "right", surfaceId: "wall", x: 1, y: 2, width: 3 });
  });

  it("without surfaces the format's sides, and a side choice drops the id", () => {
    expect(surfaceChoices(undefined, "spread").map(c => c.value)).toEqual(["left", "right"]);
    expect(surfaceChoices([], "cover").map(c => c.value)).toEqual(["front"]);
    const [left] = surfaceChoices(undefined, "spread");
    expect(placeOnChoice({ surface: "right" as const, surfaceId: "wall", x: 0, y: 0, width: 1 }, left)).toEqual({ surface: "left", x: 0, y: 0, width: 1 });
  });
});
