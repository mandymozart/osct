import { describe, expect, it } from "vitest";
import type { TargetPlace } from "@shared/types/game-config";
import { fitsOn, formatOf, moveToSurface, presetSize, targetsOutside } from "../surface-edit";
import { gridSnapStep, parseSurfaceGrid, resolveSurfaceGrid } from "../stage/preview";
import { surfaceSnapSettings, type SnapSettings } from "../stage/snap";
import { MAX_SUBDIVISION_LINES, originGizmo, subdivisionLines } from "../stage/origin";

/** #314 (with #316): a target moved to another surface, the surfaces' formats, the per-surface grid and the origin gizmo */

const page = { id: "page", widthMm: 230, heightMm: 320 };
const double = { id: "double", widthMm: 460, heightMm: 320 };
const small = { id: "small", widthMm: 100, heightMm: 50 };

describe("a target moved to another surface", () => {
  it("keeps its place in mm where it fits there, the surface named while the scene has several", () => {
    const place: TargetPlace = { surface: "double", x: 20, y: 30, width: 80, height: 60 };
    expect(moveToSurface(place, page, true)).toEqual({ place: { surface: "page", x: 20, y: 30, width: 80, height: 60 }, how: "kept" });
    expect(moveToSurface(place, page, false).place).toEqual({ x: 20, y: 30, width: 80, height: 60 });
  });

  it("is centred when it would stick out; made smaller first (its aspect kept) when it is too big", () => {
    expect(moveToSurface({ x: 300, y: 10, width: 80, height: 60 }, page, true)).toEqual({ place: { surface: "page", x: 75, y: 130, width: 80, height: 60 }, how: "centred" });
    // 200 × 100 onto 100 × 50: half the size, filling it
    expect(moveToSurface({ x: 0, y: 0, width: 200, height: 100 }, small, true)).toEqual({ place: { surface: "small", x: 0, y: 0, width: 100, height: 50 }, how: "scaled" });
  });

  it("counts a place without a height by the stage's height, else as square", () => {
    // 40 wide at y 20 on a 50 mm high surface: as a square it sticks out, with the image's 20 mm it fits
    expect(moveToSurface({ x: 10, y: 20, width: 40 }, small, true).how).toBe("centred");
    expect(moveToSurface({ x: 10, y: 20, width: 40 }, small, true, 20)).toEqual({ place: { surface: "small", x: 10, y: 20, width: 40 }, how: "kept" });
    expect(moveToSurface({ x: 10, y: 20, width: 40 }, small, true).place).toEqual({ surface: "small", x: 30, y: 5, width: 40 });
  });
});

describe("a surface's format", () => {
  it("the presets' sizes and which one a size is – either way round, else custom", () => {
    expect(presetSize("double")).toEqual({ width: 460, height: 320 });
    expect(presetSize("single")).toEqual({ width: 230, height: 320 });
    expect(presetSize("wall")).toEqual({ width: 2000, height: 1500 });
    expect(formatOf({ widthMm: 460, heightMm: 320 })).toBe("double");
    expect(formatOf({ widthMm: 320, heightMm: 230 })).toBe("single");
    expect(formatOf({ widthMm: 2000, heightMm: 1500 })).toBe("wall");
    expect(formatOf({ widthMm: 300, heightMm: 300 })).toBe("custom");
  });

  it("flags the targets lying outside a surface – by their height, the stage's, else their top edge", () => {
    expect(fitsOn({ x: 0, y: 0, width: 230, height: 320 }, page)).toBe(true);
    expect(fitsOn({ x: 200, y: 0, width: 40 }, page)).toBe(false);
    const entries = [
      { target: { id: "in", place: { surface: "page", x: 10, y: 10, width: 50, height: 50 } } },
      { target: { id: "wide", place: { surface: "page", x: 200, y: 10, width: 50 } } },
      { target: { id: "low", place: { surface: "page", x: 10, y: 300, width: 50 } } },
      { target: { id: "other", place: { surface: "double", x: 400, y: 10, width: 50 } } },
      { target: null },
    ];
    const surfaces = [page, double];
    expect(targetsOutside(entries, page, surfaces)).toEqual(["wide"]);
    expect(targetsOutside(entries, page, surfaces, { low: 40 })).toEqual(["wide", "low"]);
    expect(targetsOutside(entries, double, surfaces)).toEqual([]);
  });
});

