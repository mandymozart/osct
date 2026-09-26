/// <reference lib="webworker" />
/**
 * Service worker (PWA, 2026-09-26): the installed app starts from the phone's storage and works offline
 * for everything it has seen. Built by vite-plugin-pwa (injectManifest, vite.config.js) into
 * `dist/service-worker.js`; registered in production builds only (services/ServiceWorkerService.ts).
 *
 * - App shell (index.html, built files in assets/app/ incl. the three.js + MindAR chunks, UI images,
 *   sounds, icons): precached at install, one cache per build.
 * - Pages (navigations): always from the network while online, so a deploy shows at once; offline the
 *   precached index.html (it matches the precached files).
 * - Content (assets/content/: .mind, models, images, videos): cached when first used (the
 *   PreloaderService's fetches fill it) and served from the cache afterwards. One cache per content build
 *   (`version.hash`), older ones are dropped when a new worker takes over.
 * - A new worker takes over at once (no waiting for all tabs to close); a running page keeps its code.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { RangeRequestsPlugin } from "workbox-range-requests";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };
declare const __VITE_CONTENT_HASH__: string;

const CONTENT_CACHE_PREFIX = "osct-content-";
const CONTENT_CACHE = `${CONTENT_CACHE_PREFIX}${__VITE_CONTENT_HASH__.slice(0, 16)}`;
/** Waiting longer for index.html than this on a bad connection: start from the cached one */
const PAGE_TIMEOUT_SECONDS = 4;

self.skipWaiting();
clientsClaim();

// Before the precache route: "/" and "/index.html" are precached too, but pages come from the network first
registerRoute(({ request }) => request.mode === "navigate", new NetworkOnly({ networkTimeoutSeconds: PAGE_TIMEOUT_SECONDS }));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Content: first use from the network, then from the cache. Only complete (200) responses are stored –
// a video element's first range request (206) is not; the preloader's full fetch is. Range requests are
// answered from the stored file (Safari plays videos through range requests only).
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/content/"),
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

// Content of older builds
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CONTENT_CACHE_PREFIX) && key !== CONTENT_CACHE).map(key => caches.delete(key)),
    )),
  );
});
