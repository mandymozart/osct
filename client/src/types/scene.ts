import type { EntityData } from "./game-config";

// The scene's contract is the engine's (engine/src/types/scene.ts)
export * from "@engine/types/scene";

/**
 * DOM event on `document` (detail `{ targetId }`), dispatched by `<ar-bridge>` when a target is found
 * for the first time. Finding a target unlocks it; opening its entry marks it consulted.
 * `<found-indicator>` shows "New entry unlocked" and the entity plays its unlock animation.
 */
export const TARGET_UNLOCKED_EVENT = "osct:target-unlocked";

/**
 * DOM event on `document`, cancelable, dispatched by `<found-indicator>` when the reader taps a glossary picture whose
 * entry is not consulted yet (#285). `<ar-bridge>` takes it (`preventDefault`) and hands `respond` the scene's
 * `flyCard` – the card lifts off the page, turns over and lands in the centre; the indicator opens the entry once it
 * settles. Nobody took it: the indicator opens the entry at once.
 */
export const CARD_FLIGHT_EVENT = "osct:card-flight";

export interface CardFlightDetail {
  targetId: string;
  /** The card's picture while it flies: the printed one (the target's image) */
  front: string;
  /** What it becomes when it hits the screen: the entry's own picture */
  reveal?: string;
  respond: (flown: Promise<boolean>) => void;
}

export type { EntityData };
