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
/** The demo (fixtures/demo, docs/plugins.md "The demo"): a sandbox next to the fixture */
export const DEMO_DIR = resolve(projectRoot, 'fixtures/demo');
/** Marks the demo; a build with it goes to the environment DEMO_ENV only – never where the experience's current version is */
export const DEMO_MARKER = 'DEMO.md';
export const DEMO_ENV = 'demo';

// The content source. The content is not in this repository (#5): OSCT_CONTENT_DIR names its folder (absolute, or
// relative to the repository root – `fixtures/content` for the fixture). No default (#33): unset, CONTENT_DIR is empty
// and every command that reads or writes the content source stops (`requireContentDir`).
export const CONTENT_DIR = process.env.OSCT_CONTENT_DIR ? resolve(projectRoot, process.env.OSCT_CONTENT_DIR) : '';

/** For a command that reads or writes the content source: its folder, or a stop with a message when it is not named */
export const requireContentDir = (): string => {
  if (CONTENT_DIR) return CONTENT_DIR;
  console.error(`❌ OSCT_CONTENT_DIR is not set (environment or scripts/.env): name the content source,
   or OSCT_CONTENT_DIR=fixtures/content for the test fixture (docs/content-cdn.md).`);
  process.exit(1);
};
export const OUTPUT_FILE = resolve(projectRoot, 'client/src/game.config.json');
export const SCRIPTS_SRC_DIR = resolve(projectRoot, 'scripts/src');
export const CLIENT_PUBLIC_ASSETS_DIR = resolve(projectRoot, 'client/public/assets/content');

export const SOUNDS_DIR = resolve(projectRoot, 'client/public/assets/sounds');

// One version for app and tooling (RULES.md #10), recorded in the content as information (`version.version`);
// compatibility is the content schema. Source: client/package.json – read directly, npm_package_version is
// missing outside `npm run`.
const clientVersion: unknown = (JSON.parse(readFileSync(resolve(projectRoot, 'client/package.json'), 'utf8')) as { version?: unknown }).version;
if (typeof clientVersion !== 'string') throw new Error('client/package.json has no version');
export const APP_VERSION: string = clientVersion;

// Content rule (RULES.md #3): targets per scene (the 8th Wall engine tracks 4 of them at the same moment)
export const MAX_TARGETS_PER_SCENE = 10;
/** A page of the book in mm when a source names none (the editor API's `Scenes::PAGE_MM`): a double page is one surface of twice its width */
export const BOOK_PAGE_MM = { width: 230, height: 320 } as const;
