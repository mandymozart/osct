import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker";
import pluginApi from "./plugin-api.d.ts?raw";
import { codeKeys, codeTheme, type CodeAction, EDITOR_OPTIONS, pluginModelPath, runMarker } from "./code-editor";
import { threeTypesByPath } from "./three-types";
import { codeLanguage } from "#lib/library-code.js";
import type { PluginFile } from "@shared/types/plugins";
import {
  diagnosticText, ERROR_CATEGORY, isCheckedFile, PLUGIN_COMPILER_OPTIONS, pluginCheckLibs, pluginCheckPath, type DiagnosticMessage,
  type PluginSources, type PluginTypeProblem,
} from "@shared/plugins/type-check";

/**
 * Monaco for the Code tab, loaded with the tab only (`CodePanel` imports this module dynamically – the reader and
 * the other tabs carry nothing of it). TypeScript gets the plugin type check's compiler options and declarations
 * (`shared/plugins/type-check.ts`, #366 – the Node check's too): the plugin API as the module `osct-plugin-api`
 * (`plugin-api.d.ts`, generated from the engine), the shader imports and three's own types, so completion and type errors
 * inline are the check's. Its workers are bundled by Vite (`?worker`) and served from the editor's base path.
 */

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === "typescript" || label === "javascript" ? new TypeScriptWorker() : new EditorWorker()),
};

const ts = monaco.typescript;
// The plugin type check's own options and declarations (#366, `shared/plugins/type-check.ts`) – the ones the Node check uses
ts.typescriptDefaults.setCompilerOptions(PLUGIN_COMPILER_OPTIONS as unknown as monaco.typescript.CompilerOptions);
ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
ts.typescriptDefaults.setEagerModelSync(true);
ts.typescriptDefaults.setExtraLibs(pluginCheckLibs(pluginApi, threeTypesByPath()));

const THEME = "osct";
/** Monaco's theme from the editor's tokens now (day or night) */
const applyTheme = () => {
  const style = getComputedStyle(document.documentElement);
  monaco.editor.defineTheme(THEME, codeTheme(name => style.getPropertyValue(name), style.colorScheme === "dark"));
  monaco.editor.setTheme(THEME);
};

export interface CodeEditorOptions {
  readOnly: boolean;
  /** A file's text changed in the editor */
  onChange(name: string, value: string): void;
  onAction(action: CodeAction): void;
}

export interface CodeEditor {
  /**
   * The plugin's files as models (#352): one per file, kept while the plugin is open (each its own undo history), the ones
   * no longer there disposed, the active one in the editor. Idempotent – a model's text is set only when it differs.
   */
  sync(plugin: string, files: readonly PluginFile[], active: string): void;
  setReadOnly(readOnly: boolean): void;
  /** The last Run's error as a marker on its line; null clears it */
  setRunError(error: { message: string; line: number | null } | null): void;
  /** The shown file's line in the middle, the cursor on it (a type error picked under the editor) */
  revealLine(line: number): void;
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

