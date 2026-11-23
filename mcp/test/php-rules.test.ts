// The PHP API copies rules of the content contract (shared/) and of its own TypeScript callers (shared/api/rules.ts):
// node types, components, formats, patterns, the plugin-type scanner. PHP reads its constants here (the classes
// loaded as the API loads them) and every copy is compared with shared/ – a difference fails. Skipped with a message
// when php is not on the path; CI has it.
import { CREDITS_BATCH_MAX, CREDITS_MAX, SCENE_PAGE_MM, SCENE_PRESETS, SCENE_SURFACES_MAX, SCENE_WALL_MM, SURFACE_REFERENCE_FITS } from "../../shared/api/editor";
import { IMAGE_MAX_PIXELS, IMAGE_MAX_SIDE, IMAGE_WEBP_QUALITY } from "../../shared/api/images";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_NODE_DEPTH } from "../../shared/guards/game-config";
import { MEDIA_LEVELS } from "../../shared/types/media-levels";
import { BEHAVIOUR_ACTIONS, BEHAVIOUR_NODE_ACTIONS, BEHAVIOUR_NODE_EVENTS, RULE_HOMES } from "../../shared/types/behaviour";
import { parseAddress } from "../../shared/types/address";
import { BEHAVIOUR_SCOPES } from "../../shared/types/behaviour";
import { VARIABLE_TYPES } from "../../shared/types/variables";
import { APPEARANCE_TYPES, MOMENTS } from "../../shared/types/appearance";
import { CONTENT_BUILD } from "../../shared/types/content-manifest";
import { ENTRY_CATEGORIES } from "../../shared/types/entry";
import { ENVIRONMENT_WORLDS, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS } from "../../shared/types/environment";
import {
  COMPONENT_TYPE_PATTERN,
  RECOGNITION_MODES,
  COMPONENT_TYPES,
  ENTITY_TYPES,
  MATERIAL_TYPE_PATTERN,
  NODE_TYPE_PATTERN,
  PASS_TYPES,
  PLUGIN_ID_PATTERN,
  CONTENT_SCHEMA_VERSION,
  OLDEST_READABLE_SCHEMA_MAJOR,
} from "../../shared/types/game-config";
import {
  ASSET_KIND_EXTENSIONS,
  ASSET_KINDS,
  BODY_MAX_LENGTH,
  ENTRY_TAGS,
  ENV_NAME,
  ID_PATTERN,
  MAX_TARGETS_PER_SCENE,
  isLinkUrl,
  PLUGIN_REGISTER_FUNCTIONS,
  pluginTypes,
  TEXT_MAX_LENGTH,
} from "../../shared/api/rules";
import { DEFAULT_TITLE } from "../../shared/api/content-store";
import { EXPERIENCE_SLUG, isReservedPath, RESERVED_PATHS } from "../../shared/api/experience-paths";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../server/api/src");

const hasPhp = spawnSync("php", ["--version"], { encoding: "utf8" }).status === 0;
if (!hasPhp) console.warn("php-rules: php is not on the path – the PHP API's copies of shared/ rules are not compared (install PHP 8.1+ to run it)");

/** Plugin sources the scanners must read alike: every quote, spacing, repeats, and calls that register nothing */
const SOURCES = [
  `export const register = (api) => {\n  api.registerLayer("tint", SPEC, { glsl });\n  api.registerComponent('spin', SPEC2, apply);\n  api.registerComponent(\`spin\`, SPEC2, apply);\n};`,
  `api.registerNodeType( "sparkle2", S, b);\napi.registerPass ('scan', S, f);\napi.registerMaterial("water", S, m);\napi.registerTexture(\`caustics\`, S, t);\napi.registerAppearance( 'softFade', S, f);`,
  `api.registerComponent(name, S, a); api.registerLayer("with-dash", S); api.registerPass("", S);`,
  "nothing here",
];

/** Experience ids both sides must judge alike as the site's own paths (#343) */
const SLUGS = ["osct", "demo", "editor", "Editor", "API", "scene", "x", "workbox-1a2b.js", "my-book", "docs", "manifest.webmanifest"];

/** Links an entry may or may not point to: both sides must judge them alike */
const LINKS = ["https://example.org/a?b=1", "http://example.org", "HTTPS://EXAMPLE.ORG", "javascript:alert(1)", "https://", "https://exa mple.org", "mailto:a@b.c", "ftp://example.org", "/relative", "example.org"];

