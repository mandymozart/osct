import { describe, expect, it } from "vitest";
import { mediaLevelFor, mediaLevelProblems, mediaSrcFor, type MediaLevelData } from "@shared/types/media-levels";
import { chooseMediaSrc, wantedMediaLevel } from "../media-levels";

const levels = (...values: number[]): MediaLevelData[] => values.map(level => ({ level, src: `f-${level}` }));

/** An S22-like phone: 360 × 780 CSS px at 3 */
const phone = { screenWidth: 360, screenHeight: 780, pixelRatio: 3 };

describe("media levels: the shared rules (#331, content schema 4.3)", () => {
  it("chooses the largest level not above the wanted one, else the smallest (the nearest)", () => {
    expect(mediaLevelFor(levels(2048, 512, 1024), 1024)?.level).toBe(1024);
    expect(mediaLevelFor(levels(512, 2048), 1024)?.level).toBe(512);
    expect(mediaLevelFor(levels(1024, 2048), 512)?.level).toBe(1024);
    expect(mediaLevelFor(undefined, 1024)).toBeUndefined();
    expect(mediaSrcFor("own.webp", [], 1024)).toBe("own.webp");
    expect(mediaSrcFor("own.webp", levels(720), 1080)).toBe("f-720");
  });

  it("checks the levels by kind: values, each once, a file, only image / video / audio", () => {
    expect(mediaLevelProblems(levels(480, 1080), "video")).toEqual([]);
    expect(mediaLevelProblems(levels(64, 192), "audio")).toEqual([]);
    expect(mediaLevelProblems(levels(512, 512), "image")).toEqual(["[1].level: 512 is there twice"]);
    expect(mediaLevelProblems(levels(720), "image")[0]).toContain("720 is not one of 512, 1024, 2048");
    expect(mediaLevelProblems([{ level: 480, src: "" }], "video")).toEqual(["[0].src: expected a file"]);
    expect(mediaLevelProblems([], "video")).toEqual(["expected a list of at least one level"]);
    expect(mediaLevelProblems(levels(512), "glb")[0]).toContain("only an image, a video or a sound");
  });
});

describe("media levels: the reader's choice (#331)", () => {
  it("low / medium / high take the smallest, middle and largest level of each kind", () => {
    expect(["low", "medium", "high"].map(q => wantedMediaLevel("image", q as "low"))).toEqual([512, 1024, 2048]);
    expect(["low", "medium", "high"].map(q => wantedMediaLevel("video", q as "low", phone))).toEqual([480, 720, 1080]);
    expect(["low", "medium", "high"].map(q => wantedMediaLevel("audio", q as "low"))).toEqual([64, 128, 192]);
  });

  it("auto: the screen in device pixels – an image covers the longest side, a video the shorter one", () => {
    expect(wantedMediaLevel("image", "auto", phone)).toBe(2048); // 780 × 3 = 2340 → the largest
    expect(wantedMediaLevel("image", undefined, { screenWidth: 400, screenHeight: 300, pixelRatio: 1 })).toBe(512);
    expect(wantedMediaLevel("video", "auto", phone)).toBe(1080); // 360 × 3
    expect(wantedMediaLevel("video", "auto", { screenWidth: 375, screenHeight: 667, pixelRatio: 2 })).toBe(1080); // 750 → 1080
    expect(wantedMediaLevel("video", "auto", { screenWidth: 320, screenHeight: 568, pixelRatio: 1 })).toBe(480);
    expect(wantedMediaLevel("audio", "auto", phone)).toBe(192);
    expect(wantedMediaLevel("image", "auto")).toBe(1024); // nothing known: the middle
  });

  it("auto: a slow or data-saving connection takes the smallest, a small device's video at most the middle", () => {
    expect(wantedMediaLevel("video", "auto", { ...phone, connection: "3g" })).toBe(480);
    expect(wantedMediaLevel("image", "auto", { ...phone, saveData: true })).toBe(512);
    expect(wantedMediaLevel("audio", "auto", { connection: "slow-2g" })).toBe(64);
    expect(wantedMediaLevel("video", "auto", { ...phone, memory: 4 })).toBe(720);
    expect(wantedMediaLevel("video", "high", { ...phone, connection: "2g" })).toBe(1080); // the reader's own choice wins
  });

  it("the file: the chosen level, falling back to the nearest; a medium without levels is its own src", () => {
    expect(chooseMediaSrc("video", "v.mp4", levels(480, 720, 1080), "medium")).toBe("f-720");
    expect(chooseMediaSrc("video", "v.mp4", levels(720, 1080), "low")).toBe("f-720");
    expect(chooseMediaSrc("image", "p.webp", levels(512, 1024), "high")).toBe("f-1024");
    expect(chooseMediaSrc("audio", "s.mp3", undefined, "high")).toBe("s.mp3");
  });
});
