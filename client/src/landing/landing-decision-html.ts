/**
 * The desktop landing's decision as an inline script in index.html's head (#343, Tilman 2026-11-22: "same thing goes
 * for the browser redirect to that landing page. i assume we can write a small script we put in the skeleton and run
 * immediately"). Right after the legacy redirect, before any code is fetched: a computer (`isDesktopVisitor` on
 * `readDeviceSignals`) that is no developer past it (`LANDING_SKIPPED_KEY`) gets `<html data-osct-landing="page">` on
 * the default experience's path (the static landing in the body is its own) and `data-osct-landing="skeleton"` on any
 * other experience's (the same page as placeholders until the landing has its data) – desktop-visitor.ts `landingMode`.
 * The page then loads the landing's entry instead of the app (#355, `renderEntryLoader`; Tilman 2026-11-23: "it
 * basically does not need to load the app at all if its on desktop"). A test keeps the script equal to `landingMode`
 * case by case.
 * Plain ES5-ish JavaScript, no imports, wrapped in try/catch: a failure loads the app.
 * Imports are relative: vite.config.js loads this file.
 */
import { BREAKPOINT_TABLET } from "../constants";
import { legacyRedirectData } from "../utils/legacy-redirect-html";
import { LANDING_SKIPPED_KEY } from "./desktop-visitor";
import { LANDING_ATTRIBUTE } from "../../../ui/landing/landing-html";

export interface LandingDecisionData {
  /** `BREAKPOINT_TABLET` in em: the window must be at least this wide */
  breakpoint: number;
  /** sessionStorage key of the developers' way past it (`LANDING_SKIPPED_KEY`) */
  skipKey: string;
  /** The attribute set on `<html>` (`LANDING_ATTRIBUTE`) */
  attribute: string;
  /** The build's default experience, "" for none (a build with bundled content) */
  fallback: string;
  /** The site's own top-level paths and the id rule – as the legacy redirect knows them – to read the path's experience */
  reserved: readonly string[];
  id: string;
}

/**
 * The script's body: a function of (window, sessionStorage) returning the mode (`"page"`, `"skeleton"`, or null for the
 * app) – a test runs it against a fake window
 */
export const landingDecisionSource = (data: LandingDecisionData): string => `(function (win, store) {
  var D = ${JSON.stringify(data)};
  var matches = function (q) { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch (e) { return false; } };
  var nav = win.navigator || {};
  var ipad = nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
  var standalone = matches("(display-mode: standalone)") || nav.standalone === true;
  var coarse = matches("(pointer: coarse)");
  var mobile = ipad || /Android|iPhone|iPad|iPod|Mobi/i.test(nav.userAgent || "");
  var wide = matches("(min-width: " + D.breakpoint + "em)");
  var skipped = false;
  try { skipped = !!store && store.getItem(D.skipKey) === "1"; } catch (e) { skipped = false; }
  if (standalone || coarse || mobile || !wide || skipped) return null;
  var segs = win.location.pathname.split("/").filter(Boolean);
  var first = null;
  if (segs.length) { try { first = decodeURIComponent(segs[0]); } catch (e) { first = null; } }
  var low = first === null ? "" : first.toLowerCase();
  var named = first !== null && new RegExp(D.id).test(first) && D.reserved.indexOf(low) < 0 && low.indexOf("workbox-") !== 0;
  var mode = named && first !== D.fallback ? "skeleton" : "page";
  win.document.documentElement.setAttribute(D.attribute, mode);
  return mode;
})`;

/** The `<script>` for index.html's head, after the legacy redirect: runs at once against the real window */
export const renderLandingDecision = (data: LandingDecisionData): string =>
  `<script>try { var __osctSession = null; try { __osctSession = window.sessionStorage; } catch (e) {} ${landingDecisionSource(data)}(window, __osctSession); } catch (e) {}</script>`;

/** The build's data: desktop-visitor.ts's constants and the build's default experience */
export const landingDecisionData = (fallback: string): LandingDecisionData => {
  const paths = legacyRedirectData(fallback);
  return {
    breakpoint: BREAKPOINT_TABLET,
    skipKey: LANDING_SKIPPED_KEY,
    attribute: LANDING_ATTRIBUTE,
    fallback: fallback.trim(),
    reserved: paths.reserved,
    id: paths.id,
  };
};

/** The two entries index.html loads one of (#355): the app's and the landing's – the loader module imports them */
export interface EntryFiles {
  /** Every built file of the entry and its static imports, the entry first */
  app: readonly string[];
  landing: readonly string[];
}

/**
 * The early start of the chosen entry (#355): right after the decision, while the page is still parsed, the files of
 * the app – or, on a computer, of the landing – are asked for as module preloads, as the browser's preload scanner asked
 * for the app's files when index.html named them itself. The loader module (index.html, executed once the page is
 * parsed) imports the entry; it then finds its files on the way. Empty lists (the dev server) write nothing.
 */
export const renderEntryPreload = (attribute: string, files: EntryFiles): string => {
  if (!files.app.length && !files.landing.length) return "";
  return `<script>try { (function (F) { var list = document.documentElement.hasAttribute(${JSON.stringify(attribute)}) ? F.landing : F.app;` +
    ` for (var i = 0; i < list.length; i++) { var l = document.createElement("link"); l.rel = "modulepreload"; l.crossOrigin = ""; l.href = list[i]; document.head.appendChild(l); } })(${JSON.stringify(files)}); } catch (e) {}</script>`;
};
