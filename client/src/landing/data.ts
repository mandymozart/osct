import { isLandingFile, LANDING_FILE, type LandingFile, type LandingHeroData } from "@shared/api/landing";
import { isContentManifest } from "@shared/types/content-manifest";
import { LANDING_CONFIG, type ShopItem } from "./landing-config";

/**
 * What the landing shows of an experience (#355) – everything the page and its hero need, URLs ready to load: one plain
 * block, so the very same page can be mounted with an experience's draft elsewhere (the editor's landing workspace,
 * later). From the content version's `landing.json` (shared/api/landing.ts, written by publish and by the content build)
 * or, until a version has one, derived from its game configuration (`derive.ts`).
 */
export interface LandingData {
  /** The experience's id */
  experience: string;
  title: string;
  /** The printed book's author and publisher, "" without */
  author: string;
  publisher: string;
  /** The experience's target images in scene order (the hero's drifting pictures) */
  images: string[];
  /** The book's front cover from the print layout (the shop's book), null without */
  cover: string | null;
  /** The hero's scan stage – null: nothing to show (no model), the stage stays its quiet glow */
  hero: LandingHeroData | null;
  shop: ShopItem[];
}

/** Content paths (`/assets/content/…`) anywhere in a JSON value, turned into URLs */
const resolvePaths = <T>(value: T, url: (path: string) => string): T => {
  if (typeof value === "string") return (value.startsWith("/assets/content/") ? url(value) : value) as T;
  if (Array.isArray(value)) return value.map(item => resolvePaths(item, url)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePaths(item, url)])) as T;
  }
  return value;
};

/** The shop: the file's items, a picture-less one with the app's placeholder drawing; none – the app's items */
const shopOf = (file: Pick<LandingFile, "shop">): ShopItem[] =>
  file.shop?.map(item => ({
    ...item,
    image: item.image ?? LANDING_CONFIG.shop.find(own => own.id === item.id)?.image ?? "",
  })) ?? LANDING_CONFIG.shop;

/** A `landing.json` as the landing's data: its content paths resolved below the version's folder (`url`) */
export const landingDataFromFile = (file: LandingFile, url: (path: string) => string): LandingData => {
  const { experience, title, author, publisher } = file;
  return {
    experience, title, author, publisher,
    images: resolvePaths(file.images, url),
    cover: resolvePaths(file.cover, url),
    hero: resolvePaths(file.hero, url),
    shop: resolvePaths(shopOf(file), url),
  };
};

/** Whether this app reads content of that schema (`MAJOR.MINOR`): a MAJOR between the oldest it reads and its own */
export const readableSchema = (schema: string, own: string, oldest: number): boolean => {
  const major = Number(/^(\d+)\.\d+$/.exec(schema)?.[1] ?? NaN);
  return major >= oldest && major <= Number(own.split(".")[0]);
};

/**
 * `readableSchema` against this app's content schema – the contract's module is loaded only here (the hero needs it
 * anyway), so the page's first code stays small
 */
const readableHere = async (schema: string): Promise<boolean> => {
  const { CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR } = await import("@shared/types/game-config");
  return readableSchema(schema, CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR);
};

export interface LoadLandingOptions {
  /** The experience's content base URL (`<environment base>/<experience>`); "" = the content bundled with the app */
  baseUrl: string;
  /**
   * The bundled content's `landing.json` (the content build writes it beside the bundled configuration – `null` without
   * one), read when there is no base URL; its content paths are the app's own
   */
  bundled?: () => Promise<unknown>;
  /**
   * The fallback without a readable `landing.json`: derives the data from the game configuration (`derive.ts`, loaded
   * only then); `fetch` answers the latest.json already read from memory
   */
  derive: (fetch: typeof globalThis.fetch) => Promise<LandingData>;
  fetch?: typeof globalThis.fetch;
}

/**
 * The landing's data: the current content version's `landing.json` (`<base>/latest.json` names the version) – or the
 * bundled content's (`bundled`) – when it is there and readable, else `derive`. A missing or broken file is no error –
 * every version published before publish wrote one has none.
 */
export const loadLandingData = async ({ baseUrl, bundled, derive, fetch: fetchFn = globalThis.fetch.bind(globalThis) }: LoadLandingOptions): Promise<LandingData> => {
  const base = baseUrl.replace(/\/+$/, "");
  let latest: unknown = null;
  if (!base && bundled) {
    const file = await bundled().catch(() => null);
    if (isLandingFile(file) && await readableHere(file.schema)) return landingDataFromFile(file, path => path);
  }
  if (base) {
    try {
      const response = await fetchFn(`${base}/latest.json?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-cache" });
      latest = response.ok ? await response.json() : null;
      if (isContentManifest(latest)) {
        const versionUrl = `${base}/${latest.build}`;
        const file = await fetchFn(`${versionUrl}/${LANDING_FILE}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
        if (isLandingFile(file) && await readableHere(file.schema)) return landingDataFromFile(file, path => `${versionUrl}${path}`);
        if (file !== null) console.warn(`[landing] ${versionUrl}/${LANDING_FILE} is not readable here – derived from the game configuration`);
      }
    } catch (error) {
      console.warn("[landing] landing.json not loaded:", error);
    }
  }
  // The game configuration's loader asks for latest.json again: answered with the one just read
  const known = isContentManifest(latest) ? JSON.stringify(latest) : null;
  const reuse: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return known && url.startsWith(`${base}/latest.json`)
      ? Promise.resolve(new Response(known, { status: 200, headers: { "Content-Type": "application/json" } }))
      : fetchFn(input, init);
  };
  return derive(reuse);
};
