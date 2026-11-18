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
/** scene.yaml (schema 3.0): a label, an order and one surface – a double page, 460 × 320 mm */
export const scene = (label: string, order = 0) =>
  `label: "${label}"\norder: ${order}\nsurfaces:\n  - id: surface\n    widthMm: 460\n    heightMm: 320\n`;
/** entry.yaml of an entry in the scene `sceneId` (its title: "Entry <sceneId>") */
export const entry = (sceneId: string, target?: string, extra = '') =>
  `category: glossary\ntitle: Entry ${sceneId}\nscene: ${sceneId}\n${target ? `target:\n  image: ${target}\n` : ''}${extra}`;

/** Write a content folder into a temp dir: { 'scenes/a/scene.yaml': '…', … } */
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
  const [errors, book, scenes, entities, entries, targets, hash, plugins] = await Promise.all([
    import('../src/lib/errors'),
    import('../src/build/book'),
    import('../src/build/scenes'),
    import('../src/build/entities'),
    import('../src/build/entries'),
    import('../src/build/targets'),
    import('../src/lib/hash'),
    import('../src/build/plugins'),
  ]);
  const { recordedRegistrations } = await import('../../shared/types/plugins');
  /** book → scenes → entities → entries → target limit, like the content build; `plugins` = what buildPlugins declared */
  const buildAll = (plugins: readonly { registered?: unknown }[] = []) => {
    const passes = recordedRegistrations(plugins).passes;
    const b = book.buildBook(passes);
    const s = scenes.buildScenes(passes);
    const builds = entries.buildEntries(s, entities.buildEntities());
    targets.checkTargetsPerScene(s, builds);
    return { book: b, scenes: s, entries: builds.map(x => x.entry) };
  };
  return { errors: errors.buildErrors, warnings: errors.buildWarnings, buildAll, book, scenes, entities, entries, targets, hash, plugins };
}
