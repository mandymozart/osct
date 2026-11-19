import { describe, expect, it, vi } from "vitest";
import {
  assertGameConfiguration,
  GameConfigurationError,
  isEntityRef,
  isEntityType,
  isEntryCategory,
} from "@shared/guards/game-config";

const valid = () => ({
  version: { version: "1.0.0", timestamp: "2026-09-24T00:00:00.000Z", hash: "abc", schema: "4.0" },
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
