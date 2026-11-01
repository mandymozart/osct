import { beforeEach, describe, expect, it } from "vitest";
import {
  clampSheet, clampWidth, LIMITS, SHEET_INITIAL, SHEET_MAX, sheetFill, snapSheet, STAGE_MIN, stepsOnTop, TREE_OPEN_MIN, treeStartsOpen, widths, WORD_TABS_MIN,
  wordTabs,
} from "../widths.svelte";

describe("the room the phone's sheet uncovers while dragged down (#200)", () => {
  it("continues the stage's bottom edge: one colour flat, several as a gradient left to right, none leaves the background", () => {
    expect(sheetFill(["#334455"])).toBe("#334455");
    expect(sheetFill(["#111111", "#222222", "#333333"])).toBe("linear-gradient(to right, #111111, #222222, #333333)");
    expect(sheetFill([])).toBeNull();
  });
});

describe("the phone's ‹ › and the stage's toolbar (#177, #180)", () => {
  it("keeps ‹ › at the lower corners while the stage holds the toolbar and their row, else moves them up", () => {
    const toolbar = 44 + 6; // one row of the touch height (#180: the groups collapse)
    expect(stepsOnTop(400, toolbar, 44, 8)).toBe(false); // the sheet at half
    expect(stepsOnTop(toolbar + 44 + 24, toolbar, 44, 8)).toBe(false);
    expect(stepsOnTop(toolbar + 44 + 23, toolbar, 44, 8)).toBe(true);
    expect(stepsOnTop(100, toolbar, 44, 8)).toBe(true); // almost full: ‹ › would cover the first row
  });
});

const KEY = "osct-editor-widths";

beforeEach(() => {
  localStorage.clear();
  widths.reload();
});

describe("clampWidth: a column within its limits", () => {
  it("keeps a width between the minimum and the share of the window", () => {
    expect(clampWidth("panel", 400, 1600)).toBe(400);
    expect(clampWidth("panel", 100, 1600)).toBe(LIMITS.panel.min);
    expect(clampWidth("panel", 1500, 1600)).toBe(1120); // 70 %
    expect(clampWidth("tree", 1000, 1600)).toBe(640); // 40 %
  });

  it("leaves the stage its room next to the other column", () => {
    expect(clampWidth("panel", 1120, 1600, 300)).toBe(1600 - 300 - STAGE_MIN);
  });

  it("lets the minimum win in a window too small for both", () => {
    expect(clampWidth("panel", 500, 400, 240)).toBe(LIMITS.panel.min);
  });
});

describe("widths: the stored column widths", () => {
  it("takes the defaults until an edge is dragged; the code opens wider", () => {
    expect(widths.width("tree", 1600)).toBe(LIMITS.tree.initial);
    expect(widths.width("panel", 1600)).toBe(LIMITS.panel.initial);
    expect(widths.width("code", 1600)).toBeGreaterThan(widths.width("panel", 1600));
  });

  it("follows a drag and stores the widths when it ends", () => {
    widths.set("panel", 480.4);
    expect(widths.width("panel", 1600)).toBe(480);
    expect(localStorage.getItem(KEY)).toBeNull();
    widths.save();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ panel: 480 });
  });

  it("clamps a stored width to the window it is shown in", () => {
    widths.set("panel", 1400);
    expect(widths.width("panel", 1000)).toBe(700);
  });

  it("goes back to the default on a reset and forgets the stored width", () => {
    widths.set("tree", 300);
    widths.set("code", 900);
    widths.save();
    widths.reset("code");
    expect(widths.width("code", 1600)).toBe(LIMITS.code.initial);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ tree: 300 });
  });

  it("reads the stored widths back, ignoring unknown columns and what is no width", () => {
    localStorage.setItem(KEY, JSON.stringify({ tree: 200, panel: "wide", stage: 500, code: -3 }));
    widths.reload();
    expect(widths.width("tree", 1600)).toBe(200);
    expect(widths.width("panel", 1600)).toBe(LIMITS.panel.initial);
    expect(widths.width("code", 1600)).toBe(LIMITS.code.initial);
    localStorage.setItem(KEY, "[not json");
    widths.reload();
    expect(widths.width("tree", 1600)).toBe(LIMITS.tree.initial);
  });
});

