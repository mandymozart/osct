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
      external: ['lodash', 'path', 'fs', 'url', 'crypto'],
    },
    target: 'node18', // Specify Node.js version 18
    ssr: true, // Enable Server Side Rendering mode
    sourcemap: true,
  },
  // npm test – tests live in test/, not src/ (src/ is part of the content hash)
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    silent: 'passed-only', // build logs only for failing tests
  },
});