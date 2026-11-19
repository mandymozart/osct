import { describe, expect, it } from "vitest";
import { isRowOn, parentRow, rowSelection, selectedItem, stepRow, treeRows, type TreeRow } from "../tree-rows";
import type { SelectionState } from "../selection";
import { selection } from "../selection.svelte";

/** #227: every row of the tree selects – the scene, an entry (with or without target), a target, a node – and ↑ ↓ ← walk them all */

const entries = [
  { id: "about", target: null },
  { id: "key", target: { id: "p003-1", imageSrc: "key.jpg" } },
  { id: "aquarium", target: { id: "p003-2", imageSrc: "aquarium.jpg" } },
  // A target without a printed image has no row of its own
  { id: "draft", target: { id: "p003-3" } },
];
const nodes: Record<string, number[][]> = { "p003-1": [[], [0], [1]], "p003-2": [] };
const rows = (folded: string[] = []) => treeRows(entries, { isOpen: id => !folded.includes(id), nodes: id => nodes[id] ?? [] });
const hasTree = (id: string) => (nodes[id] ?? []).length > 0;
const at = (s: Partial<SelectionState>): SelectionState => ({ target: null, node: [], onTarget: true, ...s });
const kinds = (list: TreeRow[]) => list.map(r => (r.kind === "node" ? `node ${r.path.join(".")}` : r.kind === "entry" ? `entry ${r.entryId}` : r.kind === "target" ? `target ${r.targetId}` : r.kind));

describe("the rows", () => {
  it("the scene, each entry, an open entry's target and its visible nodes", () => {
    expect(kinds(rows())).toEqual([
      "scene", "entry about", "entry key", "target p003-1", "node ", "node 0", "node 1", "entry aquarium", "target p003-2", "entry draft",
    ]);
  });

  it("a folded entry keeps its own row only", () => {
    expect(kinds(rows(["key"]))).toEqual(["scene", "entry about", "entry key", "entry aquarium", "target p003-2", "entry draft"]);
  });

  it("an entry row names its target, or none", () => {
    expect(rows()[1]).toEqual({ kind: "entry", entryId: "about", targetId: null });
    expect(rows()[2]).toEqual({ kind: "entry", entryId: "key", targetId: "p003-1" });
  });
});

describe("a tap on a row", () => {
  it("the scene: no target, no node", () => {
    const s = rowSelection({ kind: "scene" });
    expect(s).toEqual({ target: null, node: [], onTarget: true, scene: true });
    expect(selectedItem(s, false)).toBe("scene");
  });

  it("an entry: its own selection, with its target outlined (a target selection's level) or none", () => {
    const withTarget = rowSelection({ kind: "entry", entryId: "key", targetId: "p003-1" });
    expect(withTarget).toEqual({ target: "p003-1", node: [], onTarget: true, entry: "key" });
    expect(selectedItem(withTarget, true)).toBe("entry");
    expect(rowSelection({ kind: "entry", entryId: "about", targetId: null })).toEqual({ target: null, node: [], onTarget: true, entry: "about" });
  });

  it("a target and a node as before", () => {
    expect(rowSelection({ kind: "target", targetId: "p003-1" })).toEqual({ target: "p003-1", node: [], onTarget: true });
    expect(rowSelection({ kind: "node", targetId: "p003-1", path: [1] })).toEqual({ target: "p003-1", node: [1], onTarget: false });
    expect(selectedItem(rowSelection({ kind: "node", targetId: "p003-1", path: [1] }), true)).toBe("node");
  });
});

describe("the selected row", () => {
  const on = (s: SelectionState) => kinds(rows().filter(r => isRowOn(r, s, hasTree)));

  it("exactly one row: the scene, the entry (not its target), the target, the node", () => {
    expect(on(at({ scene: true }))).toEqual(["scene"]);
    expect(on(at({ target: "p003-1", entry: "key" }))).toEqual(["entry key"]);
    expect(on(at({ entry: "about" }))).toEqual(["entry about"]);
    expect(on(at({ target: "p003-1" }))).toEqual(["target p003-1"]);
    expect(on(at({ target: "p003-1", node: [0], onTarget: false }))).toEqual(["node 0"]);
    expect(on(at({}))).toEqual([]);
  });

  it("a target without AR content is its row even at a node", () => {
    expect(on(at({ target: "p003-2", node: [], onTarget: false }))).toEqual(["target p003-2"]);
  });

  it("every row's tap selects that row", () => {
    for (const row of rows()) expect(rows().filter(r => isRowOn(r, rowSelection(row), hasTree))).toEqual([row]);
  });
});

