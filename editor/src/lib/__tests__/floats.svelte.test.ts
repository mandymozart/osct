import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at, crowd, type PanelSpec, type Rect } from "../components/floats";
import { Floats, PANELS_KEY } from "../components/floats.svelte.js";
import type { TabSpec } from "../components/float-tabs";

// #329: a resize makes room – laid out once per animation frame, stored once when it ends
const SPECS: PanelSpec[] = [
  { id: "tree", name: "Tree", icon: "tree", about: "", place: at("top-left", 0, 0), size: { w: 16, h: "fill" }, min: { w: 12, h: 8 } },
  { id: "inspector", name: "Inspector", icon: "inspector", about: "", place: at("top-right", 0, 0), size: { w: 25, h: "fill" }, min: { w: 16, h: 10 }, essential: true },
  { id: "scenes", name: "Scenes", icon: "film", about: "", place: at("bottom-left", 16.5, 0), size: { w: "fill", h: 12 }, min: { w: 20, h: 10 } },
];
const AREA: Rect = { x: 8, y: 8, w: 1424, h: 800 };

describe("Floats: resizing a panel", () => {
  let frames: FrameRequestCallback[] = [];
  const runFrame = () => {
    const now = frames;
    frames = [];
    now.forEach(f => f(0));
  };
  beforeEach(() => {
    localStorage.clear();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames[id - 1] = () => {}; });
  });
  afterEach(() => vi.unstubAllGlobals());

  const floats = () => {
    const f = new Floats("test", SPECS);
    f.area = AREA;
    f.metrics = { rem: 16, gap: 8, head: 36, button: 28, char: 8 };
    for (const s of SPECS) f.show(s.id);
    return f;
  };

  it("coalesces the pointer events to one layout per frame, pushes the neighbours and stores only when let go", () => {
    const f = floats();
    const tree = f.views.tree.rect;
    const inspector = f.views.inspector.rect;
    const writes = vi.spyOn(Storage.prototype, "setItem");
    // The inspector's left edge, dragged far to the left in many small steps
    f.grab("inspector", inspector.x, 100, { x: -1, y: 0 });
    for (let k = 1; k <= 20; k++) f.drag(inspector.x - k * 50, 100);
    expect(f.passes).toBe(0);
    runFrame();
    expect(f.passes).toBe(1);
    const views = f.views;
    // The scenes strip moved and shrank, the tree shrank to its least width; the inspector stopped where they could give no more
    expect(views.tree.rect.w).toBe(12 * 16);
    expect(views.scenes.rect.w).toBe(20 * 16);
    expect(views.inspector.rect.x).toBe(8 + 192 + 8 + 320 + 8);
    const rects = Object.values(views).map(v => v.rect);
    rects.forEach((a, i) => rects.slice(i + 1).forEach(b => expect(crowd(a, b, 8)).toBe(false)));
    expect(writes).not.toHaveBeenCalled();
    expect(f.drop()).toBe(true);
    expect(writes).toHaveBeenCalledTimes(1);
    // The stored layout is the arrangement the resize left
    const stored = JSON.parse(localStorage.getItem(PANELS_KEY)!).test;
    expect(stored.tree.size.w).toBe(192);
    expect(f.views.inspector.rect.x).toBe(views.inspector.rect.x);
    expect(f.views.tree.rect.w).toBe(192);
    expect(tree.w).toBeGreaterThan(192);
    writes.mockRestore();
  });

  it("a panel not in the way keeps its very view (nothing to draw again)", () => {
    const f = floats();
    const before = f.views;
    const scenes = before.scenes.rect;
    // The scenes strip grows up a little: nothing above it in the way
    f.grab("scenes", 400, scenes.y, { x: 0, y: -1 });
    f.drag(400, scenes.y - 100);
    runFrame();
    expect(f.views.scenes.rect.h).toBe(scenes.h + 100);
    expect(f.views.tree).toBe(before.tree);
    expect(f.views.inspector).toBe(before.inspector);
    f.drop();
  });
});

describe("Floats: a toolbar's row / column (#328)", () => {
  const TOOLS: PanelSpec[] = [{ id: "tools", name: "Tools", icon: "tools", about: "", place: at("top-left", 0, 0), size: { w: "content", h: "content" }, min: { w: 8, h: 2 }, inline: true }];
  beforeEach(() => localStorage.clear());

  it("turns into a column and back into a row – stored both ways", () => {
    const f = new Floats("test", TOOLS);
    f.setVertical("tools", true);
    expect(f.vertical("tools")).toBe(true);
    f.setVertical("tools", false);
    expect(f.vertical("tools")).toBe(false);
    expect(new Floats("test", TOOLS).vertical("tools")).toBe(false);
  });
});

