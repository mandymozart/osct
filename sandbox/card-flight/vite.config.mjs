import { resolve } from 'path';

/**
 * The card flight sandbox (README.md, #285): a dev-only page, served by the client's vite – its three.js, the engine's
 * `CardFlight`. Started from the repository root:
 * `node client/node_modules/vite/bin/vite.js --config sandbox/card-flight/vite.config.mjs`. No part of any build.
 */
const here = import.meta.dirname;
const repo = resolve(here, '../..');
const client = resolve(repo, 'client');

export default {
  root: here,
  cacheDir: resolve(client, 'node_modules/.vite-card-flight-sandbox'),
  resolve: {
    alias: {
      '@shared': resolve(repo, 'shared'),
      '@engine': resolve(repo, 'engine/src'),
      three: resolve(client, 'node_modules/three'),
    },
  },
  server: {
    host: true,
    port: 5181,
    strictPort: true,
    fs: { allow: [repo] },
  },
};
