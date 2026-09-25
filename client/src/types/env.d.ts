/// <reference types="vite/client" />

declare const __VITE_APP_VERSION__: string;
declare const __VITE_BUILD_DATE__: string;
declare const __VITE_SERVER_URL__: string;

interface ImportMetaEnv {
  /** "true" shows the debug overlay in production builds (dev builds always show it) */
  readonly VITE_DEBUG?: string;
  /** "true" / "false": list unconsulted entries locked (default: dev only) – PLAN Phase 4 */
  readonly VITE_SHOW_LOCKED_ENTRIES?: string;
  /** AR scene strategy baked into the build: "rebuild" | "persistent" (Phase 6, ar/index.ts) */
  readonly VITE_AR_STRATEGY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
