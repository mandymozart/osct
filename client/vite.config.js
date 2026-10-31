import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { resolve } from 'path';
import { defaultAllowedOrigins, defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { networkInterfaces } from 'os';
import { renderStaticSplash, SPLASH_STEP } from './src/utils/static-splash-html.ts';

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
 * Book data for the app shell (home-screen name, static splash). A CDN build takes it from the environment's
 * current content version on the CDN – it only shapes the first frame, the app renders the loaded content after that – and
 * falls back to a local content build, then to no book data. Without the CDN the local build is required.
 */
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
    return await get(`${contentBaseUrl}/${build}/game.config.json`);
  } catch (error) {
    console.warn(`[osct] content on ${contentBaseUrl} not readable (${error.message}) – app shell from the local content build or without book data`);
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
 * Home-screen name: `book.title` from the game configuration (also the iOS title in index.html); black
 * background like the app.
 * Icons (public/assets/icons/, placeholders until the final app icon): "any" icons transparent (Chrome's app
 * list / install dialog), the maskable one on black (Android crops it to the launcher shape and fills the
 * rest), apple-touch-icon opaque (iOS requires it).
 */
function pwa(shellConfig) {
  const title = shellConfig.book?.title ?? 'Onion Skin & Crocodile Tears';
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
 * Static splash: the onboarding's first step (the app's splash) as plain HTML in index.html, with the book's fields
 * from the game configuration, so it paints before any script runs. Mark alt text and loading label are
 * English; the app translates them once it runs.
 */
function staticSplash(config) {
  const read = (file) => JSON.parse(readFileSync(resolve(import.meta.dirname, file), 'utf8'));
  return {
    name: 'osct-static-splash',
    transformIndexHtml(html) {
      const common = read('src/i18n/locales/en/common.json');
      return html.replace('<!--osct:static-splash-->', renderStaticSplash({
        book: config.book ?? {},
        step: SPLASH_STEP,
        markSrc: '/assets/ui/mark-the-page/scan.png',
        markAlt: common.markAlt,
        loadingLabel: common.loadingBook,
      }));
    },
  };
}

/**
 * Content file sizes (`virtual:osct-content-sizes`): every file under public/assets/content, by URL. Lets the
 * whole-book download (PreloaderService) show the total size up front and progress in bytes. Empty in a CDN
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

export default defineConfig(async ({command,mode})=>{
  const localIP = command === 'serve' ? getLocalIP() : 'localhost';
  // Content CDN of the environment (client/.env.local or the deploy's environment); '' = bundled content
  const contentBaseUrl = (loadEnv(mode, import.meta.dirname, 'VITE_').VITE_CONTENT_BASE_URL ?? '').replace(/\/+$/, '');
  const shellConfig = await readShellConfig(contentBaseUrl);
  const port = 5173;
  // Dev server over https: phones only grant camera access on https (http works on localhost only).
  // Self-signed certificate, accepted once on the phone. `npm run dev:http` (mode "http") serves plain
  // http on localhost (e.g. automated browser checks). Builds are unaffected (the host serves https).
  const https = command === 'serve' && mode !== 'http';

  return {
  plugins: [
    staticSplash(shellConfig), gameConfigModule(contentBaseUrl), contentSizes(contentBaseUrl), xr8Engine(), ...pwa(shellConfig),
    contentFromCdn(contentBaseUrl), ...(https ? [basicSsl()] : []),
  ],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: JSON.stringify(APP_VERSION),
    // Service worker content cache: one per bundled content build; a CDN build keeps one cache and drops other versions
    __VITE_CONTENT_HASH__: JSON.stringify(contentBaseUrl ? 'cdn' : (shellConfig.version?.hash ?? APP_VERSION)),
    __VITE_CONTENT_BASE_URL__: JSON.stringify(contentBaseUrl), // the service worker (the app reads import.meta.env)
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
    // The editor's stage frame (#234) is an opaque origin: it loads the content's media with `Origin: null`
    cors: { origin: [defaultAllowedOrigins, 'null'] },
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