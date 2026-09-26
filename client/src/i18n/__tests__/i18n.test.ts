import { afterEach, describe, expect, it } from "vitest";
import { detectLanguage, flattenMessages, getLanguage, LANGUAGES, t, tHtml, tList, useLanguage } from "..";

const placeholders = (value: string | readonly string[]) =>
  [...(Array.isArray(value) ? value.join(" ") : (value as string)).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe("i18n", () => {
  afterEach(() => useLanguage("en"));

  it("uses English by default (the test device is en-US)", () => {
    expect(getLanguage()).toBe("en");
    expect(t("entry.accessPage")).toBe("Access page");
  });

  it("fills placeholders and escapes for HTML", () => {
    expect(t("entry.goToPage", { page: 4 })).toBe("Go to access page 4 in scan mode to see the video.");
    expect(tHtml("scan.openEntry", { title: "<b>" })).toBe("Open entry &lt;b&gt;");
  });

  it("switches language and returns lists", () => {
    useLanguage("de");
    expect(t("home.start")).toBe("Starten");
    expect(tList("camera.otherSteps")).toHaveLength(3);
    useLanguage("fr");
    expect(t("entries.categories.video")).toBe("Vidéos");
  });

  it("has every text in every language, non-empty, with the same placeholders", () => {
    const reference = flattenMessages("en");
    for (const language of LANGUAGES) {
      const messages = flattenMessages(language);
      expect(Object.keys(messages).sort(), language).toEqual(Object.keys(reference).sort());
      for (const [key, value] of Object.entries(messages)) {
        expect(value.length, `${language} ${key}`).toBeGreaterThan(0);
        expect(placeholders(value), `${language} ${key}`).toEqual(placeholders(reference[key]));
        if (Array.isArray(value)) expect(value.length, `${language} ${key}`).toBe((reference[key] as string[]).length);
      }
    }
  });

  it("picks the first supported device language", () => {
    expect(detectLanguage(["fr-BE", "en"])).toBe("fr");
    expect(detectLanguage(["es", "nl-NL"])).toBe("nl");
    expect(detectLanguage(["ja"])).toBe("en");
  });
});
