import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBuild, EXPERIENCE, tempDir } from './helpers';

/** A delivery folder with a JPEG, a PNG with transparency and a mapping file */
function makeDelivery() {
  const root = tempDir('osct-delivery-');
  const delivery = path.join(root, 'delivery');
  fs.mkdirSync(path.join(delivery, 'glossary'), { recursive: true });
  const jpg = jpeg.encode({ width: 2000, height: 1000, data: Buffer.alloc(2000 * 1000 * 4, 128) }, 80);
  fs.writeFileSync(path.join(delivery, 'glossary', 'P8_Print_01.jpg'), jpg.data);
  fs.writeFileSync(path.join(delivery, 'glossary', 'P8_Online_01.jpg'), jpg.data);
  const png = new PNG({ width: 40, height: 20 });
  png.data.fill(0); // fully transparent → flattened on white
  fs.writeFileSync(path.join(delivery, 'shot.png'), PNG.sync.write(png));
  const mapping = path.join(root, 'mapping.yaml');
  fs.writeFileSync(mapping, [
    'experience: test',
    'entries:',
    '  p8-1:',
    '    category: glossary',
    '    title: "p. 8 · 1"',
    '    page: 8',
    '    target: glossary/P8_Print_01.jpg',
    '    image: glossary/P8_Online_01.jpg',
    '    printed: { width: 40, height: 20, position: top left }',
    '  p9-1:',
    '    category: link',
    '    title: Shot',
    '    page: 9',
    '    target: shot.png',
    '    note: "a note for the editors"',
    '  p1-1:',
    '    category: video',
    '    title: Video p. 1',
    '    page: 1',
    '    video: missing.mov',
    '',
  ].join('\n'));
  const content = path.join(root, 'content');
  fs.mkdirSync(content, { recursive: true });
  fs.writeFileSync(path.join(content, 'experience.yaml'), EXPERIENCE);
  return { root, delivery, mapping, content };
}

async function loadImporter(content: string) {
  vi.stubEnv('OSCT_CONTENT_DIR', content);
  vi.resetModules();
  return import('../src/import-delivery');
}

