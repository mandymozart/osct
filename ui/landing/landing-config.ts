/**
 * The desktop landing page's swappable content (#293, RULES #5): the shop links, the phone preview and the item
 * pictures. Texts are in the `landing` i18n namespace; pictures live in the reader's `public/assets/ui/landing/` (served at the site's root).
 *
 * The app's shop items are the fallback: an experience writes its own in the editor's landing workspace
 * (`experience.landing.shop`, #365 – `shopItemsOf`); until then both link to the publisher's site.
 */
import { LANDING_FALLBACK_ENTRIES } from "../../shared/api/landing";
import type { LandingShopItemData } from "../../shared/types/landing";

export const SHOP_URL_PLACEHOLDER = "https://buildingfictions.com";
/** The picture a cover item shows until the book's cover is known (and without a print layout) */
export const COVER_PLACEHOLDER = "/assets/ui/landing/book.svg";

/** An item of the page's shop: the app's own (`id`, named by the app's text) or an experience's (`label`, #365) */
export interface ShopItem {
  /** The app's item: its name is `landing:shopBook` / `landing:shopShirt` */
  id?: "book" | "shirt";
  /** An experience's item: its own name, the same in every language */
  label?: string;
  url: string;
  /** Picture (the app's: a placeholder drawing until the shop's product pictures arrive); "" = none */
  image: string;
  /** Show the book's cover from the content (print layout) instead of `image` when the content has one */
  cover?: boolean;
}

export interface LandingConfig {
  /**
   * The hero's scan stage (#354) without the experience's pick (`experience.landing`, #355): the entries whose model
   * stands on the open book, first found wins (`LANDING_FALLBACK_ENTRIES`, shared with the content build); none of
   * them: the content's first model (the test fixture offline)
   */
  scanEntries: string[];
  shop: ShopItem[];
}

export const LANDING_CONFIG: LandingConfig = {
  scanEntries: [...LANDING_FALLBACK_ENTRIES],
  shop: [
    { id: "book", url: SHOP_URL_PLACEHOLDER, image: COVER_PLACEHOLDER, cover: true },
    { id: "shirt", url: SHOP_URL_PLACEHOLDER, image: "/assets/ui/landing/t-shirt.svg" },
  ],
};

/**
 * The page's shop from an experience's (`experience.landing.shop`, #365): none – the app's items (`LANDING_CONFIG.shop`);
 * `[]` – no shop; else its items, a cover item with the placeholder drawing until the book's cover is filled in, an item
 * without a picture without one
 */
export const shopItemsOf = (items: readonly LandingShopItemData[] | undefined): ShopItem[] =>
  items === undefined
    ? LANDING_CONFIG.shop
    : items.map(item => ({ label: item.label, url: item.url, image: item.cover ? COVER_PLACEHOLDER : item.image ?? "", ...(item.cover ? { cover: true } : {}) }));
