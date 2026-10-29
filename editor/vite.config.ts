/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Dev server on 5175 (the reader runs on 5174); /api goes to the PHP dev API (`npm run dev:api` in client/).
export default defineConfig({
  plugins: [sveltekit()],
  // The engine (../engine) imports three from this app's node_modules: resolve it from here, not from the importer.
  // Monaco carries its own copy of DOMPurify (3.4.15, critical XSS advisories) and imports it by a relative path, so
  // the npm override alone would not reach the bundle: its import is sent to the npm package (overrides, ^3.4.17) (#158)
  resolve: {
    dedupe: ['three'],
    alias: [{ find: /^\.\/dompurify\/dompurify\.js$/, replacement: 'dompurify' }],
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
