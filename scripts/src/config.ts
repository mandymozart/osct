import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export const projectRoot = resolve(__dirname, '../../');

// OSCT_CONTENT_DIR points the build at another folder (tests; content outside this repo)
export const CONTENT_DIR = resolve(process.env.OSCT_CONTENT_DIR || resolve(projectRoot, 'content'));
export const OUTPUT_FILE = resolve(projectRoot, 'client/src/game.config.json');
export const SCRIPTS_SRC_DIR = resolve(projectRoot, 'scripts/src');
export const CLIENT_PUBLIC_ASSETS_DIR = resolve(projectRoot, 'client/public/assets/content');

export const SOUNDS_DIR = resolve(projectRoot, 'client/public/assets/sounds');

// One version for app and content build (RULES.md #10). Source: client/package.json –
// read directly, npm_package_version is missing outside `npm run`.
export const APP_VERSION: string = JSON.parse(
  readFileSync(resolve(projectRoot, 'client/package.json'), 'utf8')
).version;

// Content rule (RULES.md #3): targets per spread (the 8th Wall engine tracks 4 of them at the same moment)
export const MAX_TARGETS_PER_SPREAD = 10;
