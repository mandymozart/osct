import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { describe, expect, it } from "vitest";
import { LANGUAGE_STORAGE_KEY, LANGUAGES, resources } from "@/i18n";
import en from "@/i18n/locales/en/landing.json";
import { LANGUAGE_KEY, landingTexts, pickLanguage } from "../texts";

/** The landing and the static Privacy & terms page pick the language without i18next (#355) – as the app's i18next does */
describe("pickLanguage", () => {
  const CASES: Array<[string | null, string[]]> = [
    [null, ["en-US"]], [null, ["fr-BE", "en"]], [null, ["nl-NL"]], [null, ["de-AT", "fr"]], [null, ["es-ES", "it"]],
    [null, ["es-ES", "de-DE"]], [null, []], ["fr", ["de-DE"]], ["nl", []], ["xx", ["de"]], ["de-CH", ["en"]],
  ];

  it.each(CASES)("stored %s, browser %j: as i18next's detector", async (stored, browser) => {
    const instance = i18next.createInstance();
    // The app's order (i18n/index.ts: localStorage, then navigator) with this case's values
    const detector = new LanguageDetector();
    detector.addDetector({ name: "stored", lookup: () => stored ?? undefined });
    detector.addDetector({ name: "browser", lookup: () => browser });
    await instance.use(detector).init({
      resources, fallbackLng: "en", supportedLngs: [...LANGUAGES], nonExplicitSupportedLngs: true, load: "languageOnly",
      initAsync: false, detection: { order: ["stored", "browser"], caches: [] },
    });
    expect(pickLanguage(stored, browser)).toBe(instance.resolvedLanguage);
  });

  it("reads the app's storage key", () => {
    expect(LANGUAGE_KEY).toBe(LANGUAGE_STORAGE_KEY);
  });
});

describe("landingTexts", () => {
  it("fills title and author, escaped, in the language asked for", () => {
    expect(landingTexts("en", { title: "A & B", author: "<x>" }).intro).toContain("<em>A &amp; B</em> by &lt;x&gt;");
    expect(landingTexts("de", { title: "T", author: "A" }).getApp).toBe("Hol dir die App");
    expect(landingTexts("fr", { title: "T", author: "A" }).getApp).not.toBe(en.getApp);
  });
});
