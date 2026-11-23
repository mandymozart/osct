import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { networkInterfaces } from 'os';
import { ONBOARDING_ICON_SRC, renderStaticSplash, SPLASH_STEP, splashFields } from './src/utils/static-splash-html.ts';
import { fontBaseUrl, renderFontFaces } from './src/utils/font-face-html.ts';
import { legacyRedirectData, renderLegacyRedirect } from './src/utils/legacy-redirect-html.ts';
import { manifestLinkData, renderManifestLink, withoutBuildManifestLink } from './src/utils/manifest-link-html.ts';
import { landingDecisionData, renderLandingDecision } from './src/components/desktop-landing/landing-decision-html.ts';
import { fillTexts, landingImages, renderStaticLanding } from './src/components/desktop-landing/landing-html.ts';
import { LANDING_CONFIG } from './src/components/desktop-landing/landing-config.ts';

// One version for app and content build (RULES.md #10). Read from package.json because
// npm_package_version is missing outside `npm run` (e.g. `npx vite`).
const APP_VERSION = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version;
// The game configuration (content build output, not in git). With a content CDN (`VITE_CONTENT_BASE_URL`) the app
// build reads no content: the app loads it at runtime (docs/content-cdn.md). Without one it is bundled (dev
// server, tests, hosts without the CDN) and has to be built first.
const GAME_CONFIG_FILE = resolve(import.meta.dirname, 'src/game.config.json');
const MISSING_CONTENT = 'client/src/game.config.json is missing – build the content first: `npm run content` (in client/), ' +
  'or build against the content CDN (VITE_CONTENT_BASE_URL)';
const readLocalGameConfig = () => (existsSync(GAME_CONFIG_FILE) ? JSON.parse(readFileSync(GAME_CONFIG_FILE, 'utf8')) : null);

/**
 * Experience data for the app shell (home-screen name, static splash). A CDN build takes it from the current content
 * version of the instance's default experience on the CDN (`<base>/<VITE_EXPERIENCE>/`, #87) – it only shapes the first
 * frame, the app renders the loaded content after that – and falls back to a local content build, then to no experience
 * data. Without the CDN the local build is required.
 */
/** Where the content the build read lives on the CDN (`<base>/<experience>/<build>`, '' for the local build): its file URLs (the static landing's images) */
let shellContentBase = '';

async function readShellConfig(contentBaseUrl) {
  if (!contentBaseUrl) {
    const local = readLocalGameConfig();
    if (!local) throw new Error(MISSING_CONTENT);
    return local;
  }
  try {
    const get = async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    };
    const { build } = await get(`${contentBaseUrl}/latest.json?t=${Date.now()}`);
    const config = await get(`${contentBaseUrl}/${build}/game.config.json`);
    shellContentBase = `${contentBaseUrl}/${build}`;
    return config;
  } catch (error) {
    console.warn(`[osct] content on ${contentBaseUrl} not readable (${error.message}) – app shell from the local content build or without experience data`);
  }
  return readLocalGameConfig() ?? {};
}

/**
 * The bundled game configuration (`virtual:osct-game-config`, imported only by utils/game-config.ts): the
 * local content build, or `null` in a CDN build (the app loads the content at runtime).
 */
function gameConfigModule(contentBaseUrl) {
  const id = 'virtual:osct-game-config';
  return {
    name: 'osct-game-config',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loaded) {
      if (loaded !== `\0${id}`) return undefined;
      if (contentBaseUrl) return 'export default null;';
      if (!existsSync(GAME_CONFIG_FILE)) throw new Error(MISSING_CONTENT);
      this.addWatchFile(GAME_CONFIG_FILE);
      return `export default ${readFileSync(GAME_CONFIG_FILE, 'utf8')};`;
    },
  };
}

