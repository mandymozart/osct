import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampGrid, getPreview, isNodeHidden, isNodeKey, MAX_HIDDEN_NODES, nodeKey, parseHiddenNodes, parseNodeKey, parseSettings, setNodeHidden, setPreviewActive,
  parseSurfaceGrids, setTargetHidden, subscribePreview, surfaceGridOf, updatePreview, viewSummary,
} from "../preview";

describe("editor preview settings", () => {
  beforeEach(() => {
    localStorage.clear();
    setPreviewActive(false);
    updatePreview({ view: "reader", orbit: null, hdri: "ferndale_studio_04", wobble: 0, hidden: [], hiddenNodes: [] });
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
      view: "top", shading: "rendered", orbit: null, hdri: "wooden_studio_07", hdriOn: true, desk: true, meshLines: false, top: "plywood", textureQuality: "auto", wobble: 0.4, grid: false, gridMm: 10, origin: "top-left",
      axis: true, floorGrid: true, floorMm: 50, wallGrid: false, wallZ: -500, targetMarks: false, snap: false, snapTo: ["grid", "axes", "objects", "outlines"], snapMove: 1, snapRotate: 15, snapScale: 0.1,
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

  it("hides and shows nodes on the stage only (#311): never stored, forgotten when the editor closes", () => {
    setPreviewActive(true);
    setNodeHidden("key", [0, 2], true);
    setNodeHidden("key", [0, 2], true);
    setNodeHidden("key", [], true);
    setNodeHidden("door", [1], true);
    expect(getPreview().hiddenNodes).toEqual(["key:0.2", "key:", "door:1"]);
    expect(localStorage.getItem("osct-preview")).not.toContain("hiddenNodes");
    setNodeHidden("key", [], false);
    expect(getPreview().hiddenNodes).toEqual(["key:0.2", "door:1"]);
    setPreviewActive(false);
    expect(getPreview().hiddenNodes).toEqual([]);
  });

  it("a node is hidden by itself or by a node above it, never by a sibling or another target", () => {
    const hidden = ["key:0", "door:"];
    expect(isNodeHidden(hidden, "key", [0])).toBe(true);
    expect(isNodeHidden(hidden, "key", [0, 3, 1])).toBe(true);
    expect(isNodeHidden(hidden, "key", [])).toBe(false);
    expect(isNodeHidden(hidden, "key", [1, 0])).toBe(false);
    expect(isNodeHidden(hidden, "door", [4])).toBe(true);
    expect(isNodeHidden(hidden, "keys", [0])).toBe(false);
  });

  it("names a node by its target and path, and reads only such names back", () => {
    expect(nodeKey("key", [0, 12])).toBe("key:0.12");
    expect(nodeKey("key", [])).toBe("key:");
    expect(parseNodeKey("key:0.12")).toEqual({ targetId: "key", path: [0, 12] });
    expect(parseNodeKey("key:")).toEqual({ targetId: "key", path: [] });
    for (const bad of ["key", ":0", "key:0.", "key:a", "k ey:0", "a:b:0", "key:-1", `${"x".repeat(201)}:0`, `key:${Array(17).fill(0).join(".")}`, 3, null]) {
      expect(isNodeKey(bad), String(bad)).toBe(false);
    }
    expect(parseHiddenNodes(["key:0", "key:0", "bad", 7, "door:"])).toEqual(["key:0", "door:"]);
    expect(parseHiddenNodes("key:0")).toEqual([]);
    expect(parseHiddenNodes(Array.from({ length: 80 }, (_, i) => `t${i}:`))).toHaveLength(MAX_HIDDEN_NODES);
  });

  it("keeps the grid, its spacing and the origin, and clamps the spacing", () => {
    updatePreview({ grid: true, gridMm: 5, origin: "centre" });
    expect(JSON.parse(localStorage.getItem("osct-preview")!)).toMatchObject({ grid: true, gridMm: 5, origin: "centre" });
    expect(clampGrid(0)).toBe(1);
    expect(clampGrid(9000)).toBe(500);
  });

  it("keeps the floor grid and the vertical grid (#319), clamped; a broken stored one is the default", async () => {
    updatePreview({ floorGrid: false, floorMm: 25, wallGrid: true, wallZ: -800, targetMarks: true });
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ floorGrid: false, floorMm: 25, wallGrid: true, wallZ: -800, targetMarks: true });
    expect([fresh.clampFloorGrid(0), fresh.clampFloorGrid(5000), fresh.clampWallZ(-99999)]).toEqual([1, 1000, -10000]);
    localStorage.setItem("osct-preview", JSON.stringify({ floorGrid: "yes", floorMm: "x", wallGrid: 1, wallZ: null, targetMarks: "on" }));
    vi.resetModules();
    const broken = await import("../preview");
    expect(broken.getPreview()).toMatchObject({ floorGrid: true, floorMm: 50, wallGrid: false, wallZ: -500, targetMarks: false });
  });

  it("hands the open scene's surface grids (#316) to the stage, never stores them", () => {
    updatePreview({ snapTo: ["grid", "axes"], surfaceGrids: { wall: { mm: 25 }, page: { mm: 20, sub: 4 }, door: { snap: false } } });
    expect(JSON.parse(localStorage.getItem("osct-preview")!)).not.toHaveProperty("surfaceGrids");
    expect(surfaceGridOf(getPreview(), "wall")).toBe(25);
    expect(surfaceGridOf(getPreview(), "page")).toBe(5);
    expect(surfaceGridOf(getPreview(), "door")).toBeNull();
    expect(surfaceGridOf(getPreview(), "other")).toBe(getPreview().gridMm);
    expect(getPreview().surfaceGrids).toEqual({ wall: { mm: 25 }, page: { mm: 20, sub: 4 }, door: { snap: false } });
    expect(parseSurfaceGrids({ a: 0, "b c": 5, d: "5", e: 9000, f: { on: true } })).toEqual({ a: { mm: 1 }, e: { mm: 500 }, f: { on: true } });
    expect(parseSurfaceGrids([1])).toEqual({});
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
    expect(JSON.parse(localStorage.getItem("osct-preview")!).desk).toBe(true); // #358: the desk is a switch now, not a model
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview().top).toBe("linoleum");
    expect(fresh.TOPS.map(t => t.id)).toEqual(["plywood", "linoleum"]);
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

  it("names the centre the scene's", () => {
    expect(viewSummary({ ...view, origin: "centre" })).toContain("origin scene centre");
  });

  it("says the experience's environment is the sky, not the HDRI (#185)", () => {
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
    expect(seen.at(-1)).toBe("Eiermann · linoleum · origin scene centre · shake 0.5 · sky Wooden Studio 13");
    unsubscribe();
  });

  it("reads them back in a fresh page", async () => {
    localStorage.setItem("osct-preview", JSON.stringify({ wobble: 0.2, origin: "bottom-centre", top: "linoleum", hdri: "wooden_studio_19" }));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ wobble: 0.2, origin: "bottom-centre", top: "linoleum", hdri: "wooden_studio_19" });
  });
});