describe('delivery import', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('writes resized JPEG media, entry.yaml and the scenes (pages mapped once), and reports what is missing', async () => {
    const { delivery, mapping, content } = makeDelivery();
    const importer = await loadImporter(content);
    const report = importer.importDelivery(delivery, mapping);

    expect(report.entriesWritten).toEqual(['p8-1', 'p9-1', 'p1-1']);
    expect(report.scenesWritten).toEqual(['s1', 's8-9']);
    expect(report.problems).toEqual([
      path.join('entries', 'p1-1', 'video.mp4') + ': delivered file not found: ' + path.join(delivery, 'missing.mov'),
    ]);
    expect(report.warnings).toEqual(['p1-1: a video needs a target to play on – imported as an entry without AR']);

    const target = jpeg.decode(fs.readFileSync(path.join(content, 'entries/p8-1/target.jpg')));
    expect([target.width, target.height]).toEqual([1600, 800]);
    const shot = jpeg.decode(fs.readFileSync(path.join(content, 'entries/p9-1/target.jpg')), { useTArray: true });
    expect([shot.width, shot.height]).toEqual([40, 20]);
    expect(shot.data[0]).toBeGreaterThan(240); // transparent pixels become white

    const entry = fs.readFileSync(path.join(content, 'entries/p9-1/entry.yaml'), 'utf8');
    expect(entry).toContain('# Note: a note for the editors');
    expect(entry).toContain('category: link');
    expect(entry).toContain('target:\n  image: target.jpg');
    expect(entry).not.toContain('image: image.jpg\n');
    expect(fs.readFileSync(path.join(content, 'entries/p8-1/entry.yaml'), 'utf8')).toContain('image: image.jpg');
    expect(fs.readFileSync(path.join(content, 'scenes/s8-9/scene.yaml'), 'utf8')).toContain('label: "8–9"\norder: 8\nsurfaces:\n  - id: surface\n    widthMm: 460\n    heightMm: 320\n');
    expect(fs.readFileSync(path.join(content, 'scenes/s1/scene.yaml'), 'utf8')).toContain('widthMm: 230');
    const p8 = fs.readFileSync(path.join(content, 'entries/p8-1/entry.yaml'), 'utf8');
    expect(p8).toContain('scene: s8-9');
    expect(p8).not.toMatch(/^page:/m);

    // The imported content builds (page 1 has an entry without a target)
    const build = await loadBuild({ content });
    const result = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(result.entries.map(e => [e.id, e.scene])).toEqual([['p1-1', 's1'], ['p8-1', 's8-9'], ['p9-1', 's8-9']]);
    expect(result.entries.find(e => e.id === 'p8-1')?.target?.imageSrc).toBe('/assets/content/entries/p8-1/target.jpg');
  });

  it('keeps edited entry.yaml files and skips media that is up to date on a second run', async () => {
    const { delivery, mapping, content } = makeDelivery();
    const importer = await loadImporter(content);
    importer.importDelivery(delivery, mapping);
    const yamlFile = path.join(content, 'entries/p8-1/entry.yaml');
    fs.writeFileSync(yamlFile, 'category: glossary\ntitle: Edited\nscene: s8-9\ntarget:\n  image: target.jpg\n');

    const again = importer.importDelivery(delivery, mapping);
    expect(again.entriesWritten).toEqual([]);
    expect(again.scenesWritten).toEqual([]);
    expect(again.mediaWritten).toEqual([]);
    expect(fs.readFileSync(yamlFile, 'utf8')).toContain('title: Edited');
  });

  it('pairs facing pages: 1 alone, then 2–3, 4–5 …, the last even page alone', async () => {
    const { scenePages } = await import('../src/import-delivery');
    expect(scenePages(1, 256)).toEqual([1, 1]);
    expect(scenePages(2, 256)).toEqual([2, 3]);
    expect(scenePages(3, 256)).toEqual([2, 3]);
    expect(scenePages(255, 256)).toEqual([254, 255]);
    expect(scenePages(256, 256)).toEqual([256, 256]);
  });

  it('the print layout gives the cover, the front and back matter and the back cover their scenes (#296)', async () => {
    const { layoutScenes } = await import('../src/import-delivery');
    const scenes = layoutScenes([
      { id: 'cover-front', kind: 'cover-front', pages: [] },
      { id: 'front-matter-002', kind: 'front-matter', pages: [] },
      { id: 'front-matter-003', kind: 'front-matter', pages: [] },
      { id: 'pp-001', kind: 'spread', pages: [1] },
      { id: 'pp-002-003', kind: 'spread', pages: [2, 3] },
      { id: 'pp-004', kind: 'spread', pages: [4] },
      { id: 'back-matter-006', kind: 'back-matter', pages: [] },
      { id: 'cover-back', kind: 'cover-back', pages: [] },
    ]);
    expect(scenes.map(s => [s.id, s.label, s.pagesWide])).toEqual([
      ['cover', 'Cover', 1],
      ['front-1', 'Front matter 1', 2],
      ['front-2', 'Front matter 2', 2],
      ['s1', '1', 1],
      ['s2-3', '2–3', 2],
      ['s4', '4', 1],
      ['back-1', 'Back matter 1', 2],
      ['back', 'Back cover', 1],
    ]);
    expect(scenes.map(s => s.order)).toEqual([...scenes.map(s => s.order)].sort((a, b) => a - b));
  });

  it('reads the mapping field by field: entries that cannot be imported are reported and left out', async () => {
    const root = tempDir('osct-mapping-');
    const file = path.join(root, 'mapping.yaml');
    fs.writeFileSync(file, [
      'experience: test',
      'entries:',
      '  p2-1: { category: glossary, title: Two, page: 2, note: 7, printed: { width: 30, height: 20, position: top left, x: 5 } }',
      '  p3-1: { category: glossary, title: 2026, page: 3 }',
      '  p4-1: { category: glossary, title: Four, page: "4" }',
      '  p5-1: just a text',
      '  p6-1: { category: link, title: Six, page: 6, printed: [30, 20] }',
      '',
    ].join('\n'));
    const { readMapping } = await import('../src/import-delivery');
    const problems: string[] = [];
    const mapping = readMapping(file, problems);
    expect(mapping.experience).toBe('test');
    expect(Object.keys(mapping.entries)).toEqual(['p2-1', 'p6-1']);
    // Unknown fields of `printed` pass on to the trigger protocol (e.g. the exact position)
    expect(mapping.entries['p2-1']).toEqual({ category: 'glossary', title: 'Two', page: 2, printed: { width: 30, height: 20, position: 'top left', x: 5 } });
    expect(mapping.entries['p6-1']).toEqual({ category: 'link', title: 'Six', page: 6 });
    expect(problems).toEqual([
      'p2-1.note: expected a text',
      'p3-1: category, title and page are required',
      'p4-1: category, title and page are required',
      'p5-1: category, title and page are required',
      'p6-1.printed: expected { width, height, position } (mm and the place on the page)',
    ]);

    fs.writeFileSync(file, 'experience: test\n');
    expect(() => readMapping(file)).toThrow(`${file}: expected a mapping with "entries"`);
  });

  it('writes ids without leading zeros (#63), also from a mapping written with them', async () => {
    const { pagesSceneId, readMapping, unpaddedId } = await import('../src/import-delivery');
    expect(pagesSceneId([1, 1])).toBe('s1');
    expect(pagesSceneId([4, 5])).toBe('s4-5');
    expect(pagesSceneId([100, 101])).toBe('s100-101');
    expect(['p004-1', 's004-005', 's001', 'p010-12', 'p004-1-b', 'p4-1', 'front-1', 'cover', 'pp-004', 'sign'].map(unpaddedId))
      .toEqual(['p4-1', 's4-5', 's1', 'p10-12', 'p4-1-b', 'p4-1', 'front-1', 'cover', 'pp-004', 'sign']);
    const file = path.join(tempDir('osct-mapping-'), 'mapping.yaml');
    fs.writeFileSync(file, [
      'entries:',
      '  p004-1: { category: glossary, title: Four, page: 4 }',
      '  p04-1: { category: glossary, title: Again, page: 4 }',
      '',
    ].join('\n'));
    const problems: string[] = [];
    expect(Object.keys(readMapping(file, problems).entries)).toEqual(['p4-1']);
    expect(problems).toEqual(['p04-1: the same id as another entry once the leading zeros are gone (p4-1) – left out']);
  });

  it('a target switched off and tagged: entry.yaml says so and the build takes it (#249, #248)', async () => {
    const { delivery, mapping, content } = makeDelivery();
    fs.appendFileSync(mapping, [
      '  p9-2:',
      '    category: glossary',
      '    title: "p. 9 · 2"',
      '    page: 9',
      '    target: glossary/P8_Print_01.jpg',
      '    enabled: false',
      '    tags: [artwork]',
      '  p9-3: { category: glossary, title: Three, page: 9, enabled: "no", tags: [1] }',
      '',
    ].join('\n'));
    const importer = await loadImporter(content);
    const report = importer.importDelivery(delivery, mapping);
    expect(report.problems).toContain('p9-3.enabled: expected true or false');
    expect(report.problems).toContain('p9-3.tags: expected a list of words');
    const entry = fs.readFileSync(path.join(content, 'entries/p9-2/entry.yaml'), 'utf8');
    expect(entry).toContain('tags: ["artwork"]');
    expect(entry).toContain('target:\n  image: target.jpg\n  enabled: false');

    const build = await loadBuild({ content });
    const result = build.buildAll();
    const off = result.entries.find(e => e.id === 'p9-2');
    expect(off?.tags).toEqual(['artwork']);
    expect(off?.target?.enabled).toBe(false);

    // A later delivery switches off a target whose entry.yaml exists: the file is kept, the import says so
    expect(report.warnings.some(w => w.includes('switches its target off'))).toBe(false);
    const next = path.join(path.dirname(mapping), 'next.yaml');
    fs.writeFileSync(next, 'entries:\n  p9-1: { category: link, title: Shot, page: 9, target: shot.png, enabled: false }\n');
    expect(importer.importDelivery(delivery, next).warnings).toContain(
      'p9-1: the delivery switches its target off, but entry.yaml is kept – add "enabled: false" under target (or switch it off in the editor)');
  });

  it('an entry with a page that is no number does not spoil the other scenes', async () => {
    const { delivery, mapping, content } = makeDelivery();
    fs.appendFileSync(mapping, '  p10-1:\n    category: glossary\n    title: Ten\n    page: ten\n');
    const importer = await loadImporter(content);
    const report = importer.importDelivery(delivery, mapping);
    expect(report.scenesWritten).toEqual(['s1', 's8-9']);
    expect(report.problems).toContain('p10-1: category, title and page are required');
  });
});
