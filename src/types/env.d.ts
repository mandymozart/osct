/// <reference types="vite/client" />

declare const __VITE_APP_VERSION__: string;
declare const __VITE_BUILD_DATE__: string;
declare const __VITE_FOO__: string;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_DATE: string;
  readonly VITE_FOO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