describe("the preview's values, checked", () => {
  beforeEach(() => {
    localStorage.clear();
    updatePreview({ view: "reader", orbit: null, shading: "rendered", wobble: 0, hidden: [] });
  });

  it("takes only well-formed hidden nodes (#311), each once", () => {
    expect(parseHiddenNodes(["key:0.1", "key:0.1", "<img>", 4])).toEqual(["key:0.1"]);
    expect(parseHiddenNodes("key:0")).toEqual([]);
  });

  it("keeps the texture quality the stage previews (#260): auto, or one of the four sizes – anything else is auto", () => {
    expect(parseSettings({ textureQuality: 2048 }).textureQuality).toBe(2048);
    expect(parseSettings({ textureQuality: "auto" }).textureQuality).toBe("auto");
    expect(parseSettings({ textureQuality: 800 }).textureQuality).toBe("auto");
    expect(parseSettings({}).textureQuality).toBe("auto");
  });
});

describe("the HDRI switch (#327)", () => {
  it("is on by default, kept off once switched off, and the stage then shows no HDRI", async () => {
    localStorage.clear();
    vi.resetModules();
    const preview = await import("../preview");
    expect(preview.getPreview().hdriOn).toBe(true);
    preview.updatePreview({ hdriOn: false });
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview().hdriOn).toBe(false);
    const { hdriOf } = await import("../mock-tracker");
    expect(hdriOf({ hdri: "wooden_studio_17", hdriOn: false })).toBeNull();
    expect(hdriOf({ hdri: "wooden_studio_17", hdriOn: true })).toBe("wooden_studio_17");
  });

  it("keeps the desk on unless it was switched off, and says so in the summary (#358)", () => {
    expect(parseSettings({}).desk).toBe(true);
    expect(parseSettings({ desk: "no" }).desk).toBe(true);
    expect(parseSettings({ desk: false }).desk).toBe(false);
    const view = { top: "plywood", wobble: 0, origin: "top-left", hdri: "wooden_studio_17" } as const;
    expect(viewSummary({ ...view, desk: false })).toBe("no desk · origin top left · no shake · sky Wooden Studio 17");
    expect(viewSummary({ ...view, desk: true })).toMatch(/^Eiermann · plywood/);
  });

  it("keeps the wire switch off unless it was switched on: a selection's mesh lines in Wire only (#362)", () => {
    expect(parseSettings({}).meshLines).toBe(false);
    expect(parseSettings({ meshLines: "yes" }).meshLines).toBe(false);
    expect(parseSettings({ meshLines: true }).meshLines).toBe(true);
  });
});
