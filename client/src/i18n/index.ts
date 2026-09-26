import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";
import { DEFAULT_LANGUAGE, LANGUAGES } from "./languages";
import { nl } from "./nl";

/**
 * UI texts with i18next (Tilman 2026-09-26: en default, fr, nl, de). One file per language and domain
 * (page or area) in `src/i18n/<language>/<domain>.ts`; each domain is an i18next namespace, every language
 * has exactly the English keys (TypeScript checks it), English is the fallback. Keys are typed
 * (`i18next.d.ts`). Components use i18next directly:
 *
 *   i18next.t("entry:accessPage")                          → "Access page"
 *   i18next.t("entry:goToPage", { page: 4 })               → placeholders {{page}}, values escaped for HTML
 *   i18next.t("camera:chromeSteps", { returnObjects: true }) → lists
 *
 * Language: the language detector keeps the reader's choice in localStorage (`osct-language`), else the
 * device's language. It is not part of the progress – "Reset book" keeps it. `i18next.changeLanguage()`
 * stores a new choice; the app then reloads (the URL keeps the view).
 *
 * Imported first in `main.ts` (and the test setup): initialisation is synchronous (bundled resources), so
 * every module can translate from then on – also at import time (e.g. startup errors).
 */
export * from "./languages";

export const LANGUAGE_STORAGE_KEY = "osct-language";

export const resources = { en, fr, nl, de } as const;

void i18next.use(LanguageDetector).init({
  resources,
  ns: Object.keys(en),
  defaultNS: false,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  nonExplicitSupportedLngs: true, // "fr-BE" → fr
  load: "languageOnly",
  initAsync: false,
  detection: {
    order: ["localStorage", "navigator"],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    caches: ["localStorage"],
  },
});

export default i18next;
