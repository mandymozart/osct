import { describe, expect, it } from "vitest";
import { Group, Mesh, Object3D } from "three";
import { modelOf, nearPointer, nodeOf, PICK_KINDS, PICK_PX, pickable, pickByFilter, pickForMenu, samePick, toggleKind, type StageHit } from "../pick";

const node = (targetId: string, path: number[], model: number[] | null = null): StageHit => ({ kind: "node", targetId, path, model });
const print = (targetId: string): StageHit => ({ kind: "print", targetId });

describe("the pick filter: the select tool's filters", () => {
  const overAnEntity = [node("key", [0, 1], [0]), print("key")];
  const onThePageOnly = [print("tally")];

  it("lists the filters in the toolbar's order and switches one at a time", () => {
    expect(PICK_KINDS).toEqual(["entity", "target", "model", "node"]);
    expect(toggleKind([], "node")).toEqual(["node"]);
    expect(toggleKind(["node", "entity"], "target")).toEqual(["entity", "target", "node"]);
    expect(toggleKind(["entity", "node"], "entity")).toEqual(["node"]);
  });

  it("with none on picks anything: the nearest hit at its most specific", () => {
    expect(pickByFilter([], overAnEntity)).toEqual({ targetId: "key", path: [0, 1] });
    expect(pickByFilter([], onThePageOnly)).toEqual({ targetId: "tally", path: [], printed: true });
    expect(pickByFilter([], [])).toBeNull();
  });

  it("entities picks only an entity – its root, from any of its nodes", () => {
    expect(pickByFilter(["entity"], overAnEntity)).toEqual({ targetId: "key", path: [] });
    expect(pickByFilter(["entity"], onThePageOnly)).toBeNull();
  });

  it("nodes picks only the node under the pointer, as deep as the tree goes", () => {
    expect(pickByFilter(["node"], overAnEntity)).toEqual({ targetId: "key", path: [0, 1] });
    expect(pickByFilter(["node"], onThePageOnly)).toBeNull();
  });

  it("models picks the model a hit belongs to – itself or the nearest model above it", () => {
    expect(pickByFilter(["model"], overAnEntity)).toEqual({ targetId: "key", path: [0] });
    expect(pickByFilter(["model"], [node("key", [2]), print("key")])).toBeNull();
    expect(pickByFilter(["model"], [node("a", [1]), node("b", [0, 3], [0, 3])])).toEqual({ targetId: "b", path: [0, 3] });
  });

  it("targets picks only a printed image, through an entity standing on it", () => {
    expect(pickByFilter(["target"], overAnEntity)).toEqual({ targetId: "key", path: [], printed: true });
    expect(pickByFilter(["target"], onThePageOnly)).toEqual({ targetId: "tally", path: [], printed: true });
    expect(pickByFilter(["target"], [node("key", [])])).toBeNull();
  });

  it("with several on: the nearest hit any takes, at the most specific level on", () => {
    expect(pickByFilter(["entity", "node"], overAnEntity)).toEqual({ targetId: "key", path: [0, 1] });
    expect(pickByFilter(["entity", "model"], overAnEntity)).toEqual({ targetId: "key", path: [0] });
    expect(pickByFilter(["entity", "model"], [node("key", [2]), print("key")])).toEqual({ targetId: "key", path: [] });
    expect(pickByFilter(["entity", "target"], [print("a"), node("b", [])])).toEqual({ targetId: "a", path: [], printed: true });
    expect(pickByFilter(["model", "target"], [node("b", [1]), print("a")])).toEqual({ targetId: "a", path: [], printed: true });
  });

  it("finds a node's model: itself, else the nearest model above it", () => {
    const models = new Set(["0", "0.2.1"]);
    const isModel = (at: number[]) => models.has(at.join("."));
    expect(modelOf([0, 2, 1, 4], isModel)).toEqual([0, 2, 1]);
    expect(modelOf([0, 3], isModel)).toEqual([0]);
    expect(modelOf([1], isModel)).toBeNull();
  });

  it("the right click's menu falls back to the printed image under the pointer", () => {
    expect(pickForMenu(["entity"], onThePageOnly)).toEqual({ targetId: "tally", path: [], printed: true });
    expect(pickForMenu(["node"], overAnEntity)).toEqual({ targetId: "key", path: [0, 1] });
    expect(pickForMenu(["entity"], [])).toBeNull();
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
