import { describe, expect, it } from "vitest";
import type { PluginSummary } from "../api";
import { codeFiles, pluginLabel, pluginOptions, unsavedPlugin } from "../library-code";
import { CodeBuffer } from "../plugins.svelte";
import { hasUnsaved } from "../unsaved";

/**
 * The plugin lists mark only what matters (#232): an unchanged plugin is its name alone – stored or only in the content,
 * published or not –, one with unsaved edits its name and an asterisk.
 */

const summary = (id: string): PluginSummary => ({ id, size: 100, usages: 0, updatedAt: "2026-10-31T08:00:00.000Z", updatedBy: "author@example.com" });

describe("a plugin's label", () => {
  it("is the name alone, an asterisk after it with unsaved edits", () => {
    expect(pluginLabel("aquarium", false)).toBe("aquarium");
    expect(pluginLabel("aquarium", true)).toBe("aquarium*");
  });

  it("the Code tab's picker: every plugin by its name, the open one with unsaved edits marked", () => {
    const ids = ["aquarium", "narrative", "grain"];
    expect(pluginOptions(ids, { open: "narrative", adding: false, unsaved: false }).map(o => o.label)).toEqual(["aquarium", "narrative", "grain"]);
    expect(pluginOptions(ids, { open: "narrative", adding: false, unsaved: true })).toEqual([
      { value: "aquarium", label: "aquarium" },
      { value: "narrative", label: "narrative*" },
      { value: "grain", label: "grain" },
    ]);
    // A new plugin comes first, marked once it is edited; the plugin open before it is not marked
    expect(pluginOptions(ids, { open: null, adding: true, unsaved: false })[0]).toEqual({ value: "", label: "new plugin" });
    expect(pluginOptions(ids, { open: "narrative", adding: true, unsaved: true }).map(o => o.label)).toEqual(["new plugin*", "aquarium", "narrative", "grain"]);
    expect(unsavedPlugin({ open: "narrative", adding: true, unsaved: true })).toBeNull();
  });

  it("the Library's code list marks the script the Code tab holds unsaved edits of, its name stays the file's", () => {
    const files = codeFiles([summary("aquarium"), summary("grain")], [], "grain");
    expect(files.map(f => [f.name, f.label])).toEqual([["aquarium.ts", "aquarium.ts"], ["grain.ts", "grain.ts*"]]);
    expect(codeFiles([summary("grain")], []).map(f => f.label)).toEqual(["grain.ts"]);
  });
});

describe("the Code tab's open source (plugins.code)", () => {
  it("is unsaved only once its text differs from the text loaded or saved – a declared plugin opened is not", () => {
    const code = new CodeBuffer();
    expect(code.unsaved).toBe(false);
    // A plugin only the content declares: nothing stored (Save would store a copy), but nothing edited either
    code.open = "aquarium";
    code.source = "export const register = () => {};";
    code.loaded = code.source;
    code.saved = "";
    expect(code.unsaved).toBe(false);
    expect(code.unsavedId).toBeNull();
    code.source += "\n// tuned";
    expect(code.unsaved).toBe(true);
    expect(code.unsavedId).toBe("aquarium");
    code.reset();
    expect([code.open, code.source, code.unsaved]).toEqual([null, "", false]);
  });

  it("tells the reload guard about edits while the tab is closed", async () => {
    const { plugins } = await import("../plugins.svelte");
    expect(hasUnsaved()).toBe(false);
    plugins.code.open = "grain";
    plugins.code.source = "edited";
    expect(hasUnsaved()).toBe(true);
    plugins.code.reset();
    expect(hasUnsaved()).toBe(false);
  });
});
