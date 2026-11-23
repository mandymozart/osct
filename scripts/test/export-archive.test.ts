import { spawnSync } from 'child_process';
import yaml from 'js-yaml';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceExport, ExportArchiveRecord } from '../../shared/api/editor';
import type { ContentVersion } from '../../shared/types/content-manifest';
import type { GameConfiguration } from '../../shared/types/game-config';
import { exportOfBuild, planExport } from '../src/lib/content-export';
import { DEFAULT_PURGE, planPurge, type StoreState } from '../src/lib/content-sync';
import { ARCHIVE_FOLDER, archiveBuilds, archivedBuilds, newestArchives, runArchive } from '../src/lib/export-archive';
import { MemoryStorage } from './memory-storage';

/**
 * The export archive (#322): the server's copy of the export plan (ExportArchive.php) writes the same content source as
 * content-export.ts; an archive names its media by URL and copies none; purge keeps the builds the newest archive names.
 */
afterEach(() => vi.unstubAllEnvs());

const repo = path.resolve(__dirname, '../..');
const SRC = path.join(repo, 'server/api/src');
const hasPhp = spawnSync('php', ['--version'], { encoding: 'utf8' }).status === 0;
if (!hasPhp) console.warn('export-archive: php is not on the path – the server\'s export plan is not compared (install PHP 8.1+ to run it)');

async function build(content: string): Promise<GameConfiguration> {
  vi.stubEnv('OSCT_CONTENT_DIR', content);
  vi.resetModules();
  const [{ buildPlugins }, { buildConfig }, { hashBuildInputs }] = await Promise.all([
    import('../src/build/plugins'), import('../src/build/game-config'), import('../src/lib/hash'),
  ]);
  const plugins = await buildPlugins();
  return buildConfig('test', hashBuildInputs(), plugins.map(plugin => plugin.data), { copy: false });
}

