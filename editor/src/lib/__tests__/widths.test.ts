import { beforeEach, describe, expect, it } from "vitest";
import { clampWidth, LIMITS, STAGE_MIN, widths } from "../widths.svelte";

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