/**
 * PWA: web app manifest + service worker (sw/service-worker.ts, precache list injected here).
 * Home-screen name: `experience.title` from the game configuration (also the iOS title in index.html); black
 * background like the app.
 * Icons (public/assets/icons/, placeholders until the final app icon): "any" icons transparent (Chrome's app
 * list / install dialog), the maskable one on black (Android crops it to the launcher shape and fills the
 * rest), apple-touch-icon opaque (iOS requires it).
 */
function pwa(shellConfig) {
  const title = shellConfig.experience?.title ?? 'Onion Skin & Crocodile Tears';
  const appTitle = {
    name: 'osct-app-title',
    transformIndexHtml: (html) => html.replace('%OSCT_APP_TITLE%', title.replace(/&/g, '&amp;')),
  };
  return [appTitle, VitePWA({
    strategies: 'injectManifest',
    srcDir: 'sw',
    filename: 'service-worker.ts',
    includeManifestIcons: false, // already in the glob below
    injectRegister: false, // services/ServiceWorkerService.ts registers it after page load
    manifest: {
      id: '/',
      name: title,
      short_name: title, // the full title; phones may truncate it on the home screen
      description: "Augmented reality companion to Kévin Bray's book Onion Skin & Crocodile Tears (Building Fictions).",
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#000000',
      theme_color: '#000000',
      icons: [
        { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/assets/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      // App shell only: content (assets/content/) is cached on first use; dev tools (assets/deps/) never
      globPatterns: [
        'index.html',
        'assets/app/**/*.{js,css}',
        'assets/{ui,illustrations,sounds,icons}/**/*',
        'assets/{bf.svg,favicon.ico}',
        'assets/xr8/*.js', // the tracking engine (unhashed names: the precache manifest carries a revision)
      ],
      // Hashed file names: no cache-busting query, the immutable HTTP cache can answer
      dontCacheBustURLsMatching: /^assets\/app\//,
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // the engine's xr-tracking.js is ~3.9 MB (1.2 MB gzip)
    },
    devOptions: { enabled: false },
  })];
}

// Get local IP address
/**
 * The address a phone on the same Wi-Fi reaches this machine at (the dev overlay's QR code). Virtual adapters
 * (WSL, Hyper-V, Docker, VirtualBox – 172.x and names like "vEthernet") come first in the interface list on
 * Windows, so the private 192.168.x / 10.x address of a physical adapter wins over them.
 */
function getLocalIP() {
  const nets = networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.internal || net.family !== 'IPv4') continue;
      const virtual = /vethernet|wsl|hyper-v|docker|virtualbox|vmware/i.test(name) || /^172\.(1[6-9]|2\d|3[01])\./.test(net.address);
      const lan = /^(192\.168\.|10\.)/.test(net.address);
      candidates.push({ address: net.address, rank: (lan ? 0 : 1) + (virtual ? 2 : 0) });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address ?? 'localhost';
}
/**
 * Static splash: the onboarding's first step (the app's splash) as plain HTML in index.html, with the experience's fields
 * from the game configuration, so it paints before any script runs. The loading label is English; the app
 * translates it once it runs.
 */
function staticSplash(config) {
  const read = (file) => JSON.parse(readFileSync(resolve(import.meta.dirname, file), 'utf8'));
  return {
    name: 'osct-static-splash',
    transformIndexHtml(html) {
      const common = read('src/i18n/locales/en/common.json');
      return html.replace('<!--osct:static-splash-->', renderStaticSplash({
        fields: splashFields(config.experience),
        step: SPLASH_STEP,
        iconSrc: ONBOARDING_ICON_SRC,
        loadingLabel: common.loadingExperience,
      }));
    },
  };
}

/**
 * The legacy redirect (#343, src/utils/legacy-redirect-html.ts): an inline script, first in the head, that moves an
 * address without an experience (`/?s=bk1` → `/osct/`) before the app's bundle is even fetched.
 */
function legacyRedirect(experience) {
  return {
    name: 'osct-legacy-redirect',
    transformIndexHtml: (html) => html.replace('<!--osct:legacy-redirect-->', renderLegacyRedirect(legacyRedirectData(experience))),
  };
}

/**
 * A manifest per experience (#343, src/utils/manifest-link-html.ts): an inline script after the legacy redirect links
 * the manifest of the experience the address names (`/api/experiences/<id>/manifest.webmanifest`, the default too);
 * vite-plugin-pwa's own `<link rel="manifest">` is taken out after it wrote it (`enforce`/`order: 'post'`, listed after it), so the
 * browser never sees the build's root manifest on an experience's page. The build's manifest file stays for an address
 * that names no experience.
 */
function manifestLink() {
  return {
    name: 'osct-manifest-link',
    enforce: 'post', // vite-plugin-pwa's build plugin is a post plugin; listed after it, this runs after it
    transformIndexHtml: {
      order: 'post',
      handler: (html) => withoutBuildManifestLink(html).replace('<!--osct:manifest-link-->', renderManifestLink(manifestLinkData())),
    },
  };
}

/**
 * The desktop landing in the skeleton (#343, src/components/desktop-landing/landing-decision-html.ts and landing-html.ts):
 * an inline script after the legacy redirect decides at once whether this is a computer on the default experience's
 * path (`<html data-osct-landing>`), and the landing page itself is written into the body from the build's game
 * configuration (English texts, the targets' images from the content the build read) – so a computer sees the landing,
 * not the phone's splash, before the bundle has loaded. `<desktop-landing>` takes over when it arrives.
 */
function staticLanding(experience, config, contentBase) {
  const read = (file) => JSON.parse(readFileSync(resolve(import.meta.dirname, file), 'utf8'));
  return {
    name: 'osct-static-landing',
    transformIndexHtml(html) {
      const fields = splashFields(config.experience);
      const url = (path) => (contentBase && path.startsWith('/assets/content/') ? `${contentBase}${path}` : path);
      return html
        .replace('<!--osct:landing-decision-->', renderLandingDecision(landingDecisionData(experience)))
        .replace('<!--osct:static-landing-->', renderStaticLanding({
          ...LANDING_CONFIG,
          texts: fillTexts(read('src/i18n/locales/en/landing.json'), { title: fields.title, author: fields.author }),
          title: fields.title,
          author: fields.author,
          publisher: fields.publisher,
          images: landingImages(config, url),
          markSrc: ONBOARDING_ICON_SRC,
          privacyHref: experience ? `/${experience}/privacy` : '/privacy',
        }));
    },
  };
}

/**
 * The design font (ABC Areal, src/utils/font-face-html.ts): `@font-face` rules for the font folder on the CDN
 * (`VITE_FONT_BASE_URL`, default the shared folder; empty = no web font), written into index.html before the
 * stylesheet. The files are licensed and never part of the build.
 */
function designFont(baseUrl) {
  return {
    name: 'osct-design-font',
    transformIndexHtml: (html) => html.replace('<!--osct:font-->', renderFontFaces(baseUrl)),
  };
}

/**
 * Content file sizes (`virtual:osct-content-sizes`): every file under public/assets/content, by URL. Lets the
 * whole-experience download (PreloaderService) show the total size up front and progress in bytes. Empty in a CDN
 * build (the sizes come with the content: files.json).
 */
function contentSizes(contentBaseUrl) {
  const id = 'virtual:osct-content-sizes';
  const root = resolve(import.meta.dirname, 'public/assets/content');
  const walk = (dir, prefix) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(resolve(dir, entry.name), `${prefix}${entry.name}/`)
    : [[`${prefix}${entry.name}`, statSync(resolve(dir, entry.name)).size]]);
  return {
    name: 'osct-content-sizes',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (loaded) => (loaded === `\0${id}`
      ? `export default ${JSON.stringify(contentBaseUrl || !existsSync(root) ? {} : Object.fromEntries(walk(root, '/assets/content/')))};`
      : undefined),
  };
}

