import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { CONTENT_DIR, OUTPUT_FILE, projectRoot, SCRIPTS_SRC_DIR } from '../config';
import { listFiles } from './files';

// Commands besides the build (sounds, the osct CLI with the CDN sync, the schema lock and the delivery import)
// don't shape the content build's output – editing them must not change the content's version
// (a new hash = new content to sync)
const COMMAND_FILES = [
  'sounds.ts', 'cli.ts', 'schema-lock.ts', 'import-delivery.ts',
  'lib/storage.ts', 'lib/content-sync.ts', 'lib/contract.ts', 'lib/entry.ts', 'lib/cli-args.ts', 'lib/content-export.ts',
];
// An export's marker and record (`osct content export`) change on every export – they shape nothing the build writes
const EXPORT_FILES = ['EXPORT.md', 'export.json'];
const isCommandFile = (file: string) => COMMAND_FILES.some(prefix => file.startsWith(prefix));

// Text files get normalised line endings before hashing
const TEXT_FILE = /\.(ya?ml|json|ts|js|md|txt|html|css)$/i;

/**
 * The content's own version: checksum of everything that determines the build output – content files, the
 * build logic and the shared contract. Not the app version: an app release does not make new content
 * (RULES #10). Line endings of text files are normalised so Windows and Unix checkouts produce the same hash.
 */
export function hashBuildInputs(): string {
  const hash = createHash('sha256');
  const sharedDir = path.join(projectRoot, 'shared');
  for (const [label, dir] of [['content', CONTENT_DIR], ['scripts', SCRIPTS_SRC_DIR], ['shared', sharedDir]] as const) {
    for (const file of listFiles(dir).filter(f => !(label === 'scripts' && isCommandFile(f)) && !(label === 'content' && EXPORT_FILES.includes(f)))) {
      let data = fs.readFileSync(path.join(dir, file));
      if (TEXT_FILE.test(file)) {
        data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      }
      hash.update(`${label}/${file}\n`);
      hash.update(data);
    }
  }
  // The image format of the content build (#298): WebP builds differ – the default (JPEG) keeps the hash it had
  if (process.env.OSCT_IMAGE_FORMAT?.trim().toLowerCase() === 'webp') hash.update('image-format/webp\n');
  return hash.digest('hex');
}

/**
 * Hash stored in the current output file, if any
 */
export function readPreviousHash(): string | null {
  try {
    const hash: unknown = (JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) as { version?: { hash?: unknown } }).version?.hash;
    return typeof hash === 'string' ? hash : null;
  } catch {
    return null;
  }
}
