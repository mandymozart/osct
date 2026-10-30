// The PHP API copies rules of the content contract (shared/) and of its own TypeScript callers (shared/api/rules.ts):
// node types, components, formats, patterns, the plugin-type scanner. PHP reads its constants here (the classes
// loaded as the API loads them) and every copy is compared with shared/ – a difference fails. Skipped with a message
// when php is not on the path; CI has it.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_NODE_DEPTH } from "../../shared/guards/game-config";
import { CONTENT_BUILD } from "../../shared/types/content-manifest";
import { ENTRY_CATEGORIES } from "../../shared/types/entry";
import { ENVIRONMENT_WORLDS, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS } from "../../shared/types/environment";
import {
  COMPONENT_TYPES,
  ENTITY_TYPES,
  MATERIAL_TYPE_PATTERN,
  NODE_TYPE_PATTERN,
  PASS_TYPES,
  PLUGIN_ID_PATTERN,
  PRINT_SURFACES,
  SPREAD_FORMATS,
} from "../../shared/types/game-config";
import { ASSET_KIND_EXTENSIONS, ASSET_KINDS, ENV_NAME, ID_PATTERN, PLUGIN_REGISTER_FUNCTIONS, pluginTypes } from "../../shared/api/rules";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../server/api/src");

const hasPhp = spawnSync("php", ["--version"], { encoding: "utf8" }).status === 0;
if (!hasPhp) console.warn("php-rules: php is not on the path – the PHP API's copies of shared/ rules are not compared (install PHP 8.1+ to run it)");

/** Plugin sources the scanners must read alike: every quote, spacing, repeats, and calls that register nothing */
const SOURCES = [
  `export const register = (api) => {\n  api.registerLayer("tint", SPEC, { glsl });\n  api.registerComponent('spin', SPEC2, apply);\n  api.registerComponent(\`spin\`, SPEC2, apply);\n};`,
  `api.registerNodeType( "sparkle2", S, b);\napi.registerPass ('scan', S, f);\napi.registerMaterial("water", S, m);\napi.registerTexture(\`caustics\`, S, t);`,
  `api.registerComponent(name, S, a); api.registerLayer("with-dash", S); api.registerPass("", S);`,
  "nothing here",
];

/** The PHP API's constants, read by PHP itself, and what `Plugins::registers` reads from SOURCES */
function readPhp(): Record<string, unknown> {
  const code = `
    $input = json_decode(stream_get_contents(STDIN), true);
    spl_autoload_register(static function (string $class) use ($input): void {
      $file = $input['src'] . "/$class.php";
      if (is_file($file)) require $file;
    });
    $registers = (new ReflectionClassConstant('Plugins', 'REGISTERS'))->getValue();
    echo json_encode([
      'ID' => Editor::ID,
      'ENTITY_TYPES' => Editor::ENTITY_TYPES,
      'COMPONENT_TYPES' => Editor::COMPONENT_TYPES,
      'PLUGIN_NODE_TYPE' => Editor::PLUGIN_NODE_TYPE,
      'MATERIAL_TYPE' => Editor::MATERIAL_TYPE,
      'ENTRY_CATEGORIES' => Editor::ENTRY_CATEGORIES,
      'MAX_NODE_DEPTH' => Editor::MAX_NODE_DEPTH,
      'PRINT_SURFACES' => Editor::PRINT_SURFACES,
      'FORMATS' => Books::FORMATS,
      'PASS_TYPES' => Books::PASS_TYPES,
      'WORLDS' => Books::WORLDS,
      'WORLD_MODEL_EXTENSIONS' => Books::WORLD_MODEL_EXTENSIONS,
      'SKY_IMAGE_EXTENSIONS' => Books::SKY_IMAGE_EXTENSIONS,
      'ENV' => ContentStore::ENV,
      'BUILD' => ContentStore::BUILD,
      'PLUGIN_ID' => Plugins::ID,
      'ASSET_KINDS' => Assets::KINDS,
      'REGISTERS' => $registers,
      'registers' => array_map(static fn(string $source): array => Plugins::registers($source), $input['sources']),
    ], JSON_THROW_ON_ERROR);
  `;
  const run = spawnSync("php", ["-r", code], { input: JSON.stringify({ src: SRC, sources: SOURCES }), encoding: "utf8" });
  if (run.status !== 0) throw new Error(`php failed: ${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

/** A PHP pattern without delimiters as a whole-string JS pattern's source */
const whole = (pattern: unknown) => `^${String(pattern)}$`;

describe.skipIf(!hasPhp)("the PHP API's copies of shared/ rules", () => {
  const php = hasPhp ? readPhp() : {};

  it("node types, components, entry categories, the node depth (Editor)", () => {
    expect(php.ENTITY_TYPES).toEqual([...ENTITY_TYPES]);
    expect(php.COMPONENT_TYPES).toEqual([...COMPONENT_TYPES]);
    expect(php.ENTRY_CATEGORIES).toEqual([...ENTRY_CATEGORIES]);
    expect(php.MAX_NODE_DEPTH).toBe(MAX_NODE_DEPTH);
    expect(php.PRINT_SURFACES).toEqual([...PRINT_SURFACES]);
  });

  it("the patterns: ids, a plugin's node type and material, a plugin id, a build, an environment's name", () => {
    expect(whole(php.ID)).toBe(ID_PATTERN.source);
    expect(whole(php.PLUGIN_NODE_TYPE)).toBe(NODE_TYPE_PATTERN.source);
    expect(whole(php.MATERIAL_TYPE)).toBe(MATERIAL_TYPE_PATTERN.source);
    expect(whole(php.PLUGIN_ID)).toBe(PLUGIN_ID_PATTERN.source);
    expect(php.BUILD).toBe(`/${CONTENT_BUILD.source}/`);
    expect(whole(php.ENV)).toBe(ENV_NAME.source);
  });

  it("spread formats, passes and the environment (Books)", () => {
    expect(php.FORMATS).toEqual([...SPREAD_FORMATS]);
    expect(php.PASS_TYPES).toEqual([...PASS_TYPES]);
    expect(php.WORLDS).toEqual([...ENVIRONMENT_WORLDS]);
    expect(php.WORLD_MODEL_EXTENSIONS).toEqual([...WORLD_MODEL_EXTENSIONS]);
    expect(php.SKY_IMAGE_EXTENSIONS).toEqual([...SKY_IMAGE_EXTENSIONS]);
  });

  it("the Library's file kinds and their extensions (Assets::KINDS)", () => {
    const byKind: Record<string, string[]> = {};
    for (const [extension, kind] of Object.entries(php.ASSET_KINDS as Record<string, string>)) (byKind[kind] ??= []).push(`.${extension}`);
    expect(byKind).toEqual(ASSET_KIND_EXTENSIONS);
    expect(Object.keys(byKind).sort()).toEqual([...ASSET_KINDS].sort());
  });

  it("the plugin-type scanner: the same functions, the same types read from the same sources (Plugins::registers)", () => {
    expect(php.REGISTERS).toEqual(PLUGIN_REGISTER_FUNCTIONS);
    expect(php.registers).toEqual(SOURCES.map(pluginTypes));
    expect(pluginTypes(SOURCES[2])).toEqual({ components: [], layers: [], nodeTypes: [], passes: [], materials: [], textures: [] });
  });
});
