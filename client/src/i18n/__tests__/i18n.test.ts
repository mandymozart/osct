import { afterEach, describe, expect, it } from "vitest";
import i18next from "i18next";
import { LANGUAGE_STORAGE_KEY, LANGUAGES, resources } from "..";

/** All texts of a language by "domain:key" */
const flatten = (node: object, prefix = ""): Record<string, string | readonly string[]> =>
  Object.entries(node).reduce<Record<string, string | readonly string[]>>((out, [key, value]) => {
    const path = prefix ? (prefix.includes(":") ? `${prefix}.${key}` : `${prefix}:${key}`) : key;
    if (typeof value === "string" || Array.isArray(value)) out[path] = value;
    else Object.assign(out, flatten(value as object, path));
    return out;
  }, {});

const placeholders = (value: string | readonly string[]) =>
  [...(typeof value === "string" ? value : value.join(" ")).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();

describe("i18n (i18next)", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("uses English on an English device", () => {
    expect(i18next.resolvedLanguage).toBe("en");
    expect(i18next.t("entry:accessPage")).toBe("Access page");
  });

  it("fills placeholders and escapes their values for HTML", () => {
    expect(i18next.t("entry:goToPage", { page: 4 })).toBe("Go to access page 4 in scan mode to see the video.");
    expect(i18next.t("scan:openEntry", { title: "<b>" })).toBe("Open entry &lt;b&gt;");
  });

  it("switches language, returns lists and keeps the choice in localStorage", async () => {
    await i18next.changeLanguage("de");
    expect(i18next.t("home:start")).toBe("Starten");
    expect(Object.values(i18next.t("camera:otherSteps", { returnObjects: true }))).toHaveLength(3);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
    await i18next.changeLanguage("fr-BE");
    expect(i18next.resolvedLanguage).toBe("fr");
    expect(i18next.t("entries:categories.video")).toBe("Vidéos");
  });

  it("shows English for a missing (empty) translation", async () => {
    const french = i18next.getResource("fr", "home", "start");
    i18next.addResource("fr", "home", "start", "");
    await i18next.changeLanguage("fr");
    expect(i18next.t("home:start")).toBe("Start");
    i18next.addResource("fr", "home", "start", french);
  });

  it("keeps the placeholders of English in every translation (missing ones are only warned by i18next-cli)", () => {
    const reference = flatten(resources.en);
    expect(Object.keys(reference).length).toBeGreaterThan(50);
    for (const language of LANGUAGES) {
      for (const [key, value] of Object.entries(flatten(resources[language] ?? {}))) {
        if (!value.length || !(key in reference)) continue;
        expect(placeholders(value), `${language} ${key}`).toEqual(placeholders(reference[key]));
      }
    }
  });
});
