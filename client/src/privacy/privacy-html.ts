/**
 * Privacy & terms as a static page of its own (#355, Tilman 2026-11-23: "privacy and terms make it static. we can link
 * to it from the app, so we wont have duplicate pages"): `privacy.html`, written at build time (vite.config.js plugin
 * `osct-privacy-page`) from the app's `privacy` texts in every language, and answered for `/privacy` and
 * `/<experience>/privacy` (public/.htaccess, the dev and preview servers; the service worker keeps it for offline). No
 * app, no i18next: a tiny script in the head picks the reader's language as the app does (`osct-language`, else the
 * browser's – landing/texts.ts `pickLanguage`, a test keeps the two equal) and shows that language's text; the gold ×
 * goes back to where the reader came from (the app's Info, the landing). Its look is the app's Info pages':
 * the Mark, the consultation column, gold section titles.
 * What it says (#353): who is responsible (Building Fictions, Amsterdam), what the app does with data, the terms of use
 * under Dutch law. The book's title and author are the build's default experience's; on another experience's path the
 * script takes them from that experience's `landing.json` when its content has one.
 *
 * Imports are relative and import-free modules only: vite.config.js loads this file.
 */
import { DESIGN_PRIMITIVES_CSS } from "../styles/design-css";
import { escapeHtml } from "../utils/strings";

/** Who is responsible for the app (#353, from buildingfictions.com/About and /Terms) – the same in every language */
export const PUBLISHER = {
  name: "Building Fictions",
  address: "Lauriergracht 116W, 1016 RR Amsterdam, the Netherlands",
  kvk: "58614796",
  email: "info@buildingfictions.com",
} as const;

/** The version of the text: change it with every change of meaning */
export const PRIVACY_CHANGED = "2026-11-23";

/** One language's texts: the `privacy` namespace, the page's name (`landing:privacy`) and the × button's label (`header:close`) */
export interface PrivacyTexts {
  texts: Record<string, string>;
  name: string;
  close: string;
}

export interface PrivacySource {
  /** By language, the default first */
  languages: Record<string, PrivacyTexts>;
  defaultLanguage: string;
  /** The build's default experience's title and its book's author */
  title: string;
  author: string;
  /** The Mark at the top, as in the app's header */
  markSrc: string;
  /** For the script: where the app keeps the language, the experience it opened last, the default experience */
  languageKey: string;
  lastKey: string;
  fallback: string;
  /** The site's own top-level paths and the id rule, to read the path's experience */
  reserved: readonly string[];
  id: string;
  /** The environment's content base URL (`VITE_CONTENT_BASE_URL`), "" for bundled content */
  contentBase: string;
}

/** i18next's interpolation: `{{name}}` escaped, `{{- name}}` as it is */
const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{\{(-?)\s*(\w+)\s*\}\}/g, (_, raw: string, name: string) => (raw ? values[name] ?? "" : escapeHtml(values[name] ?? "")));

/** The book's title or author where the script can swap it for another experience's */
const field = (name: "title" | "author", value: string): string => `<span data-field="${name}">${escapeHtml(value)}</span>`;

