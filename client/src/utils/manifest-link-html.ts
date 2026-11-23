/**
 * The web app manifest link as an inline script in index.html's head (#343, Tilman 2026-11-22: "ja, ein eigenes
 * manifest pro experience why not"). Right after the legacy redirect – the address then names its experience –, before
 * the browser reads any manifest: every experience links its own, the default too
 * (`/api/experiences/<id>/manifest.webmanifest`, server ReaderManifest: `id`, `start_url`, `scope` `/<id>/`), so an
 * install from `/osct/` or `/demo/` installs that experience. Only an address that names none (a build with bundled
 * content, a bare `/` nothing moved) links the build's own `/manifest.webmanifest` (id and start `/` – the app installed
 * before). The build's link (vite-plugin-pwa writes one) is taken out of index.html (vite.config.js), so the browser
 * only ever sees this one. `utils/experience-meta.ts` keeps it pointing at the experience the address names; a test
 * keeps the two equal case by case.
 * Plain ES5-ish JavaScript, no imports, wrapped in try/catch: a failure leaves the manifest link to the app.
 * Imports are relative: vite.config.js loads this file.
 */
import { legacyRedirectData } from "./legacy-redirect-html";

export interface ManifestLinkData {
  /** The site's own top-level paths and the id rule, as the legacy redirect knows them */
  reserved: readonly string[];
  id: string;
  /** The API's base (`API_URL`) */
  api: string;
  /** The build's manifest (vite-plugin-pwa's `manifestFilename` at the root) */
  root: string;
}

/** The build's manifest file, as vite-plugin-pwa writes it */
export const ROOT_MANIFEST = "/manifest.webmanifest";

/** The script's body: a function of (location, document) returning the linked URL – a test runs it against a fake document */
export const manifestLinkSource = (data: ManifestLinkData): string => `(function (loc, doc) {
  var D = ${JSON.stringify(data)};
  var segs = loc.pathname.split("/").filter(Boolean);
  var first = null;
  if (segs.length) { try { first = decodeURIComponent(segs[0]); } catch (e) { first = null; } }
  var low = first === null ? "" : first.toLowerCase();
  var named = first !== null && new RegExp(D.id).test(first) && D.reserved.indexOf(low) < 0 && low.indexOf("workbox-") !== 0;
  var href = named ? D.api + "/experiences/" + encodeURIComponent(first) + "/manifest.webmanifest" : D.root;
  var link = doc.createElement("link");
  link.rel = "manifest";
  link.href = href;
  doc.head.appendChild(link);
  return href;
})`;

/** The `<script>` for index.html's head, after the legacy redirect */
export const renderManifestLink = (data: ManifestLinkData): string =>
  `<script>try { ${manifestLinkSource(data)}(window.location, document); } catch (e) {}</script>`;

/** The build's data (`api` repeats services/ApiService.ts's `API_URL` – a test keeps them equal) */
export const manifestLinkData = (): ManifestLinkData => {
  const paths = legacyRedirectData("");
  return { reserved: paths.reserved, id: paths.id, api: "/api", root: ROOT_MANIFEST };
};

/** Takes vite-plugin-pwa's `<link rel="manifest">` out of the built page: the inline script links the manifest */
export const withoutBuildManifestLink = (html: string): string =>
  html.replace(/<link rel="manifest" href="[^"]*"[^>]*>/g, "");
