import { describe, expect, it } from "vitest";
import { extractExperienceLanding, landingSourceOf } from "@shared/api/landing-extract";
import { isReservedSceneId, RESERVED_SCENE_IDS } from "@shared/api/names";
import { draftLandingData, landingDataOf } from "../landing-draft";
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

describe("the landing workspace's own texts and shop (#365)", () => {
  const draft = { configuration: draftConfiguration(), files: {}, assetsBase: CDN };

  it("shows the workspace's landing over the draft's: its texts, its shop – a content path where the draft keeps the file", () => {
    const data = landingDataOf(draft, {
      texts: { de: { intro: "Hallo" } },
      shop: [{ label: "A print", url: "https://shop/print", image: "/assets/content/landing/print.jpg" }, { label: "The book", url: "https://shop/book", cover: true }],
    });
    expect(data.texts).toEqual({ de: { intro: "Hallo" } });
    expect(data.shop).toEqual([
      { label: "A print", url: "https://shop/print", image: `${CDN}/assets/content/landing/print.jpg` },
      { label: "The book", url: "https://shop/book", image: "/assets/ui/landing/book.svg", cover: true },
    ]);
    // No pick: the default hero, as publish leaves it to the reader
    expect(data.hero?.entity).toMatchObject({ type: "model" });
  });

  it("[] is no shop; none is the app's items", () => {
    expect(landingDataOf(draft, { shop: [] }).shop).toEqual([]);
    expect(landingDataOf(draft, null).shop.map(item => item.id)).toEqual(["book", "shirt"]);
  });

  it("extracts the hero of a new pick at once, before its save – the texts stay", () => {
    const data = landingDataOf(draft, { scene: "s1", target: "film", texts: { en: { shop: "Buy" } } });
    expect(data.hero?.entity).toMatchObject({ type: "video" });
    expect(data.texts).toEqual({ en: { shop: "Buy" } });
  });
});

describe("the reserved scene id (#356)", () => {
  it("`landing` is the landing workspace's address – no scene may take it, in any case", () => {
    expect(RESERVED_SCENE_IDS).toEqual(["landing"]);
    for (const id of ["landing", "Landing", "LANDING"]) expect(isReservedSceneId(id)).toBe(true);
    for (const id of ["landings", "scene-1", "p10-11"]) expect(isReservedSceneId(id)).toBe(false);
  });
});
