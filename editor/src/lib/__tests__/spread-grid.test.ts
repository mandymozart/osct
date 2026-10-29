import { describe, expect, it } from "vitest";
import { captionOf, formatLabelOf, gridCells, GRID_COLUMNS } from "../spread-grid";

const spread = (id: string, firstPage: number, lastPage: number, format?: string, title = `${firstPage}–${lastPage}`) => ({ id, title, firstPage, lastPage, format });

describe("spread grid", () => {
  const cells = gridCells([spread("cover", 0, 0, "cover", "Cover"), spread("p1", 1, 1, undefined, "1"), spread("p2", 2, 3), spread("p4", 4, 5), spread("back", 99, 99, "back", "Back")]);
  const layoutOf = () => {
    let column = 0;
    return cells.map(cell => {
      const start = column;
      column += cell.spacer ? 1 : cell.span;
      return { cell, start };
    });
  };

  it("leaves the first cell empty and puts the cover on the right-hand column", () => {
    expect(cells[0]).toEqual({ spacer: true });
    const placed = layoutOf().find(p => !p.cell.spacer && p.cell.spread.id === "cover")!;
    expect(placed.start).toBe(1);
  });

  it("starts every double page on an even column so 2–3, 4–5 line up as spreads", () => {
    for (const { cell, start } of layoutOf()) {
      if (!cell.spacer && cell.span === 2) expect(start % 2).toBe(0);
    }
  });

  it("never wraps a double page", () => {
    for (const { cell, start } of layoutOf()) {
      if (!cell.spacer) expect((start % GRID_COLUMNS) + cell.span).toBeLessThanOrEqual(GRID_COLUMNS);
    }
  });
});

describe("spread caption", () => {
  it("shows the pages once, with the title only when it says more", () => {
    expect(captionOf(spread("a", 4, 5))).toBe("4–5");
    expect(captionOf(spread("a", 4, 5, undefined, "The garden"))).toBe("4–5 · The garden");
  });

  it("does not repeat the cover's format in the caption", () => {
    expect(captionOf(spread("c", 0, 0, "cover", "Cover"))).toBe("");
    expect(captionOf(spread("c", 0, 0, "cover", "Front"))).toBe("Front");
  });

  it("labels only a format that is not the default", () => {
    expect(formatLabelOf(spread("a", 4, 5))).toBe("");
    expect(formatLabelOf(spread("a", 4, 5, "spread"))).toBe("");
    expect(formatLabelOf(spread("c", 0, 0, "back"))).toBe("back");
  });
});
