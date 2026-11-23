import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TYPES, appearanceProblems, APPEARANCES, DEFAULT_APPEARANCE_TYPE, momentAppearance, momentDuration, MOMENTS, resolveAppearance,
} from "@shared/types/appearance";
import { pluginProblems, recordedRegistrations } from "@shared/types/plugins";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";
import { currentFeatures, skipUnknownFeatures } from "../forward-compatible";

const SOFT_FADE = { description: "Fades.", params: { duration: { kind: "number", default: 300, min: 50, max: 5000, step: 10, description: "ms" } } } as const;

describe("the experience's appearance: a look per moment (content schema 2.29)", () => {
  it("has three moments and the built-in looks, each with the same parameters and its own defaults", () => {
    expect(MOMENTS).toEqual(["reveal", "found", "lost"]);
    expect(APPEARANCE_TYPES).toEqual(["inflateDissolve", "printLift", "fade"]);
    const names = Object.keys(APPEARANCES.fade.params);
    APPEARANCE_TYPES.forEach(type => expect(Object.keys(APPEARANCES[type].params)).toEqual(names));
    expect(resolveAppearance(APPEARANCES.fade, { type: "fade" })).toMatchObject({ duration: 600, outDuration: 400, fade: 1, mask: "none", heightFrom: 1 });
    expect(resolveAppearance(APPEARANCES.printLift, { type: "printLift", duration: 900 })).toMatchObject({ duration: 900, heightFrom: 0, tint: 0.85, shapeEase: "inOut" });
    expect(resolveAppearance(APPEARANCES.inflateDissolve, { type: "inflateDissolve" })).toMatchObject({ duration: 3470, mask: "noise", spin: -0.5, sparks: 300 });
  });

  it("accepts a look per moment and reports unknown moments, types, parameters and values out of range", () => {
    expect(appearanceProblems({ reveal: { type: "inflateDissolve" }, found: { type: "printLift", duration: 900 }, lost: { type: "fade" } }, "appearance")).toEqual([]);
    expect(appearanceProblems({}, "appearance")).toEqual([]);
    expect(appearanceProblems([], "appearance")).toEqual(["appearance: expected { reveal?, found?, lost?, card? }, each { type, ...parameters }"]);
    expect(appearanceProblems({ unlock: { type: "fade" } }, "appearance")).toEqual(["appearance.unlock: not a moment (reveal, found, lost) or card"]);
    expect(appearanceProblems({ found: "fade" }, "appearance")).toEqual(["appearance.found: expected { type, ...parameters }"]);
    expect(appearanceProblems({ found: { type: "swirl" } }, "appearance")).toEqual(['appearance.found.type: "swirl" is not one of inflateDissolve, printLift, fade']);
    expect(appearanceProblems({ found: { type: "fade", duration: 5, mask: "rise", later: 1 } }, "appearance")).toEqual([
      "appearance.found.duration: expected a number from 50 to 10000, got 5",
      'appearance.found.mask: expected one of none, noise, got "rise"',
      expect.stringContaining("appearance.found.later: unknown parameter of fade"),
    ]);
  });

  it("the guard leaves what a newer MINOR adds to the newer app; the build refuses it", () => {
    const later = { found: { type: "fade", later: 1 }, hover: { type: "fade" } };
    expect(appearanceProblems(later, "appearance", { unknown: "ignore" })).toEqual([]);
    expect(appearanceProblems(later, "appearance")).toHaveLength(2);
  });

  it("a plugin's look is checked against its recorded spec; one nobody recorded is refused unless a plugin is unknown", () => {
    const recorded = recordedRegistrations([{ id: "fx", src: "/p.js", api: "1.8", registered: { appearances: { softFade: SOFT_FADE } } }]);
    const options = { spec: (type: string) => recorded.appearances.get(type), pluginTypes: [...recorded.appearances.keys()] };
    expect(appearanceProblems({ lost: { type: "softFade", duration: 400 } }, "appearance", options)).toEqual([]);
    expect(appearanceProblems({ lost: { type: "softFade", duration: 9000 } }, "appearance", options)).toEqual(["appearance.lost.duration: expected a number from 50 to 5000, got 9000"]);
    expect(appearanceProblems({ lost: { type: "swirl" } }, "appearance", options))
      .toEqual(['appearance.lost.type: "swirl" is not one of inflateDissolve, printLift, fade or a look of the experience\'s plugins (softFade)']);
    expect(appearanceProblems({ lost: { type: "swirl" } }, "appearance", { unknownTypes: "allow" })).toEqual([]);
    // A plugin may not take a built-in look's name
    expect(pluginProblems([{ id: "fx", src: "/p.js", api: "1.8", registered: { appearances: { fade: SOFT_FADE } } }]))
      .toEqual(['plugins[0].registered.appearances: "fade" is a built-in look']);
  });

  it("a moment without a look takes found's, then the default; lost counts its look's time to disappear", () => {
    expect(momentAppearance(undefined, "reveal")).toEqual({ type: DEFAULT_APPEARANCE_TYPE });
    const book = { appearance: { found: { type: "printLift" }, lost: { type: "fade", outDuration: 250 } } };
    expect(momentAppearance(book, "reveal")).toEqual({ type: "printLift" });
    expect(momentAppearance(book, "lost")).toEqual({ type: "fade", outDuration: 250 });
    expect(momentAppearance({ appearance: { reveal: { type: "fade" } } }, "found")).toEqual({ type: DEFAULT_APPEARANCE_TYPE });
    expect(momentDuration(book, "reveal")).toBe(1100);
    expect(momentDuration(book, "lost")).toBe(250);
    expect(momentDuration(undefined, "lost")).toBe(600);
    expect(momentDuration({ appearance: { reveal: { type: "softFade" } } }, "reveal")).toBeUndefined(); // only the plugin's code knows
  });

  it("content of a newer MINOR: a look or a moment this app does not know is skipped, a known look loses unknown parameters", () => {
    const [major, minor] = CONTENT_SCHEMA_VERSION.split(".").map(Number);
    const raw = {
      version: { version: "9.0.0", timestamp: "2027-01-01T00:00:00.000Z", hash: "abc", schema: `${major}.${minor + 1}` },
      experience: { id: "b", title: "B", book: { author: "A" }, appearance: { reveal: { type: "hologram" }, found: { type: "fade", later: 1 }, hover: { type: "fade" } } },
      plugins: [],
    };
    const { config, skipped } = skipUnknownFeatures(raw, currentFeatures());
    expect((config as typeof raw).experience.appearance).toEqual({ found: { type: "fade" } });
    expect(skipped.map(({ path, kind }) => `${path}: ${kind}`).sort()).toEqual([
      "experience.appearance.found.later: parameter", "experience.appearance.hover: field", "experience.appearance.reveal: look",
    ]);
  });
});
