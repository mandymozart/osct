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
      external: ['immer'], // Add any external dependencies here
      output: {
        globals: {
          immer: 'immer'
        }
      }
    }
  }
});