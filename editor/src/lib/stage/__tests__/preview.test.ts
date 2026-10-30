import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampGrid, getPreview, setPreviewActive, setTargetHidden, stageSummary, subscribePreview, updatePreview } from "../preview";

describe("editor preview settings", () => {
  beforeEach(() => {
    localStorage.clear();
    setPreviewActive(false);
    updatePreview({ view: "reader", orbit: null, hdri: "ferndale_studio_04", wobble: 0, hidden: [] });
  });

  afterEach(() => setPreviewActive(false));

  it("is off until the editor page opens, and tells subscribers", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribePreview(state => seen.push(state.active));
    expect(getPreview().active).toBe(false);
    setPreviewActive(true);
    setPreviewActive(true);
    setPreviewActive(false);
    expect(seen).toEqual([true, false]);
    unsubscribe();
  });

  it("stores the settings on the device, not the hidden targets or the active flag", () => {
    updatePreview({ view: "top", wobble: 0.4, hdri: "wooden_studio_07" });
    setTargetHidden("a", true);
    setPreviewActive(true);
    const stored = JSON.parse(localStorage.getItem("osct-preview")!);
    expect(stored).toEqual({
      view: "top", shading: "rendered", orbit: null, hdri: "wooden_studio_07", top: "plywood", wobble: 0.4, grid: false, gridMm: 10, origin: "top-left",
      axis: true, snap: false, snapTo: ["grid", "axes", "objects", "outlines"], snapMove: 1, snapRotate: 15, snapScale: 0.1,
    });
    expect(getPreview().hidden).toEqual(["a"]);
  });

  it("a preset view clears the free orbit; a free orbit keeps the preset for later", () => {
    updatePreview({ orbit: { distance: 200, tilt: 10, yaw: 5 } });
    expect(getPreview().orbit).toEqual({ distance: 200, tilt: 10, yaw: 5 });
    expect(getPreview().view).toBe("reader");
    updatePreview({ view: "low" });
    expect(getPreview().orbit).toBeNull();
    expect(getPreview().view).toBe("low");
  });

  it("hides and shows targets without duplicates, and forgets them when the editor closes", () => {
    setPreviewActive(true);
    setTargetHidden("a", true);
    setTargetHidden("a", true);
    setTargetHidden("b", true);
    expect(getPreview().hidden).toEqual(["a", "b"]);
    setTargetHidden("a", false);
    expect(getPreview().hidden).toEqual(["b"]);
    setPreviewActive(false);
    expect(getPreview().hidden).toEqual([]);
  });

  it("keeps the grid, its spacing and the origin, and clamps the spacing", () => {
    updatePreview({ grid: true, gridMm: 5, origin: "centre" });
    expect(JSON.parse(localStorage.getItem("osct-preview")!)).toMatchObject({ grid: true, gridMm: 5, origin: "centre" });
    expect(clampGrid(0)).toBe(1);
    expect(clampGrid(9000)).toBe(500);
  });

  it("keeps the vertical axis and the snapping (#190)", async () => {
    updatePreview({ axis: false, snap: true, snapTo: ["axes", "outlines"], snapMove: 2.5, snapRotate: 45, snapScale: 0.25 });
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ axis: false, snap: true, snapTo: ["axes", "outlines"], snapMove: 2.5, snapRotate: 45, snapScale: 0.25 });
  });

  it("ignores broken stored snapping, clamps the precision, drops unknown targets", async () => {
    localStorage.setItem("osct-preview", JSON.stringify({ axis: "yes", snap: 1, snapTo: ["grid", "stars", "outlines"], snapMove: 0, snapRotate: "x", snapScale: 9 }));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ axis: true, snap: false, snapTo: ["grid", "outlines"], snapMove: 0.1, snapRotate: 15, snapScale: 1 });
  });

  it("ignores broken stored values when it loads", async () => {
    localStorage.setItem("osct-preview", JSON.stringify({ view: "sideways", wobble: 7, hdri: "lava", desk: "ikea", orbit: { distance: "far" }, grid: "yes", gridMm: "x", origin: "middle" }));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ view: "reader", wobble: 1, hdri: "wooden_studio_17", top: "plywood", orbit: null, active: false, grid: false, gridMm: 10, origin: "top-left" });
  });

  it("stores the desk's top, plywood or linoleum (#226)", async () => {
    updatePreview({ top: "linoleum" });
    expect(JSON.parse(localStorage.getItem("osct-preview")!)).toMatchObject({ top: "linoleum" });
    expect(JSON.parse(localStorage.getItem("osct-preview")!)).not.toHaveProperty("desk");
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview().top).toBe("linoleum");
    expect(fresh.TOPS.map(t => t.id)).toEqual(["plywood", "linoleum"]);
  });

  it.each([
    [{ desk: "schoepfer" }, "linoleum"],
    [{ desk: "eiermann" }, "plywood"],
    [{ desk: "toString" }, "plywood"],
    [{ desk: "schoepfer", top: "plywood" }, "plywood"],
    [{ top: "glass" }, "plywood"],
  ])("maps a desk stored before #226 to its top: %j → %s, so nobody's stage breaks", async (stored, top) => {
    localStorage.setItem("osct-preview", JSON.stringify(stored));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview().top).toBe(top);
    expect(fresh.storedTop(stored)).toBe(top);
  });
});

// The Stage panel's stage section closed (#193): its head names the desk, its top (#226) and the grid
describe("the stage section's summary", () => {
  it("names the desk, its top and the grid, off or with its spacing", () => {
    expect(stageSummary({ top: "plywood", grid: false, gridMm: 10 })).toBe("Eiermann · plywood · grid off");
    expect(stageSummary({ top: "linoleum", grid: false, gridMm: 10 })).toBe("Eiermann · linoleum · grid off");
    expect(stageSummary({ top: "linoleum", grid: true, gridMm: 25 })).toBe("Eiermann · linoleum · grid 25 mm");
  });

  it("says when snapping is on (#190)", () => {
    expect(stageSummary({ top: "plywood", grid: true, gridMm: 10, snap: true })).toBe("Eiermann · plywood · grid 10 mm · snap on");
    expect(stageSummary({ top: "plywood", grid: false, gridMm: 10, snap: false })).toBe("Eiermann · plywood · grid off");
  });
});
