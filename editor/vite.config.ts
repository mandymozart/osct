/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/** A source folder next to the app, as an absolute path with a trailing slash */
const sibling = (folder: string) => fileURLToPath(new URL(`../${folder}/`, import.meta.url));

// Dev server on 5175 (the reader runs on 5174); /api goes to the PHP dev API (`npm run dev:api` in client/).
export default defineConfig({
  plugins: [
    // SvelteKit 3 reads its configuration here. The editor is a single-page app served at
    // /editor next to the reader (Dockerfile, client/public/.htaccess): every route renders in the browser (the sign-in
    // gate, the instance's API), index.html is the fallback. src/lib is `#lib` (package.json "imports").
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ fallback: 'index.html' }),
      paths: { base: '/editor' },
      serviceWorker: { register: false },
      // An open tab asks every 5 minutes whether a new version is deployed (and on focus and visibility – Kit and
      // NewVersionBar.svelte); a new one shows the bar that offers the reload (#230)
      version: { pollInterval: 5 * 60_000 },
    }),
  ],
  // The engine (../engine) imports three from this app's node_modules: resolve it from here, not from the importer.
  // Monaco carries its own copy of DOMPurify (3.4.15, critical XSS advisories) and imports it by a relative path, so
  // the npm override alone would not reach the bundle: its import is sent to the npm package (overrides, ^3.4.17) (#158)
  // The engine and the content contract are source folders next to the app (agents/RULES.md #32), imported as
  // @engine/… and @shared/… – by the engine's own files too, which the editor's package.json "imports" cannot reach,
  // so they stay Vite aliases (with tsconfig.json paths) rather than SvelteKit's deprecated `alias` option (#157)
  resolve: {
    dedupe: ['three'],
    alias: [
      { find: /^\.\/dompurify\/dompurify\.js$/, replacement: 'dompurify' },
      { find: /^@engine\//, replacement: sibling('engine/src') },
      { find: /^@shared\//, replacement: sibling('shared') },
    ],
  },
  server: {
    port: 5175,
    strictPort: true,
    fs: { allow: ['..', '../engine', '../shared'] },
    proxy: {
      '/api': { target: process.env.OSCT_API_PROXY ?? 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  preview: { port: 5175, strictPort: true },
  test: {
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost/' } },
    include: ['src/**/*.test.ts'],
  },
});
