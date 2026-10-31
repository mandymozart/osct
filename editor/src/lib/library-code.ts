import type { Asset, PluginSummary, Usage } from "./api";

/**
 * The Library's code files (#186): **scripts** are the book's plugin sources (the Code tab's list – the API's
 * `plugins`, no second copy), **shaders** are assets of the kind `shader` (a plugin loads one by its URL with
 * `api.loadText`). One list of both: name, kind, size and uses, a read-only preview in the language of the file.
 */

export type CodeKind = "script" | "shader";

/** The file extensions of each code kind (the API's `Plugins::EXTENSIONS`, `Assets::KINDS` → shader) */
export const CODE_EXTENSIONS: Record<CodeKind, readonly string[]> = { script: [".ts", ".js"], shader: [".glsl", ".frag", ".vert", ".wgsl"] };

/** A code file larger than this is refused by the API (`Plugins::MAX_SOURCE_BYTES`, `Assets::TEXT_MAX_BYTES`) */
export const CODE_MAX_BYTES = 262144;

const extensionOf = (name: string): string => (name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "");

/** The code kind of a file name, null for any other file */
export const codeKindOf = (name: string): CodeKind | null => {
  const extension = extensionOf(name);
  if (CODE_EXTENSIONS.script.includes(extension)) return "script";
  if (CODE_EXTENSIONS.shader.includes(extension)) return "shader";
  return null;
};

/** Monaco's language for a code file: GLSL reads as C (Monaco has no GLSL), WGSL as itself */
export const codeLanguage = (name: string): "typescript" | "javascript" | "cpp" | "wgsl" => {
  const extension = extensionOf(name);
  if (extension === ".js") return "javascript";
  if (extension === ".ts") return "typescript";
  return extension === ".wgsl" ? "wgsl" : "cpp";
};

/** The plugin id an uploaded script gets – its name's stem, lower case, other characters a `-` (the API's `Plugins::idFrom`) */
export const pluginIdFrom = (name: string): string => {
  const stem = (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name).toLowerCase();
  return stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
};

/** One row of the code list: a plugin source or a shader asset */
export interface CodeFile {
  /** Unique in the list: `script:<id>` / `shader:<asset id>` */
  key: string;
  kind: CodeKind;
  /** A script shows as `<id>.ts`, a shader by its uploaded name */
  name: string;
  /** What the list shows: the name, with an asterisk while the Code tab holds unsaved edits of the script (#232) */
  label: string;
  size: number;
  usages: number;
  updatedAt: string;
  /** A shader's version (a replace makes a new one); a script has none */
  version: number | null;
  /** The plugin's id (a script) */
  plugin?: string;
  /** The asset (a shader) */
  asset?: Asset;
}

/**
 * A plugin's name where the editor lists it – the Code tab's picker, the Library's code list (#232): unchanged, the name
 * alone; with unsaved edits, the name and an asterisk. Saved but not published gets no mark: every stored source is part
 * of the draft, and the top bar already says whether readers have the draft (*draft only*, *live on …*).
 */
export const pluginLabel = (name: string, unsaved: boolean): string => (unsaved ? `${name}*` : name);

/** The Code tab's open source as the labels need it: the plugin open, a new one being added, unsaved edits */
export interface OpenCode {
  open: string | null;
  adding: boolean;
  unsaved: boolean;
}

/** The plugin with unsaved edits in the Code tab – null for none, and for a new plugin (it has no id yet) */
export const unsavedPlugin = (code: OpenCode): string | null => (!code.adding && code.open && code.unsaved ? code.open : null);

/** The Code tab's picker: a new plugin first while it is being added, then one option per plugin */
export const pluginOptions = (ids: readonly string[], code: OpenCode): Array<{ value: string; label: string }> => [
  ...(code.adding ? [{ value: "", label: pluginLabel("new plugin", code.unsaved) }] : []),
  ...ids.map(id => ({ value: id, label: pluginLabel(id, id === unsavedPlugin(code)) })),
];

/** Scripts and shaders in one list, by name; `unsaved` = the plugin the Code tab holds unsaved edits of */
export const codeFiles = (scripts: readonly PluginSummary[], assets: readonly Asset[], unsaved: string | null = null): CodeFile[] =>
  [
    ...scripts.map((p): CodeFile => ({ key: `script:${p.id}`, kind: "script", name: `${p.id}.ts`, label: pluginLabel(`${p.id}.ts`, p.id === unsaved), size: p.size, usages: p.usages ?? 0, updatedAt: p.updatedAt, version: null, plugin: p.id })),
    ...assets.filter(a => a.kind === "shader").map((a): CodeFile => ({ key: `shader:${a.id}`, kind: "shader", name: a.name, label: a.name, size: a.size, usages: a.usages, updatedAt: a.updatedAt, version: a.version, asset: a })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));

/** Every word of the query in the file's name or kind */
export const matchesCodeSearch = (file: Pick<CodeFile, "name" | "kind">, query: string): boolean => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${file.name} ${file.kind} code`.toLowerCase();
  return words.every(word => text.includes(word));
};

/** Where a file is used, for a line: `entity castle, target racoon` – the kinds as the API names them */
export const usageText = (usages: readonly Usage[]): string => usages.map(usage => `${usage.kind} ${usage.ref}`).join(", ");

/** A problem the API would answer for this file anyway (a type or the size), said before the upload – null when it may go */
export const codeUploadProblem = (file: Pick<File, "name" | "size">): string | null => {
  if (!codeKindOf(file.name)) return null;
  if (file.size > CODE_MAX_BYTES) return `${file.name} is larger than ${CODE_MAX_BYTES / 1024} KB`;
  if (codeKindOf(file.name) === "script" && !/^[a-z]/.test(pluginIdFrom(file.name))) return `${file.name}: a script's name becomes its plugin id – start it with a letter`;
  return null;
};
