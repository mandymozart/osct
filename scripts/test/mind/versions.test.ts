import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { currentVersion, KEEP, listVersions, restoreVersion, saveVersion } from '../../src/mind/versions';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osct-versions-'));
  const history = path.join(root, 'history');
  const mind = path.join(root, 'a.mind');
  const write = (bytes: string, fingerprint = 'f1') => {
    fs.writeFileSync(mind, bytes);
    fs.writeFileSync(`${mind}.sha256`, `${fingerprint}\n`);
  };
  return { history, mind, write };
}

describe('tools/mind/versions', () => {
  it('stores versions oldest first, with meta, and marks the current one', () => {
    const { history, mind, write } = setup();
    write('one');
    saveVersion(history, 'a', mind, { date: '2026-01-01T00:00:00Z', note: 'first' });
    write('two');
    saveVersion(history, 'a', mind, { date: '2026-01-02T00:00:00Z' });
    const versions = listVersions(history, 'a');
    expect(versions.map((v: any) => v.meta.note)).toEqual(['first', undefined]);
    expect(versions[0].id).toMatch(/^2026-01-01_00-00-00-[0-9a-f]{8}$/);
    expect(currentVersion(history, 'a', mind)?.id).toBe(versions[1].id);
  });

  it('stores the same bytes once', () => {
    const { history, mind, write } = setup();
    write('same');
    const a = saveVersion(history, 'a', mind, { note: 'a' });
    const b = saveVersion(history, 'a', mind, { note: 'b' });
    expect(b.id).toBe(a.id);
    expect(listVersions(history, 'a')).toHaveLength(1);
  });

  it('restores the file and its fingerprint', () => {
    const { history, mind, write } = setup();
    write('old', 'f-old');
    const old = saveVersion(history, 'a', mind, { date: '2026-01-01T00:00:00Z' });
    write('new', 'f-new');
    saveVersion(history, 'a', mind, { date: '2026-01-02T00:00:00Z' });
    restoreVersion(old, mind);
    expect(fs.readFileSync(mind, 'utf8')).toBe('old');
    expect(fs.readFileSync(`${mind}.sha256`, 'utf8').trim()).toBe('f-old');
    expect(currentVersion(history, 'a', mind)?.id).toBe(old.id);
  });

  it(`keeps the newest ${KEEP} versions and the current one`, () => {
    const { history, mind, write } = setup();
    write('v0');
    const first = saveVersion(history, 'a', mind, { date: '2026-01-01T00:00:00Z' });
    for (let i = 1; i <= KEEP + 2; i++) {
      write(`v${i}`);
      saveVersion(history, 'a', mind, { date: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() });
    }
    const versions = listVersions(history, 'a');
    expect(versions).toHaveLength(KEEP);
    expect(versions.some((v: any) => v.id === first.id)).toBe(false);
    expect(currentVersion(history, 'a', mind)).not.toBeNull();
  });
});
