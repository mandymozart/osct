import { describe, expect, it } from "vitest";
import { flatFrame, fromOrigin, gridAreas, gridLines, isOriginId, originHelp, originLabel, originPoint, ORIGINS, toOrigin } from "../origin";
import { arrangeInRow, FLAT } from "#lib/surface-edit.js";

/** Two pages in a row (`left`, `right` – the scene's origin between them) and a cover alone (`front`, centred) */
const pageOf = (id: string) => ({ id, widthMm: 230, heightMm: 320, place: FLAT });
const twoPages = flatFrame(arrangeInRow([pageOf("left"), pageOf("right")]));
const cover = flatFrame([pageOf("front")]);

describe("origin: reading a position from another zero", () => {
  it("top left is the content's own frame", () => {
    expect(toOrigin("top-left", twoPages, "right", 40, 60)).toEqual({ x: 40, y: 60 });
  });

  it("counts from the surface's other corners, per surface", () => {
    expect(toOrigin("top-right", twoPages, "left", 200, 10)).toEqual({ x: -30, y: 10 });
    expect(toOrigin("bottom-left", twoPages, "right", 40, 300)).toEqual({ x: 40, y: -20 });
    expect(toOrigin("bottom-right", cover, "front", 230, 320)).toEqual({ x: 0, y: 0 });
  });

  it("the centre is the scene's origin for every surface", () => {
    expect(originPoint("centre", twoPages, "left")).toEqual({ x: 230, y: 160 });
    expect(originPoint("centre", twoPages, "right")).toEqual({ x: 0, y: 160 });
    expect(toOrigin("centre", twoPages, "left", 200, 160)).toEqual({ x: -30, y: 0 });
    expect(toOrigin("centre", twoPages, "right", 30, 0)).toEqual({ x: 30, y: -160 });
    expect(originPoint("centre", cover, "front")).toEqual({ x: 115, y: 160 });
  });

  it("the edge centres lie halfway along the surface's edges, per surface", () => {
    expect(originPoint("top-centre", twoPages, "left")).toEqual({ x: 115, y: 0 });
    expect(originPoint("centre-left", twoPages, "right")).toEqual({ x: 0, y: 160 });
    expect(originPoint("centre-right", twoPages, "left")).toEqual({ x: 230, y: 160 });
    expect(originPoint("bottom-centre", cover, "front")).toEqual({ x: 115, y: 320 });
    expect(toOrigin("top-centre", twoPages, "right", 100, 20)).toEqual({ x: -15, y: 20 });
  });

  it("has nine origins; the centre is the scene's", () => {
    expect(ORIGINS).toHaveLength(9);
    expect(ORIGINS.every(isOriginId)).toBe(true);
    expect(isOriginId("middle")).toBe(false);
    expect(originLabel("centre")).toBe("scene centre");
    expect(originLabel("top-centre")).toBe("top centre");
    expect(originHelp("bottom-left")).toBe("The bottom left corner of the surface a position lies on.");
  });

  it("entering a position is the inverse of showing it", () => {
    for (const origin of ORIGINS) {
      for (const surface of ["left", "right"] as const) {
        const shown = toOrigin(origin, twoPages, surface, 41.5, 77.25);
        expect(fromOrigin(origin, twoPages, surface, shown.x, shown.y)).toEqual({ x: 41.5, y: 77.25 });
      }
    }
  });
});

describe("origin: the grid", () => {
  it("runs a line through the zero and every step on both sides", () => {
    expect(gridLines(100, 0, 230, 50)).toEqual([0, 50, 100, 150, 200]);
    expect(gridLines(30, 0, 100, 40)).toEqual([30, 70]);
    expect(gridLines(0, 0, 10, 0)).toEqual([]);
  });

  it("is one area per surface: for the centre each counts from the scene's origin, for a corner from its own", () => {
    expect(gridAreas("centre", twoPages)).toEqual([
      { surface: "left", left: 0, top: 0, width: 230, height: 320, zeroX: 230, zeroY: 160 },
      { surface: "right", left: 230, top: 0, width: 230, height: 320, zeroX: 230, zeroY: 160 },
    ]);
    const pages = gridAreas("top-right", twoPages);
    expect(pages.map(area => [area.left, area.zeroX])).toEqual([[0, 230], [230, 460]]);
    expect(gridAreas("bottom-left", cover)).toEqual([{ surface: "front", left: 0, top: 0, width: 230, height: 320, zeroX: 0, zeroY: 320 }]);
    expect(gridAreas("centre-right", twoPages).map(area => [area.zeroX, area.zeroY])).toEqual([[230, 160], [460, 160]]);
    expect(gridAreas("centre", cover)).toEqual([{ surface: "front", left: 0, top: 0, width: 230, height: 320, zeroX: 115, zeroY: 160 }]);
  });

  it("without a flat surface, the stand-in double page", () => {
    expect(gridAreas("top-left", { surfaces: [] })).toEqual([{ surface: "surface", left: 0, top: 0, width: 460, height: 320, zeroX: 0, zeroY: 0 }]);
  });
});
