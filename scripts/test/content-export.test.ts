import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceExport } from '../../shared/api/editor';
import type { GameConfiguration } from '../../shared/types/game-config';
import { exportOfBuild, planExport, runExport } from '../src/lib/content-export';
import { tempDir } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const repo = path.resolve(__dirname, '../..');

/** The content build of a folder in the test (plugins, configuration, input hash) – without the copy into the client */
async function build(content: string): Promise<{ config: GameConfiguration; hash: string; errors: string[] }> {
  vi.stubEnv('OSCT_CONTENT_DIR', content);
  vi.resetModules();
  const [{ buildPlugins }, { buildConfig }, { hashBuildInputs }, { buildErrors }] = await Promise.all([
    import('../src/build/plugins'), import('../src/build/game-config'), import('../src/lib/hash'), import('../src/lib/errors'),
  ]);
  const plugins = await buildPlugins();
  const hash = hashBuildInputs();
  const config = buildConfig('test', hash, plugins.map(plugin => plugin.data), { copy: false });
  return { config, hash, errors: [...buildErrors] };
}

/** Reads a content path's file below a folder (an instance answers with URLs; here the folder serves them) */
const serveFrom = (dir: string) => async (url: string): Promise<Uint8Array> =>
  new Uint8Array(fs.readFileSync(path.join(dir, ...url.replace(/^\/assets\/content\//, '').split('/'))));

const withoutVersion = ({ version: _version, ...config }: GameConfiguration) => config;

async function exportTo(config: GameConfiguration, from: string, out: string, force = false) {
  const data = exportOfBuild(config, from, from);
  const plan = planExport(data);
  return { plan, result: await runExport(data, plan, { out, force, download: serveFrom(from), instance: 'test', cliVersion: 'test' }) };
}

describe('osct content export – the round trip', () => {
  for (const fixture of ['content', 'demo']) {
    it(`fixtures/${fixture} → build → export → build gives the same configuration; a second export the same hash`, async () => {
      const source = path.join(repo, 'fixtures', fixture);
      const first = await build(source);
      expect(first.errors).toEqual([]);

      const a = path.join(tempDir('osct-export-'), 'a');
      const exported = await exportTo(first.config, source, a);
      expect(exported.plan.problems).toEqual([]);
      expect(fs.existsSync(path.join(a, 'EXPORT.md'))).toBe(true);
      const second = await build(a);
      expect(second.errors).toEqual([]);
      expect(withoutVersion(second.config)).toEqual(withoutVersion(first.config));
      // The entries in the same order (the build sorts them by scene and title)
      expect(second.config.entries.map(entry => entry.id)).toEqual(first.config.entries.map(entry => entry.id));

      // The export of the export: the same files byte for byte, so the same input hash
      const b = path.join(tempDir('osct-export-'), 'b');
      await exportTo(second.config, a, b);
      const third = await build(b);
      expect(third.hash).toBe(second.hash);
      expect(withoutVersion(third.config)).toEqual(withoutVersion(first.config));
      if (fixture === 'demo') expect(fs.existsSync(path.join(a, 'DEMO.md'))).toBe(false); // only a folder that had it keeps it
    }, 240_000);
  }
});

describe('osct content export – the folder', () => {
  const minimal = (): ExperienceExport => ({
    experience: 'x',
    source: { kind: 'draft' },
    build: 'abcdefabcdef',
    hash: 'abcdefabcdef'.padEnd(64, '0'),
    schema: '5.1',
    appVersion: '4.1.0',
    exportedAt: '2026-11-21T00:00:00Z',
    configuration: {
      version: { version: '4.1.0', timestamp: '', schema: '5.1' },
      experience: { id: 'x', title: 'X', environment: { world: 'none', onionSky: false, skySrc: 'https://cdn.test/assets/x/sky.jpg' } as never, logic: { rules: [], canvas: { notes: [] } } as never },
      initialScene: 'b',
      scenes: [
        { id: 'a', label: 'A', group: 'g', surfaces: [{ id: 's', widthMm: 100, heightMm: 50, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] },
        { id: 'b', label: 'B', surfaces: [{ id: 's', widthMm: 100, heightMm: 50, place: { x: 0, y: 10, z: 0, rx: 90, ry: 0, rz: 0 } }] },
      ],
      groups: [{ id: 'g', label: 'Group' }],
      entries: [
        {
          id: 'one', category: 'glossary', title: 'One', scene: 'a', body: 'Line 1\nLine 2', tags: ['t'],
          target: {
            id: 'one', imageSrc: 'https://cdn.test/assets/x/target.jpg',
            recognition: { imageSrc: 'https://cdn.test/assets/x/frame.png', width: 480, height: 640 },
            entity: { type: 'video', assets: [{ id: 'one-media', assetType: 'video', src: 'https://cdn.test/assets/x/film.mp4' }] },
          },
        },
        // A second file of the same name lands next to the first under another name
        { id: 'two', category: 'glossary', title: 'Two', scene: 'a', body: '', tags: [], image: 'https://cdn.test/other/target.jpg', target: { id: 't2', imageSrc: 'https://cdn.test/assets/x/target.jpg' } },
      ],
      entities: {},
      subtitles: [{ media: 'https://cdn.test/assets/x/film.mp4', tracks: { en: 'https://cdn.test/assets/x/film.en.vtt' } }],
    } as GameConfiguration,
    files: [
      { url: 'https://cdn.test/assets/x/target.jpg', path: null, origin: 'upload', size: 1, sha256: null, v: null },
    ],
    unknown: 0,
    layout: null,
    plugins: [{ id: 'tint', files: [{ name: 'index.ts', text: 'export {};\r\n' }, { name: 'glow.frag', text: 'void main() {}\r\n' }], size: 27, updatedAt: '', updatedBy: null, origin: null }],
    credits: { 'https://cdn.test/assets/x/target.jpg': 'Photo: someone', 'https://cdn.test/unused.jpg': 'Not used' },
  });

  it('writes the source format: canvas, groups, recognition, subtitles, credits; reports what it cannot hold', () => {
    const plan = planExport(minimal());
    expect(plan.problems).toEqual(['initialScene "b" is not the first scene – a content build opens on the first scene ("a")']);
    expect(plan.texts.get('experience.yaml')).toContain('skySrc: environment/sky.jpg');
    expect(plan.texts.get('experience.yaml')).toContain('canvas:');
    expect(plan.texts.get('scenes/a/scene.yaml')).toBe('label: A\norder: 1\ngroup: g\nsurfaces:\n  - id: s\n    widthMm: 100\n    heightMm: 50\n');
    expect(plan.texts.get('scenes/b/scene.yaml')).toContain('place:');
    expect(plan.texts.get('groups.yaml')).toBe('- id: g\n  label: Group\n');
    expect(plan.texts.get('entries/one/entry.yaml')).toContain('body: |-\n  Line 1\n  Line 2');
    expect(plan.texts.get('entries/one/entry.yaml')).toContain('recognition:\n    image: frame.png\n    width: 480\n    height: 640');
    expect(plan.texts.get('entries/one/entry.yaml')).toContain('entity:\n    type: video\n    src: film.mp4');
    expect(plan.texts.get('entries/two/entry.yaml')).toContain('image: target.jpg');
    expect(plan.texts.get('entries/two/entry.yaml')).toContain('id: t2');
    expect(plan.texts.get('plugins/tint/index.ts')).toBe('export {};\n');
    expect(plan.texts.get('plugins/tint/glow.frag')).toBe('void main() {}\n');
    expect(plan.texts.get('credits.yaml')).toBe('entries/one/target.jpg: "Photo: someone"\nentries/two/target-2.jpg: "Photo: someone"\n');
    expect([...plan.downloads.keys()].sort()).toEqual([
      'entries/one/film.en.vtt', 'entries/one/film.mp4', 'entries/one/frame.png', 'entries/one/target.jpg',
      'entries/two/target-2.jpg', 'entries/two/target.jpg', 'environment/sky.jpg',
    ]);
    expect(plan.downloads.get('entries/two/target.jpg')?.url).toBe('https://cdn.test/other/target.jpg');
  });

  it('replaces only an export (or with --force), never the fixture; keeps the files export.json already has', async () => {
    const data = minimal();
    const served = new Map<string, number>();
    const download = async (url: string) => {
      served.set(url, (served.get(url) ?? 0) + 1);
      return new TextEncoder().encode(url);
    };
    const options = (out: string, force = false) => ({ out, force, download, instance: 'test', cliVersion: 'test' });
    const root = tempDir('osct-export-');
    const hand = path.join(root, 'hand');
    fs.mkdirSync(hand);
    fs.writeFileSync(path.join(hand, 'experience.yaml'), 'id: x\n');
    fs.writeFileSync(path.join(hand, 'DEMO.md'), '# demo\n');
    await expect(runExport(data, planExport(data), options(hand))).rejects.toThrow(/no export \(no EXPORT.md\)/);
    const first = await runExport(data, planExport(data), options(hand, true));
    expect(first.downloaded).toBe(7);
    expect(fs.readFileSync(path.join(hand, 'DEMO.md'), 'utf8')).toBe('# demo\n');
    expect(fs.existsSync(path.join(hand, 'EXPORT.md'))).toBe(true);
    expect(fs.existsSync(`${hand}.export-tmp`)).toBe(false);

    // Again: the file with a sha256 the instance confirms is kept, the others are fetched again (nothing known of them)
    const sha = first.record.files.find(file => file.path === 'entries/one/target.jpg')!.sha256;
    const confirmed = { ...data, files: [{ ...data.files[0], sha256: sha }] };
    const again = await runExport(confirmed, planExport(confirmed), options(hand));
    expect(again.kept).toBe(2); // target.jpg in entries/one and in entries/two (target-2.jpg) – the same URL
    expect(again.downloaded).toBe(5);

    const fixture = path.join(root, 'fixture');
    fs.mkdirSync(fixture);
    fs.writeFileSync(path.join(fixture, 'FIXTURE.md'), '');
    await expect(runExport(data, planExport(data), options(fixture, true))).rejects.toThrow(/test fixture/);
  });
});