describe("the keys", () => {
  const list = rows();
  const index = (s: SelectionState) => list.findIndex(r => isRowOn(r, s, hasTree));

  it("↓ walks from the scene over the entries, targets and nodes; the last row stays", () => {
    const walked: string[] = [];
    let s = at({});
    for (let i = 0; i < list.length + 1; i++) {
      s = rowSelection(stepRow(list, index(s), 1)!);
      walked.push(kinds([list[index(s)]])[0]);
    }
    // Nothing selected: the first ↓ takes the scene row
    expect(walked).toEqual([...kinds(list), "entry draft"]);
  });

  it("↑ from an entry without target goes to the scene; the first row stays", () => {
    expect(stepRow(list, 1, -1)).toEqual({ kind: "scene" });
    expect(stepRow(list, 0, -1)).toEqual({ kind: "scene" });
    expect(stepRow(list, -1, -1)).toEqual({ kind: "scene" });
  });

  it("← steps up: node → parent → entity → target → entry → scene", () => {
    const up = (row: TreeRow) => parentRow(list, list.findIndex(r => JSON.stringify(r) === JSON.stringify(row)));
    expect(up({ kind: "node", targetId: "p003-1", path: [1] })).toEqual({ kind: "node", targetId: "p003-1", path: [] });
    expect(up({ kind: "node", targetId: "p003-1", path: [] })).toEqual({ kind: "target", targetId: "p003-1" });
    expect(up({ kind: "target", targetId: "p003-1" })).toEqual({ kind: "entry", entryId: "key", targetId: "p003-1" });
    expect(up({ kind: "entry", entryId: "about", targetId: null })).toEqual({ kind: "scene" });
    expect(up({ kind: "scene" })).toBeUndefined();
  });
});

describe("the shared selection", () => {
  it("selects the scene and an entry, and a target selection drops both", () => {
    selection.selectScene();
    expect([selection.scene, selection.target, selection.entry]).toEqual([true, null, null]);
    selection.selectEntry("key", "p003-1");
    expect([selection.scene, selection.target, selection.entry, selection.onTarget]).toEqual([false, "p003-1", "key", true]);
    // The stage outlines the entry's target as for a selected target
    expect(selection.level(true)).toBe("target");
    selection.selectTarget("p003-1");
    expect(selection.entry).toBeNull();
    selection.selectNode("p003-1", [0]);
    selection.up();
    expect([selection.target, selection.node, selection.onTarget]).toEqual(["p003-1", [], false]);
    selection.up();
    expect([selection.target, selection.onTarget]).toEqual(["p003-1", true]);
    selection.up();
    expect([selection.target, selection.onTarget]).toEqual(["p003-1", true]);
    selection.reset();
  });

  // A node first, then the scene row (#229): its row is the one highlighted, no node or target row stays on
  it("a node, then the scene row: only the scene row is on", () => {
    const list = rows();
    selection.set(rowSelection({ kind: "node", targetId: "p003-1", path: [0] }));
    expect(list.filter(row => isRowOn(row, selection, hasTree)).map(row => kinds([row])[0])).toEqual(["node 0"]);
    selection.set(rowSelection({ kind: "scene" }));
    expect(list.filter(row => isRowOn(row, selection, hasTree)).map(row => kinds([row])[0])).toEqual(["scene"]);
    expect([selection.target, selection.node, selection.level(true)]).toEqual([null, [], "none"]);
  });

  it("nothing selected is the scene: a fresh workspace highlights its row", () => {
    selection.selectNode("p003-1", [1]);
    selection.reset();
    expect(rows().filter(row => isRowOn(row, selection, hasTree)).map(row => kinds([row])[0])).toEqual(["scene"]);
  });
});
