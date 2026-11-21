import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  deliveryScenes,
  describeComparison,
  layoutScenes,
  pagesScene,
  parseMapping,
  PLACEHOLDER_BODY,
  planScene,
  scenePages,
  unpaddedId,
  type Mapping,
} from '../src/lib/delivery-plan';
import type { DeliveryResult } from '../../shared/api/deliveries';

/** `osct delivery import` (#322 T6): the mapping, the page → scene rule, the plan and the printed comparison */
describe('the mapping', () => {
  it('reads entries without leading zeros; printed and note are read and ignored', () => {
    const problems: string[] = [];
    const mapping = parseMapping([
      'experience: osct',
      'entries:',
      '  p004-1: { category: glossary, title: "p. 4", page: 4, target: P4.jpg, printed: { width: 1, height: 2, position: x }, note: "for editors", enabled: false, tags: [artwork] }',
      '  p4-1: { category: glossary, title: dup, page: 4 }',
      '  p5-1: { category: poem, title: Bad, page: 5 }',
      '  P6_1: { category: text, title: Bad id, page: 6 }',
      '  p7-1: { category: link, title: Seven, page: 7, image: 7 }',
      '  p8-1: { category: video, title: Eight, page: 8, colour: red }',
      '  p9-1: { title: No category, page: 9 }',
    ].join('\n'), 'm.yaml', problems);
    expect(mapping.experience).toBe('osct');
    expect(mapping.entries['p4-1']).toEqual({ category: 'glossary', title: 'p. 4', page: 4, target: 'P4.jpg', enabled: false, tags: ['artwork'] });
    expect(Object.keys(mapping.entries)).toEqual(['p4-1', 'p7-1', 'p8-1']);
    expect(problems).toEqual([
      'p4-1: the same id as another entry once the leading zeros are gone (p4-1) – left out',
      expect.stringMatching(/^p5-1: category "poem" is none of /),
      'P6_1: entry ids are lowercase letters, digits and dashes',
      'p7-1.image: expected a text',
      'p8-1.colour: unknown field – left out',
      'p9-1: category, title and page are required',
    ]);
  });

  it('refuses a file without entries', () => {
    expect(() => parseMapping('experience: osct', 'm.yaml')).toThrow('m.yaml: expected a mapping with "entries"');
  });

  it('unpads ids the way the database has them (#63)', () => {
    expect(unpaddedId('p004-1')).toBe('p4-1');
    expect(unpaddedId('s004-005')).toBe('s4-5');
    expect(unpaddedId('castle')).toBe('castle');
  });
});

describe('pages → scenes', () => {
  it('pairs facing pages; page 1 and an even last page stand alone', () => {
    expect(scenePages(1, 200)).toEqual([1, 1]);
    expect(scenePages(2, 200)).toEqual([2, 3]);
    expect(scenePages(187, 200)).toEqual([186, 187]);
    expect(scenePages(200, 200)).toEqual([200, 200]);
    expect(pagesScene([186, 187])).toEqual({ id: 's186-187', label: '186–187', order: 186, pagesWide: 2, pages: [186, 187] });
  });

  it('gives each entry its scene, in book order', () => {
    const mapping: Mapping = { entries: { 'p9-1': { category: 'text', title: 'a', page: 9 }, 'p1-1': { category: 'text', title: 'b', page: 1 }, 'p8-2': { category: 'text', title: 'c', page: 8 } } };
    const { scenes, sceneOf } = deliveryScenes(mapping);
    expect(scenes.map(s => s.id)).toEqual(['s1', 's8-9']);
    expect(Object.fromEntries(sceneOf)).toEqual({ 'p9-1': 's8-9', 'p1-1': 's1', 'p8-2': 's8-9' });
  });

  it('makes every sheet of a print layout a scene, an entry on its sheet', () => {
    const sheets = [
      { id: 'cover-front', kind: 'cover-front', pages: [] },
      { id: 'f1', kind: 'front-matter', pages: [] },
      { id: 'f2', kind: 'front-matter', pages: [] },
      { id: 'p1', kind: 'spread', pages: [1] },
      { id: 'p2', kind: 'spread', pages: [2, 3] },
      { id: 'b1', kind: 'back-matter', pages: [] },
      { id: 'cover-back', kind: 'cover-back', pages: [] },
    ];
    expect(layoutScenes(sheets).map(s => [s.id, s.order, s.pagesWide])).toEqual([
      ['cover', -5, 1], ['front-1', -4, 2], ['front-2', -2, 2], ['s1', 1, 1], ['s2-3', 2, 2], ['back-1', 4, 2], ['back', 6, 1],
    ]);
    const { scenes, sceneOf } = deliveryScenes({ entries: { 'p3-1': { category: 'text', title: 'x', page: 3 } } }, { sheets });
    expect(scenes).toHaveLength(7);
    expect(sceneOf.get('p3-1')).toBe('s2-3');
  });

  it('sends a preset at the editor\'s page size, its own surface at another', () => {
    expect(planScene(pagesScene([2, 3]))).toEqual({ id: 's2-3', label: '2–3', preset: 'double' });
    expect(planScene(pagesScene([1, 1]), { width: 230, height: 320 })).toEqual({ id: 's1', label: '1', preset: 'single' });
    expect(planScene(pagesScene([2, 3]), { width: 210, height: 297 })).toEqual({ id: 's2-3', label: '2–3', surfaces: [{ id: 'surface', widthMm: 420, heightMm: 297 }] });
  });
});

