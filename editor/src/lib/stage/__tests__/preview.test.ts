import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPreview, setPreviewActive, setTargetHidden, subscribePreview, updatePreview } from "../preview";

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
    expect(stored).toEqual({ view: "top", shading: "rendered", orbit: null, hdri: "wooden_studio_07", desk: "eiermann", wobble: 0.4 });
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
    localStorage.setItem("osct-preview", JSON.stringify({ view: "sideways", wobble: 7, hdri: "lava", desk: "ikea", orbit: { distance: "far" } }));
    vi.resetModules();
    const fresh = await import("../preview");
    expect(fresh.getPreview()).toMatchObject({ view: "reader", wobble: 1, hdri: "ferndale_studio_04", desk: "eiermann", orbit: null, active: false });
  });
});
