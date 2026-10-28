/**
 * `npm run schema:lock`: locks the checksum of shared/ (the content contract) to `CONTENT_SCHEMA_VERSION` in
 * shared/content-schema.json (RULES #10). Refuses when shared/ changed but the schema was not bumped.
 */
import fs from 'fs';
import { CONTENT_SCHEMA_VERSION } from '../../shared/types/game-config';
import { hashContract, readSchemaLock, SCHEMA_LOCK_FILE, SchemaLock, schemaLockProblem } from './lib/contract';

const checksum = hashContract();
const lock = readSchemaLock();
const problem = schemaLockProblem(lock, CONTENT_SCHEMA_VERSION, checksum);
if (problem) {
  console.error(`❌ ${problem}`);
  process.exit(1);
}
if (lock?.checksum === checksum && lock.schema === CONTENT_SCHEMA_VERSION) {
  console.log(`✅ Content schema ${CONTENT_SCHEMA_VERSION} – lock up to date`);
} else {
  const next: SchemaLock = { schema: CONTENT_SCHEMA_VERSION, checksum };
  fs.writeFileSync(SCHEMA_LOCK_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`🔒 Content schema ${CONTENT_SCHEMA_VERSION} locked (${checksum.slice(0, 12)})`);
}
