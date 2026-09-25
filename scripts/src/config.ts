import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// Define project root relative to scripts directory
export const projectRoot = resolve(__dirname, '../../');

// Other config exports can go here
export const CONTENT_DIR = resolve(projectRoot, 'content');
export const OUTPUT_FILE = resolve(projectRoot, 'client/src/game.config.json');
export const MINDAR_DIR = resolve(projectRoot, 'mind-ar');
export const SCRIPTS_SRC_DIR = resolve(projectRoot, 'scripts/src');
export const CLIENT_PUBLIC_ASSETS_DIR = resolve(projectRoot, 'client/public/assets/content');

// One version for app and content build (RULES.md #10). Source: client/package.json –
// read directly, npm_package_version is missing outside `npm run`.
export const APP_VERSION: string = JSON.parse(
  readFileSync(resolve(projectRoot, 'client/package.json'), 'utf8')
).version;

// Content rules (RULES.md #3). Written into game.config.json so the client uses the same values.
export const MAX_TARGETS_PER_SPREAD = 5;
