import { defineConfig } from 'vite';

// One bundle per command in dist/ (Node, ES modules): the content build and the hand-run commands
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts', // content build (npm run build:content)
        'mind-compile': 'src/mind/compile.ts', // npm run compile:mind
        'mind-benchmark': 'src/mind/benchmark.ts', // npm run mind:benchmark
        'mind-history': 'src/mind/history.ts', // npm run mind:history / mind:restore
        sounds: 'src/sounds.ts', // npm run sounds
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    target: 'node22',
    ssr: true, // Node: dependencies stay external (node_modules)
    sourcemap: true,
  },
  // npm test – tests live in test/, not src/ (src/ is part of the content hash)
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    silent: 'passed-only', // build logs only for failing tests
  },
});
