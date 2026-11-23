import { PLUGIN_ENTRY, PLUGIN_FILE_PATTERN, sortPluginFiles, type PluginFile } from "@shared/types/plugins";

/**
 * The Code tab's file tabs, the parts that need no DOM (#352): the name a new file gets, what is wrong with a rename, a
 * plugin's zip (its Download) back into files, a size as the status line says it.
 */

/** A free name for a new file: `file.ts`, then `file-2.ts`, … */
export const newFileName = (taken: readonly string[], stem: string, extension: string): string => {
  const lower = new Set(taken.map(name => name.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `${stem}${n === 1 ? "" : `-${n}`}.${extension}`;
    if (!lower.has(name.toLowerCase())) return name;
  }
};

/** What is wrong with renaming `from` to `to`, null when nothing is */
export const renameProblem = (taken: readonly string[], from: string, to: string): string | null => {
  if (from === PLUGIN_ENTRY) return `${PLUGIN_ENTRY} is the entry – it keeps its name`;
  if (to === from) return null;
  if (to === PLUGIN_ENTRY) return `${PLUGIN_ENTRY} is the entry`;
  if (!PLUGIN_FILE_PATTERN.test(to)) return "letters, digits, . _ - and .ts, .frag, .vert, .glsl or .wgsl";
  if (taken.some(name => name !== from && name.toLowerCase() === to.toLowerCase())) return `${to} is there already`;
  return null;
};

/**
 * A plugin's zip back into a plugin: the files of its one folder (`aquarium/index.ts` …; a zip without a folder: its
 * files), the download's own extras (`plugin-api.d.ts`, `tsconfig.json`) left out, the id from the folder or the zip's
 * name. Throws when there is no `index.ts`.
 */
export const pluginFromZip = (entries: ReadonlyArray<{ name: string; text: string }>, zipName: string, extras: readonly string[]): { id: string; files: PluginFile[] } => {
  const entry = entries.find(e => e.name === PLUGIN_ENTRY || e.name.endsWith(`/${PLUGIN_ENTRY}`));
  if (!entry) throw new Error(`${zipName} holds no ${PLUGIN_ENTRY}`);
  const folder = entry.name.slice(0, entry.name.length - PLUGIN_ENTRY.length);
  const files = entries
    .filter(e => e.name.startsWith(folder))
    .map(e => ({ name: e.name.slice(folder.length), text: e.text.replace(/^﻿/, "") }))
    .filter(f => !f.name.includes("/") && !extras.includes(f.name) && PLUGIN_FILE_PATTERN.test(f.name));
  const stem = folder ? folder.replace(/\/$/, "").split("/").pop()! : zipName.replace(/\.zip$/i, "");
  const id = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return { id, files: sortPluginFiles(files) };
};

/** `812 B`, `31 KB`, `1.2 MB` */
export const sizeText = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