/**
 * Content from the CDN (`VITE_CONTENT_BASE_URL`, docs/content-cdn.md): the app loads the content at runtime, so the
 * built site does not ship the content copy (`assets/content/`) – the server serves the app shell and the API only.
 * Without the base URL the content stays in the build (dev server, tests, hosts without the CDN).
 */
function contentFromCdn(baseUrl) {
  return {
    name: 'osct-content-from-cdn',
    apply: 'build',
    closeBundle() {
      if (!baseUrl) return;
      rmSync(resolve(import.meta.dirname, 'dist/assets/content'), { recursive: true, force: true });
      console.log(`
Content served from ${baseUrl} – assets/content/ removed from the build.`);
    },
  };
}

/**
 * The 8th Wall engine (`@8thwall/engine`, MIT – the image tracking, ar/xr8.ts): its prebuilt files are served as
 * they are from `assets/xr8/` (a classic script plus a chunk it imports; not bundled), with its LICENSE (MIT
 * asks for it next to the copies). Dev: from node_modules; build: copied. Precached with the app shell (pwa()),
 * so AR works offline.
 */
function xr8Engine() {
  const engine = resolve(import.meta.dirname, 'node_modules/@8thwall/engine');
  const files = { 'xr.js': 'dist/xr.js', 'xr-tracking.js': 'dist/xr-tracking.js', LICENSE: 'LICENSE' };
  return {
    name: 'osct-xr8-engine',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].replace(/^\/assets\/xr8\//, '');
        if (!name || !(name in files) || !req.url.startsWith('/assets/xr8/')) return next();
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/plain');
        res.end(readFileSync(resolve(engine, files[name])));
      });
    },
    generateBundle() {
      Object.entries(files).forEach(([name, file]) =>
        this.emitFile({ type: 'asset', fileName: `assets/xr8/${name}`, source: readFileSync(resolve(engine, file)) }));
    },
  };
}

