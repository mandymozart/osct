import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentManifest, ContentVersion } from '../../shared/types/content-manifest';
import {
  cdnManifest,
  checkCdn,
  type ContentBuild,
  DEFAULT_PURGE,
  planPurge,
  planSync,
  readEnvironment,
  runPurge,
  runSync,
} from '../src/lib/content-sync';
import { StorageClient, type StoredFile } from '../src/lib/storage';

/** A storage zone in memory: files by path, folders implied by the paths */
class MemoryStorage extends StorageClient {
  files = new Map<string, Buffer>();
  puts: string[] = [];
  deletes: string[] = [];

  constructor() {
    super({ endpoint: 'storage.example', zone: 'osct', accessKey: 'key' });
  }

  async put(path: string, data: Uint8Array | string): Promise<void> {
    this.puts.push(path);
    this.files.set(path, typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  }

  async get(path: string): Promise<Uint8Array | null> {
    return this.files.get(path) ?? null;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async list(folder: string): Promise<StoredFile[]> {
    const prefix = `${folder.replace(/\/$/, '')}/`;
    const children = new Map<string, StoredFile>();
    for (const [path, data] of this.files) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...rest] = path.slice(prefix.length).split('/');
      children.set(name, { path: `${prefix}${name}`, size: rest.length ? 0 : data.length, isDirectory: rest.length > 0, checksum: null });
    }
    return [...children.values()];
  }

  async delete(path: string): Promise<void> {
    this.deletes.push(path);
    for (const file of [...this.files.keys()]) {
      if (path.endsWith('/') ? file.startsWith(path) : file === path) this.files.delete(file);
    }
  }

  json(path: string): unknown {
    const data = this.files.get(path);
    return data ? JSON.parse(data.toString('utf8')) : undefined;
  }
}

/** A build without media files (nothing to read from client/public): only files.json and the configuration go up */
const build = (name: string, book = 'test'): ContentBuild => ({
  build: name,
  hash: name.padEnd(64, '0'),
  schema: '2.11',
  version: '1.26.7',
  book,
  config: Buffer.from(`{"build":"${name}"}`),
  files: [],
});

const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';

