import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT, type EnvironmentData } from "@shared/types/environment";
import { bookEnvironment, environmentSkyLabel, showsWorld, stageLook } from "../sky";
import { SHADING_MODES } from "../preview";

const forest: EnvironmentData = { world: "cafe", onionSky: false, worldSrc: "https://cdn.test/lib/forest.glb", skySrc: "/assets/content/sky/dusk%20blue.jpg" };

describe("sky: the book's environment for the stage", () => {
  it("a book without one keeps the HDRI, until the author starts one", () => {
    expect(bookEnvironment(undefined, DEFAULT_ENVIRONMENT, false)).toBeNull();
    expect(bookEnvironment(undefined, forest, true)).toBe(forest);
  });

  it("a book with one shows the edited values (unsaved edits included)", () => {
    expect(bookEnvironment(DEFAULT_ENVIRONMENT, DEFAULT_ENVIRONMENT, false)).toBe(DEFAULT_ENVIRONMENT);
    expect(bookEnvironment(DEFAULT_ENVIRONMENT, forest, true)).toBe(forest);
  });
});

describe("sky: when the world is drawn", () => {
  it("with an environment, while rendered – it takes the HDRI's place", () => {
    expect(showsWorld({ environment: true, previewing: false, shading: "rendered" })).toBe(true);
    for (const shading of ["wireframe", "solid", "textured"] as const) expect(showsWorld({ environment: true, previewing: false, shading })).toBe(false);
  });

  it("in every shading while the Environment tab previews it", () => {
    for (const shading of SHADING_MODES) expect(showsWorld({ environment: true, previewing: true, shading })).toBe(true);
  });

  it("never without an environment", () => {
    for (const shading of SHADING_MODES) {
      expect(showsWorld({ environment: false, previewing: false, shading })).toBe(false);
      expect(showsWorld({ environment: false, previewing: true, shading })).toBe(false);
    }
  });
});

describe("sky: which sky and which light", () => {
  it("the world: the scene's own lights as in the reader – the HDRI only behind it, in its camera window, while rendered", () => {
    expect(stageLook({ shading: "rendered", hdri: "wooden_studio_17", world: true })).toEqual({ sky: "world", light: "scene", hdri: "wooden_studio_17", behindWorld: true });
    for (const shading of ["wireframe", "solid", "textured"] as const) {
      expect(stageLook({ shading, hdri: "wooden_studio_17", world: true })).toEqual({ sky: "world", light: "scene", hdri: null, behindWorld: false });
    }
  });

  it("the world never takes the HDRI's light, in any shading", () => {
    for (const shading of SHADING_MODES) expect(stageLook({ shading, hdri: "ferndale_studio_04", world: true }).light).toBe("scene");
  });

  it("without a world the HDRI shows and lights while rendered, as before", () => {
    expect(stageLook({ shading: "rendered", hdri: "ferndale_studio_04", world: false })).toEqual({ sky: "hdri", light: "hdri", hdri: "ferndale_studio_04", behindWorld: false });
  });

  it("other shadings: no sky, the scene's lights", () => {
    for (const shading of ["wireframe", "solid", "textured"] as const) {
      expect(stageLook({ shading, hdri: "wooden_studio_17", world: false })).toEqual({ sky: "none", light: "scene", hdri: null, behindWorld: false });
    }
    expect(stageLook({ shading: "rendered", hdri: null, world: false })).toEqual({ sky: "none", light: "scene", hdri: null, behindWorld: false });
  });
});

describe("sky: the picker's note", () => {
  it("names the built-in world", () => {
    expect(environmentSkyLabel(DEFAULT_ENVIRONMENT)).toBe("the environment's (world café)");
  });

  it("names the files: the Library's name, else the URL's last part", () => {
    expect(environmentSkyLabel(forest)).toBe("the environment's (world forest.glb, sky dusk blue.jpg)");
    expect(environmentSkyLabel(forest, url => (url.endsWith(".glb") ? "Forest" : undefined))).toBe("the environment's (world Forest, sky dusk blue.jpg)");
  });
});