describe('the plan', () => {
  const mapping: Mapping = {
    entries: {
      'p2-1': { category: 'video', title: 'Two', page: 2, target: 'a.jpg', image: 'b.jpg', video: 'v.mov', enabled: false, tags: ['artwork'], author: 'K' },
      'p3-1': { category: 'glossary', title: 'Three', page: 3, video: 'v.mov' },
      'p5-1': { category: 'link', title: 'Five', page: 5, target: 'gone.jpg' },
    },
  };
  const files = new Map([['p2-1', { target: 'https://lib/t.webp', image: 'https://lib/i.webp', video: 'https://lib/v.mp4' }], ['p3-1', {}]]);

  it('names the Library files, keeps placeholders for new texts, leaves out what could not be prepared', () => {
    const { plan, warnings } = buildPlan({ name: '2026-11-final', source: 'mapping x', mapping, files, skip: new Set(['p5-1']) });
    expect(plan).toEqual({
      name: '2026-11-final',
      source: 'mapping x',
      scenes: [{ id: 's2-3', label: '2–3', preset: 'double' }],
      entries: [
        { id: 'p2-1', scene: 's2-3', category: 'video', title: 'Two', author: 'K', body: PLACEHOLDER_BODY, tags: ['artwork'], image: 'https://lib/i.webp',
          target: { imageSrc: 'https://lib/t.webp', enabled: false, video: 'https://lib/v.mp4' } },
        { id: 'p3-1', scene: 's2-3', category: 'glossary', title: 'Three', body: PLACEHOLDER_BODY },
      ],
    });
    expect(warnings).toEqual(['p3-1: a video needs a target to play on – imported as an entry without AR']);
    // No mapping note in the plan – the API refuses unknown fields
    expect(JSON.stringify(plan)).not.toContain('note');
  });
});

describe('the comparison', () => {
  const result: DeliveryResult = {
    delivery: { id: null, name: 'd', source: null },
    applied: false,
    items: [
      { kind: 'scene', id: 's2-3', status: 'new' },
      { kind: 'entry', id: 'p2-1', status: 'new', scene: 's2-3' },
      { kind: 'target', id: 'p2-1', status: 'new', entry: 'p2-1' },
      { kind: 'entry', id: 'p4-1', status: 'same', scene: 's4-5' },
      { kind: 'target', id: 'p4-1', status: 'changed', fields: ['imageSrc', 'video'], entry: 'p4-1' },
      { kind: 'target', id: 'p6-1', status: 'conflict', reason: 'imageSrc edited in the editor', entry: 'p6-1' },
    ],
    counts: { new: 3, changed: 1, same: 1, conflict: 1 },
    problems: ['p8-1: scene s8-9 is neither in the experience nor in the plan'],
    warnings: ['p4-1: the delivery switches its target off – it stays on'],
    written: [],
  };

  it('lists what the delivery does per row, the counts, the warnings and problems', () => {
    expect(describeComparison(result)).toEqual([
      '   + scene  s2-3',
      '   + entry  p2-1 (s2-3)',
      '   + target p2-1',
      '   ~ target p4-1: imageSrc, video',
      '   ! target p6-1 – imageSrc edited in the editor',
      '3 new (1 scene, 1 entry, 1 target) · 1 changed (1 target) · 1 conflict (1 target) · 1 same (1 entry)',
      '   ⚠️  p4-1: the delivery switches its target off – it stays on',
      '   ❌ p8-1: scene s8-9 is neither in the experience nor in the plan',
    ]);
  });

  it('lists the same rows too with all', () => {
    expect(describeComparison(result, { all: true })).toContain('   = entry  p4-1 (s4-5)');
  });
});
