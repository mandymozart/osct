import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at, crowd, type PanelSpec, type Rect } from "../components/floats";
import { Floats, PANELS_KEY } from "../components/floats.svelte.js";

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
