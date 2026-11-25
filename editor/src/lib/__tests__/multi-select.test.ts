import { describe, expect, it } from "vitest";
import { added, allItems, extended, inverted, itemKey, itemOf, itemSelection, type MultiSelection, ranged, removed, type SelectionItem, toggled } from "../selection";

// #369: multi-select cloned from Blender – the viewport's Shift + click, the outliner's Ctrl / Shift + click, box, all, invert
const t = (target: string): SelectionItem => ({ kind: "target", target });
const n = (target: string, ...path: number[]): SelectionItem => ({ kind: "node", target, path });
const keys = (multi: MultiSelection) => ({ active: multi.active ? itemKey(multi.active) : null, others: multi.others.map(itemKey) });
const none: MultiSelection = { active: null, others: [] };

describe("multi-select items", () => {
  it("names the selection as an item, and back", () => {
    expect(itemOf({ target: "P12", node: [0, 1], onTarget: false })).toEqual(n("P12", 0, 1));
    expect(itemOf({ target: "P12", node: [], onTarget: true })).toEqual(t("P12"));
    expect(itemOf({ target: null, node: [], onTarget: true, surface: { scene: "s1", id: "wall" } })).toEqual({ kind: "surface", scene: "s1", id: "wall" });
    expect(itemOf({ target: "P12", node: [], onTarget: true, entry: "e1" })).toEqual({ kind: "entry", entry: "e1", target: "P12" });
    // The scene, a group and the experience are selected alone
    expect(itemOf({ target: null, node: [], onTarget: true, scene: true })).toBeNull();
    expect(itemOf({ target: null, node: [], onTarget: true, group: "g" })).toBeNull();
    expect(itemOf(itemSelection(n("P12", 2)))).toEqual(n("P12", 2));
  });
});

describe("Shift + click on the stage (Blender's viewport)", () => {
  it("adds a thing and makes it the active one", () => {
    const one = extended(none, t("a"));
    expect(keys(one)).toEqual({ active: "target:a", others: [] });
    expect(keys(extended(one, n("b")))).toEqual({ active: "node:b:", others: ["target:a"] });
  });

  it("makes a selected one active, then takes the active one away", () => {
    const three: MultiSelection = { active: t("c"), others: [t("a"), t("b")] };
    const made = extended(three, t("a"));
    expect(keys(made)).toEqual({ active: "target:a", others: ["target:b", "target:c"] });
    // The active one clicked again: deselected, the last of the rest takes its place
    expect(keys(extended(made, t("a")))).toEqual({ active: "target:c", others: ["target:b"] });
    expect(keys(extended({ active: t("a"), others: [] }, t("a")))).toEqual({ active: null, others: [] });
  });
});

describe("the outliner's Ctrl + click and Shift + click", () => {
  it("Ctrl toggles a row: in as the active one, out again", () => {
    const two = toggled({ active: t("a"), others: [] }, t("b"));
    expect(keys(two)).toEqual({ active: "target:b", others: ["target:a"] });
    expect(keys(toggled(two, t("a")))).toEqual({ active: "target:b", others: [] });
    expect(keys(toggled(two, t("b")))).toEqual({ active: "target:a", others: [] });
  });

  it("Shift selects the rows from the active one to the clicked one, in the tree's order", () => {
    const rows = [t("a"), n("a"), n("a", 0), t("b"), n("b")];
    const range = ranged({ active: n("a"), others: [t("x")] }, t("b"), rows);
    expect(keys(range)).toEqual({ active: "target:b", others: ["node:a:", "node:a:0"] });
    // Upwards the same
    expect(allItems(ranged({ active: t("b"), others: [] }, t("a"), rows)).map(itemKey).sort()).toEqual(["node:a:", "node:a:0", "target:a", "target:b"]);
    // No active row in the tree: the clicked one alone
    expect(keys(ranged(none, t("b"), rows))).toEqual({ active: "target:b", others: [] });
  });
});

describe("box, all and invert", () => {
  it("a box adds (the active one stays) or removes with Shift", () => {
    const boxed = added({ active: t("a"), others: [] }, [t("b"), t("a"), t("c")]);
    expect(keys(boxed)).toEqual({ active: "target:a", others: ["target:b", "target:c"] });
    expect(keys(added(none, [t("b"), t("c")]))).toEqual({ active: "target:c", others: ["target:b"] });
    expect(keys(removed(boxed, [t("a"), t("b")]))).toEqual({ active: "target:c", others: [] });
  });

  it("invert selects what was not, and nothing is active then but the last", () => {
    const all = [t("a"), t("b"), t("c"), t("d")];
    expect(allItems(inverted({ active: t("a"), others: [t("c")] }, all)).map(itemKey).sort()).toEqual(["target:b", "target:d"]);
    expect(keys(inverted({ active: null, others: [] }, all)).active).toBe("target:d");
  });
});
