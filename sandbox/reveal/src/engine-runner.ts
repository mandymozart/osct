import type { Object3D } from "three";
import { celebrate, type Celebration } from "@engine/scene/celebration";
import { type AppearanceData, DEFAULT_APPEARANCE_TYPE, isBuiltInAppearanceType, type Moment } from "@shared/types/appearance";
import { REVEAL_CODE_LOOK } from "./demo-plugin";
import { engineLook, type EngineParams } from "./params";
import type { Runner } from "./reveal";

/**
 * The engine's own animation in the sandbox: the real `celebrate`, handed the look the panel holds as a book's content
 * names it – `{ type, ...values }` (`shared/types/appearance.ts`). What plays here is what the reader plays.
 */

/** The engine's default look – what a book without `appearance` plays */
export const ENGINE_DEFAULTS: EngineParams = engineLook(DEFAULT_APPEARANCE_TYPE);

/** One 30 fps frame: the engine advances at most this much per update */
const STEP_MS = 1000 / 30;

export const startEngine = (anchor: Object3D, entity: Object3D, params: EngineParams): Runner => {
  let current: Celebration | null = null;
  let moment: Moment = "found";
  let elapsed = 0;
  let stale = true;
  const msOf = (phase: "in" | "out") => Math.max(1, phase === "in" ? params.duration : params.outDuration);
  /** A built-in look with the panel's values; a plugin's look with its duration for this phase */
  const look = (phase: "in" | "out"): AppearanceData => {
    const { look: type, ...values } = params;
    // revealCode takes the built-in look's parameters; another plugin look only its duration
    return isBuiltInAppearanceType(type) || type === REVEAL_CODE_LOOK ? { type, ...values } : { type, duration: msOf(phase) };
  };

  const end = () => {
    current?.finish();
    current = null;
  };

  return {
    get bloom() {
      return current?.bloom ?? 0;
    },
    duration: msOf,
    play(phase, tau) {
      // A find plays the look forwards (the first find, the reveal, plays what a book names for it – here the same)
      const wanted: Moment = phase === "in" ? "found" : "lost";
      const ms = msOf(phase);
      const target = Math.min(1, Math.max(0, tau)) * ms;
      // The engine's animation only runs forwards: another moment, new values or an earlier time start it again
      if (stale || wanted !== moment || target < elapsed - 0.5 || (!current && target < ms)) {
        end();
        moment = wanted;
        current = celebrate(anchor, entity, moment, look(phase));
        elapsed = 0;
        stale = false;
      }
      while (current && elapsed < target - 1e-3) {
        const step = Math.min(STEP_MS, target - elapsed);
        elapsed += step;
        if (!current.update(step / 1000)) current = null; // done: the engine restored the originals
      }
      if (tau >= 1) end();
    },
    refit: () => (stale = true),
    invalidate: () => (stale = true),
    dispose: end,
  };
};
