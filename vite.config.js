import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
      '@components': resolve(__dirname, 'src/components'),
      '@services': resolve(__dirname, 'src/services'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@stores': resolve(__dirname, 'src/stores'),
      '@targets': resolve(__dirname, 'src/targets'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@deps': resolve(__dirname, 'src/deps'),
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