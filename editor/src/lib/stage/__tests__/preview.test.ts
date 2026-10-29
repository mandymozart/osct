import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPreview, setPreviewActive, setTargetHidden, subscribePreview, updatePreview } from "../preview";

describe("editor preview settings", () => {
  beforeEach(() => {
    localStorage.clear();
    setPreviewActive(false);
    updatePreview({ view: "reader", orbit: null, backdrop: "table", photo: null, wobble: 0, hidden: [] });
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
    updatePreview({ view: "top", wobble: 0.4, backdrop: "paper" });
    setTargetHidden("a", true);
    setPreviewActive(true);
    const stored = JSON.parse(localStorage.getItem("osct-preview")!);
    expect(stored).toEqual({ view: "top", shading: "rendered", orbit: null, backdrop: "paper", hdri: "ferndale_studio_04", desk: "eiermann", photo: null, wobble: 0.4 });
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

  it("ignores broken stored values when it loads", async () => {
    localStorage.setItem("osct-preview", JSON.stringify({ view: "sideways", wobble: 7, backdrop: "lava", desk: "ikea", photo: "http://x", orbit: { distance: "far" } }));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ view: "reader", wobble: 1, backdrop: "hdri", hdri: "ferndale_studio_04", desk: "eiermann", photo: null, orbit: null, active: false });
  });
});
