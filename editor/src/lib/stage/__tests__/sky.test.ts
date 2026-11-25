import { describe, expect, it } from "vitest";
import { stageLook } from "../sky";
import { hdriName, isCustomHdri, isStageHdri, viewSummary } from "../preview";

describe("sky: which sky and which light", () => {
  it("the HDRI shows and lights while rendered", () => {
    expect(stageLook({ shading: "rendered", hdri: "ferndale_studio_04" })).toEqual({ sky: "hdri", light: "hdri", hdri: "ferndale_studio_04" });
  });

  it("other shadings, or the HDRI switched off: no sky, the scene's lights", () => {
    for (const shading of ["wireframe", "solid", "textured"] as const) {
      expect(stageLook({ shading, hdri: "wooden_studio_17" })).toEqual({ sky: "none", light: "scene", hdri: null });
    }
    expect(stageLook({ shading: "rendered", hdri: null })).toEqual({ sky: "none", light: "scene", hdri: null });
  });
});

// #371: the stage's own HDRI – one of the experience's Library, by its URL
describe("sky: the experience's own HDRI", () => {
  const own = "https://cdn.test/osct/assets/studio%20night.hdr";

  it("takes a Library HDRI's URL, besides the bundled ones", () => {
    expect(isCustomHdri(own)).toBe(true);
    expect(isCustomHdri("/assets/demo/dusk.hdr?v=2")).toBe(true);
    expect(isStageHdri("wooden_studio_17")).toBe(true);
    expect(isStageHdri(own)).toBe(true);
    // Not an HDR file, not an address
    expect(isStageHdri("https://cdn.test/sky.jpg")).toBe(false);
    expect(isStageHdri("night.hdr")).toBe(false);
  });

  it("is named by its file, the bundled ones by their names", () => {
    expect(hdriName(own)).toBe("studio night.hdr");
    expect(hdriName("wooden_studio_17")).toBe("Wooden Studio 17");
    expect(stageLook({ shading: "rendered", hdri: own }).hdri).toBe(own);
    expect(viewSummary({ top: "plywood", wobble: 0, origin: "top-left", hdri: own })).toContain("sky studio night.hdr");
  });
});
