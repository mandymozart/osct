import { EntityData } from "./game-config";

// The scene's contract is the engine's (engine/src/types/scene.ts)
export * from "@engine/types/scene";

/**
 * DOM event on `document` (detail `{ targetId }`), dispatched by `<ar-bridge>` when a target is found
 * for the first time. Finding a target unlocks it; opening its entry marks it consulted.
 * `<found-indicator>` shows "New entry unlocked" and the entity plays its unlock animation.
 */
export const TARGET_UNLOCKED_EVENT = "osct:target-unlocked";

export type { EntityData };
