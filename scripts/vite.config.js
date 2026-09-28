import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['lodash', 'path', 'fs', 'url', 'crypto'],
    },
    target: 'node18',
    ssr: true,
    sourcemap: true,
  },
});