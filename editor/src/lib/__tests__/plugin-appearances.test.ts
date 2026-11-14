import { afterEach, describe, expect, it } from "vitest";
import { installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import type { AppearanceSpec, PluginData } from "@engine/types";
import { lookChoices, pluginOfLook, registeredLooks, specOfLook, type RegisteredLook } from "../plugin-appearances";
import { lookRows } from "../values";

/** The appearance panel's plugin looks (#265): what the picker offers, and the spec a plugin's look's rows come from */

const SOFT: AppearanceSpec = { description: "Fades.", params: { duration: { kind: "number", default: 800, min: 50, max: 10000, step: 10, unit: "ms", description: "How long." } } };
const POP: AppearanceSpec = { description: "Pops in.", params: { overshoot: { kind: "number", default: 0.2, min: 0, max: 1, description: "How far." } } };

const declared = (id: string, appearances: Record<string, AppearanceSpec>): PluginData => ({ id, src: `/assets/content/plugins/${id}/plugin.js`, api: "1.7", registered: { appearances } });

describe("the look picker: the built-in looks, then the plugins' looks", () => {
  it("built in first, then each plugin's looks by plugin – recorded ones before they load", () => {
    const choices = lookChoices([], [declared("pop", { popIn: POP }), declared("soft", { softFade: SOFT })]);
    expect(choices.map(c => [c.type, c.plugin])).toEqual([
      ["inflateDissolve", null], ["printLift", null], ["fade", null], ["popIn", "pop"], ["softFade", "soft"],
    ]);
  });

  it("a look registered on the stage wins over another plugin's record of the same type", () => {
    const registered: RegisteredLook[] = [{ type: "softFade", owner: "code-tab", spec: POP }];
    const choices = lookChoices(registered, [declared("soft", { softFade: SOFT })]);
    expect(choices.filter(c => c.plugin)).toEqual([{ type: "softFade", plugin: "code-tab", spec: POP }]);
    expect(pluginOfLook("softFade", registered, [])).toBe("code-tab");
  });

  it("a type's spec: built in, else the plugins'; a type nobody knows has none", () => {
    expect(specOfLook("fade", [], [])?.params.duration.default).toBe(600);
    expect(specOfLook("softFade", [], [declared("soft", { softFade: SOFT })])).toBe(SOFT);
    expect(specOfLook("nobody", [], [])).toBeUndefined();
    expect(pluginOfLook("fade", [], [])).toBeNull();
  });

  it("a plugin's look has its rows from its spec", () => {
    const rows = lookRows({ type: "softFade", duration: 500 }, "found", type => specOfLook(type, [], [declared("soft", { softFade: SOFT })]));
    expect(rows).toEqual([expect.objectContaining({ id: "appearance.found.duration", kind: "number", default: 800, unit: "ms" })]);
  });
});

describe("the engine's look registry", () => {
  afterEach(() => uninstallPlugin("looks"));

  it("a plugin installed in the page (a mirror of the stage's) is offered at once", async () => {
    await installPlugin("looks", { register: api => api.registerAppearance("softFade", SOFT, () => ({ duration: 1, update: () => {} })) });
    expect(registeredLooks()).toEqual([{ type: "softFade", owner: "looks", spec: SOFT }]);
    uninstallPlugin("looks");
    expect(registeredLooks()).toEqual([]);
  });
});
