import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { PluginFile } from '../../shared/types/plugins';
import type { PluginFilesApi } from '../src/lib/plugin-files-api';
import { checkPlugins } from '../src/lib/plugin-type-check';
import { checkStoredPlugins, checkTable } from '../src/lib/plugins-check';

// The type check builds a TypeScript program with three's declarations: seconds on a busy machine
vi.setConfig({ testTimeout: 30_000 });

/**
 * `osct plugins check` (#366): the publish's type check over an instance's stored plugins, the known faults repaired only
 * with --repair – here against a fake editor API
 */

const root = path.resolve(__dirname, '..', '..');
/** Code made from a plugin's node type before 6.17.1 (Make it code's wrapper passed `build` on – the known fault) */
const MADE_BEFORE = fs.readFileSync(path.join(__dirname, 'fixtures', 'made-code-before-6.17.1.ts'), 'utf8').replace(/\r\n/g, '\n');
const FINE = 'import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => { api.log("fine"); };\n';
const WRONG = 'export const n: number = "one";\nexport const register = (): void => undefined;\n';

/** The plugin folders of a content folder's plugins/, as the API answers them */
const folderPlugins = (dir: string): Array<{ id: string; files: PluginFile[] }> =>
  fs.readdirSync(dir).filter(id => fs.existsSync(path.join(dir, id, 'index.ts'))).sort().map(id => ({
    id,
    files: fs.readdirSync(path.join(dir, id)).filter(name => /\.(ts|frag|vert|glsl|wgsl)$/.test(name))
      .map(name => ({ name, text: fs.readFileSync(path.join(dir, id, name), 'utf8') })),
  }));

const fakeApi = (experiences: Record<string, Record<string, string>>) => {
  const puts: Array<{ experience: string; plugin: string; files: PluginFile[]; origin: unknown }> = [];
  const api: PluginFilesApi = {
    experiences: async () => Object.keys(experiences),
    plugins: async experience => Object.keys(experiences[experience]).sort(),
    get: async (experience, plugin) => ({ files: [{ name: 'index.ts', text: experiences[experience][plugin] }], origin: null }),
    put: async (experience, plugin, files, origin) => {
      puts.push({ experience, plugin, files, origin });
      experiences[experience][plugin] = files[0].text;
    },
  };
  return { api, puts };
};

describe('osct plugins check', () => {
  it('passes the plugins of the test content and the demo with the Node check (the editor\'s test holds it to Monaco\'s)', () => {
    for (const folder of ['fixtures/content/plugins', 'fixtures/demo/plugins']) {
      const problems = checkPlugins(folderPlugins(path.join(root, folder)));
      expect(problems.map(p => `${p.plugin}/${p.file}:${p.line} ${p.message}`), folder).toEqual([]);
    }
  });

  it('lists every type error with its experience, plugin, file and line – the known fault as repairable – and writes nothing', async () => {
    const { api, puts } = fakeApi({ osct: { fine: FINE, 'my-tank-code': MADE_BEFORE }, demo: { wrong: WRONG } });
    const result = await checkStoredPlugins(api, ['osct', 'demo'], { repair: false, check: checkPlugins });
    expect(puts).toEqual([]);
    expect([result.checked, result.failing, result.repaired]).toEqual([3, 2, []]);
    expect(result.rows.map(r => [r.experience, r.plugin, r.file, r.line, r.repair])).toEqual([
      ['osct', 'my-tank-code', 'index.ts', 13, 'repairable'],
      ['demo', 'wrong', 'index.ts', 1, ''],
    ]);
    const table = checkTable(result.rows);
    expect(table[0]).toMatch(/^experience\s+plugin\s+file\s+line\s+repair\s+message$/);
    expect(table[1]).toMatch(/^osct\s+my-tank-code\s+index\.ts\s+13\s+repairable\s+Argument of type/);
    expect(table[2]).toMatch(/^demo\s+wrong\s+index\.ts\s+1\s+Type 'string' is not assignable to type 'number'\.$/);
  });

  it('--repair saves the known fault\'s repair as a normal save (every file, the link kept) and checks it again', async () => {
    const { api, puts } = fakeApi({ osct: { 'my-tank-code': MADE_BEFORE }, demo: { wrong: WRONG } });
    const result = await checkStoredPlugins(api, ['osct', 'demo'], { repair: true, check: checkPlugins });
    expect(puts.map(p => [p.experience, p.plugin, p.origin])).toEqual([['osct', 'my-tank-code', undefined]]);
    expect(puts[0].files[0].text).toBe(MADE_BEFORE.replace('}, build);', '}, build as never);'));
    expect(result.repaired).toEqual([{ experience: 'osct', plugin: 'my-tank-code', fault: 'made-code-build' }]);
    // The repaired one passes now; the other is the person's to fix
    expect(result.failing).toBe(1);
    expect(result.rows.map(r => [r.plugin, r.repair])).toEqual([['my-tank-code', 'repaired'], ['wrong', '']]);
    expect(checkPlugins([{ id: 'my-tank-code', files: puts[0].files }])).toEqual([]);
  });
});
