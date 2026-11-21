/**
 * `osct delivery import` (#322 T6), the pure part: a publisher's mapping file read, its pages turned into scenes (the
 * rule of the content folder's import, `import-delivery.ts`, kept), the delivery plan built for
 * `POST /editor/experiences/{id}/deliveries` (shared/api/deliveries.ts) and the server's comparison printed. No file, no
 * network – `delivery-import.ts` prepares the media, uploads them and calls the API.
 *
 * Mapping file (`scripts/import/<delivery>.yaml`, paths relative to the delivery folder):
 *   experience: osct
 *   entries:
 *     <entry id>:
 *       category: glossary | video | text | link      title, page   (entry fields; author, body, caption, media optional)
 *       target: <file>      the image as printed – the target's image (WebP, `fit=target`)
 *       image: <file>       the entry image (WebP, `fit=entryImage`)
 *       video: <file>       AR video on the target (ffmpeg: H.264, ≤ 1280 px, ~2 Mbit/s)
 *       enabled: false      the target is switched off (#249) – a new target only; an existing one keeps its switch
 *       tags: [<tag>, …]    a new entry's tags
 *       printed, note       read and ignored: `printed` is unused since #32, the note is not stored (Tilman, 2026-11-20)
 *
 * The page → scene rule (content schema 3.0, #319): one scene per pair of facing pages (page 1 and the last page stand
 * alone) for every page with an entry: `s<first>-<last>`, label "<first>–<last>", a double page one surface twice the
 * page's width (preset `double`), a single page one page wide (`single`). With a print layout (`layout.json`, #296)
 * every sheet of it gets its scene too: the cover, the front and back matter, the numbered sheets without an entry and
 * the back cover (`layoutScenes`), the page size from the layout.
 */
import yaml from 'js-yaml';
import { isObject } from '../../../shared/guards/game-config';
import { ENTRY_CATEGORIES } from '../../../shared/types/entry';
import { SCENE_PAGE_MM } from '../../../shared/api/editor';
import type { DeliveryEntry, DeliveryPlan, DeliveryResult, DeliveryScene, DeliveryStatus } from '../../../shared/api/deliveries';

export interface MappedEntry {
  category: string;
  title: string;
  page: number;
  author?: string;
  body?: string;
  caption?: string;
  media?: string;
  target?: string;
  image?: string;
  video?: string;
  enabled?: boolean;
  tags?: string[];
}

export interface Mapping {
  experience?: string;
  entries: Record<string, MappedEntry>;
}

