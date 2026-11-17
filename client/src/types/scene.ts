import type { EntityData } from "./game-config";

// The scene's contract is the engine's (engine/src/types/scene.ts)
export * from "@engine/types/scene";

/**
 * DOM event on `document` (detail `{ targetId }`), dispatched by `<ar-bridge>` when a target is found
 * for the first time. Finding a target unlocks it; opening its entry marks it consulted.
 * `<found-indicator>` shows "New marginalia unlocked" and the entity plays its unlock animation.
 */
export const TARGET_UNLOCKED_EVENT = "osct:target-unlocked";

/**
 * DOM event on `document`, dispatched by `<ar-bridge>` when the marginalia card of a found glossary target starts
 * flying (`flying: true`) and when it has landed or was cut short (`flying: false`) – #285. `<found-indicator>` takes
 * no taps meanwhile; the bridge opens the entry once the card landed.
 */
export const CARD_FLIGHT_EVENT = "osct:card-flight";

export interface CardFlightDetail {
  targetId: string;
  flying: boolean;
}
