import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { networkInterfaces } from 'os';

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

export default defineConfig(({command,mode})=>{
  const localIP = command === 'serve' ? getLocalIP() : 'localhost';
  const port = 5173; // Default Vite port, change if you're using a custom port
  
  return {
  plugins: [tsconfigPaths()],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: JSON.stringify(APP_VERSION),
    __VITE_SERVER_URL__: JSON.stringify(`http://${localIP}:${port}`),
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
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        assetFileNames: (assetInfo) => {
          // Keep original directory structure for deps folder
          if (assetInfo.fileName?.includes('deps/')) {
            return assetInfo.fileName;
          }
          return 'assets/[name]-[hash][extname]';
        },
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