/** One language's text, as the app's page showed it */
export const renderPrivacyText = (language: string, { texts }: PrivacyTexts, source: Pick<PrivacySource, "title" | "author">): string => {
  const say = (key: string, values: Record<string, string> = {}) => fill(texts[key] ?? "", values);
  const email = `<a href="mailto:${PUBLISHER.email}">${PUBLISHER.email}</a>`;
  const changed = new Date(`${PRIVACY_CHANGED}T12:00:00Z`).toLocaleDateString(texts.locale, { year: "numeric", month: "long", day: "numeric" });
  const part = (title: string, text: string) => `<h3>${title}</h3><p>${text}</p>`;
  return /* html */ `
      <article class="content" lang="${escapeHtml(language)}">
        <h2 class="section-title gold">${say("whoTitle")}</h2>
        <p>${escapeHtml(PUBLISHER.name)}, ${escapeHtml(PUBLISHER.address)} · KvK ${PUBLISHER.kvk} · ${email}</p>
        <p>${say("intro", { title: field("title", source.title) })}</p>

        <h2 class="section-title gold">${say("privacyTitle")}</h2>
        ${part(say("trackingTitle"), say("tracking"))}
        ${part(say("deviceTitle"), say("device"))}
        ${part(say("accountTitle"), say("account"))}
        ${part(say("processorsTitle"), say("processors"))}
        ${part(say("videosTitle"), say("videos"))}
        ${part(say("retentionTitle"), say("retention"))}
        ${part(say("rightsTitle"), say("rights", { email }))}

        <h2 class="section-title gold">${say("termsTitle")}</h2>
        <p>${say("terms1", { author: field("author", source.author) })}</p>
        <p>${say("terms2")}</p>
        <p>${say("terms3")}</p>
        <p>${say("terms4")}</p>

        <h2 class="section-title gold">${say("lawTitle")}</h2>
        <p>${say("law")}</p>
        <p class="changed">${say("changed", { date: changed })}</p>
      </article>`;
};

export const PRIVACY_CSS = /* css */ `
  html:root, html:root > body { height: auto; min-height: 100%; overflow: visible; display: block; width: auto; }
  html:root > body {
    margin: 0;
    background: var(--app-background);
    color: var(--color-on-dark);
    font-family: var(--font-design);
    letter-spacing: var(--tracking-design);
    font-size: var(--text-size);
    line-height: var(--text-line);
  }
  .privacy-top { position: relative; box-sizing: border-box; width: 100%; display: flex; justify-content: center; padding-top: calc(env(safe-area-inset-top) + 1rem); }
  .mark { display: block; width: var(--mark-width); height: var(--mark-height); margin-top: calc(-1 * var(--mark-inset-top)); }
  .close { position: absolute; top: calc(env(safe-area-inset-top) + 1rem); right: 1rem; text-decoration: none; }
  .content {
    display: none;
    box-sizing: border-box;
    max-width: 36rem;
    margin: 0 auto;
    padding: calc(var(--consultation-top) - var(--mark-height) - 1rem) 1.25rem calc(3rem + env(safe-area-inset-bottom));
  }
  .section-title:first-of-type { margin-top: 0; }
  h3 { margin: 1.25rem 0 .25rem; font-size: var(--text-size); font-weight: 600; }
  p { margin: 0 0 1em; overflow-wrap: anywhere; }
  a { color: var(--color-accent); }
  .changed { color: var(--color-muted); font-size: var(--text-size-small); }
`;

/** Which language shows: one rule per language, the default without the script */
const languageCss = (languages: readonly string[], defaultLanguage: string): string =>
  [`html:not([data-lang]) .content[lang="${defaultLanguage}"]`, ...languages.map(lang => `html[data-lang="${lang}"] .content[lang="${lang}"]`)]
    .join(",\n  ") + " { display: block; }";

/**
 * The head's script body: a function of (window, data) – picks the language (`data-lang`, `lang`, the title), points the ×
 * at the experience's Info (or back, when the reader came from this site) and, on another experience's path, swaps in
 * its title and author from its `landing.json`. A test runs it against a fake window.
 */
