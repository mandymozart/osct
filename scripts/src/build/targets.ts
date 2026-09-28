import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { CONTENT_DIR, MAX_TARGETS_PER_SPREAD, MIND_HASH_SUFFIX, MIND_SOURCE_FILE, MINDAR_DIR } from '../config';
import type { SpreadData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { deleteFolderRecursive } from '../lib/files';
import type { EntryBuild } from './entries';

/**
 * Assign MindAR indices per spread (page → target order → id; must match the compiled .mind)
 * and copy the target images to `mind-ar/<spread>/<index>-<file>` for compiling, with
 * `source.sha256` = hash of those images in order. `tools/mind/compile.js` stores that hash next to
 * the `.mind` it compiles (`<name>.mind.sha256`); a different hash means the `.mind` is stale.
 */
export function assignTargetIndices(spreads: SpreadData[], builds: EntryBuild[]): void {
  if (fs.existsSync(MINDAR_DIR)) deleteFolderRecursive(MINDAR_DIR);
  fs.mkdirSync(MINDAR_DIR, { recursive: true });

  for (const spread of spreads) {
    const targets = builds
      .filter(b => b.spreadId === spread.id && b.entry.target)
      .sort((a, b) => a.entry.page - b.entry.page || a.targetOrder - b.targetOrder || a.entry.id.localeCompare(b.entry.id));

    if (targets.length > MAX_TARGETS_PER_SPREAD) {
      buildErrors.push(`spreads/${spread.id} has ${targets.length} targets, max is ${MAX_TARGETS_PER_SPREAD}.`);
    }

    const spreadDir = path.join(MINDAR_DIR, spread.id);
    fs.mkdirSync(spreadDir, { recursive: true });
    const sourceHash = createHash('sha256');
    targets.forEach((b, index) => {
      b.entry.target!.index = index;
      if (b.imageFile && fs.existsSync(b.imageFile)) {
        const name = `${index}-${path.basename(b.imageFile)}`;
        fs.copyFileSync(b.imageFile, path.join(spreadDir, name));
        sourceHash.update(`${name}\n`);
        sourceHash.update(fs.readFileSync(b.imageFile));
      }
      console.log(`🎯 ${spread.id}[${index}] ${b.entry.target!.id} (page ${b.entry.page})`);
    });
    const hash = sourceHash.digest('hex');
    fs.writeFileSync(path.join(spreadDir, MIND_SOURCE_FILE), `${hash}\n`);
    checkMindSource(spread, hash);
  }
}

/** The .mind must be compiled from the spread's current target images (`npm run compile:mind`) */
export function checkMindSource(spread: SpreadData, hash: string): void {
  const mindFile = path.join(CONTENT_DIR, spread.mindSrc.replace(/^\/assets\/content\//, ''));
  const hashFile = `${mindFile}${MIND_HASH_SUFFIX}`;
  const label = `spreads/${spread.id}/${path.basename(mindFile)}`;
  if (!fs.existsSync(hashFile)) {
    console.warn(`⚠️  ${label}: no ${path.basename(hashFile)} – can't tell whether it is up to date. Run \`npm run compile:mind\` in scripts/.`);
  } else if (fs.readFileSync(hashFile, 'utf8').trim() !== hash) {
    buildErrors.push(`${label} is stale: its target images changed (added, removed, replaced or reordered). Run \`npm run compile:mind\` in scripts/.`);
  }
}
