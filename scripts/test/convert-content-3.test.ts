import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertEntryYaml, convertSceneYaml, sceneLabelOf } from '../src/convert-content-3';
import { BOOK, loadBuild, makeContent } from './helpers';

afterEach(() => vi.unstubAllEnvs());

/** The one-off conversion of a 2.x content source to schema 3.0 (#319) – the rules part B's server migration follows */
describe('content 2.x → 3.0', () => {
  const spreads = [
    { id: 'cover', title: 'Cover', firstPage: 0, lastPage: 0, format: 'cover' },
    { id: 'front-1', title: 'Front matter 1', firstPage: -2, lastPage: -1, matter: 'front' },
    { id: 's001', title: 'The Beginning', firstPage: 1, lastPage: 1 },
    { id: 's002-003', title: 'Two', firstPage: 2, lastPage: 3 },
    { id: 'labelled', title: 'X', firstPage: 4, lastPage: 5, label: 'Fold-out' },
  ];

  it('labels a scene as the reader showed it: its label, a cover\'s or matter\'s title, else its pages', () => {
    expect(spreads.map(sceneLabelOf)).toEqual(['Cover', 'Front matter 1', '1', '2–3', 'Fold-out']);
  });

  it('spread.yaml → scene.yaml: comments, order and passes kept, the page model gone, one surface of its width', () => {
    const text = '# A comment\ntitle: Two\norder: 2\nfirstPage: 2\nlastPage: 3\npasses:\n  - type: bloom\n';
    expect(convertSceneYaml(text, spreads[3])).toBe(
      '# A comment\nlabel: "2–3"\norder: 2\nsurfaces:\n  - id: surface\n    widthMm: 460\n    heightMm: 320\npasses:\n  - type: bloom\n');
    expect(convertSceneYaml('title: Cover\nformat: cover\nfirstPage: 0\nlastPage: 0\n', spreads[0])).toContain('    widthMm: 230\n');
  });

  it('entry.yaml: the page becomes its scene, a print its place – the right page moves by the left one\'s width', () => {
    const entry = (page: number, surface: string) =>
      `category: glossary\ntitle: T\npage: ${page}\ntarget:\n  image: t.jpg\n  print:\n    page: ${page}\n    surface: ${surface}\n    x: 60\n    y: 110\n    width: 90\n  entity:\n    type: video\n`;
    expect(convertEntryYaml(entry(3, 'right'), spreads)).toBe(
      'category: glossary\ntitle: T\nscene: s002-003\ntarget:\n  image: t.jpg\n  place:\n    x: 290\n    y: 110\n    width: 90\n  entity:\n    type: video\n');
    expect(convertEntryYaml(entry(2, 'left'), spreads)).toContain('  place:\n    x: 60\n');
    expect(convertEntryYaml(entry(0, 'front'), spreads)).toContain('scene: cover\n');
    expect(() => convertEntryYaml(entry(9, 'left'), spreads)).toThrow('page 9 is not part of any spread');
  });

  it('a converted source builds', async () => {
    const { content } = makeContent({
      'book.yaml': BOOK,
      'spreads/a/spread.yaml': 'title: A\norder: 0\nfirstPage: 1\nlastPage: 2\n',
      'entries/e/entry.yaml': 'category: glossary\ntitle: E\npage: 2\ntarget:\n  image: t.jpg\n  print:\n    surface: right\n    x: 5\n    y: 6\n    width: 7\n',
      'entries/e/t.jpg': 'jpg',
    });
    vi.stubEnv('OSCT_CONTENT_DIR', content);
    vi.resetModules();
    const { convertContent } = await import('../src/convert-content-3');
    expect(convertContent(content)).toEqual({ scenes: ['a'], entries: ['e'] });
    expect(fs.existsSync(path.join(content, 'spreads'))).toBe(false);
    const build = await loadBuild({ content });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { scenes, entries } = build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(scenes.map(s => [s.id, s.label, s.surfaces[0].widthMm])).toEqual([['a', '1–2', 460]]);
    expect(entries[0]).toMatchObject({ scene: 'a', target: { place: { x: 235, y: 6, width: 7 } } });
  });
});
