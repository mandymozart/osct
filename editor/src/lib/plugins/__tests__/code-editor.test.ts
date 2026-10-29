import { describe, expect, it } from "vitest";
import { codeKeys, codeTheme, crc32, hexColour, downloadFiles, EDITOR_OPTIONS, libPath, PLUGIN_API_PATH, pluginModelPath, runMarker, zipFiles } from "../code-editor";

// Monaco's own values: KeyMod.CtrlCmd = 1 << 11, KeyCode.Enter = 3, KeyCode.KeyS = 49
const KEYS = { KeyMod: { CtrlCmd: 2048 }, KeyCode: { Enter: 3, KeyS: 49 } };

/** The Code tab's editor without Monaco: keys, markers, theme, paths, download */
describe("codeKeys", () => {
  it("runs on Ctrl+Enter and saves on Ctrl+S", () => {
    const keys = codeKeys(KEYS);
    expect(keys.find(k => k.keybinding === (2048 | 3))?.action).toBe("run");
    expect(keys.find(k => k.keybinding === (2048 | 49))?.action).toBe("save");
    expect(keys).toHaveLength(2);
  });

  it("indents with two spaces on Tab (Tab never leaves the editor)", () => {
    expect(EDITOR_OPTIONS).toMatchObject({ tabSize: 2, insertSpaces: true, detectIndentation: false, tabFocusMode: false });
  });
});

describe("runMarker", () => {
  const lineEnd = (line: number) => line * 10;

  it("marks the whole line of a Run's error", () => {
    expect(runMarker({ message: "Unexpected token", line: 3 }, 5, lineEnd)).toEqual([
      { startLineNumber: 3, endLineNumber: 3, startColumn: 1, endColumn: 30, message: "Unexpected token" },
    ]);
  });

  it("marks nothing without an error, without a line or beyond the text", () => {
    expect(runMarker(null, 5, lineEnd)).toEqual([]);
    expect(runMarker({ message: "boom", line: null }, 5, lineEnd)).toEqual([]);
    expect(runMarker({ message: "boom", line: 6 }, 5, lineEnd)).toEqual([]);
  });
});

describe("codeTheme", () => {
  const tokens: Record<string, string> = {
    "--control-background": " #383838", "--surface": "#2c2c2c", "--text": "#ffffff", "--muted": "#a3a3a3",
    "--line": "#444444", "--pressed-background": "#4f4f4f", "--hover-background": "#3f3f3f", "--danger": "#ff6b5b",
  };

  it("takes the editor's colour tokens, on the dark base at night", () => {
    const theme = codeTheme(name => tokens[name] ?? "", true);
    expect(theme.base).toBe("vs-dark");
    expect(theme.colors["editor.background"]).toBe("#383838");
    expect(theme.colors["editor.foreground"]).toBe("#ffffff");
    expect(theme.colors["editorError.foreground"]).toBe("#ff6b5b");
    expect(theme.colors["editorSuggestWidget.background"]).toBe("#2c2c2c");
    expect(Object.values(theme.colors).every(colour => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(colour))).toBe(true);
  });

  it("expands the minified short hex colours of the built CSS", () => {
    const theme = codeTheme(name => ({ ...tokens, "--text": "#fff", "--line": "#444" })[name] ?? "", true);
    expect(theme.colors["editor.foreground"]).toBe("#ffffff");
    expect(theme.colors["editorWidget.border"]).toBe("#444444");
    expect(hexColour("#FF6B5B80")).toBe("#ff6b5b");
    expect(hexColour("rgb(1, 2, 3)")).toBe("#808080");
  });

  it("uses the light base by day", () => {
    expect(codeTheme(name => tokens[name] ?? "", false).base).toBe("vs");
  });
});

describe("paths in the TypeScript worker", () => {
  it("puts the plugin API where node resolution finds osct-plugin-api", () => {
    expect(PLUGIN_API_PATH).toBe("file:///node_modules/osct-plugin-api/index.d.ts");
  });

  it("maps a glob key of three's types into node_modules", () => {
    expect(libPath("../../../node_modules/@types/three/src/Three.d.ts")).toBe("file:///node_modules/@types/three/src/Three.d.ts");
    expect(libPath("/node_modules/@types/three/index.d.ts")).toBe("file:///node_modules/@types/three/index.d.ts");
  });

  it("gives every plugin its own model path", () => {
    expect(pluginModelPath("tint")).toBe("file:///plugins/tint/index.ts");
    expect(pluginModelPath("")).toBe("file:///plugins/draft/index.ts");
  });
});

describe("the download", () => {
  it("holds index.ts, plugin-api.d.ts and a tsconfig that maps osct-plugin-api to it", () => {
    const files = downloadFiles("tint", "export const register = () => {};\n", "export interface PluginApi {}\n");
    expect(files.map(f => f.name)).toEqual(["tint/index.ts", "tint/plugin-api.d.ts", "tint/tsconfig.json"]);
    expect(files[2].text).toContain('"osct-plugin-api": ["./plugin-api.d.ts"]');
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a zip whose entries read back", () => {
    const files = [{ name: "a/index.ts", text: "const ä = 1;\n" }, { name: "a/plugin-api.d.ts", text: "export {};\n" }];
    const zip = zipFiles(files, new Date(2026, 9, 29, 12, 0, 0));
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const read: Array<{ name: string; text: string }> = [];
    let at = 0;
    while (view.getUint32(at, true) === 0x04034b50) {
      const size = view.getUint32(at + 18, true);
      const nameLength = view.getUint16(at + 26, true);
      const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLength));
      const data = zip.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
      expect(view.getUint32(at + 14, true)).toBe(crc32(data));
      read.push({ name, text: new TextDecoder().decode(data) });
      at += 30 + nameLength + size;
    }
    expect(read).toEqual(files);
    expect(view.getUint32(at, true)).toBe(0x02014b50);
  });
});
