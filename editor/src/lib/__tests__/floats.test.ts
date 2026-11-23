import { describe, expect, it } from "vitest";
import {
  at, clampInto, crowd, defaultPlace, evade, isPlace, layout, moved, nearestFree, placeOf, raise, readPlaces, resized, settleSize, withPlaces, clearCorner,
  type Edge, type Metrics, type Neighbour, type PanelSpec, type Rect,
} from "../components/floats";

// #308: the floating panels' placement (after the SCUTOONS deck editor's floats)
const M: Metrics = { rem: 16, gap: 8, head: 36, button: 28, char: 8 };
const AREA: Rect = { x: 8, y: 8, w: 1424, h: 800 };
const SPECS: PanelSpec[] = [
  { id: "tree", name: "Tree", icon: "tree", about: "", place: at("top-left", 0, 0), size: { w: 16, h: "fill" }, min: { w: 12, h: 8 } },
  { id: "inspector", name: "Inspector", icon: "inspector", about: "", place: at("top-right", 0, 0), size: { w: 25, h: "fill" }, min: { w: 16, h: 10 }, essential: true },
  { id: "scenes", name: "Scenes", icon: "film", about: "", place: at("bottom-left", 16.5, 0), size: { w: "fill", h: 12 }, min: { w: 20, h: 10 } },
  { id: "info", name: "Info", icon: "info", about: "", place: at("bottom-left", 0, 0, { collapsed: true }), size: { w: 16, h: 10 }, min: { w: 12, h: 5 } },
  { id: "tools", name: "Tools", icon: "tool", about: "", place: at("top-left", 16.5, 0), size: { w: "content", h: "content" }, min: { w: 2, h: 2 }, essential: true, inline: true },
];
const ALL = new Set(SPECS.map(s => s.id));
const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;
const lay = (places = {}, more: Partial<Parameters<typeof layout>[0]> = {}) =>
  layout({ specs: SPECS, places, shown: ALL, area: AREA, m: M, measured: { tools: { w: 300, h: 28 } }, ...more });

describe("the floating panels: the default layout", () => {
  const views = lay();

  it("anchors each panel to its corner: the tree top left, the inspector right, the scenes at the bottom between them", () => {
    expect(views.tree.rect).toMatchObject({ x: 8, y: 8, w: 256 });
    expect(right(views.inspector.rect)).toBe(right(AREA));
    expect(views.inspector.rect).toMatchObject({ y: 8, w: 400, h: 800 });
    expect(views.scenes.rect).toMatchObject({ x: 8 + 264, h: 192 });
    expect(bottom(views.scenes.rect)).toBe(bottom(AREA));
    // The scenes fill the room between the tree and the inspector, the gap away from both
    expect(right(views.scenes.rect)).toBe(views.inspector.rect.x - 8);
  });

  it("folds the info to its pill at the bottom left; the tree leaves it its room", () => {
    expect(views.info.collapsed).toBe(true);
    expect(views.info.rect).toMatchObject({ x: 8, w: 72 + 32 + 28, h: 36 }); // grip and icon, the name, the close (no chevron, #318)
    expect(bottom(views.info.rect)).toBe(bottom(AREA));
    expect(bottom(views.tree.rect)).toBe(views.info.rect.y - 8);
  });

  it("sizes the inline toolbar after its content, beside the tree over the stage", () => {
    expect(views.tools.rect).toMatchObject({ x: 8 + 264, y: 8 });
    expect(views.tools.rect.w).toBe(300 + 36 + 28 + 8);
  });

  it("a toolbar never folds – a fold stored by an older editor is ignored (#315)", () => {
    const folded = lay({ tools: { corner: "top-left", dx: 264, dy: 0, collapsed: true } });
    expect(folded.tools.collapsed).toBe(false);
    expect(folded.tools.rect.w).toBe(300 + 36 + 28 + 8);
  });

  it("a vertical toolbar is a column: as wide as its content, its grip and button along it (#315)", () => {
    const column = lay({ tools: { corner: "top-left", dx: 264, dy: 0, vertical: true } }, { measured: { tools: { w: 28, h: 300 } } });
    expect(column.tools.rect.w).toBe(28 + 36 - 28 + 2);
    expect(column.tools.rect.h).toBe(300 + 36 + 28 + 8);
  });

  it("lets no two panels come closer than the gap", () => {
    const rects = Object.values(views).map(v => v.rect);
    rects.forEach((a, i) => rects.slice(i + 1).forEach(b => expect(crowd(a, b, 8)).toBe(false)));
  });

  it("an open info panel takes its room from the tree, which comes first", () => {
    const opened = lay({ info: { corner: "bottom-left", dx: 0, dy: 0 } });
    expect(opened.info.rect.h).toBe(160);
    expect(bottom(opened.tree.rect)).toBe(opened.info.rect.y - 8);
  });

  it("leaves out closed panels and panels the page does not draw; the stage takes their room", () => {
    const closed = lay({ tree: { corner: "top-left", dx: 0, dy: 0, closed: true } });
    expect(closed.tree).toBeUndefined();
    const notShown = lay({}, { shown: new Set(["inspector", "scenes"]) });
    expect(Object.keys(notShown).sort()).toEqual(["inspector", "scenes"]);
  });

  it("asks: the Code tab widens the inspector until it was resized", () => {
    expect(lay({}, { asks: { inspector: { w: 36, h: "fill" } } }).inspector.rect.w).toBe(576);
    const resizedOne = { inspector: { corner: "top-right" as const, dx: 0, dy: 0, size: { w: 300, h: 500 } } };
    expect(lay(resizedOne, { asks: { inspector: { w: 36, h: "fill" } } }).inspector.rect).toMatchObject({ w: 300, h: 500 });
  });

  it("keeps every panel inside a small window", () => {
    const small = { x: 8, y: 8, w: 600, h: 400 };
    const views = lay({}, { area: small });
    for (const v of Object.values(views)) {
      expect(v.rect.x).toBeGreaterThanOrEqual(small.x);
      expect(right(v.rect)).toBeLessThanOrEqual(right(small) + 0.01);
      expect(bottom(v.rect)).toBeLessThanOrEqual(bottom(small) + 0.01);
    }
  });
});

