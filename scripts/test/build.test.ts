import fs from 'fs';
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
  it('builds without errors', async () => {
    const build = await loadBuild({ content: path.resolve(__dirname, '../../content') });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
  });
});
