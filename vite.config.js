import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/store/index.ts'),
      name: 'GameStore',
      fileName: 'game-store',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: ['three','aframe'], 
      output: {
        globals: {
          three: 'THREE',
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