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

  // #229: the scene selected clears the target and the node (no outline, no gizmo – the page's effect reads the level)
  it("selecting the scene after a node clears the target, the node and the entry", () => {
    selection.selectNode("p015-1", [1, 0]);
    expect(selection.level(true)).toBe("node");
    selection.selectScene();
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, scene: true, entry: null });
    expect(selection.level(true)).toBe("none");
    selection.selectEntry("key", "p015-1");
    selection.selectScene();
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, scene: true, entry: null });
  });

  it("a fresh workspace, a click on the stage that picks nothing and another scene select the scene", () => {
    selection.selectNode("p015-1", [0]);
    selection.reset();
    expect(selection.scene).toBe(true);
    selection.selectTarget("p015-1");
    selection.clear();
    expect([selection.scene, selection.target, selection.level(true)]).toEqual([true, null, "none"]);
  });

  it("a selection of nothing is the scene's; a target or an entry is not", () => {
    selection.set({ target: null, node: [], onTarget: true });
    expect(selection.scene).toBe(true);
    selection.selectTarget(null);
    expect(selection.scene).toBe(true);
    selection.selectTarget("p015-2");
    expect(selection.scene).toBe(false);
    selection.selectEntry("about", null);
    expect([selection.scene, selection.entry]).toEqual([false, "about"]);
    selection.reset();
  });
});

describe("settledSelection (#229)", () => {
  it("makes nothing selected the scene and drops what the scene does not name", () => {
    expect(settledSelection({ target: null, node: [], onTarget: true })).toEqual({ target: null, node: [], onTarget: true, scene: true, entry: null });
    expect(settledSelection({ target: "a", node: [2], onTarget: false, scene: true })).toEqual({ target: null, node: [], onTarget: true, scene: true, entry: null });
  });

  it("keeps a target, a node or an entry as they are, the scene off", () => {
    expect(settledSelection({ target: "a", node: [2], onTarget: false })).toEqual({ target: "a", node: [2], onTarget: false, scene: false, entry: null });
    expect(settledSelection({ target: null, node: [], onTarget: true, entry: "about" })).toEqual({ target: null, node: [], onTarget: true, scene: false, entry: "about" });
  });
});

describe("the experience and a selection asked for on another scene (#237)", () => {
  it("the experience (the top bar's ⚙) selects the experience: no scene, target, node or entry; one level up keeps it", () => {
    selection.selectNode("p015-1", [1]);
    selection.selectExperience();
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, scene: false, entry: null, experience: true });
    selection.up();
    expect(selection.experience).toBe(true);
    selection.selectScene();
    expect([selection.experience, selection.scene]).toEqual([false, true]);
    expect(settledSelection({ target: "a", node: [1], onTarget: false, experience: true })).toEqual({ target: null, node: [], onTarget: true, scene: false, entry: null, experience: true });
  });

  it("a group (a band of the Scenes panel, #307) is selected alone; one level up keeps it, another scene resets it", () => {
    selection.selectTarget("p015-1");
    selection.selectGroup("front-matter");
    expect(selection.snapshot()).toEqual({ target: null, node: [], onTarget: true, scene: false, entry: null, group: "front-matter" });
    selection.up();
    expect(selection.group).toBe("front-matter");
    selection.enter("s002-003");
    expect([selection.group, selection.scene]).toEqual([null, true]);
  });

  it("a search pick on another scene is taken when that scene opens, and shown in the Inspector", () => {
    const before = selection.reveal;
    selection.requestOn("s2", { target: "t2", node: [0], onTarget: false });
    selection.enter("s1");
    expect(selection.scene).toBe(true);
    selection.requestOn("s2", { target: null, node: [], onTarget: true, entry: "e2" });
    selection.enter("s2");
    expect([selection.entry, selection.scene, selection.reveal]).toEqual(["e2", false, before + 1]);
    selection.enter("s2");
    expect(selection.scene).toBe(true);
    selection.show({ target: "t1", node: [], onTarget: true });
    expect([selection.target, selection.reveal]).toEqual(["t1", before + 2]);
    selection.reset();
  });
});
