import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { CONTENT_DIR, OUTPUT_FILE, projectRoot, SCRIPTS_SRC_DIR } from '../config';
import { listFiles } from './files';

// Text files get normalised line endings before hashing
const TEXT_FILE = /\.(ya?ml|json|ts|js|md|txt|html|css)$/i;

/**
 * Checksum of everything that determines the build output: content files, the build logic,
 * the shared contract and the package version. Line endings of text files are normalised so
 * Windows and Unix checkouts produce the same hash.
 */
export function hashBuildInputs(version: string): string {
  const hash = createHash('sha256');
  hash.update(`version:${version}\n`);
  const sharedDir = path.join(projectRoot, 'shared');
  for (const [label, dir] of [['content', CONTENT_DIR], ['scripts', SCRIPTS_SRC_DIR], ['shared', sharedDir]] as const) {
    for (const file of listFiles(dir)) {
      let data = fs.readFileSync(path.join(dir, file));
      if (TEXT_FILE.test(file)) {
        data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      }
      hash.update(`${label}/${file}\n`);
      hash.update(data);
    }
  }
  return hash.digest('hex');
}

/**
 * Hash stored in the current output file, if any
 */
export function readPreviousHash(): string | null {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')).version?.hash ?? null;
  } catch {
    return null;
  }
}
