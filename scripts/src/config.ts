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
export const CLIENT_PUBLIC_ASSETS_DIR = resolve(projectRoot, 'client/public/assets/content');