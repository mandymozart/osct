/**
 * The legacy redirect as an inline script in index.html (#343, Tilman 2026-11-22: "can we also fix this so it will be
 * loaded before the entire app needs to load? in the skeleton html?"). The first thing the page runs, before the app's
 * bundle is fetched: an address without an experience (`/?s=bk1`, `/?s=d1`, `/scene/s1`, `/x/demo/…`, `/`) moves to
 * its experience with `history.replaceState` – the same rules as `legacyRedirect` (utils/experience-path.ts, which
 * main.ts still runs and then finds nothing to do). The data (reserved paths, source rules, the default experience) is
 * written in at build time from `shared/api/experience-paths.ts`; a test keeps the two equal case by case.
 * Plain ES5-ish JavaScript, no imports, wrapped in try/catch: a failure leaves the address to the app.
 * Imports are relative (no aliases): vite.config.js loads this file.
 */
import { RESERVED_PATHS, SOURCE_EXPERIENCES } from "../../../shared/api/experience-paths";
import { ID_PATTERN } from "../../../shared/api/rules";

export interface LegacyRedirectData {
  /** The site's own top-level paths (`RESERVED_PATHS`) */
  reserved: readonly string[];
  /** `SOURCE_EXPERIENCES` as regex sources */
  sources: ReadonlyArray<{ source: string; experience: string }>;
  /** The id rule (`EXPERIENCE_NAME`) as a regex source */
  id: string;
  /** The build's default experience (`VITE_EXPERIENCE`), "" for none */
  fallback: string;
  /** localStorage key of the experience opened last (`LAST_EXPERIENCE_KEY`) */
  lastKey: string;
  /** The old prefix segment (`LEGACY_SEGMENT`, "x") */
  legacy: string;
  /** The arrival's source parameter ("s") */
  param: string;
}

/** The script's body: a function of (location, history, storage) so a test can run it against a fake window */
export const legacyRedirectSource = (data: LegacyRedirectData): string => `(function (loc, hist, store) {
  var D = ${JSON.stringify(data)};
  var idRule = new RegExp(D.id);
  var dec = function (s) { try { return decodeURIComponent(s); } catch (e) { return null; } };
  var reserved = function (s) { var l = s.toLowerCase(); return D.reserved.indexOf(l) >= 0 || l.indexOf("workbox-") === 0; };
  var isExp = function (s) { return s !== null && idRule.test(s) && !reserved(s); };
  var segs = loc.pathname.split("/").filter(Boolean);
  var first = segs.length ? dec(segs[0]) : null;
  if (isExp(first)) return null;
  var tail = loc.search + loc.hash;
  var target = null;
  if (first === D.legacy && segs.length >= 2) {
    var named = dec(segs[1]);
    if (isExp(named)) target = "/" + encodeURIComponent(named) + "/" + segs.slice(2).join("/") + tail;
  }
  if (target === null) {
    var m = new RegExp("[?&]" + D.param + "=([^&#]*)").exec(loc.search);
    var src = m ? (dec(m[1].replace(/\\+/g, " ")) || "").trim().toLowerCase() : "";
    var bySource = null;
    for (var i = 0; src && i < D.sources.length; i++) if (new RegExp(D.sources[i].source).test(src)) { bySource = D.sources[i].experience; break; }
    var last = null;
    try { last = store ? store.getItem(D.lastKey) : null; } catch (e) { last = null; }
    if (!(last && isExp(last))) last = null;
    var exp = bySource || (segs.length === 0 ? last : null) || D.fallback || null;
    if (!exp) return null;
    var route = segs.length === 0 ? "/" : loc.pathname.replace(/^\\/+/, "/");
    target = "/" + encodeURIComponent(exp) + route + tail;
  }
  hist.replaceState(hist.state, "", target);
  return target;
})`;

/** The `<script>` for index.html's head, first: runs at once against the real window */
export const renderLegacyRedirect = (data: LegacyRedirectData): string =>
  `<script>try { var __osctStore = null; try { __osctStore = window.localStorage; } catch (e) {} ${legacyRedirectSource(data)}(window.location, window.history, __osctStore); } catch (e) {}</script>`;

/** The build's data: from shared/ and the build's default experience (`LEGACY_SEGMENT`, `LAST_EXPERIENCE_KEY` and the
 *  source parameter repeat utils/experience-path.ts's – a test keeps them equal) */
export const legacyRedirectData = (fallback: string): LegacyRedirectData => ({
  reserved: [...RESERVED_PATHS],
  sources: SOURCE_EXPERIENCES.map(rule => ({ source: rule.source.source, experience: rule.experience })),
  id: ID_PATTERN.source,
  fallback: fallback.trim(),
  lastKey: "osct-experience",
  legacy: "x",
  param: "s",
});
