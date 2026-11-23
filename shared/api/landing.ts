/**
 * `landing.json` – what an experience's desktop landing shows (#355), in one small file next to the game configuration
 * of a content version: `<base>/<experience>/<build>/landing.json` (content-store.ts). Publish writes it from the
 * experience's choice of a scene and a surface (the editor's landing workspace); until a version has one, the reader's
 * landing derives the same data from `game.config.json` (`client/src/landing/derive.ts`). docs/content.md "landing.json".
 *
 * Paths are content paths (`/assets/content/…`) as in the game configuration; the reader resolves them against the
 * version's folder. The hero's model, its target and its plugins are the configuration's own shapes (`EntityData`,
 * `AssetData`, `PluginData`): a content schema MAJOR changes them too, so the file names the schema it was written with
 * and a reader that cannot read that MAJOR derives the data itself. Not content: `shared/api/` is outside the content
 * schema lock (RULES #10) – the file is the instance's, made from the content.
 */
import { isObject } from "../guards/primitives";
import type { ExperienceAppearance } from "../types/appearance";
import type { AssetData, EntityData } from "../types/game-config";
import type { PluginData } from "../types/plugins";

/** Its name in a version's folder */
export const LANDING_FILE = "landing.json";
/** The shape's own version: a change a reader cannot read is a new number (and the reader derives the data instead) */
export const LANDING_FORMAT = 1;

/**
 * A printed image on the hero's open book. Units: the surface's width is 1, its centre the origin, x → right, y → the
 * top of the page (as the engine's placement)
 */
export interface LandingPrintData {
  src: string;
  /** Its centre across, in surface widths */
  x: number;
  /** Its top edge, up from the surface's centre; null = centred (a target without a place) */
  top: number | null;
  width: number;
  /** In surface widths; none = from the image's proportions */
  height?: number;
}

/** The hero: the book open on one surface of one scene, the target with the model on it, and how the model appears */
export interface LandingHeroData {
  /** The surface's height in surface widths (a 460 × 320 mm spread: 0.696) */
  aspect: number;
  /** The printed page numbers the surface shows (its sheet in the print layout) */
  pages: number[];
  /** The surface's printed images where they lie */
  prints: LandingPrintData[];
  /** The target that holds the model */
  target: LandingPrintData;
  /** The model's node and its file */
  entity: EntityData;
  asset: AssetData;
  /** The print layout's picture of the surface and of the spreads before it (nearest last); null / [] without a layout */
  spread: string | null;
  earlier: string[];
  /** Other printed images of the book, for turning pages without a picture of their own */
  pageImages: string[];
  /** The experience's plugins (their looks play on reveal, found and lost) and its own looks */
  plugins: PluginData[];
  appearance?: ExperienceAppearance;
}

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

/** The model's node and file as far as the landing reads them; the engine's loader checks the model itself */
const isHero = (value: unknown): value is LandingHeroData =>
  isObject(value) && isNumber(value.aspect) && Array.isArray(value.pages) && value.pages.every(isNumber) &&
  Array.isArray(value.prints) && value.prints.every(isPrint) && isPrint(value.target) &&
  isObject(value.entity) && isString(value.entity.type) && Array.isArray(value.entity.assets) &&
  isObject(value.asset) && isString(value.asset.src) && isString(value.asset.assetType) &&
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