describe("the floating panels: places", () => {
  it("keeps a place by the corner nearest to the panel's middle", () => {
    expect(placeOf({ x: 1000, y: 600, w: 200, h: 100 }, AREA)).toEqual({ corner: "bottom-right", dx: 232, dy: 108 });
    expect(placeOf({ x: 50, y: 20, w: 200, h: 100 }, AREA)).toEqual({ corner: "top-left", dx: 42, dy: 12 });
  });

  it("comes back at the same distance from its corner when the window changes size", () => {
    const place = { inspector: { corner: "top-right" as const, dx: 40, dy: 20 } };
    const wide = lay(place).inspector.rect;
    const narrow = lay(place, { area: { ...AREA, w: 1100 } }).inspector.rect;
    expect(right(AREA) - right(wide)).toBe(40);
    expect(8 + 1100 - right(narrow)).toBe(40);
  });

  it("the default place is the spec's, in px; an essential panel never starts closed", () => {
    expect(defaultPlace(SPECS[2], M)).toEqual({ corner: "bottom-left", dx: 264, dy: 0 });
    expect(defaultPlace({ ...SPECS[1], place: at("top-right", 0, 0, { closed: true }) }, M)).toEqual({ corner: "top-right", dx: 0, dy: 0 });
  });
});

describe("the floating panels: move, resize", () => {
  it("a moved panel stays inside the walls", () => {
    expect(moved({ x: 100, y: 100, w: 200, h: 100 }, -500, 20, AREA)).toEqual({ x: 8, y: 120, w: 200, h: 100 });
    expect(clampInto({ x: 1400, y: 790, w: 200, h: 100 }, AREA)).toEqual({ x: 1232, y: 708, w: 200, h: 100 });
  });

  it("a panel moved by hand lies where it was dropped – over another one too – and moves none (#364)", () => {
    const specs = [
      { ...SPECS[0], place: at("top-left", 0, 0), size: { w: 20, h: "fill" as const } },
      { ...SPECS[1], place: at("top-right", 0, 0), size: { w: 20, h: 20 } },
    ];
    const area = { x: 0, y: 0, w: 1000, h: 800 };
    const m = { ...M, gap: 0 };
    // The second one dropped on the first: it stays there, and the first keeps its place and size
    const places = { [specs[1].id]: { corner: "top-left" as const, dx: 100, dy: 50, size: { w: 200, h: 150 }, free: true } };
    const views = layout({ specs, places, shown: new Set(specs.map(s => s.id)), area, m });
    expect(views[specs[1].id].rect).toEqual({ x: 100, y: 50, w: 200, h: 150 });
    expect(views[specs[0].id].rect).toMatchObject({ x: 0, y: 0, h: 800 });
    // Only kept inside the stage
    const out = { [specs[1].id]: { corner: "top-left" as const, dx: 950, dy: 0, size: { w: 200, h: 150 }, free: true } };
    expect(layout({ specs, places: out, shown: new Set(specs.map(s => s.id)), area, m })[specs[1].id].rect).toMatchObject({ x: 800 });
    expect(nearestFree({ x: 0, y: 0, w: 2000, h: 10 }, [], AREA, 8)).toBeNull();
  });

  it("the stage's corner controls find the nearest free place, bottom right first (#364)", () => {
    const area = { w: 1000, h: 800 };
    expect(clearCorner({ w: 40, h: 100 }, [], area, 8)).toEqual({ right: 8, bottom: 8 });
    // The Inspector along the right wall: just left of it
    const inspector = { x: 600, y: 0, w: 400, h: 800 };
    expect(clearCorner({ w: 40, h: 100 }, [inspector], area, 8)).toEqual({ right: 408, bottom: 8 });
    // A panel above the corner's height is not in the way
    expect(clearCorner({ w: 40, h: 100 }, [{ x: 900, y: 0, w: 100, h: 200 }], area, 8)).toEqual({ right: 8, bottom: 8 });
    // Two in a row along the bottom: past both
    expect(clearCorner({ w: 40, h: 100 }, [inspector, { x: 300, y: 600, w: 300, h: 200 }], area, 8)).toEqual({ right: 708, bottom: 8 });
    // The whole bottom taken (the Tree, the Scenes): just above the Scenes, at the right
    const tree = { x: 0, y: 0, w: 260, h: 800 };
    const scenes = { x: 270, y: 330, w: 730, h: 470 };
    const top = { x: 540, y: 0, w: 460, h: 160 };
    expect(clearCorner({ w: 40, h: 100 }, [tree, scenes, top], area, 8)).toEqual({ right: 8, bottom: 478 });
    // Nowhere free: the corner itself
    expect(clearCorner({ w: 40, h: 100 }, [{ x: 0, y: 0, w: 1000, h: 800 }], area, 8)).toEqual({ right: 8, bottom: 8 });
  });

  it("resizes by an edge or a corner, never below the least size or past a wall", () => {
    const start = { x: 100, y: 100, w: 300, h: 200 };
    expect(resized(start, { x: 1, y: 0 }, 50, 999, { w: 100, h: 50 }, AREA)).toEqual({ x: 100, y: 100, w: 350, h: 200 });
    expect(resized(start, { x: -1, y: -1 }, 250, 300, { w: 100, h: 50 }, AREA)).toEqual({ x: 300, y: 250, w: 100, h: 50 });
    expect(resized(start, { x: -1, y: 1 }, -500, 2000, { w: 100, h: 50 }, AREA)).toEqual({ x: 8, y: 100, w: 392, h: 708 });
  });

  it("a resize let go stops the gap before another panel", () => {
    const other = { x: 500, y: 100, w: 100, h: 100 };
    expect(settleSize({ x: 100, y: 120, w: 500, h: 50 }, { x: 1, y: 0 }, [other], { w: 50, h: 20 }, AREA, 8)).toEqual({ x: 100, y: 120, w: 392, h: 50 });
  });

  it("the panel touched last lies in front", () => {
    expect(raise(["tree", "inspector", "tools"], "tree")).toEqual(["inspector", "tools", "tree"]);
  });

  it("a panel in the hand lies where the pointer has it; the others lay out without it", () => {
    const held = { id: "tree", rect: { x: 500, y: 300, w: 256, h: 300 } };
    const views = lay({}, { held });
    expect(views.tree.rect).toEqual(held.rect);
    const without = lay({ tree: { corner: "top-left", dx: 0, dy: 0, closed: true } });
    expect(views.inspector).toEqual(without.inspector);
    expect(views.scenes).toEqual(without.scenes);
  });
});

