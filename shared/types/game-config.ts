/**
 * Game configuration contract – the shape of `game.config.json`.
 *
 * Written by the content build (`scripts/`), read by the engine (`engine/src/content/game-config.ts`), which the reader
 * and the editor load it with.
 * Defined once here (RULES #13). `*Data` = data loaded from JSON; the app maps it to its own model.
 * Runtime checks: `shared/guards/game-config.ts`.
 */

import type { EntryCategory } from "./entry";
import type { FilterData } from "./filters";
import type { ComponentData } from "./components";
import type { BookAppearance } from "./appearance";
import type { EnvironmentData } from "./environment";
import type { LightData } from "./lights";
import type { TextureSetData } from "./textures";
import type { PassData } from "./passes";
import type { PluginData } from "./plugins";
import type { MaterialData } from "./materials";
import type { SubtitleData } from "./subtitles";

export * from "./filters";
export * from "./placement";
export * from "./components";
export * from "./behaviour";
export * from "./lights";
export * from "./textures";
export * from "./passes";
export * from "./appearance";
export * from "./plugins";
export * from "./node-types";
export * from "./subtitles";
export * from "./materials";

/**
 * Node types of an entity (extensible, RULES #7): what is seen – a model, a video or image plane, a line of text,
 * a light – or a `group` that only holds children. Links are entries, not entities.
 * The guard lets a node type it does not know pass (the engine renders nothing for it but keeps its children), so
 * a later type is a MINOR addition; the content build and the editor's API still refuse one – unless a plugin
 * registers it (schema 2.13, `./node-types.ts`): ENTITY_TYPES stays the built-in list.
 */
