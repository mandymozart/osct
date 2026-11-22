import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Texture } from "three";
import {
  componentSpecProblems, declaredUses, nodeTypeSpecProblems, PARAM_BUILDERS as p, paramProblem, registrationProblems,
  type ComponentParamSpec, type EntityData, type Target,
} from "../../types/index";
import { buildEntity } from "../entities";
import { installedPlugins, installPlugin, uninstallPlugin, withinLimits } from "../plugins";
import { runtimeApi } from "../plugin-runtime";

/** The plugin API's typed spec builders (#334 L-T6): the same parameter objects as by hand, types inferred from them */

const target = (entity: EntityData): Target => ({ id: "t", entryId: "t", sceneId: "s", imageSrc: "/t.jpg", entity });
const noAssets = () => undefined;

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("the builders write today's parameter objects", () => {
  it("each builder equals the hand-written spec", () => {
    const cases: Array<[ComponentParamSpec, ComponentParamSpec]> = [
      [p.number({ min: 0, max: 1, default: 0.5, step: 0.01, unit: "×", label: "volume", description: "How loud." }),
        { kind: "number", default: 0.5, min: 0, max: 1, step: 0.01, unit: "×", label: "volume", description: "How loud." }],
      [p.number({ min: 0, max: 10, slider: [0, 2], description: "Speed." }), { kind: "number", default: 0, min: 0, max: 10, slider: [0, 2], description: "Speed." }],
      [p.integer({ min: 1, max: 8, default: 3, description: "Count." }), { kind: "number", default: 3, min: 1, max: 8, step: 1, integer: true, description: "Count." }],
      [p.boolean({ default: true, description: "Loop." }), { kind: "boolean", default: true, description: "Loop." }],
      [p.boolean({ description: "Off." }), { kind: "boolean", default: false, description: "Off." }],
      [p.string({ description: "Name." }), { kind: "string", default: "", description: "Name." }],
      [p.choice(["loop", "once"], { description: "How." }), { kind: "choice", options: ["loop", "once"], default: "loop", description: "How." }],
      [p.choice(["a", "b"], { default: "b", description: "Pick." }), { kind: "choice", options: ["a", "b"], default: "b", description: "Pick." }],
      [p.color({ default: "#f3cc94", description: "Tint." }), { kind: "color", default: "#f3cc94", description: "Tint." }],
      [p.texture({ description: "Picture." }), { kind: "texture", default: "", description: "Picture." }],
      [p.model({ description: "Model." }), { kind: "model", default: "", description: "Model." }],
      [p.file("video", { description: "Clip." }), { kind: "texture", default: "", description: "Clip." }],
      [p.file("model", { description: "Body." }), { kind: "model", default: "", description: "Body." }],
    ];
    for (const [built, byHand] of cases) {
      expect(built).toEqual(byHand);
      expect(componentSpecProblems("x", { description: "", params: { a: built } })).toEqual([]);
    }
  });

  it("checks the soft range and whole numbers – min and max stay the hard limits", () => {
    const spec = (param: object) => componentSpecProblems("hum", { description: "", params: { volume: param } });
    expect(spec({ kind: "number", default: 0.5, min: 0, max: 1, slider: [0.2, 1.5], description: "" })).toEqual(["hum.volume: slider is the soft range [lo, hi] with min ≤ lo < hi ≤ max"]);
    expect(spec({ kind: "number", default: 1.5, min: 0, max: 4, integer: true, description: "" })).toEqual(["hum.volume: an integer needs whole min, max and default"]);
    const count = p.integer({ min: 1, max: 8, description: "" });
    expect(paramProblem(count, 2.5)).toBe("expected a whole number from 1 to 8, got 2.5");
    expect(paramProblem(count, 9)).toBe("expected a whole number from 1 to 8, got 9");
    expect(paramProblem(p.number({ min: 0, max: 1, slider: [0, 0.5], description: "" }), 0.9)).toBeNull();
  });
});

