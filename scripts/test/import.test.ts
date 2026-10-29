import fs from 'fs';
import os from 'os';
import path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBuild, BOOK } from './helpers';

/** A delivery folder with a JPEG, a PNG with transparency and a mapping file */
function makeDelivery() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osct-delivery-'));
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
    'book: test',
    'entries:',
    '  p008-1:',
    '    category: glossary',
    '    title: "p. 8 · 1"',
    '    page: 8',
    '    target: glossary/P8_Print_01.jpg',
    '    image: glossary/P8_Online_01.jpg',
    '    printed: { width: 40, height: 20, position: top left }',
    '  p009-1:',
    '    category: link',
    '    title: Shot',
    '    page: 9',
    '    target: shot.png',
    '    note: "a note for the editors"',
    '  p001-1:',
    '    category: video',
    '    title: Video p. 1',
    '    page: 1',
    '    video: missing.mov',
    '',
  ].join('\n'));
  const content = path.join(root, 'content');
  fs.mkdirSync(content, { recursive: true });
  fs.writeFileSync(path.join(content, 'book.yaml'), BOOK);
  return { root, delivery, mapping, content };
}

async function loadImporter(content: string) {
  vi.stubEnv('OSCT_CONTENT_DIR', content);
  vi.resetModules();
  return import('../src/import-delivery');
}

describe('delivery import', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('writes resized JPEG media, entry.yaml and the spreads, and reports what is missing', async () => {
    const { delivery, mapping, content } = makeDelivery();
    const importer = await loadImporter(content);
    const report = importer.importDelivery(delivery, mapping);

    expect(report.entriesWritten).toEqual(['p008-1', 'p009-1', 'p001-1']);
    expect(report.spreadsWritten).toEqual(['s001', 's008-009']);
    expect(report.problems).toEqual([
      path.join('entries', 'p001-1', 'video.mp4') + ': delivered file not found: ' + path.join(delivery, 'missing.mov'),
    ]);
    expect(report.warnings).toEqual(['p001-1: a video needs a target to play on – imported as an entry without AR']);

    const target = jpeg.decode(fs.readFileSync(path.join(content, 'entries/p008-1/target.jpg')));
    expect([target.width, target.height]).toEqual([1600, 800]);
    const shot = jpeg.decode(fs.readFileSync(path.join(content, 'entries/p009-1/target.jpg')), { useTArray: true });
    expect([shot.width, shot.height]).toEqual([40, 20]);
    expect(shot.data[0]).toBeGreaterThan(240); // transparent pixels become white

    const entry = fs.readFileSync(path.join(content, 'entries/p009-1/entry.yaml'), 'utf8');
    expect(entry).toContain('# Note: a note for the editors');
    expect(entry).toContain('category: link');
    expect(entry).toContain('target:\n  image: target.jpg');
    expect(entry).not.toContain('image: image.jpg\n');
    expect(fs.readFileSync(path.join(content, 'entries/p008-1/entry.yaml'), 'utf8')).toContain('image: image.jpg');
    expect(fs.readFileSync(path.join(content, 'spreads/s008-009/spread.yaml'), 'utf8')).toContain('firstPage: 8\nlastPage: 9');

    // The imported content builds (page 1 has an entry without a target)
    const build = await loadBuild({ content });
    const result = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(result.entries.map(e => e.id)).toEqual(['p001-1', 'p008-1', 'p009-1']);
    expect(result.entries.find(e => e.id === 'p008-1')?.target?.imageSrc).toBe('/assets/content/entries/p008-1/target.jpg');
  });

  it('keeps edited entry.yaml files and skips media that is up to date on a second run', async () => {
    const { delivery, mapping, content } = makeDelivery();
    const importer = await loadImporter(content);
    importer.importDelivery(delivery, mapping);
    const yamlFile = path.join(content, 'entries/p008-1/entry.yaml');
    fs.writeFileSync(yamlFile, 'category: glossary\ntitle: Edited\npage: 8\ntarget:\n  image: target.jpg\n');

    const again = importer.importDelivery(delivery, mapping);
    expect(again.entriesWritten).toEqual([]);
    expect(again.spreadsWritten).toEqual([]);
    expect(again.mediaWritten).toEqual([]);
    expect(fs.readFileSync(yamlFile, 'utf8')).toContain('title: Edited');
  });

  it('pairs facing pages: 1 alone, then 2–3, 4–5 …, the last even page alone', async () => {
    const { spreadPages } = await import('../src/import-delivery');
    expect(spreadPages(1, 256)).toEqual([1, 1]);
    expect(spreadPages(2, 256)).toEqual([2, 3]);
    expect(spreadPages(3, 256)).toEqual([2, 3]);
    expect(spreadPages(255, 256)).toEqual([254, 255]);
    expect(spreadPages(256, 256)).toEqual([256, 256]);
  });

  it('reads the mapping field by field: entries that cannot be imported are reported and left out', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osct-mapping-'));
    const file = path.join(root, 'mapping.yaml');
    fs.writeFileSync(file, [
      'book: test',
      'entries:',
      '  p002-1: { category: glossary, title: Two, page: 2, note: 7, printed: { width: 30, height: 20, position: top left, x: 5 } }',
      '  p003-1: { category: glossary, title: 2026, page: 3 }',
      '  p004-1: { category: glossary, title: Four, page: "4" }',
      '  p005-1: just a text',
      '  p006-1: { category: link, title: Six, page: 6, printed: [30, 20] }',
      '',
    ].join('\n'));
    const { readMapping } = await import('../src/import-delivery');
    const problems: string[] = [];
    const mapping = readMapping(file, problems);
    expect(mapping.book).toBe('test');
    expect(Object.keys(mapping.entries)).toEqual(['p002-1', 'p006-1']);
    // Unknown fields of `printed` pass on to the trigger protocol (e.g. the exact position)
    expect(mapping.entries['p002-1']).toEqual({ category: 'glossary', title: 'Two', page: 2, printed: { width: 30, height: 20, position: 'top left', x: 5 } });
    expect(mapping.entries['p006-1']).toEqual({ category: 'link', title: 'Six', page: 6 });
    expect(problems).toEqual([
      'p002-1.note: expected a text',
      'p003-1: category, title and page are required',
      'p004-1: category, title and page are required',
      'p005-1: category, title and page are required',
      'p006-1.printed: expected { width, height, position } (mm and the place on the page)',
    ]);

    fs.writeFileSync(file, 'book: test\n');
    expect(() => readMapping(file)).toThrow(`${file}: expected a mapping with "entries"`);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('an entry with a page that is no number does not spoil the other spreads', async () => {
    const { delivery, mapping, content } = makeDelivery();
    fs.appendFileSync(mapping, '  p010-1:\n    category: glossary\n    title: Ten\n    page: ten\n');
    const importer = await loadImporter(content);
    const report = importer.importDelivery(delivery, mapping);
    expect(report.spreadsWritten).toEqual(['s001', 's008-009']);
    expect(report.problems).toContain('p010-1: category, title and page are required');
  });
});
