// vite.config.ts

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['lodash', 'path', 'fs', 'url'],
    },
    target: 'node18', // Specify Node.js version 18
    ssr: true, // Enable Server Side Rendering mode
    sourcemap: true,
  },
});