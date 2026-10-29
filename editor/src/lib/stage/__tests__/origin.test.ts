import { describe, expect, it } from "vitest";
import { fromOrigin, gridAreas, gridLines, originPoint, toOrigin } from "../origin";

const book = { page: { width: 230, height: 320 }, format: "spread" as const };
const cover = { page: { width: 230, height: 320 }, format: "cover" as const };

describe("origin: reading a position from another zero", () => {
  it("top left is the content's own frame", () => {
    expect(toOrigin("top-left", book, "right", 40, 60)).toEqual({ x: 40, y: 60 });
  });

  it("counts from the page's other corners, per page", () => {
    expect(toOrigin("top-right", book, "left", 200, 10)).toEqual({ x: -30, y: 10 });
    expect(toOrigin("bottom-left", book, "right", 40, 300)).toEqual({ x: 40, y: -20 });
    expect(toOrigin("bottom-right", cover, "front", 230, 320)).toEqual({ x: 0, y: 0 });
  });

  it("the book's centre is the spine's middle for both pages", () => {
    expect(originPoint("centre", book, "left")).toEqual({ x: 230, y: 160 });
    expect(originPoint("centre", book, "right")).toEqual({ x: 0, y: 160 });
    expect(toOrigin("centre", book, "left", 200, 160)).toEqual({ x: -30, y: 0 });
    expect(toOrigin("centre", book, "right", 30, 0)).toEqual({ x: 30, y: -160 });
    expect(originPoint("centre", cover, "front")).toEqual({ x: 115, y: 160 });
  });

  it("entering a position is the inverse of showing it", () => {
    for (const origin of ["top-left", "top-right", "bottom-left", "bottom-right", "centre"] as const) {
      for (const surface of ["left", "right"] as const) {
        const shown = toOrigin(origin, book, surface, 41.5, 77.25);
        expect(fromOrigin(origin, book, surface, shown.x, shown.y)).toEqual({ x: 41.5, y: 77.25 });
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

  it("is one area for the book's centre and one per page for a corner", () => {
    expect(gridAreas("centre", book)).toEqual([{ left: 0, top: 0, width: 460, height: 320, zeroX: 230, zeroY: 160 }]);
    const pages = gridAreas("top-right", book);
    expect(pages.map(area => [area.left, area.zeroX])).toEqual([[0, 230], [230, 460]]);
    expect(gridAreas("bottom-left", cover)).toEqual([{ left: 0, top: 0, width: 230, height: 320, zeroX: 0, zeroY: 320 }]);
  });
});
