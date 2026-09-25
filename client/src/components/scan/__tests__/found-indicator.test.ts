import { describe, expect, it, vi } from "vitest";

// The demo content has no target without an AR entity yet – use a small stand-in
vi.mock("@/utils/game-config", async importOriginal => {
  const actual = await importOriginal<typeof import("@/utils/game-config")>();
  const targets: Record<string, object> = {
    plain: { id: "plain", entryId: "plain", spreadId: "s", index: 0 },
    "plain-2": { id: "plain-2", entryId: "plain-2", spreadId: "s", index: 1 },
    video: { id: "video", entryId: "video", spreadId: "s", index: 2, entity: { type: "video", assets: [] } },
  };
  return { ...actual, getTarget: (id: string) => targets[id] };
});

const { getIndicatorTarget } = await import("../found-indicator");

describe("found indicator", () => {
  it("shows the most recently found target without an AR entity", () => {
    expect(getIndicatorTarget(["plain", "plain-2"])?.id).toBe("plain-2");
    expect(getIndicatorTarget(["plain-2", "plain"])?.id).toBe("plain");
  });

  it("ignores targets with an AR entity (A-Frame shows them) and unknown ids", () => {
    expect(getIndicatorTarget(["plain", "video"])?.id).toBe("plain");
    expect(getIndicatorTarget(["video", "unknown"])).toBeUndefined();
    expect(getIndicatorTarget([])).toBeUndefined();
  });
});
