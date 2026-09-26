/** Languages of the app (UI texts). English is the default and the reference for the others. */
export const LANGUAGES = ["en", "fr", "nl", "de"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en";

/** Each language in itself – shown in the language setting */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  nl: "Nederlands",
  de: "Deutsch",
};

export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** First of the device's preferred languages the app has ("fr-BE" → fr), else English */
export const detectLanguage = (preferred: readonly string[]): Language => {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
};
