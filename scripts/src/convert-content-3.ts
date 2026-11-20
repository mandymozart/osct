/**
 * One-off conversion of a content source folder from schema 2.x to 3.0 (#319, `agents/SCENES.md` "Schema 3.0"):
 * `node dist/convert-content-3.js` converts `OSCT_CONTENT_DIR` in place (`npm run convert:3`). Used for
 * `fixtures/content` and `fixtures/demo`; the server's migration of the books it stores (part B) follows the same
 * rules:
 *
 * - `spreads/<id>/spread.yaml` → `scenes/<id>/scene.yaml` (same id, same `order`, `passes` and comments kept). The
 *   `label` is what the reader showed for it: its own `label`, else its title on a cover, the back cover and front or
 *   back matter, else its pages (`186–187`, a single page `1`). `title`, `firstPage`, `lastPage`, `format`, `matter`
 *   and `layout` go. One surface `surface`: a double page twice the page's width (460 × 320 mm), a cover or a single
 *   page one page wide (230 × 320) – placed by the build (a row centred on the origin).
 * - `entries/<id>/entry.yaml`: `page: N` → `scene: <the id of the spread whose pages hold N>`. A target's
 *   `print { page?, surface, x, y, width, height? }` → `place { x, y, width, height? }` on the scene's one surface:
 *   a target on the right page of a double page moves by the left page's width.
 *
 * Text in, text out (comments survive); the YAML of a source is the simple one the content guide shows.
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { BOOK_PAGE_MM, CONTENT_DIR, requireContentDir } from './config';
import { isMainModule } from './lib/entry';

/** What the conversion needs of a 2.x spread */
export interface OldSpread {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  format?: string;
  matter?: string;
  label?: string;
}

const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A 2.x spread without printed numbers: a cover, the back cover, front or back matter */
const isUnnumbered = (spread: OldSpread) => spread.format === 'cover' || spread.format === 'back' || !!spread.matter;

/** How many pages wide the scene's one surface is: 1 for a cover and a single page, else 2 */
export const pagesWide = (spread: OldSpread): 1 | 2 =>
  spread.format === 'cover' || spread.format === 'back' || spread.firstPage === spread.lastPage ? 1 : 2;

/** The label the reader showed for a 2.x spread – the 3.0 scene's `label` */
export const sceneLabelOf = (spread: OldSpread): string => {
  if (spread.label?.trim()) return spread.label.trim();
  if (isUnnumbered(spread)) return spread.title;
  return spread.firstPage === spread.lastPage ? `${spread.firstPage}` : `${spread.firstPage}–${spread.lastPage}`;
};

const GONE_SCENE_KEYS = ['title', 'firstPage', 'lastPage', 'format', 'matter', 'layout', 'label'];

/** spread.yaml (2.x) → scene.yaml (3.0) */
export function convertSceneYaml(text: string, spread: OldSpread, page = BOOK_PAGE_MM): string {
  const kept = text.split('\n').filter(line => !GONE_SCENE_KEYS.some(key => line.startsWith(`${key}:`)));
  // The label goes after the leading comments, the surfaces after `order` (or the label)
  const firstField = kept.findIndex(line => line.trim() !== '' && !line.startsWith('#'));
  const at = firstField === -1 ? kept.length : firstField;
  const head = kept.slice(0, at);
  const rest = kept.slice(at);
  const orderAt = rest.findIndex(line => line.startsWith('order:'));
  const surfaces = ['surfaces:', '  - id: surface', `    widthMm: ${page.width * pagesWide(spread)}`, `    heightMm: ${page.height}`];
  const body = orderAt === -1 ? [...surfaces, ...rest] : [...rest.slice(0, orderAt + 1), ...surfaces, ...rest.slice(orderAt + 1)];
  return [...head, `label: ${quote(sceneLabelOf(spread))}`, ...body].join('\n');
}