describe("the floating panels: the layout in this browser", () => {
  it("reads the places of one workspace, only valid ones of known panels; an essential panel is never closed", () => {
    const stored = {
      scene: {
        tree: { corner: "top-left", dx: 10, dy: 0, collapsed: true },
        inspector: { corner: "top-right", dx: 0, dy: 0, closed: true },
        scenes: { corner: "middle", dx: 0, dy: 0 },
        ghost: { corner: "top-left", dx: 0, dy: 0 },
      },
      book: { tree: { corner: "top-left", dx: 99, dy: 0 } },
    };
    expect(readPlaces(stored, "scene", SPECS)).toEqual({
      tree: { corner: "top-left", dx: 10, dy: 0, collapsed: true },
      inspector: { corner: "top-right", dx: 0, dy: 0, closed: false },
    });
    expect(readPlaces("nonsense", "scene", SPECS)).toEqual({});
    expect(isPlace({ corner: "top-left", dx: 0, dy: 0, size: { w: 10, h: -1 } })).toBe(false);
  });

  it("writes one workspace's places and keeps the others; a reset removes that workspace", () => {
    const stored = { book: { tree: { corner: "top-left", dx: 1, dy: 0 } } };
    const scene = { tree: { corner: "top-right" as const, dx: 0, dy: 0 } };
    expect(withPlaces(stored, "scene", scene)).toEqual({ ...stored, scene });
    expect(withPlaces({ ...stored, scene }, "scene", null)).toEqual(stored);
  });
});

