import { describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { breadcrumb, parentSelection, selectionLevel, settledSelection, type SelectionState } from "../selection";
import { selection } from "../selection.svelte";

/** #162: one selection – a target, its entity or a node – and its level, one level up, the breadcrumb */

const tree: EntityData = {
  type: "group",
  name: "Videos",
  assets: [],
  children: [{ type: "video", name: "Intro", assets: [] }, { type: "group", assets: [], children: [{ type: "image", assets: [] }] }],
};
const at = (node: number[], onTarget = false): SelectionState => ({ target: "p015-1", node, onTarget });

describe("the selection's level", () => {
  it("target, entity (the root) or node", () => {
    expect(selectionLevel(at([], true), true)).toBe("target");
    expect(selectionLevel(at([]), true)).toBe("entity");
    expect(selectionLevel(at([1, 0]), true)).toBe("node");
    expect(selectionLevel({ target: null, node: [], onTarget: false }, true)).toBe("none");
  });

  it("a target without AR content is selected as the target", () => {
    expect(selectionLevel(at([]), false)).toBe("target");
    expect(selectionLevel(at([2]), false)).toBe("target");
  });
});

describe("one level up", () => {
  it("node → parent → entity → target, the target stays", () => {
    expect(parentSelection(at([1, 0]))).toEqual(at([1]));
    expect(parentSelection(at([1]))).toEqual(at([]));
    expect(parentSelection(at([]))).toEqual(at([], true));
    expect(parentSelection(at([], true))).toEqual(at([], true));
  });
});

describe("the breadcrumb", () => {
  it("target › entity › group › node, the last one current", () => {
    const crumbs = breadcrumb(at([1, 0]), tree);
    expect(crumbs.map(c => c.label)).toEqual(["p015-1", "Videos", "group", "image"]);
    expect(crumbs.map(c => c.level)).toEqual(["target", "entity", "node", "node"]);
    expect(crumbs.map(c => c.current)).toEqual([false, false, false, true]);
    expect(crumbs[0].selection).toEqual(at([], true));
    expect(crumbs[2].selection).toEqual(at([1]));
  });

  it("the target alone while it is selected, or has no tree; nothing without a target", () => {
    expect(breadcrumb(at([], true), tree).map(c => [c.label, c.current])).toEqual([["p015-1", true]]);
    expect(breadcrumb(at([0]), undefined).map(c => c.label)).toEqual(["p015-1"]);
    expect(breadcrumb({ target: null, node: [], onTarget: true }, tree)).toEqual([]);
  });

  it("a path the tree no longer has falls back to the root", () => {
    expect(breadcrumb(at([5, 5]), tree).map(c => c.label)).toEqual(["p015-1", "Videos"]);
  });
});

describe("the shared selection", () => {
  it("selects a target, a node, steps up and resets", () => {
    selection.selectNode("p015-1", [1, 0]);
    expect(selection.level(true)).toBe("node");
    selection.up();
    expect([selection.node, selection.onTarget]).toEqual([[1], false]);
    selection.selectTarget("p015-2");
    expect(selection.level(true)).toBe("target");
    expect(selection.node).toEqual([]);
    selection.reset();
    expect(selection.level(true)).toBe("none");
  });

  // #229: the spread selected clears the target and the node (no outline, no gizmo – the page's effect reads the level)
  it("selecting the spread after a node clears the target, the node and the entry", () => {
    selection.selectNode("p015-1", [1, 0]);
    expect(selection.level(true)).toBe("node");
    selection.selectSpread();
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, spread: true, entry: null });
    expect(selection.level(true)).toBe("none");
    selection.selectEntry("key", "p015-1");
    selection.selectSpread();
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, spread: true, entry: null });
  });

  it("a fresh workspace, a click on the stage that picks nothing and another spread select the spread", () => {
    selection.selectNode("p015-1", [0]);
    selection.reset();
    expect(selection.spread).toBe(true);
    selection.selectTarget("p015-1");
    selection.clear();
    expect([selection.spread, selection.target, selection.level(true)]).toEqual([true, null, "none"]);
  });

  it("a selection of nothing is the spread's; a target or an entry is not", () => {
    selection.set({ target: null, node: [], onTarget: true });
    expect(selection.spread).toBe(true);
    selection.selectTarget(null);
    expect(selection.spread).toBe(true);
    selection.selectTarget("p015-2");
    expect(selection.spread).toBe(false);
    selection.selectEntry("about", null);
    expect([selection.spread, selection.entry]).toEqual([false, "about"]);
    selection.reset();
  });
});

describe("settledSelection (#229)", () => {
  it("makes nothing selected the spread and drops what the spread does not name", () => {
    expect(settledSelection({ target: null, node: [], onTarget: true })).toEqual({ target: null, node: [], onTarget: true, spread: true, entry: null });
    expect(settledSelection({ target: "a", node: [2], onTarget: false, spread: true })).toEqual({ target: null, node: [], onTarget: true, spread: true, entry: null });
  });

  it("keeps a target, a node or an entry as they are, the spread off", () => {
    expect(settledSelection({ target: "a", node: [2], onTarget: false })).toEqual({ target: "a", node: [2], onTarget: false, spread: false, entry: null });
    expect(settledSelection({ target: null, node: [], onTarget: true, entry: "about" })).toEqual({ target: null, node: [], onTarget: true, spread: false, entry: "about" });
  });
});

describe("the book and a selection asked for on another spread (#237)", () => {
  it("the book crumb selects the book: no spread, target, node or entry; one level up keeps it", () => {
    selection.selectNode("p015-1", [1]);
    selection.selectBook();
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, spread: false, entry: null, book: true });
    selection.up();
    expect(selection.book).toBe(true);
    selection.selectSpread();
    expect([selection.book, selection.spread]).toEqual([false, true]);
    expect(settledSelection({ target: "a", node: [1], onTarget: false, book: true })).toEqual({ target: null, node: [], onTarget: true, spread: false, entry: null, book: true });
  });

  it("a search pick on another spread is taken when that spread opens, and shown in the Inspector", () => {
    const before = selection.reveal;
    selection.requestOn("s2", { target: "t2", node: [0], onTarget: false });
    selection.enter("s1");
    expect(selection.spread).toBe(true);
    selection.requestOn("s2", { target: null, node: [], onTarget: true, entry: "e2" });
    selection.enter("s2");
    expect([selection.entry, selection.spread, selection.reveal]).toEqual(["e2", false, before + 1]);
    selection.enter("s2");
    expect(selection.spread).toBe(true);
    selection.show({ target: "t1", node: [], onTarget: true });
    expect([selection.target, selection.reveal]).toEqual(["t1", before + 2]);
    selection.reset();
  });
});
