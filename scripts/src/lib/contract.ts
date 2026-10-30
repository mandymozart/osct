/**
 * The content contract (shared/) and its schema version (RULES #10): `shared/content-schema.json` locks the
 * checksum of shared/ to `CONTENT_SCHEMA_VERSION`. A change in shared/ without a schema bump fails a test
 * (scripts/test/schema.test.ts); `npm run schema:lock` writes the lock after the bump. `shared/api/` – the instance
 * API's answers and rules, which content never holds – is no part of the contract.
 */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { projectRoot } from '../config';
import { listFiles } from './files';

export const SHARED_DIR = path.join(projectRoot, 'shared');
export const SCHEMA_LOCK_FILE = path.join(SHARED_DIR, 'content-schema.json');
/** The folder of shared/ that is no content: the API's response types and request rules */
export const SHARED_API_DIR = 'api';

export interface SchemaLock {
  /** The schema version the checksum belongs to (`CONTENT_SCHEMA_VERSION`) */
  schema: string;
  /** SHA-256 of shared/ without this file and shared/api/, line endings normalised */
  checksum: string;
}

/** Checksum of the contract: every file in shared/ except the lock itself and shared/api/ */
export function hashContract(dir = SHARED_DIR): string {
  const hash = createHash('sha256');
  const isContract = (file: string) => path.join(dir, file) !== SCHEMA_LOCK_FILE && !file.startsWith(`${SHARED_API_DIR}/`);
  for (const file of listFiles(dir).filter(isContract).sort()) {
    hash.update(`${file}\n`);
    hash.update(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex');
}

/** The lock, or null when the file is missing, unreadable or not `{ schema, checksum }` */
export function readSchemaLock(file = SCHEMA_LOCK_FILE): SchemaLock | null {
  try {
    const lock: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof lock !== 'object' || lock === null || !('schema' in lock) || !('checksum' in lock)) return null;
    const { schema, checksum } = lock;
    return typeof schema === 'string' && typeof checksum === 'string' ? { schema, checksum } : null;
  } catch {
    return null;
  }
}

const HOW_TO_BUMP =
  'MAJOR when an older app cannot read the content any more (new required field, renamed or removed field, ' +
  'changed type, new enum value), MINOR when older apps can ignore the change (new optional field)';

const isNewer = (next: string, previous: string): boolean => {
  const [a, b] = [next, previous].map(v => v.split('.').map(Number));
  return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
};

/**
 * The lock for the current contract, or why there is none: shared/ changed while the schema stayed, or the
 * schema went backwards. `null` problem = the lock may be written.
 */
export function schemaLockProblem(lock: SchemaLock | null, schema: string, checksum: string): string | null {
  if (!lock || lock.checksum === checksum) return null;
  if (lock.schema === schema) {
    return `shared/ changed but CONTENT_SCHEMA_VERSION is still ${schema} – bump it in shared/types/game-config.ts (${HOW_TO_BUMP}), then run \`npm run schema:lock\` in scripts/`;
  }
  if (!isNewer(schema, lock.schema)) return `CONTENT_SCHEMA_VERSION ${schema} is not newer than the locked ${lock.schema}`;
  return null;
}
