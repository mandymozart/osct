import { describe, expect, it } from "vitest";
import { printedPlaceOf, sheetForSpread, sheetImageUrl, StageLayout } from "../stage-layout";

const layout: StageLayout = {
  page: { width: 230, height: 320 },
  sheets: [
    { id: "cover-front", kind: "cover-front", pages: [], image: "sheets/cover-front.jpg", widthMm: 230, heightMm: 320, widthPx: 600, heightPx: 835, surfaces: ["front"] },
    { id: "pp-001", kind: "spread", pages: [1], image: "sheets/pp-001.jpg", widthMm: 460, heightMm: 320, widthPx: 1200, heightPx: 835, surfaces: ["left", "right"] },
    { id: "pp-004-005", kind: "spread", pages: [4, 5], image: "sheets/pp-004-005.jpg", widthMm: 460, heightMm: 320, widthPx: 1200, heightPx: 835, surfaces: ["left", "right"] },
  ],
  targets: {},
};

describe("stage layout: the sheet of a spread", () => {
  it("finds the sheet by the spread's first page, else its last", () => {
    expect(sheetForSpread(layout, { firstPage: 4, lastPage: 5 })?.id).toBe("pp-004-005");
    expect(sheetForSpread(layout, { firstPage: 0, lastPage: 1 })?.id).toBe("pp-001");
    expect(sheetForSpread(layout, { firstPage: 40, lastPage: 41 })).toBeNull();
  });

  it("has no sheet without a layout or a spread", () => {
    expect(sheetForSpread(null, { firstPage: 4, lastPage: 5 })).toBeNull();
    expect(sheetForSpread(layout, undefined)).toBeNull();
  });

  it("points at the sheet's image inside the content's layout folder", () => {
    expect(sheetImageUrl(layout.sheets[2])).toBe("/assets/content/layout/sheets/pp-004-005.jpg");
  });
});

describe("stage layout: where a target is printed", () => {
  const withTargets: StageLayout = {
    ...layout,
    targets: {
      "p004-1": { page: 4, surface: "left", x: 12, y: 34, width: 50, height: 37.5, sheet: "pp-004-005" },
      "p005-1": { page: 5, surface: "right", x: 150, y: 200, width: 40, height: 30, sheet: "pp-004-005" },
      "p005-2": { page: 5, surface: "cover", x: 0, y: 0, width: 10, height: 10, sheet: null },
    },
  };

  it("gives the printed box of a target the layout knows", () => {
    expect(printedPlaceOf(withTargets, "p004-1")).toEqual({ surface: "left", x: 12, y: 34, width: 50, height: 37.5 });
    expect(printedPlaceOf(withTargets, "p005-1")).toEqual({ surface: "right", x: 150, y: 200, width: 40, height: 30 });
  });

  it("gives nothing for a target the layout has no place for, or without a layout (the fallback then keeps the ghost where it is)", () => {
    expect(printedPlaceOf(withTargets, "p019-1")).toBeNull();
    expect(printedPlaceOf(layout, "p004-1")).toBeNull();
    expect(printedPlaceOf(null, "p004-1")).toBeNull();
  });

  it("gives nothing for a surface a target cannot be printed on", () => {
    expect(printedPlaceOf(withTargets, "p005-2")).toBeNull();
  });
});