/** Runs PHP with the API's classes loaded as the API loads them; `input` on stdin, JSON back */
function php<T>(code: string, input: unknown): T {
  const script = `
    $input = json_decode(stream_get_contents(STDIN), false);
    spl_autoload_register(static function (string $class) { $file = ${JSON.stringify(SRC)} . "/$class.php"; if (is_file($file)) require $file; });
    ${code}`;
  const run = spawnSync('php', ['-r', script], { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`php failed: ${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout) as T;
}

/** The plan as data: YAML parsed, other texts as they are */
const parsed = (texts: Record<string, string>) =>
  Object.fromEntries(Object.entries(texts).map(([at, text]) => [at, at.endsWith('.yaml') ? yaml.load(text) : text]));

describe.skipIf(!hasPhp)('the export archive – the server writes what the CLI writes', () => {
  for (const fixture of ['content', 'demo']) {
    it(`fixtures/${fixture}: ExportArchive::plan gives the texts, files and problems of planExport`, async () => {
      const source = path.join(repo, 'fixtures', fixture);
      const config = await build(source);
      const data = exportOfBuild(config, source, source);
      const ts = planExport(data);
      const server = php<{ texts: Record<string, string>; downloads: Record<string, { url: string }>; problems: string[] }>(`
        $data = (array) $input;
        $data['configuration'] = $input->configuration;
        $plan = ExportArchive::plan($data);
        echo json_encode(['texts' => (object) $plan['texts'], 'downloads' => (object) $plan['downloads'], 'problems' => $plan['problems']], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);`, data);
      expect(Object.keys(server.texts).sort()).toEqual([...ts.texts.keys()].sort());
      expect(parsed(server.texts)).toEqual(parsed(Object.fromEntries(ts.texts)));
      expect(Object.fromEntries(Object.entries(server.downloads).map(([at, planned]) => [at, planned.url])))
        .toEqual(Object.fromEntries([...ts.downloads].map(([at, planned]) => [at, planned.url])));
      expect(server.problems).toEqual(ts.problems);
    }, 240_000);
  }

  it('the YAML writer: every awkward string reads back as the same value', () => {
    const value = {
      plain: 'Test Experience', empty: '', yes: 'yes', no: 'No', nul: 'null', tilde: '~', number: '1024', float: '1.5', date: '2026-11-21',
      colon: 'a: b', hash: 'a #b', dash: '- x', quote: '"q"', apostrophe: "it's", multi: 'one\ntwo\n', unicode: 'p. 38 · 1 – ü', trailing: 'x ', leading: ' x',
      backslash: 'a\\b', tab: 'a\tb', path: '/assets/content/x.webp', url: 'https://cdn.example/osct/staging/x.jpg?v=1#a',
      numbers: [0, -1, 2.5, 1e-7, 1e21], flags: [true, false, null], nested: [{ a: 1, b: [{ c: 'd' }, []] }, [1, [2]], {}],
      '1': 'numeric key', 'key with space': { '': 'empty key' },
    };
    const text = php<string>('echo json_encode(ExportArchive::yaml($input));', value);
    expect(yaml.load(text)).toEqual(value);
  });

  it('builds: the same content builds from the URLs as archiveBuilds', () => {
    const urls = [
      'https://cdn.example/osct/staging/osct/0123456789ab/assets/content/entries/a/img.webp',
      'https://cdn.example/osct/production/osct/ba9876543210/assets/content/x.mp4',
      'http://127.0.0.1:8080/api/content/local/osct/aaaaaaaaaaaa/assets/content/plugins/p/plugin-1.js',
      'https://cdn.example/osct/staging/demo/cccccccccccc/assets/content/x.jpg',
      'https://cdn.example/assets/osct/1f0c/v1.webp',
    ];
    const own = { env: 'staging', build: 'ffffffffffff' };
    const server = php<{ env: string; build: string }[]>(`echo json_encode(ExportArchive::builds($input->urls, 'osct', 'osct', (array) $input->own));`, { urls, own });
    expect(server).toEqual(archiveBuilds(urls, 'osct', 'osct', own));
    expect(server).toEqual([
      { env: 'local', build: 'aaaaaaaaaaaa' },
      { env: 'production', build: 'ba9876543210' },
      { env: 'staging', build: '0123456789ab' },
      { env: 'staging', build: 'ffffffffffff' },
    ]);
  });
});

const published = (build: string, files: ExperienceExport['files'], exportedAt = '2026-11-21T10:00:00.000Z'): ExperienceExport => ({
  experience: 'osct',
  source: { kind: 'published', env: 'staging', publishedAt: exportedAt, publishedBy: 'someone@example.com' },
  build,
  hash: build.padEnd(64, '0'),
  schema: '6.0',
  appVersion: '4.4.0',
  exportedAt,
  configuration: {
    version: { version: '4.4.0', schema: '6.0', hash: build.padEnd(64, '0') },
    experience: { id: 'osct', title: 'OSCT' },
    initialScene: 's1',
    scenes: [{ id: 's1', label: 'One', surfaces: [{ id: 'page', widthMm: 100, heightMm: 100, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] }],
    entries: [{ id: 'e1', category: 'glossary', title: 'E', scene: 's1', body: '', tags: [], image: files[0]?.url }],
    entities: {},
  } as unknown as GameConfiguration,
  files,
  unknown: 0,
  layout: null,
  plugins: [{ id: 'tint', files: [{ name: 'index.ts', text: 'export const register = () => {};\n' }], size: 33, updatedAt: '', updatedBy: 'someone@example.com', origin: null }],
  credits: {},
});

const image = (build: string) => `https://cdn.example/osct/staging/osct/${build}/assets/content/entries/e1/img.webp`;
const fileOf = (url: string): ExperienceExport['files'][number] => ({ url, path: '/assets/content/entries/e1/img.webp', origin: 'import', size: 10, sha256: null, v: 'abcabcabcabc' });

describe('the export archive – in the store', () => {
  it('writes the content source and export.json naming the media by URL – none copied, no person named; once per build', async () => {
    const storage = new MemoryStorage();
    const data = published('0000000000aa', [fileOf(image('000000000011'))]);
    const result = await runArchive(storage, 'osct/staging/osct', data, planExport(data), { instance: 'cli', title: 'osct', env: 'staging' });
    const folder = 'osct/staging/osct/exports/0000000000aa';
    expect(result.written).toBe(true);
    expect([...storage.files.keys()].sort()).toEqual([
      `${folder}/EXPORT.md`, `${folder}/entries/e1/entry.yaml`, `${folder}/experience.yaml`, `${folder}/export.json`, `${folder}/plugins/tint/index.ts`, `${folder}/scenes/s1/scene.yaml`,
    ]);
    expect(storage.puts.at(-1)).toBe(`${folder}/export.json`);
    const record = storage.json(`${folder}/export.json`) as ExportArchiveRecord;
    expect(record.files).toEqual([{ path: 'entries/e1/img.webp', url: image('000000000011'), origin: 'import', sha256: null, v: 'abcabcabcabc', size: 10 }]);
    expect(record.builds).toEqual([{ env: 'staging', build: '000000000011' }, { env: 'staging', build: '0000000000aa' }]);
    expect(record.source).toEqual({ kind: 'published', env: 'staging', publishedAt: data.exportedAt, publishedBy: null });
    expect(storage.files.get(`${folder}/EXPORT.md`)!.toString()).not.toContain('someone@example.com');

    storage.puts.length = 0;
    const again = await runArchive(storage, 'osct/staging/osct', data, planExport(data), { instance: 'cli', title: 'osct', env: 'staging' });
    expect(again.written).toBe(false);
    expect(storage.puts).toEqual([]);
  });

  it('purge keeps exports/ and every build the newest archive of any environment names', async () => {
    const storage = new MemoryStorage();
    const root = 'osct/staging/osct';
    // An older archive named build …11, the newest (staging) names …22; production's newest names staging's …33
    const older = published('0000000000a1', [fileOf(image('000000000011'))], '2026-10-01T00:00:00.000Z');
    const newer = published('0000000000a2', [fileOf(image('000000000022'))], '2026-11-01T00:00:00.000Z');
    const prod = published('0000000000b1', [fileOf(image('000000000033'))], '2026-09-01T00:00:00.000Z');
    await runArchive(storage, root, older, planExport(older), { instance: 'x', title: 'osct', env: 'staging' });
    await runArchive(storage, root, newer, planExport(newer), { instance: 'x', title: 'osct', env: 'staging' });
    await runArchive(storage, 'osct/production/osct', prod, planExport(prod), { instance: 'x', title: 'osct', env: 'production' });

    const archives = await newestArchives(storage, 'osct', 'osct');
    expect(archives.unreadable).toEqual([]);
    expect(archives.newest.map(({ env, record }) => `${env}:${record.build}`).sort()).toEqual(['production:0000000000b1', 'staging:0000000000a2']);
    const archived = archivedBuilds(archives, 'staging');
    expect([...archived.keys()].sort()).toEqual(['000000000022', '000000000033', '0000000000a2']);

    const day = 24 * 60 * 60 * 1000;
    const now = Date.parse('2026-12-31T00:00:00.000Z');
    const at = (days: number) => new Date(now - days * day).toISOString();
    const version = (build: string, retired: number | null): ContentVersion =>
      ({ build, hash: build, schema: '6.0', version: '4.4.0', uploadedAt: at(200), activatedAt: at(200), retiredAt: retired === null ? null : at(retired) });
    const folder = (name: string) => ({ path: `${root}/${name}`, size: 0, isDirectory: true, checksum: null });
    const builds = ['000000000011', '000000000022', '000000000033', '000000000044', '000000000055'];
    const state: StoreState = {
      root,
      current: { build: '000000000055', hash: '000000000055', schema: '6.0', version: '4.4.0', activatedAt: at(1) },
      versions: [...builds.slice(0, 4).map(build => version(build, 100)), version('000000000055', null)],
      listing: [...builds.map(folder), folder(ARCHIVE_FOLDER)],
    };
    const plan = planPurge(state, '000000000055', now, { ...DEFAULT_PURGE, keep: 0, unknown: true, archived });
    expect(plan.items.filter(item => item.purge).map(item => item.target)).toEqual([`${root}/000000000011/`, `${root}/000000000044/`]);
    expect(plan.items.find(item => item.build === '000000000033')?.verdict).toContain('production/exports/0000000000b1');
    expect(plan.items.find(item => item.target === `${root}/${ARCHIVE_FOLDER}/`)?.purge).toBe(false);
  });

  it('an archive without a readable export.json is reported (purge stops on it)', async () => {
    const storage = new MemoryStorage();
    await storage.put('osct/staging/osct/exports/0000000000a1/experience.yaml', 'id: osct\n');
    await storage.put('osct/staging/osct/exports/0000000000a1/export.json', '{ nope');
    expect((await newestArchives(storage, 'osct', 'osct')).unreadable).toEqual(['osct/staging/osct/exports/0000000000a1/']);
  });
});
