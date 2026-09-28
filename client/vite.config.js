import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { networkInterfaces } from 'os';
import { renderStaticSplash } from './src/utils/static-splash-html.ts';

// One version for app and content build (RULES.md #10). Read from package.json because
// npm_package_version is missing outside `npm run` (e.g. `npx vite`).
const APP_VERSION = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version;
// The content build's checksum: the service worker keeps one content cache per content build
const GAME_CONFIG = JSON.parse(readFileSync(resolve(import.meta.dirname, 'src/game.config.json'), 'utf8'));

/**
 * PWA: web app manifest + service worker (sw/service-worker.ts, precache list injected here).
 * Home-screen name: `book.title` from the game configuration (also the iOS title in index.html); black
 * background like the app.
 * Icons (public/assets/icons/, placeholders until the final app icon): "any" icons transparent (Chrome's app
 * list / install dialog), the maskable one on black (Android crops it to the launcher shape and fills the
 * rest), apple-touch-icon opaque (iOS requires it).
 */
function pwa() {
  const title = GAME_CONFIG.book?.title ?? 'Onion Skin & Crocodile Tears';
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
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (!net.internal && net.family === 'IPv4') {
        return net.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Static splash: the first onboarding step as plain HTML in index.html, rendered from the game configuration
 * (book fields, step timing) so it paints before any script runs. Mark alt text and loading label are
 * English; the app translates them once it runs.
 */
function staticSplash() {
  const read = (file) => JSON.parse(readFileSync(resolve(import.meta.dirname, file), 'utf8'));
  return {
    name: 'osct-static-splash',
    transformIndexHtml(html) {
      const config = read('src/game.config.json');
      const common = read('src/i18n/locales/en/common.json');
      return html.replace('<!--osct:static-splash-->', renderStaticSplash({
        book: config.book ?? {},
        steps: config.tutorial ?? [],
        markSrc: '/assets/ui/mark-the-page/scan.png',
        markAlt: common.markAlt,
        loadingLabel: common.loadingBook,
      }));
    },
  };
}

/**
 * Content file sizes (`virtual:osct-content-sizes`): every file under public/assets/content, by URL. Lets the
 * whole-book download (PreloaderService) show the total size up front and progress in bytes.
 */
function contentSizes() {
  const id = 'virtual:osct-content-sizes';
  const root = resolve(import.meta.dirname, 'public/assets/content');
  const walk = (dir, prefix) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(resolve(dir, entry.name), `${prefix}${entry.name}/`)
    : [[`${prefix}${entry.name}`, statSync(resolve(dir, entry.name)).size]]);
  return {
    name: 'osct-content-sizes',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (loaded) => (loaded === `\0${id}`
      ? `export default ${JSON.stringify(Object.fromEntries(walk(root, '/assets/content/')))};`
      : undefined),
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

export default defineConfig(({command,mode})=>{
  const localIP = command === 'serve' ? getLocalIP() : 'localhost';
  const port = 5173;
  // Dev server over https: phones only grant camera access on https (http works on localhost only).
  // Self-signed certificate, accepted once on the phone. `npm run dev:http` (mode "http") serves plain
  // http on localhost (e.g. automated browser checks). Builds are unaffected (the host serves https).
  const https = command === 'serve' && mode !== 'http';

  return {
  plugins: [staticSplash(), contentSizes(), xr8Engine(), ...pwa(), ...(https ? [basicSsl()] : [])],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: JSON.stringify(APP_VERSION),
    __VITE_CONTENT_HASH__: JSON.stringify(GAME_CONFIG.version?.hash ?? APP_VERSION),
    __VITE_SERVER_URL__: JSON.stringify(`${https ? 'https' : 'http'}://${localIP}:${port}`),
  },
  resolve: {
    tsconfigPaths: true, // tsconfig.json "paths" (built into Vite 8)
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '@shared': resolve(import.meta.dirname, '../shared'),
    }
  },
  server: {
    host: true, // Same as --host flag
    port: port,
    // Accounts API (server/): `npm run dev:api` serves it with PHP on port 8080
    proxy: { '/api': 'http://127.0.0.1:8080' },
    fs: {
      // shared/ (game configuration contract) lives next to client/
      allow: [resolve(import.meta.dirname), resolve(import.meta.dirname, '../shared')],
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
        // Built (hashed) files in assets/app/ – served with a long, immutable cache (public/_headers);
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
    include: ['src/**/*.{test,spec}.{js,ts}'],
    setupFiles: ['./src/test/setup.ts']
  }
}});