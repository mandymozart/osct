import { describe, expect, it } from "vitest";
import {
  assertGameConfiguration,
  GameConfigurationError,
  isEntityRef,
  isEntityType,
  isEntryCategory,
} from "@shared/guards/game-config";

const valid = () => ({
  version: { version: "1.0.0", timestamp: "2026-09-24T00:00:00.000Z", hash: "abc" },
  book: { id: "osct", title: "Onion Skin & Crocodile Tears", author: "Kévin Bray" },
  maxTargetsPerSpread: 5,
  initialSpreadId: "spread1",
  spreads: [{ id: "spread1", title: "The Beginning", firstPage: 1, lastPage: 2, mindSrc: "/s1.mind" }],
  entities: {
    castle: { type: "model", assets: [{ id: "castle", assetType: "glb", src: "/castle.glb" }] },
  },
  entries: [
    {
      id: "racoon", category: "glossary", title: "Racoon", page: 1, body: "…", tags: [],
      target: { id: "racoon", index: 0, imageSrc: "/r.jpg", entity: { ref: "castle" } },
    },
    {
      id: "video", category: "videos", title: "Video", page: 2, body: "", tags: ["demo"],
      target: {
        id: "video", index: 1, imageSrc: "/v.jpg",
        entity: { type: "video", assets: [{ id: "video", assetType: "video", src: "/v.mp4" }] },
      },
    },
    { id: "essay", category: "texts", title: "Essay", page: 2, body: "…", author: "A. Author", tags: [] },
  ],
  tutorial: [{ id: "step-1", index: 0, title: "Hi", description: "…" }],
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
    config.entries[1].target.entity.type = "hologram";
    config.entries[1].target.entity.assets[0].assetType = "pdf";
    delete config.spreads[0].mindSrc;

    expect(problemsOf(config)).toEqual([
      'spreads[0].mindSrc: expected a non-empty string',
      'entries[0].category: "poems" is not one of glossary, videos, texts, links',
      'entries[1].target.entity.type: "hologram" is not one of model, video, image',
      'entries[1].target.entity.assets[0].assetType: "pdf" is not one of glb, gltf, video, image, audio',
    ]);
  });

  it("check references and duplicates", () => {
    const config = valid() as any;
    config.entries[0].target.entity = { ref: "missing" };
    config.entries[2].id = "racoon";
    config.entries[1].target.id = "racoon";
    config.initialSpreadId = "spread9";
    config.entries[2].page = 7;

    expect(problemsOf(config)).toEqual([
      'config.initialSpreadId: unknown spread "spread9"',
      'entries[0].target.entity.ref: unknown entity "missing"',
      'entries[1].target.id: duplicate target id "racoon"',
      'entries[2].page: page 7 is not part of any spread',
      'entries[2].id: duplicate entry id "racoon"',
    ]);
  });

  it("check onboarding steps: optional texts, known actions, numeric timings", () => {
    const config = valid() as any;
    config.tutorial = [
      { id: "splash", index: 0, advance: 2000 },
      { id: "camera", index: 1, description: "…", button: "Grant access", action: "camera" },
      { id: "broken", index: 2, button: "Go", action: "teleport", fadeIn: "slow" },
    ];

    expect(problemsOf(config)).toEqual([
      'tutorial[2].action: expected one of next, camera, scan',
      'tutorial[2].fadeIn: expected a number',
    ]);
  });

  it("reject non-objects", () => {
    expect(problemsOf(null)).toEqual(["config: expected an object"]);
    expect(problemsOf("{}")).toEqual(["config: expected an object"]);
  });
});
