import { describe, expect, it } from "vitest";
import { sheetForSpread, sheetImageUrl, StageLayout } from "../stage-layout";

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
