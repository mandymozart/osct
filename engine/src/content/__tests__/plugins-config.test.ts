import { describe, expect, it } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import { componentSpecProblems, PARAM_LABEL_MAX, paramLabel, paramWords, pluginApiCompatible, pluginProblems } from "@shared/types/game-config";

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

  describe("what the plugins recorded (schema 2.14, #90)", () => {
    const TINT = { description: "Tints.", nodeTypes: ["video"], params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." } } };
    const SPARKLE = { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } };
    const recorded = { id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.2", registered: { components: { tint: TINT }, nodeTypes: { sparkle: SPARKLE }, passes: {} } };
    const at2_14 = (extra: Record<string, unknown>, components?: unknown[]) => {
      const c = config(extra, components);
      return { ...c, version: { ...c.version, schema: "2.14" } };
    };
    const withNode = (node: Record<string, unknown>, plugins: unknown[], schema = "2.14") => ({ ...at2_14({ plugins }), version: { version: "x", timestamp: "t", schema }, entities: { fx: { assets: [], ...node } } });

    it("checks a plugin component's parameters like a built-in one's, and refuses a type no declared plugin registers", () => {
      expect(problemsOf(at2_14({ plugins: [recorded] }, [{ type: "tint", opacity: 0.4 }]))).toEqual([]);
      expect(problemsOf(at2_14({ plugins: [recorded] }, [{ type: "tint", opacity: 4, glow: true }]))).toEqual([
        "entries[0].target.entity.components[0].opacity: expected a number from 0 to 1, got 4",
        "entries[0].target.entity.components[0].glow: unknown parameter of tint (opacity)",
      ]);
      expect(problemsOf(at2_14({ plugins: [recorded] }, [{ type: "tnit" }]))).toEqual(['entries[0].target.entity.components[0].type: "tnit" is not one of animation, tint']);
    });

    it("checks a plugin node type's parameters, refuses a node type no declared plugin registers – unless the content is newer", () => {
      expect(problemsOf(withNode({ type: "sparkle", params: { count: 120 } }, [recorded]))).toEqual([]);
      expect(problemsOf(withNode({ type: "sparkle", params: { count: 0 } }, [recorded]))).toEqual(["entities.fx.params.count: expected a number from 1 to 500, got 0"]);
      expect(problemsOf(withNode({ type: "sparkel" }, [recorded]))).toEqual([
        'entities.fx.type: "sparkel" is not a node type – neither built in (group, model, video, image, text, light) nor registered by a plugin of the book (sparkle)',
      ]);
      // A later MINOR may add a built-in node type this app does not know: it renders nothing, the content loads
      expect(problemsOf(withNode({ type: "hologram" }, [recorded], "2.99"))).toEqual([]);
    });

    it("lets an unknown type pass while a declared plugin recorded nothing (an older build) – what the others recorded is still checked", () => {
      const older = { id: "old", src: "/assets/content/plugins/old/plugin.js", api: "1.0" };
      expect(problemsOf(at2_14({ plugins: [recorded, older] }, [{ type: "tnit" }]))).toEqual([]);
      expect(problemsOf(withNode({ type: "sparkel" }, [recorded, older]))).toEqual([]);
      expect(problemsOf(withNode({ type: "sparkle", params: { count: 0 } }, [recorded, older]))).toEqual(["entities.fx.params.count: expected a number from 1 to 500, got 0"]);
    });

    it("checks the recorded specs themselves", () => {
      expect(pluginProblems([recorded])).toEqual([]);
      expect(pluginProblems([{ ...recorded, registered: { components: { tint: { ...TINT, params: { opacity: { kind: "number", default: 2, min: 0, max: 1, description: "x" } } } }, nodeTypes: [], passes: { scan: { params: {} } } } }])).toEqual([
        "plugins[0].registered.components: tint.opacity: a number needs min ≤ default ≤ max",
        "plugins[0].registered.nodeTypes: expected an object of type → spec",
        "plugins[0].registered.passes: scan: description must be a string",
      ]);
      expect(pluginProblems([{ ...recorded, registered: "all" }])).toEqual(["plugins[0].registered: expected { components?, nodeTypes?, passes? }"]);
    });
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

  it("takes a parameter's optional label – a short text (schema 2.15, plugin API 1.3)", () => {
    const spec = (label: unknown) => ({ description: "d", params: { degreesPerSecond: { kind: "number", default: 30, min: -360, max: 360, label, description: "d" } } });
    expect(componentSpecProblems("spin", spec("speed"))).toEqual([]);
    expect(componentSpecProblems("spin", spec(undefined))).toEqual([]);
    for (const bad of [3, "", "  ", "a label far too long for the row"]) {
      expect(componentSpecProblems("spin", spec(bad))).toEqual([`spin.degreesPerSecond: label must be a short text (1–${PARAM_LABEL_MAX} characters)`]);
    }
  });

  it("names a parameter by its label, else by its name split into words", () => {
    expect(paramWords("degreesPerSecond")).toBe("degrees per second");
    expect(paramWords("playOn")).toBe("play on");
    expect(paramWords("uvScale2")).toBe("uv scale 2");
    expect(paramWords("HDRImage")).toBe("hdr image");
    expect(paramWords("opacity")).toBe("opacity");
    expect(paramLabel("degreesPerSecond", { label: "speed" })).toBe("speed");
    expect(paramLabel("degreesPerSecond", {})).toBe("degrees per second");
    expect(paramLabel("degreesPerSecond", { label: " " })).toBe("degrees per second");
  });
});
