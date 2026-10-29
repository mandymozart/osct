/**
 * Game configuration contract – the shape of `game.config.json`.
 *
 * Written by the content build (`scripts/`), read by the app (`client/src/utils/game-config.ts`).
 * Defined once here (RULES #13). `*Data` = data loaded from JSON; the app maps it to its own model.
 * Runtime checks: `shared/guards/game-config.ts`.
 */

import { EntryCategory } from "./entry";
import { FilterData } from "./filters";
import type { ComponentData } from "./components";
import type { LightData } from "./lights";
import type { PluginData } from "./plugins";

export * from "./filters";
export * from "./placement";
export * from "./components";
export * from "./lights";
export * from "./plugins";

/**
 * Node types of an entity (extensible, RULES #7): what is seen – a model, a video or image plane, a line of text,
 * a light – or a `group` that only holds children. Links are entries, not entities.
 * The guard lets a node type it does not know pass (the engine renders nothing for it but keeps its children), so
 * a later type is a MINOR addition; the content build and the editor's API still refuse one.
 */
export const ENTITY_TYPES = ["group", "model", "video", "image", "text", "light"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ASSET_TYPES = ["glb", "gltf", "video", "image", "audio"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Content schema version `MAJOR.MINOR`: the version of this contract (shared/), the only compatibility rule
 * between content and app (RULES #10). The app version a content build was made with is information only.
 * - MAJOR: a change an older app cannot read – a new required field, a renamed or removed field, a changed
 *   type, a new enum value (asset type, category, step action, spread format). The app refuses content of a
 *   newer MAJOR at startup; it reads every MAJOR from `OLDEST_READABLE_SCHEMA_MAJOR` on as it is (so far every
 *   MAJOR only added: the node tree, the light node).
 * - MINOR: an addition older apps ignore – a new optional field, a new node type (the guard lets it pass). Any
 *   MINOR of the same MAJOR loads.
 * Every change in shared/ needs a bump: shared/content-schema.json locks the checksum of shared/ to this
 * version (scripts: `npm run schema:lock`, checked by a test).
 */
export const CONTENT_SCHEMA_VERSION = "3.0";
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
  /** Optional, unique within the tree: the editor's selection, a later behaviour's target */
  id?: string;
  type: EntityType;
  /** The node's own files (a model, a video, an image); empty for `group`, `text` and `light` */
  assets: AssetData[];
  params?: Record<string, unknown>; // placement: position / rotation / scale (see ./placement.ts)
  filters?: FilterData[]; // video only, applied in order (see ./filters.ts)
  /** Components applied to this node (schema 2.2 – `componentSpec`): the built-in `animation` on a model, a plugin's component or material layer (schema 2.4) */
  components?: ComponentData[];
  /** Child nodes, placed relative to this one */
  children?: EntityData[];
  /** `text` nodes: the line shown; `{{entry.title}}` and `{{book.title}}` are replaced */
  text?: string;
  /** `text` nodes: the colour, `#rrggbb` (default white) */
  color?: string;
  /** `light` nodes (schema 3.0 – `LIGHT_PARAMS`): kind, colour, intensity, …; every value optional */
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
