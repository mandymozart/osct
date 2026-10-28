import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export const projectRoot = resolve(__dirname, '../../');

// scripts/.env (untracked): OSCT_CONTENT_DIR and the storage access for every command, also `npm run content` in
// client/. Variables already set win; the tests set their own.
const envFile = resolve(projectRoot, 'scripts/.env');
if (!process.env.VITEST && existsSync(envFile)) process.loadEnvFile(envFile);

/** The test fixture (docs/content-cdn.md): CI and the tests build it, it never goes to the CDN */
export const FIXTURE_DIR = resolve(projectRoot, 'fixtures/content');
/** Marks the fixture; the build copies it into the output, `osct content sync` refuses a build with it */
export const FIXTURE_MARKER = 'FIXTURE.md';

// The content source. The book content is not in this repository: OSCT_CONTENT_DIR names its folder (absolute, or
// relative to the repository root – `fixtures/content` for the fixture). Default: a local `content/` folder.
export const CONTENT_DIR = resolve(projectRoot, process.env.OSCT_CONTENT_DIR || 'content');
export const OUTPUT_FILE = resolve(projectRoot, 'client/src/game.config.json');
export const SCRIPTS_SRC_DIR = resolve(projectRoot, 'scripts/src');
export const CLIENT_PUBLIC_ASSETS_DIR = resolve(projectRoot, 'client/public/assets/content');

export const SOUNDS_DIR = resolve(projectRoot, 'client/public/assets/sounds');

// One version for app and tooling (RULES.md #10), recorded in the content as information (`version.version`);
// compatibility is the content schema. Source: client/package.json – read directly, npm_package_version is
// missing outside `npm run`.
export const APP_VERSION: string = JSON.parse(
  readFileSync(resolve(projectRoot, 'client/package.json'), 'utf8')
).version;

// Content rule (RULES.md #3): targets per spread (the 8th Wall engine tracks 4 of them at the same moment)
export const MAX_TARGETS_PER_SPREAD = 10;
