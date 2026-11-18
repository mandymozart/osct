import { describe, expect, it } from "vitest";
import type { SurfaceData, Target } from "@engine/types";
import { DEFAULT_FRAME, fitImage, hitSurfaces, ownRect, sceneFrames, sceneSurfaces, surfaceRects, toStage, toSurface, type V3 } from "../surfaces";
import { draggedPlace, frameFor, grabOffset, printCentre, surfaceAxes } from "../placement";
import { layoutTargets } from "../mock-tracker";
import { flatFrame, frameBox, gridAreas, originPoint } from "../origin";
import { pageLines, printStageBox, snapPlace } from "../snap";
import { arrangeInRow } from "#lib/surface-edit.js";

/** The scene's surfaces on the stage (#314, #319 – schema 3.0: every surface at its place, no side) */

const close = (actual: readonly number[], expected: readonly number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
const down: V3 = [0, 0, -1];
const FLAT = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const surface = (id: string, widthMm: number, heightMm: number, place: Partial<SurfaceData["place"]> = {}): SurfaceData =>
  ({ id, widthMm, heightMm, place: { ...FLAT, ...place } });
const wallPlace = { x: 0, y: 150, z: -400, rx: 90 };

describe("surfaces: at their places", () => {
  it("a double page at the origin: one surface, its middle (the spine) at the scene's origin", () => {
    const [spread] = sceneFrames({ surfaces: [surface("surface", 460, 320)] });
    close(spread.origin, [-230, 160, 0]);
    expect(spread.flat).toBe(true);
    expect(surfaceRects([spread])).toEqual([{ id: "surface", left: -230, top: 160, width: 460, height: 320 }]);
  });

  it("a row arranged side by side, each at its own size, centred on the origin", () => {
    const row = arrangeInRow([surface("a", 230, 320), surface("b", 220, 300), surface("c", 230, 320)]);
    const [a, b, c] = sceneFrames({ surfaces: row });
    close(a.origin, [-340, 160, 0]);
    // The middle one, lower: centred on the row's axis
    close(b.origin, [-110, 150, 0]);
    close(c.origin, [110, 160, 0]);
    expect(surfaceRects([a, b, c]).map(r => [r.id, r.left, r.top])).toEqual([["a", -340, 160], ["b", -110, 150], ["c", 110, 160]]);
  });

  it("a place's broken numbers count 0; a surface of no size is no surface", () => {
    expect(sceneSurfaces({ surfaces: [{ id: "x", widthMm: 10, heightMm: 10, place: { ...FLAT, x: Number.NaN, z: 5 } }] })[0].place).toEqual({ ...FLAT, z: 5 });
    expect(sceneSurfaces({ surfaces: [surface("x", 0, 10)] })).toEqual([]);
    expect(sceneSurfaces(undefined)).toEqual([]);
  });

  it("no scene open: the stand-in double page", () => {
    expect(frameFor([], "anything")).toBe(DEFAULT_FRAME);
    close(DEFAULT_FRAME.origin, [-230, 160, 0]);
  });
});

describe("surfaces: standing and turned", () => {
  const scene = { surfaces: [surface("page", 200, 300), surface("wall", 400, 300, wallPlace), surface("turned", 100, 100, { x: 300, ry: 90 })] };

  it("stands a wall (rx 90) up, its face towards the reader, its top edge up", () => {
    const wall = sceneFrames(scene)[1];
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
    const turned = sceneFrames(scene)[2];
    close(turned.normal, [0, 0, 1]);
    close(turned.right, [0, 1, 0]);
    expect(turned.flat).toBe(false);
  });

  it("a raised surface (y above the table) is not on the table's grid", () => {
    expect(sceneFrames({ surfaces: [surface("shelf", 100, 100, { y: 40 })] })[0].flat).toBe(false);
  });
});

describe("surfaces: a hit on the stage in a surface's millimetres", () => {
  it("finds the surface under a ray from above, in mm from its top left corner", () => {
    const frames = sceneFrames({ surfaces: arrangeInRow([surface("l", 230, 320), surface("r", 230, 320)]) });
    expect(hitSurfaces(frames, [-30, 100, 500], down)).toEqual({ surface: "l", x: 200, y: 60 });
    expect(hitSurfaces(frames, [10, -100, 500], down)).toEqual({ surface: "r", x: 10, y: 260 });
    // Beyond the edge: the nearest surface (a drag past the outer edge stays on it)
    expect(hitSurfaces(frames, [260, 0, 500], down)).toEqual({ surface: "r", x: 260, y: 160 });
    // Away from the table: nothing
    expect(hitSurfaces(frames, [0, 0, 500], [0, 0, 1])).toBeNull();
  });

  it("finds a wall in front of the table", () => {
    const frames = sceneFrames({ surfaces: [surface("p", 460, 320), surface("w", 400, 300, wallPlace)] });
    // From the reader's side, level, towards the wall: 100 mm up the wall, 50 right of its middle
    expect(hitSurfaces(frames, [50, -1000, 100], [0, 1, 0])).toEqual({ surface: "w", x: 250, y: 200 });
  });

  it("reads a stage point back on its surface", () => {
    const wall = sceneFrames({ surfaces: [surface("w", 400, 300, wallPlace)] })[0];
    expect(toSurface(wall, toStage(wall, 12, 34))).toEqual({ x: 12, y: 34 });
  });
});

describe("surfaces: prints on them", () => {
  const frames = sceneFrames({ surfaces: [surface("p", 200, 300), surface("w", 400, 300, wallPlace)] });

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

  it("lays targets on their surface: the place's surface, else the scene's first", () => {
    const target = (id: string, place?: Target["place"]): Target => ({ id, imageSrc: `/${id}.jpg`, ...(place ? { place } : {}) }) as Target;
    const laid = layoutTargets([
      target("a", { surface: "w", x: 1, y: 2, width: 30 }),
      target("b", { x: 1, y: 2, width: 30 }),
      target("c", { surface: "gone", x: 1, y: 2, width: 30 }),
    ], {}, frames);
    expect(laid.map(t => t.surface)).toEqual(["w", "p", "p"]);
    expect(laid[1]).toMatchObject({ x: 1, y: 2, width: 30, height: 22.5 });
    // No place: a row across the first surface's middle
    const row = layoutTargets([target("d"), target("e")], {}, frames);
    expect(row.map(t => [t.surface, t.y])).toEqual([["p", 127.5], ["p", 127.5]]);
  });
});

describe("surfaces: grid and snapping count on the table", () => {
  const surfaces = arrangeInRow([surface("a", 200, 300), surface("b", 200, 300), surface("c", 200, 300)]);
  const frame = { surfaces: surfaceRects(sceneFrames({ surfaces })) };

  it("the frame from the content alone (the page side) is the stage's", () => {
    expect(flatFrame(surfaces)).toEqual(frame);
    // A standing or raised surface is not on the table
    expect(flatFrame([...surfaces, surface("w", 400, 300, wallPlace)]).surfaces).toHaveLength(3);
  });

  it("grids each surface from its own corner, or from the scene's origin – one area per surface (its own spacing, #316)", () => {
    expect(frameBox(frame)).toEqual({ left: -300, top: 150, width: 600, height: 300 });
    expect(gridAreas("top-left", frame).map(a => [a.surface, a.left, a.zeroX])).toEqual([["a", 0, 0], ["b", 200, 200], ["c", 400, 400]]);
    expect(gridAreas("centre", frame).map(a => [a.surface, a.left, a.zeroX, a.zeroY])).toEqual([["a", 0, 300, 150], ["b", 200, 300, 150], ["c", 400, 300, 150]]);
    expect(originPoint("centre", frame, "b")).toEqual({ x: 100, y: 150 });
  });

  it("snaps to every surface's edges, and a print's box on the middle surface", () => {
    expect(pageLines(frame)[0].map(l => l.at)).toEqual([-300, -100, 100, 300]);
    expect(printStageBox({ surface: "b", x: 10, y: 20, width: 50 }, 40, frame)).toEqual({ min: [-90, 90, 0], max: [-40, 130, 0] });
  });

  it("snaps a print on a wall in the wall's own plane: its edges", () => {
    const wall = ownRect({ id: "w", widthMm: 400, heightMm: 300 });
    const local = { surfaces: [wall], local: true };
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
