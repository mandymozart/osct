/**
 * three's declarations the plugin type check reaches, as the editor's bundle carries them for Monaco (`monaco.ts`): a glob
 * key below `node_modules/@types/three/` → the file's text. The patterns are `isCheckedThreeType`'s
 * (`shared/plugins/type-check.ts`) – a glob must be written out here; a test holds the two to the same files.
 */
export const THREE_TYPES = import.meta.glob(
  [
    "../../../node_modules/@types/three/index.d.ts",
    "../../../node_modules/@types/three/src/**/*.d.ts",
    "!../../../node_modules/@types/three/src/nodes/**",
    "!../../../node_modules/@types/three/src/**/nodes/**",
    "!../../../node_modules/@types/three/src/**/webgpu/**",
    "!../../../node_modules/@types/three/src/renderers/common/**",
    "!../../../node_modules/@types/three/src/renderers/webgl-fallback/**",
    "!../../../node_modules/@types/three/src/Three.TSL.d.ts",
    "!../../../node_modules/@types/three/src/Three.WebGPU*.d.ts",
    "../../../node_modules/@types/three/examples/jsm/postprocessing/Pass.d.ts",
    "../../../node_modules/@types/three/examples/jsm/postprocessing/ShaderPass.d.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** The glob's files by their path below `@types/three/` (what `pluginCheckLibs` takes) */
export const threeTypesByPath = (): Record<string, string> =>
  Object.fromEntries(Object.entries(THREE_TYPES).map(([key, text]) => [key.slice(key.indexOf("@types/three/") + "@types/three/".length), text]));
