import { describe, expect, it } from "vitest";
import {
  closePanel, closeTab, defaultArrangement, dropIndex, holderOf, holdsEssential, migrate, moveTab, nextFloatId, openTab,
  readArrangement, sameSpot, selectTab, splitOut, storedArrangement, type Arrangement, type TabSpec,
} from "../components/float-tabs";

// #318: every panel content is a tab that can live in any panel
const TABS: TabSpec[] = [
  { id: "tree", name: "Tree", icon: "tree", about: "", home: "tree" },
  { id: "inspector", name: "Inspector", icon: "inspector", about: "", home: "inspector", essential: true },
  { id: "environment", name: "Environment", icon: "globe", about: "", home: "inspector" },
  { id: "library", name: "Library", icon: "folder", about: "", home: "inspector" },
  { id: "code", name: "Code", icon: "code", about: "", home: "inspector" },
  { id: "scenes", name: "Scenes", icon: "film", about: "", home: "scenes" },
  { id: "history", name: "History", icon: "history", about: "", home: "history" },
];
const HOMES = ["tree", "inspector", "scenes", "history", "tools"];
const START: Arrangement = defaultArrangement(TABS, new Set(["history"]));

describe("float tabs: the arrangement", () => {
  it("starts with every tab in its home panel, the panels closed by default left out (never the essential tab's)", () => {
    expect(START).toEqual({
      tree: { tabs: ["tree"], active: "tree" },
      inspector: { tabs: ["inspector", "environment", "library", "code"], active: "inspector" },
      scenes: { tabs: ["scenes"], active: "scenes" },
    });
    expect(defaultArrangement(TABS, new Set(["inspector"])).inspector.tabs).toEqual(["inspector"]);
    expect(Object.keys(START)).toEqual(["tree", "inspector", "scenes"]);
  });

  it("moves a tab into another panel before the tab at the index, shows it there", () => {
    const next = moveTab(START, "library", "tree", 0);
    expect(next.tree).toEqual({ tabs: ["library", "tree"], active: "library" });
    expect(next.inspector).toEqual({ tabs: ["inspector", "environment", "code"], active: "inspector" });
    expect(moveTab(START, "library", "tree", 1).tree.tabs).toEqual(["tree", "library"]);
    // past the end: after the last
    expect(moveTab(START, "library", "tree", 9).tree.tabs).toEqual(["tree", "library"]);
  });

  it("reorders within its own panel: the index counts the tabs with it still there", () => {
    expect(moveTab(START, "inspector", "inspector", 2).inspector.tabs).toEqual(["environment", "inspector", "library", "code"]);
    expect(moveTab(START, "inspector", "inspector", 4).inspector.tabs).toEqual(["environment", "library", "code", "inspector"]);
    expect(moveTab(START, "code", "inspector", 0).inspector.tabs).toEqual(["code", "inspector", "environment", "library"]);
  });

  it("closes the panel its last tab leaves; the shown tab of a panel it leaves is its neighbour", () => {
    const next = moveTab(START, "tree", "scenes", 1);
    expect(next.tree).toBeUndefined();
    expect(next.scenes.tabs).toEqual(["scenes", "tree"]);
    const shownOut = moveTab(selectTab(START, "inspector", "library"), "library", "tree", 1);
    expect(shownOut.inspector.active).toBe("code");
    const lastOut = moveTab(selectTab(START, "inspector", "code"), "code", "tree", 1);
    expect(lastOut.inspector.active).toBe("library");
  });

  it("a panel's only tab dropped on itself changes nothing, and the panel keeps its place in the order", () => {
    const next = moveTab(START, "tree", "tree", 0);
    expect(next).toEqual(START);
    expect(Object.keys(next)).toEqual(Object.keys(START));
  });

  it("leaves an unknown target panel alone", () => {
    expect(moveTab(START, "tree", "nowhere", 0)).toBe(START);
  });

  it("splits a tab out into a panel of its own, after the others", () => {
    const next = splitOut(START, "code", "float-1");
    expect(next["float-1"]).toEqual({ tabs: ["code"], active: "code" });
    expect(next.inspector.tabs).toEqual(["inspector", "environment", "library"]);
    expect(Object.keys(next).at(-1)).toBe("float-1");
    // its only tab out: the panel it left goes
    const alone = splitOut(START, "scenes", "float-1");
    expect(alone.scenes).toBeUndefined();
    expect(splitOut(next, "tree", "float-1")).toBe(next);
  });

  it("finds the next free id for a panel a drag makes", () => {
    expect(nextFloatId(START)).toBe("float-1");
    expect(nextFloatId({ ...START, "float-1": { tabs: ["x"], active: "x" }, "float-4": { tabs: ["y"], active: "y" } })).toBe("float-5");
  });

  it("selects a tab only in the panel that holds it", () => {
    expect(selectTab(START, "inspector", "code").inspector.active).toBe("code");
    expect(selectTab(START, "tree", "code")).toBe(START);
    expect(selectTab(START, "inspector", "inspector")).toBe(START);
  });

  it("guards the Inspector: its panel cannot close, the tab never closes", () => {
    expect(holdsEssential(START, "inspector", TABS)).toBe(true);
    expect(holdsEssential(START, "tree", TABS)).toBe(false);
    expect(closePanel(START, "inspector", TABS)).toBe(START);
    expect(closeTab(START, "inspector", TABS)).toBe(START);
    // wherever it lives
    const moved = moveTab(START, "inspector", "tree", 1);
    expect(holdsEssential(moved, "tree", TABS)).toBe(true);
    expect(closePanel(moved, "tree", TABS)).toBe(moved);
    expect(closePanel(moved, "inspector", TABS).inspector).toBeUndefined();
  });

  it("closes a panel with its tabs, and a tab alone (its panel goes with its last)", () => {
    expect(closePanel(START, "scenes", TABS).scenes).toBeUndefined();
    expect(closeTab(START, "library", TABS).inspector.tabs).toEqual(["inspector", "environment", "code"]);
    expect(closeTab(START, "tree", TABS).tree).toBeUndefined();
  });

  it("opens a closed tab in its home panel (opening that panel), shows an open one where it is", () => {
    const closed = closePanel(START, "scenes", TABS);
    expect(openTab(closed, "scenes", TABS).scenes).toEqual({ tabs: ["scenes"], active: "scenes" });
    expect(openTab(START, "history", TABS).history).toEqual({ tabs: ["history"], active: "history" });
    const libraryOut = closeTab(START, "library", TABS);
    expect(openTab(libraryOut, "library", TABS).inspector).toEqual({ tabs: ["inspector", "environment", "code", "library"], active: "library" });
    const moved = moveTab(START, "code", "tree", 1);
    const shown = openTab(selectTab(moved, "tree", "tree"), "code", TABS);
    expect(shown.tree.active).toBe("code");
    expect(holderOf(shown, "code")).toBe("tree");
    expect(openTab(START, "unknown", TABS)).toBe(START);
  });

  it("finds where a dropped tab lands from the tabs' middles", () => {
    expect(dropIndex([50, 120, 200], 10)).toBe(0);
    expect(dropIndex([50, 120, 200], 60)).toBe(1);
    expect(dropIndex([50, 120, 200], 199)).toBe(2);
    expect(dropIndex([50, 120, 200], 300)).toBe(3);
    expect(dropIndex([], 300)).toBe(0);
  });

  it("knows a drop that changes nothing", () => {
    expect(sameSpot(START, "environment", "inspector", 1)).toBe(true);
    expect(sameSpot(START, "environment", "inspector", 2)).toBe(true);
    expect(sameSpot(START, "environment", "inspector", 0)).toBe(false);
    expect(sameSpot(START, "environment", "tree", 0)).toBe(false);
  });
});

