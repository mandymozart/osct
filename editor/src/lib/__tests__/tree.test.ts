import { describe, expect, it } from "vitest";
import type { EntityData } from "@engine/types";
import { addNode, defaultAddPlace, indentNode, moveNode, nodeLabel, outdentNode, shiftNode, visiblePaths, withName } from "../tree";
import { contentTree } from "../values";

/** #163: the outliner's hierarchy – add next to / inside, reparent and reorder, names */

const video = (name: string): EntityData => ({ type: "video", name, assets: [{ id: name, assetType: "video", src: `/${name}.mp4` }] });
const group = (name: string, children: EntityData[] = []): EntityData => ({ type: "group", name, assets: [], ...(children.length ? { children } : {}) });
/** The tree as names: "g(a, b)" */
const shape = (node: EntityData): string => `${node.name ?? node.type}${node.children?.length ? `(${node.children.map(shape).join(", ")})` : ""}`;

describe("adding a node", () => {
  it("next to a file node is the default, inside a group", () => {
    expect(defaultAddPlace(video("a"))).toBe("next");
    expect(defaultAddPlace({ type: "image", assets: [] })).toBe("next");
    expect(defaultAddPlace({ type: "model", assets: [] })).toBe("next");
    expect(defaultAddPlace(group("g"))).toBe("inside");
    expect(defaultAddPlace({ type: "text", assets: [] })).toBe("inside");
    expect(defaultAddPlace(undefined)).toBe("inside");
  });

  it("the first node becomes the root", () => {
    expect(addNode(null, [], video("a"), "next")).toEqual({ tree: video("a"), path: [] });
  });

  it("a second video next to the root video: both become siblings in a new group (Tilman's walkthrough)", () => {
    const { tree, path } = addNode(video("a"), [], video("b"), "next");
    expect(shape(tree)).toBe("group(a, b)");
    expect(path).toEqual([1]);
  });

  it("next to a child goes right after it, inside goes last", () => {
    const root = group("g", [video("a"), video("c")]);
    const next = addNode(root, [0], video("b"), "next");
    expect(shape(next.tree)).toBe("g(a, b, c)");
    expect(next.path).toEqual([1]);
    const inside = addNode(root, [], video("d"), "inside");
    expect(shape(inside.tree)).toBe("g(a, c, d)");
    expect(inside.path).toEqual([2]);
    const deep = addNode(root, [1], video("e"), "inside");
    expect(shape(deep.tree)).toBe("g(a, c(e))");
    expect(deep.path).toEqual([1, 0]);
  });

  it("a selected path the tree no longer has counts as the root", () => {
    expect(addNode(group("g"), [4, 2], video("a"), "inside").path).toEqual([0]);
  });

  it("leaves the tree passed in as it is", () => {
    const root = group("g", [video("a")]);
    addNode(root, [0], video("b"), "next");
    expect(shape(root)).toBe("g(a)");
  });
});

describe("moving a node (drag and drop)", () => {
  const root = group("g", [video("a"), group("h", [video("x"), video("y")]), video("b")]);

  it("onto a row: the last child of that node", () => {
    const edit = moveNode(root, [0], [2], "inside")!;
    expect(shape(edit.tree)).toBe("g(h(x, y), b(a))");
    expect(edit.path).toEqual([1, 0]);
  });

  it("between rows: a sibling in that place, the order set", () => {
    const before = moveNode(root, [2], [0], "before")!;
    expect(shape(before.tree)).toBe("g(b, a, h(x, y))");
    expect(before.path).toEqual([0]);
    const after = moveNode(root, [0], [2], "after")!;
    expect(shape(after.tree)).toBe("g(h(x, y), b, a)");
    expect(after.path).toEqual([2]);
  });

  it("out of a group and into another place", () => {
    const out = moveNode(root, [1, 1], [0], "before")!;
    expect(shape(out.tree)).toBe("g(y, a, h(x), b)");
    expect(out.path).toEqual([0]);
    const into = moveNode(root, [0], [1, 0], "after")!;
    expect(shape(into.tree)).toBe("g(h(x, a, y), b)");
    expect(into.path).toEqual([0, 1]);
  });

  it("a later sibling's subtree is found again after the node left (indices shift)", () => {
    const edit = moveNode(root, [0], [1, 1], "inside")!;
    expect(shape(edit.tree)).toBe("g(h(x, y(a)), b)");
    expect(edit.path).toEqual([0, 1, 0]);
  });

  it("before or after the root wraps the root in a group", () => {
    const edit = moveNode(root, [2], [], "after")!;
    expect(shape(edit.tree)).toBe("group(g(a, h(x, y)), b)");
    expect(edit.path).toEqual([1]);
    const first = moveNode(root, [0], [], "before")!;
    expect(shape(first.tree)).toBe("group(a, g(h(x, y), b))");
    expect(first.path).toEqual([0]);
  });

  it("refuses the root, a node onto itself or below itself, unknown paths and moves that change nothing", () => {
    expect(moveNode(root, [], [0], "inside")).toBeNull();
    expect(moveNode(root, [1], [1], "inside")).toBeNull();
    expect(moveNode(root, [1], [1, 0], "after")).toBeNull();
    expect(moveNode(root, [7], [0], "after")).toBeNull();
    expect(moveNode(root, [0], [9], "after")).toBeNull();
    expect(moveNode(root, [0], [1], "before")).toBeNull();
    expect(moveNode(root, [2], [], "inside")).toBeNull();
  });

  it("keeps the node's own values and children", () => {
    const placed: EntityData = { ...group("h", [video("x")]), params: { position: [0.1, 0, 0] } };
    const edit = moveNode(group("g", [video("a"), placed]), [1], [0], "inside")!;
    expect(edit.tree.children![0].children![0]).toEqual(placed);
  });
});

