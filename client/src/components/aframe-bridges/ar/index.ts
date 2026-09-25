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
export const AR_SCENE_STRATEGIES: readonly ArSceneStrategy[] = ["rebuild", "persistent"];

/** Default when neither the build flag nor the dev override says otherwise */
export const AR_SCENE_STRATEGY: ArSceneStrategy = "rebuild";

const isStrategy = (value: unknown): value is ArSceneStrategy =>
  AR_SCENE_STRATEGIES.includes(value as ArSceneStrategy);

/**
 * Strategy for this run, first match wins – for testing which one works best on which devices:
 *   1. dev builds only: `localStorage["osct-ar-strategy"]` ("rebuild" | "persistent", reload after changing)
 *   2. build flag `VITE_AR_STRATEGY` – env var (e.g. in Netlify) or a mode file:
 *      `npm run build:ar-persistent` / `build:ar-rebuild` / `dev:ar-persistent` (client/.env.ar-*)
 *   3. `AR_SCENE_STRATEGY`
 * An unknown value is ignored with a warning.
 */
export const resolveArSceneStrategy = (
  env: { DEV?: boolean; VITE_AR_STRATEGY?: string } = import.meta.env,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): ArSceneStrategy => {
  if (env.DEV && storage) {
    try {
      const override = storage.getItem("osct-ar-strategy");
      if (isStrategy(override)) return override;
    } catch {
      // storage blocked – ignore
    }
  }
  const flag = env.VITE_AR_STRATEGY?.trim();
  if (flag) {
    if (isStrategy(flag)) return flag;
    console.warn(`[AR] Unknown VITE_AR_STRATEGY "${flag}" – using "${AR_SCENE_STRATEGY}"`);
  }
  return AR_SCENE_STRATEGY;
};

export const createArScene = (container: HTMLElement, strategy: ArSceneStrategy = resolveArSceneStrategy()): IArScene => {
  console.info(`[AR] Scene strategy: ${strategy}`);
  switch (strategy) {
    case "rebuild":
      return new ArScene(container);
    case "persistent":
      return new PersistentArScene(container);
  }
};
