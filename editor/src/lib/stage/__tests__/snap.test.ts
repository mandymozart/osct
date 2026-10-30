import { describe, expect, it } from "vitest";
import {
  axisLines, boxLines, chosenLines, clampSnap, freeAxes, incrementsAt, joinLines, moveIncrements, pageLines, pointLines, printStageBox, snapActive,
  snapAngle, snapAxis, snapMove, snapPlace, snapScale, snapStep, spreadToStage, thresholdMm, toggleSnapTarget, type SnapLine, type SnapSettings,
} from "../snap";

const book = { page: { width: 230, height: 320 }, format: "spread" as const };
const cover = { page: { width: 230, height: 320 }, format: "cover" as const };
const settings = (patch: Partial<SnapSettings> = {}): SnapSettings => ({ snapTo: ["grid", "axes", "objects", "outlines"], gridMm: 10, snapMove: 1, origin: "top-left", ...patch });

describe("snap: on, off and Shift", () => {
  it("follows the setting, and a held Shift or Ctrl turns it around", () => {
    expect(snapActive(true, false)).toBe(true);
    expect(snapActive(true, true)).toBe(false);
    expect(snapActive(false, false)).toBe(false);
    expect(snapActive(false, true)).toBe(true);
  });

  it("keeps the precision in bounds", () => {
    expect(clampSnap("move", 0)).toBe(0.1);
    expect(clampSnap("rotate", 400)).toBe(90);
    expect(clampSnap("scale", 0.25)).toBe(0.25);
  });

  it("switches a snap target on and off in its fixed order", () => {
    expect(toggleSnapTarget(["grid", "objects"], "axes")).toEqual(["grid", "axes", "objects"]);
    expect(toggleSnapTarget(["grid", "axes", "objects"], "grid")).toEqual(["axes", "objects"]);
  });
});

describe("snap: the grid", () => {
  it("rounds to the nearest step counted from the zero", () => {
    expect(snapStep(14, 10)).toBe(10);
    expect(snapStep(16, 10)).toBe(20);
    expect(snapStep(-14, 10)).toBe(-10);
    expect(snapStep(16, 10, 3)).toBe(13);
    expect(snapStep(0.3 + 0.6, 0.3)).toBe(0.9);
    // no step: the value stays
    expect(snapStep(16, 0)).toBe(16);
  });

  it("counts the steps from the origin's zero of the page under the point", () => {
    // top left corners: the left page's at x = −230, the right page's at the spine; y from the page's top
    expect(incrementsAt(-100, "top-left", book, 10)).toEqual([{ zero: -230, step: 10 }, { zero: 160, step: 10 }, { zero: 0, step: 10 }]);
    expect(incrementsAt(50, "top-left", book, 10)[0]).toEqual({ zero: 0, step: 10 });
    // beyond the book: the nearest page's
    expect(incrementsAt(400, "top-right", book, 5)[0]).toEqual({ zero: 230, step: 5 });
    // the book's centre: one zero for both pages
    expect(incrementsAt(-100, "centre", book, 10)[0]).toEqual({ zero: 0, step: 10 });
  });

  it("steps by the grid while the grid is a snap target, else by the move step", () => {
    expect(moveIncrements(10, settings(), book)[0].step).toBe(10);
    expect(moveIncrements(10, settings({ snapTo: ["axes"], snapMove: 2.5 }), book)[0].step).toBe(2.5);
  });
});

describe("snap: rotation and scale", () => {
  it("turns in whole steps of degrees", () => {
    expect(snapAngle(22, 15)).toBe(15);
    expect(snapAngle(23, 15)).toBe(30);
    expect(snapAngle(-50, 15)).toBe(-45);
    expect(snapAngle(44, 45)).toBe(45);
    expect(snapAngle(7, 15)).toBe(0);
  });

  it("scales in whole steps, never below one step, its sign kept", () => {
    expect(snapScale(1.04, 0.1)).toBe(1);
    expect(snapScale(1.06, 0.1)).toBe(1.1);
    expect(snapScale(0.02, 0.1)).toBe(0.1);
    expect(snapScale(-0.74, 0.25)).toBe(-0.75);
    expect(snapScale(1.3, 0)).toBe(1.3);
  });
});

describe("snap: the nearest line within the threshold", () => {
  const lines: SnapLine[] = [{ at: 0, kind: "axes" }, { at: 60, kind: "objects" }, { at: 115, kind: "outlines" }];

  it("puts the pivot on a line near it", () => {
    expect(snapAxis(58, [], lines, 3)).toEqual({ value: 60, line: { at: 60, kind: "objects" }, stepped: false });
  });

  it("puts any anchor on its nearest line: an edge of the box, its centre", () => {
    // a box 20 mm wide around the pivot: its right edge (+10) is 1 mm from the page's centre line at 115
    expect(snapAxis(104, [-10, 0, 10], lines, 3)).toEqual({ value: 105, line: { at: 115, kind: "outlines" }, stepped: false });
    // the left edge (−10) nearest to the object's line at 60
    expect(snapAxis(71, [-10, 0, 10], lines, 3).value).toBe(70);
  });

  it("takes the nearest of several lines in reach", () => {
    expect(snapAxis(2, [], [{ at: 0, kind: "axes" }, { at: 3, kind: "outlines" }], 4).line?.kind).toBe("outlines");
  });

  it("steps by the increment when no line is near, and stays without one", () => {
    expect(snapAxis(33, [], lines, 3, { zero: 0, step: 10 })).toEqual({ value: 30, line: null, stepped: true });
    expect(snapAxis(33, [], lines, 3)).toEqual({ value: 33, line: null, stepped: false });
    // a line in reach wins over the grid
    expect(snapAxis(57.5, [], lines, 3, { zero: 0, step: 10 }).value).toBe(60);
  });

  it("turns the threshold's pixels into mm by the camera's distance", () => {
    // 50° over 800 px at 500 mm: 1 px ≈ 0.583 mm
    expect(thresholdMm(8, 500, 50, 800)).toBeCloseTo(4.663, 2);
    expect(thresholdMm(8, 500, 50, 0)).toBe(0);
  });
});

