import { describe, expect, it } from "vitest";
import { matchNames, pageKey, pageOfName } from "@shared/api/page-names";
import type { BookPage } from "@shared/api/editor";
import { pageImagesOfSpread } from "../stage/stage-layout";
import { cardPageImages } from "../sheet-preview";
import { pageImageMap } from "../stage/frame-protocol";
import { bulkClashes, bulkRows, layoutHalfOf, printFormatOf } from "../pages-view";

/** The pages of staging's book after the matter (#251): cover, F1–F4, the half next to 1, 1…256, the half next to 256, B1–B4, back */
const page = (p: number, kind: BookPage["kind"], label: string, side: BookPage["side"], facing = false, spread = "x"): BookPage => ({ page: p, facing, spread, side, kind, label });
const pages: BookPage[] = [
  page(0, "cover", "Cover", "front"),
  page(-4, "front-matter", "F1", "left"), page(-3, "front-matter", "F2", "right"), page(-2, "front-matter", "F3", "left"), page(-1, "front-matter", "F4", "right"),
  page(1, "facing", "next to 1", "left", true), page(1, "page", "1", "right"),
  ...Array.from({ length: 255 }, (_, i) => page(i + 2, "page", String(i + 2), (i + 2) % 2 === 0 ? "left" : "right")),
  page(256, "facing", "next to 256", "right", true),
  page(257, "back-matter", "B1", "left"), page(258, "back-matter", "B2", "right"), page(259, "back-matter", "B3", "left"), page(260, "back-matter", "B4", "right"),
  page(261, "back", "Back cover", "back"),
];
const keyOf = (name: string) => {
  const found = pageOfName(name, pages);
  return found ? pageKey(found) : null;
};

describe("page images by file name (#251)", () => {
  it("reads numbered pages in the usual spellings", () => {
    expect(["P012_Print.jpg", "p12.png", "012.jpg", "page-12.webp", "page12.jpg", "pp-012.jpg", "12.jpg", "P012-1.jpg"].map(keyOf)).toEqual(Array(8).fill("12"));
  });

  it("reads the covers, the matter by its labels and the unnumbered halves", () => {
    expect(["cover.jpg", "Front-Cover.jpg", "back-cover.png", "cover_back.jpg", "back.jpg"].map(keyOf)).toEqual(["0", "0", "261", "261", "261"]);
    expect(["F1.jpg", "f4.jpg", "B1.jpg", "b04.jpg", "F5.jpg"].map(keyOf)).toEqual(["-4", "-1", "257", "260", null]);
    expect(["P001-facing.jpg", "page-256-facing.jpg", "P002-facing.jpg"].map(keyOf)).toEqual(["1f", "256f", null]);
  });

  it("reads the print PDFs' order: start-1 … from the cover to the half next to page 1, end-1 … from the half next to the last page to the back cover", () => {
    expect(Array.from({ length: 6 }, (_, i) => keyOf(`start-${i + 1}.jpg`))).toEqual(["0", "-4", "-3", "-2", "-1", "1f"]);
    expect(Array.from({ length: 6 }, (_, i) => keyOf(`end-${i + 1}.jpg`))).toEqual(["256f", "257", "258", "259", "260", "261"]);
    expect(keyOf("start-7.jpg")).toBeNull();
  });

  it("leaves names without a page out and marks a second file for one page", () => {
    expect(keyOf("holiday.jpg")).toBeNull();
    expect(keyOf("999.jpg")).toBeNull();
    const matches = matchNames(["P012.jpg", "12.png", "x.jpg"], pages);
    expect(matches.map(m => [m.page?.label ?? null, m.duplicate])).toEqual([["12", false], ["12", true], [null, false]]);
  });

  it("proposes the bulk upload's rows: duplicates and unknown names skipped with a note, clashes found", () => {
    const files = ["P012.jpg", "12.png", "x.jpg"].map(name => new File(["x"], name));
    const rows = bulkRows(files, pages);
    expect(rows.map(r => r.key)).toEqual(["12", "", ""]);
    expect(rows.map(r => !!r.note)).toEqual([false, true, true]);
    expect([...bulkClashes(rows)]).toEqual([]);
    rows[1].key = "12";
    expect([...bulkClashes(rows)]).toEqual(["12"]);
  });
});

