/**
 * The game configuration – read access for the whole app (RULES #14). The runtime is the engine's
 * (engine/src/content/game-config.ts); the reader adds what differs per app: the content base URL of the build
 * (`VITE_CONTENT_BASE_URL`, docs/content-cdn.md), the bundled copy (`virtual:osct-game-config` – dev server, tests)
 * and the translated startup errors.
 */
import { t } from "i18next";
import { loadGameConfiguration as load, LoadOptions } from "@engine/content/game-config";

export * from "@engine/content/game-config";

/** Loads the game configuration once before the app starts (main.ts); see the engine's `loadGameConfiguration` */
export const loadGameConfiguration = (options: LoadOptions = {}) =>
  load({
    baseUrl: import.meta.env.VITE_CONTENT_BASE_URL ?? "",
    bundled: () => import("virtual:osct-game-config").then(module => module.default),
    texts: {
      contentNewer: t("startup:contentNewer"),
      contentOlder: t("startup:contentOlder"),
      contentNotLoaded: t("startup:contentNotLoaded"),
    },
    ...options,
  });
