import { describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { breadcrumb, parentSelection, selectionLevel, type SelectionState } from "../selection";
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
});
