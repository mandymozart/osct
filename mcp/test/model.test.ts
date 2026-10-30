import { describe, expect, it } from "vitest";
import { ENTITY_TYPES, PLUGIN_API_VERSION } from "../../shared/types/game-config";
import { checkEntity, describeContentModel, knownPluginTypes, pluginTypes, unknownComponentTypes, usesPluginTypes, type BookModel } from "../src/model.ts";
import { RULES } from "../src/resources.ts";
import { VIDEO_ENTITY } from "./helpers.ts";

describe("checkEntity – the shared guard over one entity", () => {
  it("passes a valid node tree", () => {
    expect(checkEntity(VIDEO_ENTITY)).toEqual({ problems: [], unknownComponents: [], unverifiedNodeTypes: [] });
    const tree = { type: "group", assets: [], children: [VIDEO_ENTITY, { type: "text", assets: [], text: "{{entry.title}}", color: "#f3cc94", params: { position: [0, -0.5, 0.01] } }] };
    expect(checkEntity(tree).problems).toEqual([]);
  });

  it("names every problem with its path inside the entity", () => {
    const { problems } = checkEntity({ type: "hologram", assets: [{ id: "a", assetType: "glb" }], params: { scale: -1 }, children: [{ type: "text", assets: [], color: "gold" }] });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^entity\.type: "hologram"/),
        expect.stringMatching(/^entity\.assets\[0\]\.src/),
        expect.stringMatching(/^entity\.params\.scale/),
        expect.stringMatching(/^entity\.children\[0\]\.color/),
      ]),
    );
    expect(problems.some(p => p.startsWith("entities."))).toBe(false);
    expect(checkEntity({ type: "group", assets: [], children: [{ type: "hologram", assets: [] }] }, "target.entity").problems).toEqual([expect.stringMatching(/^target\.entity\.children\[0\]\.type: "hologram"/)]);
  });

  it("refuses filters on a model, a wrong component parameter and a tree deeper than 8 levels", () => {
    expect(checkEntity({ type: "model", assets: [], filters: [{ type: "chromaKey" }] }).problems[0]).toMatch(/filters only work on video/);
    expect(checkEntity({ type: "model", assets: [], components: [{ type: "animation", speed: 99 }] }).problems[0]).toMatch(/speed: expected a number from 0.1 to 4/);
    let deep: Record<string, unknown> = { type: "group", assets: [] };
    for (let i = 0; i < 9; i++) deep = { type: "group", assets: [], children: [deep] };
    expect(checkEntity(deep).problems.some(p => p.includes("nested deeper than 8"))).toBe(true);
  });

  it("lets a plugin's component type through and lists it", () => {
    const entity = { type: "video", assets: [], components: [{ type: "tint", opacity: 0.4 }], children: [{ type: "model", assets: [], components: [{ type: "spin" }, { type: "animation" }] }] };
    expect(checkEntity(entity)).toEqual({ problems: [], unknownComponents: ["tint", "spin"], unverifiedNodeTypes: [] });
    expect(unknownComponentTypes({ type: "video", assets: [], components: [{ type: "Not A Type" }] })).toEqual([]);
    expect(checkEntity({ type: "video", assets: [], components: [{ type: "Not A Type" }] }).problems[0]).toMatch(/components\[0\]\.type/);
  });

  it("is not an object → one problem", () => {
    expect(checkEntity("video").problems).toEqual(["entity: expected an object"]);
    expect(checkEntity("video", "target.entity").problems).toEqual(["target.entity: expected an object"]);
  });
});

describe("pluginTypes – what a source registers, read from its text", () => {
  it("finds registerComponent, registerLayer, registerNodeType and registerPass calls with any quote", () => {
    const source = `export const register = (api) => {\n  api.registerLayer("tint", SPEC, { glsl });\n  api.registerComponent('spin', SPEC2, apply);\n  api.registerComponent(\`spin\`, SPEC2, apply);\n  api.registerNodeType( "sparkle", SPEC3, build);\n  api.registerPass('scan', SPEC4, factory);\n};`;
    expect(pluginTypes(source)).toEqual({ components: ["spin"], layers: ["tint"], nodeTypes: ["sparkle"], passes: ["scan"] });
    expect(pluginTypes("nothing here")).toEqual({ components: [], layers: [], nodeTypes: [], passes: [] });
  });
});

