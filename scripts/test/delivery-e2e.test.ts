// End to end (#322 T6): `osct delivery import`'s run against the real API – PHP's built-in server on a free port, a fresh
// SQLite, mails to a log (as server/tests/api-test.php and mcp/test/e2e.test.ts do). Signs in through the mail log,
// imports a small configuration, then delivers twice: the comparison, the apply, and a second run that uploads nothing
// and compares as all `same`. Skipped with a message when php is not on the path.
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import jpeg from 'jpeg-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectRoot } from '../src/config';
import { deliveryApi, runDeliveryImport } from '../src/lib/delivery-import';
import { parseMapping } from '../src/lib/delivery-plan';
import { tempDir } from './helpers';

const hasPhp = spawnSync('php', ['--version'], { encoding: 'utf8' }).status === 0;
if (!hasPhp) console.warn('delivery e2e: php is not on the path – the end-to-end test against the API is skipped (PHP 8.1+ with pdo_sqlite runs it)');

const freePort = () => new Promise<number>((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as net.AddressInfo;
    server.close(() => resolve(port));
  });
  server.on('error', reject);
});
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PLACE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
/** A cover and a double page – the delivery adds the scene 2–3 and fills 30–31 */
const CONFIGURATION = {
  version: { version: '1.0.0', timestamp: '2026-11-21T00:00:00Z', hash: 'cd'.repeat(32), schema: '6.0' },
  experience: { id: 'osct', title: 'Delivery Test' },
  initialScene: 's1',
  scenes: [
    { id: 's1', label: 'Cover', surfaces: [{ id: 'surface', widthMm: 230, heightMm: 320, place: PLACE }] },
    { id: 's30-31', label: '30–31', surfaces: [{ id: 'surface', widthMm: 460, heightMm: 320, place: PLACE }] },
  ],
  entries: [],
};

