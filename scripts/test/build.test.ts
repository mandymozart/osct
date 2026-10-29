import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, entry, loadBuild, makeContent, spread } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const valid = () => ({
  'book.yaml': BOOK,
  'spreads/a/spread.yaml': spread(1, 2),
  'entries/second/entry.yaml': entry(2, 'y.jpg'),
  'entries/second/y.jpg': 'image y',
  'entries/first/entry.yaml': entry(1, 'x.jpg'),
  'entries/first/x.jpg': 'image x',
});

describe('content build', () => {
  it('builds valid content without errors', async () => {
    const build = await loadBuild(makeContent(valid()));
    const { book, spreads, entries } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(book.title).toBe('Test Book');
    expect(spreads.map(s => s.id)).toEqual(['a']);
    expect(entries.find(e => e.id === 'first')?.target?.imageSrc).toBe('/assets/content/entries/first/x.jpg');
  });

  it('orders entries by page, then title', async () => {
    const build = await loadBuild(makeContent(valid()));
    const { entries } = build.buildAll();
    expect(entries.map(e => e.id)).toEqual(['first', 'second']);
  });

  it('orders spreads by order, then id', async () => {
    const build = await loadBuild(makeContent({
      ...valid(),
      'spreads/b/spread.yaml': spread(3, 4, -1),
    }));
    expect(build.spreads.buildSpreads().map(s => s.id)).toEqual(['b', 'a']);
  });

  // The world and the sky as assets (content schema 2.9): paths below the content folder become content paths
  describe('environment assets', () => {
    const withEnvironment = (environment: string, files: Record<string, string> = {}) => ({
      ...valid(),
      'book.yaml': `${BOOK}environment:
${environment}`,
      ...files,
    });

    it('resolves the world model and the sky below the content folder', async () => {
      const build = await loadBuild(makeContent(withEnvironment(
        '  world: cafe\n  onionSky: true\n  worldSrc: environment/world.glb\n  skySrc: /assets/content/environment/sky.jpg\n',
        { 'environment/world.glb': 'glb', 'environment/sky.jpg': 'jpg' },
      )));
      const { book } = build.buildAll();
      expect(build.errors).toEqual([]);
      expect(book.environment).toEqual({ world: 'cafe', onionSky: true, worldSrc: '/assets/content/environment/world.glb', skySrc: '/assets/content/environment/sky.jpg' });
    });

    it('keeps an absolute URL (an uploaded asset)', async () => {
      const build = await loadBuild(makeContent(withEnvironment('  world: cafe\n  onionSky: false\n  skySrc: https://cdn.example.com/assets/b/a/v1.webp\n')));
      const { book } = build.buildAll();
      expect(build.errors).toEqual([]);
      expect(book.environment?.skySrc).toBe('https://cdn.example.com/assets/b/a/v1.webp');
    });

    it('reports a missing file, a wrong type and a path out of the folder', async () => {
      const build = await loadBuild(makeContent(withEnvironment(
        '  world: cafe\n  onionSky: true\n  worldSrc: environment/sky.jpg\n  skySrc: ../sky.jpg\n',
        { 'environment/sky.jpg': 'jpg' },
      )));
      vi.spyOn(console, 'log').mockImplementation(() => {});
      build.buildAll();
      vi.restoreAllMocks();
      expect(build.errors).toEqual(['book.yaml: environment.skySrc: file "../sky.jpg" not found in the content folder']);
      const typed = await loadBuild(makeContent(withEnvironment('  world: cafe\n  onionSky: true\n  worldSrc: environment/sky.jpg\n', { 'environment/sky.jpg': 'jpg' })));
      typed.buildAll();
      expect(typed.errors).toEqual(['book.yaml: environment.worldSrc must be a glTF model (.glb, .gltf).']);
    });
  });

  describe('errors', () => {
    const errorsFor = async (files: Record<string, string>) => {
      const build = await loadBuild(makeContent(files));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      build.buildAll();
      vi.restoreAllMocks();
      return build.errors;
    };

    it('overlapping spreads', async () => {
      expect(await errorsFor({ ...valid(), 'spreads/b/spread.yaml': spread(2, 3) }))
        .toContainEqual('spreads/a and spreads/b: page ranges overlap');
    });

    it('an entry page outside every spread', async () => {
      expect(await errorsFor({ ...valid(), 'entries/lost/entry.yaml': entry(9) }))
        .toContainEqual('entries/lost: page 9 is not part of any spread');
    });

    it('more than 10 targets on a spread', async () => {
      const files: Record<string, string> = { ...valid() };
      for (let i = 0; i < 9; i++) {
        files[`entries/extra${i}/entry.yaml`] = entry(1, 'z.jpg');
        files[`entries/extra${i}/z.jpg`] = `z${i}`;
      }
      expect(await errorsFor(files)).toContainEqual('spreads/a has 11 targets, max is 10.');
    });

    it('a missing file', async () => {
      const { 'entries/first/x.jpg': _, ...files } = valid();
      expect(await errorsFor(files)).toContainEqual('entries/first target: file "x.jpg" not found in content/entries/first/');
    });

    it('a missing entry video is a warning: the target is built without its AR video', async () => {
      const videoEntity = ['  entity:', '    type: video', '    src: video.mp4', ''].join('\n');
      const files = { ...valid(), 'entries/first/entry.yaml': entry(1, 'x.jpg', videoEntity) };
      const build = await loadBuild(makeContent(files));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const { entries } = build.buildAll();
      vi.restoreAllMocks();
      expect(build.errors).toEqual([]);
      expect(build.warnings).toContainEqual('entries/first target: video "video.mp4" is not on this machine (videos are not in git) – built without its AR video');
      expect(entries.find(e => e.id === 'first')?.target?.entity).toBeUndefined();
    });

    it('an unknown category', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/first/entry.yaml': entry(1, 'x.jpg').replace('glossary', 'poem') });
      expect(errors.join('\n')).toMatch(/entries\/first: .*category.*must be one of/);
    });

    it('an entity reference that does not exist', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/first/entry.yaml': `${entry(1, 'x.jpg')}  entity:\n    ref: nothing\n` });
      expect(errors).toContainEqual('entries/first target: entity ref "nothing" not found in content/entities/');
    });

    it('passes of a spread and the book are checked against their specs', async () => {
      const { content } = makeContent({
        'book.yaml': BOOK + 'passes:\n  - type: vignette\n    strength: 0.3\n',
        'spreads/a/spread.yaml': spread(1, 2) + 'passes:\n  - type: bloom\n    strength: 0.8\n',
        'spreads/b/spread.yaml': spread(3, 4, 1) + 'passes:\n  - type: glow\n  - type: bloom\n    radius: 7\n',
      });
      const build = await loadBuild({ content });
      const { book, spreads } = build.buildAll();
      expect(book.passes).toEqual([{ type: 'vignette', strength: 0.3 }]);
      expect(spreads.find(s => s.id === 'a')?.passes).toEqual([{ type: 'bloom', strength: 0.8 }]);
      expect(build.errors).toEqual([
        'spreads/b: passes[0].type: "glow" is not one of bloom, vignette, grade',
        'spreads/b: passes[1].radius: expected a number from 0 to 1, got 7',
      ]);
    });

    it('a missing book.yaml', async () => {
      const { 'book.yaml': _, ...files } = valid();
      expect(await errorsFor(files)).toContainEqual('book.yaml is missing');
    });
  });

  describe('tutorial', () => {
    it('sorts steps by index and leaves out empty fields', async () => {
      const build = await loadBuild(makeContent({
        ...valid(),
        'steps/two/step.yaml': 'index: 2\ntitle: Second\nfooter: ""\n',
        'steps/one/step.yaml': 'index: 1\ndescription: "Welcome to {{title}}"\n',
      }));
      const { tutorial } = build.buildAll();
      expect(build.errors).toEqual([]);
      expect(tutorial).toEqual([
        { id: 'one', index: 1, description: 'Welcome to {{title}}' },
        { id: 'two', index: 2, title: 'Second' },
      ]);
    });

    it('rejects unknown placeholders and ones the book does not have', async () => {
      const build = await loadBuild(makeContent({
        ...valid(),
        'steps/one/step.yaml': 'index: 1\ntitle: "{{isbn}}"\nfooter: "{{publisher}}"\n',
      }));
      build.buildAll();
      expect(build.errors).toEqual([
        'steps/one: title uses {{isbn}} – allowed: {{title}}, {{author}}, {{publisher}}',
        'steps/one: footer uses {{publisher}}, but book.yaml has no publisher',
      ]);
    });
  });

  describe('input hash', () => {
    it('ignores Windows line endings in text files, not content changes', async () => {
      const unix = await loadBuild(makeContent({ ...valid(), 'book.yaml': BOOK }));
      const hashUnix = unix.hash.hashBuildInputs();
      const windows = await loadBuild(makeContent({ ...valid(), 'book.yaml': BOOK.replace(/\n/g, '\r\n') }));
      expect(windows.hash.hashBuildInputs()).toBe(hashUnix);
      const changed = await loadBuild(makeContent({ ...valid(), 'book.yaml': BOOK.replace('Test', 'Other') }));
      expect(changed.hash.hashBuildInputs()).not.toBe(hashUnix);
    });
  });
});

