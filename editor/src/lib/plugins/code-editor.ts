/**
 * The Code tab's editor, the parts that need no Monaco (`monaco.ts` loads it): the panel's keys, the run error as a
 * marker, the theme from the editor's colour tokens, where the type declarations live in the TypeScript worker's
 * file system, and the download of a plugin with its types.
 */

/** The module name a plugin imports its types from (`import type { PluginApi } from "osct-plugin-api"`) */
export const PLUGIN_API_MODULE = "osct-plugin-api";
/** Where `plugin-api.d.ts` lies for the TypeScript worker: node resolution finds `osct-plugin-api` there */
export const PLUGIN_API_PATH = `file:///node_modules/${PLUGIN_API_MODULE}/index.d.ts`;

/** The model of the open plugin (one at a time; a path the worker resolves `osct-plugin-api` from) */
export const pluginModelPath = (id: string): string => `file:///plugins/${id || "draft"}/index.ts`;

/** A glob key of a declaration file below some `node_modules/` → its path in the worker's file system */
export const libPath = (key: string): string => {
  const at = key.indexOf("node_modules/");
  return `file:///${at >= 0 ? key.slice(at) : key.replace(/^(\.\.?\/)+/, "")}`;
};

export type CodeAction = "run" | "save";

/** The subset of Monaco's `KeyMod` / `KeyCode` the keys need */
export interface KeyCodes {
  KeyMod: { CtrlCmd: number };
  KeyCode: { Enter: number; KeyS: number };
}

/**
 * The panel's own keys over Monaco's: Ctrl+Enter runs, Ctrl+S saves (Cmd on a Mac). Tab indents by itself (two
 * spaces, `EDITOR_OPTIONS`).
 */
export const codeKeys = ({ KeyMod, KeyCode }: KeyCodes): Array<{ keybinding: number; action: CodeAction }> => [
  { keybinding: KeyMod.CtrlCmd | KeyCode.Enter, action: "run" },
  { keybinding: KeyMod.CtrlCmd | KeyCode.KeyS, action: "save" },
];

/** The editor's options that are not the theme or the model */
export const EDITOR_OPTIONS = {
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: false,
  fontSize: 12,
  lineHeight: 18,
  fontFamily: 'ui-monospace, Consolas, "SF Mono", monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  fixedOverflowWidgets: true,
  renderLineHighlight: "line",
  lineNumbersMinChars: 3,
  folding: false,
  padding: { top: 6, bottom: 6 },
  tabFocusMode: false,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
} as const;

export interface RunMarker {
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
  message: string;
}

/** The error of the last Run as a marker on its line (the whole line); none without a line in range */
export const runMarker = (error: { message: string; line: number | null } | null, lineCount: number, lineEnd: (line: number) => number): RunMarker[] => {
  if (!error || error.line === null || error.line < 1 || error.line > lineCount) return [];
  return [{ startLineNumber: error.line, endLineNumber: error.line, startColumn: 1, endColumn: lineEnd(error.line), message: error.message }];
};

export interface CodeTheme {
  base: "vs" | "vs-dark";
  inherit: true;
  rules: [];
  colors: Record<string, string>;
}

/**
 * A colour as Monaco takes it, `#rrggbb`: the build's CSS minifier shortens `#ffffff` to `#fff`. Anything that is
 * not a hex colour gives `fallback`.
 */
export const hexColour = (value: string, fallback = "#808080"): string => {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{8}$/.test(hex)) return hex.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/.test(hex)) return `#${[...hex.slice(1, 4)].map(digit => digit + digit).join("")}`;
  return fallback;
};

/**
 * Monaco's theme from the editor's colour tokens (`app.css`, day and night): the editor's surface, text, lines and
 * danger; the syntax colours are the base theme's. `read` gives a custom property's value.
 */
export const codeTheme = (read: (name: string) => string, dark: boolean): CodeTheme => {
  const token = (name: string) => hexColour(read(name));
  const background = token("--control-background");
  const surface = token("--surface");
  const text = token("--text");
  const muted = token("--muted");
  const line = token("--line");
  const pressed = token("--pressed-background");
  const hover = token("--hover-background");
  return {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": background,
      "editor.foreground": text,
      "editorGutter.background": background,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": text,
      "editorCursor.foreground": text,
      "editor.lineHighlightBackground": hover,
      "editor.lineHighlightBorder": hover,
      "editor.selectionBackground": pressed,
      "editor.inactiveSelectionBackground": pressed,
      "editorIndentGuide.background1": line,
      "editorWhitespace.foreground": line,
      "editorError.foreground": token("--danger"),
      "editorWidget.background": surface,
      "editorWidget.border": line,
      "editorHoverWidget.background": surface,
      "editorHoverWidget.border": line,
      "editorSuggestWidget.background": surface,
      "editorSuggestWidget.border": line,
      "editorSuggestWidget.foreground": text,
      "editorSuggestWidget.selectedBackground": pressed,
      "editorSuggestWidget.selectedForeground": text,
      "editorSuggestWidget.highlightForeground": text,
      "list.hoverBackground": hover,
      "focusBorder": line,
      "scrollbarSlider.background": `${muted}33`,
      "scrollbarSlider.hoverBackground": `${muted}55`,
      "scrollbarSlider.activeBackground": `${muted}77`,
    },
  };
};

/** The `tsconfig.json` of a downloaded plugin: `osct-plugin-api` is the declaration file next to it */
export const DOWNLOAD_TSCONFIG = `{
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
    "paths": { "${PLUGIN_API_MODULE}": ["./plugin-api.d.ts"] }
  },
  "files": ["index.ts"]
}
`;

/** The files of a plugin's download: its source, the API's types and a tsconfig that joins them, in its folder */
export const downloadFiles = (id: string, source: string, pluginApi: string): Array<{ name: string; text: string }> => [
  { name: `${id}/index.ts`, text: source },
  { name: `${id}/plugin-api.d.ts`, text: pluginApi },
  { name: `${id}/tsconfig.json`, text: DOWNLOAD_TSCONFIG },
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** A zip archive of text files, stored without compression (a few kB of source need none) */
export const zipFiles = (files: Array<{ name: string; text: string }>, date = new Date()): Uint8Array => {
  const encoder = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8 names
    l.setUint16(10, time, true);
    l.setUint16(12, day, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(12, time, true);
    c.setUint16(14, day, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
