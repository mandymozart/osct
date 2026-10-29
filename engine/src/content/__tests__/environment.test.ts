import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT, environmentOf, environmentProblems, referenceExtension } from "@shared/types/environment";
import { assertGameConfiguration } from "@shared/guards/game-config";
import { effectiveGraphics } from "../../scene/look-around/look-around";

// The book's environment (content schema 2.8): the content says what is drawn, the reader's switches apply on top
describe("book environment (content schema 2.8)", () => {
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

// The world and the sky as assets (content schema 2.9): a content path or an absolute URL, by file type
describe("environment assets (content schema 2.9)", () => {
  const base = { world: "cafe", onionSky: true } as const;

  it("accepts a world model and a sky image as content paths or absolute URLs", () => {
    expect(environmentProblems({ ...base, worldSrc: "/assets/content/environment/world.glb", skySrc: "/assets/content/environment/sky.jpg" })).toEqual([]);
    expect(environmentProblems({ ...base, worldSrc: "https://cdn.example.com/assets/b/a/v2.GLB", skySrc: "https://cdn.example.com/a/v1.webp?x=1" })).toEqual([]);
    expect(environmentProblems({ ...base, worldSrc: "http://127.0.0.1:8080/api/content/assets/b/a/v1.gltf" })).toEqual([]);
  });

  it("refuses other files, relative paths and other values", () => {
    expect(environmentProblems({ ...base, worldSrc: "/assets/content/sky.jpg" })).toEqual(["environment.worldSrc must be a glTF model (.glb, .gltf)."]);
    expect(environmentProblems({ ...base, skySrc: "/assets/content/sky.hdr" })).toEqual(["environment.skySrc must be an equirectangular image (.jpg, .jpeg, .png, .webp)."]);
    expect(environmentProblems({ ...base, skySrc: "environment/sky.jpg" })).toEqual(["environment.skySrc must be a content path (/assets/content/…) or an absolute URL of an equirectangular image."]);
    expect(environmentProblems({ ...base, worldSrc: 3 })).toHaveLength(1);
    expect(environmentProblems({ ...base, worldSrc: "" })).toHaveLength(1);
  });

  it("the build and the API refuse unknown fields, the reader's guard lets them pass", () => {
    expect(environmentProblems({ ...base, tint: 1 })).toEqual(["environment.tint is not a field of the environment."]);
    expect(environmentProblems({ ...base, tint: 1 }, "book.environment", false)).toEqual([]);
    const config = (environment: unknown) => ({
      version: { version: "1.20.0", timestamp: "t", schema: "2.9" },
      book: { id: "b", title: "B", author: "A", environment },
      initialSpreadId: "s",
      spreads: [{ id: "s", title: "S", firstPage: 1, lastPage: 2 }],
      entries: [],
      entities: {},
      tutorial: [],
    });
    expect(() => assertGameConfiguration(config({ ...base, tint: 1, worldSrc: "/assets/content/w.glb" }))).not.toThrow();
    expect(() => assertGameConfiguration(config({ ...base, worldSrc: "w.glb" }))).toThrow(/book\.environment\.worldSrc/);
  });

  it("reads a reference's extension without query or fragment", () => {
    expect(referenceExtension("/a/b.JPG?v=2#x")).toBe(".jpg");
    expect(referenceExtension("/a.b/c")).toBe("");
  });
});