describe("the phone's sheet: its height as a share of the screen (#155)", () => {
  it("clamps the height between the tab row and almost the full screen", () => {
    expect(clampSheet(0.4, 0.1)).toBe(0.4);
    expect(clampSheet(0.02, 0.1)).toBe(0.1);
    expect(clampSheet(0.99, 0.1)).toBe(SHEET_MAX);
    expect(clampSheet(0.5, 0.95)).toBe(SHEET_MAX); // a tab row taller than the limit: the limit wins
  });

  it("snaps to the nearest of closed, a third, half and almost full", () => {
    expect(snapSheet(0.05)).toBe(0);
    expect(snapSheet(0.3)).toBeCloseTo(1 / 3);
    expect(snapSheet(0.45)).toBe(0.5);
    expect(snapSheet(0.75)).toBe(SHEET_MAX);
    expect(snapSheet(1)).toBe(SHEET_MAX);
  });

  it("lets a flick carry the sheet on to the next snap point", () => {
    expect(snapSheet(0.36, 1)).toBe(0.5); // flicked up
    expect(snapSheet(0.36, -1.5)).toBe(0); // flicked down: closed
    expect(snapSheet(0.36, 0)).toBeCloseTo(1 / 3);
  });

  it("is half the screen until dragged, stored next to the widths, and reset by a double tap", () => {
    expect(widths.sheet()).toBe(SHEET_INITIAL);
    widths.set("panel", 400);
    widths.setSheet(0.333333);
    widths.save();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ panel: 400, sheet: 0.3333 });
    widths.reload();
    expect(widths.sheet()).toBe(0.3333);
    expect(widths.sheet(0.4)).toBe(0.4);
    widths.resetSheet();
    expect(widths.sheet()).toBe(SHEET_INITIAL);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ panel: 400 });
  });

  it("ignores a stored height that is no share of the screen", () => {
    localStorage.setItem(KEY, JSON.stringify({ sheet: 3 }));
    widths.reload();
    expect(widths.sheet()).toBe(SHEET_INITIAL);
    localStorage.setItem(KEY, JSON.stringify({ sheet: 0.7 }));
    widths.reload();
    expect(widths.sheet()).toBe(0.7);
  });
});

describe("a tablet in portrait (#172)", () => {
  it("starts with the tree collapsed below 64rem, unless it was opened on this device", () => {
    expect(treeStartsOpen(768, null)).toBe(false);
    expect(treeStartsOpen(1023, null)).toBe(false);
    expect(treeStartsOpen(TREE_OPEN_MIN, null)).toBe(true);
    expect(treeStartsOpen(1280, null)).toBe(true);
    expect(treeStartsOpen(768, "open")).toBe(true);
    expect(treeStartsOpen(1280, "closed")).toBe(false);
  });

  it("gives the panel its 25rem and the stage over 20rem at 768 px with the tree collapsed", () => {
    const panel = widths.width("panel", 768);
    expect(panel).toBe(LIMITS.panel.initial);
    expect(768 - panel).toBeGreaterThan(20 * 16);
    // its tab row fits as words with a mouse; a finger's larger buttons take the icons
    expect(wordTabs(panel, false)).toBe(true);
    expect(wordTabs(panel, true)).toBe(false);
  });

  it("shows the tabs as icons in a panel narrower than their words (the tree open at 768 px)", () => {
    const panel = widths.width("panel", 768, widths.width("tree", 768));
    expect(panel).toBe(768 - LIMITS.tree.initial - STAGE_MIN);
    expect(wordTabs(panel, false)).toBe(false);
    expect(wordTabs(WORD_TABS_MIN.fine, false)).toBe(true);
    expect(wordTabs(WORD_TABS_MIN.coarse - 1, true)).toBe(false);
  });
});
