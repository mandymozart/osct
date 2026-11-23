/**
 * How the marginalia card is picked up (#361, content schema 6.3): a glossary target found in scan mode flies its card –
 * the printed picture leaves the page and lands on the screen, where it becomes the entry's own picture, and the entry
 * opens over it (#285). The experience names the **card look** that plays it, experience-wide, beside its entities' looks:
 *
 *   experience:
 *     appearance:
 *       card: { type: cardFlight, spins: 2 }   # the built-in flight, two turns
 *       card: { type: paperPlane }             # a plugin's (`api.registerCardLook`, plugin API 4.1)
 *
 * A card look is `{ type, ...parameters }` like an entity's look: the built-in `cardFlight` (the engine's flight,
 * `engine/src/scene/card-flight.ts`, its values defined once here) or one a declared plugin records
 * (`registered.cardLooks`). Without `card` the built-in plays with its defaults. `card` is no moment of an entity
 * (`MOMENTS`): no node's component names it, and it never falls back to `found`.
 *
 * Adding a built-in card look: add it to CARD_LOOKS with its parameters and play it in the engine (`ar-scene.ts` `flyCard`);
 * document it in docs/content.md.
 */

import type { ComponentParamSpec } from "./components";
import { paramProblems } from "./components";
import type { AppearanceData, AppearanceSpec } from "./appearance";
import { isObject } from "../guards/primitives";

/** The key of the experience's `appearance` that names the card look */
export const CARD_LOOK_KEY = "card";

/** The values of the built-in `cardFlight`, as the engine reads them */
export interface CardFlightValues {
  /** ms of the flight from a page about as close as the landing, and from one three landing distances away and more */
  near: number;
  far: number;
  /** Share of the screen's width and height the card fills when it lands */
  fill: number;
  /** How far the card rises off the page, in card widths */
  lift: number;
  /** Turns about its vertical axis on the way */
  spins: number;
  /** ms of the slap after the landing: the push, the bounce and the shake (0 = none) */
  impact: number;
  /** The phone vibrates once when the card lands */
  rumble: boolean;
}

const CARD_FLIGHT_PARAMS = {
  near: { kind: "number", default: 800, min: 200, max: 5000, step: 10, unit: "ms", label: "flight, near", description: "How long the flight takes from a page about as close as the landing." },
  far: { kind: "number", default: 1200, min: 200, max: 5000, step: 10, unit: "ms", label: "flight, far", description: "How long the flight takes from a page three landing distances away and more; in between in proportion." },
  fill: { kind: "number", default: 0.62, min: 0.2, max: 1, step: 0.01, label: "fills", description: "Share of the screen's width and height the card fills when it lands." },
  lift: { kind: "number", default: 0.6, min: 0, max: 2, step: 0.05, unit: "widths", description: "How far the card rises off the page before it turns towards the reader, in card widths." },
  spins: { kind: "number", default: 1, min: 0, max: 4, step: 1, integer: true, unit: "turns", description: "Turns about its vertical axis on the way: the back shows, then the front again (0 = none)." },
  impact: { kind: "number", default: 480, min: 0, max: 2000, step: 10, unit: "ms", description: "The slap after the landing: the card is pushed at the reader, bounces back and shakes (0 = it just lands)." },
  rumble: { kind: "boolean", default: true, description: "The phone vibrates once when the card lands." },
} as const satisfies Record<keyof CardFlightValues, ComponentParamSpec>;

export const CARD_LOOKS = {
  /** The default: the card peels off the page, rises, spins and slaps against the screen (#285) */
  cardFlight: {
    description: "The printed picture peels off the page as a playing card, rises, spins and slaps against the screen, where it becomes the entry's own picture.",
    params: CARD_FLIGHT_PARAMS as unknown as Record<string, ComponentParamSpec>,
  },
} satisfies Record<string, AppearanceSpec>;

export type BuiltInCardLookType = keyof typeof CARD_LOOKS;
export const CARD_LOOK_TYPES = Object.keys(CARD_LOOKS) as BuiltInCardLookType[];
export const isBuiltInCardLookType = (value: unknown): value is BuiltInCardLookType => typeof value === "string" && value in CARD_LOOKS;

/** The card look an experience without `appearance.card` plays */
export const DEFAULT_CARD_LOOK_TYPE: BuiltInCardLookType = "cardFlight";

export interface CardLookCheckOptions {
  /** The spec of a type that is not built in (a plugin's) – `undefined` = unknown */
  cardSpec?: (type: string) => AppearanceSpec | undefined;
  /** The plugin card looks known – named in the message about an unknown type */
  cardPluginTypes?: readonly string[];
  /** What an unknown type is: refused (the default) or allowed (a plugin registers it at load) */
  unknownTypes?: "refuse" | "allow";
  /** What a parameter the spec does not have is: refused (the default) or ignored (the app's guard) */
  unknown?: "refuse" | "ignore";
}

/** The card looks plugins registered (type → spec): the engine's plugin API and the content build fill it */
const registered = new Map<string, AppearanceSpec>();

export const registerCardLookSpec = (type: string, spec: AppearanceSpec): void => {
  registered.set(type, spec);
};

export const unregisterCardLookSpec = (type: string): void => {
  registered.delete(type);
};

/** The spec of a card look's type: built in, from `options.cardSpec` (what declared plugins recorded) or registered by a plugin */
export const cardLookSpec = (type: string, options: CardLookCheckOptions = {}): AppearanceSpec | undefined =>
  isBuiltInCardLookType(type) ? CARD_LOOKS[type] : options.cardSpec?.(type) ?? registered.get(type);

/** Problems of `appearance.card` */
export const cardLookProblems = (raw: unknown, at: string, options: CardLookCheckOptions = {}): string[] => {
  if (!isObject(raw)) return [`${at}: expected { type, ...parameters }`];
  const { type, ...params } = raw;
  if (typeof type !== "string" || !type) return [`${at}.type: expected a card look (${CARD_LOOK_TYPES.join(", ")})`];
  const spec = cardLookSpec(type, options);
  if (!spec) {
    if (options.unknownTypes === "allow") return [];
    const plugins = options.cardPluginTypes?.length ? ` or a card look of the experience's plugins (${options.cardPluginTypes.join(", ")})` : "";
    return [`${at}.type: "${type}" is not one of ${CARD_LOOK_TYPES.join(", ")}${plugins}`];
  }
  const known = options.unknown === "ignore" ? Object.fromEntries(Object.entries(params).filter(([name]) => name in spec.params)) : params;
  return paramProblems(spec.params, known, at, type);
};

/** The card look the experience plays: its `appearance.card`, else the built-in default */
export const experienceCardLook = (experience: { appearance?: { card?: AppearanceData } } | null | undefined): AppearanceData =>
  experience?.appearance?.card ?? { type: DEFAULT_CARD_LOOK_TYPE };
