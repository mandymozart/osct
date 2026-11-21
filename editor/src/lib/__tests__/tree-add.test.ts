import { describe, expect, it } from "vitest";
import { filterTreeAdd, treeAddItems, type TreeAddContext } from "../tree-add";

const base: TreeAddContext = {
  target: null, hasEntity: false, node: null, builtIn: ["group", "model", "video", "image", "text", "light"], plugins: [],
  takesFile: type => ["model", "video", "image"].includes(type), canAddTarget: true, canAddEntry: true,
};
const byKey = (ctx: TreeAddContext) => Object.fromEntries(treeAddItems(ctx).map(item => [item.key, item]));

describe("the Tree's + menu (#337)", () => {
  it("offers the surfaces, a target, an entry and every node type, in their groups", () => {
    const items = treeAddItems(base);
    expect(items.map(i => i.key)).toEqual([
      "surface:double", "surface:single", "surface:wall", "surface:custom", "target", "entry",
      "node:group", "node:model", "node:video", "node:image", "node:text", "node:light",
    ]);
    expect(items.find(i => i.key === "surface:wall")?.add).toEqual({ add: "surface", preset: "wall" });
    expect(new Set(items.map(i => i.group))).toEqual(new Set(["scene", "nodes"]));
  });

  it("greys the nodes out without a target, with why; surfaces, target and entry stay", () => {
    const items = byKey(base);
    expect(items["node:light"].disabled).toMatch(/Select a target/);
    expect(items["surface:double"].disabled).toBeNull();
    expect(items.target.disabled).toBeNull();
    expect(items.entry.disabled).toBeNull();
  });

  it("offers the nodes onto the selected target: its root without AR content, beside or in the selected node", () => {
    const root = byKey({ ...base, target: "key" });
    expect(root["node:group"].disabled).toBeNull();
    expect(root["node:group"].detail).toBe("the root of key");
    expect(root["node:model"].detail).toBe("the root of key – then its file from the Library");
    expect(byKey({ ...base, target: "key", hasEntity: true, node: "lid" })["node:text"].detail).toBe("beside or in lid");
    expect(byKey({ ...base, target: "key", hasEntity: true })["node:text"].detail).toBe("in key's AR content");
  });

  it("lists the plugins' node types apart, a built-in name once", () => {
    const items = treeAddItems({ ...base, target: "key", plugins: ["fish", "model"] });
    expect(items.filter(i => i.group === "plugin nodes").map(i => i.label)).toEqual(["fish"]);
  });

  it("greys out a form the workspace cannot open", () => {
    const items = byKey({ ...base, canAddTarget: false, canAddEntry: false });
    expect(items.target.disabled).toBeTruthy();
    expect(items.entry.disabled).toBeTruthy();
  });

  it("filters by the typed words, case ignored", () => {
    const items = treeAddItems({ ...base, target: "key" });
    expect(filterTreeAdd(items, "").length).toBe(items.length);
    expect(filterTreeAdd(items, "Wall").map(i => i.key)).toEqual(["surface:wall"]);
    expect(filterTreeAdd(items, "page single").map(i => i.key)).toEqual(["surface:single"]);
    expect(filterTreeAdd(items, "nodes vid").map(i => i.key)).toEqual(["node:video"]);
  });
});