  /** The open plugin's models by file name, each with its change listener */
  const models = new Map<string, { model: monaco.editor.ITextModel; changes: monaco.IDisposable }>();
  let plugin = "";
  let shown = "";
  const editor = monaco.editor.create(container, { ...EDITOR_OPTIONS, model: null, theme: THEME, readOnly: options.readOnly, ariaLabel: "Plugin source" });
  for (const { keybinding, action } of codeKeys(monaco)) editor.addCommand(keybinding, () => options.onAction(action));
  let runError: { message: string; line: number | null } | null = null;
  const markRun = () => {
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, "run", runMarker(runError, model.getLineCount(), line => model.getLineMaxColumn(line)).map(marker => ({ ...marker, severity: monaco.MarkerSeverity.Error, source: "Run" })));
  };
  const drop = (name: string) => {
    const held = models.get(name);
    if (!held) return;
    held.changes.dispose();
    if (!held.model.isDisposed()) held.model.dispose();
    models.delete(name);
  };

  return {
    sync(nextPlugin, files, active) {
      if (nextPlugin !== plugin) {
        for (const name of [...models.keys()]) drop(name);
        plugin = nextPlugin;
        runError = null;
      }
      let filesChanged = false;
      for (const name of [...models.keys()]) {
        if (files.some(f => f.name === name)) continue;
        drop(name);
        filesChanged = true;
      }
      for (const file of files) {
        const held = models.get(file.name);
        if (held) {
          if (held.model.getValue() !== file.text) held.model.setValue(file.text);
          continue;
        }
        const model = makeModel(plugin, file.name, file.text);
        models.set(file.name, { model, changes: model.onDidChangeContent(() => options.onChange(file.name, model.getValue())) });
        filesChanged = true;
      }
      // A file that came or went changes what the others' imports find: every model is validated again (the TypeScript
      // worker re-checks all models when its options are set – an import of a sibling made after it is no error then)
      if (filesChanged) ts.typescriptDefaults.setDiagnosticsOptions({ ...ts.typescriptDefaults.getDiagnosticsOptions() });
      const target = models.get(active) ?? models.values().next().value;
      if (target && editor.getModel() !== target.model) {
        editor.setModel(target.model);
        shown = active;
        markRun();
      } else if (!target) {
        editor.setModel(null);
        shown = "";
      }
    },
    setReadOnly(readOnly) {
      editor.updateOptions({ readOnly });
    },
    setRunError(error) {
      runError = error;
      markRun();
    },
    revealLine(line) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    },
    focus() {
      editor.focus();
    },
    dispose() {
      media.removeEventListener("change", applyTheme);
      schemeObserver.disconnect();
      editor.dispose();
      for (const name of [...models.keys()]) drop(name);
      void shown;
    },
  };
};

/**
 * Type-check plugins' files (#352 Publish, #366 the Code tab's check of a saved plugin): every file as a model of its own at
 * its check path (`file:///check/<plugin>/<name>`, apart from the Code tab's open models), its TypeScript files asked of the
 * TypeScript worker for their syntax and type errors – the shared check's options and declarations, as the Node check runs
 * them. The models go again afterwards.
 */
export const typeCheckPlugins = async (sources: readonly PluginSources[]): Promise<PluginTypeProblem[]> => {
  const made: monaco.editor.ITextModel[] = [];
  const checked: Array<{ plugin: string; file: string; model: monaco.editor.ITextModel }> = [];
  try {
    for (const { id, files } of sources) {
      for (const file of files) {
        const uri = monaco.Uri.parse(pluginCheckPath(id, file.name));
        monaco.editor.getModel(uri)?.dispose();
        const model = monaco.editor.createModel(file.text, codeLanguage(file.name), uri);
        made.push(model);
        if (isCheckedFile(file.name)) checked.push({ plugin: id, file: file.name, model });
      }
    }
    if (!checked.length) return [];
    const worker = await (await ts.getTypeScriptWorker())(...checked.map(c => c.model.uri));
    const problems: PluginTypeProblem[] = [];
    for (const { plugin, file, model } of checked) {
      const name = model.uri.toString();
      const diagnostics = [...(await worker.getSyntacticDiagnostics(name)), ...(await worker.getSemanticDiagnostics(name))];
      for (const d of diagnostics) {
        if (d.category !== ERROR_CATEGORY) continue;
        problems.push({ plugin, file, line: model.getPositionAt(d.start ?? 0).lineNumber, message: diagnosticText(d.messageText as DiagnosticMessage) });
      }
    }
    return problems;
  } finally {
    for (const model of made) if (!model.isDisposed()) model.dispose();
  }
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

/** The model of a plugin's file (an earlier one there is replaced): TypeScript, or a shader's language */
const makeModel = (plugin: string, name: string, value: string): monaco.editor.ITextModel => {
  const uri = monaco.Uri.parse(pluginModelPath(plugin, name));
  monaco.editor.getModel(uri)?.dispose();
  return monaco.editor.createModel(value, codeLanguage(name), uri);
};
