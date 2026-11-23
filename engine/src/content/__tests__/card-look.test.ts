import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Matrix4, PerspectiveCamera, Scene, Texture } from "three";
import { appearanceProblems } from "@shared/types/appearance";
import {
  CARD_LOOK_TYPES, CARD_LOOKS, cardLookProblems, DEFAULT_CARD_LOOK_TYPE, experienceCardLook,
} from "@shared/types/card-look";
import { pluginProblems, recordedRegistrations } from "@shared/types/plugins";
import { CONTENT_SCHEMA_VERSION, resolveAppearance } from "@shared/types/game-config";
import { currentFeatures, skipUnknownFeatures } from "../forward-compatible";
import { installedPlugins, installPlugin, PluginError, pluginRegistrySnapshot, uninstallPlugin } from "../../scene/plugins";
import { cardLookRegistration, playCardLook } from "../../scene/card-looks";
import { CARD_FLIGHT_DEFAULTS, flightMs, impactAt, startFromAnchor } from "../../scene/card-flight";
import * as THREE from "three";

const DRIFT = { description: "Drifts.", params: { duration: { kind: "number", default: 900, min: 100, max: 5000, step: 10, description: "ms" } } } as const;

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
});

describe("the card look: how the marginalia card is picked up (content schema 6.3, #361)", () => {
  it("has the built-in cardFlight, with the flight's values as its defaults", () => {
    expect(CARD_LOOK_TYPES).toEqual(["cardFlight"]);
    expect(DEFAULT_CARD_LOOK_TYPE).toBe("cardFlight");
    expect(resolveAppearance(CARD_LOOKS.cardFlight, { type: "cardFlight", spins: 2 })).toEqual({
      near: 800, far: 1200, fill: 0.62, lift: 0.6, spins: 2, impact: 480, rumble: true,
    });
    expect(experienceCardLook(undefined)).toEqual({ type: "cardFlight" });
    expect(experienceCardLook({ appearance: { found: { type: "fade" } } as { card?: { type: string } } })).toEqual({ type: "cardFlight" });
    expect(experienceCardLook({ appearance: { card: { type: "drift" } } })).toEqual({ type: "drift" });
  });

  it("is checked in the experience's appearance as `card`, against the card looks – not the entities' looks", () => {
    expect(appearanceProblems({ found: { type: "fade" }, card: { type: "cardFlight", spins: 2, rumble: false } }, "appearance")).toEqual([]);
    expect(appearanceProblems({ card: { type: "fade" } }, "appearance")).toEqual(['appearance.card.type: "fade" is not one of cardFlight']);
    expect(appearanceProblems({ found: { type: "cardFlight" } }, "appearance")).toEqual([expect.stringContaining('appearance.found.type: "cardFlight" is not one of')]);
    expect(appearanceProblems({ card: { type: "cardFlight", spins: 9, wobble: 1 } }, "appearance")).toEqual([
      "appearance.card.spins: expected a whole number from 0 to 4, got 9",
      expect.stringContaining("appearance.card.wobble: unknown parameter of cardFlight"),
    ]);
    expect(cardLookProblems("cardFlight", "card")).toEqual(["card: expected { type, ...parameters }"]);
    // A plugin's: known from what the declared plugins recorded
    const options = { cardSpec: (type: string) => (type === "drift" ? DRIFT : undefined), cardPluginTypes: ["drift"] };
    expect(appearanceProblems({ card: { type: "drift", duration: 1200 } }, "appearance", options)).toEqual([]);
    expect(appearanceProblems({ card: { type: "flutter" } }, "appearance", options)).toEqual(['appearance.card.type: "flutter" is not one of cardFlight or a card look of the experience\'s plugins (drift)']);
    expect(appearanceProblems({ card: { type: "flutter" } }, "appearance", { unknownTypes: "allow" })).toEqual([]);
  });

  it("a plugin records its card looks as `registered.cardLooks`; a built-in card look's name is refused", () => {
    const plugins = [{ id: "cards", src: "/p.js", api: "4.1", registered: { cardLooks: { drift: DRIFT } } }];
    expect(pluginProblems(plugins)).toEqual([]);
    expect(recordedRegistrations(plugins).cardLooks.get("drift")).toEqual(DRIFT);
    expect(pluginProblems([{ id: "cards", src: "/p.js", api: "4.1", registered: { cardLooks: { cardFlight: DRIFT } } }]))
      .toEqual(['plugins[0].registered.cardLooks: "cardFlight" is a built-in card look']);
  });

  it("an app of 6.2 drops `card`; this app keeps a known one and drops a card look nobody provides", () => {
    const config = (card: unknown) => ({ version: { schema: "6.9" }, experience: { appearance: { found: { type: "fade" }, card } } });
    const older = { ...currentFeatures(), schema: "6.2", cardLooks: undefined, pluginKinds: currentFeatures().pluginKinds.filter(kind => kind !== "cardLooks") };
    const asOlder = skipUnknownFeatures(config({ type: "cardFlight" }), older);
    expect((asOlder.config as { experience: { appearance: object } }).experience.appearance).toEqual({ found: { type: "fade" } });
    expect(asOlder.skipped).toEqual([{ path: "experience.appearance.card", kind: "field", name: "card" }]);

    const known = skipUnknownFeatures(config({ type: "cardFlight", spins: 2, later: 1 }), { ...currentFeatures(), schema: CONTENT_SCHEMA_VERSION.replace(/\d+$/, "8") });
    expect((known.config as { experience: { appearance: { card: object } } }).experience.appearance.card).toEqual({ type: "cardFlight", spins: 2 });
    const unknown = skipUnknownFeatures(config({ type: "flutter" }), { ...currentFeatures(), schema: CONTENT_SCHEMA_VERSION.replace(/\d+$/, "8") });
    expect(unknown.skipped).toEqual([{ path: "experience.appearance.card", kind: "look", name: "flutter" }]);
  });
});