describe("actions, events and uses in the spec", () => {
  it("are checked: node verbs, camelCase names, no core event emitted", () => {
    expect(componentSpecProblems("hum", { description: "", params: {}, actions: ["play", "explode"], events: ["ended", "targetFound"], uses: { listens: ["doorOpened"], emits: ["sceneChanged"], sets: ["x-y"], foo: [] } })).toEqual([
      "hum.actions: explode is no rule verb a node answers (play, pause, stop, show, hide)",
      "hum.events: targetFound is the engine's own event – a spec listens to it, never emits it",
      "hum.uses.foo: unknown field (listens, emits, reads, sets)",
      "hum.uses.emits: sceneChanged is the engine's own event – a spec listens to it, never emits it",
      "hum.uses.sets: \"x-y\" is no name (camelCase letters and digits)",
    ]);
    expect(nodeTypeSpecProblems("sparkle", { description: "", params: {}, events: "ended" })).toEqual(["sparkle.events: expected a list of names"]);
  });

  it("the guard checks them in a plugin's registered, and the declared uses are read from it", () => {
    const registered = {
      components: { hum: { description: "", params: {}, actions: ["play"], events: ["ended"], uses: { listens: ["doorOpened"], sets: ["hummed"] } } },
      passes: { glow: { description: "", params: {}, uses: { reads: ["mood"] } } },
    };
    expect(registrationProblems(registered, "plugins[0].registered")).toEqual([]);
    expect(registrationProblems({ components: { hum: { description: "", params: {}, actions: ["fly"] } } }, "r")).toEqual(["r.components: hum.actions: fly is no rule verb a node answers (play, pause, stop, show, hide)"]);
    expect(declaredUses(registered)).toEqual({ listens: ["doorOpened"], emits: ["ended"], reads: ["mood"], sets: ["hummed"] });
    expect(declaredUses({ components: { spin: { description: "", params: {} } } })).toBeNull();
  });
});

describe("the register functions infer the handler's types from the spec", () => {
  it("params, actions and events are typed; a plain ComponentSpec keeps Record<string, unknown>", () => {
    installPlugin("fx", {
      register: api => {
        api.registerComponent("hum", {
          description: "Hums.",
          params: {
            volume: api.p.number({ min: 0, max: 1, default: 0.6, description: "How loud." }),
            voice: api.p.choice(["low", "high"], { description: "Which voice." }),
            loop: api.p.boolean({ description: "Again." }),
            picture: api.p.texture({ description: "A picture." }),
            label: { kind: "string", default: "", description: "Inline, by hand." },
          },
          actions: ["play", "pause"],
          events: ["ended"],
        }, ({ params, emit }) => {
          expectTypeOf(params.volume).toEqualTypeOf<number>();
          expectTypeOf(params.voice).toEqualTypeOf<"low" | "high">();
          expectTypeOf(params.loop).toEqualTypeOf<boolean>();
          expectTypeOf(params.picture).toEqualTypeOf<Texture | null>();
          expectTypeOf(params.label).toEqualTypeOf<string>();
          expectTypeOf(emit).parameter(0).toEqualTypeOf<"ended">();
          return {
            onAction: action => { expectTypeOf(action).toEqualTypeOf<"play" | "pause">(); },
            // @ts-expect-error – an event the spec does not declare
            onTap: () => emit("endd"),
          };
        });
        const plain: import("../../types/index").ComponentSpec = { description: "", params: {} };
        api.registerComponent("plain", plain, ({ params }) => { expectTypeOf(params).toEqualTypeOf<Record<string, unknown>>(); });
      },
    });
    expect(installedPlugins()).toEqual(["fx"]);
  });
});

describe("the engine answers declared actions and events", () => {
  it("a rule's verb on the node reaches onAction of a component that declares it; emit sends only declared events", () => {
    const received: string[] = [];
    const sent: unknown[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    installPlugin("fx", {
      register: api => {
        api.registerComponent("hum", { description: "", params: {}, actions: ["play", "hide"], events: ["ended"] }, ({ emit }) => ({
          onAction: action => {
            received.push(action);
            emit("ended", { by: action });
            (emit as (event: string) => void)("other");
          },
        }));
      },
    });
    const off = runtimeApi("listener").events.on("ended", payload => sent.push(payload));
    const entity = buildEntity(target({
      type: "group", assets: [], children: [],
      components: [{ type: "hum" }, { type: "behaviour", rules: [{ on: "tap", do: ["play", "hide", "pause"] }] }],
    } as EntityData), noAssets)!;
    entity.onTap?.();
    off();
    expect(received).toEqual(["play", "hide"]);
    expect(sent).toEqual([{ by: "play", targetId: "t" }, { by: "hide", targetId: "t" }]);
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes('emits "other", which its spec does not declare'))).toBe(true);
    // pause: nothing on the group answers it and it has no clip
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes("nothing on it answers pause"))).toBe(true);
  });

  it("a value outside a number's hard limits is not applied: the one before stays, else the default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const params = { volume: p.number({ min: 0, max: 1, default: 0.6, description: "" }), count: p.integer({ min: 1, max: 4, default: 2, description: "" }) };
    expect(withinLimits(params, { volume: 2, count: 3 }, null, "hum")).toEqual({ volume: 0.6, count: 3 });
    expect(withinLimits(params, { volume: 0.2, count: 2.5 }, { volume: 0.1, count: 4 }, "hum")).toEqual({ volume: 0.2, count: 4 });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
