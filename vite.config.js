import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  define: {
    __VITE_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __VITE_APP_VERSION__: process.env.NODE_ENV === 'production' ? 
    JSON.stringify(process.env.npm_package_version) : 
    JSON.stringify(process.env.npm_package_version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
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
});