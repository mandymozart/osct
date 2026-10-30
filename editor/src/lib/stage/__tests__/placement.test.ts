import { describe, expect, it } from "vitest";
import { DEFAULT_ASPECT, draggedPlace, grabOffset, MIN_PRINT_WIDTH, printCentre, printedHeight, surfaceLeft, withLivePlacement, withWidth } from "../placement";

const page = { width: 230, height: 320 };

describe("placement: the printed box", () => {
  it("lays the surfaces side by side: the left page left of the spine, a cover centred", () => {
    expect(surfaceLeft("left", page)).toBe(-230);
    expect(surfaceLeft("right", page)).toBe(0);
    expect(surfaceLeft("front", page)).toBe(-115);
    expect(surfaceLeft("back", page)).toBe(-115);
  });

  it("is as high as the image's aspect makes it, else the stored height, else the default aspect", () => {
    expect(printedHeight({ width: 80 }, 1.45)).toBeCloseTo(116, 6);
    expect(printedHeight({ width: 80, height: 50 }, 1.45)).toBeCloseTo(116, 6);
    expect(printedHeight({ width: 80, height: 50 })).toBe(50);
    expect(printedHeight({ width: 80 })).toBe(80 * DEFAULT_ASPECT);
    expect(printedHeight({ width: 80 }, 0)).toBe(80 * DEFAULT_ASPECT);
  });

  it("centres a print in the stage's frame (mm from the spine, y up) – where its plane and its entity's anchor lie", () => {
    // A portrait image 80 mm wide on the right page at (70, 100): 116 mm high, its centre 158 mm below the top
    const portrait = printCentre({ surface: "right", x: 70, y: 100, width: 80 }, page, 1.45);
    expect(portrait.x).toBe(110);
    expect(portrait.y).toBeCloseTo(160 - 158, 6);
    // Before the image is known the default aspect stands in (the anchor's old 0.75 box)
    expect(printCentre({ surface: "right", x: 70, y: 100, width: 80 }, page)).toEqual({ x: 110, y: 160 - 130 });
    expect(printCentre({ surface: "left", x: 60, y: 100, width: 80, height: 40 }, page)).toEqual({ x: -230 + 100, y: 160 - 120 });
    expect(printCentre({ surface: "front", x: 65, y: 110, width: 100 }, page, 1)).toEqual({ x: -115 + 115, y: 160 - 160 });
  });
});

describe("placement: the handles", () => {
  const place = { surface: "right" as const, x: 70, y: 100, width: 80 };

  it("keeps the grab point under the pointer while the image moves", () => {
    const drag = { kind: "move" as const, ...grabOffset(place, { surface: "right", x: 100, y: 130 }, page) };
    expect(drag).toEqual({ kind: "move", grabX: 30, grabY: 30 });
    expect(draggedPlace(place, drag, { surface: "right", x: 150.4, y: 200.6 }, page)).toEqual({ ...place, x: 120, y: 171 });
  });

  it("changes the page across the spine, counting x on the new page", () => {
    const drag = { kind: "move" as const, ...grabOffset(place, { surface: "right", x: 100, y: 130 }, page) };
    // The pointer 10 mm left of the spine: the image's left edge 40 mm left of it, on the left page
    expect(draggedPlace(place, drag, { surface: "left", x: 220, y: 130 }, page)).toEqual({ ...place, surface: "left", x: 190, y: 100 });
  });

  it("grabs an image that straddles the spine on its other part without a jump", () => {
    const straddling = { surface: "right" as const, x: -30, y: 100, width: 80 };
    const grab = grabOffset(straddling, { surface: "left", x: 220, y: 110 }, page);
    expect(grab).toEqual({ grabX: 20, grabY: 10 });
    expect(draggedPlace(straddling, { kind: "move", ...grab }, { surface: "left", x: 220, y: 110 }, page)).toEqual({ ...straddling, surface: "left", x: 200 });
  });

  it("sets the width from the image's left edge with the corner, on the image's own page and never under the minimum", () => {
    const corner = { kind: "width" as const, grabX: 0, grabY: 0 };
    expect(draggedPlace(place, corner, { surface: "right", x: 180.3, y: 0 }, page).width).toBe(110);
    // Over the other page: counted on the image's page (the left page's 30 mm = the right page's -200 mm)
    const left = { surface: "left" as const, x: 150, y: 100, width: 60 };
    expect(draggedPlace(left, corner, { surface: "right", x: 20, y: 0 }, page).width).toBe(100);
    expect(draggedPlace(place, corner, { surface: "right", x: 60, y: 0 }, page).width).toBe(MIN_PRINT_WIDTH);
  });

  it("scales a stored height with the width, so the box keeps its proportions", () => {
    expect(withWidth({ ...place, height: 60 }, 40)).toEqual({ ...place, width: 40, height: 30 });
    expect(withWidth(place, 40)).toEqual({ ...place, width: 40 });
    const corner = { kind: "width" as const, grabX: 0, grabY: 0 };
    expect(draggedPlace({ ...place, height: 60 }, corner, { surface: "right", x: 230, y: 0 }, page)).toMatchObject({ width: 160, height: 120 });
  });
});

describe("placement: the target being placed", () => {
  const laidOut = [
    { id: "a", imageSrc: "/a.jpg", surface: "right", x: 70, y: 100, width: 80, height: 60 },
    { id: "b", imageSrc: "/b.jpg", surface: "left", x: 60, y: 100, width: 80, height: 60 },
  ];

  it("lies where the placement says – the others stay – and comes back without it", () => {
    const moved = withLivePlacement(laidOut, { id: "a", place: { surface: "left", x: 10, y: 20, width: 40 } });
    expect(moved[0]).toEqual({ id: "a", imageSrc: "/a.jpg", surface: "left", x: 10, y: 20, width: 40, height: 30 });
    expect(moved[1]).toBe(laidOut[1]);
    expect(withLivePlacement(laidOut, null)).toEqual(laidOut);
    expect(withLivePlacement(laidOut, { id: "c", place: { surface: "left", x: 0, y: 0, width: 10 } })).toEqual(laidOut);
  });

  it("takes a stored height of the placement as it is", () => {
    expect(withLivePlacement(laidOut, { id: "b", place: { surface: "left", x: 0, y: 0, width: 40, height: 50 } })[1].height).toBe(50);
  });
});