describe("page images over a sheet (#251)", () => {
  const images = { "0": "c.jpg", "2": "two.jpg", "3": "three.jpg", "1": "one.jpg", "1f": "beside.jpg", "256": "last.jpg" };

  it("puts a double page's pages left and right, a cover's on the whole, a single page on its side with the unnumbered half on the other", () => {
    expect(pageImagesOfSpread({ firstPage: 2, lastPage: 3 }, images)).toEqual({ left: "two.jpg", right: "three.jpg" });
    expect(pageImagesOfSpread({ firstPage: 0, lastPage: 0, format: "cover" }, images)).toEqual({ whole: "c.jpg" });
    expect(pageImagesOfSpread({ firstPage: 1, lastPage: 1 }, images)).toEqual({ right: "one.jpg", left: "beside.jpg" });
    expect(pageImagesOfSpread({ firstPage: 256, lastPage: 256 }, images)).toEqual({ left: "last.jpg" });
    expect(pageImagesOfSpread({ firstPage: 4, lastPage: 5 }, images)).toEqual({});
  });

  it("lays them over a card: halves of a double page, the whole of a cover, the shown half of a single page", () => {
    expect(cardPageImages({ firstPage: 2, lastPage: 3 }, images, 2, null)).toEqual({ left: "two.jpg", right: "three.jpg" });
    expect(cardPageImages({ firstPage: 0, lastPage: 0, format: "cover" }, images, 1, "right")).toEqual({ full: "c.jpg" });
    expect(cardPageImages({ firstPage: 1, lastPage: 1 }, images, 1, "right")).toEqual({ full: "one.jpg" });
    expect(cardPageImages({ firstPage: 256, lastPage: 256 }, images, 1, "left")).toEqual({ full: "last.jpg" });
  });

  it("the frame takes page keys and http(s) URLs only", () => {
    expect(pageImageMap({ "12": "https://cdn/x.jpg", "-3": "http://a/b.png", "1f": "https://c/d.jpg", bad: "https://x", "4": "javascript:alert(1)", "5": 3 }))
      .toEqual({ "12": "https://cdn/x.jpg", "-3": "http://a/b.png", "1f": "https://c/d.jpg" });
    expect(pageImageMap(null)).toEqual({});
  });
});

describe("the Pages view's layout reading (#251)", () => {
  const layout = {
    page: { width: 230, height: 320 },
    targets: {},
    sheets: [
      { id: "cover-front", kind: "cover-front" as const, pages: [], image: "sheets/cover-front.jpg", widthMm: 230, heightMm: 320, widthPx: 1, heightPx: 1, surfaces: ["front"] },
      { id: "front-matter-002", kind: "front-matter" as const, pages: [], image: "sheets/fm2.jpg", widthMm: 460, heightMm: 320, widthPx: 1, heightPx: 1, surfaces: ["left", "right"] },
      { id: "pp-001", kind: "spread" as const, pages: [1], image: "sheets/pp-001.jpg", widthMm: 460, heightMm: 320, widthPx: 1, heightPx: 1, surfaces: ["left", "right"] },
      { id: "pp-002-003", kind: "spread" as const, pages: [2, 3], image: "sheets/pp-002-003.jpg", widthMm: 460, heightMm: 320, widthPx: 1, heightPx: 1, surfaces: ["left", "right"] },
      { id: "back-matter-133", kind: "back-matter" as const, pages: [], image: "sheets/bm.jpg", widthMm: 460, heightMm: 320, widthPx: 1, heightPx: 1, surfaces: ["left", "right"] },
    ],
  };

  it("reads the print format from the layout: matter sheets and the last printed page", () => {
    expect(printFormatOf(layout)).toEqual({ front: 1, back: 1, lastPage: 3 });
    expect(printFormatOf(null)).toEqual({ front: 2, back: 2 });
  });

  it("shows the layout's half of a page without its own image", () => {
    expect(layoutHalfOf(page(1, "facing", "next to 1", "left", true), { firstPage: 1, lastPage: 1 }, layout, "https://cdn/book")).toEqual({ url: "https://cdn/book/assets/content/layout/sheets/pp-001.jpg", part: "left" });
    expect(layoutHalfOf(page(0, "cover", "Cover", "front"), { firstPage: 0, lastPage: 0, format: "cover" }, layout, "https://cdn/book")?.part).toBe("whole");
    expect(layoutHalfOf(page(3, "page", "3", "right"), { firstPage: 2, lastPage: 3 }, null, "https://cdn/book")).toBeNull();
  });
});
