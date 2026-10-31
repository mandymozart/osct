import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGameConfiguration, GameConfigurationError } from "@shared/guards/game-config";
import { CONTENT_SCHEMA_VERSION, paramSpecProblems, parseContentSchema } from "@shared/types/game-config";
import {
  currentFeatures,
  type KnownFeatures,
  PARAM_KINDS,
  skipUnknownFeatures,
} from "../forward-compatible";
import { describeSkipped, getConfigurationError, getEntries, getPasses, getSkippedFeatures, getSpreads, loadGameConfiguration } from "../game-config";
import { ErrorCode } from "../../types/index";

/**
 * RULES #10 (#220): a MINOR never breaks an older app. A book of schema 2.21 – a behaviour rule, a plugin's pass, a node
 * type of a plugin built against plugin API 1.6 (the feedback buffer), a component nobody registers – read with the
 * features of older apps: it loads, the unknown parts are listed, nothing throws. A broken shape and a higher MAJOR are
 * still refused.
 */

/** What a 2.19 app knew: the behaviour component, plugin API 1.5, no plugin passes in `passes` lists */
const APP_2_19: KnownFeatures = {
  ...currentFeatures(),
  schema: "2.19",
  components: ["animation", "behaviour"],
  passes: ["bloom", "vignette", "grade"],
  pluginApi: "1.5",
  pluginKinds: ["components", "nodeTypes", "materials"],
};
/** A 2.18 app: no behaviour component */
const APP_2_18: KnownFeatures = { ...APP_2_19, schema: "2.18", components: ["animation"] };
/** A 2.16 app: no parameter kind `texture`, no materials of plugins */
const APP_2_16: KnownFeatures = {
  ...APP_2_18, schema: "2.16", pluginApi: "1.3", paramKinds: PARAM_KINDS.filter(kind => kind !== "texture"), pluginKinds: ["components", "nodeTypes"],
};

const RIPPLE = { description: "Rings on water (a feedback buffer).", src: "none", params: { speed: { kind: "number", default: 1, min: 0, max: 4, description: "How fast." } } };
const GRAIN = { description: "Film grain.", params: { amount: { kind: "number", default: 0.2, min: 0, max: 1, description: "How much." } } };
const moss = () => ({ description: "Moss.", params: { look: { kind: "texture", default: "", description: "The picture." }, tone: { kind: "color", default: "#336633", description: "Its colour." } } });

/** A book of schema 2.21: everything its plugin uses is recorded (`registered`), so a type outside that is nobody's */
const book2_21 = (schema = "2.21", node: Record<string, unknown> = {}) => ({
  version: { version: "1.54.3", timestamp: "2026-10-31T00:00:00.000Z", hash: "abc123", schema },
  book: { id: "b", title: "B", author: "A" },
  initialSpreadId: "s1",
  spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2, passes: [{ type: "bloom", strength: 0.5 }, { type: "grain", amount: 0.3 }] }],
  entries: [{
    id: "e1", category: "video", title: "E", page: 1, body: "", tags: [],
    target: { id: "e1", imageSrc: "/assets/content/entries/e1/t.jpg", entity: { ref: "fx" } },
  }],
  entities: {
    fx: {
      type: "ripple",
      assets: [],
      params: { position: [0, 0, 0.1], speed: 2 },
      components: [
        {
          type: "behaviour",
          rules: [
            { on: "tap", do: [{ play: "" }, { toggle: "lamp" }] },
            { on: "found", do: "blink" },
            { on: "lost", do: { hide: "lamp" } },
          ],
        },
        { type: "sparkle", count: 3 },
      ],
      children: [{ name: "lamp", type: "light", assets: [], light: { kind: "point" } }],
      ...node,
    },
  },
  tutorial: [],
  plugins: [{ id: "ripples", src: "/assets/content/plugins/ripples/plugin.js", api: "1.6", registered: { nodeTypes: { ripple: RIPPLE }, passes: { grain: GRAIN } } }],
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

const app = parseContentSchema(CONTENT_SCHEMA_VERSION)!;

