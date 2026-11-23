/**
 * A plugin's shader files are strings to TypeScript (#352): `import WATER from "./water.frag"` – the content build's and
 * the editor's bundle load them with esbuild's text loader. The content build's type check takes this file along; the
 * editor's Monaco and a plugin's download carry the same declarations (`editor/src/lib/plugins/code-editor.ts`
 * SHADER_MODULES).
 */
declare module "*.frag" {
  const text: string;
  export default text;
}
declare module "*.vert" {
  const text: string;
  export default text;
}
declare module "*.glsl" {
  const text: string;
  export default text;
}
declare module "*.wgsl" {
  const text: string;
  export default text;
}
