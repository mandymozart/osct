import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/i18n";
import { legacyRedirectData } from "@/utils/legacy-redirect-html";
import { pickLanguage } from "@/landing/texts";
import { isPrivacyPage } from "../../../sw/static-pages";
import { PRIVACY_CHANGED, privacyScriptSource, PUBLISHER, renderPrivacyPage, renderPrivacyText, type PrivacySource } from "../privacy-html";

const read = (file: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales", file), "utf8"));
const paths = legacyRedirectData("osct");
const SOURCE: PrivacySource = {
  languages: Object.fromEntries(LANGUAGES.map(lang => [lang, {
    texts: read(`${lang}/privacy.json`), name: read(`${lang}/landing.json`).privacy, close: read(`${lang}/header.json`).close,
  }])),
  defaultLanguage: "en",
  title: "Onion Skin & Crocodile Tears",
  author: "Kévin Bray",
  markSrc: "/assets/ui/onboarding/icon.png",
  languageKey: "osct-language",
  lastKey: paths.lastKey,
  fallback: "osct",
  reserved: paths.reserved,
  id: paths.id,
  contentBase: "",
};

/** Privacy & terms as a static page (#355): the same text as the app's page was (#353), in every language */
describe("the static Privacy & terms page", () => {
  const text = (lang: string) => {
    const element = document.createElement("div");
    element.innerHTML = renderPrivacyText(lang, SOURCE.languages[lang], SOURCE);
    return element;
  };

  it("names Building Fictions with its address, KvK number and a mail link, and has every section (English)", () => {
    const page = text("en");
    const content = page.textContent ?? "";
    expect(content).toContain(`${PUBLISHER.name}, ${PUBLISHER.address} · KvK ${PUBLISHER.kvk}`);
    expect(page.querySelector(`a[href="mailto:${PUBLISHER.email}"]`)).not.toBeNull();
    expect(Array.from(page.querySelectorAll("h2")).map(h => h.textContent)).toEqual(["Who we are", "Privacy", "Terms of use", "Applicable law"]);
    expect(content).toContain("Autoriteit Persoonsgegevens");
    expect(content).toContain("YouTube or Vimeo");
    expect(content).toContain("Hetzner Online GmbH (Germany) runs our server");
    expect(content).toContain("Last changed: 23 November 2026");
    expect(page.querySelector('[data-field="title"]')!.textContent).toBe(SOURCE.title);
    expect(page.querySelector('[data-field="author"]')!.textContent).toBe(SOURCE.author);
    expect(page.querySelector("em")!.textContent).toBe(SOURCE.title);
  });

  it.each(LANGUAGES)("renders %s: every section, the date in its locale, nothing left unfilled", lang => {
    const page = text(lang);
    const content = page.textContent ?? "";
    expect(page.querySelector("article")!.getAttribute("lang")).toBe(lang);
    expect(page.querySelectorAll("h2")).toHaveLength(4);
    expect(page.querySelectorAll("h3")).toHaveLength(7);
    expect(content).toContain(PUBLISHER.kvk);
    expect(content).toContain(new Date(`${PRIVACY_CHANGED}T12:00:00Z`).toLocaleDateString(SOURCE.languages[lang].texts.locale, { year: "numeric", month: "long", day: "numeric" }));
    expect(content).not.toMatch(/\{\{|\}\}/);
    expect(page.querySelector('[data-field="author"]')).not.toBeNull();
  });

  it("is one page with all four languages, the default shown without the script; no app code", () => {
    const { head, body } = renderPrivacyPage(SOURCE);
    expect(body.match(/<article class="content" lang="/g)).toHaveLength(4);
    expect(head).toContain('html:not([data-lang]) .content[lang="en"]');
    LANGUAGES.forEach(lang => expect(head).toContain(`html[data-lang="${lang}"] .content[lang="${lang}"]`));
    expect(`${head}${body}`).not.toMatch(/type="module"|src="\/src\//);
    expect(body).toContain('id="close"');
    expect(body).toContain('href="/osct/about"');
  });

  describe("its script", () => {
    const run = (pathname: string, stored: Record<string, string>, languages: string[]) => {
      const html = { attrs: {} as Record<string, string>, lang: "", setAttribute(name: string, value: string) { this.attrs[name] = value; } };
      const doc = { documentElement: html, title: "" };
      const win = {
        document: doc,
        localStorage: { getItem: (key: string) => stored[key] ?? null },
        navigator: { languages, language: languages[0] },
        location: { pathname },
      };
      const { head } = renderPrivacyPage(SOURCE);
      const data = JSON.parse(/\}\)\(window, (\{.*\})\); \} catch/.exec(head)![1]);
      const result = (new Function(`return ${privacyScriptSource}`)() as (w: unknown, d: unknown) => { lang: string; experience: string | null; back: string })(win, data);
      return { result, html, doc };
    };

    it.each<[Record<string, string>, string[]]>([
      [{}, ["fr-BE"]], [{ "osct-language": "nl" }, ["de"]], [{}, ["es", "de-AT"]], [{}, []], [{ "osct-language": "xx" }, ["en-GB"]],
    ])("picks the language as the app does (stored %j, browser %j)", (stored, languages) => {
      const { result, html, doc } = run("/osct/privacy", stored, languages);
      const want = pickLanguage(stored["osct-language"] ?? null, languages);
      expect(result.lang).toBe(want);
      expect(html.attrs["data-lang"]).toBe(want);
      expect(html.lang).toBe(want);
      expect(doc.title).toBe(`${SOURCE.languages[want].name} – ${SOURCE.title}`);
    });

    it("goes back to the Info of the experience in the path, else the one opened last, else the default", () => {
      expect(run("/demo/privacy", {}, []).result.back).toBe("/demo/about");
      expect(run("/privacy", { "osct-experience": "demo" }, []).result.back).toBe("/demo/about");
      expect(run("/privacy", {}, []).result).toMatchObject({ back: "/osct/about", experience: "osct" });
    });
  });
});

describe("where Privacy & terms is answered", () => {
  it.each(["/privacy", "/privacy/", "/osct/privacy", "/demo/Privacy/"])("%s – privacy.html, also offline (the service worker)", path => {
    expect(isPrivacyPage(`https://osct.example${path}`)).toBe(true);
  });

  it.each(["/osct/privacy/x", "/editor/privacy", "/api/privacy", "/osct/about", "/a/b/privacy"])("%s – not", path => {
    expect(isPrivacyPage(`https://osct.example${path}`)).toBe(false);
  });

  it("the server's rewrite and the dev servers know the same addresses", () => {
    const htaccess = readFileSync(resolve(import.meta.dirname, "../../../public/.htaccess"), "utf8");
    expect(htaccess).toContain("RewriteRule ^([^/]+/)?privacy/?$ privacy.html [NC,L]");
    const vite = readFileSync(resolve(import.meta.dirname, "../../../vite.config.js"), "utf8");
    expect(vite).toContain("'privacy.html', // Privacy & terms");
    expect(vite).toContain("privacy: resolve(import.meta.dirname, 'privacy.html')");
  });

  it("privacy is one of the site's own paths – never an experience's id", () => {
    expect(paths.reserved).toContain("privacy");
  });
});