// #329: a resize makes room – the panels in its way move and, at the wall, shrink
describe("the floating panels: a resize pushes and shrinks its neighbours", () => {
  const A: Rect = { x: 0, y: 0, w: 1000, h: 600 };
  const G = 8;
  const n = (id: string, x: number, y: number, w: number, h: number, min = { w: 100, h: 100 }): Neighbour => ({ id, rect: { x, y, w, h }, min });
  const noOverlap = (rects: Record<string, Rect>) => {
    const all = Object.values(rects);
    all.forEach((a, i) => {
      expect(a.x).toBeGreaterThanOrEqual(A.x - 0.01);
      expect(a.y).toBeGreaterThanOrEqual(A.y - 0.01);
      expect(right(a)).toBeLessThanOrEqual(right(A) + 0.01);
      expect(bottom(a)).toBeLessThanOrEqual(bottom(A) + 0.01);
      all.slice(i + 1).forEach(b => expect(crowd(a, b, G)).toBe(false));
    });
  };

  it("moves the neighbour in the way, leaves the others where they are", () => {
    const panels = [n("a", 0, 0, 300, 300), n("b", 308, 0, 200, 300), n("c", 308, 400, 200, 200)];
    const out = evade(panels, "a", { x: 0, y: 0, w: 400, h: 300 }, { x: 1, y: 0 }, A, G);
    expect(out.a).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(out.b).toEqual({ x: 408, y: 0, w: 200, h: 300 });
    expect(out.c).toEqual(panels[2].rect);
    noOverlap(out);
  });

  it("pushes a chain: the one pushed pushes the next", () => {
    const panels = [n("a", 0, 0, 300, 300), n("b", 308, 0, 200, 300), n("c", 516, 100, 200, 300)];
    const out = evade(panels, "a", { x: 0, y: 0, w: 450, h: 300 }, { x: 1, y: 0 }, A, G);
    expect(out.b.x).toBe(458);
    expect(out.c.x).toBe(666);
    expect(out.c.w).toBe(200);
    noOverlap(out);
  });

  it("shrinks at the wall, the one nearest the wall first, down to the least size; then the edge stops", () => {
    const panels = [n("a", 0, 0, 300, 300), n("b", 308, 0, 300, 300), n("c", 616, 0, 384, 300)];
    // c reaches the wall at once and shrinks; b keeps its width while c can give
    const some = evade(panels, "a", { x: 0, y: 0, w: 450, h: 300 }, { x: 1, y: 0 }, A, G);
    expect(some.b).toMatchObject({ x: 458, w: 300 });
    expect(some.c).toMatchObject({ x: 766, w: 234 });
    // c at its least, b shrinks
    const more = evade(panels, "a", { x: 0, y: 0, w: 600, h: 300 }, { x: 1, y: 0 }, A, G);
    expect(more.c).toMatchObject({ x: 900, w: 100 });
    expect(more.b).toMatchObject({ x: 608, w: 284 });
    // both at their least: a stops growing
    const all = evade(panels, "a", { x: 0, y: 0, w: 990, h: 300 }, { x: 1, y: 0 }, A, G);
    expect(all.c).toMatchObject({ x: 900, w: 100 });
    expect(all.b).toMatchObject({ x: 792, w: 100 });
    expect(all.a.w).toBe(784);
    noOverlap(all);
  });

  it("works the same way for the left edge, the top and the bottom", () => {
    const left = evade([n("a", 700, 0, 300, 300), n("b", 492, 0, 200, 300)], "a", { x: 500, y: 0, w: 500, h: 300 }, { x: -1, y: 0 }, A, G);
    expect(left.b).toEqual({ x: 292, y: 0, w: 200, h: 300 });
    const down = evade([n("a", 0, 0, 300, 200), n("b", 0, 208, 300, 392)], "a", { x: 0, y: 0, w: 300, h: 300 }, { x: 0, y: 1 }, A, G);
    expect(down.b).toEqual({ x: 0, y: 308, w: 300, h: 292 });
    const up = evade([n("a", 0, 400, 300, 200), n("b", 0, 0, 300, 392)], "a", { x: 0, y: 0, w: 300, h: 600 }, { x: 0, y: -1 }, A, G);
    expect(up.b).toEqual({ x: 0, y: 0, w: 300, h: 100 });
    expect(up.a).toEqual({ x: 0, y: 108, w: 300, h: 492 });
  });

  it("a corner grip pushes both ways, and shrinking the panel again gives the neighbours their places back", () => {
    const panels = [n("a", 0, 0, 300, 300), n("right", 308, 0, 300, 300), n("below", 0, 308, 300, 292)];
    const out = evade(panels, "a", { x: 0, y: 0, w: 400, h: 400 }, { x: 1, y: 1 }, A, G);
    expect(out.right.x).toBe(408);
    expect(out.below).toMatchObject({ y: 408, h: 192 });
    noOverlap(out);
    expect(evade(panels, "a", { x: 0, y: 0, w: 250, h: 250 }, { x: 1, y: 1 }, A, G)).toMatchObject({ right: panels[1].rect, below: panels[2].rect });
  });

  it("never leaves an overlap, a panel outside the walls or below its least size (random layouts)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let round = 0; round < 300; round++) {
      // A grid of cells, some taken: a layout with no overlap
      const panels: Neighbour[] = [];
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 3; row++) {
          if (rnd() < 0.3) continue;
          const w = 120 + Math.floor(rnd() * 120);
          const h = 100 + Math.floor(rnd() * 90);
          panels.push(n(`p${col}${row}`, col * 250, row * 200, Math.min(w, 242), Math.min(h, 192), { w: 60 + Math.floor(rnd() * 60), h: 40 + Math.floor(rnd() * 60) }));
        }
      }
      if (panels.length < 2) continue;
      const held = panels[Math.floor(rnd() * panels.length)];
      const edge = { x: [-1, 0, 1][Math.floor(rnd() * 3)], y: [-1, 0, 1][Math.floor(rnd() * 3)] } as Edge;
      if (!edge.x && !edge.y) continue;
      const target = resized(held.rect, edge, (rnd() - 0.3) * 800, (rnd() - 0.3) * 600, held.min, A);
      const out = evade(panels, held.id, target, edge, A, G);
      noOverlap(out);
      for (const p of panels) {
        expect(out[p.id].w).toBeGreaterThanOrEqual(Math.min(p.min.w, p.rect.w) - 0.01);
        expect(out[p.id].h).toBeGreaterThanOrEqual(Math.min(p.min.h, p.rect.h) - 0.01);
      }
    }
  });
});
