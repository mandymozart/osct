import { describe, expect, it, vi } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import type { EntityData } from "@shared/types/game-config";
import { entityAssets, entityNodes } from "../game-config";

/** Content schema 2.0: an entity is a tree of nodes – the helpers and the guard's recursive check */

const tree: EntityData = {
  type: "group",
  assets: [],
  children: [
    { type: "model", assets: [{ id: "t-0", assetType: "glb", src: "/assets/content/entries/t/tree.glb" }], params: { scale: 0.7 } },
    {
      type: "group",
      assets: [],
      children: [{ type: "text", assets: [], text: "{{entry.title}}", color: "#f3cc94" }],
    },
  ],
};

const config = (entity: unknown) => ({
  version: { version: "1.0.0", timestamp: "2026-01-01T00:00:00.000Z", schema: "2.0" },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
  entries: [{ id: "e1", category: "glossary", title: "E", page: 1, body: "", tags: [], target: { id: "e1", imageSrc: "/assets/content/entries/e1/t.jpg", entity } }],
  entities: {},
  tutorial: [],
});

const problemsOf = (raw: unknown): string[] => {
  try {
    assertGameConfiguration(raw);
    return [];
  } catch (error) {
    if (error instanceof GameConfigurationError) return error.problems;
    throw error;
  }
};

describe("an entity as a tree of nodes", () => {
  it("lists every node with its path from the root", () => {
    expect(entityNodes(tree).map(n => [n.path.join("."), n.node.type])).toEqual([
      ["", "group"], ["0", "model"], ["1", "group"], ["1.0", "text"],
    ]);
  });

  it("collects the assets of the whole tree, root first", () => {
    expect(entityAssets(tree).map(a => a.id)).toEqual(["t-0"]);
    expect(entityAssets({ type: "video", assets: [{ id: "v", assetType: "video", src: "/v.mp4" }] })).toHaveLength(1);
    expect(entityAssets(undefined)).toEqual([]);
  });

  it("the guard accepts a tree and names a bad child by its path; a node type it does not know only warns", () => {
    expect(problemsOf(config(tree))).toEqual([]);
    const bad = JSON.parse(JSON.stringify(tree)) as EntityData;
    bad.children![1].children![0].color = "gold";
    (bad.children![0] as { type: string }).type = "hologram";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(problemsOf(config(bad))).toEqual([
      "entries[0].target.entity.children[1].children[0].color: expected #rrggbb",
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('entries[0].target.entity.children[0].type: "hologram"'));
    warn.mockRestore();
  });

  it("the guard refuses nodes nested deeper than 8 levels", () => {
    let deep: EntityData = { type: "group", assets: [] };
    for (let i = 0; i < 9; i++) deep = { type: "group", assets: [], children: [deep] };
    expect(problemsOf(config(deep)).some(p => p.includes("nested deeper than 8 levels"))).toBe(true);
  });
});
