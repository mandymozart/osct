import { describe, expect, it } from "vitest";
import { extractExperienceLanding, landingSourceOf } from "@shared/api/landing-extract";
import { isReservedSceneId, RESERVED_SCENE_IDS } from "@shared/api/names";
import { draftLandingData } from "../landing-draft";
import { landingPickScenes } from "../landing-pick";
import { CDN, draftConfiguration } from "./landing-workspace-fixture";

const noFetch: typeof fetch = () => Promise.reject(new Error("no layout here"));

describe("the landing workspace's pick (#356)", () => {
  it("offers only scenes with a target that has AR content, and only those targets – no marginalia, no switched-off target, no empty group", () => {
    expect(landingPickScenes(draftConfiguration())).toEqual([{ id: "s1", label: "10–11", targets: ["dragon", "film"] }]);
  });
});

describe("the landing workspace's stage data (#356)", () => {
  it("is what publish would write from the draft: the default hero (the first model) with the draft's URLs, the book's texts, the shop", async () => {
    const data = await draftLandingData({ configuration: draftConfiguration(), files: {}, assetsBase: CDN, fetch: noFetch });
    expect(data).toMatchObject({ experience: "demo", title: "Demo Book", author: "A. Author", publisher: "P. Press", cover: null });
    expect(data.hero?.entity).toMatchObject({ type: "model", assets: [{ src: `${CDN}/assets/content/models/dragon.glb` }] });
    expect(data.images).toContain(`${CDN}/assets/content/targets/dragon.webp`);
    expect(data.shop.map(item => item.id)).toEqual(["book", "shirt"]);
  });

  it("shows the stored hero of the pick (as publish writes it), its content paths where the draft keeps the files", async () => {
    // The stored hero names content paths (RULES #36): extracted from the configuration in content paths
    const stored = extractExperienceLanding(landingSourceOf(draftConfiguration({ paths: true })), { scene: "s1", target: "film" })!;
    const files = { [`${CDN}/b0/assets/content/videos/film.mp4`]: {} };
    const data = await draftLandingData({ configuration: draftConfiguration({ landing: stored }), files, assetsBase: CDN, fetch: noFetch });
    expect(data.hero?.entity).toMatchObject({ type: "video", assets: [{ src: `${CDN}/b0/assets/content/videos/film.mp4` }] });
    expect(data.hero?.target.src).toBe(`${CDN}/assets/content/targets/film.webp`);
  });
});

describe("the reserved scene id (#356)", () => {
  it("`landing` is the landing workspace's address – no scene may take it, in any case", () => {
    expect(RESERVED_SCENE_IDS).toEqual(["landing"]);
    for (const id of ["landing", "Landing", "LANDING"]) expect(isReservedSceneId(id)).toBe(true);
    for (const id of ["landings", "scene-1", "p10-11"]) expect(isReservedSceneId(id)).toBe(false);
  });
});
