import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT, environmentOf, environmentProblems } from "@shared/types/environment";
import { effectiveGraphics } from "../../scene/look-around/look-around";

// The book's environment (content schema 2.7): the content says what is drawn, the reader's switches apply on top
describe("book environment (content schema 2.7)", () => {
  it("a book without one keeps today's look", () => {
    expect(environmentOf({})).toEqual(DEFAULT_ENVIRONMENT);
    expect(environmentOf(undefined)).toEqual({ world: "cafe", onionSky: true });
  });

  it("accepts a valid environment and refuses the rest", () => {
    expect(environmentProblems({ world: "cafe", onionSky: false })).toEqual([]);
    expect(environmentProblems({ world: "moon", onionSky: true })).toEqual(["environment.world must be one of cafe."]);
    expect(environmentProblems({ world: "cafe" })).toEqual(["environment.onionSky must be true or false."]);
    expect(environmentProblems({ world: "cafe", onionSky: "yes" })).toEqual(["environment.onionSky must be true or false."]);
    expect(environmentProblems({ world: "cafe", onionSky: true, tint: 1 })).toEqual(["environment.tint is not a field of the environment."]);
    expect(environmentProblems("cafe")).toEqual(["environment must be an object { world, onionSky }."]);
    expect(environmentProblems([])).toEqual(["environment must be an object { world, onionSky }."]);
  });

  it("the reader's switches apply on top of the book's environment", () => {
    const reader = { onionSky: true, surroundings: true };
    expect(effectiveGraphics(reader, { world: "cafe", onionSky: true })).toEqual({ onionSky: true, surroundings: true });
    expect(effectiveGraphics(reader, { world: "cafe", onionSky: false })).toEqual({ onionSky: false, surroundings: true });
    expect(effectiveGraphics({ onionSky: false, surroundings: true }, { world: "cafe", onionSky: true })).toEqual({ onionSky: false, surroundings: true });
    // the content never turns on what the reader has off
    expect(effectiveGraphics({ onionSky: false, surroundings: false }, { world: "cafe", onionSky: true })).toEqual({ onionSky: false, surroundings: false });
  });
});
