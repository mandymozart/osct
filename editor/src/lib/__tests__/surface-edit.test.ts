import { describe, expect, it } from "vitest";
import type { SurfaceData, TargetPlace } from "@shared/types/game-config";
import {
  addSurface, arrangeInRow, choiceOf, CUSTOM_MM, FLAT, inRow, liesOn, moveSurface, moveSurfaceTo, newSurfaceId, onSurface, placeOnChoice, presetSurface,
  removalWarning, removeSurface, rowCentres, sameSurfaces, surfaceChoices, surfaceName, surfaceOfPlace, tidyPlace, updateSurface, WALL_MM,
} from "../surface-edit";

/**
 * #314, #319 (schema 3.0): a scene's surfaces – add from a preset, remove, reorder, change one, *arrange in a row*, what
 * lies on one, the placement's choices. No side: every surface at its place.
 */

const flat = (x: number, z = 0) => ({ ...FLAT, x, z });
const scene: SurfaceData = { id: "surface", widthMm: 460, heightMm: 320, label: "40–41", place: flat(0) };
const cover: SurfaceData = { id: "cover", widthMm: 230, heightMm: 320, place: flat(-500) };
const wall: SurfaceData = { id: "wall", widthMm: 2000, heightMm: 1500, place: { x: 0, y: 750, z: -260, rx: 90, ry: 0, rz: 0 } };

describe("a new surface from a preset", () => {
  it("a double page is one surface twice the page's width, flat right beside the row, its far edge in line", () => {
    expect(presetSurface("double", [])).toEqual({ id: "page", widthMm: 460, heightMm: 320, place: FLAT });
    expect(presetSurface("double", [scene])).toEqual({ id: "page", widthMm: 460, heightMm: 320, place: flat(460) });
    expect(presetSurface("single", [scene])).toEqual({ id: "page", widthMm: 230, heightMm: 320, place: flat(345) });
    // A shorter surface's far edge lines up with the row's: its centre comes nearer the reader
    expect(presetSurface("custom", [scene]).place).toEqual(flat(380, -10));
    expect(presetSurface("custom", [scene])).toMatchObject({ id: "surface-2", widthMm: CUSTOM_MM.width, heightMm: CUSTOM_MM.height });
  });

  it("a wall: 2000 × 1500 mm standing ahead behind the flat surfaces, its foot on the table", () => {
    expect(presetSurface("wall", [scene])).toEqual({ id: "wall", widthMm: WALL_MM.width, heightMm: WALL_MM.height, place: { x: 0, y: 750, z: -260, rx: 90, ry: 0, rz: 0 } });
    expect(presetSurface("wall", []).place.z).toBe(-100);
  });

  it("ids stay unique; the new surface is added at the end", () => {
    expect(newSurfaceId([scene], "wall")).toBe("wall");
    expect(newSurfaceId([scene, wall, { ...wall, id: "wall-2" }], "wall")).toBe("wall-3");
    const added = addSurface("wall", [scene, wall]);
    expect(added.surfaces.map(s => s.id)).toEqual(["surface", "wall", "wall-2"]);
    expect(added.added.id).toBe("wall-2");
  });
});

describe("arrange in a row (#319)", () => {
  it("the row's centres: side by side, touching, centred on the origin", () => {
    expect(rowCentres([460])).toEqual([0]);
    expect(rowCentres([230, 460])).toEqual([-230, 115]);
    expect(rowCentres([230, 230, 230])).toEqual([-230, 0, 230]);
  });

  it("lays every surface flat in the list's order – a wall comes down onto the table – and writes their places", () => {
    const row = arrangeInRow([cover, scene, wall]);
    expect(row.map(s => s.place)).toEqual([flat(-1230), flat(-885), flat(345)]);
    expect(row[1].label).toBe("40–41");
    expect(inRow(row)).toBe(true);
    expect(inRow([cover, scene])).toBe(false);
    expect(inRow([scene])).toBe(true);
  });
});

