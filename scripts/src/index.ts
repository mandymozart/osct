/**
 * OSCT content build: `content/` (YAML + media) → `client/src/game.config.json`
 * (+ copy of `content/` in `client/public/assets/content` with optimised media – lib/optimize-media.ts).
 * The app makes the image targets from the target images itself (8th Wall engine).
 *
 * Source layout (folder name = id):
 *   content/book.yaml
 *   content/spreads/<id>/spread.yaml   title, order, firstPage, lastPage
 *   content/entries/<id>/entry.yaml    category, title, page, body, …, target? { image, order?, id?, entity? }
 *   content/entities/<id>/entity.yaml  type, assets[{ id?, src }], params   (referenced as entity: { ref })
 *   content/steps/<id>/step.yaml       tutorial
 *   content/plugins/<id>/index.ts      the book's own code (build/plugins.ts): type-checked, bundled, declared
 *
 * Folders: build/ one file per part of the configuration (book, spreads, entities, entries, targets,
 * tutorial; game-config.ts puts them together), lib/ helpers (reading content, files, hash, schema,
 * media optimisation).
 */
import fs from 'fs';
import path from 'path';
import { APP_VERSION, CLIENT_PUBLIC_ASSETS_DIR, CONTENT_DIR, DEMO_ENV, DEMO_MARKER, FIXTURE_MARKER, OUTPUT_FILE, projectRoot } from './config';
import { buildConfig } from './build/game-config';
import { buildPlugins, writePluginBundles } from './build/plugins';
import { hashBuildInputs, readPreviousHash } from './lib/hash';
import { optimizeMedia } from './lib/optimize-media';
import { buildWarnings } from './lib/errors';

console.log('🚀 OSCT Content Build Tool 🚀');
console.log('----------------------------');
console.log('📁 Project root:', projectRoot);
console.log('📁 Content directory:', CONTENT_DIR);
console.log('📄 Output file:', OUTPUT_FILE);

// The book content is not in this repository: no silent fallback to anything else
if (!fs.existsSync(path.join(CONTENT_DIR, 'book.yaml'))) {
  console.error(`❌ No content in ${CONTENT_DIR} (no book.yaml).
   Set OSCT_CONTENT_DIR (environment or scripts/.env) to the content source,
   or OSCT_CONTENT_DIR=fixtures/content for the test fixture (docs/content-cdn.md).`);
  process.exit(1);
}
if (fs.existsSync(path.join(CONTENT_DIR, FIXTURE_MARKER))) console.log('🧪 This is the test fixture – never synced to the CDN');
if (fs.existsSync(path.join(CONTENT_DIR, DEMO_MARKER))) console.log(`🎲 This is the demo book – synced to the environment ${DEMO_ENV} only`);

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
    const config = buildConfig(versionStr, inputHash, plugins.map(p => p.data));
    writePluginBundles(plugins);
    buildWarnings.forEach(warning => console.warn(`   ⚠️  ${warning}`));

    // Media in the client copy: models, images, large videos reported (content/ stays as authored)
    console.log('\n🗜️  Optimising media...');
    for (const { file, before, after, note } of await optimizeMedia(CLIENT_PUBLIC_ASSETS_DIR)) {
      const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
      const name = path.relative(CLIENT_PUBLIC_ASSETS_DIR, file).split(path.sep).join('/');
      if (note) console.warn(`   ⚠️  ${name}: ${kb(before)} – ${note}`);
      else if (after < before) console.log(`   ${name}: ${kb(before)} → ${kb(after)}`);
    }

    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
    console.log(`🎉 Successfully generated ${OUTPUT_FILE} (version: ${config.version.version})`);
  } catch (error) {
    console.error('❌ Error generating config file:', error);
    process.exit(1);
  }
}

console.log('\n🔄 Starting content build process...');
void generateConfigFile();