const OPTIONAL_TEXTS = ['author', 'body', 'caption', 'media', 'target', 'image', 'video'] as const;
/** Read and ignored (#32: `printed` unused; the note is not stored, decision 2026-11-20) */
const IGNORED = ['printed', 'note'];
export const ENTRY_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * An id without leading zeros (#63): `p004-1` → `p4-1`, `s004-005` → `s4-5` – a mapping written before keeps working
 * and names the ids the database has since the one-off rename (#63, 3.10.0); any other id stays as it is
 */
export const unpaddedId = (id: string): string =>
  id.replace(/^([sp])(\d+)(?:-(\d+))?(?=\D|$)/, (_, prefix: string, first: string, second?: string) =>
    `${prefix}${Number(first)}${second === undefined ? '' : `-${Number(second)}`}`);

/** One entry of the mapping, read field by field; null (and why in `problems`) when it cannot be imported */
function readMappedEntry(id: string, value: unknown, problems: string[]): MappedEntry | null {
  const required = `${id}: category, title and page are required`;
  if (!isObject(value)) {
    problems.push(required);
    return null;
  }
  const { category, title, page, enabled, tags } = value;
  if (typeof category !== 'string' || !category || typeof title !== 'string' || !title || typeof page !== 'number' || !Number.isFinite(page)) {
    problems.push(required);
    return null;
  }
  if (!ENTRY_ID.test(id)) {
    problems.push(`${id}: entry ids are lowercase letters, digits and dashes`);
    return null;
  }
  if (!(ENTRY_CATEGORIES as readonly string[]).includes(category)) {
    problems.push(`${id}: category "${category}" is none of ${ENTRY_CATEGORIES.join(', ')}`);
    return null;
  }
  const entry: MappedEntry = { category, title, page };
  for (const key of OPTIONAL_TEXTS) {
    const text = value[key];
    if (typeof text === 'string') entry[key] = text;
    else if (text !== undefined && text !== null) problems.push(`${id}.${key}: expected a text`);
  }
  if (typeof enabled === 'boolean') entry.enabled = enabled;
  else if (enabled !== undefined && enabled !== null) problems.push(`${id}.enabled: expected true or false`);
  if (Array.isArray(tags) && tags.every(tag => typeof tag === 'string' && tag !== '')) entry.tags = tags;
  else if (tags !== undefined && tags !== null) problems.push(`${id}.tags: expected a list of words`);
  for (const key of Object.keys(value)) {
    if (!['category', 'title', 'page', 'enabled', 'tags', ...OPTIONAL_TEXTS, ...IGNORED].includes(key)) problems.push(`${id}.${key}: unknown field – left out`);
  }
  return entry;
}

/**
 * A mapping file's text: its entries that can be imported (ids without leading zeros). Every entry that cannot (or a
 * field of the wrong type, which is left out) is reported in `problems`; a text without `entries` is refused.
 */
export function parseMapping(text: string, name = 'mapping', problems: string[] = []): Mapping {
  const data: unknown = yaml.load(text);
  if (!isObject(data) || !isObject(data.entries)) throw new Error(`${name}: expected a mapping with "entries"`);
  const entries: Record<string, MappedEntry> = {};
  for (const [key, value] of Object.entries(data.entries)) {
    const id = unpaddedId(key);
    if (entries[id]) {
      problems.push(`${key}: the same id as another entry once the leading zeros are gone (${id}) – left out`);
      continue;
    }
    const entry = readMappedEntry(id, value, problems);
    if (entry) entries[id] = entry;
  }
  return { ...(typeof data.experience === 'string' ? { experience: data.experience } : {}), entries };
}

// ── Pages → scenes ───────────────────────────────────────────────────────────────────────────────

/** The pair of facing pages a page belongs to: 1 | 2–3 | 4–5 | … | last (alone when even) */
export const scenePages = (page: number, lastPage: number): [number, number] => {
  if (page <= 1) return [1, 1];
  const first = page - (page % 2);
  return [first, Math.min(first + 1, lastPage)];
};

/** The scene id of a page range: `s1`, `s2-3` – no leading zeros (#63): the order is the scene's place, never its id */
export const pagesSceneId = ([first, last]: [number, number]) => (first === last ? `s${first}` : `s${first}-${last}`);

/** A layout sheet as `layout.json` lists it – what `layoutScenes` reads */
export interface LayoutSheetLike {
  id: string;
  kind: string;
  pages: number[];
}

/** A print layout as `layout.json` holds it, as far as scenes go */
export interface LayoutLike {
  page?: { width: number; height: number };
  sheets?: LayoutSheetLike[];
}

/**
 * A scene of the delivery: its id, label, order and how many pages wide its one surface is – a double page is one
 * surface of twice the page's width, a cover or a single page one of the page's width. The pages are the import's
 * only: they place the scene in the order and the entries on it once, and are not sent.
 */
export interface ImportScene {
  id: string;
  label: string;
  order: number;
  /** 1 (a cover, a single page) or 2 (a double page) */
  pagesWide: 1 | 2;
  /** The printed pages it holds (internal numbers for front and back matter – only to find an entry's scene) */
  pages: [number, number];
}

/** The scene of a page range: `186–187` (one surface, two pages wide), a single page `1` */
export const pagesScene = (range: [number, number]): ImportScene => ({
  id: pagesSceneId(range),
  label: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
  order: range[0],
  pagesWide: range[0] === range[1] ? 1 : 2,
  pages: range,
});

/**
 * The scenes of a print layout's sheets, in book order: the cover, the front matter (`front-1` … `front-<n>`, the
 * last one next to page 1), one scene per numbered sheet, the back matter after the last printed page (`back-1` …)
 * and the back cover. `order` sorts them (the cover first); the pages are the import's own numbering.
 */
export const layoutScenes = (sheets: readonly LayoutSheetLike[]): ImportScene[] => {
  const front = sheets.filter(sheet => sheet.kind === 'front-matter');
  const back = sheets.filter(sheet => sheet.kind === 'back-matter');
  const numbered = sheets.filter(sheet => sheet.kind === 'spread' && sheet.pages.length > 0);
  const lastPrinted = Math.max(0, ...numbered.flatMap(sheet => sheet.pages));
  const scenes: ImportScene[] = [];
  if (sheets.some(sheet => sheet.kind === 'cover-front')) {
    scenes.push({ id: 'cover', label: 'Cover', order: -2 * front.length - 1, pagesWide: 1, pages: [0, 0] });
  }
  front.forEach((_, i) => {
    const first = -2 * (front.length - i);
    scenes.push({ id: `front-${i + 1}`, label: `Front matter ${i + 1}`, order: first, pagesWide: 2, pages: [first, first + 1] });
  });
  for (const sheet of numbered) scenes.push(pagesScene([Math.min(...sheet.pages), Math.max(...sheet.pages)]));
  back.forEach((_, i) => {
    const first = lastPrinted + 1 + 2 * i;
    scenes.push({ id: `back-${i + 1}`, label: `Back matter ${i + 1}`, order: first, pagesWide: 2, pages: [first, first + 1] });
  });
  if (sheets.some(sheet => sheet.kind === 'cover-back')) {
    const page = lastPrinted + 2 * back.length + 1;
    scenes.push({ id: 'back', label: 'Back cover', order: page, pagesWide: 1, pages: [page, page] });
  }
  return scenes;
};

/**
 * The delivery's scenes in book order and each entry's scene: a sheet of the layout that holds the entry's page, else
 * the pair of facing pages. Every layout sheet is a scene, with or without entries.
 */
export function deliveryScenes(mapping: Mapping, layout?: LayoutLike): { scenes: ImportScene[]; sceneOf: Map<string, string> } {
  const ids = Object.keys(mapping.entries);
  const lastPage = Math.max(0, ...ids.map(id => mapping.entries[id].page));
  const fromLayout = layoutScenes(layout?.sheets ?? []);
  const scenes = new Map<string, ImportScene>(fromLayout.map(scene => [scene.id, scene]));
  const sceneOf = new Map<string, string>();
  for (const id of ids) {
    const page = mapping.entries[id].page;
    const scene = fromLayout.find(s => page >= s.pages[0] && page <= s.pages[1]) ?? pagesScene(scenePages(page, lastPage));
    if (!scenes.has(scene.id)) scenes.set(scene.id, scene);
    sceneOf.set(id, scene.id);
  }
  return { scenes: [...scenes.values()].sort((x, y) => x.order - y.order), sceneOf };
}

/**
 * A scene as the plan sends it: the preset `double` / `single` at the editor's page size, else its own surface (one,
 * `surface`, of the layout's page size times its width in pages)
 */
export function planScene(scene: ImportScene, page?: { width: number; height: number }): DeliveryScene {
  const standard = !page || (page.width === SCENE_PAGE_MM.width && page.height === SCENE_PAGE_MM.height);
  return standard
    ? { id: scene.id, label: scene.label, preset: scene.pagesWide === 2 ? 'double' : 'single' }
    : { id: scene.id, label: scene.label, surfaces: [{ id: 'surface', widthMm: page.width * scene.pagesWide, heightMm: page.height }] as DeliveryScene['surfaces'] };
}

// ── The plan ─────────────────────────────────────────────────────────────────────────────────────

/** Placeholder body of a new entry – the texts follow */
export const PLACEHOLDER_BODY = 'Placeholder – the text follows.';

/** The Library URLs of an entry's prepared files (missing: not delivered or could not be prepared) */
export interface EntryFiles {
  target?: string;
  image?: string;
  video?: string;
}

/**
 * The delivery plan: the scenes in book order and one entry per mapped entry that could be prepared. An entry whose
 * delivered file could not be prepared is left out (`skip`) – a new entry must not come without its target, an existing
 * one keeps what it has; the next run brings it once the file is fixed. A video without a target is dropped (a warning).
 */
export function buildPlan(input: {
  name: string;
  source?: string;
  mapping: Mapping;
  layout?: LayoutLike;
  files: ReadonlyMap<string, EntryFiles>;
  skip?: ReadonlySet<string>;
}): { plan: DeliveryPlan; warnings: string[] } {
  const { mapping, layout, files, skip = new Set() } = input;
  const { scenes, sceneOf } = deliveryScenes(mapping, layout);
  const warnings: string[] = [];
  const entries: DeliveryEntry[] = [];
  for (const [id, e] of Object.entries(mapping.entries)) {
    if (skip.has(id)) continue;
    const f = files.get(id) ?? {};
    const entry: DeliveryEntry = {
      id,
      scene: sceneOf.get(id)!,
      category: e.category as DeliveryEntry['category'],
      title: e.title,
      body: e.body ?? PLACEHOLDER_BODY,
    };
    if (e.author) entry.author = e.author;
    if (e.caption) entry.caption = e.caption;
    if (e.media) entry.media = e.media;
    if (e.tags?.length) entry.tags = e.tags;
    if (f.image) entry.image = f.image;
    if (f.target) {
      entry.target = { imageSrc: f.target, ...(e.enabled === false ? { enabled: false } : {}), ...(f.video ? { video: f.video } : {}) };
    } else if (e.video) {
      warnings.push(`${id}: a video needs a target to play on – imported as an entry without AR`);
    }
    entries.push(entry);
  }
  const used = new Set(entries.map(entry => entry.scene));
  // The layout's scenes always (as the folder's import wrote them), the pages' scenes where an entry lies
  const planScenes = scenes.filter(scene => used.has(scene.id) || (layout?.sheets ?? []).length > 0).map(scene => planScene(scene, layout?.page));
  return {
    plan: { name: input.name, ...(input.source ? { source: input.source } : {}), scenes: planScenes, entries },
    warnings,
  };
}

// ── The comparison ───────────────────────────────────────────────────────────────────────────────

const MARK: Record<DeliveryStatus, string> = { new: '+', changed: '~', same: '=', conflict: '!' };
const STATUSES: DeliveryStatus[] = ['new', 'changed', 'conflict', 'same'];

/**
 * The server's comparison as lines: per scene, entry and target what the delivery does (`+` new, `~` changed with the
 * fields, `!` conflict with the reason; `=` same only with `all`), the counts, then the problems and warnings
 */
export function describeComparison(result: DeliveryResult, { all = false }: { all?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (const item of result.items) {
    if (item.status === 'same' && !all) continue;
    const where = item.kind === 'entry' && item.scene ? ` (${item.scene})` : item.kind === 'target' && item.entry && item.entry !== item.id ? ` (entry ${item.entry})` : '';
    const detail = item.status === 'conflict' ? ` – ${item.reason ?? 'edited in the editor since the last delivery'}`
      : item.fields?.length ? `: ${item.fields.join(', ')}` : '';
    lines.push(`   ${MARK[item.status]} ${item.kind.padEnd(6)} ${item.id}${where}${detail}`);
  }
  const kinds = (status: DeliveryStatus) => {
    const of = result.items.filter(item => item.status === status);
    const per = ['scene', 'entry', 'target'].map(kind => [kind, of.filter(item => item.kind === kind).length] as const).filter(([, n]) => n > 0);
    return per.length ? ` (${per.map(([kind, n]) => `${n} ${kind === 'entry' ? (n === 1 ? 'entry' : 'entries') : `${kind}${n === 1 ? '' : 's'}`}`).join(', ')})` : '';
  };
  lines.push(STATUSES.map(status => `${result.counts[status] ?? 0} ${status}${kinds(status)}`).join(' · '));
  result.warnings.forEach(warning => lines.push(`   ⚠️  ${warning}`));
  result.problems.forEach(problem => lines.push(`   ❌ ${problem}`));
  return lines;
}
