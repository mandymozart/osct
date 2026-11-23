import { DEFAULT_LANGUAGE, isLanguage, type Language } from "../i18n/languages";
import de from "../i18n/locales/de/landing.json";
import en from "../i18n/locales/en/landing.json";
import fr from "../i18n/locales/fr/landing.json";
import nl from "../i18n/locales/nl/landing.json";
import { fillTexts, type LandingTexts } from "./landing-html";

/** Where the app keeps the reader's language (`LANGUAGE_STORAGE_KEY` in i18n/index.ts – a test keeps them equal) */
export const LANGUAGE_KEY = "osct-language";

const LANDING_TEXTS: Record<Language, Record<string, string>> = { en, fr, nl, de };

/**
 * The language as the app picks it (i18next's detector, i18n/index.ts): the reader's stored choice, else the first of
 * the browser's languages the app has (`fr-BE` → `fr`), else English. Without i18next, so the landing (#355) and the
 * static Privacy & terms page load none of the app; a test keeps the pick equal to i18next's.
 */
export const pickLanguage = (stored: string | null, browser: readonly string[]): Language => {
  const own = (code: string | null): Language | null => {
    const language = code?.trim().toLowerCase().split(/[-_]/)[0] ?? null;
    return isLanguage(language) ? language : null;
  };
  return own(stored) ?? browser.map(own).find((language): language is Language => language !== null) ?? DEFAULT_LANGUAGE;
};

/** `pickLanguage` for this browser; storage that throws counts as none */
export const browserLanguage = (win: Window = window): Language => {
  let stored: string | null = null;
  try {
    stored = win.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    stored = null;
  }
  const nav = win.navigator;
  return pickLanguage(stored, nav.languages?.length ? nav.languages : [nav.language ?? ""]);
};

/** The `landing` namespace in a language, the title and the author filled in (escaped); a missing text is English's */
export const landingTexts = (language: Language, values: { title: string; author: string }): LandingTexts =>
  fillTexts({ ...en, ...Object.fromEntries(Object.entries(LANDING_TEXTS[language]).filter(([, text]) => text)) }, values);