/** Addresses both sides must judge alike (shared/types/address.ts – Logic::GOTO_ADDRESS, NODE_ADDRESS) */
const ADDRESSES = ["scene:cover", "scene:a-b_1", "scene:", "scene:a/b", "target:door", "target:door/the hint", "target:door/a/b", "toon:x", "cover", "scene:a b"];

/** Conditions of 2.19–4.x and the expressions Migration5 writes – scripts/test/convert-content-5.test.ts has the same cases */
const CONDITIONS: Array<[unknown, unknown]> = [
  [{ hasKey: true }, { expression: "hasKey == true", approximate: [] }],
  [{ hasKey: true, tries: 3 }, { expression: "hasKey == true && tries == 3", approximate: [] }],
  [{ any: { mood: "calm", tries: { not: 2.5 } } }, { expression: 'mood == "calm" || tries != 2.5', approximate: [] }],
  [{ said: 'a "quote" \\ here' }, { expression: 'said == "a \\"quote\\" \\\\ here"', approximate: [] }],
  [{ doorOpen: null, lamp: { not: null } }, { expression: "!doorOpen && lamp", approximate: ["doorOpen", "lamp"] }],
  [{ n: -0.5, f: false }, { expression: "n == -0.5 && f == false", approximate: [] }],
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
      'EXPERIENCE_PATHS' => ['reserved' => Experiences::RESERVED, 'slug' => Experiences::SLUG,
        'isReserved' => array_map(static fn(string $id): bool => Experiences::isReserved($id), $input['slugs'])],
      'ENTITY_TYPES' => Editor::ENTITY_TYPES,
      'COMPONENT_TYPES' => Editor::COMPONENT_TYPES,
      'PLUGIN_NODE_TYPE' => Editor::PLUGIN_NODE_TYPE,
      'MATERIAL_TYPE' => Editor::MATERIAL_TYPE,
      'ENTRY_CATEGORIES' => Editor::ENTRY_CATEGORIES,
      'CONTENT_SCHEMA' => [Editor::CONTENT_SCHEMA, Editor::CONTENT_SCHEMA_MAJOR],
      'TEXTS' => ['text' => ExperienceTexts::TEXT_MAX_LENGTH, 'body' => ExperienceTexts::BODY_MAX_LENGTH, 'tags' => ExperienceTexts::TAGS_MAX, 'tag' => ExperienceTexts::TAG_MAX_LENGTH],
      'links' => array_map(static fn(string $url): bool => ExperienceTexts::isLinkUrl($url), $input['links']),
      'MAX_NODE_DEPTH' => Editor::MAX_NODE_DEPTH,
      'MAX_TARGETS_PER_SCENE' => Deliveries::MAX_TARGETS_PER_SCENE,
      'SCENES' => ['presets' => Scenes::PRESETS, 'pageMm' => Scenes::PAGE_MM, 'wallMm' => Scenes::WALL_MM, 'surfacesMax' => Scenes::SURFACES_MAX, 'referenceFits' => SurfaceReferences::FITS],
      'PASS_TYPES' => Experiences::PASS_TYPES,
      'MOMENTS' => Experiences::MOMENTS,
      'RECOGNITION_MODES' => Experiences::RECOGNITION_MODES,
      'APPEARANCE_TYPES' => Experiences::APPEARANCE_TYPES,
      'PLUGIN_PASS_TYPE' => Experiences::PLUGIN_PASS_TYPE,
      'WORLDS' => Experiences::WORLDS,
      'WORLD_MODEL_EXTENSIONS' => Experiences::WORLD_MODEL_EXTENSIONS,
      'SKY_IMAGE_EXTENSIONS' => Experiences::SKY_IMAGE_EXTENSIONS,
      'ENV' => ContentStore::ENV,
      'BUILD' => ContentStore::BUILD,
      'TITLE' => (new ReflectionClassConstant('Config', 'DEFAULTS'))->getValue()['TITLE'],
      'PLUGIN_ID' => Plugins::ID,
      'ASSET_KINDS' => Assets::KINDS,
      'CREDITS' => [Assets::CREDITS_BATCH_MAX, Assets::CREDITS_MAX],
      'MEDIA_LEVELS' => Editor::MEDIA_LEVELS,
      'IMAGE' => ['maxSide' => Assets::IMAGE_MAX_SIDE, 'quality' => Assets::IMAGE_WEBP_QUALITY, 'maxPixels' => Assets::IMAGE_MAX_PIXELS],
      'VARIABLES' => [Logic::VARIABLE_TYPES, Logic::SCOPES],
      'LOGIC' => ['actions' => Logic::ACTIONS, 'nodeActions' => Logic::NODE_ACTIONS, 'nodeEvents' => Logic::NODE_EVENTS, 'homes' => Logic::HOMES,
        'goto' => array_map(static fn(string $a): bool => (bool) preg_match('#' . Logic::GOTO_ADDRESS . '#', $a), $input['addresses']),
        'node' => array_map(static fn(string $a): bool => (bool) preg_match('#' . Logic::NODE_ADDRESS . '#s', $a), $input['addresses'])],
      'conditions' => array_map(static fn(mixed $when): array => Migration5::expression(json_decode(json_encode($when))), $input['conditions']),
      'REGISTERS' => $registers,
      'registers' => array_map(static fn(string $source): array => Plugins::registers($source), $input['sources']),
    ], JSON_THROW_ON_ERROR);
  `;
  const run = spawnSync("php", ["-r", code], { input: JSON.stringify({ src: SRC, slugs: SLUGS, sources: SOURCES, links: LINKS, addresses: ADDRESSES, conditions: CONDITIONS.map(([when]) => when) }), encoding: "utf8" });
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
  });

  it("the experience's texts: the limits and which links an entry may point to (ExperienceTexts)", () => {
    expect(php.TEXTS).toEqual({ text: TEXT_MAX_LENGTH, body: BODY_MAX_LENGTH, tags: ENTRY_TAGS.max, tag: ENTRY_TAGS.length });
    expect(php.links).toEqual(LINKS.map(isLinkUrl));
    expect(LINKS.map(isLinkUrl)).toEqual([true, true, true, false, false, false, false, false, false, false]);
  });

  it("rules without code: the verbs, the node events, the homes and the addresses (Logic, content schema 5.0)", () => {
    expect(php.VARIABLES).toEqual([[...VARIABLE_TYPES], [...BEHAVIOUR_SCOPES]]);
    expect(php.LOGIC).toMatchObject({ actions: [...BEHAVIOUR_ACTIONS], nodeActions: [...BEHAVIOUR_NODE_ACTIONS], nodeEvents: [...BEHAVIOUR_NODE_EVENTS], homes: [...RULE_HOMES] });
    const logic = php.LOGIC as { goto: boolean[]; node: boolean[] };
    expect(logic.goto).toEqual(ADDRESSES.map(a => parseAddress(a)?.scheme === "scene"));
    expect(logic.node).toEqual(ADDRESSES.map(a => parseAddress(a)?.scheme === "target"));
  });

  it("the migration to 5.0 writes the expressions convert-content-5 writes (Migration5::expression)", () => {
    expect(php.conditions).toEqual(CONDITIONS.map(([, expected]) => expected));
  });

  it("the content schema the editor reads and the draft writes (Editor::CONTENT_SCHEMA, #319)", () => {
    expect(php.CONTENT_SCHEMA).toEqual([CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR]);
    expect(Number(CONTENT_SCHEMA_VERSION.split(".")[0])).toBe(OLDEST_READABLE_SCHEMA_MAJOR);
  });

  it("the patterns: ids, a plugin's node type and material, a plugin id, a build, an environment's name", () => {
    expect(whole(php.ID)).toBe(ID_PATTERN.source);
    expect(whole(php.PLUGIN_NODE_TYPE)).toBe(NODE_TYPE_PATTERN.source);
    expect(whole(php.MATERIAL_TYPE)).toBe(MATERIAL_TYPE_PATTERN.source);
    // A plugin's pass is named like a component: its spec is checked with componentSpecProblems
    expect(whole(php.PLUGIN_PASS_TYPE)).toBe(COMPONENT_TYPE_PATTERN.source);
    expect(whole(php.PLUGIN_ID)).toBe(PLUGIN_ID_PATTERN.source);
    expect(php.BUILD).toBe(`/${CONTENT_BUILD.source}/`);
    expect(whole(php.ENV)).toBe(ENV_NAME.source);
  });

  it("experience paths: the site's own paths and a new experience's slug (Experiences – shared/api/experience-paths.ts, #343)", () => {
    const paths = php.EXPERIENCE_PATHS as { reserved: string[]; slug: string; isReserved: boolean[] };
    expect(paths.reserved).toEqual([...RESERVED_PATHS]);
    expect(whole(paths.slug)).toBe(EXPERIENCE_SLUG.source);
    expect(paths.isReserved).toEqual(SLUGS.map(isReservedPath));
  });

  it("the store layout's default title (Config TITLE, shared/api/content-store.ts – #87)", () => {
    expect(php.TITLE).toBe(DEFAULT_TITLE);
  });

  it("passes (the built-in list), the appearance's moments and looks, and the environment (Experiences)", () => {
    expect(php.PASS_TYPES).toEqual([...PASS_TYPES]);
    expect(php.MOMENTS).toEqual([...MOMENTS]);
    expect(php.RECOGNITION_MODES).toEqual([...RECOGNITION_MODES]);
    expect(php.APPEARANCE_TYPES).toEqual([...APPEARANCE_TYPES]);
    expect(php.WORLDS).toEqual([...ENVIRONMENT_WORLDS]);
    expect(php.WORLD_MODEL_EXTENSIONS).toEqual([...WORLD_MODEL_EXTENSIONS]);
    expect(php.SKY_IMAGE_EXTENSIONS).toEqual([...SKY_IMAGE_EXTENSIONS]);
  });

  it("scenes (schema 3.0, Scenes): the presets, a page's and a wall's size, the most surfaces, a reference's fits (#314)", () => {
    const scenes = php.SCENES as { presets: string[]; pageMm: unknown; wallMm: unknown; surfacesMax: number; referenceFits: string[] };
    expect(scenes.referenceFits).toEqual([...SURFACE_REFERENCE_FITS]);
    expect(scenes.presets).toEqual([...SCENE_PRESETS]);
    expect(scenes.pageMm).toEqual(SCENE_PAGE_MM);
    expect(scenes.wallMm).toEqual(SCENE_WALL_MM);
    expect(scenes.surfacesMax).toBe(SCENE_SURFACES_MAX);
  });

  it("the Library's file kinds and their extensions (Assets::KINDS)", () => {
    const byKind: Record<string, string[]> = {};
    for (const [extension, kind] of Object.entries(php.ASSET_KINDS as Record<string, string>)) (byKind[kind] ??= []).push(`.${extension}`);
    expect(byKind).toEqual(ASSET_KIND_EXTENSIONS);
    expect(Object.keys(byKind).sort()).toEqual([...ASSET_KINDS].sort());
  });

  it("the most targets switched on per scene (RULES #3, Deliveries::MAX_TARGETS_PER_SCENE, #322)", () => {
    expect(php.MAX_TARGETS_PER_SCENE).toBe(MAX_TARGETS_PER_SCENE);
  });

  it("the credits limits (#277, Assets::CREDITS_*)", () => {
    expect(php.CREDITS).toEqual([CREDITS_BATCH_MAX, CREDITS_MAX]);
  });

  it("the media levels per kind (#331, Editor::MEDIA_LEVELS, content schema 4.3)", () => {
    expect(php.MEDIA_LEVELS).toEqual(MEDIA_LEVELS);
  });

  it("the image rule (#298, Assets::IMAGE_*): the longest side per use, the WebP quality, the pixel limit", () => {
    expect(php.IMAGE).toEqual({ maxSide: IMAGE_MAX_SIDE, quality: IMAGE_WEBP_QUALITY, maxPixels: IMAGE_MAX_PIXELS });
  });

  it("the plugin-type scanner: the same functions, the same types read from the same sources (Plugins::registers)", () => {
    expect(php.REGISTERS).toEqual(PLUGIN_REGISTER_FUNCTIONS);
    expect(php.registers).toEqual(SOURCES.map(pluginTypes));
    expect(pluginTypes(SOURCES[2])).toEqual({ components: [], layers: [], nodeTypes: [], passes: [], materials: [], textures: [], appearances: [] });
  });
});
