import { describe, expect, it } from "vitest";
import { Group, Mesh, Object3D } from "three";
import { nearPointer, nodeOf, PICK_PX, pickable, pickByMode, pickForMenu, samePick, type StageHit } from "../pick";

const node = (targetId: string, path: number[]): StageHit => ({ kind: "node", targetId, path });
const print = (targetId: string): StageHit => ({ kind: "print", targetId });

describe("the pick filter: strict modes", () => {
  const overAnEntity = [node("key", [0, 1]), print("key")];
  const onThePageOnly = [print("tally")];

  it("entities picks only an entity – its root, from any of its nodes", () => {
    expect(pickByMode("entity", overAnEntity)).toEqual({ targetId: "key", path: [] });
    expect(pickByMode("entity", onThePageOnly)).toBeNull();
    expect(pickByMode("entity", [])).toBeNull();
  });

  it("nodes picks only the node under the pointer, as deep as the tree goes", () => {
    expect(pickByMode("node", overAnEntity)).toEqual({ targetId: "key", path: [0, 1] });
    expect(pickByMode("node", onThePageOnly)).toBeNull();
  });

  it("targets picks only a printed image, through an entity standing on it", () => {
    expect(pickByMode("target", overAnEntity)).toEqual({ targetId: "key", path: [], printed: true });
    expect(pickByMode("target", onThePageOnly)).toEqual({ targetId: "tally", path: [], printed: true });
    expect(pickByMode("target", [node("key", [])])).toBeNull();
  });

  it("takes the nearest of the mode's kind", () => {
    const hits = [print("a"), node("b", [2]), node("c", [])];
    expect(pickByMode("node", hits)).toEqual({ targetId: "b", path: [2] });
    expect(pickByMode("target", [node("b", []), print("a"), print("z")])).toMatchObject({ targetId: "a" });
  });

  it("the right click's menu falls back to the printed image under the pointer", () => {
    expect(pickForMenu("entity", onThePageOnly)).toEqual({ targetId: "tally", path: [], printed: true });
    expect(pickForMenu("node", overAnEntity)).toEqual({ targetId: "key", path: [0, 1] });
    expect(pickForMenu("entity", [])).toBeNull();
  });

  it("compares picks by target, level and path", () => {
    expect(samePick({ targetId: "a", path: [0] }, { targetId: "a", path: [0] })).toBe(true);
    expect(samePick({ targetId: "a", path: [] }, { targetId: "a", path: [], printed: true })).toBe(false);
    expect(samePick({ targetId: "a", path: [0] }, { targetId: "a", path: [1] })).toBe(false);
    expect(samePick(null, null)).toBe(true);
    expect(samePick(null, { targetId: "a", path: [] })).toBe(false);
  });
});

describe("the pick filter: what counts as a hit", () => {
  it("counts a particle or a line only where it is drawn, a few pixels around the pointer", () => {
    expect(nearPointer({ x: 100, y: 100 }, { x: 104, y: 105 })).toBe(true);
    expect(nearPointer({ x: 100, y: 100 }, { x: 100, y: 100 + PICK_PX + 1 })).toBe(false);
    expect(nearPointer({ x: 100, y: 100 }, { x: 112, y: 100 }, 12)).toBe(true);
  });

  it("climbs from a hit mesh to the node it belongs to", () => {
    const root = new Group();
    const child = new Group();
    const mesh = new Mesh();
    root.add(child);
    child.add(mesh);
    const nodes = new Map<Object3D, string>([[root, "root"], [child, "child"]]);
    expect(nodeOf(mesh, nodes)).toBe("child");
    expect(nodeOf(root, nodes)).toBe("root");
    expect(nodeOf(new Mesh(), nodes)).toBeNull();
  });

  it("ignores what is hidden – also by a parent, as a target switched off hides its anchor – and the editor's lines", () => {
    const anchor = new Group();
    const mesh = new Mesh();
    anchor.add(mesh);
    expect(pickable(mesh)).toBe(true);
    anchor.visible = false;
    expect(pickable(mesh)).toBe(false);
    const outline = new Object3D();
    outline.name = "editor-outline";
    expect(pickable(outline)).toBe(false);
    const rays = new Object3D();
    rays.name = "editor-light-lines";
    expect(pickable(rays)).toBe(false);
    const bulb = new Mesh();
    bulb.name = "editor-light-bulb";
    expect(pickable(bulb)).toBe(true);
  });
});