describe.skipIf(!hasPhp)('delivery import end to end against the PHP API', () => {
  const tmp = tempDir('osct-delivery-e2e-');
  const mailLog = path.join(tmp, 'mail.log');
  let apiProcess: ChildProcess;
  let api: string;
  let token: string;
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(`${api}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json().catch(() => null) as any };
  };

  beforeAll(async () => {
    const port = await freePort();
    api = `http://127.0.0.1:${port}/api`;
    const settings: Record<string, string> = {
      DB_SQLITE_PATH: path.join(tmp, 'test.sqlite'),
      SECRET: 's'.repeat(40),
      MAIL_TRANSPORT: 'log',
      MAIL_LOG_PATH: mailLog,
      EDITORS: 'editor@example.test',
      APP_URL: 'https://app.example',
      CONTENT_STORE_DIR: path.join(tmp, 'content'),
      LOG_PATH: path.join(tmp, 'error.log'),
      CONFIG_FILE: '/nonexistent',
    };
    const env = { ...process.env, ...Object.fromEntries(Object.entries(settings).map(([k, v]) => [`OSCT_${k}`, v])) };
    const serverDir = path.resolve(projectRoot, 'server');
    apiProcess = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', serverDir, path.resolve(serverDir, 'api/index.php')], { cwd: serverDir, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    apiProcess.stderr?.on('data', chunk => (stderr += String(chunk)));
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      await sleep(100);
      up = await fetch(`${api}/health`).then(r => r.ok, () => false);
    }
    if (!up) throw new Error(`the API did not start on ${api}: ${stderr}`);
    const request = await call('POST', '/auth/request', { email: 'editor@example.test' });
    const mails = fs.readFileSync(mailLog, 'utf8').split('=== ');
    const code = /^ {4}(\d{6})\r?$/m.exec(mails[mails.length - 1])![1];
    const verified = await call('POST', '/auth/verify', { requestId: request.data.requestId, code });
    token = verified.data.session;
    const imported = await call('POST', '/editor/experiences/osct/import', { configuration: CONFIGURATION, assetsBase: 'http://127.0.0.1:9' });
    if (imported.status !== 200) throw new Error(`import: ${imported.status} ${JSON.stringify(imported.data)}`);
  }, 60000);

  afterAll(async () => {
    apiProcess?.kill();
    await sleep(200);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('compares, applies, and a second run uploads nothing and compares as all same', async () => {
    const files = path.join(tmp, 'delivery');
    fs.mkdirSync(files, { recursive: true });
    const jpg = (shade: number) => jpeg.encode({ width: 400, height: 300, data: Buffer.alloc(400 * 300 * 4, shade) }, 85).data;
    fs.writeFileSync(path.join(files, 'P2_Print.jpg'), jpg(100));
    fs.writeFileSync(path.join(files, 'P30_Print.jpg'), jpg(150));
    fs.writeFileSync(path.join(files, 'P30_Online.jpg'), jpg(200));
    fs.writeFileSync(path.join(files, 'clip.mov'), 'a video');
    const mapping = parseMapping([
      'experience: osct',
      'entries:',
      '  p2-1: { category: glossary, title: "p. 2 · 1", page: 2, target: P2_Print.jpg, enabled: false, tags: [artwork], note: dropped }',
      '  p030-1: { category: video, title: "p. 30 · 1", page: 30, target: P30_Print.jpg, image: P30_Online.jpg, video: clip.mov }',
      // A text entry further on: page 30 pairs with 31 (the mapping's last page stands alone)
      '  p35-1: { category: text, title: "p. 35 · 1", page: 35 }',
    ].join('\n'));
    const client = deliveryApi(api, token);
    const media = { cacheDir: path.join(tmp, 'cache'), encodeVideo: (source: string, output: string) => fs.copyFileSync(source, output) };
    const options = { experience: 'osct', mapping, filesDir: files, name: 'e2e-delivery', source: 'test', media };

    const compared = await runDeliveryImport(client, options);
    expect(compared.problems).toEqual([]);
    expect(compared).toMatchObject({ prepared: 4, uploaded: 4, known: 0, applied: null });
    expect(compared.comparison.problems).toEqual([]);
    expect(compared.comparison.items.filter(item => item.status === 'new').map(item => `${item.kind} ${item.id}`)).toEqual(
      expect.arrayContaining(['scene s2-3', 'entry p2-1', 'target p2-1', 'entry p30-1', 'target p30-1', 'scene s34-35', 'entry p35-1']));
    expect((await call('GET', '/editor/experiences/osct/deliveries')).data.deliveries).toEqual([]);

    const lines: string[] = [];
    const applied = await runDeliveryImport(client, { ...options, apply: true, log: line => lines.push(line) });
    expect(applied).toMatchObject({ uploaded: 0, known: 4 });
    expect(applied.applied?.applied).toBe(true);
    expect(lines.at(-1)).toMatch(/^✅ Delivery \S+ applied: \d+ changes/);
    const tree = (await call('GET', '/editor/experiences/osct')).data;
    expect(tree.scenes.map((scene: { id: string }) => scene.id)).toEqual(['s1', 's2-3', 's30-31', 's34-35']);
    const p30 = tree.scenes[2].entries.find((entry: { id: string }) => entry.id === 'p30-1');
    const library = (await call('GET', '/editor/experiences/osct/assets')).data.assets as { name: string; url: string; sha256: string }[];
    expect(p30.target.imageSrc).toBe(library.find(asset => asset.name === 'p30-1_target.webp')?.url);
    expect(library.every(asset => /^[0-9a-f]{64}$/.test(asset.sha256))).toBe(true);
    expect(tree.scenes[1].entries[0].target.enabled).toBe(false);
    const records = (await call('GET', '/editor/experiences/osct/deliveries')).data.deliveries;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: applied.applied!.delivery.id, name: 'e2e-delivery', changes: applied.applied!.written.length });

    const again = await runDeliveryImport(client, { ...options, apply: true });
    expect(again).toMatchObject({ uploaded: 0, known: 4, applied: null });
    expect(again.comparison.counts).toMatchObject({ new: 0, changed: 0, conflict: 0 });
    expect((await call('GET', '/editor/experiences/osct/deliveries')).data.deliveries).toHaveLength(1);
  }, 60000);
});
