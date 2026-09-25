import { describe, expect, it } from "vitest";
import { CHROMA_KEY_DEFAULTS, chromaKeyMaterial, parseChromaKey } from "../chroma-key";
import { buildEntity } from "../../ar/entities";
import { Target } from "@/types";

describe("chroma key", () => {
  it("is off without params.chromaKey", () => {
    expect(parseChromaKey(undefined)).toBeUndefined();
    expect(parseChromaKey({})).toBeUndefined();
  });

  it("uses defaults for missing values and clamps to 0..1", () => {
    expect(parseChromaKey({ chromaKey: { color: "#00FF00" } })).toEqual({ color: "#00FF00", ...CHROMA_KEY_DEFAULTS });
    expect(parseChromaKey({ chromaKey: { color: "#a0f", similarity: 2, smoothness: 0, spill: -1 } })).toEqual({
      color: "#a0f",
      similarity: 1,
      smoothness: 0.001,
      spill: 0.001,
    });
  });

  it("rejects a key color that is not #rgb / #rrggbb", () => {
    expect(parseChromaKey({ chromaKey: { color: "green" } })).toBeUndefined();
    expect(parseChromaKey({ chromaKey: "#00ff00" })).toBeUndefined();
  });

  it("builds a keyed video as a plane with the chroma-key material, a plain video otherwise", () => {
    const target = (params?: Record<string, unknown>): Target => ({
      id: "clip",
      entryId: "clip",
      spreadId: "s",
      index: 0,
      imageSrc: "/clip.jpg",
      entity: { type: "video", assets: [{ id: "clip-video", assetType: "video", src: "/clip.mp4" }], params },
    });
    const noAssets = () => undefined;

    const keyed = buildEntity(target({ chromaKey: { color: "#ff00ff" } }), noAssets)!.element;
    expect(keyed.tagName.toLowerCase()).toBe("a-entity");
    expect(keyed.getAttribute("material")).toBe(chromaKeyMaterial("clip-video", parseChromaKey({ chromaKey: { color: "#ff00ff" } })!));
    expect(keyed.getAttribute("material")).toContain("shader: chroma-key; src: #clip-video; color: #ff00ff");

    const plain = buildEntity(target(), noAssets)!.element;
    expect(plain.tagName.toLowerCase()).toBe("a-video");
    expect(plain.getAttribute("src")).toBe("#clip-video");
  });
});
