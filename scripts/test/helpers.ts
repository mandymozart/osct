import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, vi } from 'vitest';

const tempDirs: string[] = [];

/** A fresh temp folder, removed after the test file */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  tempDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

export const BOOK = 'id: test\ntitle: Test Book\nauthor: Someone\n';
export const spread = (first: number, last: number, order = 0) =>
  `title: Spread\norder: ${order}\nfirstPage: ${first}\nlastPage: ${last}\n`;
export const entry = (page: number, target?: string, extra = '') =>
  `category: glossary\ntitle: Entry ${page}\npage: ${page}\n${target ? `target:\n  image: ${target}\n` : ''}${extra}`;

/** Write a content folder into a temp dir: { 'spreads/a/spread.yaml': '…', … } */
export function makeContent(files: Record<string, string | Buffer>): { root: string; content: string } {
  const root = tempDir('osct-scripts-');
  const content = path.join(root, 'content');
  for (const [file, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(content, file)), { recursive: true });
    fs.writeFileSync(path.join(content, file), data);
  }
  return { root, content };
}

/** Fresh build modules (and a fresh error list) reading the given folders */
export async function loadBuild(dirs: { content: string }) {
  vi.stubEnv('OSCT_CONTENT_DIR', dirs.content);
  vi.resetModules();
  const [errors, book, spreads, entities, entries, targets, tutorial, hash, plugins] = await Promise.all([
    import('../src/lib/errors'),
    import('../src/build/book'),
    import('../src/build/spreads'),
    import('../src/build/entities'),
    import('../src/build/entries'),
    import('../src/build/targets'),
    import('../src/build/tutorial'),
    import('../src/lib/hash'),
    import('../src/build/plugins'),
  ]);
  const { recordedRegistrations } = await import('../../shared/types/plugins');
  /** book → spreads → entities → entries → target limit, like the content build; `plugins` = what buildPlugins declared */
  const buildAll = (plugins: readonly { registered?: unknown }[] = []) => {
    const passes = recordedRegistrations(plugins).passes;
    const b = book.buildBook(passes);
    const s = spreads.buildSpreads(passes);
    const builds = entries.buildEntries(s, entities.buildEntities());
    targets.checkTargetsPerSpread(s, builds);
    return { book: b, spreads: s, entries: builds.map(x => x.entry), tutorial: tutorial.buildTutorial() };
  };
  return { errors: errors.buildErrors, warnings: errors.buildWarnings, buildAll, book, spreads, entities, entries, targets, tutorial, hash, plugins };
}
