import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// Define project root relative to scripts directory
export const projectRoot = resolve(__dirname, '../../');

// OSCT_CONTENT_DIR / OSCT_MINDAR_DIR point the build at another folder (tests; content outside this repo)
export const CONTENT_DIR = resolve(process.env.OSCT_CONTENT_DIR || resolve(projectRoot, 'content'));
export const OUTPUT_FILE = resolve(projectRoot, 'client/src/game.config.json');
// .mindar/ – everything about .mind files that stays on this computer (not in git, safe to delete)
export const MINDAR_LOCAL_DIR = resolve(projectRoot, '.mindar');
export const MINDAR_DIR = resolve(process.env.OSCT_MINDAR_DIR || resolve(MINDAR_LOCAL_DIR, 'targets'));
// .mindar/targets/<spread>/source.sha256: hash of the spread's target images in MindAR order;
// content/spreads/<spread>/<name>.mind.sha256: the hash the .mind was compiled from (mind/compile.ts)
export const MIND_SOURCE_FILE = 'source.sha256';
export const MIND_HASH_SUFFIX = '.sha256';
export const SCRIPTS_DIR = resolve(projectRoot, 'scripts');
export const SCRIPTS_SRC_DIR = resolve(projectRoot, 'scripts/src');
export const CLIENT_PUBLIC_ASSETS_DIR = resolve(projectRoot, 'client/public/assets/content');

// .mind compiling (mind/)
export const MINDAR_VENDOR_DIR = resolve(projectRoot, 'client/src/vendor/mind-ar'); // MindAR, unchanged
export const MIND_HISTORY_DIR = resolve(MINDAR_LOCAL_DIR, 'history'); // earlier .mind versions per spread
export const MIND_CACHE_DIR = resolve(MINDAR_LOCAL_DIR, 'cache'); // one compiled .mind per image
export const MIND_BROWSER_DIR = resolve(MINDAR_LOCAL_DIR, 'browser'); // browser profiles (GPU cache)
export const MIND_BENCHMARK_FILE = resolve(MINDAR_LOCAL_DIR, 'benchmark.json');
export const SOUNDS_DIR = resolve(projectRoot, 'client/public/assets/sounds');

// One version for app and content build (RULES.md #10). Source: client/package.json –
// read directly, npm_package_version is missing outside `npm run`.
export const APP_VERSION: string = JSON.parse(
  readFileSync(resolve(projectRoot, 'client/package.json'), 'utf8')
).version;

// Content rules (RULES.md #3). Written into game.config.json so the client uses the same values.
export const MAX_TARGETS_PER_SPREAD = 5;