describe("forward compatibility: a newer MINOR read by an older app", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a 2.21 book in a 2.19 app: the plugin's pass, the unknown component and actions are skipped, the rest loads", () => {
    const raw = book2_21();
    const { config, skipped } = skipUnknownFeatures(raw, APP_2_19);
    expect(skipped.map(describeSkipped)).toEqual([
      'plugins[0]: plugin API "1.6"',
      'spreads[0].passes[1]: pass "grain"',
      'entities.fx.components[0].rules[0].do[1]: behaviour action "toggle"',
      'entities.fx.components[0].rules[1].do: behaviour action "blink"',
      'entities.fx.components[1]: component "sparkle"',
    ]);
    expect(problemsOf(config)).toEqual([]);
    const fx = (config as ReturnType<typeof book2_21>).entities.fx;
    // The node and its child stay; the behaviour keeps what it knows – a rule left without an action goes
    expect(fx.type).toBe("ripple");
    expect(fx.children).toHaveLength(1);
    expect(fx.components).toEqual([{ type: "behaviour", rules: [{ on: "tap", do: [{ play: "" }] }, { on: "lost", do: { hide: "lamp" } }] }]);
    expect((config as ReturnType<typeof book2_21>).spreads[0].passes).toEqual([{ type: "bloom", strength: 0.5 }]);
    // The configuration read is a copy: the content stays as it was
    expect(raw.entities.fx.components).toHaveLength(2);
    expect(raw.spreads[0].passes).toHaveLength(2);
  });

  it("a 2.21 book in a 2.18 app: the whole behaviour is skipped", () => {
    const { config, skipped } = skipUnknownFeatures(book2_21(), APP_2_18);
    expect(skipped.map(describeSkipped)).toContain('entities.fx.components[0]: component "behaviour"');
    expect((config as ReturnType<typeof book2_21>).entities.fx.components).toEqual([]);
    expect(problemsOf(config)).toEqual([]);
  });

  it("a 2.17 book in a 2.16 app: a recorded texture parameter, its value and the plugin's material are skipped", () => {
    const raw = {
      ...book2_21("2.17", { material: { type: "moss", params: { tone: "#225522" } }, components: [{ type: "mossy", look: "/assets/content/m.jpg", tone: "#112211" }] }),
      plugins: [{ id: "moss", src: "/assets/content/plugins/moss/plugin.js", api: "1.4", registered: { components: { mossy: moss() }, materials: { moss: moss() }, nodeTypes: { ripple: RIPPLE } } }],
      spreads: [{ id: "s1", title: "1–2", firstPage: 1, lastPage: 2 }],
    };
    const { config, skipped } = skipUnknownFeatures(raw, APP_2_16);
    expect(skipped.map(describeSkipped)).toEqual([
      'plugins[0]: plugin API "1.4"',
      'plugins[0].registered.components.mossy.params.look: parameter kind "texture"',
      'plugins[0].registered.materials.moss.params.look: parameter kind "texture"',
      'entities.fx.components[0].look: parameter "look"',
      'entities.fx.material: material "moss"',
    ]);
    expect(problemsOf(config)).toEqual([]);
    expect((config as typeof raw).entities.fx.components).toEqual([{ type: "mossy", tone: "#112211" }]);
  });

  it("loads in the app: the spread shows the passes it knows, the list is kept for the reader's hint", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = await loadGameConfiguration({ bundled: async () => book2_21(), knownFeatures: APP_2_19 });
    expect(error).toBeNull();
    expect(getConfigurationError()).toBeNull();
    expect(getSpreads().map(spread => spread.id)).toEqual(["s1"]);
    expect(getPasses("s1")).toEqual([{ type: "bloom", strength: 0.5 }]);
    expect(getEntries()[0].target?.entity?.components).toHaveLength(1);
    expect(getSkippedFeatures()).toHaveLength(5);
    expect(warn.mock.calls.some(([message]) => String(message).includes("skipped what it does not know"))).toBe(true);
  });

  it("the app itself: a later MINOR's component, pass, field and parameter are skipped", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const later = `${app.major}.${app.minor + 1}`;
    const raw = book2_21(later, {
      components: [{ type: "behaviour", rules: [{ on: "tap", once: true, do: { play: "", fade: 2 } }] }, { type: "glow", strength: 1 }],
      children: [{ name: "lamp", type: "light", assets: [], light: { kind: "point", flicker: 0.4 } }],
    });
    raw.spreads[0].passes.push({ type: "chromatic", amount: 1 }, { type: "grade", contrast: 1.2, curve: "s" } as never);
    expect(await loadGameConfiguration({ bundled: async () => raw })).toBeNull();
    expect(getSkippedFeatures().map(describeSkipped)).toEqual([
      'spreads[0].passes[2]: pass "chromatic"',
      'spreads[0].passes[3].curve: parameter "curve"',
      'entities.fx.components[0].rules[0].once: field "once"',
      'entities.fx.components[0].rules[0].do.fade: field "fade"',
      'entities.fx.components[1]: component "glow"',
      'entities.fx.children[0].light.flicker: parameter "flicker"',
    ]);
  });

  it("content of the app's own schema is read as it is – an unknown type there is the author's mistake", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = book2_21(CONTENT_SCHEMA_VERSION, { components: [{ type: "glow" }] });
    expect(skipUnknownFeatures(raw)).toEqual({ config: raw, skipped: [] });
    expect(await loadGameConfiguration({ bundled: async () => raw })).toMatchObject({ code: ErrorCode.GAME_CONFIGURATION_INVALID });
    expect(getConfigurationError()?.details?.join("\n")).toMatch(/"glow" is not one of/);
    expect(getSkippedFeatures()).toEqual([]);
  });

  it("a broken shape and a wrong type for a known field are still refused", () => {
    const refused = (node: Record<string, unknown>) => problemsOf(skipUnknownFeatures(book2_21("2.21", node), APP_2_19).config);
    expect(refused({ components: "nope" })).toEqual(["entities.fx.components: expected a list of components"]);
    expect(refused({ components: [{ type: 3 }] })).toEqual(['entities.fx.components[0].type: "3" is not one of animation, behaviour']);
    expect(refused({ params: { speed: "fast" } })).toEqual(["entities.fx.params.speed: expected a number from 0 to 4, got \"fast\""]);
    expect(refused({ components: [{ type: "behaviour", rules: [{ on: "tap", do: { play: 3 } }] }] }))
      .toEqual(["entities.fx.components[0].rules[0].do.play: expected a clip's name (empty = the node's own clip), got 3"]);
    // A new value of a required field's enum is a MAJOR's change: the entry cannot be read without it
    const poem = book2_21();
    poem.entries[0].category = "poem";
    expect(problemsOf(skipUnknownFeatures(poem, APP_2_19).config)).toEqual(['entries[0].category: "poem" is not one of glossary, video, text, link']);
  });

  it("a higher MAJOR is refused before the guard reads it, whatever its shape", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const newer = { ...book2_21(`${app.major + 1}.0`), spreads: "a shape this app does not know" };
    expect(skipUnknownFeatures(newer).skipped).toEqual([]);
    const error = await loadGameConfiguration({ bundled: async () => newer });
    expect(error).toMatchObject({ code: ErrorCode.NOT_SUPPORTED, type: "critical" });
    expect(error?.details?.[0]).toMatch(/update the app/);
    expect(getSpreads()).toEqual([]);
    // An older app refuses a MAJOR above its own the same way
    expect(await loadGameConfiguration({ bundled: async () => book2_21("3.0"), knownFeatures: APP_2_19 })).toMatchObject({ code: ErrorCode.NOT_SUPPORTED });
  });

  it("knows every parameter kind of shared/ (PARAM_KINDS)", () => {
    const param = (kind: string) => ({ kind, default: kind === "number" ? 0 : kind === "boolean" ? false : kind === "color" ? "#000000" : kind === "choice" ? "a" : "", min: 0, max: 1, options: ["a"], description: "d" });
    PARAM_KINDS.forEach(kind => expect(paramSpecProblems("t", { p: param(kind) })).toEqual([]));
    expect(paramSpecProblems("t", { p: param("sound") })).toEqual(["t.p: kind must be color, number, choice, boolean, string or texture"]);
  });
});
