import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
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
    rollupOptions: {
      external: ['aframe'], 
      output: {
        globals: {
          aframe: 'AFRAME'
        }
      }
    }
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