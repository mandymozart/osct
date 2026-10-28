/// <reference types="vite/client" />

declare const __VITE_APP_VERSION__: string;
declare const __VITE_BUILD_DATE__: string;
declare const __VITE_SERVER_URL__: string;

interface ImportMetaEnv {
  /** "true" shows the debug overlay in production builds (dev builds always show it) */
  readonly VITE_DEBUG?: string;
  /** "true" / "false": list unconsulted entries locked (default: dev only) */
  readonly VITE_SHOW_LOCKED_ENTRIES?: string;
  /** Accounts API (server/): "/api" on the production host, the full URL elsewhere; unset = no accounts */
  readonly VITE_API_URL?: string;
  /**
   * Content CDN base URL of the environment (`https://…/staging`): the app loads `latest.json` and the current
   * content version from there (docs/content-cdn.md) and the build reads no content; unset = the content bundled
   * with the app (dev server, tests)
   */
  readonly VITE_CONTENT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The bundled game configuration (vite.config.js): the local content build, null in a CDN build */
declare module "virtual:osct-game-config" {
  const config: unknown;
  export default config;
}

/** Sizes of the content files in bytes by URL (`/assets/content/…`), from the build (vite.config.js) */
declare module "virtual:osct-content-sizes" {
  const sizes: Record<string, number>;
  export default sizes;
}
