import { describe, expect, it, vi } from "vitest";
import { type ArError, type ArStatus, ErrorCode, SceneState } from "@/types";

// The AR chunk cannot be loaded: a deploy removed it under the open page (or the reader is offline)
vi.mock("../ar", () => {
  throw new TypeError("Failed to fetch dynamically imported module: /assets/app/index-old.js");
});

const { LazyArScene } = await import("../lazy-ar-scene");

describe("LazyArScene without its AR chunk", () => {
  it("the warm-up says the chunk is missing (the bridge then offers the reload)", async () => {
    expect(await new LazyArScene(document.createElement("div")).warmUp()).toBe(false);
  });

  it("a scan reports AR_LOAD_FAILED instead of hanging, and tries the chunk again on the next scan", async () => {
    const lazy = new LazyArScene(document.createElement("div"));
    const statuses: Array<[ArStatus, ArError | undefined]> = [];
    lazy.on("status", (status, error) => statuses.push([status, error]));
    await lazy.setState(SceneState.RUNNING);
    expect(statuses.map(([status]) => status)).toEqual(["loading", "error"]);
    expect(statuses[1][1]?.code).toBe(ErrorCode.AR_LOAD_FAILED);

    await lazy.setState(SceneState.RUNNING);
    expect(statuses.map(([status]) => status)).toEqual(["loading", "error", "loading", "error"]);
  });
});
