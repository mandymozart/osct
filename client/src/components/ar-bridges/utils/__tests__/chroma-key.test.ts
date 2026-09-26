import { describe, expect, it } from "vitest";
import { Color, Mesh, MeshBasicMaterial, ShaderMaterial, VideoTexture } from "three";
import { chromaKeyMaterial, keyMode, parseChromaKey } from "../chroma-key";
import { buildEntity, DEFAULT_VIDEO_HEIGHT } from "../../ar/entities";
import { LoadedAsset } from "../../ar/assets";
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
    expect(chromaKeyMaterial(null, parseChromaKey(chromaKey({ color: "#000" }))!).uniforms.luma.value).toBe(1);
    expect(chromaKeyMaterial(null, parseChromaKey(chromaKey({ color: "#0f0" }))!).uniforms.luma.value).toBe(0);
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

  const videoAsset = (video = document.createElement("video")): LoadedAsset =>
    ({ assetType: "video", element: video, texture: new VideoTexture(video) });

  it("builds a keyed video as a plane with the chroma-key material, a plain video otherwise", () => {
    const asset = videoAsset();
    const texture = asset.assetType === "video" ? asset.texture : null;
    const keyed = buildEntity(target(chromaKey({ color: "#ff00ff", threshold: 0.4 })), () => asset)!.object as Mesh;
    const material = keyed.material as ShaderMaterial;
    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material.transparent).toBe(true);
    expect(material.uniforms.src.value).toBe(texture);
    expect((material.uniforms.color.value as Color).equals(new Color("#ff00ff"))).toBe(true);
    expect(material.uniforms.threshold.value).toBe(0.4);
    expect(material.uniforms.keyOpacity.value).toBe(1);

    const plain = buildEntity(target(), () => asset)!.object as Mesh;
    expect(plain.material).toBeInstanceOf(MeshBasicMaterial);
    expect((plain.material as MeshBasicMaterial).map).toBe(texture);
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

    const loaded = videoAsset(video(1358, 930, 1));
    expect(buildEntity(target(), () => loaded)!.object.scale.y).toBe(0.6848);

    const later = video(1000, 1000, 0);
    const keyed = buildEntity(target(chromaKey({ color: "#000" })), () => videoAsset(later))!.object;
    expect(keyed.scale.y).toBe(DEFAULT_VIDEO_HEIGHT);
    later.dispatchEvent(new Event("loadedmetadata"));
    expect(keyed.scale.y).toBe(1);
  });
});
