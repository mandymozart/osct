import { describe, expect, it } from "vitest";
import { fitsSlot, sameEnvironment, withSlot } from "../environment.svelte";

const BASE = { world: "cafe", onionSky: true } as const;

// The Environment tab: which library files the sky takes (the world is gone, #310), and the edits it compares with the draft
describe("environment edit", () => {
  it("the sky takes a jpg, png or webp image – no model", () => {
    expect(fitsSlot({ kind: "glb", url: "https://cdn.example/a/v1.glb" }, "sky")).toBe(false);
    expect(fitsSlot({ kind: "image", url: "https://cdn.example/a/v1.webp?x" }, "sky")).toBe(true);
    expect(fitsSlot({ kind: "video", url: "https://cdn.example/a/v1.mp4" }, "sky")).toBe(false);
    expect(fitsSlot({ kind: "image", url: "https://cdn.example/a/v1" }, "sky")).toBe(false);
  });

  it("sets and removes a slot's file", () => {
    const withSky = withSlot(BASE, "sky", "https://cdn.example/sky.jpg");
    expect(withSky).toEqual({ ...BASE, skySrc: "https://cdn.example/sky.jpg" });
    expect(withSlot({ ...BASE, worldSrc: "https://cdn.example/w.glb" }, "sky", null)).toEqual({ ...BASE, worldSrc: "https://cdn.example/w.glb" });
    expect(withSlot(withSky, "sky", null)).toEqual(BASE);
    expect("skySrc" in withSlot(withSky, "sky", null)).toBe(false);
  });

  it("compares environments by what they say", () => {
    expect(sameEnvironment(BASE, { ...BASE })).toBe(true);
    expect(sameEnvironment(BASE, { ...BASE, onionSky: false })).toBe(false);
    expect(sameEnvironment(BASE, { ...BASE, skySrc: "https://cdn.example/sky.jpg" })).toBe(false);
    expect(sameEnvironment({ ...BASE, worldSrc: undefined }, BASE)).toBe(true);
  });
});