describe("remove and reorder", () => {
  it("removes by id", () => expect(removeSurface([scene, wall], "surface").map(s => s.id)).toEqual(["wall"]));

  it("↑ ↓ swap with the neighbour; the ends and unknown ids stay", () => {
    expect(moveSurface([scene, wall], "wall", -1).map(s => s.id)).toEqual(["wall", "surface"]);
    expect(moveSurface([scene, wall], "surface", -1).map(s => s.id)).toEqual(["surface", "wall"]);
    expect(moveSurface([scene, wall], "nope", 1).map(s => s.id)).toEqual(["surface", "wall"]);
  });

  it("a drop moves to an index", () => {
    expect(moveSurfaceTo([cover, scene, wall], "wall", 0).map(s => s.id)).toEqual(["wall", "cover", "surface"]);
    expect(moveSurfaceTo([cover, scene, wall], "cover", 9).map(s => s.id)).toEqual(["surface", "wall", "cover"]);
  });
});

describe("one surface changed", () => {
  it("a label trimmed, empty = none; a size at least 1 mm", () => {
    expect(updateSurface([scene], "surface", { label: " 42–43 " })[0].label).toBe("42–43");
    expect(updateSurface([scene], "surface", { label: " " })[0]).not.toHaveProperty("label");
    expect(updateSurface([scene], "surface", { widthMm: 0, heightMm: 320.04 })[0]).toMatchObject({ widthMm: 1, heightMm: 320 });
    expect(updateSurface([scene, wall], "nope", { label: "x" })).toEqual([scene, wall]);
  });

  it("a place merged and rounded to a tenth – all six numbers always there", () => {
    expect(updateSurface([scene], "surface", { place: { x: 12.345, rx: -0.04 } })[0].place).toEqual({ x: 12.3, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    expect(tidyPlace({ x: Number.NaN, y: 2 })).toEqual({ x: 0, y: 2, z: 0, rx: 0, ry: 0, rz: 0 });
  });

  it("the same list is no change", () => {
    expect(sameSurfaces([scene], [{ ...scene }])).toBe(true);
    expect(sameSurfaces([scene], [{ ...scene, label: "x" }])).toBe(false);
    expect(sameSurfaces(undefined, [])).toBe(true);
  });

  it("a surface's name: its label, else its id", () => {
    expect(surfaceName(scene)).toBe("40–41");
    expect(surfaceName(wall)).toBe("wall");
  });
});

describe("what lies on a surface", () => {
  const surfaces = [scene, wall];
  it("a place on the surface it names, else on the scene's first", () => {
    expect(surfaceOfPlace({ surface: "wall" }, surfaces)?.id).toBe("wall");
    expect(surfaceOfPlace({}, surfaces)?.id).toBe("surface");
    expect(surfaceOfPlace({ surface: "gone" }, surfaces)?.id).toBe("surface");
    expect(liesOn({ surface: "wall" }, wall, surfaces)).toBe(true);
    expect(liesOn({}, wall, surfaces)).toBe(false);
    expect(liesOn(undefined, scene, surfaces)).toBe(false);
  });

  it("the targets and entries on it, and the removal's words", () => {
    const entries = [
      { id: "a", title: "Poster", surface: "wall", target: { id: "ta", place: { surface: "wall" } } },
      { id: "b", title: "Key", target: { id: "tb", place: {} } },
      { id: "c", title: "Note", target: null },
    ];
    const on = onSurface(entries, wall, surfaces);
    expect(on).toEqual({ targets: ["ta"], entries: ["Poster"] });
    expect(removalWarning(on)).toBe("target ta and entry Poster lie on it – they fall back to the scene's first surface.");
    expect(onSurface(entries, scene, surfaces)).toEqual({ targets: ["tb"], entries: [] });
    expect(removalWarning({ targets: [], entries: [] })).toBe("");
  });
});

describe("the placement's choice of surface", () => {
  it("the scene's surfaces by id; a place without one has the first", () => {
    const choices = surfaceChoices([scene, wall]);
    expect(choices).toEqual([{ value: "surface", label: "40–41" }, { value: "wall", label: "wall" }]);
    expect(choiceOf(choices, {})).toBe("surface");
    expect(choiceOf(choices, { surface: "wall" })).toBe("wall");
    expect(surfaceChoices(undefined)).toEqual([]);
    expect(choiceOf([], {})).toBeNull();
  });

  it("a choice names the surface while the scene has several, none in a scene of one", () => {
    const choices = surfaceChoices([scene, wall]);
    const place: TargetPlace = { x: 1, y: 2, width: 3 };
    expect(placeOnChoice(place, choices[1], choices)).toEqual({ x: 1, y: 2, width: 3, surface: "wall" });
    const one = surfaceChoices([scene]);
    expect(placeOnChoice({ ...place, surface: "old" }, one[0], one)).toEqual({ x: 1, y: 2, width: 3 });
  });
});
