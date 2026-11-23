import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  createPluginTypeChecker, isCheckedThreeType, pluginCheckLibs, type PluginSources, type PluginTypeProblem, type TypeScriptLike,
} from '../../../shared/plugins/type-check';
import { projectRoot } from '../config';

/**
 * The plugin type check in Node (#366): the shared definition (`shared/plugins/type-check.ts` – the editor's Monaco runs the
 * same) with this package's TypeScript, against the checked-in plugin API types (`editor/src/lib/plugins/plugin-api.d.ts`,
 * the ones the editor ships) and three's declarations from `scripts/node_modules/@types/three`. `osct plugins check` and
 * `osct plugin push` use it: their verdict is the publish's.
 */

/** The plugin API's types as the editor carries them (generated from the engine; CI keeps them current) */
export const PLUGIN_API_DTS = path.join(projectRoot, 'editor', 'src', 'lib', 'plugins', 'plugin-api.d.ts');
const THREE_TYPES = path.join(projectRoot, 'scripts', 'node_modules', '@types', 'three');

/** Every file below a folder, as paths relative to it (`/`) */
const walk = (dir: string, prefix = ''): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);

let checker: ((sources: readonly PluginSources[]) => PluginTypeProblem[]) | null = null;

/** Type-check plugins together, as a publish carries them: every type error with its plugin, file and line */
export function checkPlugins(sources: readonly PluginSources[]): PluginTypeProblem[] {
  if (!checker) {
    const three = Object.fromEntries(walk(THREE_TYPES).filter(isCheckedThreeType).map(file => [file, fs.readFileSync(path.join(THREE_TYPES, file), 'utf8')]));
    const libDir = path.dirname(ts.getDefaultLibFilePath({}));
    checker = createPluginTypeChecker(ts as unknown as TypeScriptLike, pluginCheckLibs(fs.readFileSync(PLUGIN_API_DTS, 'utf8'), three), name => {
      const file = path.join(libDir, name);
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
    });
  }
  return checker(sources);
}