describe("Floats: universal tabs (#318)", () => {
  const TABS: TabSpec[] = [
    { id: "tree", name: "Tree", icon: "tree", about: "", home: "tree" },
    { id: "inspector", name: "Inspector", icon: "inspector", about: "", home: "inspector", essential: true },
    { id: "code", name: "Code", icon: "code", about: "", home: "inspector" },
    { id: "scenes", name: "Scenes", icon: "film", about: "", home: "scenes" },
  ];
  beforeEach(() => localStorage.clear());
  const floats = () => {
    const f = new Floats("test", SPECS, TABS);
    f.area = AREA;
    f.metrics = { rem: 16, gap: 8, head: 36, button: 28, char: 8 };
    for (const id of f.tabPanels) f.show(id);
    return f;
  };

  it("migrates a layout stored before #318: its places stay, a closed panel's tabs are closed", () => {
    localStorage.setItem(PANELS_KEY, JSON.stringify({ test: { tree: { corner: "top-left", dx: 40, dy: 0 }, scenes: { corner: "bottom-left", dx: 0, dy: 0, closed: true } } }));
    const f = new Floats("test", SPECS, TABS, "code");
    expect(f.tabPanels).toEqual(["tree", "inspector"]);
    expect(f.places.tree.dx).toBe(40);
    expect(f.places.scenes.closed).toBeUndefined();
    expect(f.closed("scenes")).toBe(true);
    expect(f.showing("code")).toBe("inspector");
  });

  it("a panel closed by default (History, Logic) shows when its tab opens on a fresh layout", () => {
    const specs: PanelSpec[] = [...SPECS, { id: "history", name: "History", icon: "history", about: "", place: at("bottom-right", 0, 0, { closed: true }), size: { w: 28, h: 20 }, min: { w: 16, h: 8 } }];
    const f = new Floats("test", specs, [...TABS, { id: "history", name: "History", icon: "history", about: "", home: "history" }]);
    f.area = AREA;
    f.metrics = { rem: 16, gap: 8, head: 36, button: 28, char: 8 };
    expect(f.closed("history")).toBe(true);
    f.showTab("history", true);
    f.show("history"); // the page draws its FloatingPanel
    expect(f.closed("history")).toBe(false);
    expect(f.resolved.history.closed).toBeUndefined();
    expect(f.views.history).toBeDefined();
  });

  it("drags a tab out onto the stage: a panel of its own at the drop point, stored with the arrangement", () => {
    const f = floats();
    f.grabTab("code", "inspector", 1300, 20);
    f.dragTab(700, 300, null);
    expect(f.tabDrop).toBe("out");
    expect(f.dropTab()).toBe(true);
    expect(f.arrangement["float-1"]).toEqual({ tabs: ["code"], active: "code" });
    expect(f.spec("float-1")?.name).toBe("Code");
    expect(f.places["float-1"].size).toBeDefined();
    const stored = JSON.parse(localStorage.getItem(PANELS_KEY)!).test;
    expect(stored["@tabs"].panels["float-1"].tabs).toEqual(["code"]);
    // read back in a new page
    expect(new Floats("test", SPECS, TABS).arrangement).toEqual(f.arrangement);
  });

  it("drags a tab into another panel; a click (no drag) changes nothing", () => {
    const f = floats();
    f.grabTab("scenes", "scenes", 400, 700);
    f.dragTab(401, 700, { panel: "tree", index: 0 });
    expect(f.dropTab()).toBe(false);
    f.grabTab("scenes", "scenes", 400, 700);
    f.dragTab(100, 20, { panel: "tree", index: 1 });
    expect(f.dropTab()).toBe(true);
    expect(f.arrangement.tree.tabs).toEqual(["tree", "scenes"]);
    expect(f.arrangement.scenes).toBeUndefined();
    expect(f.closed("scenes")).toBe(true);
  });

  it("never closes the panel holding the Inspector; the menu lists the other tabs and brings them back", () => {
    const f = floats();
    f.close("inspector");
    expect(f.arrangement.inspector).toBeDefined();
    expect(f.closable().map(c => c.id)).toEqual(["tree", "code", "scenes"]);
    f.flip("tree");
    expect(f.holder("tree")).toBeNull();
    f.flip("tree");
    expect(f.holder("tree")).toBe("tree");
    f.reset();
    expect(f.tabPanels).toEqual(["tree", "inspector", "scenes"]);
    expect(localStorage.getItem(PANELS_KEY)).toBe("{}");
  });
});