describe("the keys: indent, outdent, up, down", () => {
  const root = group("g", [video("a"), video("b"), video("c")]);

  it("indent makes the node the last child of the sibling before it", () => {
    const edit = indentNode(root, [1])!;
    expect(shape(edit.tree)).toBe("g(a(b), c)");
    expect(edit.path).toEqual([0, 0]);
    expect(indentNode(root, [0])).toBeNull();
    expect(indentNode(root, [])).toBeNull();
  });

  it("outdent puts it right after its parent; next to the root it wraps the root", () => {
    const nested = group("g", [group("h", [video("x")]), video("b")]);
    const edit = outdentNode(nested, [0, 0])!;
    expect(shape(edit.tree)).toBe("g(h, x, b)");
    expect(edit.path).toEqual([1]);
    const wrapped = outdentNode(root, [2])!;
    expect(shape(wrapped.tree)).toBe("group(g(a, b), c)");
    expect(wrapped.path).toEqual([1]);
    expect(outdentNode(root, [])).toBeNull();
  });

  it("up and down swap with the neighbour, null at the ends", () => {
    const up = shiftNode(root, [1], -1)!;
    expect(shape(up.tree)).toBe("g(b, a, c)");
    expect(up.path).toEqual([0]);
    const down = shiftNode(root, [1], 1)!;
    expect(shape(down.tree)).toBe("g(a, c, b)");
    expect(down.path).toEqual([2]);
    expect(shiftNode(root, [0], -1)).toBeNull();
    expect(shiftNode(root, [2], 1)).toBeNull();
    expect(shiftNode(root, [], 1)).toBeNull();
  });

  it("two videos and a group in any parent-and-order combination, nothing removed (#163's done-when)", () => {
    let tree: EntityData = group("g", [video("a"), video("b")]);
    tree = moveNode(tree, [1], [0], "inside")!.tree;
    expect(shape(tree)).toBe("g(a(b))");
    tree = outdentNode(tree, [0, 0])!.tree;
    expect(shape(tree)).toBe("g(a, b)");
    tree = shiftNode(tree, [1], -1)!.tree;
    expect(shape(tree)).toBe("g(b, a)");
    tree = moveNode(tree, [1], [], "after")!.tree;
    expect(shape(tree)).toBe("group(g(b), a)");
  });
});

describe("rows and names", () => {
  it("the visible rows, depth first, without a folded node's children", () => {
    const root = group("g", [group("h", [video("x")]), video("b")]);
    expect(visiblePaths(root, () => true)).toEqual([[], [0], [0, 0], [1]]);
    expect(visiblePaths(root, path => path.join(".") !== "0")).toEqual([[], [0], [1]]);
    expect(visiblePaths(root, path => path.length > 0)).toEqual([[]]);
  });

  it("a row shows the name, else the type", () => {
    expect(nodeLabel(video("Intro"))).toBe("Intro");
    expect(nodeLabel({ type: "video", assets: [], name: "  " })).toBe("video");
    expect(nodeLabel({ type: "group", assets: [], id: "door" })).toBe("group door");
    expect(nodeLabel({ type: "light", assets: [], light: { kind: "spot" } })).toBe("spot light");
    expect(nodeLabel({ type: "text", assets: [], text: "{{entry.title}}" })).toBe("“{{entry.title}}”");
  });

  it("an empty name is none, the content keeps it trimmed", () => {
    expect(withName(video("a"), "")).not.toHaveProperty("name");
    expect(withName(group("g"), " Doors ").name).toBe(" Doors ");
    expect(contentTree(withName(group("g", [video("a")]), " Doors ")).name).toBe("Doors");
    expect(contentTree({ type: "group", assets: [], name: " " })).not.toHaveProperty("name");
  });
});
