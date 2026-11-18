import { describe, expect, it } from "vitest";
import { excerptOf, flatHits, folded, searchBook, spreadWhere, stepHit, type SearchSpread } from "../book-search";

/** #237: the header's search through the whole book – grouped by kind, ranked, each with its scene and what a pick selects */

const spreads: SearchSpread[] = [
  { id: "cover", label: "Cover", entries: [], targets: [] },
  {
    id: "s1", label: "1–2",
    entries: [
      { id: "key", title: "The key", body: "A brass key that opens the **door**.", target: { id: "key-target", imageSrc: "/k.jpg" } },
      { id: "about", title: "About the demo", body: "Read how the Écaille is made." },
    ],
    targets: [{ id: "key-target", entryId: "key", imageSrc: "/k.jpg", entity: { type: "group", name: "Keyring", assets: [], children: [{ type: "model", name: "Brass key", assets: [] }] } }],
  },
  {
    id: "s2", label: "3–4 · The door",
    entries: [{ id: "door", title: "Door", body: "Locked until you find the key.", target: { id: "door-target", imageSrc: "/d.jpg" } }],
    targets: [{ id: "door-target", entryId: "door", imageSrc: "/d.jpg", entity: { type: "model", assets: [] } }],
  },
];

describe("the book search", () => {
  it("folds accents and case", () => {
    expect(folded("Écaille KÉVIN")).toBe("ecaille kevin");
    expect(flatHits(searchBook(spreads, "ecaille")).map(h => h.key)).toEqual(["entry:about"]);
  });

  it("groups the hits by kind – entries, scenes, targets, nodes – each with its scene", () => {
    const groups = searchBook(spreads, "door");
    expect(groups.map(g => g.kind)).toEqual(["entry", "scene", "target"]);
    expect(groups[0].hits.map(h => [h.key, h.where])).toEqual([["entry:door", "3–4 · The door"], ["entry:key", "1–2"]]);
    expect(groups[1].hits.map(h => [h.spreadId, h.where])).toEqual([["s2", "3–4 · The door"]]);
    expect(groups[2].hits.map(h => h.label)).toEqual(["door-target"]);
    const keys = searchBook(spreads, "key");
    expect(keys.map(g => g.kind)).toEqual(["entry", "target", "node"]);
    expect(keys[2].hits.map(h => [h.label, h.select.node])).toEqual([["Keyring", []], ["Brass key", [0]]]);
  });

  it("ranks a title that starts with the query before one that only holds it, and a text hit last with its excerpt", () => {
    const entries = searchBook(spreads, "key")[0].hits;
    expect(entries[0]).toMatchObject({ label: "The key", rank: 1, where: "1–2" });
    expect(entries[1]).toMatchObject({ label: "Door", rank: 3 });
    expect(entries[1].excerpt).toContain("find the key");
    expect(searchBook(spreads, "door")[0].hits.map(h => [h.label, h.rank])).toEqual([["Door", 0], ["The key", 3]]);
  });

  it("every word of the query is found; nothing for none", () => {
    expect(flatHits(searchBook(spreads, "brass door")).map(h => h.key)).toEqual(["entry:key"]);
    expect(searchBook(spreads, "   ")).toEqual([]);
    expect(searchBook(spreads, "dragon")).toEqual([]);
  });

  it("a scene is found by its label (a page number as text) or its id; its name is its label, else its id", () => {
    expect(searchBook(spreads, "4").find(g => g.kind === "scene")!.hits.map(h => h.spreadId)).toEqual(["s2"]);
    expect(searchBook(spreads, "cover")[0].hits[0]).toMatchObject({ spreadId: "cover", where: "Cover" });
    expect(searchBook(spreads, "s1").find(g => g.kind === "scene")!.hits.map(h => h.spreadId)).toEqual(["s1"]);
    expect(spreadWhere(spreads[1])).toBe("1–2");
    expect(spreadWhere({ id: "wall", label: "" })).toBe("wall");
  });

  it("what a pick selects: an entry with its target, an entry without one directly, a target, a node, a scene", () => {
    const hit = (query: string, key: string) => flatHits(searchBook(spreads, query)).find(h => h.key === key);
    expect(hit("key", "entry:key")?.select).toEqual({ target: "key-target", node: [], onTarget: true, entry: "key" });
    expect(hit("about", "entry:about")?.select).toEqual({ target: null, node: [], onTarget: true, entry: "about" });
    expect(flatHits(searchBook(spreads, "key-target"))[0].select).toEqual({ target: "key-target", node: [], onTarget: true });
    expect(flatHits(searchBook(spreads, "brass key")).find(h => h.kind === "node")?.select).toEqual({ target: "key-target", node: [0], onTarget: false });
    expect(flatHits(searchBook(spreads, "the door")).find(h => h.kind === "scene")?.select).toEqual({ target: null, node: [], onTarget: true, spread: true });
  });

  it("keeps at most the limit per group and counts the rest", () => {
    const many: SearchSpread[] = [{ id: "s", label: "S", targets: [],
      entries: Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, title: `Glass ${i}` })) }];
    const [group] = searchBook(many, "glass", 6);
    expect([group.hits.length, group.more]).toEqual([6, 3]);
  });

  it("↑ ↓ wrap around the hits; an excerpt cuts around the word", () => {
    expect([stepHit(3, -1, 1), stepHit(3, -1, -1), stepHit(3, 2, 1), stepHit(3, 0, -1), stepHit(0, -1, 1)]).toEqual([0, 2, 0, 2, -1]);
    expect(excerptOf("a ".repeat(40) + "needle " + "b ".repeat(40), ["needle"], 6)).toBe("…a a a needle b b b…");
  });
});
