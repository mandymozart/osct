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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Sizes of the content files in bytes by URL (`/assets/content/…`), from the build (vite.config.js) */
declare module "virtual:osct-content-sizes" {
  const sizes: Record<string, number>;
  export default sizes;
}
