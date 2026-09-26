import i18next, { Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { DEFAULT_LANGUAGE, LANGUAGES } from "./languages";

/**
 * UI texts with i18next (Tilman 2026-09-26: en default, fr, nl, de – informal everywhere). Translations are
 * JSON (i18next JSON v4) in `src/i18n/locales/<language>/<namespace>.json`, one namespace per page or area,
 * maintained with i18next-cli (`i18next.config.ts`: extract keys, generate the types in `i18next.d.ts`,
 * report missing translations). English is the fallback – a missing or empty translation shows English.
 * Components use i18next directly:
 *
 *   i18next.t("entry:accessPage")                            → "Access page"
 *   i18next.t("entry:goToPage", { page: 4 })                 → placeholders {{page}}, values escaped for HTML
 *   i18next.t("camera:chromeSteps", { returnObjects: true })   → lists
 *
 * Language: the language detector keeps the reader's choice in localStorage (`osct-language`), else the
 * device's language. It is not part of the progress – "Reset book" keeps it. `i18next.changeLanguage()`
 * stores a new choice; the app then reloads (the URL keeps the view).
 *
 * Imported first in `main.ts` (and the test setup): initialisation is synchronous (the JSON is bundled), so
 * every module can translate from then on – also at import time (e.g. startup errors).
 */
export * from "./languages";

export const LANGUAGE_STORAGE_KEY = "osct-language";

/** `./locales/<language>/<namespace>.json` → { language: { namespace: texts } } */
const files = import.meta.glob<Record<string, unknown>>("./locales/*/*.json", { eager: true, import: "default" });

export const resources: Resource = {};
for (const [file, texts] of Object.entries(files)) {
  const [, language, namespace] = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(file) ?? [];
  if (language && namespace) (resources[language] ??= {})[namespace] = texts;
}

void i18next.use(LanguageDetector).init({
  resources,
  ns: Object.keys(resources[DEFAULT_LANGUAGE] ?? {}),
  defaultNS: false,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  nonExplicitSupportedLngs: true, // "fr-BE" → fr
  load: "languageOnly",
  returnEmptyString: false, // untranslated ("") → English
  initAsync: false,
  detection: {
    order: ["localStorage", "navigator"],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    caches: ["localStorage"],
  },
});

export default i18next;
