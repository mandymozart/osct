import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { networkInterfaces } from 'os';
import { renderStaticSplash } from './src/utils/static-splash-html';

// One version for app and content build (agents/RULES.md #10). Read directly:
// npm_package_version is missing outside `npm run` (e.g. `npx vite`).
const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;

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
  plugins: [tsconfigPaths(), staticSplash(), ...(https ? [basicSsl()] : [])],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: JSON.stringify(APP_VERSION),
    __VITE_SERVER_URL__: JSON.stringify(`${https ? 'https' : 'http'}://${localIP}:${port}`),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared'),
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