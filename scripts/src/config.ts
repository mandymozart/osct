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

// Content rules (RULES.md #3). Written into game.config.json so the client uses the same values.
export const MAX_TARGETS_PER_SPREAD = 5;
export const ENTRY_CATEGORIES = ['glossary', 'videos', 'texts', 'links'] as const;
