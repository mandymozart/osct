/// <reference lib="webworker" />
/**
 * Service worker (PWA): the installed app starts from device storage and works offline
 * for everything it has seen. Built by vite-plugin-pwa (injectManifest, vite.config.js) into
 * `dist/service-worker.js`; registered in production builds only (services/ServiceWorkerService.ts).
 *
 * - App shell (index.html, built files in assets/app/ incl. the three.js chunk, the 8th Wall engine in
 *   assets/xr8/, UI images, sounds, icons): precached at install, one cache per build.
 * - Pages (navigations): always from the network while online, so a deploy shows at once; offline the
 *   precached index.html (it matches the precached files).
 * - Content (target images, models, images, videos – from the content CDN when the build has a content base
 *   URL, else assets/content/ of the app): cached when first used (the PreloaderService's fetches fill it) and
 *   served from the cache afterwards. Bundled content: one cache per content build (`version.hash`), older ones
 *   are dropped when a new worker takes over. CDN content: one cache; every content version is its own
 *   immutable folder (`<base>/<build>/`), and when `latest.json` names another version the entries of the other
 *   versions are dropped. `latest.json` is fetched network-first and kept, so the installed app starts offline
 *   with the last content it saw.
 * - A new worker takes over at once (no waiting for all tabs to close); a running page keeps its code.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import type { WorkboxPlugin } from "workbox-core/types";
import { RangeRequestsPlugin } from "workbox-range-requests";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };
declare const __VITE_CONTENT_HASH__: string;
declare const __VITE_CONTENT_BASE_URL__: string;

const CONTENT_CACHE_PREFIX = "osct-content-";
const CONTENT_CACHE = `${CONTENT_CACHE_PREFIX}${__VITE_CONTENT_HASH__.slice(0, 16)}`; // "cdn" in a CDN build
/** Content CDN base URL of this build ("" = content served with the app) */
const CONTENT_BASE_URL = __VITE_CONTENT_BASE_URL__.replace(/\/+$/, "");
/** Network timeout for index.html; after it, the precached copy is served */
const PAGE_TIMEOUT_SECONDS = 4;
/** Network timeout for the content configuration; after it, the last one seen is served */
const MANIFEST_TIMEOUT_SECONDS = 5;

self.skipWaiting();
clientsClaim();

// Must be registered before the precache route: "/" and "/index.html" are precached, but pages come from the network first
registerRoute(({ request }) => request.mode === "navigate", new NetworkOnly({ networkTimeoutSeconds: PAGE_TIMEOUT_SECONDS }));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Content: first use from the network, then from the cache. Only complete (200) responses are stored –
// a video element's first range request (206) is not; the preloader's full fetch is. Range requests are
// answered from the stored file (Safari plays videos through range requests only).
const isContent = ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }): boolean =>
  CONTENT_BASE_URL ? url.href.startsWith(`${CONTENT_BASE_URL}/`) : sameOrigin && url.pathname.startsWith("/assets/content/");

/** Stored under the URL without its query (`?t=` changes every minute), so the offline copy is found */
const withoutQuery: WorkboxPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => {
    const url = new URL(request.url);
    url.search = "";
    return url.href;
  },
};

/** When latest.json names another version, the cached files of every other version go */
const dropOtherVersions: WorkboxPlugin = {
  cacheDidUpdate: async ({ cacheName, request }) => {
    const cache = await caches.open(cacheName);
    const stored = await cache.match(request.url.split("?")[0]);
    const build = stored ? ((await stored.json()) as { build?: unknown }).build : undefined;
    if (typeof build !== "string") return;
    const current = `${CONTENT_BASE_URL}/${build}/`;
    const versionFile = /^[0-9a-f]{12}\//;
    const others = (await cache.keys()).filter(key =>
      key.url.startsWith(`${CONTENT_BASE_URL}/`) && versionFile.test(key.url.slice(CONTENT_BASE_URL.length + 1)) && !key.url.startsWith(current));
    await Promise.all(others.map(key => cache.delete(key)));
  },
};

// latest.json changes with every content sync: from the network, the stored copy only when offline
if (CONTENT_BASE_URL) {
  registerRoute(
    ({ url }) => `${url.origin}${url.pathname}` === `${CONTENT_BASE_URL}/latest.json`,
    new NetworkFirst({
      cacheName: CONTENT_CACHE,
      networkTimeoutSeconds: MANIFEST_TIMEOUT_SECONDS,
      plugins: [new CacheableResponsePlugin({ statuses: [200] }), withoutQuery, dropOtherVersions],
    }),
  );
}

registerRoute(
  isContent,
  new CacheFirst({
    cacheName: CONTENT_CACHE,
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new RangeRequestsPlugin()],
  }),
);

// Offline page load: the precached app shell (the app routes itself, like Netlify's `/* /index.html 200`)
setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") return (await matchPrecache("/index.html")) ?? Response.error();
  return Response.error();
});

// Drop content caches of older builds
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CONTENT_CACHE_PREFIX) && key !== CONTENT_CACHE).map(key => caches.delete(key)),
    )),
  );
});
