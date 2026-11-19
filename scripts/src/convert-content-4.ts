/**
 * One-off conversion of a content source folder from schema 3.x to 4.0 (#320, `agents/REFACTOR-EXPERIENCE.md`):
 * `node dist/convert-content-4.js` converts `OSCT_CONTENT_DIR` in place (`npm run convert:4`). Used for
 * `fixtures/content` and `fixtures/demo`; the server's migration of the experiences it stores (part B1) follows the
 * same rules:
 *
 * - `book.yaml` → `experience.yaml`; its `author` and `publisher` move under `book:` (the printed book), with the
 *   comments right above them. A file without either gets no `book:` – an experience that is not a book.
 * - `sourceOfTruth` is dropped, with the comments right above it: every experience adds and removes its scenes.
 * - Every `scope: book` (behaviour rules) in the YAML of scenes, entries and entities → `scope: experience`; every
 *   `{{book.title}}` (text nodes) → `{{experience.title}}`.
 * - Plugins' TypeScript is not rewritten: each line that names the scope `"book"` is reported (file and line) – a person
 *   changes it to `"experience"`.
 *
 * Text in, text out (comments survive); the YAML of a source is the simple one the content guide shows.
 */
import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from './config';
import { isMainModule } from './lib/entry';

/** The print data that moves under `book:` */
const PRINT_KEYS = ['author', 'publisher'];
/** What is dropped */
const GONE_KEYS = ['sourceOfTruth'];

const keyOf = (line: string): string | null => /^([A-Za-z][A-Za-z0-9_]*):/.exec(line)?.[1] ?? null;

/**
 * book.yaml → experience.yaml: the print keys (each with its indented continuation lines and the comment lines right
 * above it) move into a `book:` block after `title:` (or at the end when there is no title); the gone keys are dropped
 * the same way
 */
export function convertExperienceYaml(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  const moved: string[] = [];
  let pendingComments: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#/.test(line)) {
      pendingComments.push(line);
      continue;
    }
    const key = keyOf(line);
    if (key && (PRINT_KEYS.includes(key) || GONE_KEYS.includes(key))) {
      const block = [line];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i]);
      if (PRINT_KEYS.includes(key)) moved.push(...pendingComments.map(c => `  ${c}`), ...block.map(l => `  ${l}`));
    } else {
      kept.push(...pendingComments, line);
    }
    pendingComments = [];
  }
  kept.push(...pendingComments);
  if (!moved.length) return kept.join('\n');
  const title = kept.findIndex(line => keyOf(line) === 'title');
  let at = title < 0 ? kept.length : title + 1;
  if (title >= 0) while (at < kept.length && /^\s+\S/.test(kept[at])) at++;
  if (title < 0) while (at > 0 && kept[at - 1] === '') at--;
  kept.splice(at, 0, 'book:', ...moved);
  return kept.join('\n');
}

/** A scene's, an entry's or an entity's YAML: the behaviour scope `book` → `experience`, `{{book.title}}` → `{{experience.title}}` */
export function convertRulesYaml(text: string): string {
  return text
    .replace(/(\bscope:\s*)(["']?)book\2(?=\s*(?:$|[,}#\]]))/gm, '$1$2experience$2')
    .replace(/\{\{\s*book\.title\s*\}\}/g, '{{experience.title}}');
}

/** Lines of plugin code that name the scope "book" – `file:line: text` */
export function bookScopeUses(file: string, text: string): string[] {
  return text.split('\n').flatMap((line, i) => (/(["'`])book\1/.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
}

const filesBelow = (dir: string, match: (name: string) => boolean): string[] =>
  !fs.existsSync(dir)
    ? []
    : fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) return item.name === 'node_modules' ? [] : filesBelow(full, match);
      return match(item.name) ? [full] : [];
    });

/** Convert a content folder in place; returns what it did and the plugin lines a person has to change */
export function convertContent(contentDir: string): { experience: boolean; files: string[]; pluginLines: string[] } {
  const done = { experience: false, files: [] as string[], pluginLines: [] as string[] };
  const oldFile = path.join(contentDir, 'book.yaml');
  if (fs.existsSync(oldFile)) {
    fs.writeFileSync(path.join(contentDir, 'experience.yaml'), convertExperienceYaml(fs.readFileSync(oldFile, 'utf8')));
    fs.unlinkSync(oldFile);
    done.experience = true;
  }
  for (const folder of ['scenes', 'entries', 'entities']) {
    for (const file of filesBelow(path.join(contentDir, folder), name => /\.ya?ml$/.test(name))) {
      const text = fs.readFileSync(file, 'utf8');
      const converted = convertRulesYaml(text);
      if (converted === text) continue;
      fs.writeFileSync(file, converted);
      done.files.push(path.relative(contentDir, file).replace(/\\/g, '/'));
    }
  }
  for (const file of filesBelow(path.join(contentDir, 'plugins'), name => /\.(ts|js)$/.test(name))) {
    done.pluginLines.push(...bookScopeUses(path.relative(contentDir, file).replace(/\\/g, '/'), fs.readFileSync(file, 'utf8')));
  }
  return done;
}

if (isMainModule(import.meta.url)) {
  console.log(`🔁 Content schema 3.x → 4.0: ${CONTENT_DIR}`);
  const done = convertContent(CONTENT_DIR);
  console.log(`✅ ${done.experience ? 'book.yaml → experience.yaml, ' : 'no book.yaml, '}${done.files.length} files with scope or title rewritten`);
  if (done.pluginLines.length) {
    console.log('⚠️  Plugin code that names the scope "book" – change it to "experience" by hand:');
    done.pluginLines.forEach(line => console.log(`   ${line}`));
  }
}