describe("checkEntity with a book – its plugins' types (#90)", () => {
  const recorded = {
    id: "fx", src: "/assets/content/plugins/fx/plugin.js", api: "1.2",
    registered: {
      components: { tint: { description: "Tints.", nodeTypes: ["video"], params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." } } } },
      nodeTypes: { sparkle: { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } } },
    },
  } as const;
  const book = (sources: BookModel["sources"] = [], declared: BookModel["declared"] = [recorded]): BookModel => ({ declared, sources });

  it("knows what the declared plugins recorded and what the sources register; complete only without sources and with every plugin recorded", () => {
    expect(knownPluginTypes(book())).toEqual({ components: ["tint"], nodeTypes: ["sparkle"], complete: true });
    expect(knownPluginTypes(book([{ id: "glow", components: [], layers: ["glow"], nodeTypes: ["beam"], passes: [] }]))).toEqual({ components: ["tint", "glow"], nodeTypes: ["sparkle", "beam"], complete: false });
    expect(knownPluginTypes(book([], [recorded, { id: "old", src: "/o.js", api: "1.0" }])).complete).toBe(false);
  });

  it("checks a recorded component's and node type's parameters like a built-in one's", () => {
    expect(checkEntity({ type: "video", assets: [], components: [{ type: "tint", opacity: 0.5 }] }, "entity", book())).toEqual({ problems: [], unknownComponents: [], unverifiedNodeTypes: [] });
    expect(checkEntity({ type: "video", assets: [], components: [{ type: "tint", opacity: 2, glow: 1 }] }, "entity", book()).problems).toEqual([
      expect.stringMatching(/^entity\.components\[0\]\.opacity: expected a number from 0 to 1/),
      expect.stringMatching(/^entity\.components\[0\]\.glow: unknown parameter of tint/),
    ]);
    expect(checkEntity({ type: "model", assets: [], components: [{ type: "tint" }] }, "entity", book()).problems[0]).toMatch(/tint applies to video nodes, not to a model/);
    expect(checkEntity({ type: "sparkle", assets: [], params: { count: 0 } }, "entity", book()).problems).toEqual([expect.stringMatching(/^entity\.params\.count: expected a number from 1 to 500/)]);
  });

  it("refuses a node type no plugin registers when every plugin is known, lets it pass as unverified otherwise", () => {
    expect(checkEntity({ type: "group", assets: [], children: [{ type: "sparkel", assets: [] }] }, "entity", book()).problems).toEqual([
      expect.stringMatching(/^entity\.children\[0\]\.type: "sparkel" is not .*sparkle/),
    ]);
    const withSource = checkEntity({ type: "sparkel", assets: [] }, "entity", book([{ id: "glow", components: [], layers: [], nodeTypes: ["beam"], passes: [] }]));
    expect(withSource).toEqual({ problems: [], unknownComponents: [], unverifiedNodeTypes: ["sparkel"] });
    expect(checkEntity({ type: "beam", assets: [] }, "entity", book([{ id: "glow", components: [], layers: [], nodeTypes: ["beam"], passes: [] }])).unverifiedNodeTypes).toEqual([]);
    // Named unlike a plugin's: refused once, whatever the book has
    const dashed = checkEntity({ type: "holo-gram", assets: [] }, "entity", book());
    expect(dashed.problems).toHaveLength(1);
  });

  it("only a tree with a type outside the built-in ones needs the book", () => {
    expect(usesPluginTypes(VIDEO_ENTITY)).toBe(false);
    expect(usesPluginTypes({ type: "group", assets: [], children: [{ type: "model", assets: [], components: [{ type: "animation" }] }] })).toBe(false);
    expect(usesPluginTypes({ type: "group", assets: [], children: [{ type: "sparkle", assets: [] }] })).toBe(true);
    expect(usesPluginTypes({ type: "video", assets: [], components: [{ type: "tint" }] })).toBe(true);
  });
});

describe("describeContentModel – the contract as an agent reads it", () => {
  it("lists the contract's enums, specs and versions", () => {
    const model = describeContentModel() as any;
    expect(model.contentSchema).toMatch(/^\d+\.\d+$/);
    expect(model.pluginApi).toBe(PLUGIN_API_VERSION);
    expect(model.entity.nodeTypes).toEqual([...ENTITY_TYPES]);
    expect(model.entity.nodeTypes).toEqual(expect.arrayContaining(["group", "model", "video", "image", "text"]));
    expect(Object.keys(model.filters.types)).toEqual(["chromaKey"]);
    expect(Object.keys(model.components.builtIn)).toEqual(["animation"]);
    expect(model.placement.params.position.unit).toBe("target widths");
    expect(model.target.print.surfaces).toEqual(["left", "right", "front", "back"]);
    expect(model.entry.categories).toEqual(["glossary", "video", "text", "link"]);
    expect(model.components.declaredPlugins).toBeUndefined();
    expect(Object.keys(model.passes.builtIn)).toEqual(["bloom", "vignette", "grade"]);
    expect(model.environment.worlds).toEqual(["cafe"]);
    expect(model.environment.default).toEqual({ world: "cafe", onionSky: true });
    expect(model.entity.name).toMatch(/editor's tree shows/);
    expect(model.spread.description).toMatch(/add_spread/);
  });

  it("adds a book's declared plugins with what they recorded, and the Code tab sources", () => {
    const model = describeContentModel({
      declared: [
        { id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.2", registered: { passes: { scan: { description: "Scan lines.", params: {} } } } },
        { id: "old", src: "/assets/content/plugins/old/plugin.js", api: "1.0" },
      ],
      sources: [{ id: "glow", components: [], layers: ["glow"], nodeTypes: [], passes: [] }],
    }) as any;
    expect(model.components.declaredPlugins).toEqual([
      { id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.2", recorded: true },
      { id: "old", src: "/assets/content/plugins/old/plugin.js", api: "1.0", recorded: false },
    ]);
    expect(model.passes.plugins.scan).toEqual({ plugin: "tint", description: "Scan lines.", params: {} });
    expect(model.components.codeTabSources[0].layers).toEqual(["glow"]);
  });

  it("is the content-model resource; the plugin guide comes from docs/plugins.md", () => {
    const rule = RULES.find(r => r.uri === "osct://rules/content-model")!;
    expect(JSON.parse(rule.text()).entity.nodeTypes).toContain("video");
    const guide = RULES.find(r => r.uri === "osct://guides/plugins")!;
    expect(guide.text()).toContain("registerLayer");
  });
});
