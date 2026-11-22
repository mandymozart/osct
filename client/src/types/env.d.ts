/// <reference types="vite/client" />

declare const __VITE_APP_VERSION__: string;
declare const __VITE_BUILD_DATE__: string;
declare const __VITE_SERVER_URL__: string;

interface ImportMetaEnv {
  /** "true" shows the debug overlay in production builds (dev builds always show it) */
  readonly VITE_DEBUG?: string;
  /**
   * Content CDN URL of the environment (`https://…/osct/staging` – `<pull zone>/<title>/<env>`): the app loads the
   * experience's `latest.json` and current content version from `<base>/<experience>/` (docs/content-cdn.md, #87) and
   * the build reads no content; unset = the content bundled with the app (dev server, tests)
   */
  readonly VITE_CONTENT_BASE_URL?: string;
  /**
   * The instance's default experience – the one an address without an experience opens (`/scene/…`, #343 –
   * utils/experience-path.ts); required
   * with VITE_CONTENT_BASE_URL
   */
  readonly VITE_EXPERIENCE?: string;
  /**
   * Font folder of the design font (ABC Areal – `utils/font-face-html.ts`); read by the build only. Unset = the shared
   * folder on the CDN, empty = no web font (Arial)
   */
  readonly VITE_FONT_BASE_URL?: string;
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
