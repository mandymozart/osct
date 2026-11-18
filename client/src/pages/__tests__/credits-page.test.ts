import { describe, expect, it } from "vitest";
import { sceneLabel } from "@engine/content/scenes";

/** The image credits page groups its lines by scene – under the scene's label, as the reader finds it (#292, #319) */
describe("credits page scene heading", () => {
  it("is the scene's label as it is – no page arithmetic", () => {
    expect(sceneLabel({ id: "s002-003", label: "2–3" })).toBe("2–3");
    expect(sceneLabel({ id: "cover", label: "Cover" })).toBe("Cover");
    expect(sceneLabel({ id: "wall", label: " " })).toBe("wall");
  });
});
