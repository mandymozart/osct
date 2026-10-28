// prebuild: the content build – unless the app loads its content from the content CDN (VITE_CONTENT_BASE_URL in the
// environment or a .env file): then the app build reads no content and none is built (docs/content-cdn.md).
import { spawnSync } from 'child_process';
import { loadEnv } from 'vite';

const base = loadEnv('production', import.meta.dirname, 'VITE_').VITE_CONTENT_BASE_URL;
if (base) {
  console.log(`Content from ${base} – no content build.`);
} else {
  process.exitCode = spawnSync('npm', ['run', 'content'], { stdio: 'inherit', shell: true }).status ?? 1;
}
