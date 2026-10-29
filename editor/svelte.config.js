import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The editor is a single-page app served at /editor next to the reader (Dockerfile, client/public/.htaccess): every
 * route renders in the browser (the sign-in gate, the instance's API), index.html is the fallback.
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
    paths: { base: '/editor' },
    // The engine and the content contract are source folders next to the app (agents/RULES.md #32)
    alias: {
      '@engine': '../engine/src',
      '@shared': '../shared',
    },
    serviceWorker: { register: false },
  },
};

export default config;