export const privacyScriptSource = `(function (win, D) {
  var doc = win.document;
  var own = function (code) { var l = String(code || "").trim().toLowerCase().split(/[-_]/)[0]; return D.languages.indexOf(l) >= 0 ? l : null; };
  var stored = null;
  try { stored = win.localStorage.getItem(D.languageKey); } catch (e) { stored = null; }
  var nav = win.navigator || {};
  var browser = nav.languages && nav.languages.length ? nav.languages : [nav.language || ""];
  var lang = own(stored);
  for (var i = 0; !lang && i < browser.length; i++) lang = own(browser[i]);
  lang = lang || D.defaultLanguage;
  doc.documentElement.setAttribute("data-lang", lang);
  doc.documentElement.lang = lang;
  if (D.names[lang]) doc.title = D.names[lang];
  var segs = win.location.pathname.split("/").filter(Boolean);
  var first = null;
  if (segs.length > 1) { try { first = decodeURIComponent(segs[0]); } catch (e) { first = null; } }
  var isExp = function (s) { return s !== null && new RegExp(D.id).test(s) && D.reserved.indexOf(s.toLowerCase()) < 0 && s.toLowerCase().indexOf("workbox-") !== 0; };
  var last = null;
  try { last = win.localStorage.getItem(D.lastKey); } catch (e) { last = null; }
  var exp = isExp(first) ? first : isExp(last) ? last : D.fallback || null;
  return { lang: lang, experience: exp, back: exp ? "/" + encodeURIComponent(exp) + "/about" : "/" };
})`;

/** After the page: the ×'s address and click, and another experience's title and author */
const afterScript = (data: Record<string, unknown>): string => `<script>try { (function (D, R) {
  var close = document.getElementById("close");
  if (close) {
    close.setAttribute("href", R.back);
    if (D.close[R.lang]) close.setAttribute("aria-label", D.close[R.lang]);
    close.addEventListener("click", function (event) {
      var ref = document.referrer;
      if (ref && ref.indexOf(location.origin + "/") === 0 && history.length > 1) { event.preventDefault(); history.back(); }
    });
  }
  if (!R.experience || R.experience === D.fallback || !D.contentBase || !window.fetch) return;
  var base = D.contentBase + "/" + encodeURIComponent(R.experience);
  fetch(base + "/latest.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (latest) {
    if (!latest || !/^[0-9a-f]{12}$/.test(latest.build)) return null;
    return fetch(base + "/" + latest.build + "/landing.json").then(function (r) { return r.ok ? r.json() : null; });
  }).then(function (file) {
    if (!file || typeof file.title !== "string") return;
    var set = function (name, value) { var all = document.querySelectorAll('[data-field="' + name + '"]'); for (var i = 0; i < all.length; i++) all[i].textContent = value; };
    set("title", file.title);
    if (typeof file.author === "string") set("author", file.author);
  }).catch(function () {});
})(${JSON.stringify(data)}, window.__osctPrivacy || {}); } catch (e) {}</script>`;

/** The page's parts for privacy.html: `head` (styles and the language script) and `body` */
export const renderPrivacyPage = (source: PrivacySource): { head: string; body: string } => {
  const languages = Object.keys(source.languages);
  const names = Object.fromEntries(languages.map(lang => [lang, `${source.languages[lang].name} – ${source.title}`]));
  const data = {
    languages, defaultLanguage: source.defaultLanguage, names, languageKey: source.languageKey, lastKey: source.lastKey,
    fallback: source.fallback, reserved: source.reserved, id: source.id,
  };
  const head = [
    `<style>${DESIGN_PRIMITIVES_CSS}${PRIVACY_CSS}  ${languageCss(languages, source.defaultLanguage)}</style>`,
    `<script>try { window.__osctPrivacy = ${privacyScriptSource}(window, ${JSON.stringify(data)}); } catch (e) {}</script>`,
  ].join("\n    ");
  const own = source.languages[source.defaultLanguage];
  const body = [
    `<header class="privacy-top">`,
    `  <img class="mark" src="${escapeHtml(source.markSrc)}" alt="" />`,
    `  <a id="close" class="icon-button design close" href="${source.fallback ? `/${encodeURIComponent(source.fallback)}/about` : "/"}" aria-label="${escapeHtml(own.close)}"><span class="gold">×</span></a>`,
    `</header>`,
    `<main class="design">${languages.map(lang => renderPrivacyText(lang, source.languages[lang], source)).join("")}`,
    `</main>`,
    afterScript({
      fallback: source.fallback, contentBase: source.contentBase,
      close: Object.fromEntries(languages.map(lang => [lang, source.languages[lang].close])),
    }),
  ].join("\n");
  return { head, body };
};
