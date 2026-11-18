import { describe, expect, it } from "vitest";
import {
  bandDrop, dropAtEnd, dropMark, dropOver, GRID_COLUMN_FLOOR, GRID_COLUMN_MAX, GRID_COLUMN_MIN, gridColumns, gridSpan, groupedOf, newGroupLabel, pickModeOf, pickScenes, planDrop, runCounts, sceneName, sceneSpan,
  stepScene, stripKey, stripRuns, surfaceParts, targetsOf, ungroupPlan, type StripScene,
} from "../scene-strip";

const scene = (id: string, group?: string, targets = 0, extra: Partial<StripScene> = {}): StripScene => ({
  id, title: "", firstPage: 2, lastPage: 3, ...(group ? { group } : {}),
  entries: Array.from({ length: targets + 1 }, (_, i) => (i < targets ? { target: { id: `${id}-${i}` } } : { target: null })),
  ...extra,
});

// a b | [g: c d e] | f g2:[h]
const scenes = [scene("a"), scene("b"), scene("c", "g", 8), scene("d", "g", 9), scene("e", "g", 6), scene("f"), scene("h", "k", 2)];
const groups = [{ id: "g", label: "Morpher" }, { id: "k", label: "Wall" }];
const order = scenes.map(s => s.id);

describe("the strip's runs and counts", () => {
  it("makes a band of a group's neighbouring scenes and loose runs between", () => {
    const runs = stripRuns(scenes, groups);
    expect(runs.map(r => [r.group?.label ?? null, r.scenes.map(s => s.id), r.start])).toEqual([
      [null, ["a", "b"], 0], ["Morpher", ["c", "d", "e"], 2], [null, ["f"], 5], ["Wall", ["h"], 6],
    ]);
  });
  it("shows a group's scenes apart from each other as two bands, an unknown group by its id", () => {
    const runs = stripRuns([scene("a", "g"), scene("b"), scene("c", "g"), scene("d", "x")], groups);
    expect(runs.map(r => r.group?.label ?? null)).toEqual(["Morpher", null, "Morpher", "x"]);
  });
  it("counts targets and warns above the loading window", () => {
    expect(targetsOf(scenes[2])).toBe(8);
    expect(runCounts(scenes.slice(2, 5))).toEqual({ scenes: 3, targets: 23, over: true });
    expect(runCounts(scenes.slice(2, 5), 30)).toEqual({ scenes: 3, targets: 23, over: false });
    expect(runCounts([])).toEqual({ scenes: 0, targets: 0, over: false });
  });
  it("names a scene by its label, its own title or its pages", () => {
    expect(sceneName(scene("a", undefined, 0, { label: " Studio wall " }))).toBe("Studio wall");
    expect(sceneName(scene("a", undefined, 0, { title: "Pages 2–3" }))).toBe("2–3");
    expect(sceneName(scene("a", undefined, 0, { title: "Janus" }))).toBe("Janus");
    expect(sceneName(scene("a", undefined, 0, { title: "Front matter 1", matter: "front" }))).toBe("Front matter 1");
    expect(sceneName(scene("a", undefined, 0, { format: "cover", firstPage: 0, lastPage: 0 }))).toBe("cover");
    expect(sceneSpan(["22–23", "24–25", "26–27"])).toBe("22–23 … 26–27");
    expect(sceneSpan([])).toBe("none");
  });
});

