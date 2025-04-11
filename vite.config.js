import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { networkInterfaces } from 'os';

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
    __VITE_APP_VERSION__: process.env.NODE_ENV === 'production' ? 
    JSON.stringify(process.env.npm_package_version) : 
    JSON.stringify(process.env.npm_package_version),
    __VITE_SERVER_URL__: JSON.stringify(`http://${localIP}:${port}`),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },
  server: {
    host: true, // Same as --host flag
    port: port,
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