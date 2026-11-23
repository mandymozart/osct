/**
 * `landing.json` – what an experience's desktop landing shows (#355), in one small file next to the game configuration
 * of a content version: `<base>/<experience>/<build>/landing.json` (content-store.ts). Publish writes it from the
 * experience's pick (`experience.landing`: a target with a model on a surface of a scene, its hero extracted when it was
 * picked – `landing-extract.ts`), the content build next to its game configuration; until a version has one, the
 * reader's landing derives the same data from `game.config.json` (`client/src/landing/derive.ts`). docs/content.md
 * "landing.json".
 *
 * Paths are content paths (`/assets/content/…`) as in the game configuration; the reader resolves them against the
 * version's folder. The hero's model, its target and its plugins are the configuration's own shapes (`EntityData`,
 * `AssetData`, `PluginData`): a content schema MAJOR changes them too, so the file names the schema it was written with
 * and a reader that cannot read that MAJOR derives the data itself. Not content: `shared/api/` is outside the content
 * schema lock (RULES #10) – the file is the instance's, made from the content.
 */
import { isObject } from "../guards/primitives";
import type { LandingHeroData, LandingPrintData } from "../types/landing";

// The hero's shape is the content's (`experience.landing.hero`, schema 6.1): defined with the contract
export type { LandingHeroData, LandingPrintData } from "../types/landing";

/** Its name in a version's folder */
export const LANDING_FILE = "landing.json";
/**
 * The shape's own version: a change a reader cannot read is a new number (and the reader derives the data instead). 2
 * (#355): the hero carries the target's entity only (any AR content) – format 1's model file `asset` is gone
 */
export const LANDING_FORMAT = 2;

/**
 * The hero without the experience's pick (`experience.landing`): the first of these entries (or targets) that has a model
 * (#354 – the book's "There Is a Face" on pages 10–11: staging and production name it `p10-3`, the local content
 * `p010-3`), else the content's first model (the test fixture offline) – `landing-extract.ts` `defaultLandingPick`
 */
export const LANDING_FALLBACK_ENTRIES: readonly string[] = ["p10-3", "p010-3"];

/**
 * A stable shuffle (a seeded linear congruential generator): the same items give the same pick on every visit – the
 * landing's scattered pictures and the hero's turning pages
 */
export const seededPick = <T>(items: readonly T[], count: number, seed = 324): T[] => {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
};

/** A shop item: its name is the app's text (`landing:shopBook`, `landing:shopShirt`) */
export interface LandingShopData {
  id: "book" | "shirt";
  url: string;
  /** A picture; none = the app's placeholder drawing */
  image?: string;
  /** The book's cover (`cover`) instead of the picture */
  cover?: boolean;
}

export interface LandingFile {
  format: typeof LANDING_FORMAT;
  /** The content schema `MAJOR.MINOR` of the version it was made from */
  schema: string;
  /** The experience's id */
  experience: string;
  title: string;
  /** The printed book's author and publisher, "" without */
  author: string;
  publisher: string;
  /** The experience's target images in scene order – a stable pick of them drifts around the hero */
  images: string[];
  /** The print layout's front cover, null without one */
  cover: string | null;
  /** null: the content has no model to show */
  hero: LandingHeroData | null;
  /** None: the app's shop items */
  shop?: LandingShopData[];
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

const isPrint = (value: unknown): value is LandingPrintData =>
  isObject(value) && isString(value.src) && isNumber(value.x) && isNumber(value.width) &&
  (value.top === null || isNumber(value.top)) && (value.height === undefined || isNumber(value.height));

/** The hero's entity as far as the landing reads it; the engine's builder reads the rest of the tree as the reader does */
const isHero = (value: unknown): value is LandingHeroData =>
  isObject(value) && isNumber(value.aspect) && Array.isArray(value.pages) && value.pages.every(isNumber) &&
  Array.isArray(value.prints) && value.prints.every(isPrint) && isPrint(value.target) &&
  isObject(value.entity) && isString(value.entity.type) && Array.isArray(value.entity.assets) &&
  (value.spread === null || isString(value.spread)) && isStrings(value.earlier) && isStrings(value.pageImages) &&
  Array.isArray(value.plugins) && value.plugins.every(plugin => isObject(plugin) && isString(plugin.id) && isString(plugin.src)) &&
  (value.appearance === undefined || isObject(value.appearance));

const isShop = (value: unknown): value is LandingShopData[] =>
  Array.isArray(value) && value.every(item =>
    isObject(item) && (item.id === "book" || item.id === "shirt") && isString(item.url) &&
    (item.image === undefined || isString(item.image)) && (item.cover === undefined || typeof item.cover === "boolean"));

/** A `landing.json` of this format: every field the landing reads, of the right type */
export const isLandingFile = (value: unknown): value is LandingFile =>
  isObject(value) && value.format === LANDING_FORMAT && isString(value.schema) && /^\d+\.\d+$/.test(value.schema) &&
  isString(value.experience) && isString(value.title) && isString(value.author) && isString(value.publisher) &&
  isStrings(value.images) && (value.cover === null || isString(value.cover)) &&
  (value.hero === null || isHero(value.hero)) && (value.shop === undefined || isShop(value.shop));
