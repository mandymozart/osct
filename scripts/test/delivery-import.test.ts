import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { tempDir } from './helpers';
import {
  type DeliveryApi,
  deliveryApi,
  DeliveryProblems,
  ffmpegArgs,
  type PreparedFile,
  prepareImage,
  prepareVideo,
  runDeliveryImport,
  sha256,
} from '../src/lib/delivery-import';
import { parseMapping } from '../src/lib/delivery-plan';
import type { Asset } from '../../shared/api/editor';
import type { DeliveryPlan, DeliveryResult, DeliveryStatus } from '../../shared/api/deliveries';

/** `osct delivery import` (#322 T6): media preparation, the Library dedupe by sha256, compare → apply – against a mocked API */

function delivery() {
  const root = tempDir('osct-delivery-t6-');
  const files = path.join(root, 'files');
  fs.mkdirSync(files, { recursive: true });
  const jpg = (shade: number) => jpeg.encode({ width: 1600, height: 800, data: Buffer.alloc(1600 * 800 * 4, shade) }, 85).data;
  fs.writeFileSync(path.join(files, 'P2_Print.jpg'), jpg(120));
  fs.writeFileSync(path.join(files, 'P2_Online.jpg'), jpg(60));
  fs.writeFileSync(path.join(files, 'clip.mov'), 'not really a video');
  const mapping = parseMapping([
    'experience: osct',
    'entries:',
    '  p002-1: { category: video, title: "p. 2", page: 2, target: P2_Print.jpg, image: P2_Online.jpg, video: clip.mov }',
    // The same printed image for another entry: one file in the Library
    '  p3-1: { category: glossary, title: "p. 3", page: 3, target: P2_Print.jpg }',
    '  p4-1: { category: glossary, title: "p. 4", page: 4, target: missing.jpg }',
  ].join('\n'));
  return { root, files, mapping, cacheDir: path.join(root, 'cache') };
}

/** A fake encoder: copies the file (ffmpeg is not needed for the test) and counts the calls */
const fakeEncoder = () => {
  const calls: string[] = [];
  return { calls, encode: (source: string, output: string) => { calls.push(source); fs.copyFileSync(source, output); } };
};

/** An API in memory: a Library deduplicating by sha256, the comparison all `new` the first time, `same` once applied */
function memoryApi(library: Asset[] = []) {
  const uploads: PreparedFile[] = [];
  const delivered: DeliveryPlan[] = [];
  let appliedOnce = false;
  const api: DeliveryApi = {
    assets: async () => library,
    upload: async (_experience, file) => {
      uploads.push(file);
      const existing = library.find(asset => asset.sha256 === file.sha256);
      if (existing) return { asset: existing, existed: true };
      const asset = { id: `a${library.length}`, name: file.name, url: `https://lib/${library.length}-${file.name}`, sha256: file.sha256 } as Asset;
      library.push(asset);
      return { asset, existed: false };
    },
    deliver: async (_experience, plan) => {
      delivered.push(plan);
      const status: DeliveryStatus = appliedOnce ? 'same' : 'new';
      const items = plan.entries.map(entry => ({ kind: 'entry' as const, id: entry.id, status, scene: entry.scene }));
      if (plan.apply) appliedOnce = true;
      return {
        delivery: { id: plan.apply ? 'd1' : null, name: plan.name, source: plan.source ?? null },
        applied: plan.apply === true,
        items,
        counts: { new: status === 'new' ? items.length : 0, changed: 0, same: status === 'same' ? items.length : 0, conflict: 0 },
        problems: [],
        warnings: [],
        written: plan.apply ? ['c1', 'c2'] : [],
      } satisfies DeliveryResult;
    },
  };
  return { api, uploads, delivered, library };
}

