import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLandingFile, LANDING_FORMAT } from '../../shared/api/landing';
import {
  defaultLandingPick, extractExperienceLanding, extractLandingHero, landingContentProblem, landingFileOf, landingHeroStale, landingPickProblem, landingSourceOf, withLandingHero,
} from '../../shared/api/landing-extract';
import { draftFileUrl, extractDraftLanding, withContentPaths } from '../../shared/api/landing-draft';
import { assertGameConfiguration } from '../../shared/guards/game-config';
import { CONTENT_SCHEMA_VERSION, type GameConfiguration } from '../../shared/types/game-config';
import { EntryCategory } from '../../shared/types/entry';
import { EXPERIENCE, entry, loadBuild, makeContent, scene } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const PLACE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const model = (src: string) => ({ type: 'model', assets: [{ id: 'm', assetType: 'glb' as const, src }], params: { scale: 0.5 } });

/**
 * Two scenes: a spread (10–11) with two placed targets – a model and a video –, a cover with a video, a target a plugin's
 * component drives, a marginalia entry without a target, a target without an entity and a switched-off model
 */
const config = (): GameConfiguration => ({
  version: { version: '6.10.0', timestamp: '2026-11-23T00:00:00Z', hash: 'ab'.repeat(32), schema: CONTENT_SCHEMA_VERSION },
  experience: { id: 'book', title: 'A Book', book: { author: 'Someone', publisher: 'House' }, appearance: { found: { type: 'fade' } } },
  initialScene: 'p10',
  scenes: [
    { id: 'p10', label: '10–11', surfaces: [{ id: 'spread', widthMm: 460, heightMm: 320, place: PLACE }] },
    { id: 'cover', label: 'Cover', surfaces: [{ id: 'front', widthMm: 230, heightMm: 320, place: PLACE }] },
  ],
  entries: [
    { id: 'face', category: EntryCategory.Glossary, title: 'Face', scene: 'p10', body: '', tags: [], target: { id: 'face', imageSrc: '/assets/content/entries/face/face.jpg', place: { surface: 'spread', x: 46, y: 32, width: 92, height: 64 }, entity: model('/assets/content/entries/face/face.glb') } },
    { id: 'hand', category: EntryCategory.Glossary, title: 'Hand', scene: 'p10', body: '', tags: [], target: { id: 'hand', imageSrc: '/assets/content/entries/hand/hand.jpg', place: { surface: 'spread', x: 300, y: 100, width: 46 }, entity: { ref: 'clip' } } },
    { id: 'seal', category: EntryCategory.Video, title: 'Seal', scene: 'cover', body: '', tags: [], target: { id: 'seal', imageSrc: '/assets/content/entries/seal/seal.jpg', entity: { ref: 'clip' } } },
    { id: 'off', category: EntryCategory.Glossary, title: 'Off', scene: 'cover', body: '', tags: [], target: { id: 'off', imageSrc: '/assets/content/entries/off/off.jpg', enabled: false, entity: model('/assets/content/entries/off/off.glb') } },
    { id: 'glowing', category: EntryCategory.Glossary, title: 'Glowing', scene: 'cover', body: '', tags: [], target: { id: 'glowing', imageSrc: '/assets/content/entries/glowing/glowing.jpg', entity: { type: 'group', assets: [], components: [{ type: 'glow', strength: 2 }] } } },
    { id: 'note', category: EntryCategory.Glossary, title: 'A note', scene: 'cover', body: 'Marginalia.', tags: [] },
    { id: 'bare', category: EntryCategory.Glossary, title: 'Bare', scene: 'cover', body: '', tags: [], target: { id: 'bare', imageSrc: '/assets/content/entries/bare/bare.jpg' } },
  ],
  entities: { clip: { type: 'video', assets: [{ id: 'v', assetType: 'video', src: '/assets/content/entities/clip/clip.mp4' }] } },
  plugins: [{ id: 'glow', src: '/assets/content/plugins/glow/plugin.js', api: '4.0', registered: { components: { glow: { description: 'Glows.', params: { strength: { kind: 'number', default: 1, min: 0, max: 5, description: 'How much.' } } } }, nodeTypes: {}, passes: {} } }],
});
const LAYOUT = {
  sheets: [
    { kind: 'cover-front', image: 'sheets/cover.jpg' },
    { pages: [2, 3], image: 'sheets/p2-3.jpg' }, { pages: [4, 5], image: 'sheets/p4-5.jpg' }, { pages: [6, 7], image: 'sheets/p6-7.jpg' },
    { pages: [8, 9], image: 'sheets/p8-9.jpg' }, { pages: [10, 11], image: 'sheets/p10-11.jpg' },
  ],
};

