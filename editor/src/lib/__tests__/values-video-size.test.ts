import { describe, expect, it } from "vitest";
import { contentTree, hasUniformScale, newNode, videoNodeScale } from "../values";
import { formatDuration } from "../library-place";

const video = { id: "v", assetType: "video" as const, src: "https://cdn.example/clip.mp4" };

// #91: the API records a video's size and duration on upload; + node sizes a video plane to its file
describe("a new video node sized to its file", () => {
  it("scales a portrait video so its plane stays within one target width", () => {
    expect(videoNodeScale({ width: 1080, height: 1920 })).toBe(0.5625);
    const node = newNode("video", video, { width: 1080, height: 1920 });
    expect(node.params).toEqual({ scale: 0.5625 });
    expect(hasUniformScale(node)).toBe(true);
  });

  it("leaves a landscape or square video at the default size: the engine's plane already follows the file's proportions", () => {
    expect(videoNodeScale({ width: 1920, height: 1080 })).toBeUndefined();
    expect(videoNodeScale({ width: 500, height: 500 })).toBeUndefined();
    expect(newNode("video", video, { width: 1920, height: 1080 })).toEqual({ type: "video", assets: [video] });
  });

  it("keeps the default size when the file's size is not known (an imported file, an unreadable header)", () => {
    expect(videoNodeScale(null)).toBeUndefined();
    expect(videoNodeScale({ width: null, height: null })).toBeUndefined();
    expect(videoNodeScale({ width: 0, height: 720 })).toBeUndefined();
    expect(newNode("video", video)).toEqual({ type: "video", assets: [video] });
  });

  it("sizes only videos with a file", () => {
    const image = { id: "i", assetType: "image" as const, src: "https://cdn.example/still.png" };
    expect(newNode("image", image, { width: 100, height: 400 }).params).toBeUndefined();
    expect(newNode("video", undefined, { width: 100, height: 400 }).params).toBeUndefined();
  });

  it("is stored as the content writes an even scale: one number", () => {
    expect(contentTree(newNode("video", video, { width: 720, height: 1280 })).params).toEqual({ scale: 0.5625 });
  });
});

describe("a video's duration in the library", () => {
  it("shows whole seconds as m:ss, hours when there are any", () => {
    expect(formatDuration(4200)).toBe("0:04");
    expect(formatDuration(4600)).toBe("0:05");
    expect(formatDuration(750_000)).toBe("12:30");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(0)).toBe("0:00");
  });
});
