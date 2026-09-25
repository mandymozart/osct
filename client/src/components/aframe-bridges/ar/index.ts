import { IArScene } from "@/types";
import { ArScene } from "./ar-scene";
import { PersistentArScene } from "./persistent-ar-scene";

/**
 * Which AR scene strategy the app uses (Phase 6). Swap here – both implement `IArScene`:
 * - "rebuild": `ArScene`, a new A-Frame scene per spread (decided default, proven).
 * - "persistent": `PersistentArScene`, one scene; targets, assets and entities are swapped in place
 *   (faster switches, camera kept – relies on MindAR internals).
 */
export type ArSceneStrategy = "rebuild" | "persistent";
export const AR_SCENE_STRATEGY: ArSceneStrategy = "rebuild";

/**
 * Dev builds: `localStorage["osct-ar-strategy"] = "persistent"` (or "rebuild") overrides the constant
 * for comparing both on a device – reload after changing it.
 */
const devOverride = (): ArSceneStrategy | null => {
  if (!import.meta.env.DEV) return null;
  try {
    const value = localStorage.getItem("osct-ar-strategy");
    return value === "rebuild" || value === "persistent" ? value : null;
  } catch {
    return null;
  }
};

export const createArScene = (container: HTMLElement, strategy: ArSceneStrategy = devOverride() ?? AR_SCENE_STRATEGY): IArScene => {
  console.info(`[AR] Scene strategy: ${strategy}`);
  switch (strategy) {
    case "rebuild":
      return new ArScene(container);
    case "persistent":
      return new PersistentArScene(container);
  }
};
