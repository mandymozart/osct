import type { PluginFile } from "../types/plugins";

/**
 * The type check of the experience's plugins (#366) – **one definition, two runtimes**: the compiler options, the
 * declarations a plugin is checked against and where every file lies. The editor gives them to Monaco's TypeScript worker
 * (the Code tab's underlines, the check after a save, the publish's check), and `createPluginTypeChecker` runs the same
 * program with any TypeScript – Node's in the `osct` CLI and in the tests, Monaco's own bundled TypeScript in the test
 * that holds both runtimes to one verdict.
 *
 * The file system is the TypeScript worker's: every file is a `file:///` path, the current directory is empty.
 * - A plugin's file: `file:///check/<plugin>/<name>` – `./fluid` resolves to `fluid.ts` beside it.
 * - The plugin API (`plugin-api.d.ts`, generated from the engine): the module `osct-plugin-api` in `file:///node_modules/`.
 * - Shader imports (`import WATER from "./water.frag"`): strings, declared in `file:///node_modules/@types/osct-shader-files/`.
 * - three's own declarations the plugin API reaches: `file:///node_modules/@types/three/…` (`isCheckedThreeType`).
 * - The standard library: TypeScript's `lib.es2020.d.ts`, `lib.dom.d.ts`, `lib.dom.iterable.d.ts` at the root.
 * Every file is a root of the program, as the worker makes every model and declaration one; only the plugins' TypeScript
 * files are asked for their errors (syntax, then types – TypeScript's errors, never its suggestions).
 */

/** The module name a plugin imports its types from (`import type { PluginApi } from "osct-plugin-api"`) */
export const PLUGIN_API_MODULE = "osct-plugin-api";
/** Where `plugin-api.d.ts` lies: node resolution finds `osct-plugin-api` there */
export const PLUGIN_API_PATH = `file:///node_modules/${PLUGIN_API_MODULE}/index.d.ts`;

/** Shader files a plugin imports are strings to TypeScript (esbuild's text loader in the bundle, #352) */
export const SHADER_MODULES = ["frag", "vert", "glsl", "wgsl"]
  .map(extension => `declare module "*.${extension}" {\n  const text: string;\n  export default text;\n}\n`)
  .join("");
export const SHADER_MODULES_PATH = "file:///node_modules/@types/osct-shader-files/index.d.ts";

/** The folder of three's declarations */
export const THREE_TYPES_PATH = "file:///node_modules/@types/three/";

/** Where a plugin's file lies for the check */
export const pluginCheckPath = (plugin: string, name: string): string => `file:///check/${plugin}/${name}`;

/**
 * The compiler options – TypeScript's numbers, as Monaco's worker and `ts.createProgram` both take them: strict, ES2020
 * (target 7), ES modules (module 99) resolved as a bundler does (moduleResolution 100 – the content build's and a
 * download's), the DOM, no automatic `@types`. `allowNonTsExtensions` lets a shader file be a model like any other.
 */
export const PLUGIN_COMPILER_OPTIONS = {
  strict: true,
  target: 7,
  module: 99,
  moduleResolution: 100,
  lib: ["lib.es2020.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  types: [] as string[],
  noEmit: true,
  skipLibCheck: true,
  isolatedModules: true,
  esModuleInterop: true,
  allowNonTsExtensions: true,
};

/**
 * Which of three's declarations (a path below `@types/three/`) a plugin is checked against: the core the plugin API
 * reaches and the post-processing pass a feedback pass extends – not the WebGPU and node-material parts (plugins never see
 * them). Monaco's list (`editor/src/lib/plugins/three-types.ts`, a glob) is held to this one by a test.
 */
export const isCheckedThreeType = (path: string): boolean => {
  if (path === "index.d.ts") return true;
  if (path === "examples/jsm/postprocessing/Pass.d.ts" || path === "examples/jsm/postprocessing/ShaderPass.d.ts") return true;
  if (!path.startsWith("src/") || !path.endsWith(".d.ts")) return false;
  if (path.startsWith("src/nodes/") || /\/nodes\//.test(path.slice(3)) || /\/webgpu\//.test(path.slice(3))) return false;
  if (path.startsWith("src/renderers/common/") || path.startsWith("src/renderers/webgl-fallback/")) return false;
  return path !== "src/Three.TSL.d.ts" && !path.startsWith("src/Three.WebGPU");
};

/** A declaration file of the check: its path and text */
export interface PluginCheckLib {
  filePath: string;
  content: string;
}

/**
 * The declarations of the check: the plugin API, the shader imports and three's types (`three`: path below `@types/three/`
 * → text; the ones `isCheckedThreeType` leaves out are dropped)
 */
export const pluginCheckLibs = (pluginApi: string, three: Readonly<Record<string, string>>): PluginCheckLib[] => [
  { filePath: PLUGIN_API_PATH, content: pluginApi },
  { filePath: SHADER_MODULES_PATH, content: SHADER_MODULES },
  ...Object.entries(three)
    .filter(([path]) => isCheckedThreeType(path))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, content]) => ({ filePath: `${THREE_TYPES_PATH}${path}`, content })),
];

