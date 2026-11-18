import { describe, expect, it } from "vitest";
import type { Change, RevertResult } from "@shared/api/editor";
import { changeSummary, changeTitle, differences, filterChanges, needsPrompt, newestStep, promptLines, treeNames, undoable, undoKey } from "../history";

const at = (s: number) => new Date(Date.UTC(2026, 10, 18, 12, 0, s)).toISOString();
const change = (id: string, s: number, more: Partial<Change> = {}): Change => ({
  id, kind: "entity", ref: "castle", before: { a: 1 }, after: { a: 2 }, user: "me@x.test", token: null, createdAt: at(s), ...more,
});

describe("history: undo steps (#312)", () => {
  it("one step is a save's rows, an autosaved burst of one thing, or a revert's set", () => {
    // newest first: a burst of three saves of the castle, then an older edit of another thing
    const log = [change("c3", 20), change("c2", 15), change("c1", 10), change("e", 2, { kind: "entry", ref: "racoon" })];
    expect(newestStep(log)).toEqual(["c3", "c2", "c1"]);
    // Rows of one save: different things, a moment apart
    expect(newestStep([change("s", 30, { kind: "scene", ref: "s1" }), change("o", 30, { kind: "order", ref: "b" }), change("x", 5)])).toEqual(["s", "o"]);
    // A revert's set holds together however far apart
    expect(newestStep([change("r2", 40, { set: "S" }), change("r1", 20, { set: "S", ref: "other" }), change("x", 10, { ref: "else" })])).toEqual(["r2", "r1"]);
    expect(newestStep([])).toEqual([]);
  });

  it("undo reaches only the person's own changes of the session that are not used up", () => {
    const log = [change("other", 50, { user: "you@x.test" }), change("used", 40), change("mine", 30), change("before", 1)];
    expect(undoable(log, "me@x.test", Date.parse(at(10)), new Set(["used"])).map(c => c.id)).toEqual(["mine"]);
  });

  it("Ctrl+Z undoes, with Shift or Ctrl+Y redoes – never in a text field", () => {
    const key = (k: string, more: Partial<KeyboardEvent> = {}) => undoKey({ key: k, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: null, ...more });
    expect(key("z")).toBe("undo");
    expect(key("Z", { shiftKey: true })).toBe("redo");
    expect(key("y")).toBe("redo");
    expect(key("z", { ctrlKey: false })).toBeNull();
    expect(key("x")).toBeNull();
    const field = { closest: (s: string) => (s.includes("input") ? {} : null) } as unknown as EventTarget;
    expect(key("z", { target: field })).toBeNull();
  });
});

describe("history: words", () => {
  it("a change's title, before → after, the differences", () => {
    expect(changeTitle({ kind: "entry", ref: "racoon" }, { entry: () => "Racoon" })).toBe("Entry Racoon");
    expect(changeTitle({ kind: "passes", ref: "book" })).toBe("Post-processing");
    expect(changeSummary({ kind: "entity", before: null, after: {} })).toBe("created");
    expect(changeSummary({ kind: "entity", before: {}, after: null })).toBe("removed");
    expect(changeSummary({ kind: "entry", before: { title: "A", page: 1 }, after: { title: "B", page: 1 } })).toBe('title: "A" → "B"');
    expect(differences({ p: { s: 1, t: 2 } }, { p: { s: 3, t: 2 } })).toEqual([{ path: "p.s", before: 1, after: 3 }]);
  });

  it("the filters and the scenes of changes from the tree", () => {
    const tree = {
      book: {} as never, groups: [],
      scenes: [{ id: "s1", label: "One", surfaces: [], entries: [{ id: "racoon", category: "c", title: "Racoon", scene: "s1", target: { id: "t1", imageSrc: "", entity: { ref: "castle" } } }] }],
    } as never;
    const { names, scenesOf } = treeNames(tree);
    expect(names.target?.("t1")).toBe("Racoon");
    expect(names.scene?.("s1")).toBe("One");
    expect(scenesOf({ kind: "scene", ref: "s1" })).toEqual(["s1"]);
    expect(scenesOf({ kind: "entity", ref: "castle" })).toEqual(["s1"]);
    const log = [change("a", 1), change("b", 2, { kind: "book", ref: "b", user: "you@x.test" })];
    expect(filterChanges(log, { scene: "s1", kind: null, person: null }, scenesOf).map(c => c.id)).toEqual(["a"]);
    expect(filterChanges(log, { scene: null, kind: null, person: "you@x.test" }, scenesOf).map(c => c.id)).toEqual(["b"]);
  });

  it("the prompt: plain undo writes at once, anything more asks and names it", () => {
    const result = (more: Partial<RevertResult["plan"]> = {}): RevertResult => ({
      plan: { changes: [], chosen: [], counts: { revert: 2, conflict: 0, notRevertable: 0 }, later: 0, others: [], ...more }, applied: false, set: null, written: [],
    });
    expect(needsPrompt(result())).toBe(false);
    expect(needsPrompt(result({ others: ["a@x.test"] }))).toBe(true);
    const lines = promptLines(result({ later: 3, counts: { revert: 4, conflict: 1, notRevertable: 0 } }));
    expect(lines.later).toBe("3 later edits to the same things will be lost (reverted with it).");
    expect(lines.conflicts).toMatch(/^1 change cannot be reverted/);
    expect(lines.others).toBeNull();
  });
});