describe('media', () => {
  it('a printed image as WebP within the target size, the same bytes from the cache on a second run', async () => {
    const { files, cacheDir } = delivery();
    const first = await prepareImage(path.join(files, 'P2_Print.jpg'), 'p2-1', 'target', { cacheDir });
    expect(first).toMatchObject({ name: 'p2-1_target.webp', type: 'image/webp', query: '?fit=target&entry=p2-1' });
    expect(new TextDecoder().decode(first.bytes.slice(8, 12))).toBe('WEBP');
    expect(fs.readdirSync(cacheDir)).toHaveLength(1);
    const second = await prepareImage(path.join(files, 'P2_Print.jpg'), 'p2-1', 'target', { cacheDir });
    expect(second.sha256).toBe(first.sha256);
    const picture = await prepareImage(path.join(files, 'P2_Print.jpg'), 'p2-1', 'entryImage', { cacheDir });
    expect(picture).toMatchObject({ name: 'p2-1_image.webp', query: '?fit=entryImage&entry=p2-1' });
    await expect(prepareImage(path.join(files, 'clip.mov'), 'x', 'target', { cacheDir })).rejects.toThrow('JPEG and PNG only');
    await expect(prepareImage(path.join(files, 'nope.jpg'), 'x', 'target', { cacheDir })).rejects.toThrow('delivered file not found');
  });

  it('a video encoded once, then from the cache; a failing encoder leaves nothing behind', () => {
    const { files, cacheDir } = delivery();
    const encoder = fakeEncoder();
    const video = prepareVideo(path.join(files, 'clip.mov'), 'p2-1', { cacheDir, encodeVideo: encoder.encode });
    expect(video).toMatchObject({ name: 'p2-1_video.mp4', type: 'video/mp4', query: '' });
    prepareVideo(path.join(files, 'clip.mov'), 'p2-1', { cacheDir, encodeVideo: encoder.encode });
    expect(encoder.calls).toHaveLength(1);
    const other = path.join(files, 'other.mov');
    fs.writeFileSync(other, 'another');
    expect(() => prepareVideo(other, 'p3-1', { cacheDir, encodeVideo: () => { throw new Error('ffmpeg failed – no codec'); } })).toThrow('ffmpeg failed');
    expect(fs.readdirSync(cacheDir).filter(name => name.includes('.part'))).toEqual([]);
  });

  it('ffmpeg: H.264 at most 1280 px, AAC, faststart (as the folder import)', () => {
    const args = ffmpegArgs('in.mov', 'out.mp4');
    expect(args).toEqual(expect.arrayContaining(['libx264', 'aac', '+faststart']));
    expect(args.join(' ')).toContain('min(1280,iw)');
    expect(args.at(-1)).toBe('out.mp4');
  });
});

