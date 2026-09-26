import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { networkInterfaces } from 'os';
import { renderStaticSplash } from './src/utils/static-splash-html';

// One version for app and content build (agents/RULES.md #10). Read directly:
// npm_package_version is missing outside `npm run` (e.g. `npx vite`).
const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;
// The content build's checksum: the service worker keeps one content cache per content build
const GAME_CONFIG = JSON.parse(readFileSync(resolve(__dirname, 'src/game.config.json'), 'utf8'));

/**
 * PWA (2026-09-26): web app manifest + service worker (sw/service-worker.ts, precache list injected here).
 * Home-screen name: `book.title` from the game configuration (also the iOS title in index.html); black like
 * the app.
 * Icons: placeholders made from Mark the Page (public/assets/icons/) until the final app icon arrives.
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
    injectRegister: false, // services/ServiceWorkerService.ts registers it (after the app is ready)
    manifest: {
      id: '/',
      name: title,
      short_name: title, // Tilman 2026-09-27 – phones may cut it short on the home screen
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
      // App shell only – content (assets/content/) is cached when used; dev tools (assets/deps/) never
      globPatterns: [
        'index.html',
        'assets/app/**/*.{js,css}',
        'assets/{ui,illustrations,sounds,icons}/**/*',
        'assets/{bf.svg,favicon.ico}',
      ],
      // Hashed file names: no cache-busting query, the immutable HTTP cache can answer
      dontCacheBustURLsMatching: /^assets\/app\//,
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // the MindAR chunk (TF.js) is ~1.8 MB
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
 * Static splash (Phase 9): the first onboarding step as plain HTML in index.html, from the game configuration
 * (book fields, step timing), so it paints before any script. English Mark alt / loading label (the app
 * translates them once it runs).
 */
function staticSplash() {
  const read = (file) => JSON.parse(readFileSync(resolve(__dirname, file), 'utf8'));
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

export default defineConfig(({command,mode})=>{
  const localIP = command === 'serve' ? getLocalIP() : 'localhost';
  const port = 5173; // Default Vite port, change if you're using a custom port
  // Dev server over https (Tilman): the camera needs https on a phone – http only works on localhost.
  // Self-signed certificate, the phone asks once to accept it. `npm run dev:http` (mode "http") for plain
  // http on localhost (e.g. automated browser checks). Builds are unaffected (the host serves https).
  const https = command === 'serve' && mode !== 'http';

  return {
  plugins: [tsconfigPaths(), staticSplash(), ...pwa(), ...(https ? [basicSsl()] : [])],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: JSON.stringify(APP_VERSION),
    __VITE_CONTENT_HASH__: JSON.stringify(GAME_CONFIG.version?.hash ?? APP_VERSION),
    __VITE_SERVER_URL__: JSON.stringify(`${https ? 'https' : 'http'}://${localIP}:${port}`),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared'),
      // TF.js (inside MindAR) imports it for Node.js only (src/vendor/mind-ar/node-fetch-stub.js)
      'node-fetch': resolve(__dirname, 'src/vendor/mind-ar/node-fetch-stub.js'),
    }
  },
  server: {
    host: true, // Same as --host flag
    port: port,
    fs: {
      // shared/ (game configuration contract) lives next to client/
      allow: [resolve(__dirname), resolve(__dirname, '../shared')],
    },
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // terser minifies a few percent smaller than esbuild (Lighthouse "Minify JavaScript", 2026-09-26);
    // two passes, the inlined MindAR worker and TF.js shader strings stay as they are
    minify: 'terser',
    terserOptions: { compress: { passes: 2 } },
    // The AR chunks (three.js ~600 kB, MindAR with TF.js ~1.8 MB) are large by nature and load lazily
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        // The AR code (only reached through import("./ar"), loaded on the first scan): three.js and MindAR
        // (TF.js) in two chunks that download in parallel
        manualChunks: (id) => {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/src/vendor/mind-ar/')) return 'mindar';
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