/** A plugin's files, as saved */
export interface PluginSources {
  id: string;
  files: PluginFile[];
}

/** A type error in a plugin's file: the line is 1-based */
export interface PluginTypeProblem {
  plugin: string;
  file: string;
  line: number;
  message: string;
}

/** TypeScript's message (a string, or a chain of them) as one line: the head and the lines right under it */
export type DiagnosticMessage = string | { messageText: string; next?: readonly DiagnosticMessage[] };
export const diagnosticText = (text: DiagnosticMessage): string =>
  typeof text === "string" ? text : [text.messageText, ...(text.next ?? []).map(n => (typeof n === "string" ? n : n.messageText))].join(" ");

/** TypeScript's category of an error */
export const ERROR_CATEGORY = 1;

/** A plugin's TypeScript files are checked; its shader files are only there to be found */
export const isCheckedFile = (name: string): boolean => name.endsWith(".ts");

/** The part of a TypeScript module the check needs – Node's `typescript` or Monaco's bundled one */
interface TsDiagnostic {
  category: number;
  start?: number;
  messageText: DiagnosticMessage;
}
interface TsSourceFile {
  getLineAndCharacterOfPosition(position: number): { line: number };
}
interface TsProgram {
  getSourceFile(fileName: string): TsSourceFile | undefined;
  getSyntacticDiagnostics(sourceFile: TsSourceFile): readonly TsDiagnostic[];
  getSemanticDiagnostics(sourceFile: TsSourceFile): readonly TsDiagnostic[];
}
export interface TypeScriptLike {
  createProgram(options: { rootNames: readonly string[]; options: object; host: object }): TsProgram;
  createSourceFile(fileName: string, text: string, languageVersion: never): TsSourceFile;
}

/**
 * The check with a TypeScript of its own: `ts` the module, `libs` the declarations (`pluginCheckLibs`), `readLib` the text of
 * one of TypeScript's standard library files by its name (`lib.es2020.d.ts`). The declarations are parsed once; each call
 * checks plugins together, as a publish carries them.
 */
export const createPluginTypeChecker = (
  ts: TypeScriptLike,
  libs: readonly PluginCheckLib[],
  readLib: (name: string) => string | undefined,
): ((sources: readonly PluginSources[]) => PluginTypeProblem[]) => {
  const declared = new Map(libs.map(lib => [lib.filePath, lib.content]));
  const parsed = new Map<string, TsSourceFile>();
  const fixedText = (name: string): string | undefined => declared.get(name) ?? (/^lib\.[\w.]+\.d\.ts$/.test(name) ? readLib(name) : undefined);
  return sources => {
    const own = new Map<string, string>();
    for (const { id, files } of sources) for (const file of files) own.set(pluginCheckPath(id, file.name), file.text);
    const text = (name: string): string | undefined => own.get(name) ?? fixedText(name);
    const host = {
      getSourceFile: (name: string, languageVersion: never) => {
        if (own.has(name)) return ts.createSourceFile(name, own.get(name)!, languageVersion);
        let file = parsed.get(name);
        if (!file) {
          const content = fixedText(name);
          if (content === undefined) return undefined;
          file = ts.createSourceFile(name, content, languageVersion);
          parsed.set(name, file);
        }
        return file;
      },
      getDefaultLibFileName: () => "lib.es2020.full.d.ts",
      writeFile: () => undefined,
      getCurrentDirectory: () => "",
      getDirectories: () => [],
      getCanonicalFileName: (name: string) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: (name: string) => text(name) !== undefined,
      readFile: (name: string) => text(name),
    };
    const program = ts.createProgram({ rootNames: [...own.keys(), ...declared.keys()], options: PLUGIN_COMPILER_OPTIONS, host });
    const problems: PluginTypeProblem[] = [];
    for (const { id, files } of sources) {
      for (const file of files) {
        if (!isCheckedFile(file.name)) continue;
        const source = program.getSourceFile(pluginCheckPath(id, file.name));
        if (!source) continue;
        for (const d of [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]) {
          if (d.category !== ERROR_CATEGORY) continue;
          problems.push({ plugin: id, file: file.name, line: source.getLineAndCharacterOfPosition(d.start ?? 0).line + 1, message: diagnosticText(d.messageText) });
        }
      }
    }
    return problems;
  };
};
