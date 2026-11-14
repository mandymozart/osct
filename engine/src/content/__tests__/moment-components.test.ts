import { afterEach, describe, expect, it } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import { COMPONENT_TYPES, componentProblems, componentSpec } from "@shared/types/components";
import {
  type AppearanceSpec, entityMomentAppearance, momentComponentLook, momentComponentProblems, momentDuration, MOMENTS, registerAppearanceSpec,
  unregisterAppearanceSpec,
} from "@shared/types/appearance";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";
import { currentFeatures, skipUnknownFeatures } from "../forward-compatible";

/** An entity's own looks: the components reveal, found and lost on its root node (content schema 2.30) */

const SOFT_FADE: AppearanceSpec = { description: "Fades.", params: { duration: { kind: "number", default: 300, min: 50, max: 5000, step: 10, description: "ms" } } };

const config = (root: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  version: { version: "1.71.0", timestamp: "2026-11-15T00:00:00.000Z", schema: CONTENT_SCHEMA_VERSION },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
  entries: [{ id: "e1", category: "video", title: "E", page: 1, body: "", tags: [], target: {
    id: "e1", imageSrc: "/assets/content/entries/e1/t.jpg",
    entity: { type: "group", assets: [], ...root },
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

afterEach(() => unregisterAppearanceSpec("softFade"));

describe("the components reveal, found and lost (schema 2.30)", () => {
  it("are built-in components named as the moments, with a look and no other parameter of their own", () => {
    MOMENTS.forEach(moment => {
      expect(COMPONENT_TYPES).toContain(moment);
      expect(Object.keys(componentSpec(moment)!.params)).toEqual(["look"]);
      expect(componentSpec(moment)!.params.look).toMatchObject({ kind: "string", default: "" });
    });
  });

  it("their parameters are the look's, checked against its spec", () => {
    const problems = (components: unknown[]) => componentProblems(components, "components", "group");
    expect(problems([{ type: "reveal" }, { type: "found", look: "" }, { type: "lost", look: "fade", outDuration: 250 }])).toEqual([]);
    expect(problems([{ type: "reveal", look: "printLift", duration: 900, tint: 0.5 }])).toEqual([]);
    expect(problems([{ type: "reveal", look: "swirl" }])).toEqual(['components[0].look: "swirl" is not one of inflateDissolve, printLift, fade']);
    expect(problems([{ type: "found", look: 3 }])).toEqual(['components[0].look: expected a look (inflateDissolve, printLift, fade) or "" for the book\'s, got 3']);
    expect(problems([{ type: "found", look: "fade", duration: 5 }])).toEqual(["components[0].duration: expected a number from 50 to 10000, got 5"]);
    expect(problems([{ type: "found", look: "fade", spinning: 1 }])).toEqual([expect.stringContaining("components[0].spinning: unknown parameter of fade")]);
    // Parameters without a look belong to nothing
    expect(problems([{ type: "lost", duration: 400 }])).toEqual([expect.stringContaining("components[0].look: name a look – duration are its parameters")]);
  });

  it("a plugin's look is known to the checks once registered – the same parameters, its own spec", () => {
    expect(momentComponentProblems({ look: "softFade", duration: 400 }, "at")).toEqual(['at.look: "softFade" is not one of inflateDissolve, printLift, fade']);
    registerAppearanceSpec("softFade", SOFT_FADE);
    expect(momentComponentProblems({ look: "softFade", duration: 400 }, "at")).toEqual([]);
    expect(momentComponentProblems({ look: "softFade", duration: 9000 }, "at")).toEqual(["at.duration: expected a number from 50 to 5000, got 9000"]);
    // A declared plugin that recorded nothing may register it at load
    expect(momentComponentProblems({ look: "other" }, "at", { unknownTypes: "allow" })).toEqual([]);
  });

  it("the guard checks them on any node", () => {
    const plugins = [{ id: "fx", src: "/assets/content/plugins/fx/plugin.js", api: "1.8", registered: { appearances: { softFade: SOFT_FADE } } }];
    expect(problemsOf(config({ components: [{ type: "reveal", look: "printLift" }, { type: "lost", look: "softFade", duration: 200 }] }, { plugins }))).toEqual([]);
    expect(problemsOf(config({ components: [{ type: "reveal", look: "softFade", duration: 9000 }] }, { plugins })))
      .toEqual(["entries[0].target.entity.components[0].duration: expected a number from 50 to 5000, got 9000"]);
    expect(problemsOf(config({ components: [{ type: "reveal", look: "softFade" }] }))).toEqual([
      'entries[0].target.entity.components[0].look: "softFade" is not one of inflateDissolve, printLift, fade',
    ]);
    // The reader's guard leaves what a later MINOR adds to the newer app
    expect(problemsOf(config({ components: [{ type: "found", look: "fade", later: 1 }] }))).toEqual([]);
    // Any node may carry them: a child's own look is checked like the root's
    expect(problemsOf(config({ children: [{ type: "group", assets: [], components: [{ type: "found", look: "fade" }] }] }))).toEqual([]);
    expect(problemsOf(config({ children: [{ type: "group", assets: [], components: [{ type: "found", look: "swirl" }] }] })))
      .toEqual(['entries[0].target.entity.children[0].components[0].look: "swirl" is not one of inflateDissolve, printLift, fade']);
  });
});

describe("an entity's look wins over the book's", () => {
  const book = { appearance: { reveal: { type: "fade" }, found: { type: "printLift" } } };

  it("the moment's own component, else the entity's found, else the book's moment, found, the default", () => {
    const entity = { components: [{ type: "found", look: "fade", duration: 900 }] };
    // found on the entity: it plays for every moment the entity has no look for – before the book's reveal
    expect(entityMomentAppearance(entity, book, "found")).toEqual({ type: "fade", duration: 900 });
    expect(entityMomentAppearance(entity, book, "reveal")).toEqual({ type: "fade", duration: 900 });
    expect(entityMomentAppearance(entity, book, "lost")).toEqual({ type: "fade", duration: 900 });
    const own = { components: [{ type: "reveal", look: "inflateDissolve", spin: 0.25 }, { type: "found", look: "" }] };
    expect(entityMomentAppearance(own, book, "reveal")).toEqual({ type: "inflateDissolve", spin: 0.25 });
    // an empty look is the book's
    expect(entityMomentAppearance(own, book, "found")).toEqual({ type: "printLift" });
    expect(entityMomentAppearance(own, book, "lost")).toEqual({ type: "printLift" });
    expect(entityMomentAppearance(undefined, book, "reveal")).toEqual({ type: "fade" });
    expect(entityMomentAppearance({}, undefined, "lost")).toEqual({ type: "inflateDissolve" });
    expect(momentComponentLook({ components: [{ type: "reveal" }] }, "reveal")).toBeUndefined();
  });

  it("the reveal's duration the found indicator waits for is the entity's look's", () => {
    expect(momentDuration(book, "reveal")).toBe(600);
    expect(momentDuration(book, "reveal", { components: [{ type: "reveal", look: "printLift" }] })).toBe(1100);
    expect(momentDuration(book, "lost", { components: [{ type: "lost", look: "printLift", outDuration: 250 }] })).toBe(250);
    expect(momentDuration(book, "reveal", { components: [{ type: "reveal", look: "softFade" }] })).toBeUndefined();
  });
});

describe("a newer MINOR's content", () => {
  it("an app that does not know the components skips them; one that knows them drops what a look does not have", () => {
    const [major, minor] = CONTENT_SCHEMA_VERSION.split(".").map(Number);
    const raw = () => ({
      version: { version: "9.0.0", timestamp: "2027-01-01T00:00:00.000Z", hash: "abc", schema: `${major}.${minor + 1}` },
      book: { id: "b", title: "B", author: "A" },
      plugins: [],
      entities: { e: { type: "group", assets: [], components: [
        { type: "reveal", look: "hologram", duration: 400 }, { type: "found", look: "fade", later: 1, fade: 0.5 }, { type: "lost", look: "" },
      ] } },
    });
    const { config, skipped } = skipUnknownFeatures(raw(), currentFeatures());
    expect((config as ReturnType<typeof raw>).entities.e.components).toEqual([{ type: "reveal" }, { type: "found", look: "fade", fade: 0.5 }, { type: "lost", look: "" }]);
    expect(skipped.map(({ path, kind }) => `${path}: ${kind}`).sort()).toEqual(["entities.e.components[0].look: look", "entities.e.components[1].later: parameter"]);
    const older = skipUnknownFeatures(raw(), { ...currentFeatures(), components: ["animation", "behaviour"] });
    expect((older.config as ReturnType<typeof raw>).entities.e.components).toEqual([]);
    expect(older.skipped.map(({ kind }) => kind)).toEqual(["component", "component", "component"]);
  });
});
