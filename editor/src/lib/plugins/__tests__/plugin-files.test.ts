import { describe, expect, it } from "vitest";
import { pluginFilesProblems, pluginText, sortPluginFiles } from "@shared/types/plugins";
import { DOWNLOAD_EXTRAS, downloadFiles, unzipTexts, zipFiles } from "../code-editor";
import { newFileName, pluginFromZip, renameProblem, sizeText } from "../plugin-files";

/** A plugin of several files (#352): the Code tab's tabs, the download and its way back */
describe("the plugin's files", () => {
  it("a new file gets a free name", () => {
    expect(newFileName(["index.ts"], "file", "ts")).toBe("file.ts");
    expect(newFileName(["index.ts", "file.ts", "File-2.ts"], "file", "ts")).toBe("file-3.ts");
    expect(newFileName(["index.ts", "shader.frag"], "shader", "vert")).toBe("shader.vert");
  });

  it("a rename keeps the entry, the pattern and one name each", () => {
    const taken = ["index.ts", "fluid.ts", "water.frag"];
    expect(renameProblem(taken, "fluid.ts", "sea.ts")).toBeNull();
    expect(renameProblem(taken, "fluid.ts", "fluid.ts")).toBeNull();
    expect(renameProblem(taken, "index.ts", "main.ts")).toContain("entry");
    expect(renameProblem(taken, "fluid.ts", "index.ts")).toContain("entry");
    expect(renameProblem(taken, "fluid.ts", "Water.frag")).toContain("there already");
    expect(renameProblem(taken, "fluid.ts", "lib/fluid.ts")).toContain("letters");
    expect(renameProblem(taken, "fluid.ts", "fluid.js")).toContain("letters");
  });

  it("the shared rules: index.ts, names, sizes", () => {
    expect(pluginFilesProblems([{ name: "index.ts", text: "" }, { name: "a.frag", text: "" }])).toEqual([]);
    expect(pluginFilesProblems([{ name: "a.ts", text: "" }])[0]).toContain("index.ts");
    expect(pluginFilesProblems([{ name: "index.ts", text: "" }, { name: "A.ts", text: "" }, { name: "a.ts", text: "" }])[0]).toContain("twice");
    expect(pluginFilesProblems([{ name: "index.ts", text: "x".repeat(256 * 1024 + 1) }])[0]).toContain("larger than 256 KB");
  });

  it("the entry first, then by name; the text joins them in that order", () => {
    const files = [{ name: "b.ts", text: "b" }, { name: "index.ts", text: "i" }, { name: "a.frag", text: "a" }];
    expect(sortPluginFiles(files).map(f => f.name)).toEqual(["index.ts", "a.frag", "b.ts"]);
    expect(pluginText(files)).toBe("i\na\nb");
  });

  it("the download is a folder that comes back as the same plugin", async () => {
    const files = [{ name: "index.ts", text: "export const register = () => {};\n" }, { name: "water.frag", text: "void main() {}\n" }];
    const zip = zipFiles(downloadFiles("aquarium", files, "export interface PluginApi {}\n"));
    const entries = await unzipTexts(zip);
    expect(entries.map(e => e.name)).toEqual(["aquarium/index.ts", "aquarium/water.frag", "aquarium/plugin-api.d.ts", "aquarium/shader-files.d.ts", "aquarium/tsconfig.json"]);
    expect(pluginFromZip(entries, "aquarium.zip", DOWNLOAD_EXTRAS)).toEqual({ id: "aquarium", files });
  });

  it("a zip without a folder takes its name; without index.ts it is no plugin", () => {
    expect(pluginFromZip([{ name: "index.ts", text: "x" }, { name: "notes.md", text: "y" }], "My Effect.zip", DOWNLOAD_EXTRAS)).toEqual({ id: "my-effect", files: [{ name: "index.ts", text: "x" }] });
    expect(() => pluginFromZip([{ name: "a.ts", text: "x" }], "a.zip", DOWNLOAD_EXTRAS)).toThrow("no index.ts");
  });

  it("sizes as the status line says them", () => {
    expect(sizeText(812)).toBe("812 B");
    expect(sizeText(31 * 1024)).toBe("31 KB");
    expect(sizeText(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});
