import fs from 'fs';
import path from 'path';
import { PLUGIN_ENTRY, PLUGIN_FILE_PATTERN, PLUGIN_ID_PATTERN, pluginFilesProblems, sortPluginFiles, type PluginFile } from '../../../shared/types/plugins';
import type { PluginFilesApi } from './plugin-files-api';

/**
 * A plugin developed in someone's own folder and tools (#352, agents/research/2026-11-23-plugin-files.md): the folder
 * is **linked** to a plugin of an experience – `.osct-plugin.json` names the instance's API, the experience and the
 * plugin. `osct plugin push` sends the folder's files (every `.ts`, `.frag`, `.vert`, `.glsl`, `.wgsl` next to
 * `index.ts`; the types and config the folder needs to type-check are not the plugin's) – the editor's stage runs them
 * at once and the Code tab shows *linked · <folder>*; `osct plugin pull` takes the editor's files back (edits made there,
 * a file deleted there). The files are the truth on both sides; the later save wins, as with every save.
 */

/** The link file in a plugin's folder */
export const LINK_FILE = '.osct-plugin.json';
/** Files a folder holds for its type check – never a plugin's own */
export const FOLDER_EXTRAS = ['plugin-api.d.ts', 'shader-files.d.ts', 'tsconfig.json'];

export interface PluginLink {
  /** The instance's API (`http://127.0.0.1:8080/api`, `https://osct.porschuetz.de/api`) */
  api: string;
  experience: string;
  plugin: string;
}

/** The folder's link, null when it has none */
export function readLink(folder: string): PluginLink | null {
  const file = path.join(folder, LINK_FILE);
  if (!fs.existsSync(file)) return null;
  const link = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<PluginLink>;
  if (typeof link.api !== 'string' || typeof link.experience !== 'string' || typeof link.plugin !== 'string') {
    throw new Error(`${file} is no link – { api, experience, plugin }; link the folder again (osct plugin link)`);
  }
  return { api: link.api, experience: link.experience, plugin: link.plugin };
}

export function writeLink(folder: string, link: PluginLink): void {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, LINK_FILE), `${JSON.stringify(link, null, 2)}\n`);
}

/** The plugin's files in a folder: the names a plugin's file may have, the entry first (BOMs and CRLF as the editor stores them: none) */
export function folderFiles(folder: string): PluginFile[] {
  return sortPluginFiles(fs.readdirSync(folder, { withFileTypes: true })
    .filter(dirent => dirent.isFile() && PLUGIN_FILE_PATTERN.test(dirent.name) && !FOLDER_EXTRAS.includes(dirent.name))
    .map(dirent => ({ name: dirent.name, text: fs.readFileSync(path.join(folder, dirent.name), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n') })));
}

/** A plugin id from a folder's name (`My Effect` → `my-effect`) */
export const idFromFolder = (folder: string): string =>
  path.basename(path.resolve(folder)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Push: the folder's files become the plugin's (one the folder lacks is gone there), linked to the folder */
export async function pushFolder(api: PluginFilesApi, folder: string, link: PluginLink): Promise<PluginFile[]> {
  if (!PLUGIN_ID_PATTERN.test(link.plugin)) throw new Error(`"${link.plugin}" is no plugin id – lower-case letters, digits and -`);
  const files = folderFiles(folder);
  const problems = pluginFilesProblems(files);
  if (problems.length) throw new Error(`${folder}: ${problems.join('; ')}`);
  await api.put(link.experience, link.plugin, files, { folder: path.basename(path.resolve(folder)) });
  return files;
}

export interface PullResult {
  written: string[];
  /** The plugin's files the editor no longer has – deleted from the folder */
  deleted: string[];
}

/** Pull: the plugin's files into the folder – written, and the plugin files the editor no longer has deleted */
export async function pullFolder(api: PluginFilesApi, folder: string, link: PluginLink): Promise<PullResult> {
  const { files } = await api.get(link.experience, link.plugin);
  fs.mkdirSync(folder, { recursive: true });
  const written: string[] = [];
  for (const file of files) {
    const at = path.join(folder, file.name);
    if (fs.existsSync(at) && fs.readFileSync(at, 'utf8').replace(/\r\n/g, '\n') === file.text) continue;
    fs.writeFileSync(at, file.text);
    written.push(file.name);
  }
  const names = new Set(files.map(f => f.name));
  const deleted = folderFiles(folder).map(f => f.name).filter(name => !names.has(name) && name !== PLUGIN_ENTRY);
  for (const name of deleted) fs.unlinkSync(path.join(folder, name));
  return { written, deleted };
}

/** The folder's type-check files: the plugin API's types, the shader imports' types, a tsconfig (each only when missing) */
export function writeFolderTypes(folder: string, pluginApi: string, shaderFiles: string): string[] {
  const made: string[] = [];
  const put = (name: string, text: string) => {
    const at = path.join(folder, name);
    if (fs.existsSync(at)) return;
    fs.writeFileSync(at, text);
    made.push(name);
  };
  put('plugin-api.d.ts', pluginApi);
  put('shader-files.d.ts', shaderFiles);
  put('tsconfig.json', FOLDER_TSCONFIG);
  return made;
}

/** As the editor's Download writes it (`editor/src/lib/plugins/code-editor.ts` DOWNLOAD_TSCONFIG) */
export const FOLDER_TSCONFIG = `{
  // The plugin's type check as the content build runs it; three's types: npm install --save-dev @types/three
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "paths": { "osct-plugin-api": ["./plugin-api.d.ts"] }
  },
  "include": ["*.ts"]
}
`;
