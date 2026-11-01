/**
 * The game configuration – read access for the whole app (RULES #14). The runtime is the engine's
 * (engine/src/content/game-config.ts); the reader adds what differs per app: the content base URL of the build
 * (`VITE_CONTENT_BASE_URL`, docs/content-cdn.md), the bundled copy (`virtual:osct-game-config` – dev server, tests)
 * and the translated startup errors. A debug build (the dev server, staging) also takes a content base URL from the
 * address – `?content=<base url>` – and keeps it for the tab, so another book (the demo) opens in the same reader.
 */
import { t } from "i18next";
import { loadGameConfiguration as load, type LoadOptions } from "@engine/content/game-config";

export * from "@engine/content/game-config";

/** Where the tab keeps the content base URL of `?content=` (a debug build only) */
export const CONTENT_OVERRIDE_KEY = "osct-content-base";

/**
 * The content base URL named by `?content=<url>` on a debug build, kept in the tab's session storage so routes and
 * reloads keep the book; `?content=` (empty) forgets it. Production builds ignore the parameter. Null = none.
 */
export const contentBaseOverride = (
  search = typeof location === "undefined" ? "" : location.search,
  debug = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true",
): string | null => {
  if (!debug) return null;
  const store = typeof sessionStorage === "undefined" ? null : sessionStorage;
  try {
    const params = new URLSearchParams(search);
    const given = params.get("content");
    if (given !== null) {
      const url = given.trim().replace(/\/+$/, "");
      if (/^https?:\/\//.test(url)) store?.setItem(CONTENT_OVERRIDE_KEY, url);
      else store?.removeItem(CONTENT_OVERRIDE_KEY);
    }
    return store?.getItem(CONTENT_OVERRIDE_KEY) || null;
  } catch {
    return null;
  }
};

/** Loads the game configuration once before the app starts (main.ts); see the engine's `loadGameConfiguration` */
export const loadGameConfiguration = (options: LoadOptions = {}) =>
  load({
    baseUrl: contentBaseOverride() ?? import.meta.env.VITE_CONTENT_BASE_URL ?? "",
    bundled: () => import("virtual:osct-game-config").then(module => module.default),
    texts: {
      contentNewer: t("startup:contentNewer"),
      contentOlder: t("startup:contentOlder"),
      contentNotLoaded: t("startup:contentNotLoaded"),
    },
    ...options,
  });
