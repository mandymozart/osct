/**
 * The desktop landing page's swappable content (#293, RULES #5): the shop links, the phone preview and the item
 * pictures. Texts are in the `landing` i18n namespace; pictures live in `public/assets/ui/landing/`.
 *
 * PLACEHOLDER: the Building Fictions shop pages for the book and the T-shirt are not known yet – both link to the
 * publisher's site until Tilman gives the shop URLs (open item in agents/MEMORY.md, 2026-11-17).
 */
export const SHOP_URL_PLACEHOLDER = "https://buildingfictions.com";

export interface ShopItem {
  /** Its name: `landing:shopBook` / `landing:shopShirt` */
  id: "book" | "shirt";
  url: string;
  /** Picture (a placeholder drawing until the shop's product pictures arrive) */
  image: string;
  /** Show the book's cover from the content (print layout) instead of `image` when the content has one */
  cover?: boolean;
}

export interface LandingConfig {
  /** A still of the app inside the phone frame */
  previewImage: string;
  /** A looping video instead of the still (muted, inline); `null` = the still */
  previewVideo: string | null;
  shop: ShopItem[];
}

export const LANDING_CONFIG: LandingConfig = {
  previewImage: "/assets/ui/landing/app-preview.webp",
  previewVideo: null,
  shop: [
    { id: "book", url: SHOP_URL_PLACEHOLDER, image: "/assets/ui/landing/book.svg", cover: true },
    { id: "shirt", url: SHOP_URL_PLACEHOLDER, image: "/assets/ui/landing/t-shirt.svg" },
  ],
};
