import { describe, expect, it } from "vitest";
import { COMPONENT_TYPES, componentProblems, resolveComponent } from "@shared/types/components";

/** Components on a node – the specs drive the checks and the defaults */
describe("components", () => {
  it("the built-in components: animation, behaviour", () => {
    expect(COMPONENT_TYPES).toEqual(["animation", "behaviour"]);
  });

  it("accepts a well-formed animation on a model", () => {
    expect(componentProblems([{ type: "animation", clip: "Idle", playOn: "tap", loop: false, speed: 1.5 }], "components", "model")).toEqual([]);
  });

  it("names every problem with its path", () => {
    expect(componentProblems([
      { type: "spin" },
      { type: "animation", playOn: "sometimes", speed: 9, loop: "yes", clip: 3, extra: 1 },
    ], "components", "model")).toEqual([
      'components[0].type: "spin" is not one of animation, behaviour',
      "components[1].playOn: expected one of found, tap, never, got \"sometimes\"",
      "components[1].speed: expected a number from 0.1 to 4, got 9",
      "components[1].loop: expected true or false, got \"yes\"",
      "components[1].clip: expected a string, got 3",
      "components[1].extra: unknown parameter of animation (clip, playOn, stopOn, loop, speed)",
    ]);
  });

  it("knows which node types a component applies to", () => {
    expect(componentProblems([{ type: "animation" }], "components", "video")).toEqual(["components[0]: animation applies to model nodes, not to a video"]);
    expect(componentProblems("nope", "components")).toEqual(["components: expected a list of components"]);
  });

  it("resolves a component with its defaults", () => {
    expect(resolveComponent([{ type: "animation", clip: "Walk" }], "animation")).toEqual({ type: "animation", clip: "Walk", playOn: "found", stopOn: "lost", loop: true, speed: 1 });
    expect(resolveComponent(undefined, "animation")).toBeUndefined();
  });
});
