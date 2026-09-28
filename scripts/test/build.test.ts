import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, entry, loadBuild, makeContent, spread } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const valid = () => ({
  'book.yaml': BOOK,
  'spreads/a/spread.yaml': spread(1, 2),
  'spreads/a/a.mind': 'mind',
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
    expect(spreads[0].mindSrc).toBe('/assets/content/spreads/a/a.mind');
    expect(entries.find(e => e.id === 'first')?.target?.imageSrc).toBe('/assets/content/entries/first/x.jpg');
  });

  it('numbers targets per spread by page and copies them to .mindar/targets/ in that order', async () => {
    const dirs = makeContent(valid());
    const build = await loadBuild(dirs);
    const { entries } = build.buildAll();
    expect(Object.fromEntries(entries.map(e => [e.id, e.target?.index]))).toEqual({ first: 0, second: 1 });
    expect(fs.readdirSync(path.join(dirs.mindar, 'a')).sort()).toEqual(['0-x.jpg', '1-y.jpg', 'source.sha256']);
  });

  it('orders spreads by order, then id', async () => {
    const build = await loadBuild(makeContent({
      ...valid(),
      'spreads/b/spread.yaml': spread(3, 4, 'b.mind', -1),
      'spreads/b/b.mind': 'mind',
    }));
    expect(build.spreads.buildSpreads().map(s => s.id)).toEqual(['b', 'a']);
  });

  describe('.mind fingerprint', () => {
    it('only warns when the fingerprint is missing', async () => {
      const build = await loadBuild(makeContent(valid()));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      build.buildAll();
      expect(build.errors).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no a.mind.sha256'));
      warn.mockRestore();
    });

    it('accepts a matching fingerprint and fails on a stale one', async () => {
      const dirs = makeContent(valid());
      let build = await loadBuild(dirs);
      build.buildAll();
      const fingerprint = fs.readFileSync(path.join(dirs.mindar, 'a/source.sha256'), 'utf8');
      fs.writeFileSync(path.join(dirs.content, 'spreads/a/a.mind.sha256'), fingerprint);

      build = await loadBuild(dirs);
      build.buildAll();
      expect(build.errors).toEqual([]);

      fs.writeFileSync(path.join(dirs.content, 'entries/first/x.jpg'), 'replaced image');
      build = await loadBuild(dirs);
      build.buildAll();
      expect(build.errors).toEqual([expect.stringContaining('spreads/a/a.mind is stale')]);
    });

    it('changes when targets are reordered', async () => {
      const dirs = makeContent(valid());
      let build = await loadBuild(dirs);
      build.buildAll();
      const before = fs.readFileSync(path.join(dirs.mindar, 'a/source.sha256'), 'utf8');
      fs.writeFileSync(path.join(dirs.content, 'entries/first/entry.yaml'), entry(2, 'x.jpg', ''));
      fs.writeFileSync(path.join(dirs.content, 'entries/second/entry.yaml'), entry(1, 'y.jpg'));
      build = await loadBuild(dirs);
      build.buildAll();
      expect(fs.readFileSync(path.join(dirs.mindar, 'a/source.sha256'), 'utf8')).not.toBe(before);
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
      expect(await errorsFor({ ...valid(), 'spreads/b/spread.yaml': spread(2, 3, 'b.mind'), 'spreads/b/b.mind': 'm' }))
        .toContainEqual('spreads/a and spreads/b: page ranges overlap');
    });

    it('an entry page outside every spread', async () => {
      expect(await errorsFor({ ...valid(), 'entries/lost/entry.yaml': entry(9) }))
        .toContainEqual('entries/lost: page 9 is not part of any spread');
    });

    it('more than 5 targets on a spread', async () => {
      const files: Record<string, string> = { ...valid() };
      for (let i = 0; i < 4; i++) {
        files[`entries/extra${i}/entry.yaml`] = entry(1, 'z.jpg');
        files[`entries/extra${i}/z.jpg`] = `z${i}`;
      }
      expect(await errorsFor(files)).toContainEqual('spreads/a has 6 targets, max is 5.');
    });

    it('a missing file', async () => {
      const { 'entries/first/x.jpg': _, ...files } = valid();
      expect(await errorsFor(files)).toContainEqual('entries/first target: file "x.jpg" not found in content/entries/first/');
    });

    it('an unknown category', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/first/entry.yaml': entry(1, 'x.jpg').replace('glossary', 'poem') });
      expect(errors.join('\n')).toMatch(/entries\/first: .*category.*must be one of/);
    });

    it('an entity reference that does not exist', async () => {
      const errors = await errorsFor({ ...valid(), 'entries/first/entry.yaml': `${entry(1, 'x.jpg')}  entity:\n    ref: nothing\n` });
      expect(errors).toContainEqual('entries/first target: entity ref "nothing" not found in content/entities/');
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
      const hashUnix = unix.hash.hashBuildInputs('1.0.0');
      const windows = await loadBuild(makeContent({ ...valid(), 'book.yaml': BOOK.replace(/\n/g, '\r\n') }));
      expect(windows.hash.hashBuildInputs('1.0.0')).toBe(hashUnix);
      const changed = await loadBuild(makeContent({ ...valid(), 'book.yaml': BOOK.replace('Test', 'Other') }));
      expect(changed.hash.hashBuildInputs('1.0.0')).not.toBe(hashUnix);
      expect(unix.hash.hashBuildInputs('1.0.1')).not.toBe(hashUnix);
    });
  });
});

describe('the real content', () => {
  it('builds without errors, and every .mind matches its target images', async () => {
    const dirs = makeContent({});
    const build = await loadBuild({ content: path.resolve(__dirname, '../../content'), mindar: dirs.mindar });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
  });
});
