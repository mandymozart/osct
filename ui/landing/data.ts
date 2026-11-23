import type { LandingFile, LandingHeroData } from "@shared/api/landing";
import { LANDING_CONFIG, type ShopItem } from "./landing-config";

/**
 * What the landing shows of an experience (#355) – everything the page and its hero need, URLs ready to load: one plain
 * block, so the very same page is mounted with an experience's draft elsewhere (the editor's landing workspace, #356). In the
 * reader from the content version's `landing.json` (shared/api/landing.ts, written by publish and by the content build)
 * or, until a version has one, derived from its game configuration (client/src/landing/derive.ts); in the editor from
 * the draft (`landingFileOf`).
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
