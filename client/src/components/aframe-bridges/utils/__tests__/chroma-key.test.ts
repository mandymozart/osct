import { describe, expect, it } from "vitest";
import { chromaKeyMaterial, keyMode, parseChromaKey } from "../chroma-key";
import { buildEntity } from "../../ar/entities";
import { FilterData, filterProblems, Target } from "@/types";

const chromaKey = (params: Record<string, string | number> = {}): FilterData[] => [{ type: "chromaKey", ...params }];

const target = (filters?: FilterData[]): Target => ({
  id: "clip",
  entryId: "clip",
  spreadId: "s",
  index: 0,
  imageSrc: "/clip.jpg",
  entity: { type: "video", assets: [{ id: "clip-video", assetType: "video", src: "/clip.mp4" }], filters },
});

describe("chroma key filter", () => {
  it("is off without a chromaKey filter", () => {
    expect(parseChromaKey(undefined)).toBeUndefined();
    expect(parseChromaKey([])).toBeUndefined();
  });

  it("fills in the defaults of the filter definition and clamps to the ranges", () => {
    expect(parseChromaKey(chromaKey({ color: "#00FF00" }))).toEqual({
      color: "#00FF00", mode: "chroma", threshold: 0.3, softness: 0.08, spill: 0.1, opacity: 1,
    });
    expect(parseChromaKey(chromaKey({ color: "#a0f", threshold: 2, softness: 0, spill: -1, opacity: 0.5 }))).toEqual({
      color: "#a0f", mode: "chroma", threshold: 1, softness: 0.001, spill: 0.001, opacity: 0.5,
    });
  });

  it("keys neutral colors (black, grey, white) by brightness, colored ones by chroma – unless mode is set", () => {
    expect(["#000000", "#000", "#ffffff", "#808080", "#0a0a0c"].map(keyMode)).toEqual(Array(5).fill("luma"));
    expect(["#00ff00", "#a0f", "#ff00ff", "#202040"].map(keyMode)).toEqual(Array(4).fill("chroma"));
    expect(parseChromaKey(chromaKey({ color: "#000000" }))).toMatchObject({ mode: "luma", threshold: 0.06, softness: 0.1 });
    expect(parseChromaKey(chromaKey({ color: "#000000", mode: "chroma" }))).toMatchObject({ mode: "chroma", threshold: 0.3 });
    expect(chromaKeyMaterial("v", parseChromaKey(chromaKey({ color: "#000" }))!)).toContain("luma: 1");
    expect(chromaKeyMaterial("v", parseChromaKey(chromaKey({ color: "#0f0" }))!)).toContain("luma: 0");
  });

  it("is checked against its definition (content build + config guard)", () => {
    expect(filterProblems(chromaKey({ color: "#000000", mode: "auto", threshold: 0.1, softness: 0.2, spill: 0.1, opacity: 1 }), "f")).toEqual([]);
    expect(filterProblems([{ type: "blur" }], "f")).toEqual(['f[0].type: "blur" is not one of chromaKey']);
    expect(filterProblems(chromaKey({ color: "green", mode: "rgb", threshold: 3, softnes: 0.1 }), "f")).toEqual([
      'f[0].color: expected a color "#rrggbb", got "green"',
      "f[0].mode: expected one of auto, chroma, luma, got \"rgb\"",
      "f[0].threshold: expected a number from 0 to 1, got 3",
      "f[0].softnes: unknown parameter of chromaKey (color, mode, threshold, softness, spill, opacity)",
    ]);
    expect(filterProblems({ type: "chromaKey" }, "f")).toEqual(["f: expected a list of filters"]);
  });

  it("builds a keyed video as a plane with the chroma-key material, a plain video otherwise", () => {
    const noAssets = () => undefined;
    const keyed = buildEntity(target(chromaKey({ color: "#ff00ff" })), noAssets)!.element;
    expect(keyed.tagName.toLowerCase()).toBe("a-entity");
    expect(keyed.getAttribute("material")).toBe(chromaKeyMaterial("clip-video", parseChromaKey(chromaKey({ color: "#ff00ff" }))!));
    expect(keyed.getAttribute("material")).toContain("shader: chroma-key; src: #clip-video; color: #ff00ff");

    const plain = buildEntity(target(), noAssets)!.element;
    expect(plain.tagName.toLowerCase()).toBe("a-video");
    expect(plain.getAttribute("src")).toBe("#clip-video");
  });

  it("sizes the video plane to the video's proportions once its metadata is known", () => {
    const video = (width: number, height: number, readyState: number) => {
      const v = document.createElement("video");
      Object.defineProperties(v, {
        videoWidth: { get: () => width },
        videoHeight: { get: () => height },
        readyState: { get: () => readyState },
      });
      return v;
    };

    const loaded = video(1358, 930, 1);
    expect(buildEntity(target(), () => loaded)!.element.getAttribute("height")).toBe("0.6848");

    const later = video(1000, 1000, 0);
    const keyed = buildEntity(target(chromaKey({ color: "#000" })), () => later)!.element;
    expect(keyed.getAttribute("geometry")).toContain("height: 0.552");
    later.dispatchEvent(new Event("loadedmetadata"));
    expect(keyed.getAttribute("geometry")).toBe("primitive: plane; width: 1; height: 1");
  });
});