export const ENTITY_TYPES = ["group", "model", "video", "image", "text", "light"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
/** A node's type: a built-in one, or one a plugin registers (`registerNodeType`, camelCase – `./node-types.ts`) */
export type NodeType = EntityType | (string & {});

export const ASSET_TYPES = ["glb", "gltf", "video", "image", "audio"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Content schema version `MAJOR.MINOR`: the version of this contract (shared/), the only compatibility rule
 * between content and app (RULES #10). The app version a content build was made with is information only.
 * - MAJOR: a change an older app cannot read – a new required field, a renamed or removed field, a changed
 *   type, a new enum value (asset type, category, step action, spread format). The app refuses content of a
 *   newer MAJOR at startup; it reads every MAJOR from `OLDEST_READABLE_SCHEMA_MAJOR` on as it is (so far the one
 *   MAJOR, the node tree, only added).
 * - MINOR: an addition an older app of the same MAJOR still loads (RULES #10): what it does not know of a kind it knows
 *   is skipped with a warning (`engine/src/content/forward-compatible.ts`), never refused. Apps before #220 refused
 *   some of it (2.17, 2.19 and 2.21 below). The MINORs so far: a new optional field (the book's `environment` since 2.8,
 *   its world and sky assets since 2.10), and since 2.6 a new node type (the guard lets an unknown one pass; a 2.5 app
 *   refuses it), and since 2.9 a new pass parameter
 *   (the grade's `reach`: the guard ignores a parameter it does not know; a 2.8 app refuses it), and since 2.11 the
 *   content manifest's `book`, and since 2.12 a node's `name`, and since 2.13 a plugin's node type
 *   (`registerNodeType`, its parameters in the node's `params`; a 2.12 app renders nothing for it and keeps its
 *   children), and since 2.14 a plugin's recorded `registered` (the specs of what it registers; a 2.13 app ignores
 *   it), and since 2.15 a parameter spec's optional `label` (the words the editor's row shows, plugin API 1.3 – in the
 *   content only inside a plugin's recorded specs; a 2.14 app ignores it), and 2.16 adds nothing to the content (shared/
 *   imports its types type-only, verbatimModuleSyntax – #176), and since 2.17 a node's optional `material` (a plugin's
 *   `registerMaterial`, plugin API 1.4 – a 2.16 app keeps the node's own material), and a plugin's recorded materials and
 *   textures (a 2.16 app ignores them) – but a recorded spec with a parameter of the new kind `texture` is refused by a
 *   2.16 guard (it knows no such kind): a book whose plugins take textures needs a 2.17 app, and 2.18 adds nothing to the
 *   content (plugin API 1.5: `api.loadText`, a declared plugin built against it carries `api: "1.5"`), and since 2.19 the
 *   built-in component `behaviour` (rules without code, `./behaviour.ts`) – a 2.18 guard refuses a node that carries one
 *   (it knows no such component, as a 2.16 guard a `texture` parameter): a book with behaviours needs a 2.19 app, and 2.20
 *   adds nothing to the content (plugin API 1.6: `api.feedback`, a GPU feedback buffer, and `api.shadertoy` – a declared
 *   plugin built against it carries `api: "1.6"`; a 2.19 app's engine has no `api.feedback`, so a build that calls it
 *   fails and its node renders nothing), and since 2.21 a `passes` entry may name a pass a plugin of the book registers
 *   (`registerPass`, its parameters checked against the recorded spec – `./passes.ts`) – a 2.20 guard refuses a pass type
 *   it does not know: a book whose spreads name a plugin's pass needs a 2.21 app, and since 2.22 a pass's optional `enabled`
 *   (`false` = off: it keeps its place and values, the chain skips it, #233) – a 2.21 app skips the field as an unknown
 *   parameter (a 2.20 one ignores it) and runs the pass, and 2.23 changes no field but what an entry's `body` means: Markdown
 *   (paragraphs, emphasis, strong, links) with the book's variables in braces (`../text/entry-text.ts`) – plain text is
 *   valid Markdown and reads as before; an older app shows the source as it is, the stars, brackets and braces included,
 *   and 2.24 adds nothing to the content (shared/ tidied: one `isObject`, one camelCase name pattern, unused types
 *   removed – #214), and since 2.25 the configuration's `tutorial` is optional: the reader owns its onboarding (its steps
 *   and their texts in its translations, #236) and reads none from the content; the content build and a publish still
 *   write the steps older apps require (`../compat/tutorial.ts`) until the next MAJOR – and the book's optional
 *   `sourceOfTruth` (print | digital: which side the spreads come from, #238; an older app ignores it), and since 2.26 a
 *   target's optional `enabled` (`false` = switched off, #249: the reader leaves the target and its entry out until it is
 *   switched on; a 2.25 app ignores the field and shows both), and since 2.27 a model asset's optional `textures`
 *   (#260: its maps in several sizes – the file carries the smallest, the app swaps in the size the reader's texture
 *   quality asks for; a 2.26 app ignores the field and shows the model with the map in its file), and since 2.28 the
 *   parameter kind `model` (plugin API 1.7, `./components.ts`, #263: a model file a plugin's code loads with
 *   `api.loadModel`) – an older app skips a component's, a node type's or a material's parameter of that kind with a
 *   warning, as every parameter kind it does not know, and since 2.29 the
 *   book's optional `appearance` (the look an entity appears with on reveal, found and lost – a built-in one with its
 *   values or a plugin's, `./appearance.ts`; an older app ignores the field and plays its own animation) with a plugin's
 *   recorded `registered.appearances` (plugin API 1.8), and since 2.30 the built-in components `reveal`, `found` and `lost` on
 *   an entity's root node (its own look for a moment, in place of the book's – `./appearance.ts`; an older app skips the
 *   components with a warning and plays the book's look, or its own animation), and since 2.31 the configuration's
 *   optional `subtitles` (#257: the WebVTT files of a video, one per language – `./subtitles.ts`; an older app ignores
 *   the field and plays the video without a subtitle line), and since 2.32 a spread's optional `matter` (#296: `front` or
 *   `back` – a double page without printed numbers before page 1 or after the last printed page, its pages internal; an
 *   older app ignores the field and shows the spread like any other, its pages as numbers), and since 2.33 the
 *   configuration's optional `credits` (#292: the credit line of a file the book uses, by the file's path or URL – written
 *   in the editor's Library; an older app ignores the field and has no image credits page), and since 2.34 an entry's
 *   optional `caption` (#289: the line under the entry's picture – an older app ignores the field and shows the picture
 *   without it), and since 2.35 scenes (#307, `agents/SCENES.md` phase 1): a spread's optional `surfaces` (its physical
 *   areas, each with a size in mm and a `label` as printed), `layout`, `group` and `label`, the configuration's optional
 *   `groups`, and an entry's optional `scene` and `surface` – **an entry's `scene` decides its spread, not its `page`**;
 *   writers keep writing `page` inside the scene's range (an older app ignores the new fields and places the entry by
 *   its page, as before), and since 2.36 a surface's optional `place` (#314: where it lies in the scene's coordinate
 *   system – a wall, a room's surfaces) and a target's optional `print.surfaceId` (the surface it is printed on, by id –
 *   it wins over `print.surface`'s side); an older app ignores both (the reader does not use either yet).
 * Every change in shared/ needs a bump: shared/content-schema.json locks the checksum of shared/ to this
 * version (scripts: `npm run schema:lock`, checked by a test).
 */
export const CONTENT_SCHEMA_VERSION = "2.36";
/** The oldest content schema MAJOR this contract still reads as it is (nothing it had was renamed or removed) */
export const OLDEST_READABLE_SCHEMA_MAJOR = 1;

export interface ContentSchema {
  major: number;
  minor: number;
}

/** `"1.0"` → { major: 1, minor: 0 }; null when it is not `MAJOR.MINOR` */
export const parseContentSchema = (value: unknown): ContentSchema | null => {
  const match = typeof value === "string" ? /^(\d+)\.(\d+)$/.exec(value) : null;
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
};

export interface ConfigurationVersion {
  /** App version the content build was made with – information only, never a reason to refuse */
  version: string;
  timestamp: string; // when the content build inputs last changed
  hash?: string; // checksum of the content build inputs (the content's own version)
  /** Content schema `MAJOR.MINOR` the content was built with (`CONTENT_SCHEMA_VERSION`) */
  schema: string;
}

export interface BookData {
  id: string; // e.g. "osct" – identifies the book (storage keys)
  title: string;
  author: string;
  /** Shown on the home page above "Start" (optional) */
  publisher?: string;
  /** Optional (schema 2.5): the post-processing passes of every spread without a list of its own (`./passes.ts`) */
  passes?: PassData[];
  /** Optional (schema 2.8; world and sky assets 2.9): the world around the reader and the onion sky (`./environment.ts`); none = the default */
  environment?: EnvironmentData;
  /** Optional (schema 2.29): the look an entity appears with on reveal, found and lost (`./appearance.ts`); none = the default look */
  appearance?: BookAppearance;
  /**
   * Optional (schema 2.25): the book's source of truth (#238) – `print` (print first: the printed book is the truth, its
   * spreads, pages and printed placements come from an import of the layout) or `digital` (digital first: the editor is
   * the truth, spreads are added and removed there). None = print (`sourceOfTruthOf`). The reader does not read it.
   */
  sourceOfTruth?: SourceOfTruth;
}

/** Where a book's spreads come from (`BookData.sourceOfTruth`, #238) */
export const SOURCES_OF_TRUTH = ["print", "digital"] as const;
export type SourceOfTruth = (typeof SOURCES_OF_TRUTH)[number];

/** A book's source of truth: `digital` only when it says so – none (or a value this contract does not know) is print */
export const sourceOfTruthOf = (book: Pick<BookData, "sourceOfTruth"> | null | undefined): SourceOfTruth =>
  book?.sourceOfTruth === "digital" ? "digital" : "print";

/**
 * What a spread is in the book: a double page (`spread`, the default), the front **cover** or the **back** cover – the
 * covers have no page number: the cover spread is page 0, the back spread the page after the last printed one.
 */
export const SPREAD_FORMATS = ["spread", "cover", "back"] as const;
export type SpreadFormat = (typeof SPREAD_FORMATS)[number];

/**
 * A double page without printed numbers (`SpreadData.matter`, #296): `front` matter lies between the cover and page 1,
 * `back` matter between the last printed page and the back cover. Its pages are internal – front matter counts down
 * to −1 (the sheet next to page 1 is −2…−1), back matter follows the last printed page – and never shown to readers.
 */
export const MATTERS = ["front", "back"] as const;
export type Matter = (typeof MATTERS)[number];

/** A spread's matter: `front` / `back` when it says so, null for a numbered spread or a cover */
export const matterOf = (spread: { format?: SpreadFormat; matter?: unknown }): Matter | null =>
  (!spread.format || spread.format === "spread") && (MATTERS as readonly unknown[]).includes(spread.matter) ? (spread.matter as Matter) : null;

/**
 * The sides a surface of a scene is known by (`SurfaceData.side`, schema 2.35): a page of a double page (`left`, `right`,
 * `middle` for a fold-out's third), a cover's `front` and `back`, a `wall`. A side this list does not know is a later
 * MINOR's – the guard lets any lower-case word pass, so adding one never breaks an older app.
 */
export const SURFACE_SIDES = ["left", "middle", "right", "front", "back", "wall"] as const;
export type SurfaceSide = (typeof SURFACE_SIDES)[number];
/** What the guard accepts as a surface's side: a known one or a later MINOR's (a lower-case word) */
export const SURFACE_SIDE_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Where a surface lies in its scene (schema 2.36, #314) – the **scene's coordinate system**, one for the whole scene, not
 * per surface: millimetres, the origin on the table at the middle of the scene's first row of surfaces (a double page:
 * its spine), +x to the right, +y up, +z towards the reader (three.js' axes). `x`, `y`, `z` are the surface's centre;
 * unrotated (`rx`, `ry`, `rz` 0, degrees, applied in that order) a surface lies flat, face up, its top edge away from the
 * reader (−z) – a page on the table. A wall ahead stands up: `rx` 90, its face towards the reader. A `fixed` scene
 * derives its surfaces' places (side by side in a row, flat) and ignores `place`; a `free` one places each surface by
 * it, a surface without one as in a fixed row.
 */
export interface SurfacePlace {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/**
 * One physical area of a scene (schema 2.35, #307): a left or right page, a cover, a wall. Its `label` is written exactly
 * as printed (`41`, `ii`, `Cover`) – free text, never arithmetic; none = nothing printed.
 */
export interface SurfaceData {
  /** Unique within its scene; an entry names it (`EntryData.surface`), a target's print too (`PrintPlacement.surfaceId`) */
  id: string;
  side: SurfaceSide | (string & {});
  widthMm: number;
  heightMm: number;
  /** Optional: the label as printed – the reader shows it where it showed the page number */
  label?: string;
  /** Optional (schema 2.36, #314): where it lies in the scene (`SurfacePlace`) – used in a `free` scene */
  place?: SurfacePlace;
}

/**
 * How a scene's surfaces relate (schema 2.35): `fixed` – side by side (a double page, a fold-out), front and back, as
 * printed together; `free` – each on its own anchor (a page and a wall, a room). None = fixed.
 */
export const SCENE_LAYOUTS = ["fixed", "free"] as const;
export type SceneLayout = (typeof SCENE_LAYOUTS)[number];

/** Several scenes under one label (schema 2.35, #307): `Front matter`, a chapter, a room – a scene names it (`SpreadData.group`) */
export interface GroupData {
  id: string;
  label: string;
}

export interface SpreadData {
  id: string;
  title: string;
  /** Kept for apps before schema 2.35 and for the page ranges; a scene's place in the book is its position in `spreads` */
  firstPage: number;
  lastPage: number;
  /** Optional (schema 2.3): `cover` or `back` for the covers, `spread` or none for a double page */
  format?: SpreadFormat;
  /** Optional (schema 2.32), a double page only: `front` or `back` matter – pages without printed numbers (`MATTERS`) */
  matter?: Matter;
  /** Optional (schema 2.5): the post-processing passes over this spread's rendered image, in order; replaces the book's (`[]` = none) */
  passes?: PassData[];
  /** Optional (schema 2.35, #307): the scene's physical areas, in order (`SurfaceData`) */
  surfaces?: SurfaceData[];
  /** Optional (schema 2.35): how the surfaces relate – `fixed` (none) or `free` */
  layout?: SceneLayout;
  /** Optional (schema 2.35): the id of the group the scene belongs to (`GameConfiguration.groups`) */
  group?: string;
  /** Optional (schema 2.35): what the reader's switcher and lists show for the scene – free text (`Pages 40–41`) */
  label?: string;
}

/**
 * A scene: one step of the experience (#307, `agents/SCENES.md`). Today's `SpreadData` under its coming name – the rename
 * of the type and of `spreads` is phase 2/3; until then both names are the same type.
 */
export type SceneData = SpreadData;

export interface AssetData {
  id: string; // unique per scene, referenced by entities (`#id`)
  assetType: AssetType;
  src: string;
  /** Optional (schema 2.27), a model file only (glb / gltf): its maps in several sizes */
  textures?: TextureSetData[];
}

/**
 * An AR entity projected on a found target: a **tree of nodes** (content schema 2.0). The root node sits on the
 * target (1 unit = the target's width, origin in its centre); every node has a placement (`params`) relative to
 * its parent and may hold `children`. A 1.x entity is a tree of one node, so the app reads both.
 */
export interface EntityData {
  /** Optional, unique within the tree: the editor's selection */
  id?: string;
  /**
   * Optional (schema 2.12): the node's name for the people who make the book – the editor's tree shows it; a behaviour's
   * action names a node of its subtree by it (schema 2.19)
   */
  name?: string;
  /** A built-in type (ENTITY_TYPES) or a plugin's (schema 2.13) */
  type: NodeType;
  /** The node's own files (a model, a video, an image); empty for `group`, `text` and `light` (a plugin's type: its spec's `src`) */
  assets: AssetData[];
  /** Placement: position / rotation / scale (see ./placement.ts); a plugin node type's parameters (schema 2.13, `./node-types.ts`) */
  params?: Record<string, unknown>;
  filters?: FilterData[]; // video only, applied in order (see ./filters.ts)
  /**
   * Components applied to this node (schema 2.2 – `componentSpec`): the built-in `animation` on a model and `behaviour`
   * (schema 2.19, rules without code – `./behaviour.ts`), a plugin's component or material layer (schema 2.4)
   */
  components?: ComponentData[];
  /**
   * Optional (schema 2.17): a material a plugin registered (`registerMaterial`) that replaces the material of the node's
   * meshes – its type and values (`./materials.ts`); the node's material layers still add on top
   */
  material?: MaterialData;
  /** Child nodes, placed relative to this one */
  children?: EntityData[];
  /** `text` nodes: the line shown; `{{entry.title}}` and `{{book.title}}` are replaced */
  text?: string;
  /** `text` nodes: the colour, `#rrggbb` (default white) */
  color?: string;
  /** `light` nodes (schema 2.6 – `LIGHT_PARAMS`): kind, colour, intensity, …; every value optional */
  light?: LightData;
}

/** Reference to a shared entity in `GameConfiguration.entities`. */
export interface EntityRefData {
  ref: string;
}

/** The surfaces a target can be printed on: a page of a double page, the front or the back cover */
export const PRINT_SURFACES = ["left", "right", "front", "back"] as const;
export type PrintSurface = (typeof PRINT_SURFACES)[number];

/**
 * Where a target is printed: on which page and surface, and its box in mm from the surface's top left corner – the
 * editor's stage lays the target there (before the book's layout from the designed PDFs, which the content build
 * knows); the reader does not need it.
 */
export interface PrintPlacement {
  page?: number;
  /** The side it is printed on – kept for apps before 2.36; a surface's id (`surfaceId`) wins over it */
  surface: PrintSurface;
  /** Optional (schema 2.36, #314): the scene's surface it is printed on, by id (`SurfaceData.id`) – a fold-out's middle, a wall */
  surfaceId?: string;
  x: number;
  y: number;
  width: number;
  height?: number;
}

export interface TargetData {
  id: string; // defaults to the entry id
  imageSrc: string;
  entity?: EntityData | EntityRefData;
  /** Where it is printed (optional, schema 2.1 – targets made in the editor carry it) */
  print?: PrintPlacement;
  /**
   * Optional (schema 2.26): `false` = switched off (#249) – the target keeps its values and its entry in the content, the
   * reader leaves both out (no image target, no entry in the list, not counted); none or `true` = in the book
   */
  enabled?: boolean;
}

/** The target is in the book: anything but `enabled: false` */
export const isTargetEnabled = (target: Pick<TargetData, "enabled">): boolean => target.enabled !== false;

/** The entry is in the reader's book: no target, or a target that is switched on */
export const isEntryInBook = (entry: Pick<EntryData, "target">): boolean => !entry.target || isTargetEnabled(entry.target);

export interface EntryData {
  id: string;
  category: EntryCategory;
  title: string;
  /**
   * The access page. It decides the spread unless `scene` is set (schema 2.35). Still required: apps before 2.35 place the
   * entry by it, so writers keep writing a page within the scene's range
   */
  page: number;
  /** Optional (schema 2.35, #307): the id of the entry's scene (a spread) – when set it decides the spread, not `page` */
  scene?: string;
  /** Optional (schema 2.35): the id of one of its scene's `surfaces` the entry lies on – its label is the entry's place */
  surface?: string;
  /**
   * The text (schema 2.23: Markdown – paragraphs, *emphasis*, **strong**, [links](https://…) – with the book's variables
   * in braces, `{hasKey}`; `../text/entry-text.ts` renders it). Plain text reads as before.
   */
  body: string;
  author?: string; // texts
  image?: string;
  /** Optional (schema 2.34, #289): the line under the picture ("Image: … by …"), plain text */
  caption?: string;
  media?: string; // links: external URL
  tags: string[];
  target?: TargetData;
}

/** What a tutorial step's button does (onboarding) */
export const STEP_ACTIONS = ["next", "camera", "scan"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

/**
 * Onboarding / tutorial step, as apps of schema 2.24 and before read it from the content (`tutorial`); since 2.25 the
 * reader owns its onboarding and the content carries the steps only for those apps (`../compat/tutorial.ts`). Without
 * `button` the step advances by itself after `advance` ms (or on tap). `description` may use `*emphasis*` and blank
 * lines for paragraphs; `{{title}}`, `{{author}}` and `{{publisher}}` are the book's.
 */
export interface StepData {
  id: string;
  index: number;
  title?: string;
  description?: string;
  /** Small line near the bottom (e.g. the publisher) */
  footer?: string;
  illustration?: string;
  /** Button label; with `action` (default `next`) */
  button?: string;
  action?: StepAction;
  /** Fade-in duration of the step's parts (ms; default in the app) */
  fadeIn?: number;
  /** Delay between its parts fading in one after the other (ms). Set on the splash: Mark, then title,
   *  author and publisher. Without it the parts follow with a short default delay and Mark stays still. */
  stagger?: number;
  /** Auto-advance after ms (steps without button) */
  advance?: number;
}

export interface GameConfiguration {
  version: ConfigurationVersion;
  book: BookData;
  initialSpreadId: string;
  spreads: readonly SpreadData[];
  entries: readonly EntryData[];
  entities: Readonly<Record<string, EntityData>>; // shared entities, referenced by `EntityRefData`
  /**
   * Optional (schema 2.25; required before): the onboarding for apps of schema 2.24 and before – the reader since 2.25
   * shows its own and ignores it
   */
  tutorial?: readonly StepData[];
  /** The book's own code (schema 2.4, optional): compiled plugins the engine loads before the first spread */
  plugins?: readonly PluginData[];
  /**
   * Optional (schema 2.31, #257): the subtitle files of the book's videos, per language (`./subtitles.ts`) – read from the
   * files' names by the content build and the editor's API, never filled in by hand
   */
  subtitles?: readonly SubtitleData[];
  /**
   * Optional (schema 2.33, #292): the credit line of each file the book uses that has one (`"Book Golem by TER-JAN /
   * DeviantArt"`), keyed by the file's path or URL exactly as the configuration names it – written in the editor's
   * Library, filled in by the editor's API when it assembles the book, never by hand. The reader lists them per spread
   * on its image credits page
   */
  credits?: Readonly<Record<string, string>>;
  /** Optional (schema 2.35, #307): the groups scenes name (`SpreadData.group`) – a label over several scenes */
  groups?: readonly GroupData[];
}