/**
 * The documentation site (`public/docs/`, served at `/docs/`): its pages are folders with an `index.html`, which the
 * web server answers for the folder's address (`/docs/guide/`). The dev and preview servers answer a folder with the
 * app's own page instead, so here a folder under `/docs/` gets its `index.html`.
 */
function docsIndex() {
  const pages = (root) => (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (/^\/docs\/([\w-]+\/)*$/.test(path) && existsSync(resolve(root, `.${path}index.html`))) {
      req.url = `${path}index.html${query === undefined ? '' : `?${query}`}`;
    }
    next();
  };
  return {
    name: 'osct-docs-index',
    configureServer(server) { server.middlewares.use(pages(resolve(import.meta.dirname, 'public'))); },
    configurePreviewServer(server) { server.middlewares.use(pages(resolve(server.config.root, server.config.build.outDir))); },
  };
}

export default defineConfig(async ({command,mode})=>{
  const localIP = command === 'serve' ? getLocalIP() : 'localhost';
  // Content CDN of the environment (client/.env.local or the deploy's environment); '' = bundled content
  const viteEnv = loadEnv(mode, import.meta.dirname, 'VITE_');
  const contentBaseUrl = (viteEnv.VITE_CONTENT_BASE_URL ?? '').replace(/\/+$/, '');
  // The instance's default experience: its store below the environment's CDN URL (src/utils/experience-path.ts, #87)
  const experience = (viteEnv.VITE_EXPERIENCE ?? '').trim();
  if (contentBaseUrl && !experience) {
    throw new Error('VITE_EXPERIENCE is not set – a build against the content CDN (VITE_CONTENT_BASE_URL) names the experience it opens (docs/content-cdn.md)');
  }
  const shellConfig = await readShellConfig(contentBaseUrl && `${contentBaseUrl}/${encodeURIComponent(experience)}`);
  // The design font's folder (src/utils/font-face-html.ts); the service worker caches what it loads from there
  const fontUrl = fontBaseUrl(loadEnv(mode, import.meta.dirname, 'VITE_').VITE_FONT_BASE_URL);
  const port = 5173;
  // Dev server over https: phones only grant camera access on https (http works on localhost only).
  // Self-signed certificate, accepted once on the phone. `npm run dev:http` (mode "http") serves plain
  // http on localhost (e.g. automated browser checks). Builds are unaffected (the host serves https).
  const https = command === 'serve' && mode !== 'http';

  return {
  plugins: [
    legacyRedirect(experience), staticLanding(experience, shellConfig, shellContentBase), designFont(fontUrl), staticSplash(shellConfig), gameConfigModule(contentBaseUrl), contentSizes(contentBaseUrl), xr8Engine(), ...pwa(shellConfig),
    manifestLink(), contentFromCdn(contentBaseUrl), docsIndex(), ...(https ? [basicSsl()] : []),
  ],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: JSON.stringify(APP_VERSION),
    // Service worker content cache: one per bundled content build; a CDN build keeps one cache and drops other versions
    __VITE_CONTENT_HASH__: JSON.stringify(contentBaseUrl ? 'cdn' : (shellConfig.version?.hash ?? APP_VERSION)),
    __VITE_CONTENT_BASE_URL__: JSON.stringify(contentBaseUrl), // the service worker (the app reads import.meta.env)
    __VITE_FONT_BASE_URL__: JSON.stringify(fontUrl), // the service worker: font files are kept for offline use
    // The dev server's Wi-Fi address for the debug overlay's QR code; empty in builds (the page's own origin then)
    __VITE_SERVER_URL__: JSON.stringify(command === 'serve' ? `${https ? 'https' : 'http'}://${localIP}:${port}` : ''),
  },
  // The dev server serves the TypeScript transform as is: static class fields become `static {}` blocks, which Safari
  // before 16.4 cannot parse (iPhone 7 = iOS 15) – lowered for the dev server too, as the build does
  ...(command === 'serve' ? { oxc: { target: 'safari15' } } : {}),
  resolve: {
    tsconfigPaths: true, // tsconfig.json "paths" (built into Vite 8)
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '@shared': resolve(import.meta.dirname, '../shared'),
      '@engine': resolve(import.meta.dirname, '../engine/src'),
    }
  },
  server: {
    host: true, // Same as --host flag
    port: port,
    // Accounts API (server/): `npm run dev:api` serves it with PHP on port 8080
    proxy: { '/api': 'http://127.0.0.1:8080' },
    fs: {
      // shared/ (game configuration contract) lives next to client/
      allow: [resolve(import.meta.dirname), resolve(import.meta.dirname, '../shared'), resolve(import.meta.dirname, '../engine')],
    },
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // terser minifies a few percent smaller than esbuild; two passes
    minify: 'terser',
    terserOptions: { compress: { passes: 2 } },
    // The three.js chunk (~600 kB) is large by nature and loads lazily
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html')
      },
      output: {
        // Keep @license headers in the chunks (Rolldown drops them by default)
        comments: { legal: true },
        // The AR code (only reached through import("./ar"), loaded on the first scan): three.js in its own chunk
        manualChunks: (id) => {
          if (id.includes('/node_modules/three/')) return 'three';
        },
        // Built (hashed) files in assets/app/ – served with a long, immutable cache (server/docker/apache.conf);
        // assets/ itself also holds the unhashed content (public/assets/content)
        entryFileNames: 'assets/app/[name]-[hash].js',
        chunkFileNames: 'assets/app/[name]-[hash].js',
        assetFileNames: 'assets/app/[name]-[hash][extname]',
      }
    }
  },
  optimizeDeps: {
    include: [],
    force: true
  },
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/*.test.ts',
      ],
      reportsDirectory: './coverage'
    },
    globals: true,
    // The engine's tests run here too (engine/ has no test runner of its own; the reader is its first app)
    include: ['src/**/*.{test,spec}.{js,ts}', '../engine/src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts']
  }
}});