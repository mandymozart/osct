/**
 * The experience's landing (content schema 6.1, #355): the one target with AR content (a model, a video, a component –
 * Tilman: "or video or component. marginalia and links wouldnt work") on one surface of one scene that the desktop
 * landing's hero shows – Tilman, 2026-11-23: "the landing page hero needs only a specific target on a surface
 * on a scene to show of how they work. so that data can be extracted in the editor to fill in the data needed to build the
 * landing page." The person picks it in the editor; the editor (and the content build, and the MCP server) extracts the
 * hero from it and stores both (`ExperienceData.landing`), so publish writes `landing.json` from the stored data and
 * nobody traverses the scenes for it again (`shared/api/landing-extract.ts`; the file: `shared/api/landing.ts`).
 *
 * Units of the hero: the surface's width is 1, its centre the origin, x → right, y → the top of the page (as the
 * engine's placement, `./placement.ts`).
 */
import { isObject } from "../guards/primitives";
import type { ExperienceAppearance } from "./appearance";
import type { EntityData } from "./game-config";
import type { PluginData } from "./plugins";

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

/** The hero: the book open on one surface of one scene, the target with its AR content on it, and how that appears */
export interface LandingHeroData {
  /** The surface's height in surface widths (a 460 × 320 mm spread: 0.696) */
  aspect: number;
  /** The printed page numbers the surface shows (its sheet in the print layout) */
  pages: number[];
  /** The surface's printed images where they lie */
  prints: LandingPrintData[];
  /** The target that holds the AR content */
  target: LandingPrintData;
  /**
   * The target's entity as the configuration has it – its node tree, components and files: a model, a video (keyed or
   * not), a plugin's node type, a node a component drives. The hero builds it with the engine, as the reader does.
   */
  entity: EntityData;
  /** The print layout's picture of the surface and of the spreads before it (nearest last); null / [] without a layout */
  spread: string | null;
  earlier: string[];
  /** Other printed images of the book, for turning pages without a picture of their own */
  pageImages: string[];
  /** The experience's plugins (their looks play on reveal, found and lost) and its own looks */
  plugins: PluginData[];
  appearance?: ExperienceAppearance;
}

/** A scene and one of its targets, by id – the target lies on one surface of that scene, which is the hero's surface */
export interface LandingPick {
  scene: string;
  target: string;
}

/**
 * The landing's texts a person may write (schema 6.4, #365, Tilman 2026-11-23: "Yes, as recommended") – the intro under
 * the title, the "Get the app" heading and link, the line beside the QR code (`openOnPhone`) and the shop's heading. Every
 * other text of the page (the QR code's alt text, "Scan with your phone", "Privacy & terms", …) stays the app's
 * (`ui/landing/locales/<language>/landing.json`), as does every text left out here. Plain text: `{title}` and `{author}`
 * fill in, line breaks stay.
 */
export const LANDING_TEXT_KEYS = ["intro", "getApp", "openOnPhone", "shop"] as const;
export type LandingTextKey = (typeof LANDING_TEXT_KEYS)[number];
/** The longest text of each key (characters) */
export const LANDING_TEXT_MAX: Readonly<Record<LandingTextKey, number>> = { intro: 600, getApp: 120, openOnPhone: 300, shop: 120 };
/** One language's own texts; a key left out is the app's text in that language */
export type LandingTextsOf = Partial<Record<LandingTextKey, string>>;
/** The own texts by language – a two-letter code (`en`, `de`, `fr`, `nl`: the reader's languages) */
export type LandingTexts = Record<string, LandingTextsOf>;

/** The shop's items at most, a label's and a link's longest (characters) */
export const LANDING_SHOP_MAX = 4;
export const LANDING_SHOP_LABEL_MAX = 120;
export const LANDING_SHOP_URL_MAX = 2000;

/**
 * An item of the landing's shop (schema 6.4, #365): its label (one for every language), the page it links to, and its
 * picture – a file of the experience (a content path or a URL) or the book's cover (`cover: true`, the print layout's
 * front cover); neither: no picture
 */
export interface LandingShopItemData {
  label: string;
  /** http(s) */
  url: string;
  image?: string;
  cover?: true;
}

/**
 * `ExperienceData.landing` (schema 6.1): the pick, and what was extracted from it when it was picked – `hero` and the
 * print layout's front `cover` (none: the layout has none). An author writes `scene` and `target` only; the editor and
 * the content build fill the rest. An app before 6.1 ignores the field.
 *
 * Schema 6.4 (#365): the page's own `texts` by language and its `shop` – apart from the pick, so a landing may hold them
 * without one (then neither `scene` nor `target`, `hero` nor `cover`: the landing's hero is the default). `shop` left
 * out: the app's items; `[]`: no shop on the page. An app of 6.3 ignores both fields but refuses a landing without a pick –
 * publish leaves such a landing out of the readers' configuration (`landing.json` carries its texts and shop).
 */
export interface ExperienceLanding extends Partial<LandingPick> {
  hero?: LandingHeroData;
  cover?: string;
  texts?: LandingTexts;
  shop?: LandingShopItemData[];
}