describe("snap: the stage's lines", () => {
  it("has the origin's zero lines and the page plane as axes", () => {
    const [x, y, z] = axisLines("top-left", book);
    expect(x.map(l => l.at)).toEqual([-230, 0]);
    expect(y.map(l => l.at)).toEqual([160]);
    expect(z).toEqual([{ at: 0, kind: "axes" }]);
    expect(axisLines("centre", book)[0].map(l => l.at)).toEqual([0]);
  });

  it("has the pages' edges, the spine too, as outlines", () => {
    expect(pageLines(book)[0].map(l => l.at)).toEqual([-230, 0, 230]);
    expect(pageLines(book)[1].map(l => l.at)).toEqual([160, -160]);
    expect(pageLines(cover)[0].map(l => l.at)).toEqual([-115, 115]);
  });

  it("puts a printed target's box on the stage and gives its edges and centre", () => {
    const box = printStageBox({ surface: "right", x: 20, y: 30, width: 60 }, 40, book);
    expect(box).toEqual({ min: [20, 90, 0], max: [80, 130, 0] });
    expect(boxLines(box, "outlines")[0].map(l => l.at)).toEqual([20, 50, 80]);
    expect(printStageBox({ surface: "left", x: 0, y: 0, width: 230 }, 320, book)).toEqual({ min: [-230, -160, 0], max: [0, 160, 0] });
  });

  it("keeps only the chosen targets' lines", () => {
    const lines = joinLines(axisLines("centre", book), pointLines([10, 20, 30], "objects"), pageLines(book));
    expect(chosenLines(lines, ["objects"])).toEqual([[{ at: 10, kind: "objects" }], [{ at: 20, kind: "objects" }], [{ at: 30, kind: "objects" }]]);
    expect(chosenLines(lines, ["axes", "outlines"])[0].map(l => l.kind)).toEqual(["axes", "outlines", "outlines", "outlines"]);
  });

  it("reads the spread's frame from its top left corner", () => {
    expect(spreadToStage(book, 0, 0)).toEqual({ x: -230, y: 160 });
    expect(spreadToStage(cover, 115, 160)).toEqual({ x: 0, y: 0 });
  });
});

describe("snap: a move of the gizmo", () => {
  const lines = joinLines(axisLines("centre", book), pageLines(book));

  it("snaps only the axes the handle may change, and names its guides", () => {
    const result = snapMove({
      point: [2, -158, 13], offsets: [[], [], []], lines, free: [true, false, true], threshold: 3,
      increments: [null, null, { zero: 0, step: 10 }],
    });
    // x onto the spine (an axis and an outline – the first found), y stays (not free), z steps to 10
    expect(result.point).toEqual([0, -158, 10]);
    expect(result.guides).toEqual([{ axis: 0, line: { at: 0, kind: "axes" } }]);
  });

  it("finds the free axes of a handle: a line, a plane, a turned node", () => {
    expect(freeAxes([[1, 0, 0]])).toEqual([true, false, false]);
    expect(freeAxes([[0, 0, -1]])).toEqual([false, false, true]);
    // a plane spanned by x and y: both free, not z
    expect(freeAxes([[1, 0, 0], [0, 1, 0]])).toEqual([true, true, false]);
    // a node turned by 30° about z: its x handle runs across the page's axes – none snaps
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(freeAxes([[c, s, 0]])).toEqual([false, false, false]);
    // its XY plane is still the page: x and y free
    expect(freeAxes([[c, s, 0], [-s, c, 0]])).toEqual([true, true, false]);
    expect(freeAxes([])).toEqual([true, true, true]);
  });
});

describe("snap: a print dragged by its handles", () => {
  const input = (patch: Partial<SnapSettings> = {}) => ({ frame: book, lines: joinLines(axisLines("top-left", book), pageLines(book)), threshold: 4, settings: settings(patch) });

  it("puts its edge on a page edge in reach", () => {
    // 60 × 40 on the right page, its right edge 2 mm from the page's outer edge (230)
    const { place, guides } = snapPlace({ surface: "right", x: 168, y: 101, width: 60 }, 40, "move", input());
    expect(place).toMatchObject({ x: 170 });
    expect(guides).toContainEqual({ axis: 0, line: { at: 230, kind: "outlines" } });
    // y: no edge near – the top edge steps to the grid (from the page's top)
    expect(place.y).toBe(100);
  });

  it("puts its bottom edge on the page's bottom edge", () => {
    const { place } = snapPlace({ surface: "left", x: 50, y: 278, width: 60 }, 40, "move", input());
    expect(place.y).toBe(280);
  });

  it("steps by the move step when the grid is no target", () => {
    const { place, guides } = snapPlace({ surface: "right", x: 52.6, y: 71.2, width: 60 }, 40, "move", input({ snapTo: ["outlines"], snapMove: 0.5 }));
    expect([place.x, place.y]).toEqual([52.5, 71]);
    expect(guides).toEqual([]);
  });

  it("snaps the corner's width to the page edge and keeps a stored height in proportion", () => {
    const { place } = snapPlace({ surface: "right", x: 100, y: 50, width: 127, height: 50.8 }, 50.8, "width", input());
    expect(place.width).toBe(130);
    expect(place.height).toBeCloseTo(52, 1);
  });
});
