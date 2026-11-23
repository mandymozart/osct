import de from "./locales/de/landing.json";
import en from "./locales/en/landing.json";
import fr from "./locales/fr/landing.json";
import nl from "./locales/nl/landing.json";
import { fillTexts, type LandingTexts } from "./landing-html";

/**
 * The landing's texts (#355, #356): the reader's `landing` i18n namespace, kept beside the piece
 * (`locales/<language>/landing.json`, maintained by the reader's i18next-cli like every namespace – RULES #20). No
 * i18next: the reader picks the language itself (client/src/landing/texts.ts), the editor shows English.
 */
const LANDING_TEXTS = { en, fr, nl, de } as const satisfies Record<string, Record<string, string>>;

/** The languages the landing has texts for (the reader's `LANGUAGES` – a test keeps them equal) */
export type LandingLanguage = keyof typeof LANDING_TEXTS;
export const LANDING_LANGUAGES = Object.keys(LANDING_TEXTS) as LandingLanguage[];

/** The `landing` namespace in a language, the title and the author filled in (escaped); a missing text is English's */
export const landingTexts = (language: LandingLanguage, values: { title: string; author: string }): LandingTexts =>
  fillTexts({ ...en, ...Object.fromEntries(Object.entries(LANDING_TEXTS[language] as Record<string, string>).filter(([, text]) => text)) }, values);
