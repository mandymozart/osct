import {
  type ExperienceLanding,
  LANDING_SHOP_MAX,
  type LandingShopItemData,
  type LandingTextKey,
  landingShopProblems,
  landingTextsProblems,
} from "@shared/types/landing";
import { LANDING_CONFIG } from "@ui/landing/landing-config";
import { appLandingTexts, type LandingLanguage } from "@ui/landing/texts";

/**
 * The landing workspace's texts and shop (#365) as pure edits of `experience.landing`: what the Texts and Shop sections
 * change, what the empty fields show, and what keeps a save back. The landing's texts are per language
 * (`texts[language][key]`); a field left blank is the app's text (the key goes, then an empty language, then `texts`). The
 * shop: none stored – the app's items (shown greyed, *Edit* copies them); `[]` – no shop on the page.
 */

/** The languages the Texts section switches between – the reader's, in the order the concept shows them */
export const LANDING_EDIT_LANGUAGES = ["en", "de", "fr", "nl"] as const satisfies readonly LandingLanguage[];

/** The texts the Texts section edits, with their labels (words, RULES #32) */
export const LANDING_TEXT_FIELDS: ReadonlyArray<{ key: LandingTextKey; label: string; multiline?: boolean; help: string }> = [
  { key: "intro", label: "intro", multiline: true, help: "The text under the title. Empty: the app's text in this language. {title} and {author} fill in; a line break stays." },
  { key: "getApp", label: "get the app", help: "The link under the intro and the heading beside the QR code. Empty: the app's text in this language." },
  { key: "openOnPhone", label: "QR line", help: "The line beside the QR code that says the app opens on a phone. Empty: the app's text in this language." },
  { key: "shop", label: "shop heading", help: "The heading over the shop. Empty: the app's text in this language." },
];

/** The landing with a text of one language set – blank: the app's text again (the key, then an empty language, then `texts` go) */
export const withLandingText = (landing: ExperienceLanding | null, language: string, key: LandingTextKey, text: string): ExperienceLanding => {
  const texts = { ...(landing?.texts ?? {}) };
  const own = { ...(texts[language] ?? {}) };
  if (text.trim()) own[key] = text;
  else delete own[key];
  if (Object.keys(own).length) texts[language] = own;
  else delete texts[language];
  const { texts: _texts, ...rest } = landing ?? {};
  return Object.keys(texts).length ? { ...rest, texts } : rest;
};

/** The landing with its shop – undefined: the app's items again (none stored), [] – no shop */
export const withLandingShop = (landing: ExperienceLanding | null, shop: LandingShopItemData[] | undefined): ExperienceLanding => {
  const { shop: _shop, ...rest } = landing ?? {};
  return shop === undefined ? rest : { ...rest, shop };
};

/** The app's text a blank field shows (greyed), in that language: the title and author filled in, the markup left out */
export const appTextOf = (language: LandingLanguage, key: LandingTextKey, values: { title: string; author: string }): string =>
  (appLandingTexts(language)[key] ?? "")
    .replace(/\{\{\s*(title|author)\s*\}\}/g, (_, name: "title" | "author") => values[name])
    .replace(/<[^>]*>/g, "");

/** The app's shop items as an experience's own (*Edit*): their names in English, their links, the book's cover */
export const appShopItems = (): LandingShopItemData[] => {
  const names = appLandingTexts("en");
  return LANDING_CONFIG.shop.map(item => ({
    label: item.id === "book" ? names.shopBook : item.id === "shirt" ? names.shopShirt : (item.label ?? ""),
    url: item.url,
    ...(item.cover ? { cover: true as const } : item.image ? { image: item.image } : {}),
  }));
};

/** A new, empty item (its label and link are filled in next) – none past the most */
export const canAddShopItem = (shop: readonly LandingShopItemData[] | undefined): boolean => (shop?.length ?? 0) < LANDING_SHOP_MAX;

/** What keeps the landing's save back: a text too long, an item without a label or with a link that is no http(s) address */
export const landingEditProblem = (landing: ExperienceLanding | null): string | null => {
  const problems = [
    ...(landing?.texts ? landingTextsProblems(landing.texts, "texts") : []),
    ...(landing?.shop ? landingShopProblems(landing.shop, "shop") : []),
  ];
  return problems[0] ? `Landing page – ${problems[0]}` : null;
};

/** A picture's URL to show in the editor: a content path below the experience's assets base; the app's own pictures and URLs as they are */
export const shopPictureUrl = (src: string, assetsBase: string): string =>
  src.startsWith("/assets/content/") ? `${assetsBase.replace(/\/+$/, "")}${src}` : src;
