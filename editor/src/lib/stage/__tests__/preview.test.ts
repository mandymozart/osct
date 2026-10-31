import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPreviewSync, clampGrid, getPreview, previewSync, setPreviewActive, setTargetHidden, subscribePreview, updatePreview, viewSummary } from "../preview";

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

// The toolbar's view group (#229 – the Stage tab's stage section until then): its tooltip names the desk and its top
// (#226), the origin, the hand shake and the sky
describe("the view group's summary", () => {
  const view = { top: "plywood", wobble: 0, origin: "top-left", hdri: "wooden_studio_17" } as const;

  it("names the desk, its top, the origin, the shake and the HDRI", () => {
    expect(viewSummary(view)).toBe("Eiermann · plywood · origin top left · no shake · sky Wooden Studio 17");
    expect(viewSummary({ ...view, top: "linoleum", wobble: 0.35, origin: "bottom-right", hdri: "ferndale_studio_04" }))
      .toBe("Eiermann · linoleum · origin bottom right · shake 0.35 · sky Ferndale Studio 04");
  });

  it("names the centre by the spread's format: the book's on a double page, the page's on a cover", () => {
    expect(viewSummary({ ...view, origin: "centre" })).toContain("origin book centre");
    expect(viewSummary({ ...view, origin: "centre" }, { format: "cover" })).toContain("origin page centre");
  });

  it("says the book's environment is the sky, not the HDRI (#185)", () => {
    expect(viewSummary(view, { environment: true })).toBe("Eiermann · plywood · origin top left · no shake · the environment's sky");
  });

  it("leaves the grid and snapping to the grid & snap group", () => {
    expect(viewSummary(view)).not.toMatch(/grid|snap/);
  });
});

describe("the view group's settings (#229)", () => {
  beforeEach(() => localStorage.clear());

  it("stores shake, origin, top and sky in this browser and tells the subscribers", () => {
    const seen: string[] = [];
    const unsubscribe = subscribePreview(state => seen.push(viewSummary(state)));
    updatePreview({ wobble: 0.5, origin: "centre", top: "linoleum", hdri: "wooden_studio_13" });
    expect(JSON.parse(localStorage.getItem("osct-preview")!)).toMatchObject({ wobble: 0.5, origin: "centre", top: "linoleum", hdri: "wooden_studio_13" });
    expect(seen.at(-1)).toBe("Eiermann · linoleum · origin book centre · shake 0.5 · sky Wooden Studio 13");
    unsubscribe();
  });

  it("reads them back in a fresh page", async () => {
    localStorage.setItem("osct-preview", JSON.stringify({ wobble: 0.2, origin: "bottom-centre", top: "linoleum", hdri: "wooden_studio_19" }));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ wobble: 0.2, origin: "bottom-centre", top: "linoleum", hdri: "wooden_studio_19" });
  });
});

describe("the preview kept in step with the stage frame (#234)", () => {
  beforeEach(() => {
    localStorage.clear();
    updatePreview({ view: "reader", orbit: null, shading: "rendered", wobble: 0, hidden: [] });
  });

  it("gives the same text for the same preview, whatever order or extra the value has", () => {
    const sync = previewSync();
    expect(previewSync({ ...JSON.parse(sync), active: true, extra: 1 })).toBe(sync);
    expect(JSON.parse(sync)).not.toHaveProperty("active");
  });

  it("takes what the other side sent, checked: a wrong value is the default, the same preview changes nothing", () => {
    const seen: string[] = [];
    const unsubscribe = subscribePreview(state => seen.push(state.shading));
    expect(applyPreviewSync(previewSync())).toBe(false);
    expect(applyPreviewSync(JSON.stringify({ ...JSON.parse(previewSync()), shading: "solid", hidden: ["key", 3] }))).toBe(true);
    expect(getPreview()).toMatchObject({ shading: "solid", hidden: ["key"] });
    expect(applyPreviewSync(JSON.stringify({ shading: "<script>", wobble: "lots" }))).toBe(true);
    expect(getPreview()).toMatchObject({ shading: "rendered", wobble: 0 });
    expect(applyPreviewSync("not json")).toBe(false);
    expect(seen).toEqual(["solid", "rendered"]);
    unsubscribe();
  });
});
