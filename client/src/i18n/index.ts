import i18next, { i18n as I18n } from "i18next";
import { SettingsService } from "@/services/SettingsService";
import { escapeHtml } from "@/utils/strings";
import { de } from "./de";
import { en, Messages } from "./en";
import { fr } from "./fr";
import { DEFAULT_LANGUAGE, Language, LANGUAGES } from "./languages";
import { nl } from "./nl";

/**
 * UI texts with i18next (Tilman 2026-09-26: en default, fr, nl, de). One file per language and domain
 * (page or area) in `src/i18n/<language>/<domain>.ts`; each domain is an i18next namespace, every
 * language has exactly the English keys (TypeScript checks it), English is the fallback.
 * Placeholders: `{name}`.
 *
 *   t("entry.accessPage")                     → "Access page"        (domain.key)
 *   t("entry.goToPage", { page: 4 })          → "Go to access page 4 in scan mode …"
 *   tHtml(…)                                  → the same, escaped for HTML templates
 *   tList("camera.chromeSteps")               → list texts
 *
 * The language comes from the settings (`SettingsService`: the reader's choice, else the device's).
 * Changing it reloads the app. Book content (titles, entry texts, onboarding steps) is not UI text –
 * it comes from `content/` as it is.
 */
export * from "./languages";
export type { Messages };

const RESOURCES: Record<Language, Messages> = { en, fr, nl, de };
const DOMAINS = Object.keys(en) as (keyof Messages)[];

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;
/** "domain.key" paths of all text values ("entry.accessPage") */
export type TextKey<T = Messages, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : T[K] extends readonly string[] ? never : TextKey<T[K], Join<P, K>>;
}[keyof T & string];
/** "domain.key" paths of all list values ("camera.chromeSteps") */
export type ListKey<T = Messages, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? never : T[K] extends readonly string[] ? Join<P, K> : ListKey<T[K], Join<P, K>>;
}[keyof T & string];

export type Params = Record<string, string | number>;

let instance: I18n | null = null;

/** The i18next instance – created on first use, synchronously (resources are bundled) */
const i18n = (): I18n => {
  if (instance) return instance;
  instance = i18next.createInstance();
  void instance.init({
    lng: SettingsService.getInstance().language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGES],
    // one namespace per domain: { en: { entry: { accessPage: … } } }
    resources: Object.fromEntries(LANGUAGES.map(language => [language, RESOURCES[language]])),
    ns: DOMAINS,
    defaultNS: false,
    initAsync: false,
    returnObjects: true,
    interpolation: { prefix: "{", suffix: "}", escapeValue: false }, // escaping: tHtml
  });
  return instance;
};

/** "entry.goToPage" → namespace "entry", key "goToPage" */
const split = (key: string): [string, string] => {
  const dot = key.indexOf(".");
  return [key.slice(0, dot), key.slice(dot + 1)];
};

/** The language the app shows */
export const getLanguage = (): Language => i18n().language as Language;

/** Use another language right away (tests; the app reloads instead after a change) */
export const useLanguage = (language: Language): void => {
  void i18n().changeLanguage(language);
};

/** Text in the current language (English if a translation is missing), placeholders filled in */
export const t = (key: TextKey, params?: Params): string => {
  const [ns, path] = split(key);
  return i18n().t(path, { ns, ...params }) as string;
};

/** `t` escaped for HTML templates (texts and placeholder values) */
export const tHtml = (key: TextKey, params?: Params): string => escapeHtml(t(key, params));

/** List texts (e.g. steps) in the current language */
export const tList = (key: ListKey): readonly string[] => {
  const [ns, path] = split(key);
  const value = i18n().t(path, { ns, returnObjects: true }) as unknown;
  return Array.isArray(value) ? value : [];
};

/** All texts of a language by "domain.key" – for the consistency test */
export const flattenMessages = (language: Language): Record<string, string | readonly string[]> => {
  const out: Record<string, string | readonly string[]> = {};
  const walk = (node: unknown, prefix: string) => {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string" || Array.isArray(value)) out[path] = value as string | readonly string[];
      else walk(value, path);
    }
  };
  walk(RESOURCES[language], "");
  return out;
};