describe('content sync and purge against a storage zone', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a first sync uploads the version, its configuration last, then makes it current', async () => {
    const plan = await planSync(storage, 'staging', build(A));
    expect(plan).toMatchObject({ uploaded: false, current: false, missingVideos: [] });
    await runSync(storage, plan);

    expect(storage.puts).toEqual([`staging/${A}/files.json`, `staging/${A}/game.config.json`, 'staging/versions.json', 'staging/latest.json']);
    expect(storage.json('staging/latest.json')).toMatchObject({ build: A, schema: '2.11', version: '1.26.7', book: 'test' } satisfies Partial<ContentManifest>);
    const versions = storage.json('staging/versions.json') as ContentVersion[];
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ build: A, retiredAt: null });

    // Again: nothing to do
    const again = await planSync(storage, 'staging', build(A));
    expect(again).toMatchObject({ uploaded: true, current: true });
    storage.puts = [];
    await runSync(storage, again);
    expect(storage.puts).toEqual([]);
  });

  it('a new version retires the current one in versions.json', async () => {
    await runSync(storage, await planSync(storage, 'staging', build(A)));
    await runSync(storage, await planSync(storage, 'staging', build(B)));
    const versions = storage.json('staging/versions.json') as ContentVersion[];
    expect(versions.map(v => [v.build, v.retiredAt === null])).toEqual([[A, false], [B, true]]);
    expect((storage.json('staging/latest.json') as ContentManifest).build).toBe(B);
  });

  it('switching back to a version on the storage uploads nothing (rollback)', async () => {
    await runSync(storage, await planSync(storage, 'staging', build(A)));
    await runSync(storage, await planSync(storage, 'staging', build(B)));
    storage.puts = [];
    const plan = await planSync(storage, 'staging', build(A));
    expect(plan).toMatchObject({ uploaded: true, current: false });
    await runSync(storage, plan);
    expect(storage.puts).toEqual(['staging/versions.json', 'staging/latest.json']);
  });

  it('--force uploads a version that is on the storage again', async () => {
    await runSync(storage, await planSync(storage, 'staging', build(A)));
    expect(await planSync(storage, 'staging', build(A), true)).toMatchObject({ uploaded: false, current: true });
  });

  it('refuses to switch versions while versions.json is not readable', async () => {
    storage.files.set('staging/versions.json', Buffer.from('not json'));
    const plan = await planSync(storage, 'staging', build(A));
    await expect(runSync(storage, plan)).rejects.toThrow('staging/versions.json is not readable');
    expect(storage.files.has('staging/latest.json')).toBe(false);
  });

  it('reads an environment: unreadable files are null, missing ones undefined', async () => {
    expect(await readEnvironment(storage, 'staging')).toEqual({ env: 'staging', listing: [], current: undefined, versions: undefined });
    storage.files.set('staging/latest.json', Buffer.from('{"build":1}'));
    storage.files.set('staging/versions.json', Buffer.from('[{"build":"x"}]'));
    expect(await readEnvironment(storage, 'staging')).toMatchObject({ current: null, versions: null });
  });

  it('purge deletes what the plan purges and writes versions.json without it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
    await runSync(storage, await planSync(storage, 'staging', build(A)));
    vi.setSystemTime(Date.parse('2026-01-02T00:00:00Z'));
    await runSync(storage, await planSync(storage, 'staging', build(B)));
    const state = await readEnvironment(storage, 'staging');

    // Retired a day ago: an edge may still serve it
    const early = planPurge(state, B, Date.parse('2026-01-03T00:00:00Z'), { ...DEFAULT_PURGE, keep: 0 });
    expect(early.items.filter(i => i.purge)).toEqual([]);

    const plan = planPurge(state, B, Date.parse('2026-03-01T00:00:00Z'), { ...DEFAULT_PURGE, keep: 0 });
    expect(plan.items.filter(i => i.purge).map(i => i.target)).toEqual([`staging/${A}/`]);
    await runPurge(storage, plan);
    expect(storage.deletes).toEqual([`staging/${A}/`]);
    expect([...storage.files.keys()].some(file => file.startsWith(`staging/${A}/`))).toBe(false);
    expect((storage.json('staging/versions.json') as ContentVersion[]).map(v => v.build)).toEqual([B]);
  });

  it('reads what the CDN serves: the manifest, the cache status and whether it sends CORS', async () => {
    const manifest: ContentManifest = { build: A, hash: 'h', schema: '2.11', version: '1.26.7', activatedAt: '2026-01-01T00:00:00Z' };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(JSON.stringify(manifest), {
      status: 200, headers: { 'cdn-cache': 'MISS', 'access-control-allow-origin': '*' },
    }));
    vi.stubGlobal('fetch', fetch);
    expect(await cdnManifest('https://cdn.example/staging')).toEqual({ manifest, status: '200 MISS', cors: true });
    expect(String(fetch.mock.calls[0][0])).toMatch(/^https:\/\/cdn\.example\/staging\/latest\.json\?t=\d+$/);

    fetch.mockResolvedValueOnce(new Response('{"build":1}', { status: 200 }));
    expect(await cdnManifest('https://cdn.example/staging')).toEqual({ manifest: null, status: '200', cors: false });
    fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await cdnManifest('https://cdn.example/staging')).toMatchObject({ manifest: null, status: '404' });
  });

  it('checkCdn waits until the CDN serves the new version, and gives up with a warning after a minute', async () => {
    vi.useFakeTimers();
    const served = (name: string) => new Response(JSON.stringify({ build: name, hash: 'h', schema: '2.11', version: '1', activatedAt: 'x' }), {
      status: 200, headers: { 'access-control-allow-origin': '*' },
    });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(served(A))
      .mockResolvedValueOnce(served(B));
    vi.stubGlobal('fetch', fetch);
    const done = checkCdn('https://cdn.example/staging', build(B));
    await vi.runAllTimersAsync();
    await done;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();

    fetch.mockReset();
    fetch.mockImplementation(async () => served(A));
    const stale = checkCdn('https://cdn.example/staging', build(B));
    await vi.advanceTimersByTimeAsync(70_000);
    await stale;
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`The CDN still serves ${A} after 60 s`));
  });
});
