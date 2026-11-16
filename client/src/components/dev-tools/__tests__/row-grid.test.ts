import { afterEach, describe, expect, it } from "vitest";
import { isRowGridShown, restoreRowGrid, showRowGrid } from "../row-grid";

describe("row grid overlay (#295)", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-row-grid");
    localStorage.clear();
  });

  it("switches the overlay on <html> and keeps the choice on this device", () => {
    showRowGrid(true);
    expect(isRowGridShown()).toBe(true);
    document.documentElement.removeAttribute("data-row-grid");
    restoreRowGrid();
    expect(isRowGridShown()).toBe(true);
    showRowGrid(false);
    expect(isRowGridShown()).toBe(false);
    restoreRowGrid();
    expect(isRowGridShown()).toBe(false);
  });
});