describe('the landing hero extractor (#355)', () => {
  it('extracts the hero of a pick: the surface, every placed print on it, the model, the layout\'s pictures, the plugins and looks', () => {
    const hero = extractLandingHero(landingSourceOf(config()), { scene: 'p10', target: 'face' }, LAYOUT)!;
    expect(hero.aspect).toBeCloseTo(320 / 460);
    expect(hero.pages).toEqual([10, 11]);
    expect(hero.target).toEqual({ src: '/assets/content/entries/face/face.jpg', x: (46 + 46) / 460 - 0.5, top: 320 / 460 / 2 - 32 / 460, width: 92 / 460, height: 64 / 460 });
    expect(hero.prints.map(p => p.src)).toEqual(['/assets/content/entries/face/face.jpg', '/assets/content/entries/hand/hand.jpg']);
    expect(hero.spread).toBe('/assets/content/layout/sheets/p10-11.jpg');
    expect(hero.earlier).toEqual(['/assets/content/layout/sheets/p4-5.jpg', '/assets/content/layout/sheets/p6-7.jpg', '/assets/content/layout/sheets/p8-9.jpg']);
    // The other prints, the switched-off target's never
    expect([...hero.pageImages].sort()).toEqual(['/assets/content/entries/bare/bare.jpg', '/assets/content/entries/glowing/glowing.jpg', '/assets/content/entries/seal/seal.jpg']);
    expect(hero.entity).toEqual(model('/assets/content/entries/face/face.glb'));
    expect(hero.plugins).toEqual([{ id: 'glow', src: '/assets/content/plugins/glow/plugin.js', api: '4.0' }]);
    expect(hero.appearance).toEqual({ found: { type: 'fade' } });
    expect(extractExperienceLanding(landingSourceOf(config()), { scene: 'p10', target: 'face' }, LAYOUT)).toMatchObject({ scene: 'p10', target: 'face', cover: '/assets/content/layout/sheets/cover.jpg' });
  });

  it('takes a video or a component as the hero too (Tilman: "or video or component"): the entity as the configuration has it', () => {
    const source = landingSourceOf(config());
    expect(extractLandingHero(source, { scene: 'p10', target: 'hand' })!.entity).toEqual(config().entities.clip);
    expect(extractLandingHero(source, { scene: 'cover', target: 'seal' })!.entity.type).toBe('video');
    expect(extractLandingHero(source, { scene: 'cover', target: 'glowing' })!.entity).toEqual({ type: 'group', assets: [], components: [{ type: 'glow', strength: 2 }] });
  });

  it('says why a pick cannot be the hero: an unknown scene or target, marginalia or a target without AR content, one switched off', () => {
    const source = landingSourceOf(config());
    expect(landingPickProblem(source, { scene: 'p10', target: 'face' })).toBeNull();
    expect(landingPickProblem(source, { scene: 'p99', target: 'face' })).toBe('no scene "p99"');
    expect(landingPickProblem(source, { scene: 'cover', target: 'face' })).toBe('no target "face" on the scene "cover"');
    expect(landingPickProblem(source, { scene: 'p10', target: 'hand' })).toBeNull();
    expect(landingPickProblem(source, { scene: 'cover', target: 'note' })).toBe('no target "note" on the scene "cover"');
    expect(landingPickProblem(source, { scene: 'cover', target: 'bare' })).toMatch(/^the target "bare": It has no AR content/);
    expect(landingPickProblem(source, { scene: 'cover', target: 'off' })).toMatch(/no target "off"/);
    expect(extractLandingHero(source, { scene: 'cover', target: 'bare' })).toBeNull();
    expect(landingContentProblem({ type: 'group', assets: [], children: [{ type: 'light', assets: [] }] })).toMatch(/no AR content/);
    expect(landingContentProblem({ type: 'sparkle', assets: [] })).toBeNull();
  });

  it('defaults like the landing always did: the first of the fallback entries with a model, else the first model, else the first video', () => {
    const source = landingSourceOf(config());
    expect(defaultLandingPick(source, ['hand', 'face'])).toEqual({ scene: 'p10', target: 'face' });
    expect(defaultLandingPick(source, [])).toEqual({ scene: 'p10', target: 'face' });
    const videos = landingSourceOf({ ...config(), entries: config().entries.filter(e => e.id !== 'face') });
    expect(defaultLandingPick(videos, [])).toEqual({ scene: 'p10', target: 'hand' });
    expect(defaultLandingPick({ scenes: [] })).toBeNull();
  });

  it('tells an out-of-date hero: another model, a moved print, a pick that cannot be the hero any more – not a key order', () => {
    const source = landingSourceOf(config());
    const stored = extractExperienceLanding(source, { scene: 'p10', target: 'face' }, LAYOUT)!;
    const reordered = JSON.parse(JSON.stringify({ cover: stored.cover, hero: stored.hero, target: stored.target, scene: stored.scene }));
    expect(landingHeroStale(stored, reordered)).toBe(false);
    // The draft hands the stored pick out with its paths resolved below the assets base (RULES #36): still up to date
    const resolved = JSON.parse(JSON.stringify(stored).replaceAll('"/assets/content/', '"https://cdn.example/book/abc123/assets/content/'));
    expect(resolved).not.toEqual(stored);
    expect(landingHeroStale(resolved, stored)).toBe(false);
    const moved = config();
    moved.entries[0].target!.place!.x = 10;
    expect(landingHeroStale(stored, extractExperienceLanding(landingSourceOf(moved), { scene: 'p10', target: 'face' }, LAYOUT))).toBe(true);
    expect(landingHeroStale(stored, null)).toBe(true);
    expect(landingHeroStale({ scene: 'p10', target: 'face' }, stored)).toBe(true);
    expect(landingHeroStale(null, stored)).toBe(false);
  });

  it('writes landing.json: the stored hero, else the pick\'s, else the default\'s – and the configuration with its pick\'s hero passes the guard', () => {
    const picked: GameConfiguration = withLandingHero({ ...config(), experience: { ...config().experience, landing: { scene: 'p10', target: 'face' } } }, LAYOUT);
    expect(picked.experience.landing?.hero?.pages).toEqual([10, 11]);
    expect(() => assertGameConfiguration(picked)).not.toThrow();
    const file = landingFileOf(picked);
    expect(isLandingFile(file)).toBe(true);
    expect(file).toMatchObject({ format: LANDING_FORMAT, schema: CONTENT_SCHEMA_VERSION, experience: 'book', title: 'A Book', author: 'Someone', publisher: 'House', cover: '/assets/content/layout/sheets/cover.jpg' });
    expect(file.images).toEqual(['face', 'hand', 'seal', 'glowing', 'bare'].map(id => `/assets/content/entries/${id}/${id}.jpg`));
    expect(file.hero).toEqual(picked.experience.landing!.hero);
    const fallback = landingFileOf(config(), LAYOUT);
    expect(fallback.hero?.entity.assets[0].src).toBe('/assets/content/entries/face/face.glb');
    expect(landingFileOf({ ...config(), entries: [] }).hero).toBeNull();
  });
});

