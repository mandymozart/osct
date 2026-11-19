import { beforeEach, describe, expect, it } from "vitest";
import { readSurfaceGrids, sceneSurfaceGrids, surfaceGrids, withSurfaceGrid } from "../surface-grids.svelte";
import { getPreview } from "../stage/preview";

/** #316 part 1: a surface's own grid spacing, kept in this browser per experience and surface, the open scene's handed to the stage */

describe("a surface's own grid", () => {
  beforeEach(() => localStorage.clear());

  it("reads an experience's spacings, leaving out what is no spacing, clamped", () => {
    localStorage.setItem("osct-editor-surface-grids:demo", JSON.stringify({ "s1/wall": 25, "s1/page": 9000, nope: 5, "s2/x": "5" }));
    expect(readSurfaceGrids("demo")).toEqual({ "s1/wall": 25, "s1/page": 500 });
    expect(readSurfaceGrids("other")).toEqual({});
  });

  it("one scene's spacings by surface id; set and drop one", () => {
    const all = { "s1/wall": 25, "s2/wall": 10 };
    expect(sceneSurfaceGrids(all, "s1")).toEqual({ wall: 25 });
    expect(withSurfaceGrid(all, "s1", "page", 0)).toEqual({ "s1/wall": 25, "s2/wall": 10, "s1/page": 1 });
    expect(withSurfaceGrid(all, "s1", "wall", null)).toEqual({ "s2/wall": 10 });
  });

  it("the open scene's spacings reach the stage's preview; a change is stored per experience", () => {
    surfaceGrids.enter("demo", "s1");
    surfaceGrids.set("s1", "wall", 40);
    surfaceGrids.set("s2", "page", 12);
    expect(getPreview().surfaceGrids).toEqual({ wall: 40 });
    expect(surfaceGrids.of("s1", "wall")).toBe(40);
    expect(JSON.parse(localStorage.getItem("osct-editor-surface-grids:demo")!)).toEqual({ "s1/wall": 40, "s2/page": 12 });
    surfaceGrids.enter("demo", "s2");
    expect(getPreview().surfaceGrids).toEqual({ page: 12 });
    surfaceGrids.set("s2", "page", null);
    expect(getPreview().surfaceGrids).toEqual({});
    expect(surfaceGrids.of("s2", "page")).toBeNull();
  });
});
