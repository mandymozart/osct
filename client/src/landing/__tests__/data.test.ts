import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isLandingFile, LANDING_FORMAT, type LandingFile } from "@shared/api/landing";
import { CONTENT_SCHEMA_VERSION, type EntityData, OLDEST_READABLE_SCHEMA_MAJOR } from "@shared/types/game-config";
import { getExperience, getPlugins, getScenes } from "@/utils/game-config";
import { extractLandingHero, landingSourceOf } from "@shared/api/landing-extract";
import { landingDataFromFile, type LandingData } from "@ui/landing/data";
import { LANDING_CONFIG } from "@ui/landing/landing-config";
import { scanStagePick } from "@ui/landing/scan-stage-data";
import { loadLandingData, readableSchema } from "../data";
import { deriveLandingData } from "../derive";

const print = { src: "/assets/content/targets/p10.webp", x: 0.1, top: 0.2, width: 0.3 };

/** A landing.json as publish will write it (#355, step 2) */
const FILE: LandingFile = {
  format: LANDING_FORMAT,
  schema: CONTENT_SCHEMA_VERSION,
  experience: "osct",
  title: "Onion Skin & Crocodile Tears",
  author: "Kévin Bray",
  publisher: "Building Fictions",
  images: ["/assets/content/targets/p10.webp", "https://elsewhere/x.webp"],
  cover: "/assets/content/layout/cover.webp",
  hero: {
    aspect: 0.696, pages: [10, 11], prints: [print], target: print,
    entity: { type: "model", assets: [{ id: "m", assetType: "glb", src: "/assets/content/entities/face/face.glb" }] } as unknown as EntityData,
    spread: "/assets/content/layout/p10-11.webp", earlier: ["/assets/content/layout/p8-9.webp"],
    pageImages: ["/assets/content/targets/p2.webp"],
    plugins: [{ id: "glow", src: "/assets/content/plugins/glow/plugin.js", api: "4.0" }],
  },
};

describe("landing.json (#355)", () => {
  it("is told apart by its guard: every field the landing reads, of the right type", () => {
    expect(isLandingFile(FILE)).toBe(true);
    expect(isLandingFile({ ...FILE, hero: null })).toBe(true);
    expect(isLandingFile({ ...FILE, format: 1 })).toBe(false);
    expect(isLandingFile({ ...FILE, schema: "six" })).toBe(false);
    expect(isLandingFile({ ...FILE, images: [1] })).toBe(false);
    expect(isLandingFile({ ...FILE, hero: { ...FILE.hero, target: { src: 1 } } })).toBe(false);
    expect(isLandingFile(null)).toBe(false);
  });

  it("carries the experience's own texts and shop (#365) – a reader of format 2 ignores the fields; a file without a hero is no pick", () => {
    expect(isLandingFile({ ...FILE, texts: { de: { intro: "Hallo" } }, shopItems: [{ label: "Mug", url: "https://shop/mug" }] })).toBe(true);
    expect(isLandingFile({ ...FILE, shopItems: [] })).toBe(true);
    const { hero: _hero, ...withoutHero } = FILE;
    expect(isLandingFile({ ...withoutHero, texts: { en: { shop: "Buy" } } })).toBe(true);
    expect(isLandingFile({ ...FILE, shopItems: [{ label: "Mug", url: "ftp://shop" }] })).toBe(false);
    expect(isLandingFile({ ...FILE, shopItems: [{ id: "book", url: "https://shop" }] })).toBe(false);
    expect(isLandingFile({ ...FILE, texts: { de: { qrAlt: "QR" } } })).toBe(false);
  });

  it("resolves its content paths below the version's folder; other URLs stay", () => {
    const data = landingDataFromFile(FILE, path => `https://cdn/osct/abc${path}`);
    expect(data.images).toEqual(["https://cdn/osct/abc/assets/content/targets/p10.webp", "https://elsewhere/x.webp"]);
    expect(data.cover).toBe("https://cdn/osct/abc/assets/content/layout/cover.webp");
    expect(data.hero!.entity.assets[0].src).toBe("https://cdn/osct/abc/assets/content/entities/face/face.glb");
    expect(data.hero!.plugins[0].src).toBe("https://cdn/osct/abc/assets/content/plugins/glow/plugin.js");
    expect(data.hero!.spread).toBe("https://cdn/osct/abc/assets/content/layout/p10-11.webp");
    expect(data.shop).toEqual(LANDING_CONFIG.shop);
    expect(data.texts).toBeUndefined();
  });

  it("takes the experience's shop and texts (#365): its items in place of the app's, [] = no shop, a cover item with the placeholder until the cover fills in", () => {
    const shopItems = [
      { label: "The book", url: "https://shop/book", cover: true as const },
      { label: "A print", url: "https://shop/print", image: "/assets/content/landing/print.jpg" },
      { label: "A mug", url: "https://shop/mug" },
    ];
    const own = landingDataFromFile({ ...FILE, shopItems, texts: { de: { intro: "Hallo" } } }, path => `https://cdn/v${path}`);
    expect(own.shop).toEqual([
      { label: "The book", url: "https://shop/book", cover: true, image: LANDING_CONFIG.shop[0].image },
      { label: "A print", url: "https://shop/print", image: "https://cdn/v/assets/content/landing/print.jpg" },
      { label: "A mug", url: "https://shop/mug", image: "" },
    ]);
    expect(own.texts).toEqual({ de: { intro: "Hallo" } });
    expect(landingDataFromFile({ ...FILE, shopItems: [] }, path => path).shop).toEqual([]);
  });

  it("is read when this app reads its content schema's MAJOR", () => {
    expect(readableSchema(CONTENT_SCHEMA_VERSION, CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR)).toBe(true);
    expect(readableSchema("6.9", "6.0", 6)).toBe(true);
    expect(readableSchema("7.0", "6.0", 6)).toBe(false);
    expect(readableSchema("5.3", "6.0", 6)).toBe(false);
  });
});