describe("a surface's own grid: subdivisions, shown, snap", () => {
  const toolbar = { grid: true, gridMm: 10, snapTo: ["grid", "axes"] as ("grid" | "axes")[], surfaceGrids: {} };

  it("reads a stored grid – a plain number is a spacing (as before), the fields checked and clamped", () => {
    expect(parseSurfaceGrid(25)).toEqual({ mm: 25 });
    expect(parseSurfaceGrid({ mm: 9000, sub: 40, on: false, snap: "yes" })).toEqual({ mm: 500, sub: 10, on: false });
    expect(parseSurfaceGrid({ sub: 0.4 })).toEqual({ sub: 1 });
    expect(parseSurfaceGrid({})).toBeNull();
    expect(parseSurfaceGrid("5")).toBeNull();
  });

  it("each field left out is the toolbar's; the snap step is the spacing over the subdivisions, none with snap off", () => {
    const state = { ...toolbar, surfaceGrids: { wall: { mm: 20, sub: 4 }, page: { on: false, snap: false } } };
    expect(resolveSurfaceGrid(state, "wall")).toEqual({ mm: 20, sub: 4, on: true, snap: true });
    expect(resolveSurfaceGrid(state, "page")).toEqual({ mm: 10, sub: 1, on: false, snap: false });
    expect(resolveSurfaceGrid({ ...state, snapTo: ["axes" as const] }, "other")).toEqual({ mm: 10, sub: 1, on: true, snap: false });
    expect(gridSnapStep(resolveSurfaceGrid(state, "wall"))).toBe(5);
    expect(gridSnapStep(resolveSurfaceGrid(state, "page"))).toBeNull();
  });

  it("a print snaps with its surface's step – the grid a snap target there – or, snap off there, by the move step", () => {
    const settings: SnapSettings = { snapTo: ["axes", "outlines"], gridMm: 10, snapMove: 1, origin: "top-left" };
    expect(surfaceSnapSettings(settings, 5)).toEqual({ ...settings, gridMm: 5, snapTo: ["grid", "axes", "outlines"] });
    expect(surfaceSnapSettings({ ...settings, snapTo: ["grid", "axes"] }, null)).toEqual({ ...settings, snapTo: ["axes"] });
    expect(surfaceSnapSettings(settings, undefined)).toBe(settings);
  });

  it("draws the subdivision lines between the main ones, none for 1 or a net too fine", () => {
    expect(subdivisionLines(0, 0, 40, 20, 4)).toEqual([5, 10, 15, 25, 30, 35]);
    expect(subdivisionLines(0, 0, 40, 20, 1)).toEqual([]);
    expect(subdivisionLines(0, 0, 2000, 1, 10).length).toBe(0);
    expect(subdivisionLines(0, 0, MAX_SUBDIVISION_LINES, 4, 4).length).toBe(300);
  });
});

describe("the origin gizmo", () => {
  it("the scene's three axes with an arrowhead each and a ring on the table, as segments in the stage frame", () => {
    const gizmo = originGizmo(100);
    for (const axis of [gizmo.x, gizmo.y, gizmo.z]) expect(axis.length).toBe(3 * 6);
    // x right, y up (stage z), z towards the reader (stage −y): each shaft from the origin, 100 mm
    expect(gizmo.x.slice(0, 6)).toEqual([0, 0, 0, 0.1, 0, 0]);
    expect(gizmo.y.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0.1]);
    expect(gizmo.z.slice(0, 6)).toEqual([0, 0, 0, 0, -0.1, 0]);
    expect(gizmo.ring.length).toBe(24 * 6);
    expect(gizmo.ring.filter((_, i) => i % 3 === 2).every(z => z === 0)).toBe(true);
  });
});
