/**
 * Rules of the instance's API (server/api) that its TypeScript callers – the editor app, the MCP server, the osct CLI –
 * share: ids, environment names, the Library's file kinds, how a plugin source's registrations are read from its text.
 * Each one copies a PHP constant; `mcp/test/php-rules.test.ts` reads the PHP and fails on a difference.
 * Not content: `shared/api/` is outside the content schema lock (RULES #10).
 */
import { ASSET_TYPES } from "../types/game-config";

/** An id or reference in the editor API's paths and bodies – books, spreads, entries, targets, entities (`Editor::ID`) */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * An environment's name (`ContentStore::ENV`): the instance's ENV, a publish's `env`, the content route and the CDN's
 * `<env>/latest.json` – lower-case letters, digits and -, a letter first, at most 32
 */
export const ENV_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** The kinds of a Library file (`Assets::KINDS`): the content contract's asset types and `shader`, a source file a plugin loads */
export const ASSET_KINDS = [...ASSET_TYPES, "shader"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** The file extensions of each kind, with the dot (`Assets::KINDS`, extension → kind) */
export const ASSET_KIND_EXTENSIONS: Record<AssetKind, readonly string[]> = {
  glb: [".glb"],
  gltf: [".gltf"],
  video: [".mp4", ".webm", ".mov"],
  image: [".jpg", ".jpeg", ".png", ".webp"],
  audio: [".mp3", ".m4a", ".ogg", ".wav"],
  shader: [".glsl", ".frag", ".vert", ".wgsl"],
};

/** What a plugin source registers, by kind → the plugin API's function (`Plugins::REGISTERS`) */
export const PLUGIN_REGISTER_FUNCTIONS = {
  components: "registerComponent",
  layers: "registerLayer",
  nodeTypes: "registerNodeType",
  passes: "registerPass",
  materials: "registerMaterial",
  textures: "registerTexture",
} as const;

/** The types a plugin source registers, by kind, each once in the order of the source */
export type SourceTypes = Record<keyof typeof PLUGIN_REGISTER_FUNCTIONS, string[]>;

/**
 * The types a plugin source registers, read from its text – the first argument of each `api.register…("type", …)` call
 * with any quote (`Plugins::registers`), not by running it: a Code tab source is the editor's sandbox
 */
export function pluginTypes(source: string): SourceTypes {
  const scan = (fn: string) => [...new Set([...source.matchAll(new RegExp(`${fn}\\s*\\(\\s*["'\`]([a-zA-Z0-9]+)["'\`]`, "g"))].map(match => match[1]))];
  const kinds = Object.keys(PLUGIN_REGISTER_FUNCTIONS) as (keyof SourceTypes)[];
  return Object.fromEntries(kinds.map(kind => [kind, scan(PLUGIN_REGISTER_FUNCTIONS[kind])])) as SourceTypes;
}
