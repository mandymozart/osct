import { describe, expect, it } from 'vitest';
import { CONTENT_SCHEMA_VERSION, parseContentSchema } from '../../shared/types/game-config';
import { hashContract, readSchemaLock, schemaLockProblem } from '../src/lib/contract';

// RULES #10 – the content schema (MAJOR.MINOR) is the only compatibility rule between content and app; every
// change of the contract (shared/) needs a schema bump
describe('content schema', () => {
  it('is MAJOR.MINOR', () => {
    expect(parseContentSchema(CONTENT_SCHEMA_VERSION)).not.toBeNull();
  });

  it('is bumped with every change in shared/ (shared/content-schema.json)', () => {
    const lock = readSchemaLock();
    expect(lock, 'shared/content-schema.json is missing – run `npm run schema:lock` in scripts/').not.toBeNull();
    const checksum = hashContract();
    const problem = schemaLockProblem(lock, CONTENT_SCHEMA_VERSION, checksum);
    expect(problem ?? (lock!.checksum === checksum && lock!.schema === CONTENT_SCHEMA_VERSION
      ? null
      : `the lock is behind: run \`npm run schema:lock\` in scripts/ (schema ${CONTENT_SCHEMA_VERSION})`)).toBeNull();
  });

  it('refuses a changed contract without a bump, and a bump backwards', () => {
    const lock = { schema: '1.2', checksum: 'old' };
    expect(schemaLockProblem(lock, '1.2', 'old')).toBeNull();
    expect(schemaLockProblem(lock, '1.2', 'new')).toMatch(/bump it/);
    expect(schemaLockProblem(lock, '1.3', 'new')).toBeNull();
    expect(schemaLockProblem(lock, '2.0', 'new')).toBeNull();
    expect(schemaLockProblem(lock, '1.1', 'new')).toMatch(/not newer/);
    expect(schemaLockProblem(null, '1.0', 'new')).toBeNull();
  });
});
