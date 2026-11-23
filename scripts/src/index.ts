/**
 * OSCT content build: `content/` (YAML + media) → `client/src/game.config.json` and the landing's
 * `client/src/game.landing.json` beside it (#355)
 * (+ copy of `content/` in `client/public/assets/content` with optimised media – lib/optimize-media.ts).
 * The app makes the image targets from the target images itself (8th Wall engine).
 *
 * Source layout (folder name = id):
 *   content/experience.yaml            id, title, book? { author, publisher? }, passes?, environment?, appearance?, landing? { scene, target }
 *   content/scenes/<id>/scene.yaml     label, order, surfaces [{ id, label?, widthMm, heightMm, place? }], passes?
 *   content/entries/<id>/entry.yaml    category, title, scene, surface?, body, …, target? { image, id?, entity?, place? }
 *   content/entities/<id>/entity.yaml  type, assets[{ id?, src }], params   (referenced as entity: { ref })
 *   content/plugins/<id>/index.ts      the experience's own code (build/plugins.ts): type-checked, bundled, declared
 *
 * Content schema 3.0 (#319): scenes, not pages – a scene's place is its order; an entry names its scene.
 * Content schema 4.0 (#320): the experience is the top level (experience.yaml); the printed book is its optional `book`.
 *
 * Folders: build/ one file per part of the configuration (experience, scenes, entities, entries, targets;
 * game-config.ts puts them together), lib/ helpers (reading content, files, hash, schema,
 * media optimisation).
 */
import fs from 'fs';
import path from 'path';
import { APP_VERSION, CLIENT_PUBLIC_ASSETS_DIR, CONTENT_DIR, DEMO_MARKER, DEMO_REFUSED_ENV, FIXTURE_MARKER, LANDING_OUTPUT_FILE, OUTPUT_FILE, projectRoot, requireContentDir } from './config';
import { buildConfig } from './build/game-config';
import { buildPlugins, writePluginBundles } from './build/plugins';
import { hashBuildInputs, readPreviousHash } from './lib/hash';
import { imageFormat, optimizeMedia, renameContentPaths, textureSetFiles } from './lib/optimize-media';
import { buildWarnings } from './lib/errors';
import { landingFileOf, withLandingHero } from '../../shared/api/landing-extract';
import { landingPickOf } from '../../shared/types/landing';
import { readLayout } from './lib/layout';

console.log('🚀 OSCT Content Build Tool 🚀');
console.log('----------------------------');
console.log('📁 Project root:', projectRoot);
console.log('📁 Content directory:', requireContentDir());
console.log('📄 Output file:', OUTPUT_FILE);

// The content is not in this repository: no silent fallback to anything else
if (!fs.existsSync(path.join(CONTENT_DIR, 'experience.yaml'))) {
  console.error(`❌ No content in ${CONTENT_DIR} (no experience.yaml).
   Set OSCT_CONTENT_DIR (environment or scripts/.env) to the content source,
   or OSCT_CONTENT_DIR=fixtures/content for the test fixture (docs/content-cdn.md).`);
  process.exit(1);
}
if (fs.existsSync(path.join(CONTENT_DIR, FIXTURE_MARKER))) console.log('🧪 This is the test fixture – never synced to the CDN');
if (fs.existsSync(path.join(CONTENT_DIR, DEMO_MARKER))) console.log(`🎲 This is the demo – an experience of its own, never synced to ${DEMO_REFUSED_ENV}`);

async function generateConfigFile(): Promise<void> {
  try {
    // Skip the build (and keep the timestamp) when nothing that affects the output changed
    const versionStr = APP_VERSION; // information only: the tooling version that built the content
    const inputHash = hashBuildInputs();
    const force = process.argv.includes('--force');
    if (!force && inputHash === readPreviousHash() && fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
      console.log(`✅ Content unchanged (hash ${inputHash.slice(0, 12)}), nothing to build. Use --force to rebuild.`);
      return;
    }

    // Plugins first: what they register is checked on the nodes that use it
    const plugins = await buildPlugins();
    let config = buildConfig(versionStr, inputHash, plugins.map(p => p.data));
    writePluginBundles(plugins);
    buildWarnings.forEach(warning => console.warn(`   ⚠️  ${warning}`));

    // Media in the client copy: models, images, large videos reported (content/ stays as authored). OSCT_IMAGE_FORMAT=webp
    // (#298): the images the configuration names become WebP under the image rule, and the configuration names those
    const webp = imageFormat() === 'webp';
    console.log(`\n🗜️  Optimising media${webp ? ' (images as WebP – OSCT_IMAGE_FORMAT=webp)' : ''}...`);
    const optimized = await optimizeMedia(CLIENT_PUBLIC_ASSETS_DIR, textureSetFiles(config), webp ? { config } : undefined);
    config = renameContentPaths(config, new Map(optimized.flatMap(r => (r.renamedFrom && r.renamedTo ? [[r.renamedFrom, r.renamedTo] as const] : []))));
    for (const { file, before, after, note } of optimized) {
      const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
      const name = path.relative(CLIENT_PUBLIC_ASSETS_DIR, file).split(path.sep).join('/');
      if (note) console.warn(`   ⚠️  ${name}: ${kb(before)} – ${note}`);
      else if (after < before) console.log(`   ${name}: ${kb(before)} → ${kb(after)}`);
    }

    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    // The landing's hero (#355): extracted from the experience's pick with the final media names, and landing.json beside
    // the configuration – what publish writes into a version's folder, read by the landing for the bundled content
    const layout = readLayout(CLIENT_PUBLIC_ASSETS_DIR);
    config = withLandingHero(config, layout);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
    console.log(`🎉 Successfully generated ${OUTPUT_FILE} (version: ${config.version.version})`);
    const landing = landingFileOf(config, layout);
    fs.writeFileSync(LANDING_OUTPUT_FILE, JSON.stringify(landing, null, 2));
    const pick = landingPickOf(config.experience.landing);
    const own = [landing.texts ? `own texts (${Object.keys(landing.texts).join(', ')})` : '', landing.shopItems ? `${landing.shopItems.length} shop item(s)` : ''].filter(Boolean).join(', ');
    console.log(`🖥️  ${path.relative(projectRoot, LANDING_OUTPUT_FILE)}: ${landing.hero ? `the hero ${pick ? `picked (${pick.scene} › ${pick.target})` : 'by default (no pick in experience.yaml)'}` : 'no hero (no 3D model)'}${own ? ` – ${own}` : ''}`);
  } catch (error) {
    console.error('❌ Error generating config file:', error);
    process.exit(1);
  }
}

console.log('\n🔄 Starting content build process...');
void generateConfigFile();
