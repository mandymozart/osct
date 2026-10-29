import { describe, expect, it } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import { componentSpecProblems, pluginApiCompatible, pluginProblems } from "@shared/types/game-config";

/** Content schema 2.3: the configuration declares the book's plugins; their components pass the guard */

const config = (extra: Record<string, unknown>, components?: unknown[]) => ({
  version: { version: "1.11.0", timestamp: "2026-01-01T00:00:00.000Z", schema: "2.3" },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
  entries: [{ id: "e1", category: "video", title: "E", page: 1, body: "", tags: [], target: {
    id: "e1", imageSrc: "/assets/content/entries/e1/t.jpg",
    entity: { type: "video", assets: [{ id: "v", assetType: "video", src: "/assets/content/entries/e1/v.mp4" }], ...(components ? { components } : {}) },
  } }],
  entities: {},
  tutorial: [],
  ...extra,
});

const problemsOf = (raw: unknown): string[] => {
  try {
    assertGameConfiguration(raw);
    return [];
  } catch (error) {
    if (error instanceof GameConfigurationError) return error.problems;
    throw error;
  }
};

describe("plugins in the configuration", () => {
  it("accepts a declared plugin and lets its component types through – the plugin registers them at load", () => {
    const plugins = [{ id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.0" }];
    expect(problemsOf(config({ plugins }, [{ type: "tint", opacity: 0.4 }]))).toEqual([]);
    expect(problemsOf(config({}, [{ type: "tint", opacity: 0.4 }]))).toEqual(['entries[0].target.entity.components[0].type: "tint" is not one of animation']);
    expect(problemsOf(config({ plugins }, [{ type: "animation" }]))).toEqual(["entries[0].target.entity.components[0]: animation applies to model nodes, not to a video"]);
  });

  it("checks the plugin list itself", () => {
    expect(pluginProblems([{ id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.0" }])).toEqual([]);
    expect(pluginProblems([{ id: "Tint", src: "x.ts", api: "1" }, { id: "a", src: "/a.js", api: "1.0" }, { id: "a", src: "/b.js", api: "1.0" }, 3])).toEqual([
      "plugins[0].id: expected a plugin id (letters, digits, -)",
      "plugins[0].src: expected the compiled module (…/plugin.js)",
      'plugins[0].api: expected the plugin API version "MAJOR.MINOR"',
      'plugins[2].id: duplicate plugin id "a"',
      "plugins[3]: expected { id, src, api }",
    ]);
    expect(problemsOf(config({ plugins: "no" }))).toEqual(["plugins: expected a list of plugins"]);
  });

  it("the plugin API is compatible within a MAJOR", () => {
    expect(pluginApiCompatible("1.0")).toBe(true);
    expect(pluginApiCompatible("1.4")).toBe(true);
    expect(pluginApiCompatible("2.0")).toBe(false);
  });

  it("checks a spec a plugin registers", () => {
    expect(componentSpecProblems("tint", { description: "d", nodeTypes: ["video"], params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "d" } } })).toEqual([]);
    expect(componentSpecProblems("Tint", null)).toEqual([
      '"Tint" is not a component type (camelCase letters and digits, e.g. tint)',
      "Tint: the spec must be an object with description and params",
    ]);
    expect(componentSpecProblems("tint", { description: 1, params: { Bad: { kind: "colour", default: 1 }, c: { kind: "choice", options: ["a"], default: "b", description: "" } } })).toEqual([
      "tint: description must be a string",
      "tint.Bad: a parameter name is camelCase letters and digits",
      "tint.Bad: description must be a string",
      "tint.Bad: kind must be color, number, choice, boolean or string",
      "tint.c: a choice needs options (strings) and a default among them",
    ]);
  });
});