describe('the run', () => {
  it('uploads each file once, compares, writes nothing without apply', async () => {
    const { files, mapping, cacheDir } = delivery();
    const encoder = fakeEncoder();
    const { api, uploads, delivered } = memoryApi();
    const lines: string[] = [];
    const report = await runDeliveryImport(api, { experience: 'osct', mapping, filesDir: files, name: 'test', media: { cacheDir, encodeVideo: encoder.encode }, log: line => lines.push(line) });
    // target, image, video of p2-1; p3-1's target is the same file → found, not uploaded again
    expect(uploads.map(file => file.name)).toEqual(['p2-1_target.webp', 'p2-1_image.webp', 'p2-1_video.mp4']);
    expect(report).toMatchObject({ prepared: 4, uploaded: 3, known: 1, applied: null });
    expect(report.problems).toEqual([expect.stringMatching(/^p4-1\.target: delivered file not found: .* – the entry is left out$/)]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].apply).toBeUndefined();
    expect(delivered[0].entries.map(entry => entry.id)).toEqual(['p2-1', 'p3-1']);
    expect(delivered[0].entries[1].target?.imageSrc).toBe(delivered[0].entries[0].target?.imageSrc);
    expect(lines).toContain('4 files prepared: 3 uploaded, 1 already in the Library');
    expect(lines.at(-1)).toBe('Compared only – nothing written. --apply writes it.');
  });

  it('applies after the comparison; a second run uploads nothing and has nothing to write', async () => {
    const { files, mapping, cacheDir } = delivery();
    const encoder = fakeEncoder();
    const memory = memoryApi();
    const options = { experience: 'osct', mapping, filesDir: files, name: 'test', apply: true, media: { cacheDir, encodeVideo: encoder.encode } };
    const first = await runDeliveryImport(memory.api, options);
    expect(memory.delivered.map(plan => plan.apply ?? false)).toEqual([false, true]);
    expect(first.applied?.delivery.id).toBe('d1');
    const lines: string[] = [];
    const second = await runDeliveryImport(memory.api, { ...options, log: line => lines.push(line) });
    expect(second).toMatchObject({ uploaded: 0, known: 4, applied: null });
    expect(memory.uploads).toHaveLength(3);
    expect(encoder.calls).toHaveLength(1);
    expect(memory.delivered).toHaveLength(3);
    expect(lines.at(-1)).toBe('Nothing to write – the draft has this delivery.');
  });

  it('finds files the Library holds by their sha256 before uploading', async () => {
    const { files, cacheDir } = delivery();
    const target = await prepareImage(path.join(files, 'P2_Print.jpg'), 'p3-1', 'target', { cacheDir });
    const memory = memoryApi([{ id: 'old', name: 'old.webp', url: 'https://lib/old.webp', sha256: target.sha256 } as Asset]);
    const mapping = parseMapping('entries:\n  p3-1: { category: glossary, title: "p. 3", page: 3, target: P2_Print.jpg }');
    const report = await runDeliveryImport(memory.api, { experience: 'osct', mapping, filesDir: files, name: 't', media: { cacheDir } });
    expect(memory.uploads).toEqual([]);
    expect(report.plan.entries[0].target?.imageSrc).toBe('https://lib/old.webp');
  });
});

describe('the API client', () => {
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('sends the token, the file with its use and the plan', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      if (url.endsWith('/assets?fit=target&entry=p2-1')) return answer(201, { asset: { id: 'a', url: 'https://lib/a.webp' } });
      if (url.endsWith('/assets')) return answer(200, { assets: [] });
      return answer(200, { counts: {} });
    }) as typeof fetch;
    const api = deliveryApi('http://api', 'tok', fetcher);
    const bytes = new Uint8Array([1, 2]);
    expect(await api.upload('osct', { name: 'p2-1_target.webp', type: 'image/webp', bytes, sha256: sha256(bytes), query: '?fit=target&entry=p2-1' })).toEqual({ asset: { id: 'a', url: 'https://lib/a.webp' }, existed: false });
    await api.deliver('osct', { name: 'd', entries: [] });
    expect(seen[0].url).toBe('http://api/editor/experiences/osct/assets?fit=target&entry=p2-1');
    expect(seen[0].init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-File-Name': 'p2-1_target.webp', 'Content-Type': 'image/webp' });
    expect(seen[1]).toMatchObject({ url: 'http://api/editor/experiences/osct/deliveries', init: { method: 'POST', body: '{"name":"d","entries":[]}' } });
  });

  it('turns a 409 delivery-problems into the comparison, any other error into a message', async () => {
    const comparison = { problems: ['too many targets on s2-3'] };
    const api = deliveryApi('http://api', 'tok', (async () => answer(409, { error: { code: 'delivery-problems', comparison } })) as unknown as typeof fetch);
    await expect(api.deliver('osct', { name: 'd', entries: [], apply: true })).rejects.toBeInstanceOf(DeliveryProblems);
    const denied = deliveryApi('http://api', 'tok', (async () => answer(403, { error: { code: 'forbidden' } })) as unknown as typeof fetch);
    await expect(denied.assets('osct')).rejects.toThrow('GET /editor/experiences/osct/assets → 403');
  });
});
