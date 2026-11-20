import { describe, expect, it, vi } from "vitest";
import {
  assertGameConfiguration,
  GameConfigurationError,
  isEntityRef,
  isEntityType,
  isEntryCategory,
} from "@shared/guards/game-config";

const valid = () => ({
  version: { version: "1.0.0", timestamp: "2026-09-24T00:00:00.000Z", hash: "abc", schema: "5.0" },
  experience: { id: "osct", title: "Onion Skin & Crocodile Tears", book: { author: "Kévin Bray" } },
  initialScene: "scene1",
  scenes: [{ id: "scene1", label: "The Beginning", surfaces: [{ id: 'surface', widthMm: 460, heightMm: 320, place: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } }] }],
  entities: {
    castle: { type: "model", assets: [{ id: "castle", assetType: "glb", src: "/castle.glb" }] },
  },
  entries: [
    {
      id: "racoon", category: "glossary", title: "Racoon", scene: "scene1", body: "…", tags: [],
      target: { id: "racoon", imageSrc: "/r.jpg", entity: { ref: "castle" } },
    },
    {
      id: "video", category: "video", title: "Video", scene: "scene1", body: "", tags: ["demo"],
      target: {
        id: "video", imageSrc: "/v.jpg",
        entity: { type: "video", assets: [{ id: "video", assetType: "video", src: "/v.mp4" }] },
      },
    },
    { id: "essay", category: "text", title: "Essay", scene: "scene1", body: "…", author: "A. Author", tags: [] },
  ],
});

const problemsOf = (config: unknown): string[] => {
  try {
    assertGameConfiguration(config);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(GameConfigurationError);
    return (error as GameConfigurationError).problems;
  }
};

describe("game configuration guards", () => {
  it("narrow literal unions", () => {
    expect(isEntryCategory("glossary")).toBe(true);
    expect(isEntryCategory("poems")).toBe(false);
    expect(isEntityType("video")).toBe(true);
    expect(isEntityType(42)).toBe(false);
    expect(isEntityRef({ ref: "castle" })).toBe(true);
    expect(isEntityRef({ type: "video", assets: [] })).toBe(false);
  });

  it("accept a valid configuration", () => {
    expect(problemsOf(valid())).toEqual([]);
  });

  it("check a scene's and the experience's logic, where a goto goes and which targets their rules name (schema 5.0)", () => {
    const config = valid() as any;
    config.scenes.push({ ...config.scenes[0], id: "scene2", label: "Two" });
    config.entries.push({ id: "far", category: "glossary", title: "Far", scene: "scene2", body: "", tags: [], target: { id: "far", imageSrc: "/f.jpg", entity: { ref: "castle" } } });
    config.experience.logic = { rules: [{ on: "chapterDone", do: [{ goto: "scene:scene2" }, { show: "target:far" }] }] };
    config.scenes[0].logic = { rules: [{ on: "ping", when: "a && b > 1", do: { hide: "target:racoon/flag" } }], canvas: { folds: ["x"] } };
    config.entities.castle.components = [{ type: "behaviour", rules: [{ on: "tap", do: { goto: "scene:scene1" } }] }];
    expect(problemsOf(config)).toEqual([]);

    config.experience.logic.rules[0].do[0].goto = "scene:nowhere";
    config.experience.logic.rules[0].do[1].show = "target:ghost";
    config.scenes[0].logic.rules[0].do.hide = "target:far/flag";
    config.scenes[0].logic.rules.push({ on: "found", when: { hasKey: true }, do: "show" });
    config.entities.castle.components[0].rules[0].do.goto = "scene:gone";
    expect(problemsOf(config)).toEqual([
      "scenes[0].logic.rules[1].on: found is a node's own event – a scene's rule hears an event of the bus – a scene event's name (camelCase) or a core event (targetFound, targetLost, targetUnlocked, targetTapped, sceneChanged, arState, varChanged)",
      'scenes[0].logic.rules[1].when: a condition is an expression since content schema 5.0 (hasKey && tries > 2) – the object form {"hasKey":true} is gone',
      "scenes[0].logic.rules[1].do: show alone acts on the rule's own node – a scene's rule has none: { show: target:<targetId>/<node name> }",
      'experience.logic.rules[0].do[0].goto: unknown scene "nowhere"',
      'entities.castle.components[0].rules[0].do[0].goto: unknown scene "gone"',
      'experience.logic.rules[0].do[1]: unknown target "ghost"',
      'scenes[0].logic.rules[0].do[0]: target "far" lies in scene "scene2" – a scene\'s rules act on its own targets',
    ]);
  });

  it("report every problem with its path", () => {
    const config = valid() as any;
    config.entries[0].category = "poems";
    config.entries[1].target.entity.type = 42;
    config.entries[1].target.entity.assets[0].assetType = "pdf";
    delete config.scenes[0].label;

    expect(problemsOf(config)).toEqual([
      'scenes[0].label: expected a non-empty string',
      'entries[0].category: "poems" is not one of glossary, video, text, link',
      'entries[1].target.entity.type: expected a node type (group, model, video, image, text, light)',
      'entries[1].target.entity.assets[0].assetType: "pdf" is not one of glb, gltf, video, image, audio',
    ]);
  });

  it("lets a node type of a later schema pass (the engine renders nothing for it, keeps its children)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = valid() as any;
    config.entries[1].target.entity.type = "hologram";
    expect(problemsOf(config)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"hologram" is not a node type this app knows'));
    warn.mockRestore();
  });

  it("check a light node's values against their definitions", () => {
    const config = valid() as any;
    config.entries[1].target.entity = { type: "light", assets: [], light: { kind: "spot", color: "#ff8800", angle: 25 } };
    expect(problemsOf(config)).toEqual([]);
    config.entries[1].target.entity.light = { kind: "laser", intensity: -1, size: 3 };
    config.entities.castle.light = { kind: "point" };
    expect(problemsOf(config)).toEqual([
      'entities.castle.light: only light nodes have a light',
      'entries[1].target.entity.light.kind: expected one of point, spot, directional, got "laser"',
      'entries[1].target.entity.light.intensity: expected a number from 0 to 10, got -1',
      'entries[1].target.entity.light.size: unknown light parameter (kind, color, intensity, distance, decay, angle, penumbra)',
    ]);
  });

  it("check references and duplicates", () => {
    const config = valid() as any;
    config.entries[0].target.entity = { ref: "missing" };
    config.entries[2].id = "racoon";
    config.entries[1].target.id = "racoon";
    config.initialScene = "scene9";
    config.entries[2].scene = "scene7";

    expect(problemsOf(config)).toEqual([
      'config.initialScene: unknown scene "scene9"',
      'entries[0].target.entity.ref: unknown entity "missing"',
      'entries[1].target.id: duplicate target id "racoon"',
      'entries[2].scene: unknown scene "scene7"',
      'entries[2].id: duplicate entry id "racoon"',
    ]);
  });

  it("a configuration with the 2.x onboarding or pages carries fields 3.0 does not read: the 2.x page model is refused", () => {
    const config = valid() as any;
    config.tutorial = [{ id: "splash", index: 0 }];
    expect(problemsOf(config)).toEqual([]);
    config.entries[0].page = 1;
    delete config.entries[0].scene;
    expect(problemsOf(config)).toEqual(["entries[0].scene: expected a scene id"]);
  });

  it("reject non-objects", () => {
    expect(problemsOf(null)).toEqual(["config: expected an object"]);
    expect(problemsOf("{}")).toEqual(["config: expected an object"]);
  });
});
