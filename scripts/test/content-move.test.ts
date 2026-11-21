import { describe, expect, it } from 'vitest';
import { DEFAULT_TITLE, experienceBaseUrl, storeRoot } from '../../shared/api/content-store';
import { deleteMoved, describeMove, experienceOf, moveProblems, planMove, runMove } from '../src/lib/content-move';
import { MemoryStorage } from './memory-storage';

const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';
const quiet = () => undefined;

/** The layout before #87: staging/latest.json, versions.json and two versions, plus a stray folder */
const oldLayout = (manifest: Record<string, unknown> = { experience: 'osct' }) => {
  const storage = new MemoryStorage();
  const put = (path: string, data: unknown) => storage.files.set(path, Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)));
  put('staging/latest.json', { build: B, hash: B, schema: '4.0', version: '3.9.0', activatedAt: '2026-11-01T00:00:00Z', ...manifest });
  put('staging/versions.json', [
    { build: A, hash: A, schema: '4.0', version: '3.8.0', uploadedAt: '2026-10-01T00:00:00Z', activatedAt: '2026-10-01T00:00:00Z', retiredAt: '2026-11-01T00:00:00Z' },
    { build: B, hash: B, schema: '4.0', version: '3.9.0', uploadedAt: '2026-11-01T00:00:00Z', activatedAt: '2026-11-01T00:00:00Z', retiredAt: null },
  ]);
  for (const build of [A, B]) {
    put(`staging/${build}/game.config.json`, { experience: { id: 'osct' } });
    put(`staging/${build}/files.json`, {});
    put(`staging/${build}/assets/content/entries/e1/image.png`, `png of ${build}`);
  }
  put('staging/old-stuff/readme.txt', 'not a version');
  put('demo/latest.json', { build: A, hash: A, schema: '4.0', version: '3.9.0', activatedAt: '2026-11-01T00:00:00Z', experience: 'demo' });
  return storage;
};

describe('the store layout (#87, #50)', () => {
  it('puts every experience of a title and environment into a store of its own', () => {
    expect(storeRoot(DEFAULT_TITLE, 'staging', 'osct')).toBe('osct/staging/osct');
    expect(storeRoot('other-title', 'production', 'demo')).toBe('other-title/production/demo');
    expect(() => storeRoot('Osct', 'staging', 'osct')).toThrow(/title/);
    expect(() => storeRoot('osct', 'staging/x', 'osct')).toThrow(/environment/);
    expect(() => storeRoot('osct', 'staging', '../x')).toThrow(/experience/);
  });

  it('adds the experience to an environment base URL', () => {
    expect(experienceBaseUrl('https://cdn.example/osct/staging/', 'demo')).toBe('https://cdn.example/osct/staging/demo');
    expect(experienceBaseUrl('https://example.org/api/content/local', 'my_book')).toBe('https://example.org/api/content/local/my_book');
  });
});

describe('osct content move (one-off, #87)', () => {
  it('plans the versions on record, versions.json and latest.json last, and leaves the rest', async () => {
    const storage = oldLayout();
    const plan = await planMove(storage, 'staging', 'osct/staging/osct');
    const files = plan.files.map(f => f.file);
    expect(files.slice(-2)).toEqual(['versions.json', 'latest.json']);
    expect(files.indexOf(`${A}/game.config.json`)).toBeGreaterThan(files.indexOf(`${A}/assets/content/entries/e1/image.png`));
    expect(files).toHaveLength(8);
    expect(plan.skipped).toEqual(['old-stuff/']);
    expect(describeMove(plan)[0]).toContain('staging/ → osct/staging/osct/');
  });

  it('copies without deleting, skips what arrived before, and deletes the old folder only when asked', async () => {
    const storage = oldLayout();
    const plan = await planMove(storage, 'staging', 'osct/staging/osct');
    await runMove(storage, plan, quiet);
    expect(storage.puts.at(-1)).toBe('osct/staging/osct/latest.json');
    expect(storage.json('osct/staging/osct/latest.json')).toMatchObject({ build: B });
    expect(storage.files.has('staging/latest.json')).toBe(true);
    expect(await moveProblems(storage, plan)).toEqual([]);

    // Run again: everything is there
    const again = await planMove(storage, 'staging', 'osct/staging/osct');
    expect(again.files.every(f => f.present)).toBe(true);
    storage.puts = [];
    await runMove(storage, again, quiet);
    expect(storage.puts).toEqual([]);

    await deleteMoved(storage, again, quiet);
    expect(storage.deletes[0]).toBe('staging/latest.json');
    expect([...storage.files.keys()].filter(f => f.startsWith('staging/'))).toEqual(['staging/old-stuff/readme.txt']);
    expect(storage.files.has('demo/latest.json')).toBe(true);
  });

  it('never deletes the old folder while a moved file is missing or different in the target', async () => {
    const storage = oldLayout();
    const plan = await planMove(storage, 'staging', 'osct/staging/osct');
    await runMove(storage, plan, quiet);
    storage.files.set(`osct/staging/osct/${A}/files.json`, Buffer.from('changed'));
    await expect(deleteMoved(storage, plan, quiet)).rejects.toThrow(/not in osct\/staging\/osct/);
    expect(storage.deletes).toEqual([]);
  });

  it('refuses when the target serves another version already, or the old folder has no latest.json', async () => {
    const storage = oldLayout();
    storage.files.set('osct/staging/osct/latest.json', Buffer.from(JSON.stringify({ build: A, hash: A, schema: '4.0', version: '3.10.0', activatedAt: '2026-11-20T00:00:00Z' })));
    await expect(planMove(storage, 'staging', 'osct/staging/osct')).rejects.toThrow(/serves aaaaaaaaaaaa already/);
    await expect(planMove(storage, 'production', 'osct/production/osct')).rejects.toThrow(/production\/latest.json is missing/);
  });

  it('tells the experience of an old folder from its latest.json, else from its current configuration', async () => {
    expect(await experienceOf(oldLayout(), 'demo')).toBe('demo');
    expect(await experienceOf(oldLayout({ experience: undefined }), 'staging')).toBe('osct');
    expect(await experienceOf(oldLayout(), 'production')).toBeNull();
  });
});