/** The spread whose pages hold `page` (the first one, as 2.x placed an entry) */
export const spreadOfPage = (page: number, spreads: readonly OldSpread[]): OldSpread | undefined =>
  spreads.find(s => page >= s.firstPage && page <= s.lastPage);

/**
 * entry.yaml (2.x) → 3.0: its `page` becomes its scene, its target's `print` its `place` on the scene's surface.
 * Throws when the page lies in no spread (2.x refused such content too).
 */
export function convertEntryYaml(text: string, spreads: readonly OldSpread[], page = BOOK_PAGE_MM): string {
  const data = yaml.load(text) as { page?: unknown; target?: { print?: { surface?: string } } } | null;
  if (!data || typeof data.page !== 'number') throw new Error('expected an entry with a page');
  const spread = spreadOfPage(data.page, spreads);
  if (!spread) throw new Error(`page ${data.page} is not part of any spread`);
  const shift = pagesWide(spread) === 2 && data.target?.print?.surface === 'right' ? page.width : 0;
  const out: string[] = [];
  let inPrint = false;
  for (const line of text.split('\n')) {
    if (/^page:\s*-?\d+\s*$/.test(line)) {
      out.push(`scene: ${spread.id}`);
      continue;
    }
    if (/^ {2}print:\s*$/.test(line)) {
      inPrint = true;
      out.push('  place:');
      continue;
    }
    if (inPrint && /^ {4}\S/.test(line)) {
      if (/^ {4}(surface|surfaceId|page):/.test(line)) continue;
      const x = /^( {4}x:\s*)(-?[\d.]+)(.*)$/.exec(line);
      out.push(x && shift ? `${x[1]}${Number(x[2]) + shift}${x[3]}` : line);
      continue;
    }
    inPrint = false;
    out.push(line);
  }
  return out.join('\n');
}

/** Read the 2.x spreads of a content folder */
export function readOldSpreads(contentDir: string): OldSpread[] {
  const dir = path.join(contentDir, 'spreads');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(id => {
    const file = path.join(dir, id, 'spread.yaml');
    if (!fs.existsSync(file)) return [];
    const data = yaml.load(fs.readFileSync(file, 'utf8')) as Omit<OldSpread, 'id'>;
    return [{ id, ...data }];
  });
}

/** Convert a content folder in place: spreads/ → scenes/, every entry.yaml; returns what it did */
export function convertContent(contentDir: string): { scenes: string[]; entries: string[] } {
  const spreads = readOldSpreads(contentDir);
  const done = { scenes: [] as string[], entries: [] as string[] };
  for (const spread of spreads) {
    const from = path.join(contentDir, 'spreads', spread.id);
    const to = path.join(contentDir, 'scenes', spread.id);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    const text = fs.readFileSync(path.join(to, 'spread.yaml'), 'utf8');
    fs.writeFileSync(path.join(to, 'scene.yaml'), convertSceneYaml(text, spread));
    fs.unlinkSync(path.join(to, 'spread.yaml'));
    done.scenes.push(spread.id);
  }
  if (fs.existsSync(path.join(contentDir, 'spreads')) && fs.readdirSync(path.join(contentDir, 'spreads')).length === 0) {
    fs.rmdirSync(path.join(contentDir, 'spreads'));
  }
  const entries = path.join(contentDir, 'entries');
  for (const id of fs.existsSync(entries) ? fs.readdirSync(entries) : []) {
    const file = path.join(entries, id, 'entry.yaml');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!/^page:/m.test(text)) continue;
    fs.writeFileSync(file, convertEntryYaml(text, spreads));
    done.entries.push(id);
  }
  return done;
}

if (isMainModule(import.meta.url)) {
  console.log(`🔁 Content schema 2.x → 3.0: ${requireContentDir()}`);
  const done = convertContent(CONTENT_DIR);
  console.log(`✅ ${done.scenes.length} scenes, ${done.entries.length} entries converted`);
}
