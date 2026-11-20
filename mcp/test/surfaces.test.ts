import { describe, expect, it } from "vitest";
import { editSurfaces, presetSize } from "../src/surfaces.ts";

/** #314: put_surface's rule – one surface of a scene's list added, changed, moved or removed */

const PLACE = { x: 0, y: 0, z: 0 };
const LIST = [
  { id: "left", label: "4", widthMm: 230, heightMm: 320, place: { ...PLACE, x: -115 }, reference: { url: "/a.webp" } },
  { id: "right", widthMm: 230, heightMm: 320, place: { ...PLACE, x: 115 }, reference: null },
];
const ids = (r: ReturnType<typeof editSurfaces>) => (r.ok ? r.surfaces.map(s => s.id) : r.message);

describe("editSurfaces", () => {
  it("adds an unknown id with a preset's or a given size, last or at its position; drops the editor-only reference", () => {
    const wall = editSurfaces(LIST, { surface: "wall", preset: "wall" }, 8);
    expect(wall).toMatchObject({ ok: true, done: "added" });
    expect(wall.ok && wall.surfaces.at(-1)).toEqual({ id: "wall", widthMm: 2000, heightMm: 1500 });
    expect(wall.ok && wall.surfaces.every(s => !("reference" in s))).toBe(true);
    expect(ids(editSurfaces(LIST, { surface: "cover", widthMm: 100, heightMm: 200, position: 0 }, 8))).toEqual(["cover", "left", "right"]);
    expect(presetSize("double")).toEqual({ widthMm: 460, heightMm: 320 });
    expect(ids(editSurfaces(LIST, { surface: "x" }, 8))).toMatch(/needs its size/);
    expect(ids(editSurfaces(LIST, { surface: "x", preset: "single" }, 2))).toMatch(/at most 2/);
  });

  it("changes the fields sent: a preset's size, a size sent winning, the label (null: none), the place; moves by position", () => {
    const r = editSurfaces(LIST, { surface: "left", preset: "double", heightMm: 300, label: null, place: { x: 1, y: 2, z: 3, rx: 90 } }, 8);
    expect(r.ok && r.surfaces[0]).toEqual({ id: "left", widthMm: 460, heightMm: 300, place: { x: 1, y: 2, z: 3, rx: 90 } });
    expect(r).toMatchObject({ done: "changed" });
    expect(ids(editSurfaces(LIST, { surface: "left", position: 5 }, 8))).toEqual(["right", "left"]);
    expect(editSurfaces(LIST, { surface: "left", label: "4" }, 8)).toMatchObject({ ok: true, done: "unchanged" });
  });

  it("removes a known surface – never the last one, nor with other fields", () => {
    expect(editSurfaces(LIST, { surface: "left", remove: true }, 8)).toMatchObject({ ok: true, done: "removed", surfaces: [{ id: "right" }] });
    expect(ids(editSurfaces([LIST[1]], { surface: "right", remove: true }, 8))).toMatch(/at least one/);
    expect(ids(editSurfaces(LIST, { surface: "nope", remove: true }, 8))).toMatch(/no surface "nope".*left, right/);
    expect(ids(editSurfaces(LIST, { surface: "left", remove: true, position: 0 }, 8))).toMatch(/no other field/);
  });
});