describe("the built-in cardFlight's values", () => {
  const camera = new PerspectiveCamera(60, 0.5, 0.01, 100);
  camera.updateMatrixWorld();
  const start = startFromAnchor(new Matrix4().compose(new THREE.Vector3(0, 0, -3), new THREE.Quaternion(), new THREE.Vector3(0.2, 0.2, 0.2)));

  it("the defaults are the flight as it was; the flight times and the impact follow the look", () => {
    expect(CARD_FLIGHT_DEFAULTS).toEqual({ near: 800, far: 1200, fill: 0.62, lift: 0.6, spins: 1, impact: 480, rumble: true });
    expect(flightMs(start, camera, 1.4)).toBe(flightMs(start, camera, 1.4, CARD_FLIGHT_DEFAULTS));
    expect(flightMs(start, camera, 1.4, { near: 2000, far: 2000 })).toBe(2000);
    expect(impactAt(100, 0).push).toBe(0);
    expect(impactAt(100).push).not.toBe(0);
  });
});

describe("registerCardLook (plugin API 4.1)", () => {
  const stage = () => {
    const scene = new Scene();
    const anchor = new Group();
    anchor.matrix.compose(new THREE.Vector3(0, 0, -2), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.3, 0.3));
    const camera = new PerspectiveCamera(60, 0.5, 0.01, 100);
    camera.updateMatrixWorld();
    return { scene, anchor, camera, found: () => true, three: THREE };
  };
  const pictures = () => ({ front: new Texture(), back: new Texture(), reveal: null, aspect: 1.4 });

  it("registers a card look with its spec; a built-in name, a twin and a missing factory are refused", () => {
    installPlugin("cards", { register: api => api.registerCardLook("drift", DRIFT, () => ({ duration: 900, update: () => {} })) });
    expect(cardLookRegistration("drift")?.owner).toBe("cards");
    expect(pluginRegistrySnapshot().plugins.cards.cardLooks).toEqual({ drift: DRIFT });
    expect(() => installPlugin("other", { register: api => api.registerCardLook("cardFlight", DRIFT, () => ({ duration: 1, update: () => {} })) })).toThrow(PluginError);
    expect(() => installPlugin("other", { register: api => api.registerCardLook("drift", DRIFT, () => ({ duration: 1, update: () => {} })) })).toThrow(/registered by cards/);
    expect(() => installPlugin("other", { register: api => api.registerCardLook("flutter", DRIFT, undefined as never) })).toThrow(/needs a factory/);
    uninstallPlugin("cards");
    expect(cardLookRegistration("drift")).toBeUndefined();
  });

  it("plays a plugin's card look over its duration with its parameters and frees the pictures", () => {
    const seen: number[] = [];
    const disposed = vi.fn();
    let params: unknown;
    installPlugin("cards", {
      register: api => api.registerCardLook("drift", DRIFT, context => {
        params = context.params;
        return { duration: context.params.duration, update: t => seen.push(t), dispose: disposed };
      }),
    });
    const s = stage();
    const shown = pictures();
    const front = vi.spyOn(shown.front, "dispose");
    const play = playCardLook({ type: "drift", duration: 1000 }, shown, s);
    expect(params).toEqual({ duration: 1000 });
    expect(play.step(0.5, null, s.camera)).toBe(true);
    expect(play.step(0.6, null, s.camera)).toBe(false);
    expect(seen).toEqual([0.5, 1]);
    play.dispose();
    expect(disposed).toHaveBeenCalled();
    expect(front).toHaveBeenCalled();
  });

  it("the built-in flight plays for cardFlight, for no look and for a card look nobody registered", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const look of [{ type: "cardFlight", near: 300, far: 300, impact: 0 }, undefined, { type: "flutter" }]) {
      const s = stage();
      const play = playCardLook(look, pictures(), s);
      expect(s.scene.children.map(child => child.name)).toEqual(["marginalia-card"]);
      play.dispose();
      expect(s.scene.children).toEqual([]);
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"flutter" is registered by no plugin'));
    warn.mockRestore();
  });

  it("a card look whose update throws ends the flight, not the scene", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    installPlugin("cards", { register: api => api.registerCardLook("drift", DRIFT, () => ({ duration: 900, update: () => { throw new Error("boom"); } })) });
    const s = stage();
    const play = playCardLook({ type: "drift" }, pictures(), s);
    expect(play.step(0.1, null, s.camera)).toBe(false);
    play.dispose();
    error.mockRestore();
  });
});
