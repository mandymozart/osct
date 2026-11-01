import { describe, expect, it } from "vitest";
import { excerptOf, flatHits, folded, searchBook, spreadWhere, stepHit, type SearchSpread } from "../book-search";

/** #237: the header's search through the whole book – grouped by kind, ranked, each with its spread and what a pick selects */

const spreads: SearchSpread[] = [
  { id: "cover", title: "Cover", firstPage: 0, lastPage: 0, format: "cover", entries: [], targets: [] },
  {
    id: "s1", title: "The key", firstPage: 1, lastPage: 2,
    entries: [
      { id: "key", title: "The key", body: "A brass key that opens the **door**.", page: 1, target: { id: "key-target", imageSrc: "/k.jpg" } },
      { id: "about", title: "About the demo", body: "Read how the Écaille is made.", page: 2 },
    ],
    targets: [{ id: "key-target", entryId: "key", imageSrc: "/k.jpg", entity: { type: "group", name: "Keyring", assets: [], children: [{ type: "model", name: "Brass key", assets: [] }] } }],
  },
  {
    id: "s2", title: "The door", firstPage: 3, lastPage: 4,
    entries: [{ id: "door", title: "Door", body: "Locked until you find the key.", page: 3, target: { id: "door-target", imageSrc: "/d.jpg" } }],
    targets: [{ id: "door-target", entryId: "door", imageSrc: "/d.jpg", entity: { type: "model", assets: [] } }],
  },
];

describe("the book search", () => {
  it("folds accents and case", () => {
    expect(folded("Écaille KÉVIN")).toBe("ecaille kevin");
    expect(flatHits(searchBook(spreads, "ecaille")).map(h => h.key)).toEqual(["entry:about"]);
  });

  it("groups the hits by kind – entries, spreads, targets, nodes – each with its spread", () => {
    const groups = searchBook(spreads, "key");
    expect(groups.map(g => g.kind)).toEqual(["entry", "spread", "target", "node"]);
    expect(groups[0].hits.map(h => h.key)).toEqual(["entry:key", "entry:door"]);
    expect(groups[1].hits.map(h => [h.spreadId, h.where])).toEqual([["s1", "p. 1–2 · The key"]]);
    expect(groups[2].hits.map(h => h.label)).toEqual(["key-target"]);
    expect(groups[3].hits.map(h => [h.label, h.select.node])).toEqual([["Keyring", []], ["Brass key", [0]]]);
  });

  it("ranks a title that starts with the query before one that only holds it, and a text hit last with its excerpt", () => {
    const entries = searchBook(spreads, "key")[0].hits;
    expect(entries[0]).toMatchObject({ label: "The key", rank: 1, where: "p. 1–2 · The key · p. 1" });
    expect(entries[1]).toMatchObject({ label: "Door", rank: 3 });
    expect(entries[1].excerpt).toContain("find the key");
    expect(searchBook(spreads, "door")[0].hits.map(h => [h.label, h.rank])).toEqual([["Door", 0], ["The key", 3]]);
  });

  it("every word of the query is found; nothing for none", () => {
    expect(flatHits(searchBook(spreads, "brass door")).map(h => h.key)).toEqual(["entry:key"]);
    expect(searchBook(spreads, "   ")).toEqual([]);
    expect(searchBook(spreads, "dragon")).toEqual([]);
  });

  it("a page number finds its spread; a cover by its format", () => {
    expect(searchBook(spreads, "4").find(g => g.kind === "spread")!.hits.map(h => h.spreadId)).toEqual(["s2"]);
    expect(searchBook(spreads, "cover")[0].hits[0]).toMatchObject({ spreadId: "cover", where: "cover" });
    expect(spreadWhere(spreads[1])).toBe("p. 1–2 · The key");
  });

  it("what a pick selects: an entry with its target, an entry without one directly, a target, a node, a spread", () => {
    const hit = (query: string, key: string) => flatHits(searchBook(spreads, query)).find(h => h.key === key);
    expect(hit("key", "entry:key")?.select).toEqual({ target: "key-target", node: [], onTarget: true, entry: "key" });
    expect(hit("about", "entry:about")?.select).toEqual({ target: null, node: [], onTarget: true, entry: "about" });
    expect(flatHits(searchBook(spreads, "key-target"))[0].select).toEqual({ target: "key-target", node: [], onTarget: true });
    expect(flatHits(searchBook(spreads, "brass key")).find(h => h.kind === "node")?.select).toEqual({ target: "key-target", node: [0], onTarget: false });
    expect(flatHits(searchBook(spreads, "the door")).find(h => h.kind === "spread")?.select).toEqual({ target: null, node: [], onTarget: true, spread: true });
  });

  it("keeps at most the limit per group and counts the rest", () => {
    const many: SearchSpread[] = [{ id: "s", title: "S", firstPage: 1, lastPage: 2, targets: [],
      entries: Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, title: `Glass ${i}`, page: 1 })) }];
    const [group] = searchBook(many, "glass", 6);
    expect([group.hits.length, group.more]).toEqual([6, 3]);
  });

  it("↑ ↓ wrap around the hits; an excerpt cuts around the word", () => {
    expect([stepHit(3, -1, 1), stepHit(3, -1, -1), stepHit(3, 2, 1), stepHit(3, 0, -1), stepHit(0, -1, 1)]).toEqual([0, 2, 0, 2, -1]);
    expect(excerptOf("a ".repeat(40) + "needle " + "b ".repeat(40), ["needle"], 6)).toBe("…a a a needle b b b…");
  });
});
