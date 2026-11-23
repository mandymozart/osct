import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isLandingFile, LANDING_FORMAT, type LandingFile } from "@shared/api/landing";
import { CONTENT_SCHEMA_VERSION, type EntityData, OLDEST_READABLE_SCHEMA_MAJOR } from "@shared/types/game-config";
import { getExperience, getPlugins, getScenes } from "@/utils/game-config";
import { landingDataFromFile, type LandingData, loadLandingData, readableSchema } from "../data";
import { deriveLandingData } from "../derive";
import { LANDING_CONFIG } from "../landing-config";
import { scanStageData } from "../scan-stage-data";

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
    asset: { id: "m", assetType: "glb", src: "/assets/content/entities/face/face.glb" },
    spread: "/assets/content/layout/p10-11.webp", earlier: ["/assets/content/layout/p8-9.webp"],
    pageImages: ["/assets/content/targets/p2.webp"],
    plugins: [{ id: "glow", src: "/assets/content/plugins/glow/plugin.js", api: "4.0" }],
  },
};

describe("landing.json (#355)", () => {
  it("is told apart by its guard: every field the landing reads, of the right type", () => {
    expect(isLandingFile(FILE)).toBe(true);
    expect(isLandingFile({ ...FILE, hero: null })).toBe(true);
    expect(isLandingFile({ ...FILE, format: 2 })).toBe(false);
    expect(isLandingFile({ ...FILE, schema: "six" })).toBe(false);
    expect(isLandingFile({ ...FILE, images: [1] })).toBe(false);
    expect(isLandingFile({ ...FILE, hero: { ...FILE.hero, target: { src: 1 } } })).toBe(false);
    expect(isLandingFile({ ...FILE, shop: [{ id: "mug", url: "x" }] })).toBe(false);
    expect(isLandingFile({ ...FILE, shop: [{ id: "book", url: "https://shop", cover: true }] })).toBe(true);
    expect(isLandingFile(null)).toBe(false);
  });

  it("resolves its content paths below the version's folder; other URLs stay", () => {
    const data = landingDataFromFile(FILE, path => `https://cdn/osct/abc${path}`);
    expect(data.images).toEqual(["https://cdn/osct/abc/assets/content/targets/p10.webp", "https://elsewhere/x.webp"]);
    expect(data.cover).toBe("https://cdn/osct/abc/assets/content/layout/cover.webp");
    expect(data.hero!.asset.src).toBe("https://cdn/osct/abc/assets/content/entities/face/face.glb");
    expect(data.hero!.entity.assets[0].src).toBe("https://cdn/osct/abc/assets/content/entities/face/face.glb");
    expect(data.hero!.plugins[0].src).toBe("https://cdn/osct/abc/assets/content/plugins/glow/plugin.js");
    expect(data.hero!.spread).toBe("https://cdn/osct/abc/assets/content/layout/p10-11.webp");
    expect(data.shop).toEqual(LANDING_CONFIG.shop);
    const own = landingDataFromFile({ ...FILE, shop: [{ id: "book", url: "https://shop/book", cover: true }] }, path => path);
    expect(own.shop).toEqual([{ id: "book", url: "https://shop/book", cover: true, image: LANDING_CONFIG.shop[0].image }]);
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
    expect(data.hero!.asset.src).toBe(`${BASE}/abcdef012345/assets/content/entities/face/face.glb`);
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

  it("derives the data for a file it cannot read, and for bundled content (no base URL)", async () => {
    const fetch = vi.fn((url: string) => (url.startsWith(`${BASE}/latest.json`) ? json(latest) : json({ ...FILE, schema: "99.0" })));
    const derive = vi.fn(async () => DERIVED);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadLandingData({ baseUrl: BASE, derive, fetch: fetch as unknown as typeof globalThis.fetch })).toBe(DERIVED);
    expect(await loadLandingData({ baseUrl: "", derive, fetch: fetch as unknown as typeof globalThis.fetch })).toBe(DERIVED);
    expect(derive).toHaveBeenCalledTimes(2);
  });
});

describe("deriveLandingData (the fallback)", () => {
  it("picks the hero from the game configuration as the landing always did", async () => {
    const bundled = () => Promise.resolve(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../game.config.json"), "utf8")));
    const data = await deriveLandingData({ baseUrl: "", bundled });
    const experience = getExperience();
    expect(data).toMatchObject({ experience: experience.id, title: experience.title, author: experience.book?.author ?? "", shop: LANDING_CONFIG.shop });
    expect(data.images).toEqual(getScenes().flatMap(scene => scene.targets.map(target => target.imageSrc)));
    const stage = scanStageData(getScenes(), LANDING_CONFIG.scanEntries);
    expect(stage).not.toBeNull();
    expect(data.hero).toMatchObject({ ...stage, spread: null, earlier: [], plugins: getPlugins() });
    expect(data.hero!.pageImages.every(src => !stage!.prints.some(p => p.src === src))).toBe(true);
    expect(isLandingFile({ format: LANDING_FORMAT, schema: CONTENT_SCHEMA_VERSION, ...data, cover: data.cover })).toBe(true);
  });
});