describe('the test fixture', () => {
  it('builds without errors', { timeout: 60000 }, async () => {
    const build = await loadBuild({ content: path.resolve(__dirname, '../../fixtures/content') });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // The fixture's plugin (tint) first: Studio B's standing video uses its layer
    const plugins = await build.plugins.buildPlugins();
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(plugins.map(p => p.data.id)).toEqual(['tint']);
  });
});

describe('the demo book', () => {
  it('builds without errors: every node type, the covers, a shared entity, six plugins', { timeout: 60000 }, async () => {
    const build = await loadBuild({ content: path.resolve(__dirname, '../../fixtures/demo') });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugins = await build.plugins.buildPlugins();
    const { book, spreads, entries } = build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(book.id).toBe('demo');
    expect(plugins.map(p => p.data.id)).toEqual(['narrative', 'pulse', 'scenes', 'spin', 'tally', 'tint']);
    expect(spreads.map(s => s.format ?? 'spread')).toEqual(expect.arrayContaining(['cover', 'back', 'spread']));
    const types = new Set<string>();
    const walk = (node: { type: string; children?: Array<{ type: string }> }) => { types.add(node.type); (node.children ?? []).forEach(walk as never); };
    entries.forEach(e => { if (e.target?.entity && !('ref' in e.target.entity)) walk(e.target.entity); });
    expect([...types].sort()).toEqual(['group', 'image', 'model', 'text', 'video']);
    expect(entries.some(e => e.target?.entity && 'ref' in e.target.entity)).toBe(true);
    expect(new Set(entries.map(e => e.category))).toEqual(new Set(['glossary', 'video', 'text', 'link']));
  });
});
