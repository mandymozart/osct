import { describe, expect, it } from "vitest";
import type { Target } from "@engine/types";
import {
  defaultSurfaceOf, fitImage, hitSurfaces, legacySurfaces, ownRect, pageFrames, printSideOf, rowCentres, sceneFrames, sceneSurfaces, surfaceFrame,
  surfaceRects, toStage, toSurface, type V3,
} from "../surfaces";
import { draggedPlace, grabOffset, printCentre, surfaceAxes } from "../placement";
import { layoutTargets } from "../mock-tracker";
import { frameBox, gridAreas, originPoint } from "../origin";
import { pageLines, printStageBox, snapPlace } from "../snap";

/** The scene's surfaces on the stage (#314): where each lies, and a surface's mm and the stage's */

const page = { width: 230, height: 320 };
const close = (actual: readonly number[], expected: readonly number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
const down: V3 = [0, 0, -1];

describe("surfaces: the fixed row", () => {
  it("keeps the book of content without surfaces: the open book's two pages around the spine, a cover centred", () => {
    expect(legacySurfaces("spread", page).map(s => s.id)).toEqual(["left", "right"]);
    expect(legacySurfaces("cover", page).map(s => s.side)).toEqual(["front"]);
    const [left, right] = sceneFrames({ format: "spread" }, page);
    close(left.origin, [-230, 160, 0]);
    close(right.origin, [0, 160, 0]);
    expect(left.flat && right.flat).toBe(true);
    expect(left.own).toBe(false);
    close(sceneFrames({ format: "back" }, page)[0].origin, [-115, 160, 0]);
  });

  it("lays a scene's own surfaces side by side, each at its own size, the row centred on the origin", () => {
    expect(rowCentres([100, 200, 100])).toEqual([-150, 0, 150]);
    const foldOut = { surfaces: [
      { id: "a", side: "left", widthMm: 230, heightMm: 320 },
      { id: "b", side: "middle", widthMm: 220, heightMm: 300 },
      { id: "c", side: "right", widthMm: 230, heightMm: 320 },
    ] };
    const [a, b, c] = sceneFrames(foldOut, page);
    close(a.origin, [-340, 160, 0]);
    // The middle page, lower: centred on the row's axis
    close(b.origin, [-110, 150, 0]);
    close(c.origin, [110, 160, 0]);
    expect([a.own, b.flat]).toEqual([true, true]);
    expect(surfaceRects([a, b, c]).map(r => [r.id, r.left, r.top])).toEqual([["a", -340, 160], ["b", -110, 150], ["c", 110, 160]]);
  });

  it("ignores the places of a fixed scene, and a free layout without surfaces of its own", () => {
    const surfaces = [{ id: "w", side: "wall", widthMm: 400, heightMm: 300, place: { x: 0, y: 150, z: -200, rx: 90 } }];
    expect(sceneSurfaces({ surfaces, layout: "fixed" }, page)[0].place).toEqual({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    expect(sceneSurfaces({ layout: "free", format: "spread" }, page).map(s => s.place.x)).toEqual([-115, 115]);
    // A surface of no size is no surface: the format's pages stand in
    expect(sceneSurfaces({ surfaces: [{ id: "x", side: "left", widthMm: 0, heightMm: 10 }] }, page).map(s => s.id)).toEqual(["left", "right"]);
  });
});

describe("surfaces: the free layout", () => {
  const scene = { layout: "free" as const, surfaces: [
    { id: "page", side: "right", widthMm: 200, heightMm: 300 },
    { id: "wall", side: "wall", widthMm: 400, heightMm: 300, place: { x: 0, y: 150, z: -400, rx: 90 } },
    { id: "turned", side: "right", widthMm: 100, heightMm: 100, place: { x: 300, y: 0, z: 0, ry: 90 } },
  ] };

  it("places each surface at its place; one without a place keeps its place in the row", () => {
    const [own, wall, turned] = sceneSurfaces(scene, page);
    // The row of all three: 200 + 400 + 100 = 700 wide, the page's centre at −250
    expect(own.place).toEqual({ x: -250, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    expect(wall.place).toEqual({ x: 0, y: 150, z: -400, rx: 90, ry: 0, rz: 0 });
    expect(turned.place.ry).toBe(90);
  });

  it("stands a wall (rx 90) up, its face towards the reader, its top edge up", () => {
    const wall = sceneFrames(scene, page)[1];
    expect(wall.flat).toBe(false);
    // The stage frame: x right, y away from the reader, z up – the wall's face looks towards the reader (−y)
    close(wall.normal, [0, -1, 0]);
    close(wall.right, [1, 0, 0]);
    close(wall.down, [0, 0, -1]);
    // Its top left corner: 200 left of its centre, 150 above it (centre 150 high, 400 away from the reader)
    close(wall.origin, [-200, 400, 300]);
    close(toStage(wall, 200, 300), [0, 400, 0]);
  });

  it("turns a surface about the vertical (ry): no longer square to the table's axes, not flat for the 2D grid", () => {
    const turned = sceneFrames(scene, page)[2];
    close(turned.normal, [0, 0, 1]);
    close(turned.right, [0, 1, 0]);
    expect(turned.flat).toBe(false);
  });
});

describe("surfaces: a hit on the stage in a surface's millimetres", () => {
  it("finds the page under a ray from above, in mm from its top left corner", () => {
    const frames = sceneFrames({ format: "spread" }, page);
    expect(hitSurfaces(frames, [-30, 100, 500], down)).toEqual({ surface: "left", x: 200, y: 60 });
    expect(hitSurfaces(frames, [10, -100, 500], down)).toEqual({ surface: "right", x: 10, y: 260 });
    // Beyond the edge: the nearest page (a drag past the outer edge stays on it)
    expect(hitSurfaces(frames, [260, 0, 500], down)).toEqual({ surface: "right", x: 260, y: 160 });
    // Away from the table: nothing
    expect(hitSurfaces(frames, [0, 0, 500], [0, 0, 1])).toBeNull();
  });

  it("finds the middle page of a fold-out and a wall in front of the table", () => {
    const frames = sceneFrames({ layout: "free", surfaces: [
      { id: "l", side: "left", widthMm: 230, heightMm: 320 },
      { id: "m", side: "middle", widthMm: 230, heightMm: 320 },
      { id: "w", side: "wall", widthMm: 400, heightMm: 300, place: { x: 0, y: 150, z: -400, rx: 90 } },
    ] }, page);
    expect(hitSurfaces(frames, [0, 0, 500], down)?.surface).toBe("m");
    // From the reader's side, level, towards the wall: 100 mm up the wall, 50 right of its middle
    expect(hitSurfaces(frames, [50, -1000, 100], [0, 1, 0])).toEqual({ surface: "w", x: 250, y: 200 });
  });

  it("reads a stage point back on its surface", () => {
    const wall = sceneFrames({ layout: "free", surfaces: [{ id: "w", side: "wall", widthMm: 400, heightMm: 300, place: { x: 0, y: 150, z: -400, rx: 90 } }] }, page)[0];
    expect(toSurface(wall, toStage(wall, 12, 34))).toEqual({ x: 12, y: 34 });
  });
});

describe("surfaces: prints on them", () => {
  const frames = sceneFrames({ layout: "free", surfaces: [
    { id: "p", side: "right", widthMm: 200, heightMm: 300 },
    { id: "w", side: "wall", widthMm: 400, heightMm: 300, place: { x: 0, y: 150, z: -400, rx: 90 } },
  ] }, page);

  it("centres a print on a wall in the wall's plane, turned with it", () => {
    expect(printCentre({ surface: "w", x: 100, y: 50, width: 40, height: 20 }, frames)).toEqual({ x: -80, y: 400, z: 240 });
    const axes = surfaceAxes(frames, "w");
    close(axes.z, [0, -1, 0]);
    close(axes.y, [0, 0, 1]);
  });

  it("drags a print across surfaces: the grab point holds, the surface is the one under the pointer", () => {
    const place = { surface: "w", x: 100, y: 50, width: 40 };
    const grab = grabOffset(place, { surface: "w", x: 110, y: 60 }, frames);
    expect(grab).toEqual({ grabX: 10, grabY: 10 });
    expect(draggedPlace(place, { kind: "move", ...grab }, { surface: "p", x: 30, y: 40 }, frames)).toEqual({ ...place, surface: "p", x: 20, y: 30 });
  });

  it("lays targets on their surface: the surfaceId wins, else the side, else the scene's fallback", () => {
    const target = (id: string, print?: Target["print"]): Target => ({ id, imageSrc: `/${id}.jpg`, ...(print ? { print } : {}) }) as Target;
    const laid = layoutTargets([
      target("a", { surface: "right", surfaceId: "w", x: 1, y: 2, width: 30 }),
      target("b", { surface: "right", x: 1, y: 2, width: 30 }),
      target("c", { surface: "left", surfaceId: "gone", x: 1, y: 2, width: 30 }),
    ], {}, page, null, "spread", frames);
    expect(laid.map(t => t.surface)).toEqual(["w", "p", "p"]);
    expect(defaultSurfaceOf(frames, "spread")?.id).toBe("p");
    // Without surfaces the sides are the surfaces, as before
    expect(layoutTargets([target("d", { surface: "left", x: 0, y: 0, width: 10 })]).map(t => t.surface)).toEqual(["left"]);
  });

  it("writes the side apps before 2.36 know next to the surface's id", () => {
    expect(printSideOf("left", "spread")).toBe("left");
    expect(printSideOf("middle", "spread")).toBe("right");
    expect(printSideOf("wall", "cover")).toBe("front");
  });
});

describe("surfaces: grid and snapping count on the table", () => {
  const rects = surfaceRects(sceneFrames({ surfaces: [
    { id: "a", side: "left", widthMm: 200, heightMm: 300 },
    { id: "b", side: "middle", widthMm: 200, heightMm: 300 },
    { id: "c", side: "right", widthMm: 200, heightMm: 300 },
  ] }, page));
  const frame = { page, format: "spread" as const, surfaces: rects };

  it("grids each surface from its own corner, or the whole row from the scene's origin", () => {
    expect(frameBox(frame)).toEqual({ left: -300, top: 150, width: 600, height: 300 });
    expect(gridAreas("top-left", frame).map(a => [a.left, a.zeroX])).toEqual([[0, 0], [200, 200], [400, 400]]);
    expect(gridAreas("centre", frame)).toEqual([{ left: 0, top: 0, width: 600, height: 300, zeroX: 300, zeroY: 150 }]);
    expect(originPoint("centre", frame, "b")).toEqual({ x: 100, y: 150 });
  });

  it("snaps to every surface's edges, and a print's box on the middle page", () => {
    expect(pageLines(frame)[0].map(l => l.at)).toEqual([-300, -100, 100, 300]);
    expect(printStageBox({ surface: "b", x: 10, y: 20, width: 50 }, 40, frame)).toEqual({ min: [-90, 90, 0], max: [-40, 130, 0] });
  });

  it("snaps a print on a wall in the wall's own plane: its edges", () => {
    const wall = ownRect({ id: "w", side: "wall", widthMm: 400, heightMm: 300 });
    const local = { page, format: "spread" as const, surfaces: [wall], local: true };
    const lines = pageLines(local);
    const { place } = snapPlace({ surface: "w", x: 2, y: 3, width: 50 }, 40, "move", {
      frame: local, lines, threshold: 5, settings: { snapTo: ["outlines"], gridMm: 10, snapMove: 1, origin: "top-left" },
    });
    expect(place).toMatchObject({ x: 0, y: 0 });
  });
});

describe("surfaces: reference images fitted", () => {
  it("stretches, covers (cropping the middle) or contains (whole, centred) an image on a surface", () => {
    expect(fitImage("stretch", 2, 200, 300)).toEqual({ width: 200, height: 300, repeat: [1, 1], offset: [0, 0] });
    // A landscape image (aspect 0.5) on a portrait page: cover shows its middle third
    const cover = fitImage("cover", 0.5, 200, 300);
    expect(cover.repeat[0]).toBeCloseTo(1 / 3, 6);
    expect(cover.offset[0]).toBeCloseTo(1 / 3, 6);
    expect(fitImage("contain", 0.5, 200, 300)).toEqual({ width: 200, height: 100, repeat: [1, 1], offset: [0, 0] });
    expect(fitImage("contain", 3, 200, 300).width).toBeCloseTo(100, 6);
  });
});

describe("surfaces: a page size stands for the book without surfaces", () => {
  it("has all four sides, each where the open or the closed book has it", () => {
    expect(pageFrames(page).map(f => [f.id, f.origin[0]])).toEqual([["left", -230], ["right", 0], ["front", -115], ["back", -115]]);
    expect(surfaceFrame(sceneSurfaces({ format: "cover" }, page)[0]).flat).toBe(true);
  });
});