describe('the landing from a draft (the editor, the MCP server)', () => {
  const BASE = 'https://cdn.example/books/book/abc';
  const absolute = (value: unknown): unknown => JSON.parse(JSON.stringify(value).replaceAll('"/assets/content/', `"${BASE}/assets/content/`));

  it('finds a file of the draft by files.json, else below the assets base', () => {
    expect(draftFileUrl([`https://old.example/b1/assets/content/layout/layout.json`], BASE, '/assets/content/layout/layout.json')).toBe('https://old.example/b1/assets/content/layout/layout.json');
    expect(draftFileUrl([], `${BASE}/`, '/assets/content/layout/layout.json')).toBe(`${BASE}/assets/content/layout/layout.json`);
    expect(draftFileUrl([], '', '/assets/content/layout/layout.json')).toBeNull();
    expect(withContentPaths({ a: [`${BASE}/assets/content/x.jpg`, 'https://elsewhere/y.jpg'] }, BASE)).toEqual({ a: ['/assets/content/x.jpg', 'https://elsewhere/y.jpg'] });
  });

  it('extracts from the draft as the endpoint hands it out and stores content paths', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => (String(url) === `${BASE}/assets/content/layout/layout.json`
      ? new Response(JSON.stringify(LAYOUT)) : new Response('', { status: 404 })));
    const input = { configuration: absolute(config()) as GameConfiguration, files: {}, assetsBase: BASE, fetch: fetch as unknown as typeof globalThis.fetch };
    const result = await extractDraftLanding(input, { scene: 'p10', target: 'face' });
    expect(result).toEqual({ landing: extractExperienceLanding(landingSourceOf(config()), { scene: 'p10', target: 'face' }, LAYOUT) });
    expect(await extractDraftLanding(input, { scene: 'cover', target: 'bare' })).toEqual({ problem: expect.stringMatching(/no AR content/) });
  });
});

describe('experience.yaml landing (content build)', () => {
  const content = (landing: string) => ({
    'experience.yaml': `${EXPERIENCE}${landing}`,
    'scenes/a/scene.yaml': scene('1–2'),
    'entries/first/entry.yaml': entry('a', 'x.jpg'),
    'entries/first/x.jpg': 'image x',
  });

  it('takes scene and target; anything else is the build\'s to extract', async () => {
    const build = await loadBuild(makeContent(content('landing:\n  scene: a\n  target: first\n')));
    expect(build.buildAll().experience.landing).toEqual({ scene: 'a', target: 'first' });
    expect(build.errors).toEqual([]);
    const extra = await loadBuild(makeContent(content('landing:\n  scene: a\n  target: first\n  hero: {}\n')));
    extra.buildAll();
    expect(extra.errors).toEqual(['experience.yaml: landing: write scene and target only – hero is extracted by the build']);
    const broken = await loadBuild(makeContent(content('landing: first\n')));
    broken.buildAll();
    expect(broken.errors).toEqual(["experience.yaml: Field 'landing' in experience must be an object"]);
  });
});
