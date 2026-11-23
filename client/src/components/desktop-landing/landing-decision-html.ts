/**
 * The desktop landing's decision as an inline script in index.html's head (#343, Tilman 2026-11-22: "same thing goes
 * for the browser redirect to that landing page. i assume we can write a small script we put in the skeleton and run
 * immediately"). Right after the legacy redirect, before the app's bundle is fetched: a computer (`isDesktopVisitor` on
 * `readDeviceSignals`) that did not choose "open here" in this tab (`landingSkipped`) on the default experience's path
 * (`activeExperience` is the default: the path names none or the default) gets `<html data-osct-landing>` – the
 * static landing (landing-html.ts) shows, the static splash does not.
 * Another experience's path (`/demo/`) keeps the splash until `<desktop-landing>` decides (the static page carries the
 * default's texts and images). A test keeps the script equal to desktop-visitor.ts case by case.
 * Plain ES5-ish JavaScript, no imports, wrapped in try/catch: a failure leaves the decision to the app.
 * Imports are relative: vite.config.js loads this file.
 */
import { BREAKPOINT_TABLET } from "../../constants";
import { legacyRedirectData } from "../../utils/legacy-redirect-html";
import { LANDING_FREE_PAGES, LANDING_SKIPPED_KEY } from "./desktop-visitor";
import { LANDING_ATTRIBUTE } from "./landing-html";

export interface LandingDecisionData {
  /** `BREAKPOINT_TABLET` in em: the window must be at least this wide */
  breakpoint: number;
  /** sessionStorage key of "open here" (`LANDING_SKIPPED_KEY`) */
  skipKey: string;
  /** The attribute set on `<html>` (`LANDING_ATTRIBUTE`) */
  attribute: string;
  /** The build's default experience, "" for none (a build with bundled content) */
  fallback: string;
  /** The site's own top-level paths and the id rule – as the legacy redirect knows them – to read the path's experience */
  reserved: readonly string[];
  id: string;
  /** Pages a computer opens without the landing (`LANDING_FREE_PAGES`, #353) – the path's last segment */
  free: readonly string[];
}

/** The script's body: a function of (window, sessionStorage) returning whether the landing shows – a test runs it against a fake window */
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
  var segs = win.location.pathname.split("/").filter(Boolean);
  var first = null;
  if (segs.length) { try { first = decodeURIComponent(segs[0]); } catch (e) { first = null; } }
  var low = first === null ? "" : first.toLowerCase();
  var named = first !== null && new RegExp(D.id).test(first) && D.reserved.indexOf(low) < 0 && low.indexOf("workbox-") !== 0;
  var onDefault = !named || first === D.fallback;
  var last = segs.length ? segs[segs.length - 1].toLowerCase() : "";
  var free = D.free.indexOf(last) >= 0;
  var show = !standalone && !coarse && !mobile && wide && !skipped && onDefault && !free;
  if (show) win.document.documentElement.setAttribute(D.attribute, "");
  return show;
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
    free: LANDING_FREE_PAGES,
  };
};
