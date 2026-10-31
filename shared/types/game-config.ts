/**
 * Game configuration contract – the shape of `game.config.json`.
 *
 * Written by the content build (`scripts/`), read by the app (`client/src/utils/game-config.ts`).
 * Defined once here (RULES #13). `*Data` = data loaded from JSON; the app maps it to its own model.
 * Runtime checks: `shared/guards/game-config.ts`.
 */

import type { EntryCategory } from "./entry";
import type { FilterData } from "./filters";
import type { ComponentData } from "./components";
import type { EnvironmentData } from "./environment";
import type { LightData } from "./lights";
import type { PassData } from "./passes";
import type { PluginData } from "./plugins";
import type { MaterialData } from "./materials";

export * from "./filters";
export * from "./placement";
export * from "./components";
export * from "./behaviour";
export * from "./lights";
export * from "./passes";
export * from "./plugins";
export * from "./node-types";
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
 * - MINOR: an addition older apps ignore – a new optional field (the book's `environment` since 2.8, its world and sky assets since 2.10), and since 2.6 a
 *   new node type (the guard lets an unknown one pass; a 2.5 app refuses it), and since 2.9 a new pass parameter
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
 *   it does not know: a book whose spreads name a plugin's pass needs a 2.21 app. Any MINOR of the same MAJOR loads.
 * Every change in shared/ needs a bump: shared/content-schema.json locks the checksum of shared/ to this
 * version (scripts: `npm run schema:lock`, checked by a test).
 */
export const CONTENT_SCHEMA_VERSION = "2.21";
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
}

/**
 * What a spread is in the book: a double page (`spread`, the default), the front **cover** or the **back** cover – the
 * covers have no page number: the cover spread is page 0, the back spread the page after the last printed one.
 */
export const SPREAD_FORMATS = ["spread", "cover", "back"] as const;
export type SpreadFormat = (typeof SPREAD_FORMATS)[number];

export interface SpreadData {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  /** Optional (schema 2.3): `cover` or `back` for the covers, `spread` or none for a double page */
  format?: SpreadFormat;
  /** Optional (schema 2.5): the post-processing passes over this spread's rendered image, in order; replaces the book's (`[]` = none) */
  passes?: PassData[];
}

export interface AssetData {
  id: string; // unique per scene, referenced by entities (`#id`)
  assetType: AssetType;
  src: string;
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

/**
 * Where a target is printed: on which page and surface, and its box in mm from the surface's top left corner – the
 * editor's stage lays the target there (before the book's layout from the designed PDFs, which the content build
 * knows); the reader does not need it.
 */
/** The surfaces a target can be printed on: a page of a double page, the front or the back cover */
export const PRINT_SURFACES = ["left", "right", "front", "back"] as const;
export type PrintSurface = (typeof PRINT_SURFACES)[number];

export interface PrintPlacement {
  page?: number;
  surface: PrintSurface;
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
}

export interface EntryData {
  id: string;
  category: EntryCategory;
  title: string;
  page: number; // access page – decides the spread
  body: string;
  author?: string; // texts
  image?: string;
  media?: string; // links: external URL
  tags: string[];
  target?: TargetData;
}

/** What a tutorial step's button does (onboarding) */
export const STEP_ACTIONS = ["next", "camera", "scan"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

/**
 * Onboarding / tutorial step. Without `button` the step advances by itself after
 * `advance` ms (or on tap). `description` may use `*emphasis*` and blank lines for paragraphs.
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
  tutorial: readonly StepData[];
  /** The book's own code (schema 2.4, optional): compiled plugins the engine loads before the first spread */
  plugins?: readonly PluginData[];
}
