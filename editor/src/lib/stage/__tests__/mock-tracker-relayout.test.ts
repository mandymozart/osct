import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SurfaceData, Target } from "@engine/types";
import { setPreviewActive } from "../preview";
import type { StageBook, StageTarget } from "../mock-tracker";

// The draft's scene: its surfaces change under the tracker as the Inspector saves them (#319: arrange in a row, a wall)
const FLAT = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const draft = vi.hoisted(() => ({ surfaces: [] as SurfaceData[] }));
vi.mock("@engine/content/game-config", () => ({
  getSpread: (id: string) => ({ id, label: id, surfaces: draft.surfaces, entries: [], targets: [] }),
  getSpreads: () => [{ id: "s", label: "s", surfaces: draft.surfaces }],
}));

const { MockTracker } = await import("../mock-tracker");

const target = (id: string, place?: Target["place"]): Target => ({ id, entryId: id, spreadId: "s", imageSrc: `/${id}.jpg`, ...(place ? { place } : {}) });

describe("MockTracker.relayout: changed surfaces reach the stage at once", () => {
  let layouts: Array<{ targets: readonly StageTarget[]; book: StageBook }>;
  let tracker: InstanceType<typeof MockTracker>;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    draft.surfaces = [{ id: "surface", widthMm: 460, heightMm: 320, place: { ...FLAT } }];
    layouts = [];
    tracker = new MockTracker(document.createElement("div"), { onUpdate: () => {} } as never, async () => ({}), () => 0);
    tracker.attachStage({
      setLayout(targets, book) { layouts.push({ targets, book }); },
      setHdri() {},
      update() {},
      dispose() {},
    });
  });

  afterEach(() => {
    tracker.stop();
    vi.unstubAllGlobals();
  });

  it("lays the scene out again from its new surfaces, without loading the targets again", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ spreadId: "s", targets: [target("a", { surface: "wall", x: 10, y: 20, width: 50 })] });
    expect(layouts.at(-1)!.book.surfaces.map(s => s.id)).toEqual(["surface"]);
    // The surface it names is not there: the scene's first
    expect(layouts.at(-1)!.targets[0].surface).toBe("surface");

    draft.surfaces = [...draft.surfaces, { id: "wall", widthMm: 2000, heightMm: 1500, place: { ...FLAT, y: 750, z: -260, rx: 90 } }];
    tracker.relayout();
    expect(layouts.at(-1)!.book.surfaces.map(s => [s.id, s.place.rx])).toEqual([["surface", 0], ["wall", 90]]);
    expect(layouts.at(-1)!.targets.map(t => [t.id, t.surface, t.x])).toEqual([["a", "wall", 10]]);
    expect(tracker.surfaceFrames().map(f => [f.id, f.flat])).toEqual([["surface", true], ["wall", false]]);
  });

  it("does nothing once tracking stopped", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ spreadId: "s", targets: [target("a")] });
    tracker.stopTracking();
    const count = layouts.length;
    tracker.relayout();
    expect(layouts).toHaveLength(count);
  });
});