describe("picking", () => {
  it("picks one, toggles with Ctrl, a range with Shift – always in order", () => {
    let picks = pickScenes(order, { picked: [], anchor: null }, "d", "only");
    expect(picks).toEqual({ picked: ["d"], anchor: "d" });
    picks = pickScenes(order, picks, "a", "toggle");
    expect(picks.picked).toEqual(["a", "d"]);
    picks = pickScenes(order, picks, "d", "toggle");
    expect(picks.picked).toEqual(["a"]);
    picks = pickScenes(order, { picked: ["c"], anchor: "c" }, "f", "range");
    expect(picks).toEqual({ picked: ["c", "d", "e", "f"], anchor: "c" });
    expect(pickScenes(order, picks, "a", "range").picked).toEqual(["a", "b", "c"]);
  });
  it("starts a range at the scene itself without an anchor", () => {
    expect(pickScenes(order, { picked: [], anchor: "gone" }, "b", "range")).toEqual({ picked: ["b"], anchor: "b" });
  });
  it("reads the mode from the modifier keys", () => {
    expect(pickModeOf({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe("range");
    expect(pickModeOf({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe("toggle");
    expect(pickModeOf({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe("only");
  });
  it("steps with the arrows, stopping at the ends", () => {
    expect(stepScene(order, "a", -1)).toBe("a");
    expect(stepScene(order, "a", 1)).toBe("b");
    expect(stepScene(order, "h", 1)).toBe("h");
    expect(stepScene(order, null, -1)).toBe("h");
    expect(stepScene([], null, 1)).toBeNull();
  });
  it("maps the keys", () => {
    const k = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) =>
      stripKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
    expect(k("g", { ctrlKey: true })).toBe("group");
    expect(k("G", { ctrlKey: true, shiftKey: true })).toBe("ungroup");
    expect(k("ArrowLeft")).toEqual({ move: -1, extend: false });
    expect(k("ArrowRight", { shiftKey: true })).toEqual({ move: 1, extend: true });
    expect(k("Enter")).toBe("open");
    expect(k("ArrowLeft", { ctrlKey: true })).toBeNull();
    expect(k("x")).toBeNull();
  });
});

describe("dropping", () => {
  it("takes the gap and the group from the scene under the pointer", () => {
    expect(dropOver(scenes, 4, true)).toEqual({ gap: 5, group: "g" }); // right half of e: the band's end, inside
    expect(dropOver(scenes, 5, false)).toEqual({ gap: 5, group: null }); // left half of f: the same gap, outside
    expect(dropOver(scenes, 0, false)).toEqual({ gap: 0, group: null });
    expect(dropAtEnd(scenes)).toEqual({ gap: 7, group: null });
  });
  it("draws the line inside the band the drop joins", () => {
    expect(dropMark(scenes, { gap: 5, group: "g" })).toEqual({ index: 4, side: "after" });
    expect(dropMark(scenes, { gap: 5, group: null })).toEqual({ index: 5, side: "before" });
    expect(dropMark(scenes, { gap: 0, group: null })).toEqual({ index: 0, side: "before" });
    expect(dropMark(scenes, dropAtEnd(scenes))).toEqual({ index: 6, side: "after" });
    expect(dropMark([], { gap: 0, group: null })).toBeNull();
  });
  it("moves a scene into a band: placed after its neighbour, the group sent", () => {
    // f dragged between d and e (left half of e)
    const plan = planDrop(scenes, ["f"], dropOver(scenes, 4, false));
    expect(plan.order).toEqual(["a", "b", "c", "d", "f", "e", "h"]);
    expect(plan.request).toEqual({ scenes: ["f"], after: "d", group: "g" });
    expect(plan.changed).toBe(true);
  });
  it("moves picked scenes as a block in their order, before the first when nothing stays before", () => {
    const plan = planDrop(scenes, ["f", "b"], dropOver(scenes, 0, false));
    expect(plan.order).toEqual(["b", "f", "a", "c", "d", "e", "h"]);
    expect(plan.request).toEqual({ scenes: ["b", "f"], before: "a", group: null });
  });
  it("joins a group in place: the order stays, the group changes", () => {
    const plan = planDrop(scenes, ["f"], dropOver(scenes, 4, true));
    expect(plan.order).toEqual(order);
    expect(plan.request).toEqual({ scenes: ["f"], after: "e", group: "g" });
    expect(plan.changed).toBe(true);
  });
  it("sends nothing for a drop where the scene is", () => {
    expect(planDrop(scenes, ["b"], dropOver(scenes, 1, true)).changed).toBe(false);
    expect(planDrop(scenes, ["b"], dropOver(scenes, 2, false)).changed).toBe(true); // left half of c joins the band
    expect(planDrop(scenes, [], dropOver(scenes, 1, true)).changed).toBe(false);
  });
  it("places at position 0 when every scene moves", () => {
    const two = [scene("a"), scene("b")];
    expect(planDrop(two, ["a", "b"], dropAtEnd(two)).request).toEqual({ scenes: ["a", "b"], position: 0, group: null });
  });
  it("keeps a dragged band's group and keeps it out of other bands", () => {
    const band = ["c", "d", "e"];
    const inside = bandDrop(scenes, { gap: 1, group: null }, "g");
    expect(inside).toEqual({ gap: 1, group: null });
    const plan = planDrop(scenes, band, inside, true);
    expect(plan.order).toEqual(["a", "c", "d", "e", "b", "f", "h"]);
    expect(plan.request).toEqual({ scenes: band, after: "a" });
    // a band of [x y] dropped between c and d goes after e
    expect(bandDrop(scenes, { gap: 3, group: "g" }, "k")).toEqual({ gap: 5, group: null });
    expect(bandDrop(scenes, { gap: 2, group: "g" }, "k")).toEqual({ gap: 2, group: "g" });
  });
});

describe("groups and surfaces", () => {
  it("names a new group with the first free number", () => {
    expect(newGroupLabel([])).toBe("Group 1");
    expect(newGroupLabel([{ label: "Group 2" }])).toBe("Group 3");
    expect(newGroupLabel([{ label: "Front matter" }, { label: "group 3" }])).toBe("Group 4");
  });
  it("finds the picked scenes in a group", () => {
    expect(groupedOf(scenes, ["a", "c", "h"])).toEqual(["c", "h"]);
  });
  it("ungroups a wholly picked group as a whole, the others' picked scenes one by one", () => {
    expect(ungroupPlan(scenes, ["c", "h"])).toEqual({ whole: ["k"], leaving: ["c"] });
    expect(ungroupPlan(scenes, ["c", "d", "e"])).toEqual({ whole: ["g"], leaving: [] });
  });
  it("draws a thumbnail from the surfaces' widths", () => {
    const parts = surfaceParts([{ id: "l", widthMm: 230, heightMm: 320, label: "40" }, { id: "r", widthMm: 230, heightMm: 320 }]);
    expect(parts?.parts.map(p => [p.id, p.share, p.label])).toEqual([["l", 0.5, "40"], ["r", 0.5, ""]]);
    expect(parts?.ratio).toBeCloseTo(460 / 320);
    expect(surfaceParts([])).toBeNull();
  });
});

// The Scenes panel's grid (#315): page-wide columns that wrap, sized by the panel's width
describe("scene strip: the grid's columns", () => {
  const A4 = 210 / 297;

  it("a narrow panel is one column, never narrower than the panel", () => {
    expect(gridColumns(120, A4, 12).columns).toBe(1);
    expect(gridColumns(60, A4, 12)).toMatchObject({ columns: 1, column: 60 });
  });

  it("adds columns as the panel widens, each between the least and the most width", () => {
    for (const width of [200, 360, 640, 1000, 1600]) {
      const { columns, column } = gridColumns(width, A4, 12);
      expect(column).toBeGreaterThanOrEqual(GRID_COLUMN_MIN);
      expect(column).toBeLessThanOrEqual(GRID_COLUMN_MAX);
      expect(columns * column + (columns - 1) * 12).toBeCloseTo(width);
    }
    expect(gridColumns(1000, A4, 12).columns).toBeGreaterThan(gridColumns(360, A4, 12).columns);
  });

  it("the card's height follows the column and the page's ratio", () => {
    const { column, cardHeight } = gridColumns(640, A4, 12);
    expect(cardHeight).toBeCloseTo(column / A4);
  });

  it("a short panel narrows the columns so a whole row shows", () => {
    const tall = gridColumns(800, A4, 12);
    const short = gridColumns(800, A4, 12, 100);
    expect(short.cardHeight).toBeLessThanOrEqual(100 + 0.01 * 100);
    expect(short.columns).toBeGreaterThan(tall.columns);
    expect(gridColumns(800, A4, 12, 10).column).toBeGreaterThanOrEqual(GRID_COLUMN_FLOOR - 0.01);
  });

  it("a card spans its pages: a double page two columns, never more than there are", () => {
    expect(gridSpan(A4, A4, 4)).toBe(1);
    expect(gridSpan(2 * A4, A4, 4)).toBe(2);
    expect(gridSpan(3 * A4, A4, 2)).toBe(2);
    expect(gridSpan(2 * A4, A4, 1)).toBe(1);
  });
});
