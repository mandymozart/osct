import { describe, expect, it } from "vitest";
import type { Asset, PluginSummary } from "../api";
import { CODE_MAX_BYTES, codeFiles, codeKindOf, codeLanguage, codeUploadProblem, matchesCodeSearch, pluginIdFrom, usageText } from "../library-code";

/** The Library's code files (#186): scripts are plugin sources, shaders assets of the kind shader */

const shader = (over: Partial<Asset> = {}): Asset => ({
  id: "a1", name: "pulse.frag", kind: "shader", mime: "text/x-glsl; charset=utf-8", size: 120, width: null, height: null, durationMs: null,
  version: 2, url: "https://cdn.example/assets/book/a1/v2.frag", usages: 1, imported: false, createdAt: "2026-10-30T08:00:00.000Z", updatedAt: "2026-10-30T09:00:00.000Z", ...over,
});
const script: PluginSummary = { id: "tint", size: 900, usages: 3, updatedAt: "2026-10-30T07:00:00.000Z", updatedBy: "author@example.com" };

describe("code kinds", () => {
  it("knows scripts and shaders by their extension, nothing else", () => {
    expect(["a.ts", "B.JS"].map(codeKindOf)).toEqual(["script", "script"]);
    expect(["a.glsl", "a.frag", "a.vert", "a.wgsl"].map(codeKindOf)).toEqual(["shader", "shader", "shader", "shader"]);
    expect(["a.png", "a.hlsl", "glsl", "a.ts.bak"].map(codeKindOf)).toEqual([null, null, null, null]);
  });

  it("previews each in its language – GLSL as C, WGSL as itself", () => {
    expect(["a.ts", "a.js", "a.glsl", "a.vert", "a.wgsl"].map(codeLanguage)).toEqual(["typescript", "javascript", "cpp", "cpp", "wgsl"]);
  });

  it("names a script's plugin after the file as the API does", () => {
    expect(pluginIdFrom("Wobble Effect.ts")).toBe("wobble-effect");
    expect(pluginIdFrom("--tint--.js")).toBe("tint");
    expect(pluginIdFrom(`${"a".repeat(39)}-b.ts`)).toBe("a".repeat(39));
  });
});

describe("the code list", () => {
  it("joins the plugin sources and the shader assets by name, the media left out", () => {
    const files = codeFiles([script], [shader(), shader({ id: "img", name: "a.png", kind: "image" })]);
    expect(files.map(f => [f.key, f.kind, f.name, f.usages, f.version])).toEqual([
      ["shader:a1", "shader", "pulse.frag", 1, 2],
      ["script:tint", "script", "tint.ts", 3, null],
    ]);
    expect(files[1].plugin).toBe("tint");
    expect(files[0].asset?.url).toContain("/v2.frag");
  });

  it("searches name and kind", () => {
    const [file] = codeFiles([], [shader()]);
    expect(matchesCodeSearch(file, "pulse")).toBe(true);
    expect(matchesCodeSearch(file, "shader puls")).toBe(true);
    expect(matchesCodeSearch(file, "script")).toBe(false);
  });

  it("says where a file is used", () => {
    expect(usageText([{ kind: "entity", ref: "castle" }, { kind: "plugin", ref: "water" }])).toBe("entity castle, plugin water");
  });
});

describe("before an upload", () => {
  it("refuses a code file above the limit and a script whose name gives no id; other files pass", () => {
    expect(codeUploadProblem({ name: "big.glsl", size: CODE_MAX_BYTES + 1 })).toMatch(/larger than 256 KB/);
    expect(codeUploadProblem({ name: "42.ts", size: 10 })).toMatch(/start it with a letter/);
    expect(codeUploadProblem({ name: "tint.ts", size: CODE_MAX_BYTES })).toBeNull();
    expect(codeUploadProblem({ name: "movie.mp4", size: CODE_MAX_BYTES * 100 })).toBeNull();
  });
});
