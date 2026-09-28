/**
 * OSCT content build: `content/` (YAML + media) → `client/src/game.config.json`
 * (+ copy of `content/` in `client/public/assets/content` with optimised media – lib/optimize-media.ts –,
 * target images in `mind-ar/`).
 *
 * Source layout (folder name = id):
 *   content/book.yaml
 *   content/spreads/<id>/spread.yaml   title, order, firstPage, lastPage, mind
 *   content/entries/<id>/entry.yaml    category, title, page, body, …, target? { image, order?, id?, entity? }
 *   content/entities/<id>/entity.yaml  type, assets[{ id?, src }], params   (referenced as entity: { ref })
 *   content/steps/<id>/step.yaml       tutorial
 *
 * Folders: build/ one file per part of the configuration (book, spreads, entities, entries, targets,
 * tutorial; game-config.ts puts them together), lib/ helpers (reading content, files, hash, schema,
 * media optimisation).
 */
import fs from 'fs';
import path from 'path';
import { APP_VERSION, CLIENT_PUBLIC_ASSETS_DIR, CONTENT_DIR, MINDAR_DIR, OUTPUT_FILE, projectRoot } from './config';
import { buildEntities } from './build/entities';
import { buildEntries } from './build/entries';
import { buildConfig } from './build/game-config';
import { buildSpreads } from './build/spreads';
import { assignTargetIndices } from './build/targets';
import { hashBuildInputs, readPreviousHash } from './lib/hash';
import { optimizeMedia } from './lib/optimize-media';

console.log('🚀 OSCT Content Build Tool 🚀');
console.log('----------------------------');
console.log('📁 Project root:', projectRoot);
console.log('📁 Content directory:', CONTENT_DIR);
console.log('📄 Output file:', OUTPUT_FILE);

/**
 * Main function to generate the config file
 */
async function generateConfigFile(): Promise<void> {
  try {
    // `--targets`: only refresh mind-ar/ (target images + source hash per spread) for tools/mind/compile.js,
    // write nothing else – works while the build fails, e.g. on a stale .mind
    if (process.argv.includes('--targets')) {
      const spreads = buildSpreads();
      assignTargetIndices(spreads, buildEntries(spreads, buildEntities()));
      console.log(`✅ Target images in ${MINDAR_DIR}`);
      return;
    }

    // Skip the build (and keep the timestamp) when nothing that affects the output changed
    const versionStr = APP_VERSION;
    const inputHash = hashBuildInputs(versionStr);
    const force = process.argv.includes('--force');
    if (!force && inputHash === readPreviousHash() && fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
      console.log(`✅ Content unchanged (hash ${inputHash.slice(0, 12)}), nothing to build. Use --force to rebuild.`);
      return;
    }

    const config = buildConfig(versionStr, inputHash);

    // Media in the client copy: models, images, .mind gzip, large videos reported (content/ stays as authored)
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
