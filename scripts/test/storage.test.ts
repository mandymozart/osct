import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentTypeOf, StorageClient, StorageError } from '../src/lib/storage';

/**
 * The Storage API client against a mocked fetch: what it sends, which answers count, and the retry – a server error
 * (5xx) or a lost connection is tried again (3 attempts), a client error (4xx: bad key, bad path) never.
 */
const zone = { endpoint: 'storage.example', zone: 'osct', accessKey: 'secret' };
const client = () => new StorageClient(zone);
const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: string | object = '') =>
  new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, statusText: `S${status}` });

/** Runs a call to its end, the waits between attempts included */
const settle = async <T>(call: Promise<T>): Promise<T> => {
  const result = call.then(value => ({ value }), (error: unknown) => ({ error }));
  await vi.runAllTimersAsync();
  const outcome = await result;
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
};

describe('StorageClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('addresses files below the zone, every path segment encoded', () => {
    expect(client().url('staging/abc/entries/a b/ä.jpg')).toBe('https://storage.example/osct/staging/abc/entries/a%20b/%C3%A4.jpg');
  });

  it('uploads with the access key, the content type and the SHA-256 checksum', async () => {
    fetchMock.mockResolvedValueOnce(answer(201));
    await settle(client().put('staging/latest.json', '{"build":"x"}', 'application/json'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://storage.example/osct/staging/latest.json');
    expect(init).toMatchObject({
      method: 'PUT',
      headers: {
        AccessKey: 'secret',
        'Content-Type': 'application/json',
        Checksum: createHash('sha256').update('{"build":"x"}').digest('hex').toUpperCase(),
      },
    });
  });

  it('a server error is tried again, three attempts at most', async () => {
    fetchMock.mockResolvedValueOnce(answer(503, 'busy')).mockResolvedValueOnce(answer(500)).mockResolvedValueOnce(answer(201));
    await settle(client().put('a.json', '{}'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('after three server errors the last one is thrown, with its status', async () => {
    fetchMock.mockImplementation(async () => answer(502, 'bad gateway'));
    const error = await settle(client().put('a.json', '{}')).catch((e: unknown) => e);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ status: 502, message: 'PUT a.json: 502 S502 bad gateway' });
  });

  it('a client error is thrown at once – a wrong key or path does not get better', async () => {
    for (const status of [400, 401, 403, 409]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(answer(status, 'refused'));
      const error = await settle(client().put('a.json', '{}')).catch((e: unknown) => e);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toMatchObject({ name: 'StorageError', status });
    }
  });

  it('a lost connection is tried again; three in a row throw the network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(answer(201));
    await settle(client().put('a.json', '{}'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(settle(client().put('a.json', '{}'))).rejects.toThrow(new TypeError('fetch failed'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('waits longer before each new attempt', async () => {
    fetchMock.mockResolvedValueOnce(answer(500)).mockResolvedValueOnce(answer(500)).mockResolvedValueOnce(answer(201));
    const done = client().put('a.json', '{}');
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await done;
  });

  it('exists: a ranged GET, 404 = no', async () => {
    fetchMock.mockResolvedValueOnce(answer(206, 'x')).mockResolvedValueOnce(answer(404));
    expect(await settle(client().exists('a.jpg'))).toBe(true);
    expect(await settle(client().exists('b.jpg'))).toBe(false);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { Range: 'bytes=0-0' } });
  });

  it('get: the bytes, null when missing', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, 'abc')).mockResolvedValueOnce(answer(404));
    expect(Buffer.from((await settle(client().get('a.txt')))!).toString()).toBe('abc');
    expect(await settle(client().get('b.txt'))).toBeNull();
  });

  it('list: the folder with paths relative to the zone, empty when missing', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [
      { ObjectName: 'abc', Length: 0, IsDirectory: true, Path: '/osct/staging/' },
      { ObjectName: 'latest.json', Length: 42, IsDirectory: false, Path: '/osct/staging/', Checksum: 'ab12' },
    ]));
    expect(await settle(client().list('staging/'))).toEqual([
      { path: 'staging/abc', size: 0, isDirectory: true, checksum: null },
      { path: 'staging/latest.json', size: 42, isDirectory: false, checksum: 'AB12' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://storage.example/osct/staging/');

    fetchMock.mockResolvedValueOnce(answer(404));
    expect(await settle(client().list('nothing'))).toEqual([]);
  });

  it('list: a listing of the wrong shape is an error, not a guess', async () => {
    for (const body of [{ items: [] }, [{ ObjectName: 'a', Length: '1', IsDirectory: false, Path: '/osct/' }], [null]]) {
      fetchMock.mockResolvedValueOnce(answer(200, body));
      await expect(settle(client().list('staging'))).rejects.toThrow('GET staging: unexpected listing');
    }
  });

  it('delete: a missing path is fine', async () => {
    fetchMock.mockResolvedValueOnce(answer(404));
    await settle(client().delete('staging/old/'));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('serves content files with their type', () => {
    expect(contentTypeOf('entries/a/IMAGE.JPG')).toBe('image/jpeg');
    expect(contentTypeOf('game.config.json')).toBe('application/json');
    expect(contentTypeOf('model.glb.gz')).toBe('application/gzip');
    expect(contentTypeOf('README')).toBe('application/octet-stream');
  });
});
