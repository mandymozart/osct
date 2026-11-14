import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';

/**
 * The reveal sandbox (README.md): a dev-only page, served by the client's vite – its three.js, its engine sources.
 * Started from the repository root: `node client/node_modules/vite/bin/vite.js --config sandbox/reveal/vite.config.mjs`.
 * No part of the reader's or the editor's build.
 */
const here = import.meta.dirname;
const repo = resolve(here, '../..');
const client = resolve(repo, 'client');
/** Models stay out of git: the ignored folder next to this file, or a folder named by OSCT_SANDBOX_MODELS */
const modelsDir = process.env.OSCT_SANDBOX_MODELS ? resolve(process.env.OSCT_SANDBOX_MODELS) : resolve(here, 'models');

/** `/models/index.json` lists the folder's .glb files, `/models/<name>.glb` serves one; nothing else under /models/ */
function models() {
  const list = () => (existsSync(modelsDir) ? readdirSync(modelsDir) : [])
    .filter(name => /\.glb$/i.test(name))
    .map(name => ({ name, size: statSync(resolve(modelsDir, name)).size }));
  return {
    name: 'osct-sandbox-models',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]);
        if (!path.startsWith('/models/')) return next();
        // The engine asks for a model's `.gz` copy first and takes plain bytes as already unpacked: the same file answers both
        const name = path.slice('/models/'.length).replace(/\.glb\.gz$/i, '.glb');
        if (name === 'index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(list()));
          return;
        }
        // Only a listed file: no path outside the folder
        if (!list().some(model => model.name === name)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(resolve(modelsDir, name)).pipe(res);
      });
    },
  };
}

export default {
  root: here,
  // The dependency cache beside the client's own (ignored), not in this folder
  cacheDir: resolve(client, 'node_modules/.vite-reveal-sandbox'),
  plugins: [models()],
  resolve: {
    alias: {
      '@shared': resolve(repo, 'shared'),
      '@engine': resolve(repo, 'engine/src'),
      // One three.js: the reader's
      three: resolve(client, 'node_modules/three'),
    },
  },
  server: {
    host: true, // a phone on the same Wi-Fi opens it too
    port: 5180,
    strictPort: true,
    fs: { allow: [repo] },
  },
};
