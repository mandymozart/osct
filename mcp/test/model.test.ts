import { describe, expect, it } from "vitest";
import { ENTITY_TYPES } from "../../shared/types/game-config";
import { checkEntity, describeContentModel, pluginTypes, unknownComponentTypes } from "../src/model.ts";
import { RULES } from "../src/resources.ts";
import { VIDEO_ENTITY } from "./helpers.ts";

describe("checkEntity – the shared guard over one entity", () => {
  it("passes a valid node tree", () => {
    expect(checkEntity(VIDEO_ENTITY)).toEqual({ problems: [], unknownComponents: [] });
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
    expect(checkEntity(entity)).toEqual({ problems: [], unknownComponents: ["tint", "spin"] });
    expect(unknownComponentTypes({ type: "video", assets: [], components: [{ type: "Not A Type" }] })).toEqual([]);
    expect(checkEntity({ type: "video", assets: [], components: [{ type: "Not A Type" }] }).problems[0]).toMatch(/components\[0\]\.type/);
  });

  it("is not an object → one problem", () => {
    expect(checkEntity("video").problems).toEqual(["entity: expected an object"]);
    expect(checkEntity("video", "target.entity").problems).toEqual(["target.entity: expected an object"]);
  });
});

describe("pluginTypes – what a source registers, read from its text", () => {
  it("finds registerComponent and registerLayer calls with any quote", () => {
    const source = `export const register = (api) => {\n  api.registerLayer("tint", SPEC, { glsl });\n  api.registerComponent('spin', SPEC2, apply);\n  api.registerComponent(\`spin\`, SPEC2, apply);\n};`;
    expect(pluginTypes(source)).toEqual({ components: ["spin"], layers: ["tint"] });
    expect(pluginTypes("nothing here")).toEqual({ components: [], layers: [] });
  });
});

describe("describeContentModel – the contract as an agent reads it", () => {
  it("lists the contract's enums, specs and versions", () => {
    const model = describeContentModel() as any;
    expect(model.contentSchema).toMatch(/^\d+\.\d+$/);
    expect(model.pluginApi).toBe("1.0");
    expect(model.entity.nodeTypes).toEqual([...ENTITY_TYPES]);
    expect(model.entity.nodeTypes).toEqual(expect.arrayContaining(["group", "model", "video", "image", "text"]));
    expect(Object.keys(model.filters.types)).toEqual(["chromaKey"]);
    expect(Object.keys(model.components.builtIn)).toEqual(["animation"]);
    expect(model.placement.params.position.unit).toBe("target widths");
    expect(model.target.print.surfaces).toEqual(["left", "right", "front", "back"]);
    expect(model.entry.categories).toEqual(["glossary", "video", "text", "link"]);
    expect(model.components.declaredPlugins).toBeUndefined();
  });

  it("adds a book's declared plugins and Code tab sources", () => {
    const model = describeContentModel({ declared: [{ id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.0" }], sources: [{ id: "glow", components: [], layers: ["glow"] }] }) as any;
    expect(model.components.declaredPlugins[0].id).toBe("tint");
    expect(model.components.codeTabSources[0].layers).toEqual(["glow"]);
  });

  it("is the content-model resource; the plugin guide comes from docs/plugins.md", () => {
    const rule = RULES.find(r => r.uri === "osct://rules/content-model")!;
    expect(JSON.parse(rule.text()).entity.nodeTypes).toContain("video");
    const guide = RULES.find(r => r.uri === "osct://guides/plugins")!;
    expect(guide.text()).toContain("registerLayer");
  });
});
