import { beforeEach, describe, expect, it } from "vitest";
import { readSurfaceGrids, sceneSurfaceGrids, surfaceGrids, withSurfaceGrid } from "../surface-grids.svelte";
import { getPreview } from "../stage/preview";

/** #316, #314: a surface's own grid – spacing, subdivisions, on / off, snap – kept in this browser per experience and surface */

describe("a surface's own grid", () => {
  beforeEach(() => localStorage.clear());

  it("reads an experience's grids – a number stored before is a spacing –, leaving out what is no grid, clamped", () => {
    localStorage.setItem("osct-editor-surface-grids:demo", JSON.stringify({ "s1/wall": 25, "s1/page": 9000, nope: 5, "s2/x": "5", "s2/y": { sub: 4, on: false } }));
    expect(readSurfaceGrids("demo")).toEqual({ "s1/wall": { mm: 25 }, "s1/page": { mm: 500 }, "s2/y": { sub: 4, on: false } });
    expect(readSurfaceGrids("other")).toEqual({});
  });

  it("one scene's grids by surface id; a field set, a field back to the toolbar's, the whole grid dropped", () => {
    const all = { "s1/wall": { mm: 25 }, "s2/wall": { mm: 10 } };
    expect(sceneSurfaceGrids(all, "s1")).toEqual({ wall: { mm: 25 } });
    expect(withSurfaceGrid(all, "s1", "page", { mm: 0 })).toEqual({ ...all, "s1/page": { mm: 1 } });
    expect(withSurfaceGrid(all, "s1", "wall", { sub: 4, snap: false })).toEqual({ ...all, "s1/wall": { mm: 25, sub: 4, snap: false } });
    expect(withSurfaceGrid(all, "s1", "wall", { mm: null })).toEqual({ "s2/wall": { mm: 10 } });
    expect(withSurfaceGrid(all, "s1", "wall", null)).toEqual({ "s2/wall": { mm: 10 } });
  });

  it("the open scene's grids reach the stage's preview; a change is stored per experience", () => {
    surfaceGrids.enter("demo", "s1");
    surfaceGrids.set("s1", "wall", { mm: 40, on: true });
    surfaceGrids.set("s2", "page", { mm: 12 });
    expect(getPreview().surfaceGrids).toEqual({ wall: { mm: 40, on: true } });
    expect(surfaceGrids.of("s1", "wall")).toEqual({ mm: 40, on: true });
    expect(JSON.parse(localStorage.getItem("osct-editor-surface-grids:demo")!)).toEqual({ "s1/wall": { mm: 40, on: true }, "s2/page": { mm: 12 } });
    surfaceGrids.enter("demo", "s2");
    expect(getPreview().surfaceGrids).toEqual({ page: { mm: 12 } });
    surfaceGrids.set("s2", "page", null);
    expect(getPreview().surfaceGrids).toEqual({});
    expect(surfaceGrids.of("s2", "page")).toBeNull();
  });
});
