import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },
  build: {
    sourcemap: true,
    server: {
      sourcemap: 'inline',
      watch: {
        usePolling: true,
        interval: 100
      }
    },
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'Book Game',
      fileName: 'book-game',
      formats: ['es', 'umd']
    },
    // rollupOptions: {
    //   external: [],
    //   output: {
    //     manualChunks: {
    //       vendor: ['src/deps/aframe.min.js', 'src/deps/aframe-extras.min.js', 'src/deps/mindar-image-aframe.prod.js'],
    //     },
    //     chunkFileNames: 'assets/[name].js',
    //   }
    // }
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