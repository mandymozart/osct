import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { typescript as monacoTypeScript } from "monaco-editor/languages/features/typescript/lib/typescriptServices.js";
import { libFileMap } from "monaco-editor/languages/features/typescript/lib/lib.js";
import { TypeScriptWorker } from "monaco-editor/languages/features/typescript/tsWorker.js";
import {
  createPluginTypeChecker, diagnosticText, ERROR_CATEGORY, isCheckedFile, isCheckedThreeType, PLUGIN_COMPILER_OPTIONS, pluginCheckLibs,
  pluginCheckPath, type DiagnosticMessage, type PluginSources, type PluginTypeProblem, type TypeScriptLike,
} from "@shared/plugins/type-check";
import { PLUGIN_ENTRY, PLUGIN_FILE_PATTERN, sortPluginFiles } from "@shared/types/plugins";

/**
 * The plugin type check (#366) in Node for the tests: the shared definition (`shared/plugins/type-check.ts`) run with
 * Monaco's own bundled TypeScript and standard library (the browser's exact compiler), with the editor's TypeScript, and
 * through Monaco's real TypeScript worker class fed the same models and declarations – so a test can hold all of them to
 * one verdict. three's declarations come from the editor's `node_modules/@types/three`, the plugin API from the checked-in
 * `plugin-api.d.ts`.
 */

const editorRoot = process.cwd();
export const repoRoot = resolve(editorRoot, "..");

/** Every file below a folder, as paths relative to it (`/`) */
const walk = (dir: string, prefix = ""): string[] =>
  readdirSync(dir).flatMap(name => {
    const at = join(dir, name);
    return statSync(at).isDirectory() ? walk(at, `${prefix}${name}/`) : [`${prefix}${name}`];
  });

let libs: ReturnType<typeof pluginCheckLibs> | null = null;
/** The check's declarations, read once */
export const checkLibs = (): ReturnType<typeof pluginCheckLibs> => {
  if (libs) return libs;
  const threeRoot = resolve(editorRoot, "node_modules/@types/three");
  const three = Object.fromEntries(walk(threeRoot).filter(isCheckedThreeType).map(path => [path, readFileSync(join(threeRoot, path), "utf8")]));
  libs = pluginCheckLibs(readFileSync(resolve(editorRoot, "src/lib/plugins/plugin-api.d.ts"), "utf8"), three);
  return libs;
};

let monacoCheck: ((sources: readonly PluginSources[]) => PluginTypeProblem[]) | null = null;
/** The check with Monaco's TypeScript and standard library – the browser's compiler */
export const checkWithMonacoTypeScript = (sources: readonly PluginSources[]): PluginTypeProblem[] => {
  monacoCheck ??= createPluginTypeChecker(monacoTypeScript as unknown as TypeScriptLike, checkLibs(), name => libFileMap[name]);
  return monacoCheck(sources);
};

let nodeCheck: ((sources: readonly PluginSources[]) => PluginTypeProblem[]) | null = null;
/** The check with the editor's own TypeScript and its standard library files */
export const checkWithNodeTypeScript = (sources: readonly PluginSources[]): PluginTypeProblem[] => {
  if (!nodeCheck) {
    const require = createRequire(resolve(editorRoot, "package.json"));
    const ts = require("typescript") as typeof import("typescript");
    const libDir = dirname(require.resolve("typescript"));
    nodeCheck = createPluginTypeChecker(ts as unknown as TypeScriptLike, checkLibs(), name => {
      try {
        return readFileSync(join(libDir, name), "utf8");
      } catch {
        return undefined;
      }
    });
  }
  return nodeCheck(sources);
};

/**
 * The check as `monaco.ts` runs it in the browser: Monaco's TypeScript worker with the shared compiler options and
 * declarations as its extra libs, every file a model at its check path, the syntax and type errors of each TypeScript file
 */
export const checkWithMonacoWorker = async (sources: readonly PluginSources[]): Promise<PluginTypeProblem[]> => {
  const models = sources.flatMap(({ id, files }) => files.map(file => ({ id, file, uri: pluginCheckPath(id, file.name) })));
  const mirror = models.map(m => ({ uri: { path: m.uri.slice("file://".length), toString: () => m.uri }, version: 1, getValue: () => m.file.text }));
  const extraLibs = Object.fromEntries(checkLibs().map(lib => [lib.filePath, { content: lib.content, version: 1 }]));
  const worker = new TypeScriptWorker({ getMirrorModels: () => mirror }, { compilerOptions: PLUGIN_COMPILER_OPTIONS, extraLibs });
  const problems: PluginTypeProblem[] = [];
  for (const { id, file, uri } of models) {
    if (!isCheckedFile(file.name)) continue;
    for (const d of [...(await worker.getSyntacticDiagnostics(uri)), ...(await worker.getSemanticDiagnostics(uri))]) {
      if (d.category !== ERROR_CATEGORY) continue;
      problems.push({ plugin: id, file: file.name, line: file.text.slice(0, d.start ?? 0).split("\n").length, message: diagnosticText(d.messageText as DiagnosticMessage) });
    }
  }
  return problems;
};

/** The plugins of a content folder's `plugins/`: every folder with an `index.ts`, its plugin files */
export const folderPlugins = (pluginsDir: string): PluginSources[] =>
  readdirSync(pluginsDir)
    .filter(id => statSync(join(pluginsDir, id)).isDirectory() && readdirSync(join(pluginsDir, id)).includes(PLUGIN_ENTRY))
    .sort()
    .map(id => ({
      id,
      files: sortPluginFiles(readdirSync(join(pluginsDir, id))
        .filter(name => PLUGIN_FILE_PATTERN.test(name))
        .map(name => ({ name, text: readFileSync(join(pluginsDir, id, name), "utf8").replace(/\r\n/g, "\n") }))),
    }));

/** Problems as lines a failing test prints: `plugin/file:line message` */
export const problemLines = (problems: readonly PluginTypeProblem[]): string[] => problems.map(p => `${p.plugin}/${p.file}:${p.line} ${p.message}`);
