import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker";
import pluginApi from "./plugin-api.d.ts?raw";
import { codeKeys, codeTheme, type CodeAction, EDITOR_OPTIONS, libPath, PLUGIN_API_PATH, pluginModelPath, runMarker } from "./code-editor";

/**
 * Monaco for the Code tab, loaded with the tab only (`CodePanel` imports this module dynamically – the reader and
 * the other tabs carry nothing of it). TypeScript gets the content build's compiler options and declarations: the
 * plugin API as the module `osct-plugin-api` (`plugin-api.d.ts`, generated from the engine) and three's own types,
 * so completion and type errors inline are the build's. Its workers are bundled by Vite (`?worker`) and served from
 * the editor's base path.
 */

/** three's declarations the plugin API reaches (the WebGPU / node material parts are left out: plugins never see them) */
const threeTypes = import.meta.glob(
  [
    "../../../node_modules/@types/three/index.d.ts",
    "../../../node_modules/@types/three/src/**/*.d.ts",
    "!../../../node_modules/@types/three/src/nodes/**",
    "!../../../node_modules/@types/three/src/**/nodes/**",
    "!../../../node_modules/@types/three/src/**/webgpu/**",
    "!../../../node_modules/@types/three/src/renderers/common/**",
    "!../../../node_modules/@types/three/src/renderers/webgl-fallback/**",
    "!../../../node_modules/@types/three/src/Three.TSL.d.ts",
    "!../../../node_modules/@types/three/src/Three.WebGPU*.d.ts",
    "../../../node_modules/@types/three/examples/jsm/postprocessing/Pass.d.ts",
    "../../../node_modules/@types/three/examples/jsm/postprocessing/ShaderPass.d.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === "typescript" || label === "javascript" ? new TypeScriptWorker() : new EditorWorker()),
};

const ts = monaco.typescript;
ts.typescriptDefaults.setCompilerOptions({
  strict: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  lib: ["es2020", "dom", "dom.iterable"],
  types: [],
  noEmit: true,
  skipLibCheck: true,
  isolatedModules: true,
  esModuleInterop: true,
  allowNonTsExtensions: true,
});
ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
ts.typescriptDefaults.setEagerModelSync(true);
ts.typescriptDefaults.setExtraLibs([
  { content: pluginApi, filePath: PLUGIN_API_PATH },
  ...Object.entries(threeTypes).map(([key, content]) => ({ content, filePath: libPath(key) })),
]);

const THEME = "osct";
/** Monaco's theme from the editor's tokens now (day or night) */
const applyTheme = () => {
  const style = getComputedStyle(document.documentElement);
  monaco.editor.defineTheme(THEME, codeTheme(name => style.getPropertyValue(name), style.colorScheme === "dark"));
  monaco.editor.setTheme(THEME);
};

export interface CodeEditorOptions {
  value: string;
  modelId: string;
  readOnly: boolean;
  onChange(value: string): void;
  onAction(action: CodeAction): void;
}

export interface CodeEditor {
  /** Show another plugin's source (a new model: its own undo history) */
  open(modelId: string, value: string): void;
  setReadOnly(readOnly: boolean): void;
  /** The last Run's error as a marker on its line; null clears it */
  setRunError(error: { message: string; line: number | null } | null): void;
  focus(): void;
  dispose(): void;
}

/** A Monaco editor in `container` (it fills the container and follows its size) */
export const createCodeEditor = (container: HTMLElement, options: CodeEditorOptions): CodeEditor => {
  applyTheme();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", applyTheme);
  const schemeObserver = new MutationObserver(applyTheme);
  schemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });

  let model = makeModel(options.modelId, options.value);
  const editor = monaco.editor.create(container, { ...EDITOR_OPTIONS, model, theme: THEME, readOnly: options.readOnly, ariaLabel: "Plugin source (TypeScript)" });
  let changes = model.onDidChangeContent(() => options.onChange(model.getValue()));
  for (const { keybinding, action } of codeKeys(monaco)) editor.addCommand(keybinding, () => options.onAction(action));
  let runError: { message: string; line: number | null } | null = null;
  const markRun = () => monaco.editor.setModelMarkers(model, "run", runMarker(runError, model.getLineCount(), line => model.getLineMaxColumn(line)).map(marker => ({ ...marker, severity: monaco.MarkerSeverity.Error, source: "Run" })));

  return {
    open(modelId, value) {
      const previous = model;
      changes.dispose();
      model = makeModel(modelId, value);
      changes = model.onDidChangeContent(() => options.onChange(model.getValue()));
      editor.setModel(model);
      if (!previous.isDisposed()) previous.dispose();
      runError = null;
    },
    setReadOnly(readOnly) {
      editor.updateOptions({ readOnly });
    },
    setRunError(error) {
      runError = error;
      markRun();
    },
    focus() {
      editor.focus();
    },
    dispose() {
      media.removeEventListener("change", applyTheme);
      schemeObserver.disconnect();
      changes.dispose();
      editor.dispose();
      model.dispose();
    },
  };
};

export interface CodePreview {
  /** Show another file: its text in its language (`typescript`, `javascript`, `cpp` for GLSL, `wgsl`) */
  show(value: string, language: string): void;
  dispose(): void;
}

/**
 * A read-only Monaco for the Library's code files (#186): the same theme as the Code tab, no editing, a model of its own
 * (`file:///library/…`) apart from the plugins' models
 */
export const createCodePreview = (container: HTMLElement, value: string, language: string): CodePreview => {
  applyTheme();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", applyTheme);
  const schemeObserver = new MutationObserver(applyTheme);
  schemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });
  let shown = 0;
  const uri = () => monaco.Uri.parse(`file:///library/preview-${++shown}`);
  let model = monaco.editor.createModel(value, language, uri());
  const editor = monaco.editor.create(container, {
    ...EDITOR_OPTIONS, model, theme: THEME, readOnly: true, domReadOnly: true, ariaLabel: "Code file preview (read-only)",
  });
  return {
    show(next, nextLanguage) {
      const previous = model;
      model = monaco.editor.createModel(next, nextLanguage, uri());
      editor.setModel(model);
      previous.dispose();
    },
    dispose() {
      media.removeEventListener("change", applyTheme);
      schemeObserver.disconnect();
      editor.dispose();
      model.dispose();
    },
  };
};

/** The model at a plugin's path (an earlier one there is replaced) */
const makeModel = (modelId: string, value: string): monaco.editor.ITextModel => {
  const uri = monaco.Uri.parse(pluginModelPath(modelId));
  monaco.editor.getModel(uri)?.dispose();
  return monaco.editor.createModel(value, "typescript", uri);
};
