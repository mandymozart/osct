import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpreadFormat, Target } from "@engine/types";
import { setPreviewActive } from "../preview";
import type { StageBook, StageTarget } from "../mock-tracker";

// The draft's spread: its format changes under the tracker as the Stage panel saves a new one
const draft = vi.hoisted(() => ({ format: "spread" as SpreadFormat }));
vi.mock("@engine/content/game-config", () => ({
  getSpread: (id: string) => ({ id, format: draft.format, firstPage: 1, lastPage: 1 }),
  getSpreads: () => [{ id: "s", format: draft.format }],
}));

const { MockTracker } = await import("../mock-tracker");

const target = (id: string): Target => ({ id, entryId: id, spreadId: "s", imageSrc: `/${id}.jpg` });

describe("MockTracker.relayout: a changed format reaches the stage at once", () => {
  let layouts: Array<{ targets: readonly StageTarget[]; book: StageBook }>;
  let tracker: InstanceType<typeof MockTracker>;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    draft.format = "spread";
    layouts = [];
    tracker = new MockTracker(document.createElement("div"), { onUpdate: () => {} } as never, async () => ({}), () => 0, async () => null);
    tracker.attachStage({
      setLayout(targets, _page, _sheet, book) { layouts.push({ targets, book }); },
      setHdri() {},
      update() {},
      dispose() {},
    });
  });

  afterEach(() => {
    tracker.stop();
    vi.unstubAllGlobals();
  });

  it("lays the spread out as a closed cover after the format changed, without loading the targets again", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ spreadId: "s", targets: [target("a")] });
    expect(layouts.at(-1)!.book.format).toBe("spread");
    expect(layouts.at(-1)!.targets[0].surface).toBe("right");

    draft.format = "cover";
    tracker.relayout();
    expect(layouts.at(-1)!.book.format).toBe("cover");
    expect(layouts.at(-1)!.targets.map(t => [t.id, t.surface])).toEqual([["a", "front"]]);
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
