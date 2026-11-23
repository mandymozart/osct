import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginFile } from '../../shared/types/plugins';
import type { PluginFilesApi } from '../src/lib/plugin-files-api';
import { folderFiles, idFromFolder, pullFolder, pushFolder, readLink, writeFolderTypes, writeLink } from '../src/lib/plugin-link';

/** A plugin in someone's own folder (#352): link, push, pull */
const folders: string[] = [];
const tempFolder = (name: string): string => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'osct-link-')), name);
  fs.mkdirSync(dir);
  folders.push(path.dirname(dir));
  return dir;
};
afterEach(() => folders.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

const fakeApi = () => {
  const stored = new Map<string, { files: PluginFile[]; origin: { folder: string; by: string | null; at: string } | null }>();
  const api: PluginFilesApi = {
    experiences: async () => ['demo'],
    plugins: async () => [...stored.keys()],
    get: async (_experience, plugin) => {
      const row = stored.get(plugin);
      if (!row) throw new Error(`GET /editor/experiences/demo/plugins/${plugin} → 404`);
      return row;
    },
    put: async (_experience, plugin, files, origin) => {
      stored.set(plugin, { files, origin: origin === undefined ? stored.get(plugin)?.origin ?? null : origin && { folder: origin.folder, by: 'ben@example.com', at: '' } });
    },
  };
  return { api, stored };
};

describe('osct plugin push / pull', () => {
  it('push sends the plugin\'s files – not the folder\'s types, not other files – and links the folder', async () => {
    const folder = tempFolder('Aquarium');
    fs.writeFileSync(path.join(folder, 'index.ts'), '﻿import { a } from "./fluid";\r\nexport const register = () => a;\r\n');
    fs.writeFileSync(path.join(folder, 'fluid.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(folder, 'water.frag'), 'void main() {}\n');
    fs.writeFileSync(path.join(folder, 'README.md'), '# notes');
    writeFolderTypes(folder, 'export interface PluginApi {}', 'declare module "*.frag";');
    const { api, stored } = fakeApi();
    const link = { api: 'http://127.0.0.1:8080/api', experience: 'demo', plugin: idFromFolder(folder) };
    expect(link.plugin).toBe('aquarium');
    await pushFolder(api, folder, link);
    const row = stored.get('aquarium')!;
    expect(row.files.map(f => f.name)).toEqual(['index.ts', 'fluid.ts', 'water.frag']);
    expect(row.files[0].text).toBe('import { a } from "./fluid";\nexport const register = () => a;\n');
    expect(row.origin?.folder).toBe('Aquarium');
  });

  it('push refuses a folder the editor would refuse', async () => {
    const folder = tempFolder('broken');
    fs.writeFileSync(path.join(folder, 'fluid.ts'), 'export {};');
    const { api } = fakeApi();
    await expect(pushFolder(api, folder, { api: '', experience: 'demo', plugin: 'broken' })).rejects.toThrow('a plugin needs index.ts');
  });

  it('pull writes the editor\'s files and deletes the plugin files it no longer has – never the folder\'s own', async () => {
    const folder = tempFolder('sea');
    fs.writeFileSync(path.join(folder, 'index.ts'), 'old');
    fs.writeFileSync(path.join(folder, 'gone.ts'), 'x');
    fs.writeFileSync(path.join(folder, 'notes.md'), 'mine');
    writeFolderTypes(folder, 'api', 'shaders');
    const { api, stored } = fakeApi();
    stored.set('sea', { files: [{ name: 'index.ts', text: 'new' }, { name: 'wave.vert', text: 'void main() {}' }], origin: null });
    const result = await pullFolder(api, folder, { api: '', experience: 'demo', plugin: 'sea' });
    expect(result).toEqual({ written: ['index.ts', 'wave.vert'], deleted: ['gone.ts'] });
    expect(folderFiles(folder).map(f => f.name)).toEqual(['index.ts', 'wave.vert']);
    expect(fs.existsSync(path.join(folder, 'notes.md')) && fs.existsSync(path.join(folder, 'tsconfig.json'))).toBe(true);
    expect((await pullFolder(api, folder, { api: '', experience: 'demo', plugin: 'sea' })).written).toEqual([]);
  });

  it('the link file round-trips and refuses a broken one', () => {
    const folder = tempFolder('linked');
    expect(readLink(folder)).toBeNull();
    writeLink(folder, { api: 'https://osct.porschuetz.de/api', experience: 'demo', plugin: 'linked' });
    expect(readLink(folder)).toEqual({ api: 'https://osct.porschuetz.de/api', experience: 'demo', plugin: 'linked' });
    fs.writeFileSync(path.join(folder, '.osct-plugin.json'), '{"api":1}');
    expect(() => readLink(folder)).toThrow('is no link');
  });
});