describe("float tabs: stored and migrated", () => {
  it("reads back what it stored", () => {
    const arr = splitOut(moveTab(START, "library", "tree", 1), "code", "float-2");
    expect(readArrangement(JSON.parse(JSON.stringify(storedArrangement(arr))), TABS, HOMES)).toEqual(arr);
  });

  it("checks a stored arrangement: unknown tabs and panels, duplicates, empty panels, a wrong active tab", () => {
    const stored = { v: 1, panels: {
      tree: { tabs: ["tree", "nonsense", "scenes"], active: "nonsense" },
      bogus: { tabs: ["history"], active: "history" },
      inspector: { tabs: ["inspector", "scenes", "code"], active: "code" },
      scenes: { tabs: [], active: "scenes" },
      "float-3": { tabs: "library" },
      "float-4": { tabs: ["library"], active: "library" },
    } };
    expect(readArrangement(stored, TABS, HOMES)).toEqual({
      tree: { tabs: ["tree", "scenes"], active: "tree" },
      inspector: { tabs: ["inspector", "code"], active: "code" },
      "float-4": { tabs: ["library"], active: "library" },
    });
    expect(readArrangement(undefined, TABS, HOMES)).toBeNull();
    expect(readArrangement({ panels: [] }, TABS, HOMES)).toBeNull();
    expect(readArrangement("nonsense", TABS, HOMES)).toBeNull();
  });

  it("brings the Inspector back into its home panel when a stored arrangement lost it", () => {
    const stored = { v: 1, panels: { tree: { tabs: ["tree"], active: "tree" } } };
    expect(readArrangement(stored, TABS, HOMES)).toEqual({
      tree: { tabs: ["tree"], active: "tree" },
      inspector: { tabs: ["inspector"], active: "inspector" },
    });
  });

  it("migrates a layout stored before #318: closed panels stay closed, the Inspector shows the tab it showed", () => {
    const old = { tree: { closed: true }, history: { closed: false }, scenes: {} };
    const arr = migrate(old, TABS, new Set(["history"]), "library");
    expect(arr.tree).toBeUndefined();
    expect(arr.history).toEqual({ tabs: ["history"], active: "history" });
    expect(arr.scenes).toEqual({ tabs: ["scenes"], active: "scenes" });
    expect(arr.inspector.active).toBe("library");
    // an Inspector closed by an older editor is open; nothing stored = the default
    expect(migrate({ inspector: { closed: true } }, TABS, new Set(), null).inspector.tabs).toContain("inspector");
    expect(migrate({}, TABS, new Set(["history"]), null)).toEqual(START);
  });
});