/** The landing's pick – its scene and target – or null when it holds texts or a shop only */
export const landingPickOf = (landing: ExperienceLanding | null | undefined): LandingPick | null =>
  landing && typeof landing.scene === "string" && typeof landing.target === "string" ? { scene: landing.scene, target: landing.target } : null;

/** What a landing holds apart from its pick: its texts and its shop (each only when set) */
export const landingExtrasOf = (landing: ExperienceLanding | null | undefined): Pick<ExperienceLanding, "texts" | "shop"> => ({
  ...(landing?.texts !== undefined ? { texts: landing.texts } : {}),
  ...(landing?.shop !== undefined ? { shop: landing.shop } : {}),
});

const LANGUAGE = /^[a-z]{2}$/;
const HTTP_URL = /^https?:\/\/[^\s/?#]+\S*$/i;

/** Problems of a landing's `texts` as "<path>: <message>" */
export const landingTextsProblems = (value: unknown, path = "experience.landing.texts"): string[] => {
  if (!isObject(value)) return [`${path}: expected { <language>: { ${LANDING_TEXT_KEYS.join(", ")} } }`];
  const problems: string[] = [];
  for (const [language, texts] of Object.entries(value)) {
    const at = `${path}.${language}`;
    if (!LANGUAGE.test(language)) problems.push(`${at}: expected a two-letter language code (en, de, fr, nl)`);
    if (!isObject(texts)) {
      problems.push(`${at}: expected { ${LANDING_TEXT_KEYS.join(", ")} }`);
      continue;
    }
    for (const [key, text] of Object.entries(texts)) {
      if (!(LANDING_TEXT_KEYS as readonly string[]).includes(key)) problems.push(`${at}.${key}: unknown text – ${LANDING_TEXT_KEYS.join(", ")}`);
      else if (typeof text !== "string" || text.trim() === "") problems.push(`${at}.${key}: expected a text (leave it out for the app's)`);
      else if (text.length > LANDING_TEXT_MAX[key as LandingTextKey]) problems.push(`${at}.${key}: longer than ${LANDING_TEXT_MAX[key as LandingTextKey]} characters`);
    }
  }
  return problems;
};

/** Problems of a landing's `shop` as "<path>: <message>" */
export const landingShopProblems = (value: unknown, path = "experience.landing.shop"): string[] => {
  if (!Array.isArray(value)) return [`${path}: expected a list of { label, url, image?, cover? }`];
  const problems: string[] = [];
  if (value.length > LANDING_SHOP_MAX) problems.push(`${path}: at most ${LANDING_SHOP_MAX} items`);
  value.forEach((item: unknown, i) => {
    const at = `${path}[${i}]`;
    if (!isObject(item)) {
      problems.push(`${at}: expected { label, url, image?, cover? }`);
      return;
    }
    if (typeof item.label !== "string" || item.label.trim() === "") problems.push(`${at}.label: expected a text`);
    else if (item.label.length > LANDING_SHOP_LABEL_MAX) problems.push(`${at}.label: longer than ${LANDING_SHOP_LABEL_MAX} characters`);
    if (typeof item.url !== "string" || !HTTP_URL.test(item.url)) problems.push(`${at}.url: expected an http(s) address`);
    else if (item.url.length > LANDING_SHOP_URL_MAX) problems.push(`${at}.url: longer than ${LANDING_SHOP_URL_MAX} characters`);
    if (item.image !== undefined && (typeof item.image !== "string" || item.image === "")) problems.push(`${at}.image: expected a path or URL`);
    if (item.cover !== undefined && item.cover !== true) problems.push(`${at}.cover: expected true (the book's cover) or none`);
    if (item.image !== undefined && item.cover !== undefined) problems.push(`${at}: a picture (image) or the book's cover (cover), not both`);
    const unknown = Object.keys(item).filter(key => !["label", "url", "image", "cover"].includes(key));
    if (unknown.length) problems.push(`${at}: unknown ${unknown.join(", ")} – label, url, image, cover`);
  });
  return problems;
};

/** Problems of an `experience.landing` as "<path>: <message>" – its shape; whether the pick exists is the build's and the API's check */
export const experienceLandingProblems = (value: unknown, path = "experience.landing"): string[] => {
  if (!isObject(value)) return [`${path}: expected { scene, target } and / or { texts, shop }`];
  const problems: string[] = [];
  if (value.scene !== undefined || value.target !== undefined) {
    for (const key of ["scene", "target"] as const) {
      if (typeof value[key] !== "string" || value[key] === "") problems.push(`${path}.${key}: expected an id`);
    }
  } else if (value.hero !== undefined || value.cover !== undefined) problems.push(`${path}: a hero or a cover needs its pick (scene, target)`);
  if (value.hero !== undefined && !isObject(value.hero)) problems.push(`${path}.hero: expected the extracted hero (an object)`);
  if (value.cover !== undefined && typeof value.cover !== "string") problems.push(`${path}.cover: expected a path or URL`);
  if (value.texts !== undefined) problems.push(...landingTextsProblems(value.texts, `${path}.texts`));
  if (value.shop !== undefined) problems.push(...landingShopProblems(value.shop, `${path}.shop`));
  return problems;
};
