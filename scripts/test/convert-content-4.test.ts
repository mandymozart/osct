import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookScopeUses, convertExperienceYaml, convertRulesYaml } from '../src/convert-content-4';
import { entry, loadBuild, makeContent, scene } from './helpers';

afterEach(() => vi.unstubAllEnvs());

/** The one-off conversion of a 3.x content source to schema 4.0 (#320) – the rules part B1's server migration follows */
describe('content 3.x → 4.0', () => {
  it('book.yaml → experience.yaml: the print data moves under book:, with its comments; sourceOfTruth goes; the rest stays', () => {
    const text = '# The book\nid: osct\ntitle: Onion Skin\nauthor: Kévin Bray\npublisher: Building Fictions\n# Made in the editor\nsourceOfTruth: digital\npasses:\n  - type: bloom\n';
    expect(convertExperienceYaml(text)).toBe(
      '# The book\nid: osct\ntitle: Onion Skin\nbook:\n  author: Kévin Bray\n  publisher: Building Fictions\npasses:\n  - type: bloom\n');
  });

  it('no print data: no book: – an experience that is not a book', () => {
    expect(convertExperienceYaml('id: wall\ntitle: A Wall\n')).toBe('id: wall\ntitle: A Wall\n');
    expect(convertExperienceYaml('id: demo\ntitle: D\n# Made in the editor\nsourceOfTruth: digital\n')).toBe('id: demo\ntitle: D\n');
  });

  it('the behaviour scope book → experience, {{book.title}} → {{experience.title}}; other words stay', () => {
    const rules = 'rules:\n  - on: tap\n    do:\n      - set: { hasKey: true }\n        scope: book\n      - set: { n: 1 }\n        scope: "book" # quoted\n';
    expect(convertRulesYaml(rules)).toBe('rules:\n  - on: tap\n    do:\n      - set: { hasKey: true }\n        scope: experience\n      - set: { n: 1 }\n        scope: "experience" # quoted\n');
    expect(convertRulesYaml('do: [{ set: { a: 1 }, scope: book }]\n')).toBe('do: [{ set: { a: 1 }, scope: experience }]\n');
    expect(convertRulesYaml('text: "{{book.title}} – {{ book.title }}"\n')).toBe('text: "{{experience.title}} – {{experience.title}}"\n');
    expect(convertRulesYaml('title: The book\nscope: bookshelf\n')).toBe('title: The book\nscope: bookshelf\n');
  });

  it('reports plugin lines that name the scope "book"', () => {
    expect(bookScopeUses('plugins/p/index.ts', 'const a = 1;\napi.vars.set("n", 1, "book");\nconst w = "a book";\n'))
      .toEqual(['plugins/p/index.ts:2: api.vars.set("n", 1, "book");']);
  });

  it('a converted source builds', async () => {
    const { content } = makeContent({
      'book.yaml': 'id: test\ntitle: T\nauthor: A\nsourceOfTruth: digital\n',
      'scenes/a/scene.yaml': scene('1–2'),
      'entries/e/entry.yaml': entry('a', 't.jpg', '  entity:\n    type: text\n    text: "{{book.title}}"\n    components:\n      - type: behaviour\n        rules:\n          - on: tap\n            do:\n              - set: { seen: true }\n                scope: book\n'),
      'entries/e/t.jpg': 'jpg',
      'plugins/p/index.ts': 'export default { vars: "book" };\n',
    });
    vi.stubEnv('OSCT_CONTENT_DIR', content);
    vi.resetModules();
    const { convertContent } = await import('../src/convert-content-4');
    expect(convertContent(content)).toEqual({ experience: true, files: ['entries/e/entry.yaml'], pluginLines: ['plugins/p/index.ts:1: export default { vars: "book" };'] });
    expect(fs.existsSync(path.join(content, 'book.yaml'))).toBe(false);
    fs.rmSync(path.join(content, 'plugins'), { recursive: true });
    const build = await loadBuild({ content });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { experience, entries } = build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(experience).toEqual({ id: 'test', title: 'T', book: { author: 'A' } });
    expect(entries[0].target?.entity).toMatchObject({ text: '{{experience.title}}', components: [{ rules: [{ do: [{ scope: 'experience' }] }] }] });
  });
});
