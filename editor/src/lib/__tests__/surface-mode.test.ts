import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import { parentSelection, settledSelection } from "../selection";
import { selection } from "../selection.svelte";
import { isRowOn, parentRow, rowSelection, selectedItem, treeRows } from "../tree-rows";
import { changeSummary, changeTitle, treeNames } from "../history";
import { usageText } from "../library-code";
import { placeObject, placeOfObject, sceneRoot } from "../stage/surface-gizmo";
import { readFrameEvent, surfaceGizmoRequest } from "../stage/frame-protocol";
import { sceneSurfaces, surfaceFrame } from "../stage/surfaces";
import { STAGE_TOOLS, TOOL_KEYS, isGizmoTool } from "../stage/gizmo";

/** #314: the Surface mode – a surface selected, the Tree's Surfaces level, the History's words, the surface gizmo's frame */

describe("a surface selected", () => {
  it("names no target, node or entry, is not the spread, and goes up to the spread", () => {
    const settled = settledSelection({ target: "p015-1", node: [1], onTarget: false, surface: { scene: "s040-041", id: "wall" } });
    expect(settled).toEqual({ target: null, node: [], onTarget: true, spread: false, entry: null, surface: { scene: "s040-041", id: "wall" } });
    expect(parentSelection(settled)).toEqual({ target: null, node: [], onTarget: true, spread: true });
  });

  it("the shared selection keeps it; anything else selected drops it", () => {
    selection.selectSurface("s040-041", "left");
    expect(selection.surface).toEqual({ scene: "s040-041", id: "left" });
    expect(selection.spread).toBe(false);
    expect(selection.snapshot().surface).toEqual({ scene: "s040-041", id: "left" });
    selection.selectTarget("p015-1");
    expect(selection.surface).toBeNull();
    selection.selectSurface("s040-041", "left");
    selection.clear();
    expect(selection.surface).toBeNull();
    expect(selection.spread).toBe(true);
  });
});

describe("the Tree's Surfaces level", () => {
  const rows = treeRows([{ id: "e1", target: null }], { isOpen: () => true, nodes: () => [], surfaces: { sceneId: "s1", ids: ["left", "wall"] } });

  it("the scene's surfaces follow the spread row, before the entries", () => {
    expect(rows.map(r => r.kind)).toEqual(["spread", "surface", "surface", "entry"]);
  });

  it("a tap selects the surface: its row is on, no other; ← goes to the spread", () => {
    const state = rowSelection(rows[2]);
    expect(state.surface).toEqual({ scene: "s1", id: "wall" });
    expect(rows.map(row => isRowOn(row, state, () => false))).toEqual([false, false, true, false]);
    expect(selectedItem(state, false)).toBe("surface");
    expect(parentRow(rows, 2)).toEqual({ kind: "spread" });
  });
});

describe("a reference image in words", () => {
  const names = { scene: (id: string) => (id === "s002-003" ? "Pages 2–3" : undefined) };
  it("the History's title names the scene and the surface", () => {
    expect(changeTitle({ kind: "reference", ref: "s002-003/left" }, names)).toBe("Reference image Pages 2–3 · left");
    expect(changeTitle({ kind: "reference", ref: "extra/wall" })).toBe("Reference image extra · wall");
  });

  it("set, replaced, refitted, removed", () => {
    const a = { url: "https://cdn/a.jpg", name: "a", fit: "cover" };
    expect(changeSummary({ kind: "reference", before: null, after: a })).toBe("created");
    expect(changeSummary({ kind: "reference", before: a, after: { ...a, url: "https://cdn/b.jpg" } })).toBe("image replaced");
    expect(changeSummary({ kind: "reference", before: a, after: { ...a, fit: "contain" } })).toBe('fit: "cover" → "contain"');
    expect(changeSummary({ kind: "reference", before: a, after: null })).toBe("removed");
  });

  it("belongs to its scene in the History's filter; the Library's usage line names it", () => {
    expect(treeNames(null).scenesOf({ kind: "reference", ref: "s002-003/left" })).toEqual(["s002-003"]);
    expect(usageText([{ kind: "reference", ref: "s002-003/left" }, { kind: "target", ref: "p015-1" }])).toBe("reference image of s002-003 · left, target p015-1");
  });
});

describe("the Surface tool and its gizmo", () => {
  it("is a tool of its own (S), not a gizmo mode of the nodes", () => {
    expect(STAGE_TOOLS).toContain("surface");
    expect(TOOL_KEYS.s).toBe("surface");
    expect(isGizmoTool("surface")).toBe(false);
    expect(isGizmoTool("rotate")).toBe(true);
  });

  it("the stand-in in the scene's frame lies where the stage lays the surface", () => {
    const place = { x: 100, y: 750, z: -260, rx: 90, ry: 0, rz: 15 };
    const root = sceneRoot();
    const proxy = new Object3D();
    root.add(proxy);
    placeObject(proxy, place);
    root.updateMatrixWorld(true);
    expect(placeOfObject(proxy)).toEqual(place);
    // Its centre in the stage frame (m) is the surface frame's centre (mm)
    const [surface] = sceneSurfaces({ surfaces: [{ id: "wall", widthMm: 2000, heightMm: 1500, place }] });
    const frame = surfaceFrame(surface);
    const centre = frame.origin.map((o, k) => o + frame.right[k] * 1000 + frame.down[k] * 750);
    const world = proxy.getWorldPosition(new Vector3()).multiplyScalar(1000);
    expect(world.x).toBeCloseTo(centre[0], 3);
    expect(world.y).toBeCloseTo(centre[1], 3);
    expect(world.z).toBeCloseTo(centre[2], 3);
    // …and its face looks where the surface's does
    const normal = new Vector3(0, 1, 0).transformDirection(proxy.matrixWorld);
    expect([normal.x, normal.y, normal.z].map(v => +v.toFixed(6) + 0)).toEqual(frame.normal.map(v => +v.toFixed(6) + 0));
  });

  it("the page's ask and the frame's answer are checked", () => {
    expect(surfaceGizmoRequest("wall", "rotate")).toEqual({ surfaceId: "wall", mode: "rotate" });
    expect(surfaceGizmoRequest(42, "spin")).toEqual({ surfaceId: null, mode: "translate" });
    const message = (data: unknown) => ({ osct: "stage", kind: "event", name: "surfacePlace", data });
    const place = { x: 1, y: 2, z: 3, rx: 90, ry: 0, rz: 0 };
    expect(readFrameEvent(message({ surfaceId: "wall", place }))?.name).toBe("surfacePlace");
    expect(readFrameEvent(message({ surfaceId: "wall", place: { ...place, rz: Number.NaN } }))).toBeNull();
    expect(readFrameEvent(message({ surfaceId: "", place }))).toBeNull();
  });
});
