import { detectLanguage, isLanguage, Language } from "@/i18n/languages";

/**
 * Settings of the reader on this device (singleton). Stored on their own, not in the progress record:
 * progress is per book ("Reset book" deletes it), settings belong to the reader across books and
 * survive a reset. Later both come from the API – settings as account settings, progress per book.
 *
 * Today: the preferred language. Without one the device's language is used (see `detectLanguage`).
 */
export interface StoredSettings {
  /** Chosen language; null = follow the device */
  language: Language | null;
}

export const SETTINGS_KEY = "osct-settings";

export class SettingsService {
  private static instance: SettingsService | null = null;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) SettingsService.instance = new SettingsService();
    return SettingsService.instance;
  }

  /** The language to show: the chosen one, else the device's */
  get language(): Language {
    const preferred = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
    return this.load().language ?? detectLanguage(preferred);
  }

  /** Remember the reader's choice (the app reloads to show it – see the language setting) */
  setLanguage(language: Language): void {
    this.save({ ...this.load(), language });
  }

  private load(): StoredSettings {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      return { language: isLanguage(raw?.language) ? raw.language : null };
    } catch {
      return { language: null };
    }
  }

  private save(settings: StoredSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("[SettingsService] Could not save the settings:", error);
    }
  }
}