describe("loadLandingData", () => {
  const BASE = "https://cdn/osct/staging/osct";
  const DERIVED = { title: "derived" } as LandingData;
  const latest = { build: "abcdef012345", hash: "abcdef012345ff", schema: CONTENT_SCHEMA_VERSION, version: "6.8.0", activatedAt: "2026-11-23T00:00:00Z" };
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("takes the current version's landing.json when it is there", async () => {
    const fetch = vi.fn((url: string) => (url.startsWith(`${BASE}/latest.json`) ? json(latest) : url === `${BASE}/abcdef012345/landing.json` ? json(FILE) : json({}, 404)));
    const derive = vi.fn(async () => DERIVED);
    const data = await loadLandingData({ baseUrl: BASE, derive, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(derive).not.toHaveBeenCalled();
    expect(data.hero!.entity.assets[0].src).toBe(`${BASE}/abcdef012345/assets/content/entities/face/face.glb`);
  });

  it("derives the data when the version has none (every version before publish writes it), reusing the latest.json it read", async () => {
    const fetch = vi.fn((url: string) => (url.startsWith(`${BASE}/latest.json`) ? json(latest) : json({}, 404)));
    let reuse: typeof globalThis.fetch | null = null;
    const derive = vi.fn(async (given: typeof globalThis.fetch) => ((reuse = given), DERIVED));
    expect(await loadLandingData({ baseUrl: BASE, derive, fetch: fetch as unknown as typeof globalThis.fetch })).toBe(DERIVED);
    const asked = fetch.mock.calls.length;
    expect(await (await reuse!(`${BASE}/latest.json?t=1`)).json()).toEqual(latest);
    expect(fetch.mock.calls.length).toBe(asked);
  });

  it("takes the bundled content's landing.json without a base URL – no fetch, no derive chunk (#355)", async () => {
    const fetch = vi.fn(() => json({}, 404));
    const derive = vi.fn(async () => DERIVED);
    const data = await loadLandingData({ baseUrl: "", bundled: async () => FILE, derive, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(derive).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(data.hero!.entity.assets[0].src).toBe("/assets/content/entities/face/face.glb");
    expect(data.title).toBe(FILE.title);
  });

  it("takes the landing.json the content build wrote beside the bundled configuration (the fixture's pick)", async () => {
    const file = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../game.landing.json"), "utf8"));
    const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../game.config.json"), "utf8"));
    expect(isLandingFile(file)).toBe(true);
    expect(file).toMatchObject({ experience: raw.experience.id, schema: raw.version.schema, hero: raw.experience.landing.hero });
    const derive = vi.fn(async () => DERIVED);
    const data = await loadLandingData({ baseUrl: "", bundled: async () => file, derive });
    expect(derive).not.toHaveBeenCalled();
    expect(data.hero!.pages).toEqual([28, 29]);
    // The fixture's own texts and shop (#365): a German intro, one item with a picture of the content
    expect(data.texts).toEqual(raw.experience.landing.texts);
    expect(data.texts?.de?.intro).toContain("{title}");
    expect(data.shop).toEqual([{ label: "The tree print", url: "https://buildingfictions.com/shop/tree", image: raw.experience.landing.shop[0].image }]);
  });

  it("derives the hero for a file without one (texts or a shop without a pick, #365) and keeps the file's texts and shop", async () => {
    const { hero: _hero, ...withoutHero } = FILE;
    const file = { ...withoutHero, texts: { de: { intro: "Hallo" } }, shopItems: [] };
    const fetch = vi.fn((url: string) => (url.startsWith(`${BASE}/latest.json`) ? json(latest) : url === `${BASE}/abcdef012345/landing.json` ? json(file) : json({}, 404)));
    const derive = vi.fn(async () => ({ ...DERIVED, shop: LANDING_CONFIG.shop }));
    const data = await loadLandingData({ baseUrl: BASE, derive, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(data).toMatchObject({ title: "derived", shop: [], texts: { de: { intro: "Hallo" } } });
    const bundled = await loadLandingData({ baseUrl: "", bundled: async () => file, derive });
    expect(bundled).toMatchObject({ title: "derived", shop: [], texts: { de: { intro: "Hallo" } } });
  });

  it("derives the data for a file it cannot read, and for bundled content (no base URL)", async () => {
    const fetch = vi.fn((url: string) => (url.startsWith(`${BASE}/latest.json`) ? json(latest) : json({ ...FILE, schema: "99.0" })));
    const derive = vi.fn(async () => DERIVED);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadLandingData({ baseUrl: BASE, derive, fetch: fetch as unknown as typeof globalThis.fetch })).toBe(DERIVED);
    expect(await loadLandingData({ baseUrl: "", derive, fetch: fetch as unknown as typeof globalThis.fetch })).toBe(DERIVED);
    expect(await loadLandingData({ baseUrl: "", bundled: async () => null, derive, fetch: fetch as unknown as typeof globalThis.fetch })).toBe(DERIVED);
    expect(derive).toHaveBeenCalledTimes(3);
  });
});

describe("deriveLandingData (the fallback)", () => {
  const config = () => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../game.config.json"), "utf8"));

  it("extracts the hero from the game configuration as publish does: the experience's pick (the fixture's studio-a › studio-dragon)", async () => {
    const raw = config();
    const data = await deriveLandingData({ baseUrl: "", bundled: () => Promise.resolve(raw) });
    const experience = getExperience();
    expect(data).toMatchObject({ experience: experience.id, title: experience.title, author: experience.book?.author ?? "" });
    // The landing's own texts and shop from the configuration (#365)
    expect(data.shop.map(item => item.label)).toEqual(["The tree print"]);
    expect(data.texts).toEqual(raw.experience.landing.texts);
    expect(data.images).toEqual(getScenes().flatMap(scene => scene.targets.map(target => target.imageSrc)));
    expect(experience.landing).toMatchObject({ scene: "studio-a", target: "studio-dragon" });
    // The same hero the content build stored with the pick (paths and all – the bundled content's are the app's own)
    expect(data.hero).toEqual(raw.experience.landing.hero);
    expect(data.hero).toEqual(extractLandingHero(landingSourceOf(raw), raw.experience.landing));
    expect(data.hero!.pages).toEqual([28, 29]);
    expect(data.hero!.plugins).toEqual(getPlugins().map(({ id, src, api }) => ({ id, src, api })));
    expect(data.hero!.pageImages.every(src => !data.hero!.prints.some(p => p.src === src))).toBe(true);
    expect(isLandingFile({ format: LANDING_FORMAT, schema: CONTENT_SCHEMA_VERSION, ...data, cover: data.cover })).toBe(true);
  });

  it("without a pick: the first of LANDING_CONFIG.scanEntries that has a model, else the content's first model", async () => {
    const raw = config();
    delete raw.experience.landing;
    const data = await deriveLandingData({ baseUrl: "", bundled: () => Promise.resolve(raw) });
    expect(data.shop).toEqual(LANDING_CONFIG.shop);
    const pick = scanStagePick({ scenes: getScenes() }, LANDING_CONFIG.scanEntries);
    expect(pick).not.toBeNull();
    expect(pick!.scene).not.toBe("studio-a");
    expect(data.hero).toMatchObject({ spread: null, earlier: [] });
    expect(data.hero).toEqual(extractLandingHero(landingSourceOf(raw), pick!));
  });
});

describe("deriveLandingData without a pick but with texts and a shop (#365)", () => {
  it("takes the default hero and the landing's texts and shop", async () => {
    const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../game.config.json"), "utf8"));
    raw.experience.landing = { texts: { fr: { getApp: "L'app" } }, shop: [] };
    const data = await deriveLandingData({ baseUrl: "", bundled: () => Promise.resolve(raw) });
    expect(data.hero).toEqual(extractLandingHero(landingSourceOf(raw), scanStagePick({ scenes: getScenes() }, LANDING_CONFIG.scanEntries)!));
    expect(data.shop).toEqual([]);
    expect(data.texts).toEqual({ fr: { getApp: "L'app" } });
  });
});
