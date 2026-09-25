import { IArScene } from "@/types";
import { ArScene } from "./ar-scene";

/**
 * Which AR scene strategy the app uses (Phase 6). Swap here – both implement `IArScene`:
 * - "rebuild": `ArScene`, a new A-Frame scene per spread (decided default, proven).
 * - "persistent": `PersistentArScene`, one scene; targets, assets and entities are swapped in place
 *   (faster switches, camera kept – relies on MindAR internals).
 */
export type ArSceneStrategy = "rebuild" | "persistent";
export const AR_SCENE_STRATEGY: ArSceneStrategy = "rebuild";

export const createArScene = (container: HTMLElement, strategy: ArSceneStrategy = AR_SCENE_STRATEGY): IArScene => {
  switch (strategy) {
    case "rebuild":
      return new ArScene(container);
    case "persistent":
      throw new Error("PersistentArScene is not built yet");
  }
};
