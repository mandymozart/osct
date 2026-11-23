import { PLUGIN_ENTRY, PLUGIN_FILE_PATTERN, isShaderFile, type PluginFile } from "@shared/types/plugins";
import { transpilePlugin, type CompileResult } from "./compile";

/**
 * A plugin's files → one ES module, in the browser (#352, docs/plugins.md "A plugin of several files"): the Code tab's
 * Run, the auto-load and Publish. A plugin of one file (`index.ts` alone) goes through sucrase as before – no wasm for a
 * small plugin. A plugin of several files is bundled by **esbuild-wasm**, the same version the content build's esbuild is
 * (scripts/, 0.25.2), with the same rule: a plugin imports nothing but its own files – TypeScript by `./name`, a shader
 * (`.frag`, `.vert`, `.glsl`, `.wgsl`) as a string (`import WATER from "./water.frag"`, esbuild's text loader); types
 * with `import type` (erased). The files are a folder in memory; esbuild's worker loads with the first bundle and stays.
 */

export type Esbuild = typeof import("esbuild-wasm");

let ready: Promise<Esbuild> | null = null;

/** esbuild-wasm, started once (its wasm from the editor's own assets, run in its own worker) */
const esbuild = (): Promise<Esbuild> => {
  ready ??= (async () => {
    const [module, { default: wasmURL }] = await Promise.all([import("esbuild-wasm"), import("esbuild-wasm/esbuild.wasm?url")]);
    await module.initialize({ wasmURL, worker: true });
    return module;
  })();
  ready.catch(() => { ready = null; });
  return ready;
};

/** The namespace of the plugin's own files in esbuild's resolution */
const FILES = "plugin-files";

/** A relative import → the file it names: `./fluid` → `fluid.ts`, `./water.frag` → `water.frag` */
export const resolveFile = (names: readonly string[], spec: string): string | null => {
  const name = spec.replace(/^\.\//, "");
  if (name.includes("/")) return null;
  if (names.includes(name)) return name;
  return names.includes(`${name}.ts`) ? `${name}.ts` : null;
};

/**
 * The plugin's files as one module: `{ code }`, or the first error with the file and the line it names. `name` names the
 * plugin in errors and in the entry's path.
 */
export const buildPlugin = async (files: readonly PluginFile[], name: string, load: () => Promise<Esbuild> = esbuild): Promise<CompileResult> => {
  const entry = files.find(file => file.name === PLUGIN_ENTRY);
  if (!entry) return { error: { message: `A plugin needs ${PLUGIN_ENTRY}`, line: null, file: null } };
  if (files.length === 1) return transpilePlugin(entry.text, name);
  const bad = files.find(file => !PLUGIN_FILE_PATTERN.test(file.name));
  if (bad) return { error: { message: `"${bad.name}": a file is .ts, .frag, .vert, .glsl or .wgsl`, line: null, file: bad.name } };
  let build: Esbuild;
  try {
    build = await load();
  } catch (e) {
    return { error: { message: `The bundler did not start: ${(e as Error).message ?? e}`, line: null, file: null } };
  }
  const names = files.map(file => file.name);
  const texts = new Map(files.map(file => [file.name, file.text]));
  try {
    const result = await build.build({
      entryPoints: [PLUGIN_ENTRY],
      bundle: true,
      format: "esm",
      target: "es2020",
      write: false,
      logLevel: "silent",
      plugins: [{
        name: "osct-plugin-files",
        setup(b) {
          b.onResolve({ filter: /.*/ }, args => {
            if (args.kind === "entry-point") return { path: PLUGIN_ENTRY, namespace: FILES };
            const file = args.path.startsWith("./") ? resolveFile(names, args.path) : null;
            if (file) return { path: file, namespace: FILES };
            return {
              errors: [{
                text: args.path.startsWith(".")
                  ? `"${args.path}" is no file of this plugin – a plugin imports its own files by ./name`
                  : `a plugin imports nothing – "${args.path}" is not available; three.js is api.three, types with \`import type\``,
              }],
            };
          });
          b.onLoad({ filter: /.*/, namespace: FILES }, args => ({
            contents: texts.get(args.path) ?? "",
            loader: isShaderFile(args.path) ? "text" : "ts",
          }));
        },
      }],
    });
    return { code: result.outputFiles?.[0]?.text ?? "" };
  } catch (e) {
    const failure = e as { errors?: Array<{ text: string; location?: { file: string; line: number } | null }>; message?: string };
    const first = failure.errors?.[0];
    if (!first) return { error: { message: failure.message ?? String(e), line: null, file: null } };
    const file = first.location?.file?.replace(`${FILES}:`, "") ?? null;
    return { error: { message: first.text, line: first.location?.line ?? null, file } };
  }
};
